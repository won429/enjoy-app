const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const loadingSource=fs.readFileSync(path.join(__dirname,'../app-loading.js'),'utf8');
const predictionSource=fs.readFileSync(path.join(__dirname,'../drop-prediction.js'),'utf8');
const flush=()=>new Promise(setImmediate);
function setup({uid='a',local=false}={}){
 const frames=[],requests=[],renders=[],timers=new Map();let timerId=0;
 const box={hidden:true},message={textContent:''},retry={addEventListener(){}};
 const loader={style:{},dataset:{},setAttribute(){},querySelector:s=>s==='.app-loading-error'?box:s==='[data-app-loading-message]'?message:retry};
 const document={hidden:false,getElementById:id=>id==='app-loader'?loader:null,querySelectorAll:()=>[],addEventListener(){}};
 const window={document,meetingAuthed:!!uid,enjoyUser:uid?{uid}:null,enjoyIsLocalGuest:()=>local,addEventListener(){},
  getEnjoyIdToken:async()=> 'fixture-token',requestAnimationFrame(fn){frames.push(fn);},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  renderDropFeed(){renders.push({count:window._dropPredictions?.length||0,completed:window.enjoyAppLoading.snapshot().completed});}};
 const context=vm.createContext({window,document,URL,AbortSignal,Intl,AbortController,fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),setInterval:()=>1,clearInterval(){}});
 vm.runInContext(loadingSource,context);
 const gate=window.enjoyAppLoading;
 function readyOthers(){for(const source of ['profile','members','meeting','schedule','drop','community','notice'])gate.ready(source);gate.paint();}
 gate.begin(window.enjoyUser);if(local)gate.local();readyOthers();
 vm.runInContext(predictionSource,context);
 function paint(){for(let i=0;frames.length&&i<10;i++)frames.splice(0).forEach(fn=>fn());}
 function rebegin(next=uid){window.enjoyUser=next?{uid:next}:null;window.meetingAuthed=!!next;gate.begin(window.enjoyUser);readyOthers();window.EnjoyDropPrediction.connect();}
 function resolve(index,posts=[]){requests[index].resolve({ok:true,json:async()=>({posts,serverNow:Date.now()})});}
 return{window,gate,loader,box,requests,renders,paint,rebegin,resolve,timers};
}
const post=id=>({_id:id,title:'승리 예측',status:'pending',game:{date:'2026-10-29',time:'18:30',team1:'삼성',team2:'KIA'},startsAt:0,closesAt:1,revealAt:2,publishStart:0,publishEnd:Date.now()+60000,reward:5000,penalty:2500,participants:[]});

test('home opens while prediction stays pending in its own region, including a genuinely empty feed',async()=>{
 for(const posts of [[],[post('first')]]){
  const ui=setup();await flush();ui.paint();
  assert.equal(ui.requests.length,1);assert.match(ui.requests[0].url,/\/feed$/);assert.equal(ui.requests[0].options.method,'GET');
  assert.equal(ui.gate.snapshot().states.prediction,'retrying');assert.equal(ui.loader.style.display,'none');
  assert.equal(require('../home-loading.js').view(ui.gate.snapshot(),['drop','community','prediction']).ready,false);
  ui.resolve(0,posts);await flush();
  assert.equal(ui.gate.snapshot().states.prediction,'ready');assert.equal(ui.renders.at(-1).count,posts.length);
  assert.equal(ui.renders.at(-1).completed,true,'the authenticated home remains accessible while its feed waits');
  ui.paint();assert.equal(ui.loader.style.display,'none');
 }
});

test('transient prediction failure retries locally and manual retry succeeds without reopening global loading',async()=>{
 const ui=setup();await flush();ui.requests[0].reject(Object.assign(Error('timeout'),{name:'TimeoutError'}));await flush();ui.paint();
 assert.equal(ui.gate.snapshot().states.prediction,'retrying');assert.equal(ui.loader.dataset.state,'hidden');assert.equal(ui.box.hidden,true);
 const retry=ui.window.EnjoyDropPrediction.refresh(true,true);await flush();ui.resolve(1,[]);await retry;ui.paint();
 assert.equal(ui.loader.style.display,'none');assert.equal(ui.window._dropPredictionError,'');
});

test('old responses cannot finish another account or a new session for the same account',async()=>{
 for(const next of ['b','a']){
  const ui=setup();await flush();const old=ui.gate.snapshot().version;
  ui.rebegin(next);await flush();assert.equal(ui.requests.length,2);assert.ok(ui.gate.snapshot().version>old);
  ui.resolve(0,[post('old')]);await flush();ui.paint();
  assert.equal(ui.gate.snapshot().states.prediction,'retrying');assert.equal(ui.window._dropPredictions.length,0);
  ui.resolve(1,[post('new')]);await flush();ui.paint();
  assert.equal(ui.window._dropPredictions[0]._id,'new');assert.equal(ui.loader.style.display,'none');
 }
});

test('background feed refresh failures never bring the completed home skeleton back',async()=>{
 const ui=setup();await flush();ui.resolve(0,[post('first')]);await flush();ui.paint();
 const refresh=ui.window.EnjoyDropPrediction.refresh(true);await flush();ui.requests[1].reject(Error('offline'));await refresh;ui.paint();
 assert.equal(ui.loader.style.display,'none');assert.equal(ui.gate.snapshot().completed,true);
 assert.equal(ui.window._dropPredictions[0]._id,'first');assert.match(ui.window._dropPredictionError,/offline/);
});

test('public guests and local profiles do not wait for or request the member prediction feed',async()=>{
 for(const options of [{uid:null},{uid:'local-user',local:true}]){
  const ui=setup(options);await flush();ui.paint();
  assert.equal(ui.requests.length,0);assert.equal(ui.loader.style.display,'none');assert.equal(ui.gate.snapshot().states.prediction,undefined);
 }
});

test('feed automatic retries stop after two retries and manual source retry recovers without restarting other sources',async()=>{
 const ui=setup();await flush();ui.paint();
 for(let i=0;i<3;i++){
  ui.requests[i].reject(Object.assign(Error('unavailable'),{status:503}));await flush();
  if(i<2){const pair=[...ui.timers].find(([,value])=>value.ms===(i+1)*1000);assert.ok(pair);ui.timers.delete(pair[0]);pair[1].fn();await flush();}
 }
 assert.equal(ui.requests.length,3);assert.equal(ui.gate.snapshot().states.prediction,'error');assert.equal(ui.loader.style.display,'none');
 ui.gate.retry('prediction');await flush();assert.equal(ui.requests.length,4);ui.resolve(3,[post('recovered')]);await flush();
 assert.equal(ui.gate.snapshot().states.prediction,'ready');assert.equal(ui.window._dropPredictions[0]._id,'recovered');
});
test('manual retry aborts an in-flight feed and late completion cannot replace the newer result',async()=>{
 const ui=setup();await flush();const oldSignal=ui.requests[0].options.signal;ui.gate.retry('prediction');await flush();
 assert.equal(oldSignal.aborted,true);assert.equal(ui.requests.length,2);
 ui.resolve(1,[post('current')]);await flush();ui.resolve(0,[post('obsolete')]);await flush();
 assert.equal(ui.window._dropPredictions[0]._id,'current');assert.equal(ui.gate.snapshot().states.prediction,'ready');
});
test('permission errors do not auto-loop and do not turn the whole site into an error',async()=>{
 const ui=setup();await flush();ui.paint();ui.requests[0].resolve({ok:false,status:403,json:async()=>({error:'not authorized'})});await flush();
 assert.equal(ui.gate.snapshot().states.prediction,'error');assert.equal(ui.loader.style.display,'none');
 assert.equal([...ui.timers.values()].some(t=>t.ms===1000),false);
});
test('a stalled token lookup is bounded by the feed timeout and does not trap either loading or manual retry',async()=>{
 const ui=setup();ui.window.getEnjoyIdToken=()=>new Promise(()=>{});await flush();ui.paint();assert.equal(ui.requests.length,0);
 const timeout=[...ui.timers].find(([,t])=>t.ms===15000);assert.ok(timeout);ui.timers.delete(timeout[0]);timeout[1].fn();await flush();
 assert.equal(ui.gate.snapshot().states.prediction,'retrying');assert.equal(ui.loader.style.display,'none');
 ui.window.getEnjoyIdToken=async()=> 'recovered-token';ui.gate.retry('prediction');await flush();assert.equal(ui.requests.length,1);
 ui.resolve(0,[]);await flush();assert.equal(ui.gate.snapshot().states.prediction,'ready');
});
