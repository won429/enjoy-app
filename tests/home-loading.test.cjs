const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const a=html.indexOf('window.renderDropFeed = function () {'),b=html.indexOf('function findDropPost',a);
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
 const window={document,enjoyUser:{uid:'a'},enjoyDropText:s=>s,location:{reload(){reloads++;}},_dropPosts:[],_communityPosts:[],
  requestAnimationFrame:fn=>frames.push(fn),setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  addEventListener(){}};
 const context=vm.createContext({window,document,Date,
  dropUser:()=>window.enjoyUser,visibleDropPosts:()=>[...window._dropPosts].sort((a,b)=>b.createdAt-a.createdAt),scheduleDropExpiry(){},
  dropEsc:s=>String(s||''),dropMillis:s=>Number(s)||0,dropPostId:p=>p._id,dropDateTime:()=>'',dropAuthorAvatar:()=>'',dropActionButtonsHtml:()=>'',dropFeedCommentsHtml:()=>''});
 vm.runInContext(source('app-loading.js'),context);vm.runInContext(renderer,context);vm.runInContext(source('home-loading.js'),context);
 const gate=window.enjoyAppLoading;gate.begin(window.enjoyUser);gate.ready('profile');gate.paint();
 function paint(){for(let n=0;frames.length&&n<10;n++)frames.splice(0).forEach(fn=>fn());}paint();
 function readyFeed(){for(const key of ['drop','community'])gate.ready(key);}
 const photo={_id:'photo',imageUrl:'https://example.invalid/local-fixture.jpg',width:4,height:5,createdAt:100};
 const newer={_id:'newer',imageUrl:'https://example.invalid/newer-fixture.jpg',width:4,height:5,createdAt:200};
 return{gate,window,feed,members,summary,loader,nodes,events,paint,readyFeed,photo,newer,reloads:()=>reloads};
}
test('actual feed renderer keeps a local skeleton until every mixed feed source is confirmed, while home is usable',()=>{
 const ui=setup();ui.window._dropPosts=[ui.photo,ui.newer];ui.window.renderDropFeed();
 assert.equal(ui.loader.style.display,'none');assert.equal(ui.feed.attributes['aria-busy'],'true');assert.match(ui.feed.innerHTML,/home-sk-feed/);
 assert.doesNotMatch(ui.feed.innerHTML,/첫 번째|drop-photo-card/);
 ui.gate.ready('drop');assert.match(ui.feed.innerHTML,/home-sk-feed/);
 ui.gate.ready('community');assert.equal(ui.feed.attributes['aria-busy'],'false');assert.doesNotMatch(ui.feed.innerHTML,/home-sk-feed/);
 assert.ok(ui.feed.innerHTML.indexOf('data-drop-card-id="newer"')<ui.feed.innerHTML.indexOf('data-drop-card-id="photo"'),'preserve existing chronological ordering');
});
test('a feed failure exposes only a local retry; successful retry replaces the placeholder without a page reload',()=>{
 const ui=setup();ui.gate.ready('drop');ui.gate.fail('community',ui.gate.snapshot().version,{message:'offline'});
 assert.equal(ui.loader.style.display,'none');assert.match(ui.feed.innerHTML,/글·일정 정보를 불러오지 못했어요/);assert.match(ui.feed.innerHTML,/data-home-loading-retry="community"/);
 let called=0;ui.gate.registerRetry('community',()=>{called++;ui.gate.pending('community');});
 for(const handler of ui.events.click)handler({target:{closest:()=>({dataset:{homeLoadingRetry:'community'}})}});
 assert.equal(called,1);assert.equal(ui.reloads(),0);assert.match(ui.feed.innerHTML,/home-sk-feed/);assert.doesNotMatch(ui.feed.innerHTML,/불러오지 못/);
 ui.window._dropPosts=[ui.newer];ui.gate.ready('community');assert.match(ui.feed.innerHTML,/data-drop-card-id="newer"/);assert.doesNotMatch(ui.feed.innerHTML,/home-sk-feed|다시 연결/);
});
test('empty state appears only after confirmed empty responses, never while a service is pending',()=>{
 const ui=setup();assert.doesNotMatch(ui.feed.innerHTML,/첫 번째 드롭/);ui.readyFeed();assert.match(ui.feed.innerHTML,/첫 번째 드롭/);
});
test('confirmed content remains visible after a later refresh failure and local error offers retry',()=>{
 const ui=setup();ui.window._dropPosts=[ui.photo,ui.newer];ui.readyFeed();
 ui.gate.fail('community',ui.gate.snapshot().version,{message:'offline'});
 assert.match(ui.feed.innerHTML,/data-drop-card-id="newer"/);assert.match(ui.feed.innerHTML,/data-drop-card-id="photo"/);assert.doesNotMatch(ui.feed.innerHTML,/home-sk-feed/);
 assert.match(ui.feed.innerHTML,/글·일정 다시 연결/);assert.equal(ui.loader.style.display,'none');
});
test('member list and briefing own independent placeholders and never show cached values as server-confirmed data',()=>{
 const ui=setup();assert.equal(ui.members.dataset.sourcePending,'true');assert.equal(ui.summary.dataset.sourcePending,'true');
 assert.equal(ui.nodes.get('story-tray-loading-region').hidden,false);ui.gate.ready('members');assert.equal(ui.members.dataset.sourcePending,'false');
 assert.equal(ui.nodes.get('story-tray-loading-region').hidden,true);assert.equal(ui.summary.dataset.sourcePending,'true');
 ui.gate.ready('meeting');ui.gate.slow('schedule');assert.match(ui.nodes.get('enjoy-assistant-loading-region').innerHTML,/일정 연결이 평소보다/);
 ui.gate.ready('schedule');assert.equal(ui.summary.dataset.sourcePending,'false');assert.equal(ui.nodes.get('enjoy-assistant-loading-region').hidden,true);
});

test('the loading feed uses the same post rows and author column as the actual feed', () => {
    const { skeleton } = require('../home-loading.js');
    const markup = skeleton('feed');
    assert.equal((markup.match(/class="drop-feed-row"/g) || []).length, 3);
    assert.equal((markup.match(/home-sk-avatar"><\/span><div class="home-sk-post">/g) || []).length, 3);
    assert.match(markup, /home-sk-media/);
    assert.match(markup, /home-sk-choices/);
});

function scheduleMarkup(text) {
    const start = html.indexOf('function dropScheduleRowsHtml');
    const end = html.indexOf('function dropNoteHtml', start);
    const context = vm.createContext({ dropEsc: text => text.replaceAll('<', '&lt;') });
    vm.runInContext(html.slice(start, end), context);
    return context.dropScheduleRowsHtml(text);
}

test('schedule formatting separates time ranges and Korean times while preserving unstructured lines', () => {
    const schedule = scheduleMarkup('1일차 · 잠실\r\n- 10:00~10:30 집결\n오후 2시 30분 단체 사진\n메모 <입장권>');
    assert.match(schedule, /drop-itinerary-day">1일차 · 잠실/);
    assert.ok(schedule.includes('drop-itinerary-clock">10:00~10:30</span><span class="drop-itinerary-event">집결'));
    assert.ok(schedule.includes('drop-itinerary-clock">오후 2시 30분</span><span class="drop-itinerary-event">단체 사진'));
    assert.equal((schedule.match(/class="drop-itinerary-track"/g) || []).length, 1);
    assert.ok(schedule.includes('drop-itinerary-line">메모 &lt;입장권>'));
});

test('open-ended times keep their wave mark with the clock', () => {
    const markup = scheduleMarkup([
        '10:00~ 집결',
        '오후 2시 30분 ~ 사진 촬영',
        '15:00～자유 일정',
        '16:00~',
        '17:00 ~ 18:00 식사'
    ].join('\n'));
    const clockLabels = Array.from(markup.matchAll(/class="drop-itinerary-clock">([^<]+)<\/span>/g), m => m[1]);
    const events = Array.from(markup.matchAll(/class="drop-itinerary-event">([^<]+)<\/span>/g), m => m[1]);
    assert.deepEqual(clockLabels, ['10:00~', '오후 2시 30분~', '15:00～', '16:00~', '17:00 ~ 18:00']);
    assert.deepEqual(events, ['집결', '사진 촬영', '자유 일정', '식사']);
});
