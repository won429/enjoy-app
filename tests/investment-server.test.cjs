const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const {Miniflare,convertV4MiniflareOptions} = require('../cloudflare-worker/node_modules/miniflare');
const esbuild = require('../cloudflare-worker/node_modules/esbuild');

test('Cloudflare SQLite market has atomic hourly updates, durable history, retry deduplication and no trading', {timeout:60000}, async () => {
    const HOUR=1800000, origin='https://enjoy-app.pages.dev', entry=path.resolve(__dirname,'../cloudflare-worker/investment-worker.js');
    let now=Date.parse('2026-10-21T12:15:00Z');
    const persist=fs.mkdtempSync(path.join(os.tmpdir(),'investment-server-'));
    const bundle=await esbuild.build({stdin:{contents:`import worker,{InvestmentMarket} from ${JSON.stringify(entry)};
      export class TestMarket extends InvestmentMarket {
        randomSample(){return .5;}
        writeCandles(frame){super.writeCandles(frame);if(frame.revision===2&&!this.testFailed){this.testFailed=true;throw Error('simulated commit failure');}}
      }
      export default {...worker,async fetch(request,env,ctx){
        const u=new URL(request.url);
        if(u.pathname==='/__test_tick'){try{await worker.scheduled({scheduledTime:Number(u.searchParams.get('time'))},env,ctx);return Response.json({ok:true});}catch(_){return Response.json({ok:false},{status:503});}}
        return worker.fetch(request,env,ctx);
      }};`,resolveDir:path.dirname(entry)},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
    const opts=()=>convertV4MiniflareOptions({modules:true,script:`Date.now=()=>${now};\n`+bundle.outputFiles[0].text,compatibilityDate:'2026-08-19',
        resourcePersistencePath:persist,durableObjects:{INVESTMENT_MARKET:{className:'TestMarket',useSQLite:true}},
        bindings:{ALLOWED_ORIGINS:origin,INITIAL_STOCK_POINTS:'100',INITIAL_INDEX_POINTS:'100',MAX_HOURLY_BPS:'300'},
        outboundService:request=>{assert.equal(new URL(request.url).hostname,'raw.githubusercontent.com');return new Response("window.ENJOY_VLOG_PROGRAMS={a:{episodes:[{url:'https://youtu.be/21uUicVMzqg'}]}};");}});
    let mf=new Miniflare(opts());
    const get=async(p,init={})=>mf.dispatchFetch('https://investment.test'+p,{...init,headers:{Origin:origin,...init.headers}});
    const tick=()=>get('/__test_tick?time='+now);
    try {
        let response=await get('/market');assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
        let first=await response.json();assert.deepEqual(first.quotes.map(q=>q.price),[100,100]);assert.equal(first.revision,0);
        assert.equal((await get('/orders',{method:'POST',body:'{}'})).status,423);
        assert.equal((await get('/advance',{method:'POST',body:'{}'})).status,423);
        assert.equal((await get('/market',{headers:{Origin:'https://untrusted.test'}})).status,403);
        assert.equal((await get('/history?symbol=bad&period=day')).status,400);
        assert.equal((await get('/history?symbol=en-joy&period=bad')).status,400);
        now=first.asOf+HOUR+1000;
        await mf.dispose();mf=new Miniflare(opts());
        const stale=await (await get('/market')).json();assert.equal(stale.stale,true);assert.equal(stale.revision,0,'reads do not invent a price update');
        const results=await Promise.all(Array.from({length:5},tick));assert.ok(results.every(r=>r.ok));
        const updated=await (await get('/market')).json();assert.equal(updated.revision,1);assert.equal(updated.asOf,first.asOf+HOUR);
        assert.equal(updated.quotes[0].price,100);assert.ok(updated.quotes[1].price>=97&&updated.quotes[1].price<=103);
        const history=await (await get('/history?symbol=en-joy&period=day')).json();assert.equal(history.points.length,2);
        assert.equal(history.points.at(-1).close,updated.quotes[1].price);
        now+=HOUR;
        await mf.dispose();mf=new Miniflare(opts());
        assert.equal((await tick()).status,503,'a mid-transaction failure must fail the update');
        const rolledBack=await (await get('/market')).json();assert.equal(rolledBack.revision,1);
        assert.equal((await (await get('/history?symbol=en-joy&period=day')).json()).points.length,2,'partial candle writes rolled back');
        assert.equal((await tick()).status,200,'retry after rollback succeeds');
        assert.equal((await (await get('/market')).json()).revision,2);
        const daily=await (await get('/history?symbol=enjoy&period=1y')).json();assert.equal(daily.points.length,0,'historical periods exclude the current day');
        await mf.dispose();mf=new Miniflare(opts());
        const restored=await (await get('/market')).json();assert.equal(restored.revision,2);assert.equal(restored.tradingEnabled,false);
        assert.equal((await (await get('/history?symbol=en-joy&period=day')).json()).points.length,3,'prices and complete history survive restart');
        now=Date.parse('2026-10-21T15:00:01Z');await mf.dispose();mf=new Miniflare(opts());
        assert.equal((await tick()).status,200);
        const today=await (await get('/history?symbol=en-joy&period=day')).json();
        assert.equal(today.axisStart,Date.parse('2026-10-21T15:00:00Z'));
        assert.equal(today.axisEnd,today.axisStart+47*HOUR);assert.equal(today.points.length,1);
        assert.equal(today.points[0].time,today.axisStart,'midnight price belongs to the new day');
        assert.equal(today.points[0].open,today.points[0].close,'yesterday close is not today opening price');
        const yesterday=await (await get('/history?symbol=en-joy&period=1d')).json();
        assert.equal(yesterday.points.length,6);assert.ok(yesterday.points.every(point=>point.time<today.axisStart));
        const pastWeek=await (await get('/history?symbol=en-joy&period=1w')).json();assert.ok(pastWeek.points.every(point=>point.time<today.axisStart));
        const book=await (await get('/orderbook?symbol=en-joy')).json();
        assert.equal(book.tradingEnabled,false);assert.equal(book.totalAsk,0);assert.equal(book.totalBid,0);
        assert.ok([...book.asks,...book.bids].every(level=>level.quantity===0));assert.deepEqual(book.trades,[]);
        assert.equal(book.stats.open,today.points[0].close);assert.equal(book.stats.volume,0);
        assert.equal((await get('/orderbook?symbol=enjoy')).status,400);

    } finally {await mf.dispose();fs.rmSync(persist,{recursive:true,force:true});}
});
