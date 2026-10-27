const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = import('../cloudflare-worker/investment-market.js');

test('shared stock changes at half-hour boundaries while the manually managed index stays fixed', async () => {
    const {createMarket, advanceMarket: advance, marketView, UPDATE_MS: HOUR_MS, tickAt: hourAt} = await model;
    const advanceMarket = (state, now, signals, maxSteps) => advance(state, now, signals, maxSteps, () => .5);
    const start = Date.parse('2026-10-21T12:15:00Z');
    const current = createMarket({}, start), copy = structuredClone(current);
    assert.deepEqual(current.quotes.map(q => q.price), [100,100]);
    assert.equal(advanceMarket(current, hourAt(start) + HOUR_MS - 1).frames.length, 0);
    const next = advanceMarket(current, hourAt(start) + HOUR_MS);
    assert.deepEqual(next.state.quotes.map(q => q.price), [100,100]);
    assert.equal(next.state.revision, 1);
    assert.equal(marketView(next.state).quotes[0].percent, 0);
    assert.equal(marketView(next.state).indexMode, 'manual');
    assert.equal(advanceMarket(next.state, next.state.hour).frames.length, 0);
    assert.deepEqual(current, copy, 'advancing must not mutate a state before its transaction commits');
});

test('hourly markets switch at a future half-hour without repricing or backfilling earlier ticks',async()=>{
    const {createMarket,migrateMarketInterval,advanceMarket,marketView,UPDATE_MS,HOUR_MS}=await model;
    const start=Date.parse('2026-10-21T12:00:00Z');
    const legacy=createMarket({},start);legacy.updateIntervalMs=HOUR_MS;legacy.nextTickAt=start+HOUR_MS;
    legacy.quotes[1].price=137;legacy.stockRemainder=.25;
    const before=structuredClone(legacy),migrated=migrateMarketInterval(legacy,start+45*60000);
    assert.equal(migrated.nextTickAt,start+HOUR_MS);assert.equal(migrated.updateIntervalMs,UPDATE_MS);
    assert.equal(migrated.hour,start);assert.equal(migrated.stockRemainder,.25);assert.deepEqual(migrated.quotes,legacy.quotes);
    assert.equal(marketView(migrated,start+45*60000).stale,false);
    assert.equal(migrateMarketInterval(migrated,start+HOUR_MS),migrated,'restarts cannot keep postponing the next tick');
    assert.equal(advanceMarket(migrated,start+HOUR_MS-1).frames.length,0);
    const first=advanceMarket(migrated,start+HOUR_MS,undefined,72,()=>.5);
    assert.equal(first.frames.length,1);assert.equal(first.state.nextTickAt,start+HOUR_MS+UPDATE_MS);
    assert.equal(advanceMarket(first.state,first.state.hour).frames.length,0);
    assert.deepEqual(legacy,before);
});

test('integer price movement never exceeds configured ±10%, never reaches zero, and recovery work is bounded', async () => {
    const {createMarket, advanceMarket: advance, UPDATE_MS: HOUR_MS} = await model;
    const advanceMarket = (state, now, signals, maxSteps) => advance(state, now, signals, maxSteps, () => .5);
    let state = createMarket({}, 0);
    for (let i=0;i<500;i++) {
        const next = advanceMarket(state, state.hour+HOUR_MS, () => i % 2 ? {clicks:20,previousClicks:0,uploads:1} : {clicks:0,previousClicks:20}).state;
        for (let n=0;n<2;n++) {
            assert.ok(next.quotes[n].price >= Math.ceil(state.quotes[n].price * .9));
            assert.ok(next.quotes[n].price <= Math.floor(state.quotes[n].price * 1.1));
            assert.ok(next.quotes[n].price >= 1);
        }
        state = next;
    }
    assert.equal(advanceMarket(state, state.hour+1000*HOUR_MS).frames.length,72);
    assert.throws(() => createMarket({INITIAL_STOCK_POINTS:'0'}), /configuration/);
    assert.throws(() => createMarket({MAX_HOURLY_BPS:'2000'}), /configuration/);
});

test('without video activity random movement reaches both 10% endpoints and keeps the manual index fixed',async()=>{
    const {createMarket,advanceMarket,UPDATE_MS: HOUR_MS}=await model;
    const state=createMarket({},0),original=structuredClone(state);
    assert.equal(state.maxHourlyBps,1000);
    const down=advanceMarket(state,HOUR_MS,undefined,72,()=>0).state;
    const up=advanceMarket(state,HOUR_MS,undefined,72,()=>.999999999).state;
    assert.equal(down.quotes[1].price,90);assert.equal(up.quotes[1].price,110);
    assert.equal(down.quotes[0].price,100);assert.equal(up.quotes[0].price,100);
    assert.equal(down.lastDrivers.components.random,-1000);assert.equal(up.lastDrivers.components.random,1000);
    assert.deepEqual(state,original);
    assert.throws(()=>advanceMarket(state,HOUR_MS,undefined,72,()=>1),/random sample/);
});

test('combined index, clicks, uploads and random contributions cannot exceed either final 10% limit',async()=>{
    const {createMarket,advanceMarket,UPDATE_MS: HOUR_MS}=await model;
    for(const [index,signals,random,expected] of [[110,{clicks:20,uploads:1},.999999999,110],[90,{clicks:0,previousClicks:20},0,90]]){
        const state=createMarket({},0);state.quotes[0].price=index;
        const next=advanceMarket(state,HOUR_MS,()=>signals,72,()=>random).state;
        assert.equal(next.quotes[1].price,expected);assert.equal(next.quotes[0].price,index);
        assert.ok(Math.abs(next.lastDrivers.bps)<=1000);
    }
    const state=createMarket({},0);state.quotes[1].price=103;state.stockRemainder=-.49;
    const next=advanceMarket(state,HOUR_MS,undefined,72,()=>0).state;
    assert.ok(next.quotes[1].price>=Math.ceil(103*.9),'rounding and carried fractions cannot cross the cap');
});

test('daily candle boundaries use Korea time and each chart range has a bounded aggregation', async () => {
    const {dayAt,historyWindow} = await model;
    assert.equal(dayAt(Date.parse('2026-10-21T14:59:59Z')),Date.parse('2026-10-20T15:00:00Z'));
    assert.equal(dayAt(Date.parse('2026-10-21T15:00:00Z')),Date.parse('2026-10-21T15:00:00Z'));
    assert.equal(historyWindow('5y',Date.now()).resolution,'day');
    assert.equal(historyWindow('1w',Date.now()).resolution,'hour');
    assert.equal(historyWindow('invalid',Date.now()),null);
});

test('stock comparison uses the daily close while each half-hour change keeps its own cap',async()=>{
    const {createMarket,advanceMarket,marketView,UPDATE_MS}=await model;
    const start=Date.parse('2026-10-21T12:00:00Z'); // 21:00 KST
    let state=createMarket({},start);
    state=advanceMarket(state,start+UPDATE_MS,undefined,72,()=>.999999999).state;
    assert.equal(state.quotes[1].price,110);assert.equal(state.quotes[1].previous,100);
    state=advanceMarket(state,start+2*UPDATE_MS,undefined,72,()=>.999999999).state;
    let quote=marketView(state).quotes[1];
    assert.equal(quote.price,121);assert.equal(quote.previous,100);assert.equal(quote.change,21);assert.equal(quote.percent,21);
    state=advanceMarket(state,start+5*UPDATE_MS,undefined,72,()=>.5).state;
    state=advanceMarket(state,start+6*UPDATE_MS,undefined,72,()=>0).state;
    quote=marketView(state).quotes[1];
    assert.equal(quote.price,109);assert.equal(quote.previous,121);assert.equal(quote.change,-12);assert.equal(quote.percent,-9.92);
    state=advanceMarket(state,start+7*UPDATE_MS,undefined,72,()=>.999999999).state;
    quote=marketView(state).quotes[1];
    assert.equal(quote.price,119);assert.equal(quote.previous,121);assert.equal(quote.change,-2);assert.equal(quote.percent,-1.65);
    assert.equal(marketView(state).quoteComparison,'previous-close');
    const recovered=advanceMarket(state,start+103*UPDATE_MS,undefined,144,()=>.5);
    assert.ok(recovered.frames.every(frame=>frame.quotes[1].price===119));
    assert.equal(recovered.state.quotes[1].previous,119);
});

test('positive and negative daily index influence lasts through 23 KST and resets before the midnight tick', async () => {
    const {createMarket,advanceMarket,UPDATE_MS: HOUR_MS,marketView}=await model;
    const start=Date.parse('2026-10-21T15:00:00Z'); // 00:00 KST
    for(const [price,expected] of [[105,100],[95,-100]]){
        let state=createMarket({INITIAL_STOCK_POINTS:'10000'},start);
        state.quotes[0].price=price;
        for(let hour=1;hour<=47;hour++){
            const before=state.quotes[1].price;
            state=advanceMarket(state,start+hour*HOUR_MS,undefined,72,()=>.5).state;
            assert.equal(state.lastDrivers.components.index,expected);
            assert.equal(state.quotes[0].price,price);assert.equal(state.quotes[0].previous,100);
            assert.ok(expected>0?state.quotes[1].price>before:state.quotes[1].price<before);
        }
        const beforeMidnight=state.quotes[1].price;
        state=advanceMarket(state,start+48*HOUR_MS,undefined,72,()=>.5).state;
        assert.equal(state.lastDrivers.components.index,0,'old daily influence ends at 00:00, not 01:00');
        assert.equal(state.quotes[0].previous,price);assert.equal(state.quotes[1].price,beforeMidnight);
        const overnight=advanceMarket(state,start+52*HOUR_MS,undefined,72,()=>.5);
        assert.ok(overnight.frames.every(frame=>frame.lastDrivers.components.index===0));
        state=overnight.state;
        state.quotes[0].price=price*2;
        state=advanceMarket(state,start+53*HOUR_MS,undefined,72,()=>.5).state;
        assert.equal(state.lastDrivers.indexBaseline,price,'new day uses the prior day close');
        assert.equal(state.lastDrivers.components.index,200,'daily index contribution retains its 2 percentage point cap');
        assert.equal(marketView(state).indexInfluencePeriod,'kst-day');
    }
});

test('intraday edits and old stored models use the daily baseline; recovery crosses KST days consistently',async()=>{
    const {createMarket,advanceMarket,HOUR_MS}=await model;
    const start=Date.parse('2026-10-21T12:00:00Z'); // 21:00 KST
    let state=createMarket({INITIAL_STOCK_POINTS:'10000'},start);
    state.quotes[0].price=105;state.lastPricedIndex=105;state.priceModel='index-vlog-random-v1';
    state=advanceMarket(state,start+HOUR_MS/2,undefined,72,()=>.5).state;
    assert.equal(state.lastDrivers.components.index,100,'legacy last-priced value does not suppress daily influence');
    state.quotes[0].price=103;
    const snapshot=structuredClone(state);
    const recovered=advanceMarket(state,start+4*HOUR_MS,undefined,72,()=>.5);
    assert.equal(recovered.frames[0].lastDrivers.components.index,60,'same-day decrease from 105 to 103 is still up 3% from 100');
    assert.deepEqual(recovered.frames.slice(1).map(frame=>frame.lastDrivers.components.index),[60,60,60,0,0,0]);
    let sequential=structuredClone(state);
    for(let hour=2;hour<=8;hour++)sequential=advanceMarket(sequential,start+hour*HOUR_MS/2,undefined,72,()=>.5).state;
    assert.deepEqual(recovered.state,sequential);
    assert.deepEqual(state,snapshot,'recovery never mutates uncommitted state');
    assert.equal(advanceMarket(recovered.state,recovered.state.hour).frames.length,0,'duplicate tick is ignored');
});

test('real-time is the current Korean day; all historical ranges exclude today', async () => {
    const {historyWindow,DAY_MS,HOUR_MS}=await model;
    const before=Date.parse('2026-10-21T14:59:59Z'),after=Date.parse('2026-10-21T15:00:00Z');
    const a=historyWindow('day',before),b=historyWindow('day',after);
    assert.equal(a.start,Date.parse('2026-10-20T15:00:00Z'));
    assert.equal(b.start,after);assert.equal(b.end,after+23.5*HOUR_MS);
    assert.equal(b.end-b.start,23.5*HOUR_MS);assert.equal(b.intraday,true);
    for(const period of ['1d','1w','3m','1y','5y','all'])assert.ok(historyWindow(period,after).end<after);
    assert.equal(historyWindow('1d',after).start,after-DAY_MS);
    assert.equal(historyWindow('1d',after).end,after-HOUR_MS/2);
});

test('locked orderbook has five indicative levels, zero size, no trades and no nonpositive bids',async()=>{
    const {closedOrderbook}=await model;
    const book=closedOrderbook({id:'en-joy',price:100,previous:100},{open:100,high:100,low:100,yearHigh:100,yearLow:100},0);
    assert.deepEqual(book.asks.map(q=>q.price),[105,104,103,102,101]);
    assert.deepEqual(book.bids.map(q=>q.price),[99,98,97,96,95]);
    assert.ok([...book.asks,...book.bids].every(q=>q.quantity===0));assert.deepEqual(book.trades,[]);
    assert.equal(book.tradingEnabled,false);assert.equal(book.indicative,true);
    assert.deepEqual(closedOrderbook({id:'en-joy',price:1,previous:1},{},0).bids,[]);
});
