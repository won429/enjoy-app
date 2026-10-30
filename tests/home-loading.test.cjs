const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const a=html.indexOf('window.renderDropFeed = function () {'),b=html.indexOf('function prepareDropPhotoVisuals',a);
const renderer=html.slice(a,b),source=name=>fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8');
function setup(){
 const nodes=new Map(),events={},frames=[],timers=new Map();let next=0,reloads=0;
 function element(id){const value={id,dataset:{},attributes:{},innerHTML:'',hidden:false,setAttribute(k,v){this.attributes[k]=v;},before(node){nodes.set(node.id,node);}};if(id)nodes.set(id,value);return value;}
 const box=element(),message=element(),title=element(),retry=element();retry.addEventListener=()=>{};
 const loader=element('app-loader');loader.style={};loader.querySelector=s=>s==='.app-loading-error'?box:s==='[data-app-loading-message]'?message:s==='[data-app-loading-title]'?title:retry;
 const feed=element('drop-feed'),members=element('story-tray'),summary=element('enjoy-assistant');
 members.dataset={homeLoading:'members',homeLoadingShape:'members'};summary.dataset={homeLoading:'meeting schedule',homeLoadingShape:'summary'};
 const document={hidden:false,getElementById:id=>nodes.get(id)||null,querySelectorAll:s=>s==='[data-home-loading]'?[members,summary]:[],createElement:()=>element(),
  addEventListener(name,fn){(events[name]||=[]).push(fn);},querySelector:()=>null};
 const window={document,enjoyUser:{uid:'a'},enjoyDropText:s=>s,location:{reload(){reloads++;}},_dropPosts:[],_communityPosts:[],_dropPredictions:[],
  requestAnimationFrame:fn=>frames.push(fn),setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  addEventListener(){},EnjoyDropPrediction:{card:post=>'<article class="drop-prediction-card">'+post.title+'</article>'}};
 const context=vm.createContext({window,document,Date,
  dropUser:()=>window.enjoyUser,visibleDropPosts:()=>[...window._dropPosts,...window._dropPredictions].sort((a,b)=>b.createdAt-a.createdAt),scheduleDropExpiry(){},
  dropEsc:s=>String(s||''),dropMillis:s=>Number(s)||0,dropPostId:p=>p._id,dropDateTime:()=>'',dropAuthorAvatar:()=>'',dropActionButtonsHtml:()=>'',dropCommentBubblesHtml:()=>'',
  prepareDropPhotoVisuals(){},positionDropCardControls(){}});
 vm.runInContext(source('app-loading.js'),context);vm.runInContext(renderer,context);vm.runInContext(source('home-loading.js'),context);
 const gate=window.enjoyAppLoading;gate.begin(window.enjoyUser);gate.ready('profile');gate.paint();
 function paint(){for(let n=0;frames.length&&n<10;n++)frames.splice(0).forEach(fn=>fn());}paint();
 function readyFeed(){for(const key of ['drop','community','prediction'])gate.ready(key);}
 const photo={_id:'photo',imageUrl:'https://example.invalid/local-fixture.jpg',width:4,height:5,createdAt:100};
 const prediction={_id:'prediction',postType:'prediction',title:'예측 테스트',createdAt:200};
 return{gate,window,feed,members,summary,loader,nodes,events,paint,readyFeed,photo,prediction,reloads:()=>reloads};
}
test('actual feed renderer keeps a local skeleton until every mixed feed source is confirmed, while home is usable',()=>{
 const ui=setup();ui.window._dropPosts=[ui.photo];ui.window._dropPredictions=[ui.prediction];ui.window.renderDropFeed();
 assert.equal(ui.loader.style.display,'none');assert.equal(ui.feed.attributes['aria-busy'],'true');assert.match(ui.feed.innerHTML,/home-sk-feed/);
 assert.doesNotMatch(ui.feed.innerHTML,/첫 번째|예측 테스트|drop-photo-card/);
 ui.gate.ready('drop');ui.gate.ready('community');assert.match(ui.feed.innerHTML,/home-sk-feed/);
 ui.gate.ready('prediction');assert.equal(ui.feed.attributes['aria-busy'],'false');assert.doesNotMatch(ui.feed.innerHTML,/home-sk-feed/);
 assert.ok(ui.feed.innerHTML.indexOf('예측 테스트')<ui.feed.innerHTML.indexOf('data-drop-card-id="photo"'),'preserve existing chronological ordering');
});
test('a feed failure exposes only a local retry; successful retry replaces the placeholder without a page reload',()=>{
 const ui=setup();ui.gate.ready('drop');ui.gate.ready('community');ui.gate.fail('prediction',ui.gate.snapshot().version,{message:'offline'});
 assert.equal(ui.loader.style.display,'none');assert.match(ui.feed.innerHTML,/예측 정보를 불러오지 못했어요/);assert.match(ui.feed.innerHTML,/data-home-loading-retry="prediction"/);
 let called=0;ui.gate.registerRetry('prediction',()=>{called++;ui.gate.pending('prediction');});
 for(const handler of ui.events.click)handler({target:{closest:()=>({dataset:{homeLoadingRetry:'prediction'}})}});
 assert.equal(called,1);assert.equal(ui.reloads(),0);assert.match(ui.feed.innerHTML,/home-sk-feed/);assert.doesNotMatch(ui.feed.innerHTML,/불러오지 못/);
 ui.window._dropPredictions=[ui.prediction];ui.gate.ready('prediction');assert.match(ui.feed.innerHTML,/예측 테스트/);assert.doesNotMatch(ui.feed.innerHTML,/home-sk-feed|다시 연결/);
});
test('empty state appears only after confirmed empty responses, never while a service is pending',()=>{
 const ui=setup();assert.doesNotMatch(ui.feed.innerHTML,/첫 번째 드롭/);ui.readyFeed();assert.match(ui.feed.innerHTML,/첫 번째 드롭/);
});
test('confirmed content remains visible after a later refresh failure and local error offers retry',()=>{
 const ui=setup();ui.window._dropPosts=[ui.photo];ui.window._dropPredictions=[ui.prediction];ui.readyFeed();
 ui.gate.fail('prediction',ui.gate.snapshot().version,{message:'offline'});
 assert.match(ui.feed.innerHTML,/예측 테스트/);assert.match(ui.feed.innerHTML,/data-drop-card-id="photo"/);assert.doesNotMatch(ui.feed.innerHTML,/home-sk-feed/);
 assert.match(ui.feed.innerHTML,/예측 다시 연결/);assert.equal(ui.loader.style.display,'none');
});
test('member list and briefing own independent placeholders and never show cached values as server-confirmed data',()=>{
 const ui=setup();assert.equal(ui.members.dataset.sourcePending,'true');assert.equal(ui.summary.dataset.sourcePending,'true');
 assert.equal(ui.nodes.get('story-tray-loading-region').hidden,false);ui.gate.ready('members');assert.equal(ui.members.dataset.sourcePending,'false');
 assert.equal(ui.nodes.get('story-tray-loading-region').hidden,true);assert.equal(ui.summary.dataset.sourcePending,'true');
 ui.gate.ready('meeting');ui.gate.slow('schedule');assert.match(ui.nodes.get('enjoy-assistant-loading-region').innerHTML,/일정 연결이 평소보다/);
 ui.gate.ready('schedule');assert.equal(ui.summary.dataset.sourcePending,'false');assert.equal(ui.nodes.get('enjoy-assistant-loading-region').hidden,true);
});
