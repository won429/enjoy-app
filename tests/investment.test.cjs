const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../investment.js'), 'utf8');

function setup({ user = null, member = null, members = [], fetcher = null, themeColors = null, now = null, random = null } = {}) {
    const events = {}, handlers = {}, nodes = new Map(), lines = [], timers = new Map(), arcs = [], strokes = [], labels = [], bodies = [];
    let timerId = 0;
    let path = [], dash = [];
    const ctx = new Proxy({ arc: (...args) => arcs.push(args), beginPath: () => { path = []; }, setLineDash: value => { dash = value; },
        stroke: () => strokes.push({ path: path.slice(), dash: dash.slice(), color: ctx.strokeStyle }), fillText: (...args) => labels.push(args),
        measureText: text => ({ width: text.length * 7 }),
        roundRect: (...args) => bodies.push({args,color:ctx.fillStyle}),
        lineTo: (x,y) => { lines.push([x,y]); path.push([x,y]); }, moveTo: (x,y) => { lines.push([x,y]); path.push([x,y]); } }, { get: (target,key) => key in target ? target[key] : () => {} });
    function element(id) {
        if (!nodes.has(id)) nodes.set(id, {
            id, hidden: false, textContent: '', innerHTML: '', attributes: {},
            classList: { contains: () => false },
            setAttribute(key,value) { this.attributes[key] = value; },
            addEventListener(type,fn) { handlers[id + ':' + type] = fn; },
            querySelectorAll(selector) { return selector === '.iv-market-status' ? [element('market-home-status'),element('market-detail-status')] : []; }, querySelector() { return { focus() {} }; },
            getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 250 }; },
            getContext() { return ctx; }, focus() {}
        });
        return nodes.get(id);
    }
    const win = { enjoyUser: user, isGuest: false, enjoyStoreMember: () => member, enjoyJoinedMembers: () => members, addEventListener: (name,fn) => { events[name] = fn; } };
    if (themeColors) {
        win.getComputedStyle = () => ({ getPropertyValue: name => themeColors[name] || '' });
        win.matchMedia = () => ({ addEventListener: (name,fn) => { events['theme:' + name] = fn; } });
    }
    const doc = { hidden:false, getElementById: element, addEventListener: (name, fn) => { events[name] = fn; } };
    const bindings = { window: win, document: doc, requestAnimationFrame: fn => fn(), ResizeObserver: class { observe() {} }, AbortController, URL, setTimeout: (fn,ms) => { const id=++timerId;timers.set(id,{fn:()=>{timers.delete(id);return fn();},ms});return id; }, clearTimeout: id => timers.delete(id) };
    if (now) bindings.Date = class extends Date { static now() { return now(); } };
    if (random) bindings.Math = Object.assign(Object.create(Math), { random });
    if (fetcher) bindings.fetch = fetcher;
    vm.runInNewContext(source, bindings);
    const click = dataset => handlers['wallet-panel-investment:click']({target:{closest:()=>({dataset})}});
    return { win, doc, element, click, lines, arcs, strokes, labels, bodies, events, timers, ctx, chartEvent: (type, values = {}) => handlers['investment-chart:' + type]({ pointerId: 1, button: 0, clientX: 6, isPrimary: true, preventDefault() {}, stopPropagation() {}, ...values }), settle: () => new Promise(setImmediate), setMember(value) { member = value; }, setMembers(value) { members = value; } };
}

test('without a server connection, quotes stay unavailable rather than simulating a price', () => {
    const ui = setup();
    assert.match(ui.element('investment-index-list').innerHTML, /—/);
    assert.match(ui.element('investment-stock-list').innerHTML, /—/);
    ui.click({ currency: 'KRW' });
    assert.match(ui.element('investment-index-list').innerHTML, /—/);
    assert.doesNotMatch(ui.element('investment-stock-list').innerHTML, /100 P/);
});

test('member points update from the shared cache, remain in points, and clear on account changes/sign-out', () => {
    const member = Object.freeze({uid:'a',name:'테스트 멤버',points:12345});
    const ui = setup({ user: {uid:'a'}, member });
    assert.equal(ui.element('investment-account-points').textContent, '12,345 P');
    assert.equal(ui.element('investment-account-equivalent').textContent, '(= 123.45원)');
    ui.click({currency:'KRW'});
    assert.equal(ui.element('investment-account-points').textContent, '12,345 P');
    assert.equal(ui.element('investment-account-equivalent').textContent, '(= 123.45원)');
    ui.setMember(Object.freeze({uid:'a',name:'테스트 멤버',points:101}));
    ui.win.refreshInvestmentAccount();
    assert.equal(ui.element('investment-account-points').textContent, '101 P');
    assert.equal(ui.element('investment-account-equivalent').textContent, '(= 1.01원)');
    ui.win.enjoyUser = {uid:'b'};
    ui.events['enjoy-auth-ready']();
    assert.equal(ui.element('investment-account-points').textContent, '—');
    assert.equal(ui.element('investment-account-equivalent').hidden, true);
    assert.equal(ui.element('investment-account-equivalent').textContent, '');
    assert.equal(ui.element('investment-account-name').textContent, '멤버 지갑');
    ui.setMember(Object.freeze({uid:'b',name:'다른 멤버',points:1}));
    ui.win.refreshInvestmentAccount();
    assert.equal(ui.element('investment-account-points').textContent, '1 P');
    assert.equal(ui.element('investment-account-equivalent').textContent, '(= 0.01원)');
    ui.win.enjoyUser = null;
    ui.events['enjoy-auth-ready']();
    assert.equal(ui.element('investment-account-points').textContent, '—');
    assert.equal(ui.element('investment-account-equivalent').hidden, true);
    assert.equal(ui.element('investment-account-equivalent').textContent, '');
    assert.equal(member.points, 12345);
});

test('missing portfolio module reports an unavailable connection without fabricating investment ranks', () => {
    const ui=setup({user:{uid:'a'},member:{uid:'a',name:'가람',points:100},members:[{uid:'b',name:'나영',points:99999}]});
    assert.match(ui.element('investment-ranking').innerHTML,/연결하지 못했어요/);
    assert.doesNotMatch(ui.element('investment-ranking').innerHTML,/<tr|99,999|공동 1위/);
    assert.equal(ui.element('investment-total').textContent,'—');
});

function sampleMarket() {
    const asOf = Date.parse('2026-10-22T03:00:00Z');
    return {asOf,serverTime:asOf+1000,updateIntervalMs:1800000,nextUpdateAt:asOf+1800000,revision:0,stale:false,tradingEnabled:false,
        quotes:[{id:'enjoy',price:100,previous:100,change:0,percent:0},{id:'en-joy',price:100,previous:100,change:0,percent:0}]};
}
function sampleApi(data, requests) {
    return async url => {
        const u = new URL(url);requests.push(u.pathname+u.search);
        const body = u.pathname === '/market' ? data : {
            asOf:data.asOf,symbol:u.searchParams.get('symbol'),period:u.searchParams.get('period'),
            points:[{time:data.asOf,open:data.quotes.find(q=>q.id===u.searchParams.get('symbol')).previous,high:Math.max(...data.quotes.map(q=>q.price)),low:Math.min(...data.quotes.map(q=>q.previous)),close:data.quotes.find(q=>q.id===u.searchParams.get('symbol')).price}]
        };
        return {ok:true,json:async()=>structuredClone(body)};
    };
}
test('100P server quotes convert to 1 won; index/stock restrictions and hourly chart caching remain intact', async () => {
    const requests=[], data=sampleMarket(), ui=setup({fetcher:sampleApi(data,requests)});
    await ui.settle();
    assert.match(ui.element('investment-index-list').innerHTML,/100 P/);
    assert.match(ui.element('investment-stock-list').innerHTML,/100 P/);
    ui.click({stock:'enjoy'});await ui.settle();
    assert.equal(ui.element('investment-trade-buttons').hidden,true);
    assert.equal(ui.element('investment-orderbook-tab').hidden,true);
    assert.equal(ui.element('investment-holdings-tab').hidden,true);
    assert.match(ui.element('investment-chart').attributes['aria-label'],/최고 100 P/);
    ui.click({stock:'en-joy'});await ui.settle();
    assert.equal(ui.element('investment-trade-buttons').hidden,false);
    assert.equal(ui.element('investment-orderbook-tab').hidden,false);
    assert.equal(ui.element('investment-holdings-tab').hidden,false);
    ui.click({currency:'KRW'});await ui.settle();
    assert.equal(ui.element('investment-price').textContent,'1원');
    assert.equal(ui.element('investment-secondary-price').textContent,'100 P');
    assert.equal(ui.element('investment-change').textContent,'0원 (0.0%)');
    ui.click({period:'1w'});await ui.settle();
    ui.click({period:'day'});await ui.settle();
    ui.win.resetInvestmentView();await ui.settle();
    assert.equal(requests.filter(p=>p==='/market').length,1,'reentry never polls fresh prices');
    assert.equal(requests.filter(p=>p==='/history?symbol=en-joy&period=day').length,1,'unit and tab changes reuse server history');
    assert.ok([...ui.timers.values()].some(t=>t.ms>10000),'next lookup is scheduled at the next hour, not every second');
});

test('server failures retain the last shared price; hidden screens stop their refresh timers', async () => {
    const requests=[],data=sampleMarket();let failing=false;
    const ui=setup({fetcher:async url=>{if(failing)throw Error('offline');return sampleApi(data,requests)(url);}});
    await ui.settle();
    assert.match(ui.element('investment-stock-list').innerHTML,/100 P/);
    failing=true;
    const timer=[...ui.timers.values()].find(t=>t.ms>10000);timer.fn();await ui.settle();
    assert.match(ui.element('investment-stock-list').innerHTML,/100 P/);
    assert.equal(ui.element('market-home-status').textContent,'시세 연결 지연');
    ui.doc.hidden=true;ui.events.visibilitychange();
    assert.equal(ui.timers.size,0);
});

test('the next hourly snapshot changes the quote, percentage, converted price and history together', async () => {
    const requests=[], data=sampleMarket(), ui=setup({fetcher:sampleApi(data,requests)});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    data.asOf+=1800000;data.nextUpdateAt+=1800000;data.serverTime=data.asOf+1000;data.revision=1;
    data.quotes.forEach(q=>{q.previous=100;q.price=103;q.change=3;q.percent=3;});
    [...ui.timers.values()].find(t=>t.ms>10000).fn();await ui.settle();
    assert.equal(ui.element('investment-price').textContent,'103 P');
    assert.equal(ui.element('investment-change').textContent,'+3 P (+3.0%)');
    assert.equal(ui.element('investment-change-caption').textContent,'전일 대비');
    assert.equal(ui.element('investment-change').className,'iv-up');
    assert.match(ui.element('investment-chart').attributes['aria-label'],/최고 103 P/);
    assert.equal(requests.filter(p=>p==='/history?symbol=en-joy&period=day').length,2);
    ui.click({currency:'KRW'});await ui.settle();
    assert.equal(ui.element('investment-price').textContent,'1.03원');
    assert.equal(ui.element('investment-change').textContent,'+0.03원 (+3.0%)');
    data.asOf+=1800000;data.nextUpdateAt+=1800000;data.serverTime=data.asOf+1000;data.revision=2;
    data.quotes[1]={id:'en-joy',previous:100,price:102,change:2,percent:2};
    [...ui.timers.values()].find(t=>t.ms>10000).fn();await ui.settle();
    assert.equal(ui.element('investment-change').textContent,'+0.02원 (+2.0%)');
    assert.equal(ui.element('investment-change').className,'iv-up','an hourly decline stays red while above the previous close');
    assert.match(ui.element('investment-stock-list').innerHTML,/\+0.02원 \(\+2.0%\)/);
});

test('a system theme change redraws the cached chart in the active CSS colors without requesting market data',async()=>{
    const requests=[],data=sampleMarket(),themeColors={'--iv-blue':'#5b9dff','--iv-grid':'#4c4c58','--iv-muted':'#9a9aa4'};
    data.quotes[1]={id:'en-joy',price:95,previous:100,change:-5,percent:-5};
    const ui=setup({fetcher:sampleApi(data,requests),themeColors});await ui.settle();
    ui.click({stock:'en-joy'});await ui.settle();
    assert.equal(ui.ctx.fillStyle,'#5b9dff');assert.equal(ui.strokes.filter(s=>s.dash.length).at(-1).color,'#4c4c58');
    const before=requests.length,price=ui.element('investment-price').textContent;
    themeColors['--iv-blue']='#1b64da';themeColors['--iv-grid']='#b8c1cd';themeColors['--iv-muted']='#606b7a';
    ui.events['theme:change']();await ui.settle();
    assert.equal(ui.ctx.fillStyle,'#1b64da');assert.equal(ui.strokes.filter(s=>s.dash.length).at(-1).color,'#b8c1cd');
    assert.equal(requests.length,before);assert.equal(ui.element('investment-price').textContent,price);
});

test('intraday points keep their 00–23 time position without stretching one point into a future line', async () => {
    const hourMs=3600000, today=Math.floor((Date.now()+9*hourMs)/86400000)*86400000-9*hourMs;
    for (const hour of [0,.5,12,23,23.5]) {
        const data=sampleMarket();data.asOf=today+hour*hourMs;data.serverTime=data.asOf+1000;data.nextUpdateAt=data.asOf+hourMs/2;
        const ui=setup({fetcher:async url=>{
            const u=new URL(url);
            return {ok:true,json:async()=>u.pathname==='/market'?data:{symbol:u.searchParams.get('symbol'),period:u.searchParams.get('period'),asOf:data.asOf,axisStart:today,axisEnd:today+23.5*hourMs,points:[{time:data.asOf,open:100,high:100,low:100,close:100}]}};
        }});
        await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
        const dot=ui.arcs.filter(arc=>arc[2]===4).at(-1);
        assert.ok(Math.abs(dot[0]-(6+308*hour/23.5))<.01,'hour '+hour+' must have a fixed time coordinate');
        assert.equal(ui.strokes.filter(s=>!s.dash.length).at(-1).path.length,1,'one moveTo, no future price line');
        assert.match(ui.element('investment-chart').attributes['aria-label'],/당일 차트, 00시부터 23시 30분까지/);
    }
});

test('orderbook is a cached read-only reference ladder with no fabricated orders', async () => {
    const data=sampleMarket(),requests=[];
    const api=sampleApi(data,requests);
    const ui=setup({fetcher:async url=>{
        if(new URL(url).pathname!=='/orderbook')return api(url);
        requests.push('/orderbook');
        return {ok:true,json:async()=>({symbol:'en-joy',asOf:data.asOf,price:100,previous:100,indicative:true,tradingEnabled:false,totalAsk:0,totalBid:0,
            asks:[105,104,103,102,101].map(price=>({price,quantity:0})),bids:[99,98,97,96,95].map(price=>({price,quantity:0})),
            stats:{open:100,high:100,low:100,yearHigh:100,yearLow:100,volume:0}})};
    }});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();ui.click({tab:'book'});await ui.settle();
    assert.equal(ui.element('investment-orderbook-panel').hidden,false);
    assert.equal(ui.element('investment-chart-panel').hidden,true);
    assert.match(ui.element('investment-orderbook-panel').innerHTML,/대기 주문 없음/);
    assert.match(ui.element('investment-orderbook-panel').innerHTML,/105 P/);
    ui.click({currency:'KRW'});await ui.settle();
    assert.match(ui.element('investment-orderbook-panel').innerHTML,/1\.05원/);
    assert.equal(requests.filter(p=>p==='/orderbook').length,1);
    ui.click({stock:'enjoy'});await ui.settle();ui.click({tab:'book'});
    assert.equal(ui.element('investment-orderbook-panel').hidden,true,'index must not expose an orderbook');
});

test('latest-banner and episode clicks share deduplication, never block navigation, and retry failed collection', async () => {
    const writes=[],data=sampleMarket();let fail=true;
    const api=sampleApi(data,[]);
    const ui=setup({fetcher:async(url,options)=>{
        if(new URL(url).pathname!=='/activity/click')return api(url);
        writes.push({body:JSON.parse(options.body),options});
        return {ok:!fail};
    }});
    ui.win.getEnjoyIdToken=async()=> 'test-token';
    await ui.settle();
    await ui.win.recordEnjoyVlogClick('https://youtu.be/21uUicVMzqg','latest');
    fail=false;
    await ui.win.recordEnjoyVlogClick('https://youtu.be/21uUicVMzqg','latest');
    await ui.win.recordEnjoyVlogClick('https://www.youtube.com/watch?v=21uUicVMzqg','episode');
    assert.equal(writes.length,2,'failed upload retries; successful banner/episode shares one video key');
    assert.equal(writes[1].options.keepalive,true);assert.equal(writes[1].options.credentials,'omit');
    assert.equal(writes[1].options.headers.Authorization,'Bearer test-token');
    assert.deepEqual(writes[1].body,{videoId:'21uUicVMzqg',source:'latest'});
    await ui.win.recordEnjoyVlogClick('https://youtube.com.evil.invalid/watch?v=21uUicVMzqg','latest');
    await ui.win.recordEnjoyVlogClick('https://youtu.be/9nvi_15zz9s','unknown');
    assert.equal(writes.length,2);
    ui.win.getEnjoyIdToken=async()=>null;
    await ui.win.recordEnjoyVlogClick('https://youtu.be/9nvi_15zz9s','episode');
    assert.equal(writes.length,3);assert.equal(writes[2].options.headers.Authorization,undefined,'guest opens also count');
    const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
    const idFunction=html.slice(html.indexOf('    function vlogYoutubeId(url)'),html.indexOf('    /* 홈 인스타형 피드:'));
    const browserFunction=html.slice(html.indexOf('        window.openBrowser = function(url, vlogSource)'),html.indexOf('        window.closeBrowser = function()'));
    let opened=0;ui.win.open=()=>opened++;
    ui.win.ENJOY_VLOG_PROGRAMS={demo:{episodes:[{url:'https://youtu.be/DhZ4val4eXg'}]}};
    vm.runInNewContext(idFunction+browserFunction,{window:ui.win,URL,location:{href:'https://enjoy.test'}});
    ui.win.openBrowser('https://youtu.be/DhZ4val4eXg');await ui.settle();
    assert.equal(writes.length,4,'known vlog links opened from the home feed also count');assert.equal(opened,1,'navigation remains synchronous');
    ui.win.openBrowser('https://youtu.be/ZZZZZZZZZZZ');await ui.settle();
    assert.equal(writes.length,4,'other YouTube navigation is not a vlog click');assert.equal(opened,2);
    ui.win.openBrowser('https://youtu.be/48tV1_PvY4E','latest');await ui.settle();
    assert.equal(writes.length,5);assert.equal(writes[4].body.source,'latest');assert.equal(writes[4].body.videoId,'48tV1_PvY4E','latest tracking follows the actual banner URL without a duplicate hardcoded ID');
});

test('previous-close line uses the price scale for gains, losses, crossings and flat prices', async () => {
    for (const prices of [[105,110], [90,95], [90,100,110], [100], [120,120]]) {
        const data=sampleMarket(), requests=[];
        data.quotes[1]={id:'en-joy',price:prices.at(-1),previous:100,change:prices.at(-1)-100,percent:prices.at(-1)-100};
        const ui=setup({fetcher:async url=>{
            const u=new URL(url);requests.push(u.pathname);
            return {ok:true,json:async()=>u.pathname==='/market'?data:{asOf:data.asOf,symbol:'en-joy',period:u.searchParams.get('period'),points:prices.map((price,i)=>({time:data.asOf-(prices.length-1-i)*1800000,open:price,high:price,low:price,close:price}))}};
        }});
        await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
        const baseline=ui.strokes.filter(s=>s.dash.length).at(-1).path;
        const path=ui.strokes.filter(s=>!s.dash.length).at(-1).path;
        assert.equal(baseline[0][1],baseline[1][1],'reference is horizontal');
        assert.equal(path.length,prices.length,'one vertex per recorded price, no invented steps');
        prices.forEach((price,i)=>{
            assert.equal(Math.sign(baseline[0][1]-path[i][1]),Math.sign(price-100),'price '+price+' relative to yesterday 100');
            assert.ok(path[i][1]>0&&path[i][1]<250);
        });
        assert.ok(baseline[0][1]>0&&baseline[0][1]<250,'yesterday remains visible even outside today’s range');
        assert.match(ui.element('investment-chart').attributes['aria-label'],/전일 종가 100 P/);
        assert.equal(ui.element('investment-chart-pulse').hidden,false);
        const before=requests.length;
        ui.click({currency:'KRW'});await ui.settle();
        assert.ok(ui.labels.some(label=>label[0]==='전일 종가 1원'));
        assert.equal(requests.length,before,'animation and currency changes use cached history');
        ui.doc.hidden=true;ui.events.visibilitychange();
        assert.equal(ui.element('investment-chart-pulse').hidden,true);
        ui.doc.hidden=false;ui.events.visibilitychange();await ui.settle();
        assert.equal(ui.element('investment-chart-pulse').hidden,false);
        ui.click({period:'1d'});await ui.settle();
        assert.equal(ui.element('investment-chart-pulse').hidden,true,'historical charts have a static endpoint');
    }
});

test('weekly and longer views omit yesterday from both the baseline and price scale', async () => {
    const data=sampleMarket();
    data.quotes[1]={id:'en-joy',price:110,previous:1000,change:-890,percent:-89};
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);
        return {ok:true,json:async()=>u.pathname==='/market'?data:{asOf:data.asOf,symbol:'en-joy',period:u.searchParams.get('period'),points:[90,110].map((price,i)=>({time:data.asOf+i*1800000,open:price,high:price,low:price,close:price}))}};
    }});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    for(const period of ['1w','3m','1y','5y','all','1d','day']) {
        ui.strokes.length=0;ui.labels.length=0;ui.arcs.length=0;
        ui.click({period});await ui.settle();
        const daily=['day','1d'].includes(period);
        assert.equal(ui.strokes.some(s=>s.dash.join()==='4,4'),daily,period+' baseline');
        assert.equal(ui.labels.some(label=>label[0].startsWith('전일 종가')),daily,period+' reference label');
        assert.equal(ui.element('investment-chart').attributes['aria-label'].includes('전일 종가'),daily,period+' accessible reference');
        if(!daily) {
            const markers=ui.arcs.filter(arc=>arc[2]===2);
            assert.deepEqual(markers.map(arc=>arc.slice(0,2)),[[314,57.5],[6,177.5]],period+' scales to selected history');
        }
    }
});

test('extrema mark their record positions, include aggregated highs/lows and keep labels within the canvas', async () => {
    const data=sampleMarket();
    const points=[{time:data.asOf,open:100,high:160,low:90,close:120},{time:data.asOf+1800000,open:120,high:140,low:70,close:110}];
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);
        return {ok:true,json:async()=>u.pathname==='/market'?data:{asOf:data.asOf,symbol:'en-joy',period:u.searchParams.get('period'),points}};
    }});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    ui.click({period:'1w'});await ui.settle();
    assert.deepEqual(ui.arcs.filter(arc=>arc[2]===2).slice(-2).map(arc=>arc.slice(0,2)),[[6,57.5],[314,177.5]]);
    const connectors=ui.strokes.filter(s=>!s.dash.length).slice(-2);
    assert.deepEqual(connectors.map(s=>s.path[1]),[[6,57.5],[314,177.5]],'aggregated extremes connect to the closing-price line');
    for(const currency of ['POINTS','KRW']) {
        ui.labels.length=0;ui.click({currency});await ui.settle();
        const labels=ui.labels.filter(label=>/^최고 |^최저 /.test(label[0]));
        assert.equal(labels.length,2);
        assert.deepEqual(labels.map(label=>label[0]),currency==='POINTS'?['최고 160 P','최저 70 P']:['최고 1.6원','최저 0.7원']);
        for(const [text,x,y] of labels) {
            assert.ok(x>=6&&x+ui.ctx.measureText(text).width<=314);
            assert.ok(y>=12&&y<=250);
        }
    }
});

test('a single flat record uses one combined maximum/minimum marker', async () => {
    const ui=setup({fetcher:sampleApi(sampleMarket(),[])});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    ui.labels.length=0;ui.arcs.length=0;
    ui.click({period:'all'});await ui.settle();
    assert.deepEqual(ui.labels.map(label=>label[0]),['최고·최저 100 P']);
    assert.equal(ui.arcs.filter(arc=>arc[2]===2).length,1);
    assert.ok(ui.arcs.every(arc=>arc.every(Number.isFinite)));
});

async function scrubFixture() {
    const data=sampleMarket(), requests=[];
    const points=[195,205,190,212].map((close,i)=>({time:data.asOf+i*1800000,open:close,high:close,low:close,close}));
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);requests.push(u.pathname);
        return {ok:true,json:async()=>u.pathname==='/market'?data:{asOf:data.asOf,symbol:u.searchParams.get('symbol'),period:u.searchParams.get('period'),points}};
    }});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    ui.click({period:'1d'});await ui.settle();
    return {ui,requests};
}

test('drag inspection snaps to existing records, shows Korean dates and restores extremes on release/cancel', async () => {
    const {ui,requests}=await scrubFixture(), count=requests.length;
    ui.labels.length=0;
    ui.chartEvent('pointerdown',{clientX:108});
    assert.equal(ui.element('investment-chart-inspection').hidden,false);
    assert.equal(ui.element('investment-chart-time').textContent,'2026.10.22 12:30');
    assert.equal(ui.element('investment-chart-value').textContent,'205 P');
    assert.equal(ui.labels.some(label=>/^최고|^최저/.test(label[0])),false,'extrema labels hide during inspection');
    assert.match(ui.element('investment-chart').attributes['aria-label'],/선택 2026.10.22 12:30, 205 P/);
    ui.chartEvent('pointermove',{pointerId:2,clientX:1000});
    assert.equal(ui.element('investment-chart-value').textContent,'205 P','a second finger cannot move the selection');
    ui.chartEvent('pointermove',{clientX:1000});
    assert.equal(ui.element('investment-chart-value').textContent,'212 P','outside drag clamps to last record');
    ui.chartEvent('pointermove',{clientX:-100});
    assert.equal(ui.element('investment-chart-value').textContent,'195 P','outside drag clamps to first record');
    ui.chartEvent('pointerup');
    assert.equal(ui.element('investment-chart-inspection').hidden,true);
    assert.doesNotMatch(ui.element('investment-chart').attributes['aria-label'],/선택 /);
    assert.ok(ui.labels.some(label=>label[0]==='최저 190 P'));
    for(const type of ['pointercancel','lostpointercapture']) {
        ui.chartEvent('pointerdown');ui.chartEvent(type);
        assert.equal(ui.element('investment-chart-inspection').hidden,true,type+' clears the selection');
    }
    assert.equal(requests.length,count,'inspection never requests more prices');
});

test('inspection supports keyboard, currency changes and resets on period/tab/visibility changes', async () => {
    const {ui}=await scrubFixture();
    ui.chartEvent('keydown',{key:'Home'});
    assert.equal(ui.element('investment-chart-value').textContent,'195 P');
    ui.chartEvent('keydown',{key:'ArrowRight'});
    assert.equal(ui.element('investment-chart-value').textContent,'205 P');
    ui.click({currency:'KRW'});await ui.settle();
    assert.equal(ui.element('investment-chart-value').textContent,'2.05원');
    ui.chartEvent('keydown',{key:'End'});
    assert.equal(ui.element('investment-chart-value').textContent,'2.12원');
    ui.chartEvent('keydown',{key:'Escape'});
    assert.equal(ui.element('investment-chart-inspection').hidden,true);
    for(const action of [()=>ui.chartEvent('blur'),()=>ui.click({period:'1w'}),()=>ui.click({tab:'info'}),()=>{ui.doc.hidden=true;ui.events.visibilitychange();}]) {
        ui.chartEvent('keydown',{key:'Home'});action();
        assert.equal(ui.element('investment-chart-inspection').hidden,true);
        ui.doc.hidden=false;ui.click({tab:'chart'});await ui.settle();
    }
    ui.chartEvent('keydown',{key:'Home'});
    assert.equal(ui.element('investment-chart-time').textContent,'2026.10.22','longer views show record dates');
});

test('chart type switches cached OHLC records to red/blue candles and back without changing quotes or periods', async () => {
    const data=sampleMarket(),requests=[];
    const points=[{time:data.asOf,open:90,high:120,low:80,close:110},{time:data.asOf+1800000,open:110,high:115,low:85,close:90}];
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);requests.push(url);
        return {ok:true,json:async()=>u.pathname==='/market'?data:{asOf:data.asOf,symbol:'en-joy',period:u.searchParams.get('period'),points}};
    }});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    const count=requests.length,price=ui.element('investment-price').textContent;
    ui.click({chartType:'toggle'});
    assert.equal(ui.element('investment-chart-type').attributes['aria-label'],'선 차트로 전환');
    assert.equal(ui.element('investment-chart-type').attributes['aria-pressed'],'true');
    assert.match(ui.element('investment-chart-type').innerHTML,/chart-line\.png/);
    assert.match(ui.element('investment-chart').attributes['aria-label'],/캔들 차트/);
    assert.equal(ui.element('investment-chart-pulse').hidden,true);
    assert.deepEqual(ui.bodies.map(body=>body.color),['#f04452','#3182f6']);
    assert.ok(ui.bodies.every(body=>body.args.every(Number.isFinite)&&body.args[2]>0&&body.args[3]>0));
    assert.equal(ui.strokes.filter(stroke=>!stroke.dash.length).at(-2).path[1][1],177.5,'the high/low wick spans actual OHLC prices');
    ui.chartEvent('keydown',{key:'End'});
    assert.equal(ui.element('investment-chart-value').textContent,'90 P','inspection remains available in candles');
    ui.click({chartType:'toggle'});
    assert.equal(ui.element('investment-chart-inspection').hidden,true);
    assert.equal(ui.element('investment-chart-type').attributes['aria-label'],'캔들 차트로 전환');
    assert.doesNotMatch(ui.element('investment-chart').attributes['aria-label'],/캔들 차트/);
    assert.equal(ui.element('investment-price').textContent,price);
    assert.equal(requests.length,count,'the toggle uses the already loaded prices');
    assert.match(ui.element('wallet-panel-investment').innerHTML,/data-period="day" aria-label="오늘" aria-pressed="true">오늘/);
});

test('snapshot candle intervals use successive recorded prices and retain flat records as dojis', async () => {
    const {ui}=await scrubFixture();
    ui.click({chartType:'toggle'});
    assert.deepEqual(ui.bodies.map(body=>body.color),['#f04452','#3182f6','#f04452']);
    ui.click({period:'1w'});await ui.settle();
    assert.match(ui.element('investment-chart').attributes['aria-label'],/캔들 차트/,'style persists across periods');
    assert.doesNotMatch(ui.element('investment-chart').attributes['aria-label'],/전일 종가/);
    const flat=setup({fetcher:sampleApi(sampleMarket(),[])});
    await flat.settle();flat.click({stock:'enjoy'});await flat.settle();flat.click({chartType:'toggle'});
    assert.equal(flat.bodies.length,0,'a flat record has no invented candle body');
    assert.ok(flat.strokes.some(stroke=>stroke.color==='#909096'));
});

test('initial quote and chart skeletons resolve independently without replacing known quotes during refresh', async () => {
    const data=sampleMarket();let resolveMarket,resolveHistory;
    const ui=setup({fetcher:url=>new Promise(resolve=>{if(new URL(url).pathname==='/market')resolveMarket=resolve;else resolveHistory=resolve;})});
    assert.equal(ui.element('investment-stock-list').attributes['aria-busy'],'true');
    assert.match(ui.element('investment-index-list').innerHTML,/iv-skeleton-price/);
    assert.match(ui.element('investment-stock-list').innerHTML,/iv-skeleton-change/);
    ui.click({stock:'en-joy'});
    assert.match(ui.element('investment-price').innerHTML,/iv-skeleton-price/);
    assert.match(ui.element('investment-change').innerHTML,/iv-skeleton-change/);
    assert.equal(ui.element('investment-chart-skeleton').hidden,false);
    resolveMarket({ok:true,json:async()=>data});await ui.settle();
    assert.equal(ui.element('investment-price').textContent,'100 P');
    assert.equal(ui.element('investment-price').attributes['aria-busy'],'false');
    assert.doesNotMatch(ui.element('investment-stock-list').innerHTML,/iv-skeleton/);
    assert.equal(ui.element('investment-chart-skeleton').hidden,false,'history is still loading after quotes arrive');
    resolveHistory({ok:true,json:async()=>({asOf:data.asOf,symbol:'en-joy',period:'day',points:[{time:data.asOf,open:100,high:100,low:100,close:100}]})});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,true);
    assert.equal(ui.element('investment-chart').attributes['aria-busy'],'false');
    [...ui.timers.values()].find(timer=>timer.ms>10000).fn();
    assert.equal(ui.element('investment-price').textContent,'100 P');
    assert.equal(ui.element('investment-price').attributes['aria-busy'],'false','known prices do not flash back to skeletons');
    resolveMarket({ok:true,json:async()=>data});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,true,'unchanged cached history stays visible');
});

test('failed initial fetch ends skeletons and a retry restores loading until real quotes arrive', async () => {
    const data=sampleMarket();let failing=true,resolveRetry;
    const api=sampleApi(data,[]);
    const ui=setup({fetcher:url=>failing?Promise.reject(Error('offline')):new URL(url).pathname==='/market'?new Promise(resolve=>{resolveRetry=resolve;}):api(url)});
    ui.click({stock:'en-joy'});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,true);
    assert.equal(ui.element('investment-price').attributes['aria-busy'],'false');
    assert.doesNotMatch(ui.element('investment-stock-list').innerHTML,/iv-skeleton/);
    assert.equal(ui.element('market-detail-status').textContent,'시세 연결 지연');
    failing=false;[...ui.timers.values()].find(timer=>timer.ms===60000).fn();
    assert.equal(ui.element('investment-price').attributes['aria-busy'],'true');
    assert.equal(ui.element('investment-chart-skeleton').hidden,false);
    resolveRetry({ok:true,json:async()=>data});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,true);
    assert.equal(ui.element('investment-price').textContent,'100 P');
});

test('chart failures and empty histories end loading, and stale replies cannot hide the active skeleton', async () => {
    const data=sampleMarket(),replies=new Map();let fail=false;
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);
        if(u.pathname==='/market')return {ok:true,json:async()=>data};
        if(fail)throw Error('chart unavailable');
        return new Promise(resolve=>replies.set(u.searchParams.get('period'),resolve));
    }});
    await ui.settle();ui.click({stock:'en-joy'});ui.click({period:'1w'});await ui.settle();
    replies.get('day')({ok:true,json:async()=>({asOf:data.asOf,symbol:'en-joy',period:'day',points:[]})});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,false,'old period response leaves active period loading');
    replies.get('1w')({ok:true,json:async()=>({asOf:data.asOf,symbol:'en-joy',period:'1w',points:[]})});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,true);
    assert.match(ui.element('investment-chart').attributes['aria-label'],/과거 시세 기록 없음/);
    fail=true;ui.click({period:'3m'});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,true);
    assert.equal(ui.element('investment-chart').attributes['aria-busy'],'false');
    assert.ok(ui.labels.some(label=>label[0]==='차트 연결이 지연되고 있어요'));
    fail=false;ui.click({period:'3m'});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,false,'retry clears error state');
    replies.get('3m')({ok:true,json:async()=>({asOf:data.asOf,symbol:'en-joy',period:'3m',points:[]})});await ui.settle();
    assert.equal(ui.element('investment-chart-skeleton').hidden,true);
});

function tickLocal(ui) {
    const tick = [...ui.timers.values()].filter(timer => timer.ms <= 10000).sort((a,b)=>a.ms-b.ms)[0];
    assert.ok(tick, 'a 10-second local tick or its final boundary timer is scheduled');
    tick.fn();
}

test('per-device quotes move every 10 seconds without API calls, balance changes, index movement or recorded-history edits', async () => {
    const data = sampleMarket(), requests = [], member = Object.freeze({uid:'local',name:'테스트',points:12345});
    const api = sampleApi(data, requests);
    const ui = setup({user:{uid:'local'},member,members:[member],random:()=>.9,fetcher:async (url, options) => {
        assert.ok(!options.method || options.method === 'GET', 'local ticks never write to the API');
        return api(url);
    }});
    await ui.settle(); ui.click({stock:'en-joy'}); await ui.settle();
    const count = requests.length, ranking = ui.element('investment-ranking').innerHTML;
    const index = ui.element('investment-index-list').innerHTML;
    const recorded = ui.strokes.filter(s=>!s.dash.length).at(-1).path;
    tickLocal(ui);
    assert.equal(ui.element('investment-price').textContent, '104 P');
    assert.equal(ui.element('investment-list-price-en-joy').textContent, '104 P');
    assert.equal(ui.element('investment-change').textContent, '+4 P (+4.0%)');
    assert.equal(ui.element('investment-list-change-en-joy').className, 'iv-up');
    assert.equal(ui.element('market-detail-status').textContent, '30분 주기 갱신');
    assert.doesNotMatch(ui.element('wallet-panel-investment').innerHTML, /investment-reference|서버 기준|1초 변동/);
    const recordedAfter = ui.strokes.filter(s=>!s.dash.length).at(-1).path;
    assert.deepEqual(recordedAfter.map(point=>point[0]), recorded.map(point=>point[0]), 'recorded vertices keep their times when the y-axis rescales');
    assert.equal(recordedAfter[0][1], ui.strokes.filter(s=>s.dash.join()==='4,4').at(-1).path[0][1], 'the recorded 100 P remains on the server reference line');
    assert.match(ui.labels.at(-1)[0], /최고·최저 100 P/, 'local values never enter recorded highs/lows');
    assert.equal(ui.strokes.filter(s=>s.dash.join() === '3,3').at(-1).path.length, 2, 'local tail follows the last server vertex');
    assert.match(ui.element('investment-chart').attributes['aria-label'], /기기별 화면 시세 104 P/);
    assert.equal(ui.element('investment-index-list').innerHTML, index);
    assert.equal(ui.element('investment-account-points').textContent, '12,345 P');
    assert.equal(ui.element('investment-ranking').innerHTML, ranking);
    const currencyMarkup = ui.element('investment-detail-currency').innerHTML;
    tickLocal(ui);
    assert.equal(ui.element('investment-price').textContent, '108 P');
    assert.equal(ui.element('investment-detail-currency').innerHTML, currencyMarkup, 'ticks preserve focused controls');
    ui.click({currency:'KRW'}); await ui.settle();
    assert.equal(ui.element('investment-price').textContent, '1.08원');
    assert.equal(ui.element('investment-secondary-price').textContent, '108 P');
    assert.equal(ui.element('market-home-status').textContent, '30분 주기 갱신');
    assert.doesNotMatch(ui.element('investment-info-panel').innerHTML, /서버 기준|초 단위/);
    ui.click({period:'1w'}); await ui.settle();
    const historical = ui.arcs.length;
    tickLocal(ui);
    assert.equal(ui.arcs.length, historical, 'historical chart stays static while the header moves');
    ui.click({period:'day'}); await ui.settle();
    assert.equal(requests.length, count + 1, 'only selecting the uncached historical period requests data');
    assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length, 1);
});

test('independent sessions move in different directions and large random moves stay positive and bounded', async () => {
    const data=sampleMarket(), up=setup({fetcher:sampleApi(data,[]),random:()=>.9}), down=setup({fetcher:sampleApi(data,[]),random:()=>.1});
    await up.settle(); await down.settle();
    up.click({stock:'en-joy'}); down.click({stock:'en-joy'}); await up.settle(); await down.settle();
    tickLocal(up); tickLocal(down);
    assert.equal(up.element('investment-price').textContent,'104 P');
    assert.equal(down.element('investment-price').textContent,'93 P', 'large jump has a 7% move in this deterministic run');
    assert.equal(down.element('investment-change').className,'iv-down');
    for(let i=0;i<80;i++) {
        tickLocal(up);tickLocal(down);
        for(const ui of [up,down]) {
            const price=Number(ui.element('investment-price').textContent.replace(/[^\d]/g,''));
            assert.ok(price>=70 && price<=130, 'display stays within ±30% of the fixed server anchor');
        }
    }
    data.quotes[1]={id:'en-joy',price:1,previous:1,change:0,percent:0};
    const tiny=setup({fetcher:sampleApi(data,[]),random:()=>.1});await tiny.settle();tiny.click({stock:'en-joy'});await tiny.settle();
    for(let i=0;i<5;i++) { tickLocal(tiny);assert.match(tiny.element('investment-price').textContent,/^[12] P$/); }
});

test('the half-hour boundary ends local movement; the next server snapshot resets the quote and discards the old local tail', async () => {
    const data=sampleMarket(); let clock=data.serverTime+9*86400000;
    const requests=[],ui=setup({fetcher:sampleApi(data,requests),now:()=>clock,random:()=>.9});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();tickLocal(ui);
    assert.equal(ui.element('investment-price').textContent,'104 P');
    assert.equal(requests.filter(p=>p==='/market').length,1);
    clock+=data.nextUpdateAt-data.serverTime;
    tickLocal(ui);
    assert.equal(ui.element('investment-price').textContent,'100 P');
    assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,0);
    assert.equal(ui.element('market-home-status').textContent,'30분 주기 갱신');
    assert.doesNotMatch(ui.element('investment-chart').attributes['aria-label'],/기기별 화면 시세/);
    data.asOf+=1800000;data.nextUpdateAt+=1800000;data.serverTime=data.asOf+1500;data.revision++;
    data.quotes[1]={id:'en-joy',price:80,previous:100,change:-20,percent:-20};
    [...ui.timers.values()].find(t=>t.ms>10000).fn();await ui.settle();
    assert.equal(ui.element('investment-price').textContent,'80 P');
    assert.doesNotMatch(ui.element('investment-info-panel').innerHTML,/서버 기준/);
    assert.equal(requests.filter(p=>p==='/market').length,2);
    assert.doesNotMatch(ui.element('investment-chart').attributes['aria-label'],/기기별 화면 시세/);
    tickLocal(ui);
    assert.equal(ui.element('investment-price').textContent,'83 P', 'movement restarts around the new server price');
});

test('hidden, offline, unavailable and delayed screens stop local ticks; reopening reuses one timer and cached data', async () => {
    const unavailable=setup();assert.equal([...unavailable.timers.values()].filter(t=>t.ms===10000).length,0);
    const data=sampleMarket(),requests=[],ui=setup({fetcher:sampleApi(data,requests),random:()=>.9});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();tickLocal(ui);
    ui.doc.hidden=true;ui.events.visibilitychange();assert.equal(ui.timers.size,0);
    ui.doc.hidden=false;ui.events.visibilitychange();await ui.settle();
    assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,1);
    assert.equal(requests.filter(p=>p==='/market').length,1);
    ui.events.offline();assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,0);
    assert.equal(ui.element('market-detail-status').textContent,'시세 연결 지연');
    ui.events.online();await ui.settle();assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,1);
    data.stale=true;ui.events.online();await ui.settle();
    assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,0);
    data.stale=false;ui.events.online();await ui.settle();
    ui.element('wallet-panel-investment').classList.contains=()=>true;
    ui.events.visibilitychange();assert.equal(ui.timers.size,0, 'switching to another wallet panel clears both loops');
});

test('KST 23:30 stops random quotes and chart motion, accepts the closing snapshot and resumes after the midnight snapshot', async () => {
    const data=sampleMarket(), close=Date.parse('2026-10-22T14:30:00Z');
    data.asOf=close-1800000;data.serverTime=close-12000;data.nextUpdateAt=close;
    let clock=Date.parse('2030-01-01T00:00:00Z'), randomCalls=0;
    const ui=setup({fetcher:sampleApi(data,[]),now:()=>clock,random:()=>{randomCalls++;return .9;}});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    clock+=10000;tickLocal(ui);assert.equal(ui.element('investment-price').textContent,'104 P');
    const calls=randomCalls;clock+=2000;tickLocal(ui);
    assert.equal(randomCalls,calls,'no random sample at exactly 23:30 KST');
    assert.equal(ui.element('investment-price').textContent,'100 P');
    assert.equal(ui.element('market-home-status').textContent,'운영 종료 · 00:00 재개');
    assert.equal(ui.element('investment-chart-pulse').hidden,true);
    assert.doesNotMatch(ui.element('investment-chart').attributes['aria-label'],/기기별 화면 시세/);
    data.asOf=close;data.serverTime=close;data.nextUpdateAt=close+1800000;data.revision++;
    data.quotes[1]={id:'en-joy',price:110,previous:100,change:10,percent:10};
    ui.events.online();await ui.settle();
    assert.equal(ui.element('investment-price').textContent,'110 P','the final server snapshot is still received');
    assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,0);
    ui.doc.hidden=true;ui.events.visibilitychange();clock+=600000;
    ui.doc.hidden=false;ui.events.visibilitychange();await ui.settle();
    ui.events.offline();ui.events.online();await ui.settle();
    assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,0,'reopening and reconnecting cannot restart closed-market movement');
    assert.equal(ui.element('investment-price').textContent,'110 P');
    ui.click({stock:'enjoy'});await ui.settle();
    assert.equal(ui.element('market-detail-status').textContent,'운영 종료 · 00:00 재개');
    clock+=1200000;
    ui.events.visibilitychange();await ui.settle();
    assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,0,'midnight waits for a fresh server snapshot');
    data.asOf=close+1800000;data.serverTime=data.asOf;data.nextUpdateAt=data.asOf+1800000;data.revision++;
    data.quotes[1]={id:'en-joy',price:120,previous:110,change:10,percent:9.09};
    ui.events.online();await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    tickLocal(ui);assert.equal(ui.element('investment-price').textContent,'124 P');
    assert.equal(ui.element('market-home-status').textContent,'30분 주기 갱신');
});

test('loading during KST closing hours never starts random motion, including a delayed server response', async () => {
    for (const [time,stale] of [['2026-10-22T14:30:00Z',false],['2026-10-22T14:59:59Z',false],['2026-10-22T14:45:00Z',true]]) {
        const data=sampleMarket();data.serverTime=Date.parse(time);data.asOf=Date.parse('2026-10-22T14:30:00Z');
        data.nextUpdateAt=Date.parse('2026-10-22T15:00:00Z');data.stale=stale;
        const ui=setup({fetcher:sampleApi(data,[]),random:()=>{assert.fail('market is closed');}});
        await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
        assert.equal([...ui.timers.values()].filter(t=>t.ms===10000).length,0);
        assert.equal(ui.element('investment-price').textContent,'100 P');
        assert.equal(ui.element('market-detail-status').textContent,'운영 종료 · 00:00 재개');
        assert.equal(ui.element('investment-chart-pulse').hidden,true);
    }
});

test('closing tab loads exact daily rows lazily, paginates, converts units and keeps index/stock caches separate',async()=>{
    const requests=[],data=sampleMarket(),DAY=86400000;
    const today=Math.floor((data.asOf+32400000)/DAY)*DAY-32400000;
    const rows=Array.from({length:31},(_,i)=>({day:today-(i+1)*DAY,close:i%2?90:110,previous:100,change:i%2?-10:10,percent:i%2?-10:10,volume:0,turnover:0}));
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);
        if(u.pathname!='/closes')return sampleApi(data,requests)(url);
        requests.push(u.pathname+u.search);const more=u.searchParams.has('before');
        return {ok:true,json:async()=>({...data,symbol:u.searchParams.get('symbol'),rows:more?rows.slice(30):rows.slice(0,30),nextBefore:more?null:rows[29].day})};
    }});
    await ui.settle();ui.click({stock:'en-joy'});await ui.settle();
    assert.ok(!requests.some(p=>p.startsWith('/closes')),'chart does not load daily tables');
    ui.click({tab:'closes'});await ui.settle();
    let html=ui.element('investment-closes-panel').innerHTML;
    assert.match(html,/종가/);assert.match(html,/거래량\(토큰\)/);assert.match(html,/110 P/);assert.match(html,/iv-up">\+10.00%/);assert.match(html,/iv-down">-10.00%/);
    assert.equal((html.match(/<time /g)||[]).length,30);
    ui.click({currency:'KRW'});await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/1.1원/);
    ui.click({tab:'info'});ui.click({tab:'closes'});await ui.settle();
    assert.equal(requests.filter(p=>p.startsWith('/closes')).length,1,'tab/unit changes reuse the exact stored records');
    ui.click({closes:'more'});await ui.settle();html=ui.element('investment-closes-panel').innerHTML;
    assert.equal((html.match(/<time /g)||[]).length,31);assert.doesNotMatch(html,/이전 기록 더 보기/);
    ui.click({stock:'enjoy'});ui.click({tab:'closes'});await ui.settle();
    html=ui.element('investment-closes-panel').innerHTML;assert.doesNotMatch(html,/거래량|거래대금/);
    assert.equal(requests.filter(p=>p.startsWith('/closes')).length,3);
    const before=requests.length;tickLocal(ui);assert.equal(requests.length,before,'local quote animation never writes or refreshes closes');
});

test('closing history retains loaded rows on pagination failure and retries the same cursor; empty history is explicit',async()=>{
    const data=sampleMarket(),DAY=86400000,today=Math.floor((data.asOf+32400000)/DAY)*DAY-32400000;
    const rows=Array.from({length:30},(_,i)=>({day:today-(i+1)*DAY,close:100,previous:100,change:0,percent:0,volume:0,turnover:0}));
    let failing=true;const cursors=[];
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);if(u.pathname!='/closes')return sampleApi(data,[])(url);
        if(u.searchParams.get('symbol')==='enjoy')return {ok:true,json:async()=>({...data,symbol:'enjoy',rows:[],nextBefore:null})};
        const cursor=u.searchParams.get('before');cursors.push(cursor);
        if(cursor&&failing)throw Error('offline');
        return {ok:true,json:async()=>({...data,symbol:'en-joy',rows:cursor?[{...rows[29],day:rows[29].day-DAY}]:rows,nextBefore:cursor?null:rows[29].day})};
    }});
    await ui.settle();ui.click({stock:'en-joy'});ui.click({tab:'closes'});await ui.settle();
    ui.click({closes:'more'});await ui.settle();
    let html=ui.element('investment-closes-panel').innerHTML;assert.match(html,/다시 불러오기/);assert.equal((html.match(/<time /g)||[]).length,30);
    failing=false;ui.click({closes:'retry'});await ui.settle();html=ui.element('investment-closes-panel').innerHTML;
    assert.equal(cursors[1],cursors[2]);assert.equal((html.match(/<time /g)||[]).length,31);assert.doesNotMatch(html,/연결이 지연/);
    ui.click({stock:'enjoy'});ui.click({tab:'closes'});await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/아직 마감된 종가 기록이 없어요/);
});

test('late closing responses from another symbol or revision cannot replace the active table',async()=>{
    const data=sampleMarket(),DAY=86400000,today=Math.floor((data.asOf+32400000)/DAY)*DAY-32400000;
    let resolveStock;
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);if(u.pathname!='/closes')return sampleApi(data,[])(url);
        if(u.searchParams.get('symbol')==='en-joy')return new Promise(resolve=>{resolveStock=resolve;});
        return {ok:true,json:async()=>({...data,symbol:'enjoy',rows:[],nextBefore:null})};
    }});
    await ui.settle();ui.click({stock:'en-joy'});ui.click({tab:'closes'});await ui.settle();
    ui.click({stock:'enjoy'});ui.click({tab:'closes'});await ui.settle();
    resolveStock({ok:true,json:async()=>({...data,symbol:'en-joy',rows:[{day:today-DAY,close:54321,previous:100,change:54221,percent:54221,volume:0,turnover:0}],nextBefore:null})});
    await ui.settle();assert.doesNotMatch(ui.element('investment-closes-panel').innerHTML,/54,321/);
    assert.match(ui.element('investment-closes-panel').innerHTML,/아직 마감된/);
});

test('quote subtabs show separate daily and half-hour history; local 10-second motion never changes stored rows',async()=>{
    const requests=[],data=sampleMarket();let pageFailure=true;
    const ui=setup({random:()=>.9,fetcher:async url=>{
        const u=new URL(url);if(!['/ticks','/closes'].includes(u.pathname))return sampleApi(data,requests)(url);
        requests.push(u.pathname+u.search);const symbol=u.searchParams.get('symbol'),more=u.searchParams.has('before');
        if(u.pathname==='/closes')return {ok:true,json:async()=>({...data,symbol,rows:[],nextBefore:null})};
        if(more&&pageFailure)throw Error('offline');
        const rows=Array.from({length:more?2:48},(_,i)=>({time:data.asOf-(i+(more?48:0))*1800000,price:100,previous:101,change:-1,percent:-.99}));
        return {ok:true,json:async()=>({...data,symbol,rows,nextBefore:more?null:rows.at(-1).time})};
    }});
    await ui.settle();assert.ok([...ui.timers.values()].some(t=>t.ms===10000));assert.ok(![...ui.timers.values()].some(t=>t.ms===1000));
    assert.equal(ui.element('market-home-status').textContent,'30분 주기 갱신');
    ui.click({stock:'en-joy'});ui.click({tab:'closes'});await ui.settle();
    assert.match(ui.element('investment-closes-panel').innerHTML,/data-quote-period="daily"[^>]*aria-selected="true"/);
    assert.ok(!requests.some(r=>r.startsWith('/ticks')));
    ui.click({quotePeriod:'realtime'});await ui.settle();
    let html=ui.element('investment-closes-panel').innerHTML;
    assert.match(html,/data-quote-period="realtime"[^>]*aria-selected="true"/);assert.match(html,/12:00/);assert.match(html,/11:30/);
    assert.equal((html.match(/<time /g)||[]).length,48);assert.match(html,/-0.99%/);assert.doesNotMatch(html,/거래량|종가/);
    const count=requests.length;tickLocal(ui);assert.equal(ui.element('investment-closes-panel').innerHTML,html);assert.equal(requests.length,count);
    ui.click({currency:'KRW'});await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/>1원</);assert.equal(requests.length,count);
    ui.click({ticks:'more'});await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/다시 불러오기/);
    assert.equal((ui.element('investment-closes-panel').innerHTML.match(/<time /g)||[]).length,48);
    pageFailure=false;ui.click({ticks:'retry'});await ui.settle();assert.equal((ui.element('investment-closes-panel').innerHTML.match(/<time /g)||[]).length,50);
    ui.click({quotePeriod:'daily'});await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/아직 마감된/);
    ui.click({quotePeriod:'realtime'});await ui.settle();assert.equal((ui.element('investment-closes-panel').innerHTML.match(/<time /g)||[]).length,50);
    const oldCount=requests.filter(r=>r.startsWith('/ticks')).length;
    data.asOf+=1800000;data.nextUpdateAt+=1800000;data.serverTime=data.asOf+1000;data.revision++;
    ui.events.online();await ui.settle();assert.equal(requests.filter(r=>r.startsWith('/ticks')).length,oldCount+1,'shared tick refreshes the selected realtime table');
    ui.click({stock:'enjoy'});ui.click({tab:'closes'});await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/data-quote-period="daily"[^>]*aria-selected="true"/);
    ui.click({quotePeriod:'realtime'});await ui.settle();assert.match(requests.at(-1),/symbol=enjoy/);
});

test('a late realtime response cannot overwrite daily history or a different selected symbol',async()=>{
    const data=sampleMarket();let resolveTicks;
    const ui=setup({fetcher:async url=>{
        const u=new URL(url);if(u.pathname==='/ticks')return new Promise(resolve=>{resolveTicks=resolve;});
        if(u.pathname==='/closes')return {ok:true,json:async()=>({...data,symbol:u.searchParams.get('symbol'),rows:[],nextBefore:null})};
        return sampleApi(data,[])(url);
    }});
    await ui.settle();ui.click({stock:'en-joy'});ui.click({tab:'closes'});ui.click({quotePeriod:'realtime'});await ui.settle();
    ui.click({quotePeriod:'daily'});await ui.settle();
    resolveTicks({ok:true,json:async()=>({...data,symbol:'en-joy',rows:[{time:data.asOf,price:54321,previous:100,change:54221,percent:54221}],nextBefore:null})});
    await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/아직 마감된/);assert.doesNotMatch(ui.element('investment-closes-panel').innerHTML,/54,321/);
    ui.click({quotePeriod:'realtime'});await ui.settle();assert.match(ui.element('investment-closes-panel').innerHTML,/54,321 P/);
});
