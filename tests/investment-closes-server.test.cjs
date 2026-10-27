const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {Miniflare,convertV4MiniflareOptions}=require('../cloudflare-worker/node_modules/miniflare');
const esbuild=require('../cloudflare-worker/node_modules/esbuild');

test('daily closes commit at 23:30, survive late edits/restart, restore legacy days and paginate without grouping',{timeout:60000},async()=>{
  const origin='https://enjoy-app.pages.dev',DAY=86400000,STEP=1800000;
  let now=Date.parse('2026-10-21T14:00:01Z');
  const persist=fs.mkdtempSync(path.join(os.tmpdir(),'investment-closes-'));
  const entry=path.resolve(__dirname,'../cloudflare-worker/investment-worker.js');
  const bundle=await esbuild.build({stdin:{contents:`import worker,{InvestmentMarket} from ${JSON.stringify(entry)};
    export class TestMarket extends InvestmentMarket {
      randomSample(){return .5;}
      writeCandles(frame){super.writeCandles(frame);if(this.failClose && frame.hour%86400000===52200000){this.failClose=false;throw Error('close transaction failed');}}
      async fetch(request){const p=new URL(request.url).pathname;
        if(p==='/__fail'){this.failClose=true;return Response.json({ok:true});}
        if(p==='/__legacy'){
          this.sql.exec('DELETE FROM market_daily_closes');const s={...this.state};delete s.dailyClosesVersion;this.writeState(s);return Response.json({ok:true});
        }
        if(p==='/__seed_ticks'){
          for(let i=1;i<=65;i++)this.sql.exec('INSERT INTO market_candles VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING','en-joy','hour',this.state.hour-i*1800000,100+i,100+i,100+i,100+i);
          return Response.json({ok:true});
        }
        if(p==='/__seed'){
          const day=Math.floor((Date.now()+32400000)/86400000)*86400000-32400000;
          for(let i=1;i<=65;i++)this.sql.exec('INSERT INTO market_daily_closes VALUES(?,?,?,?) ON CONFLICT DO NOTHING','en-joy',day-i*86400000,100+i,100+i+1);
          return Response.json({ok:true});
        }
        return super.fetch(request);
      }
    }
    export default {...worker,async fetch(request,env,ctx){const p=new URL(request.url).pathname;
      if(p==='/__tick'){try{await worker.scheduled({scheduledTime:Date.now()},env,ctx);return Response.json({ok:true});}catch(_){return Response.json({ok:false},{status:503});}}
      const internal=env.INVESTMENT_MARKET.get(env.INVESTMENT_MARKET.idFromName('enjoy-market-v1'));
      if(p==='/__edit'){const m=await(await internal.fetch('https://market.internal/market')).json();return internal.fetch('https://market.internal/admin/index',{method:'POST',body:JSON.stringify({admin:{uid:'test'},input:{price:110,expectedRevision:m.revision,requestId:'12345678-1234-1234-1234-123456789abc',note:'late edit'}})});}
      if(p.startsWith('/__'))return internal.fetch('https://market.internal'+p);
      return worker.fetch(request,env,ctx);
    }};`,resolveDir:path.dirname(entry)},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
  const options=()=>convertV4MiniflareOptions({modules:true,script:`Date.now=()=>${now};\n`+bundle.outputFiles[0].text,compatibilityDate:'2026-08-19',resourcePersistencePath:persist,
    durableObjects:{INVESTMENT_MARKET:{className:'TestMarket',useSQLite:true}},bindings:{ALLOWED_ORIGINS:origin},outboundService:()=>new Response('window.ENJOY_VLOG_PROGRAMS={};')});
  let mf=new Miniflare(options());
  const get=(p,init={})=>mf.dispatchFetch('https://test.invalid'+p,{...init,headers:{Origin:origin,...init.headers}});
  const closes=async(s='en-joy',extra='')=>(await get('/closes?symbol='+s+extra)).json();
  const ticks=async(s='en-joy',extra='')=>(await get('/ticks?symbol='+s+extra)).json();
  const restart=async()=>{await mf.dispose();mf=new Miniflare(options());};
  try{
    assert.equal((await closes()).rows.length,0,'intraday quotes are not closes');
    let initialTicks=await ticks();assert.equal(initialTicks.rows.length,1);assert.equal(initialTicks.rows[0].price,100);
    assert.equal(initialTicks.updateIntervalMs,STEP);assert.equal(initialTicks.rows[0].change,0);
    assert.equal((await get('/ticks?symbol=bad')).status,400);
    for(const cursor of ['', 'bad','-1','1','1.5','Infinity'])assert.equal((await get('/ticks?symbol=enjoy&before='+cursor)).status,400);
    assert.equal((await get('/ticks?symbol=enjoy',{method:'POST'})).status,423);
    assert.equal((await get('/ticks?symbol=enjoy',{headers:{Origin:'https://bad.test'}})).status,403);
    assert.equal((await get('/closes?symbol=bad')).status,400);
    for(const cursor of ['', 'bad','-1','1','1.5','Infinity'])assert.equal((await get('/closes?symbol=enjoy&before='+cursor)).status,400);
    assert.equal((await get('/closes?symbol=enjoy',{headers:{Origin:'https://bad.test'}})).status,403);
    assert.equal((await get('/closes?symbol=enjoy',{method:'POST'})).status,423);
    now=Date.parse('2026-10-21T14:30:01Z');await restart();
    assert.equal((await closes()).rows.length,0,'a stale 23:00 quote is not a 23:30 close');
    await get('/__fail');assert.equal((await get('/__tick')).status,503);
    assert.equal((await closes()).rows.length,0,'snapshot rolls back with price/candle transaction');
    assert.deepEqual((await ticks()).rows,initialTicks.rows,'half-hour records also roll back atomically');
    assert.equal((await get('/__tick')).status,200);
    let stock=await closes(),index=await closes('enjoy');
    let currentTicks=await ticks();assert.equal(currentTicks.rows.length,2);assert.equal(currentTicks.rows[0].time,Date.parse('2026-10-21T14:30:00Z'));
    assert.equal(currentTicks.rows[0].price,stock.rows[0].close);
    assert.equal(stock.rows.length,1);assert.equal(stock.rows[0].close,100);assert.equal(stock.rows[0].previous,100);
    assert.equal(stock.rows[0].volume,0);assert.equal(stock.rows[0].turnover,0);assert.equal(index.rows[0].volume,null);
    assert.equal(stock.rows[0].day+DAY-STEP,Date.parse('2026-10-21T14:30:00Z'));
    await get('/__tick');assert.deepEqual((await closes()).rows,stock.rows,'duplicate cron cannot duplicate a close');
    assert.equal((await get('/__edit')).status,200);assert.deepEqual((await closes('enjoy')).rows,index.rows,'late index edits cannot rewrite frozen closes');
    await restart();assert.deepEqual((await closes()).rows,stock.rows);
    assert.deepEqual((await ticks()).rows,currentTicks.rows,'exact half-hour prices survive restart');
    now+=STEP;await restart();await get('/__tick');assert.deepEqual((await closes()).rows,stock.rows,'midnight leaves completed history intact');
    await get('/__legacy');await restart();
    const before=await(await get('/market')).json();
    assert.deepEqual((await closes()).rows,stock.rows,'saved legacy daily candles restore actual closes');
    assert.deepEqual(await(await get('/market')).json(),before,'history migration cannot reprice the market');
    now+=47*STEP;await restart();await get('/__tick');
    const second=await closes('enjoy');assert.equal(second.rows.length,2);assert.equal(second.rows[0].close,110);assert.equal(second.rows[0].percent,0,'legacy close reflects saved historical final value');
    await get('/__seed');
    const first=await closes(),next=await closes('en-joy','&before='+first.nextBefore),last=await closes('en-joy','&before='+next.nextBefore);
    assert.equal(first.rows.length,30);assert.equal(next.rows.length,30);assert.equal(last.rows.length,6);assert.equal(last.nextBefore,null);
    const rows=[...first.rows,...next.rows,...last.rows];assert.equal(new Set(rows.map(r=>r.day)).size,66);
    assert.ok(rows.every((r,i)=>i===0||r.day<rows[i-1].day),'strict newest-first daily rows across all pages');
    assert.ok(rows.every(r=>Number.isFinite(r.percent)&&r.change===r.close-r.previous));
    await get('/__seed_ticks');
    const tickPage=await ticks(),tickNext=await ticks('en-joy','&before='+tickPage.nextBefore);
    assert.equal(tickPage.rows.length,48);assert.equal(tickNext.rows.length,18);assert.equal(tickNext.nextBefore,null);
    const tickRows=[...tickPage.rows,...tickNext.rows];assert.equal(new Set(tickRows.map(r=>r.time)).size,66);
    assert.ok(tickRows.every((r,i)=>!i||r.time===tickRows[i-1].time-STEP),'half-hour records are returned individually, without chart aggregation');
    assert.equal(tickPage.rows[47].previous,tickNext.rows[0].price,'page-boundary change uses the actual prior record');
    assert.ok(tickRows.every(r=>r.change===r.price-r.previous));
    const chartBefore=await(await get('/history?symbol=en-joy&period=day')).json();
    await ticks();assert.deepEqual(await(await get('/history?symbol=en-joy&period=day')).json(),chartBefore,'reading the table never changes recorded prices');
  }finally{await mf.dispose();fs.rmSync(persist,{recursive:true,force:true});}
});
