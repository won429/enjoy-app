const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app-loading.js'),'utf8');
const sources=['members','meeting','schedule','drop','community','notice'];
function setup(){
  const timers=new Map(),frames=[],subs=new Map(),errors=[],applied=[];let next=0,reloads=0;
  const box={hidden:true},message={textContent:''},retry={addEventListener(type,fn){this.click=fn;}};
  const loader={dataset:{},style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},querySelector(s){return s==='.app-loading-error'?box:s==='[data-app-loading-message]'?message:retry;}};
  const window={document:{getElementById:id=>id==='app-loader'?loader:null},location:{reload(){reloads++;}},requestAnimationFrame(fn){frames.push(fn);},
    setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    fsOnSnapshot(ref,options,receive,error){if(typeof options==='function'){error=receive;receive=options;options=null;}subs.set(ref,{options,receive,error});return()=>{};}};
  vm.runInNewContext(source,{window});
  const gate=window.enjoyAppLoading;
  function begin(uid='a',predictionReady=true){window.enjoyUser=uid?{uid}:null;gate.begin(window.enjoyUser);gate.paint();if(uid&&predictionReady)gate.ready('prediction');}
  function watch(){sources.forEach(key=>window.enjoyInitialSnapshot(key,key,snap=>applied.push({key,snap}),error=>errors.push(error)));}
  function send(key,fromCache=false,hasPendingWrites=false){subs.get(key).receive({metadata:{fromCache,hasPendingWrites},data:()=>({key})});}
  function paint(){for(let limit=0;frames.length&&limit<10;limit++){const fns=frames.splice(0);fns.forEach(fn=>fn());}}
  return{window,gate,loader,box,message,retry,timers,frames,subs,errors,applied,begin,watch,send,paint,reloads:()=>reloads};
}
test('legacy finish calls cannot skip auth or partially received initial data',()=>{
  const ui=setup();ui.window.enjoyFinishAppLoading();ui.paint();assert.notEqual(ui.loader.style.display,'none');
  ui.begin();ui.watch();ui.gate.ready('profile');ui.paint();
  ui.send('meeting');ui.send('schedule');ui.window.enjoyFinishAppLoading();ui.paint();
  assert.notEqual(ui.loader.style.display,'none');assert.equal(ui.gate.snapshot().completed,false);
  ['members','drop','community','notice'].forEach(key=>ui.send(key));
  assert.notEqual(ui.loader.style.display,'none','the final data still needs a rendered frame');ui.paint();
  assert.equal(ui.loader.style.display,'none');assert.equal(ui.loader.attributes['aria-busy'],'false');assert.equal(ui.timers.size,0);
});
test('cache-only and optimistic snapshots never count as current server reads; metadata-only acknowledgments do',()=>{
  const ui=setup();ui.begin();ui.watch();ui.gate.ready('profile');ui.paint();
  sources.forEach(key=>{assert.equal(ui.subs.get(key).options.includeMetadataChanges,true);ui.send(key,true);});ui.paint();
  assert.equal(ui.applied.length,6);assert.notEqual(ui.loader.style.display,'none');
  sources.forEach(key=>ui.send(key,false,true));ui.paint();assert.notEqual(ui.loader.style.display,'none');
  sources.forEach(key=>ui.send(key));ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('a failed or timed out initial source stays an error and may recover only with actual readiness',()=>{
  const ui=setup();ui.begin();ui.watch();ui.gate.ready('profile');sources.filter(k=>k!=='drop').forEach(k=>ui.send(k));ui.paint();
  ui.subs.get('drop').error(Error('offline'));ui.window.enjoyFinishAppLoading();ui.paint();
  assert.equal(ui.loader.dataset.state,'error');assert.equal(ui.box.hidden,false);assert.notEqual(ui.loader.style.display,'none');
  assert.equal(ui.gate.snapshot().states.drop,'error');ui.send('drop');ui.paint();assert.equal(ui.loader.style.display,'none');
  const pending=setup();[...pending.timers.values()][0].fn();assert.equal(pending.loader.dataset.state,'error');assert.match(pending.message.textContent,/로그인 상태/);
  pending.window.enjoyFinishAppLoading();pending.paint();assert.notEqual(pending.loader.style.display,'none');pending.retry.click();assert.equal(pending.reloads(),1);
});
test('late callbacks and paint frames from an old account cannot unlock or overwrite the next account',()=>{
  const ui=setup();ui.begin('a');ui.watch();const old=ui.subs.get('members');ui.gate.ready('profile');
  ui.begin('b');ui.watch();const before=ui.applied.length;old.receive({metadata:{fromCache:false},data:()=>({owner:'a'})});ui.paint();
  assert.equal(ui.applied.length,before);assert.equal(ui.gate.snapshot().states.members,'pending');
  sources.forEach(k=>ui.send(k));ui.gate.ready('profile');ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('an undecided guest attempt cannot dismiss loading; a confirmed guest renders without member-only subscriptions',()=>{
  const ui=setup();ui.gate.local();ui.window.enjoyFinishAppLoading();ui.paint();assert.notEqual(ui.loader.style.display,'none');
  ui.begin(null);ui.gate.local();ui.paint();assert.equal(ui.loader.style.display,'none');assert.equal(ui.gate.snapshot().mode,'public');
  const failed=setup();failed.window.enjoyAuthInitFailed=true;failed.gate.fail('auth');failed.gate.local();failed.paint();assert.equal(failed.loader.dataset.state,'error');
});
test('confirmed local profiles use local data without inventing server confirmations or breaking the guest adapter signature',()=>{
  const ui=setup();ui.begin('special');ui.gate.local();ui.paint();assert.equal(ui.loader.style.display,'none');assert.equal(ui.gate.snapshot().mode,'local');
  const guest=setup();guest.begin(null);guest.window.enjoyIsLocalGuest=()=>true;guest.window.enjoyInitialSnapshot('members','local',()=>{});
  assert.equal(guest.subs.get('local').options,null);
});
test('renderer failures are an explicit failure and background failures do not resurrect a completed overlay',()=>{
  const ui=setup();ui.begin();ui.watch();ui.window.enjoyInitialSnapshot('members','broken',()=>{throw Error('render failed');});
  ui.subs.get('broken').receive({metadata:{fromCache:false}});assert.equal(ui.gate.snapshot().states.members,'error');
  ui.gate.ready('profile');sources.forEach(k=>ui.send(k));ui.paint();assert.equal(ui.loader.style.display,'none');
  ui.subs.get('drop').error(Error('offline after first load'));ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('entry fallback with a readiness gate cannot silently finish an unresolved session as a guest',()=>{
  const ui=setup(),handlers={},selected=[];
  ui.window.addEventListener=(name,fn)=>{handlers[name]=fn;};ui.window.selectHomeTab=tab=>selected.push(tab);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../home-entry.js'),'utf8'),{window:ui.window,console});
  const timer=[...ui.timers.values()].find(x=>x.ms===12000);timer.fn();ui.paint();assert.equal(ui.loader.dataset.state,'error');assert.equal(selected.length,0);
  ui.begin();ui.window.enjoyAuthResolved=true;handlers['enjoy-auth-ready']();ui.watch();ui.gate.ready('profile');sources.forEach(k=>ui.send(k));ui.paint();
  assert.deepEqual(selected,['home']);assert.equal(ui.loader.style.display,'none');
});

test('the actual Firebase startup waits for server-confirmed members, feeds and both account streams',async()=>{
  const ui=setup(),handlers={},streams=new Map(),settled=[],selected=[];let authCallback;
  ui.window.addEventListener=(name,fn)=>{(handlers[name]||=[]).push(fn);};
  ui.window.dispatchEvent=event=>(handlers[event.type]||[]).forEach(fn=>fn(event));
  ui.window.selectHomeTab=tab=>selected.push(tab);
  ui.window.localStorage={setItem(){}};
  ui.window.enjoyWalletLoading={reset(){},settle(key){settled.push(key);}};
  ui.window.clearAndroidTimetable=()=>{};
  ui.window.updateMeetingUI=()=>{};
  ui.window.renderCalendar=()=>{};
  ui.window.renderEnjoyToday=()=>{};
  ui.window.enjoyResetMemberSync=()=>{};
  ui.window.enjoyCommunityOnAuth=()=>ui.window.enjoyInitialSnapshot('community','community_posts',()=>{});
  ui.window.enjoyDropOnAuth=()=>ui.window.enjoyInitialSnapshot('drop','drop_posts',()=>{});
  ui.window.enjoyOnLogin=async()=>{ui.window.enjoyEnableSync();ui.window.enjoyInitialSnapshot('members','members',()=>{});return true;};
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const raw=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('async function initializeFirebaseApp()'));
  const sdk={};for(const item of raw.matchAll(/import\s*\{([^}]+)\}/g))for(const name of item[1].split(',').map(x=>x.trim()))sdk[name]=()=>{};
  Object.assign(sdk,{getApps:()=>[],initializeApp:()=>({}),getAuth:()=>({currentUser:{uid:'a',getIdToken:async()=> 'fixture-token'}}),getFirestore:()=>({}),
    setPersistence:async()=>{},onAuthStateChanged(auth,fn){authCallback=fn;},doc:(db,...parts)=>parts.join('/'),collection:(db,...parts)=>parts.join('/'),
    getDoc:async()=>({exists:()=>false}),onSnapshot(reference,options,receive,error){assert.equal(options.includeMetadataChanges,true);streams.set(reference,{receive,error});return()=>{};}});
  let resolvePredictions;
  ui.window.getEnjoyIdToken=async()=> 'fixture-token';
  ui.window.document.addEventListener=()=>{};
  ui.window.document.querySelectorAll=()=>[];
  const predictionFetch=()=>new Promise(resolve=>{resolvePredictions=()=>resolve({ok:true,json:async()=>({posts:[],serverNow:Date.now()})});});
  const CustomEvent=class{constructor(type){this.type=type;}};
  const context=vm.createContext({window:ui.window,document:ui.window.document,localStorage:ui.window.localStorage,CustomEvent,console:{warn(){},error(){}},fetch:predictionFetch,AbortSignal,URL,setInterval:()=>1,clearInterval(){},...sdk});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../home-entry.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../drop-prediction.js'),'utf8'),context);
  vm.runInContext(raw.replace(/^\s*import[^\n]+\n/gm,''),context);
  await new Promise(setImmediate);await authCallback({uid:'a',displayName:'테스트'});
  assert.deepEqual(selected,['home']);
  for(const stream of streams.values())stream.receive({exists:()=>true,data:()=>({}),metadata:{fromCache:true,hasPendingWrites:false}});
  ui.paint();assert.notEqual(ui.loader.style.display,'none');assert.equal(ui.window.__enjoyTodayDataReady,false);assert.equal(settled.length,0);
  const pending=streams.get('drop_posts');
  for(const [key,stream]of streams)if(key!=='drop_posts')stream.receive({exists:()=>true,data:()=>({}),metadata:{fromCache:false,hasPendingWrites:false}});
  ui.paint();assert.notEqual(ui.loader.style.display,'none','meeting/schedule cannot dismiss an unfinished home feed');
  assert.equal(ui.window.__enjoyTodayDataReady,true);assert.deepEqual(settled,['meeting','schedule']);
  pending.receive({metadata:{fromCache:false,hasPendingWrites:false}});ui.paint();
  assert.notEqual(ui.loader.style.display,'none','the initial prediction REST read must also finish');
  assert.equal(ui.gate.snapshot().states.prediction,'pending');
  resolvePredictions();await new Promise(setImmediate);ui.paint();assert.equal(ui.loader.style.display,'none');
  assert.equal(ui.gate.snapshot().states.prediction,'ready');
});

test('profile classification uses the server document rather than a possibly stale cached membership',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const start=html.indexOf('        async function loadMyName() {'),end=html.indexOf('        async function takenNames()',start);
  let exists=true,reads=0;
  const window={enjoyUser:{uid:'a'},fsDoc:(...parts)=>parts.join('/'),getDoc(){assert.fail('cached profile must not decide initial membership');},
    async fsGetDocFromServer(ref){assert.equal(ref,'members/a');reads++;return{exists:()=>exists,data:()=>({name:'성원제'})};}};
  const read=vm.runInNewContext(html.slice(start,end)+'\nloadMyName;',{window});
  assert.equal(await read(),'성원제');exists=false;assert.equal(await read(),null);assert.equal(reads,2);
});


test('prediction must settle even after every Firebase source and the first home frame is ready',()=>{
 const ui=setup();ui.begin('a',false);ui.watch();ui.gate.ready('profile');sources.forEach(k=>ui.send(k));ui.paint();
 assert.notEqual(ui.loader.style.display,'none');assert.equal(ui.gate.snapshot().states.prediction,'pending');
 ui.gate.fail('prediction');ui.paint();assert.equal(ui.loader.dataset.state,'error');assert.equal(ui.box.hidden,false);
 ui.gate.ready('prediction');ui.paint();assert.equal(ui.loader.style.display,'none');
});

test('an old prediction failure or success cannot settle a newer loading session',()=>{
 const ui=setup();ui.begin('a',false);const oldVersion=ui.gate.snapshot().version;ui.begin('b',false);
 ui.gate.fail('prediction',oldVersion);ui.gate.ready('prediction',oldVersion);
 assert.equal(ui.gate.snapshot().states.prediction,'pending');assert.equal(ui.loader.dataset.state,'loading');
});


test('the global deadline and explicit failure signal include a still-pending prediction read',()=>{
 const ui=setup();ui.begin('a',false);ui.watch();ui.gate.ready('profile');sources.forEach(k=>ui.send(k));ui.paint();
 [...ui.timers.values()].find(timer=>timer.ms===20000).fn();ui.paint();
 assert.equal(ui.gate.snapshot().states.prediction,'error');assert.equal(ui.loader.dataset.state,'error');assert.notEqual(ui.loader.style.display,'none');
 ui.begin('b',false);ui.window.enjoyCancelAppLoading();ui.paint();
 assert.equal(ui.gate.snapshot().states.prediction,'error');assert.equal(Object.values(ui.gate.snapshot().states).includes('pending'),false);
});
