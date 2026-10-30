const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app-loading.js'),'utf8');
const {view}=require('../home-loading.js');
const sources=['members','meeting','schedule','drop','community','notice'];
function setup(){
 const timers=new Map(),frames=[],subs=new Map(),errors=[],applied=[],handlers={},history=[];let next=0,reloads=0;
 const box={hidden:true},message={textContent:''},title={textContent:''},retry={addEventListener(type,fn){this.click=fn;}};
 const loader={dataset:{},style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},querySelector(s){return s==='.app-loading-error'?box:s==='[data-app-loading-message]'?message:s==='[data-app-loading-title]'?title:retry;}};
 const window={document:{hidden:false,getElementById:id=>id==='app-loader'?loader:null,addEventListener(type,fn){handlers[type]=fn;}},location:{reload(){reloads++;}},requestAnimationFrame(fn){frames.push(fn);},
  addEventListener(type,fn){handlers[type]=fn;},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  fsOnSnapshot(ref,options,receive,error){if(typeof options==='function'){error=receive;receive=options;options=null;}const s={ref,options,receive,error,stopped:false};subs.set(ref,s);history.push(s);return()=>{s.stopped=true;};}};
 vm.runInNewContext(source,{window});const gate=window.enjoyAppLoading;
 function begin(uid='a'){window.enjoyUser=uid?{uid}:null;gate.begin(window.enjoyUser);gate.paint();}
 function watch(){sources.forEach(key=>window.enjoyInitialSnapshot(key,key,snap=>applied.push({key,snap}),error=>errors.push(error)));}
 function send(key,fromCache=false,hasPendingWrites=false){subs.get(key).receive({metadata:{fromCache,hasPendingWrites},data:()=>({key})});}
 function paint(){for(let limit=0;frames.length&&limit<10;limit++)frames.splice(0).forEach(fn=>fn());}
 function tick(ms){const pair=[...timers].find(([,t])=>t.ms===ms);assert.ok(pair,'timer '+ms);timers.delete(pair[0]);pair[1].fn();}
 return{window,gate,loader,box,message,title,retry,timers,frames,subs,errors,applied,history,handlers,begin,watch,send,paint,tick,reloads:()=>reloads};
}
test('home opens only after verified identity and a painted frame; optional services cannot hold the whole site',()=>{
 const ui=setup();ui.window.enjoyFinishAppLoading();ui.paint();assert.notEqual(ui.loader.style.display,'none');
 ui.begin();ui.watch();ui.paint();assert.notEqual(ui.loader.style.display,'none');
 ui.gate.ready('profile');assert.notEqual(ui.loader.style.display,'none');ui.paint();assert.equal(ui.loader.style.display,'none');
 assert.equal(ui.gate.snapshot().states.drop,'pending');assert.equal(ui.gate.snapshot().states.prediction,'pending');
 assert.equal(view(ui.gate.snapshot(),['drop','community','prediction']).ready,false);
 ui.gate.fail('prediction');ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('cached and optimistic snapshots cannot release the local feed placeholder; server metadata confirms even empty data',()=>{
 const ui=setup();ui.begin();ui.watch();ui.gate.ready('profile');ui.paint();
 sources.forEach(key=>{assert.equal(ui.subs.get(key).options.includeMetadataChanges,true);ui.send(key,true);});
 assert.equal(ui.applied.length,6);assert.equal(view(ui.gate.snapshot(),['drop','community','prediction']).ready,false);
 sources.forEach(key=>ui.send(key,false,true));ui.gate.ready('prediction');assert.equal(view(ui.gate.snapshot(),['drop','community','prediction']).ready,false);
 sources.forEach(key=>ui.send(key));assert.equal(view(ui.gate.snapshot(),['drop','community','prediction']).ready,true);
});
test('transient snapshot failures retry just the failed source, retain session, and recover without a page reload',()=>{
 const ui=setup();ui.begin();ui.watch();ui.gate.ready('profile');ui.paint();const untouched=ui.subs.get('community');
 const old=ui.subs.get('drop');old.error(Object.assign(Error('offline'),{code:'unavailable'}));
 assert.equal(ui.gate.snapshot().states.drop,'retrying');assert.equal(ui.errors.length,0);ui.tick(1000);
 assert.equal(old.stopped,true);assert.equal(ui.subs.get('community'),untouched);assert.notEqual(ui.subs.get('drop'),old);
 const count=ui.applied.length;old.receive({metadata:{fromCache:false}});assert.equal(ui.applied.length,count);
 ui.send('drop');assert.equal(ui.gate.snapshot().states.drop,'ready');assert.equal(ui.reloads(),0);assert.equal(ui.loader.style.display,'none');
});
test('permission errors remain local, do not loop, and manual retry reconnects only that source',()=>{
 const ui=setup();ui.begin();ui.watch();ui.gate.ready('profile');ui.paint();
 ui.subs.get('drop').error(Object.assign(Error('denied'),{code:'permission-denied'}));
 assert.equal(ui.gate.snapshot().states.drop,'error');assert.equal(ui.errors.length,1);
 assert.equal([...ui.timers.values()].some(t=>t.ms===1000),false);
 const other=ui.subs.get('community');ui.gate.retry('drop');assert.equal(ui.gate.snapshot().states.drop,'retrying');
 ui.send('drop');assert.equal(ui.gate.snapshot().states.drop,'ready');assert.equal(ui.subs.get('community'),other);assert.equal(ui.reloads(),0);
});
test('automatic retry is bounded; online recovery and explicit retry recover an exhausted listener',()=>{
 const ui=setup();ui.begin();ui.watch();
 for(const wait of [1000,2000]){ui.subs.get('drop').error(Error('offline'));ui.tick(wait);}
 ui.subs.get('drop').error(Error('offline'));assert.equal(ui.gate.snapshot().states.drop,'error');assert.equal(ui.errors.length,1);
 const count=ui.history.length;ui.handlers.online();assert.equal(ui.history.length,count+1);ui.send('drop');assert.equal(ui.gate.snapshot().states.drop,'ready');
});
test('20 seconds means slow identity verification, not fabricated failure or an anonymous fallback',()=>{
 const ui=setup();ui.begin();ui.tick(20000);assert.equal(ui.loader.dataset.state,'slow');assert.match(ui.message.textContent,/회원 정보/);
 assert.equal(ui.gate.snapshot().states.profile,'slow');assert.equal(ui.gate.snapshot().states.prediction,'pending');
 let wakes=0;ui.window.enjoyRetryMemberProfile=()=>wakes++;ui.retry.click();assert.equal(wakes,1);assert.equal(ui.reloads(),0);
 ui.gate.ready('profile');ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('essential permission failures are explicit, named and recover only after actual profile success',()=>{
 const ui=setup();ui.begin();ui.gate.report('profile',{code:'permission-denied',message:'denied'});ui.paint();
 assert.equal(ui.loader.dataset.state,'error');assert.match(ui.message.textContent,/회원 정보/);

 const auth=setup();auth.window.enjoyAuthInitFailed=true;auth.gate.fail('auth');auth.gate.local();auth.paint();assert.equal(auth.loader.dataset.state,'error');
 ui.gate.ready('profile');ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('old accounts, aborted listeners, pending paints and scheduled retries cannot overwrite the new session',()=>{
 const ui=setup();ui.begin('a');ui.watch();const old=ui.subs.get('drop'),generation=ui.gate.snapshot().version;
 old.error(Error('offline'));ui.gate.ready('profile');ui.begin('b');ui.watch();
 assert.equal(old.stopped,true);const count=ui.applied.length;old.receive({metadata:{fromCache:false}});ui.gate.ready('profile',generation);ui.gate.fail('prediction',generation);ui.paint();
 assert.equal(ui.applied.length,count);assert.equal(ui.gate.snapshot().states.profile,'pending');assert.equal(ui.gate.snapshot().states.prediction,'pending');
 assert.equal([...ui.timers.values()].some(t=>t.ms===1000),false);ui.gate.ready('profile');ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('guests and classified local profiles never wait on member-only regions or invent server confirmations',()=>{
 const ui=setup();ui.gate.local();ui.paint();assert.notEqual(ui.loader.style.display,'none');
 ui.begin(null);ui.gate.local();ui.paint();assert.equal(ui.loader.style.display,'none');assert.equal(view(ui.gate.snapshot(),['prediction']).ready,true);
 ui.begin('special');ui.gate.local();ui.paint();assert.equal(ui.gate.snapshot().mode,'local');assert.equal(ui.loader.style.display,'none');
 ui.window.enjoyIsLocalGuest=()=>true;ui.window.enjoyInitialSnapshot('members','local',()=>{});assert.equal(ui.subs.get('local').options,null);
});
test('a later refresh failure preserves confirmed content and never resurrects the full screen loader',()=>{
 const ui=setup();ui.begin();ui.watch();ui.gate.ready('profile');sources.forEach(k=>ui.send(k));ui.gate.ready('prediction');ui.paint();
 ui.subs.get('drop').error({code:'permission-denied',message:'lost permission'});
 assert.equal(ui.loader.style.display,'none');assert.equal(view(ui.gate.snapshot(),['drop','community','prediction']).ready,true);
 assert.deepEqual(view(ui.gate.snapshot(),['drop']).failed,['drop']);
});
test('entry fallback waits for auth, shows slow status and never switches unresolved sessions to guests',()=>{
 const ui=setup(),selected=[];ui.window.selectHomeTab=tab=>selected.push(tab);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../home-entry.js'),'utf8'),{window:ui.window,console});
 ui.tick(12000);ui.paint();assert.equal(ui.loader.dataset.state,'slow');assert.equal(selected.length,0);
 ui.begin();ui.window.enjoyAuthResolved=true;ui.handlers['enjoy-auth-ready']();ui.gate.ready('profile');ui.paint();
 assert.deepEqual(selected,['home']);assert.equal(ui.loader.style.display,'none');
});
test('fatal module load failures are real auth errors; only a missing SDK uses the reload fallback',()=>{
 const ui=setup();ui.handlers.error({target:{tagName:'SCRIPT',type:'module'}});assert.equal(ui.loader.dataset.state,'error');
 ui.retry.click();assert.equal(ui.reloads(),1);
 const available=setup();available.window.enjoyAuthInitFailed=true;available.gate.fail('auth');let calls=0;
 available.window.enjoyRetryFirebaseInit=()=>calls++;available.retry.click();assert.equal(calls,1);assert.equal(available.reloads(),0);
});

test('the actual Firebase startup opens after verified profile while slow feeds keep their own readiness states',async()=>{
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
  const context=vm.createContext({window:ui.window,document:ui.window.document,localStorage:ui.window.localStorage,CustomEvent,console:{warn(){},error(){}},fetch:predictionFetch,AbortSignal,AbortController,URL,setInterval:()=>1,clearInterval(){},...sdk});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../home-entry.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../drop-prediction.js'),'utf8'),context);
  vm.runInContext(raw.replace(/^\s*import[^\n]+\n/gm,''),context);
  await new Promise(setImmediate);await authCallback({uid:'a',displayName:'테스트'});
  assert.deepEqual(selected,['home']);
  for(const stream of streams.values())stream.receive({exists:()=>true,data:()=>({}),metadata:{fromCache:true,hasPendingWrites:false}});
  ui.paint();assert.equal(ui.loader.style.display,'none');assert.equal(ui.window.__enjoyTodayDataReady,false);assert.equal(settled.length,0);
  const pending=streams.get('drop_posts');
  for(const [key,stream]of streams)if(key!=='drop_posts')stream.receive({exists:()=>true,data:()=>({}),metadata:{fromCache:false,hasPendingWrites:false}});
  ui.paint();assert.equal(ui.loader.style.display,'none','feeds do not block authenticated home entry');
  assert.equal(ui.window.__enjoyTodayDataReady,true);assert.deepEqual(settled,['meeting','schedule']);
  pending.receive({metadata:{fromCache:false,hasPendingWrites:false}});ui.paint();
  assert.equal(ui.loader.style.display,'none','prediction remains local to its feed region');
  assert.equal(ui.gate.snapshot().states.prediction,'retrying');
  await new Promise(setImmediate);assert.equal(typeof resolvePredictions,'function');resolvePredictions();await new Promise(setImmediate);ui.paint();assert.equal(ui.loader.style.display,'none');
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



test('slow verification remains visibly slow during subsequent transient retries instead of hiding the waiting notice',()=>{
 const ui=setup();ui.begin();ui.tick(20000);ui.gate.report('profile',{code:'unavailable',message:'offline'});
 assert.equal(ui.loader.dataset.state,'slow');assert.equal(ui.box.hidden,false);ui.gate.ready('profile');ui.paint();assert.equal(ui.loader.style.display,'none');
});
test('unchanged live confirmations do not rebuild the home regions or reset open feed UI',()=>{
 const ui=setup();ui.begin();let renders=0;ui.gate.subscribe(()=>renders++);ui.gate.ready('members');const before=renders;
 ui.gate.ready('members');ui.gate.ready('members');assert.equal(renders,before);
});
