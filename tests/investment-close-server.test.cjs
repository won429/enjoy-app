const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {Miniflare,convertV4MiniflareOptions}=require('../cloudflare-worker/node_modules/miniflare');
const esbuild=require('../cloudflare-worker/node_modules/esbuild');

test('daily comparison migrates from saved candles without repricing; list/detail/book share the close across restart and midnight',{timeout:60000},async()=>{
  const HOUR=1800000,origin='https://enjoy-app.pages.dev';
  let now=Date.parse('2026-10-21T12:15:00Z'),sample=.999999999;
  const persist=fs.mkdtempSync(path.join(os.tmpdir(),'investment-close-'));
  const entry=path.resolve(__dirname,'../cloudflare-worker/investment-worker.js');
  const bundle=await esbuild.build({stdin:{contents:`import worker,{InvestmentMarket} from ${JSON.stringify(entry)};
    export class TestMarket extends InvestmentMarket {
      randomSample(){return Number(this.env.TEST_RANDOM);}
      async fetch(request){if(new URL(request.url).pathname==='/__hourly_comparison'){
        const old={...this.state,quotes:this.state.quotes.map(q=>q.id==='en-joy'?{...q,previous:110}:q)};
        delete old.quoteComparison;this.writeState(old);return Response.json({ok:true});
      }if(new URL(request.url).pathname==='/__hourly_interval'){
        this.writeState({...this.state,updateIntervalMs:3600000,nextTickAt:this.state.hour+3600000});
        this.sql.exec('INSERT INTO vlog_uploads VALUES(?,?,?) ON CONFLICT DO NOTHING','legacy-upload',Date.now(),this.state.hour+3600000);
        return Response.json({ok:true});
      }return super.fetch(request);}
    }
    export default {...worker,async fetch(request,env,ctx){const p=new URL(request.url).pathname;
      if(p==='/__tick'){await worker.scheduled({scheduledTime:Date.now()},env,ctx);return Response.json({ok:true});}
      if(['/__hourly_comparison','/__hourly_interval'].includes(p))return env.INVESTMENT_MARKET.get(env.INVESTMENT_MARKET.idFromName('enjoy-market-v1')).fetch('https://market.internal'+p);
      return worker.fetch(request,env,ctx);
    }};`,resolveDir:path.dirname(entry)},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
  const options=()=>convertV4MiniflareOptions({modules:true,script:`Date.now=()=>${now};\n`+bundle.outputFiles[0].text,
    compatibilityDate:'2026-08-19',resourcePersistencePath:persist,
    durableObjects:{INVESTMENT_MARKET:{className:'TestMarket',useSQLite:true}},
    bindings:{ALLOWED_ORIGINS:origin,MAX_HOURLY_BPS:'1000',TEST_RANDOM:String(sample)},
    outboundService:()=>new Response("window.ENJOY_VLOG_PROGRAMS={a:{episodes:[{url:'https://youtu.be/21uUicVMzqg'}]}};")});
  let mf=new Miniflare(options());
  const get=(p,init={})=>mf.dispatchFetch('https://test.invalid'+p,{...init,headers:{Origin:origin,...init.headers}});
  const market=async()=>(await get('/market')).json();
  const history=async period=>(await get('/history?symbol=en-joy&period='+period)).json();
  const restart=async()=>{await mf.dispose();mf=new Miniflare(options());};
  try{
    let data=await market();assert.equal(data.quotes[1].previous,100);
    for(const time of ['2026-10-21T12:30:01Z','2026-10-21T13:00:01Z']){
      now=Date.parse(time);await restart();assert.equal((await get('/__tick')).status,200);
    }
    data=await market();assert.equal(data.quotes[1].price,121);assert.equal(data.quotes[1].percent,21);
    now=Date.parse('2026-10-21T14:30:01Z');sample=.5;await restart();await get('/__tick');data=await market();
    const day=await history('day'),before=structuredClone(data);
    await get('/__hourly_comparison');now=Date.parse('2026-10-21T15:00:01Z');await restart();
    data=await market();assert.equal(data.quoteComparison,'previous-close');assert.equal(data.stale,true);
    assert.equal(data.asOf,before.asOf);assert.equal(data.quotes[1].price,121);assert.equal(data.quotes[1].previous,100,'stale migration uses the saved quote date, not the current date');
    assert.equal(data.quotes[1].percent,21);assert.equal(data.revision,before.revision+1);
    assert.deepEqual((await history('1d')).points,day.points,'migration cannot rewrite actual candles');
    sample=0;await restart();await get('/__tick');data=await market();
    assert.equal(data.quotes[1].price,109);assert.equal(data.quotes[1].previous,121);assert.equal(data.quotes[1].percent,-9.92);
    const current=structuredClone(data),today=await history('day');
    await get('/__hourly_comparison');await restart();data=await market();
    assert.deepEqual(data.quotes,current.quotes,'existing daily candles restore yesterday close on later-day migration');
    assert.deepEqual((await history('day')).points,today.points);assert.equal(data.asOf,current.asOf);
    const revision=data.revision;await get('/__tick');assert.equal((await market()).revision,revision,'duplicate cron does not reset the baseline');
    now+=HOUR;sample=.999999999;await restart();await get('/__tick');data=await market();
    assert.equal(data.quotes[1].price,119);assert.equal(data.quotes[1].previous,121);assert.equal(data.quotes[1].change,-2);assert.equal(data.quotes[1].percent,-1.65);
    const book=await(await get('/orderbook?symbol=en-joy')).json();
    assert.equal(book.previous,121);assert.equal(book.price,119);assert.equal(book.tradingEnabled,false);
    assert.equal((await get('/orders',{method:'POST',body:'{}'})).status,423);
    const beforeCadence=structuredClone(data),candlesBefore=await history('day');
    await get('/__hourly_interval');now=Date.parse('2026-10-21T17:45:00Z');await restart();
    data=await market();assert.equal(data.updateIntervalMs,1800000);assert.equal(data.nextUpdateAt,Date.parse('2026-10-21T18:00:00Z'));
    assert.deepEqual(data.quotes,beforeCadence.quotes);assert.equal(data.asOf,beforeCadence.asOf);assert.equal(data.stale,false);
    assert.deepEqual((await history('day')).points,candlesBefore.points,'cadence migration does not add imaginary past half-hour prices');
    const migratedRevision=data.revision;await restart();assert.equal((await market()).revision,migratedRevision);
    sample=.5;now=Date.parse('2026-10-21T18:00:01Z');await restart();await get('/__tick');data=await market();
    assert.equal(data.revision,migratedRevision+1);assert.equal(data.asOf,Date.parse('2026-10-21T18:00:00Z'));
    assert.equal((await history('day')).points.length,candlesBefore.points.length+1);
    let signals=await(await get('/vlog/status')).json();assert.equal(signals.lastDrivers.uploads,1,'an unconsumed old upload is rescheduled, not lost during cadence migration');
    await get('/__tick');assert.equal((await market()).revision,data.revision);
    now+=HOUR;await restart();await get('/__tick');signals=await(await get('/vlog/status')).json();assert.equal(signals.lastDrivers.uploads,0,'the old upload cannot apply twice');
  }finally{await mf.dispose();fs.rmSync(persist,{recursive:true,force:true});}
});
