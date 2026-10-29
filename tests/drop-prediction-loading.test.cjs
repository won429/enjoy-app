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
 const context=vm.createContext({window,document,URL,AbortSignal,Intl,fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),setInterval:()=>1,clearInterval(){}});
 vm.runInContext(loadingSource,context);
 const gate=window.enjoyAppLoading;
 function readyOthers(){for(const source of ['profile','members','meeting','schedule','drop','community','notice'])gate.ready(source);gate.paint();}
 gate.begin(window.enjoyUser);if(local)gate.local();readyOthers();
 vm.runInContext(predictionSource,context);
 function paint(){for(let i=0;frames.length&&i<10;i++)frames.splice(0).forEach(fn=>fn());}
 function rebegin(next=uid){window.enjoyUser=next?{uid:next}:null;window.meetingAuthed=!!next;gate.begin(window.enjoyUser);readyOthers();window.EnjoyDropPrediction.connect();}
 function resolve(index,posts=[]){requests[index].resolve({ok:true,json:async()=>({posts,serverNow:Date.now()})});}
 return{window,gate,loader,box,requests,renders,paint,rebegin,resolve};
}
const post=id=>({_id:id,title:'승리 예측',status:'pending',game:{date:'2026-10-29',time:'18:30',team1:'삼성',team2:'KIA'},startsAt:0,closesAt:1,revealAt:2,publishStart:0,publishEnd:Date.now()+60000,reward:5000,penalty:2500,participants:[]});

test('home remains covered until prediction response is rendered, including a genuinely empty feed',async()=>{
 for(const posts of [[],[post('first')]]){
  const ui=setup();await flush();ui.paint();
  assert.equal(ui.requests.length,1);assert.match(ui.requests[0].url,/\/feed$/);assert.equal(ui.requests[0].options.method,'GET');
  assert.equal(ui.gate.snapshot().states.prediction,'pending');assert.notEqual(ui.loader.style.display,'none');
  ui.resolve(0,posts);await flush();
  assert.equal(ui.gate.snapshot().states.prediction,'ready');assert.equal(ui.renders.at(-1).count,posts.length);
  assert.equal(ui.renders.at(-1).completed,false,'the first prediction card renders before the overlay is released');
  ui.paint();assert.equal(ui.loader.style.display,'none');
 }
});

test('failed or timed-out prediction reads show initial error until a successful retry',async()=>{
 const ui=setup();await flush();ui.requests[0].reject(Object.assign(Error('timeout'),{name:'TimeoutError'}));await flush();ui.paint();
 assert.equal(ui.gate.snapshot().states.prediction,'error');assert.equal(ui.loader.dataset.state,'error');assert.equal(ui.box.hidden,false);
 assert.notEqual(ui.loader.style.display,'none');
 const retry=ui.window.EnjoyDropPrediction.refresh(true);await flush();ui.resolve(1,[]);await retry;ui.paint();
 assert.equal(ui.loader.style.display,'none');assert.equal(ui.window._dropPredictionError,'');
});

test('old responses cannot finish another account or a new session for the same account',async()=>{
 for(const next of ['b','a']){
  const ui=setup();await flush();const old=ui.gate.snapshot().version;
  ui.rebegin(next);await flush();assert.equal(ui.requests.length,2);assert.ok(ui.gate.snapshot().version>old);
  ui.resolve(0,[post('old')]);await flush();ui.paint();
  assert.equal(ui.gate.snapshot().states.prediction,'pending');assert.equal(ui.window._dropPredictions.length,0);
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
