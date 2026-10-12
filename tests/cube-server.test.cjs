const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{generateKeyPairSync,sign}=require('node:crypto');
const {Miniflare,convertV4MiniflareOptions}=require('../cloudflare-worker/node_modules/miniflare'),esbuild=require('../cloudflare-worker/node_modules/esbuild');
function inbox(ws){const items=[],waits=[];ws.addEventListener('message',e=>{const p=JSON.parse(e.data),i=waits.findIndex(w=>w.match(p));if(i<0)items.push(p);else{const [w]=waits.splice(i,1);clearTimeout(w.timer);w.resolve(p);}});ws.accept();return match=>{const i=items.findIndex(match);if(i>=0)return Promise.resolve(items.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={match,resolve,timer:setTimeout(()=>reject(Error('packet timeout')),8000)};waits.push(w);});};}
test('authenticated Cloudflare rooms synchronize private racks, persist reconnects, reject races and advance offline timeouts',{timeout:60000},async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'cube-test',alg:'RS256',use:'sig'},project='enjoy-meeting-account',origin='https://enjoy-app.pages.dev',encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');let now=Date.now(),reads=0;
 function token(uid,extra={}){const secs=Math.floor(now/1000),body=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({aud:project,iss:'https://securetoken.google.com/'+project,sub:uid,iat:secs,auth_time:secs,exp:secs+3600,firebase:{sign_in_provider:'google.com'},...extra});return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');}
 const bundle=await esbuild.build({entryPoints:[path.resolve(__dirname,'../cloudflare-worker/cube-worker.js')],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
 const persist=fs.mkdtempSync(path.join(os.tmpdir(),'drop-cube-runtime-')),clients=[];
 const options=()=>convertV4MiniflareOptions({modules:true,script:`Date.now=()=>${now};\n`+bundle.outputFiles[0].text+`\nexport class TestRoom extends CubeGameRoom {async fetch(req){if(new URL(req.url).pathname==='/__alarm'){await this.alarm();return Response.json({ok:true});}return super.fetch(req);}}`,compatibilityDate:'2026-08-19',resourcePersistencePath:persist,durableObjects:{CUBE_ROOMS:{className:'TestRoom',useSQLite:true},CUBE_LOBBY:{className:'CubeLobby',useSQLite:true}},bindings:{FIREBASE_PROJECT_ID:project,ALLOWED_ORIGINS:origin},outboundService:async req=>{const u=new URL(req.url);if(u.hostname==='www.googleapis.com')return Response.json({keys:[jwk]});if(u.hostname==='firestore.googleapis.com'){reads++;return Response.json({fields:{name:{stringValue:u.pathname.endsWith('/outsider')?'':u.pathname.split('/').at(-1)}}});}throw Error('unexpected fetch');}});
 let mf=new Miniflare(options());
 async function connect(uid,create=false,auth=token(uid),lobby=false){const response=await mf.dispatchFetch('https://cube.test/rooms'+(lobby?'':'/ABCDEF'),{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(response.status,101);const ws=response.webSocket,next=inbox(ws);clients.push(ws);ws.send(JSON.stringify({type:'hello',token:auth,create}));return {ws,next,snapshot:()=>next(p=>p.type==='snapshot'),send(id,revision,action){ws.send(JSON.stringify({type:'action',id,revision,action}));}};}
 try {
  assert.equal((await mf.dispatchFetch('https://cube.test/rooms/ABCDEF',{headers:{Upgrade:'websocket',Origin:'https://bad.test'}})).status,403);
  const invalid=await connect('a',true,token('a',{exp:1}));assert.equal((await invalid.next(p=>p.type==='error')).code,'auth-required');const outsider=await connect('outsider',true);assert.equal((await outsider.next(p=>p.type==='error')).code,'not-member');
  const list=await connect('a',false,token('a'),true);assert.deepEqual((await list.next(p=>p.type==='rooms')).rooms,[]);
  const a=await connect('a',true);await a.snapshot();const listing=(await list.next(p=>p.type==='rooms')).rooms[0];assert.equal(listing.capacity,4);assert.ok(!listing.players&&!listing.state);
  const b=await connect('b');let sb=await b.snapshot(),sa=await a.snapshot();b.send('wrong-host',sb.room.revision,{type:'start'});await b.next(p=>p.type==='error'&&p.id==='wrong-host');
  a.send('start',sa.room.revision,{type:'start'});sa=await a.snapshot();sb=await b.snapshot();assert.equal(sa.room.status,'playing');assert.equal(sa.state.hands.a.length,14);assert.ok(sa.state.hands.a.every(t=>t.color));assert.ok(sa.state.hands.b.every(t=>!t.color));assert.deepEqual(sa.state.pool,[]);assert.equal(sa.state.poolCount,78);assert.equal(sa.state.turnDeadline-now,30000);
  const actor=sa.state.turnUid==='a'?a:b,other=actor===a?b:a,uid=sa.state.turnUid,oldRevision=sa.room.revision,readCount=reads;
  other.send('wrong-turn',oldRevision,{type:'draw'});assert.match((await other.next(p=>p.type==='error'&&p.id==='wrong-turn')).message,/차례/);
  actor.send('draw-once',oldRevision,{type:'draw'});actor.send('draw-once',oldRevision,{type:'draw'});await actor.next(p=>p.type==='ack'&&p.id==='draw-once');await actor.next(p=>p.type==='ack'&&p.id==='draw-once');sa=await a.snapshot();sb=await b.snapshot();assert.equal(sa.state.hands[uid].length,15);assert.equal(sb.room.revision,oldRevision+1);assert.equal(sa.state.turnDeadline-now,30000);assert.equal(reads,readCount);
  actor.send('stale',oldRevision,{type:'draw'});assert.equal((await actor.next(p=>p.type==='error'&&p.id==='stale')).code,'stale-revision');
  const expectedTurn=sa.state.turnUid,deadline=sa.state.turnDeadline;for(const ws of clients)try{ws.close();}catch(_){}await mf.dispose();now=deadline+1;mf=new Miniflare(options());await mf.ready;
  const ns=await mf.getDurableObjectNamespace('CUBE_ROOMS');await ns.get(ns.idFromName('ABCDEF')).fetch('https://cube.test/__alarm');const returned=await connect('a');sa=await returned.snapshot();assert.equal(sa.room.revision,oldRevision+2);assert.notEqual(sa.state.turnUid,expectedTurn);assert.equal(sa.state.hands[expectedTurn].length,15);assert.equal(sa.state.poolCount,76);
  returned.send('leave',sa.room.revision,{type:'leave'});await returned.next(p=>p.type==='ack'&&p.id==='leave');const host=await connect('b');sb=await host.snapshot();assert.equal(sb.room.hostUid,'b');assert.equal(sb.room.status,'waiting');assert.equal(sb.state,null);
 }finally{for(const ws of clients)try{ws.close();}catch(_){}await mf.dispose();fs.rmSync(persist,{recursive:true,force:true});}
});
test('room commands enforce capacity, private tiles, bots, receipts and valid initial meld',{timeout:10000},async()=>{
 const {CubeRoom}=await import('../cloudflare-worker/cube-room.js');let n=10;const rng=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};const m=new CubeRoom(null,rng);m.connect({uid:'a',name:'A'},true);m.connect({uid:'b',name:'B'},false);const act=(uid,type,extra={})=>m.apply(uid,{id:'action-'+m.room.revision,revision:m.room.revision,action:{type,...extra}});
 act('a','add-bot');act('a','add-bot');assert.throws(()=>act('a','add-bot'),/4명/);act('a','remove-bot',{uid:'cube-bot-2'});act('a','start');assert.equal(m.state.players.length,3);
 for(let i=0;i<5&&m.botTurn();i++){m.advanceBot(Date.now()+10000);}assert.equal(m.view('a').state.hands.b.every(t=>!t.color),true);const uid=m.state.turnUid;assert.throws(()=>act(uid==='a'?'b':'a','commit',{table:[['fake','fake2','fake3']]}));
});

 test('30-second deadlines reject late actions and discard unfinished edits on timeout',async()=>{
 const {CubeRoom,TURN_MS}=await import('../cloudflare-worker/cube-room.js');assert.equal(TURN_MS,30000);
 const startAt=100000,m=new CubeRoom(null,()=>.25);m.connect({uid:'a',name:'A'},true,startAt);m.connect({uid:'b',name:'B'},false,startAt);
 m.apply('a',{id:'start',revision:m.room.revision,action:{type:'start'}},startAt);assert.equal(m.data.turnDeadline,startAt+30000);
 const uid=m.state.turnUid,before=m.state.hands[uid].length,original=JSON.stringify(m.state.table);
 assert.equal(m.advanceBot(startAt+29999),false);
 assert.throws(()=>m.apply(uid,{id:'late',revision:m.room.revision,action:{type:'draw'}},startAt+30000),/차례 시간이 끝/);
 assert.equal(m.advanceBot(startAt+30000),true);assert.equal(m.state.hands[uid].length,before+1);assert.equal(JSON.stringify(m.state.table),original);assert.equal(m.data.turnDeadline,startAt+60000);
 });

test('committed positions are public, survive reconnects and reject malformed layout atomically',async()=>{
 const {CubeRoom}=await import('../cloudflare-worker/cube-room.js'),E=require('../cube-engine.js');
 const now=Date.now(),m=new CubeRoom(null,()=>.25);m.connect({uid:'a',name:'A'},true,now);m.connect({uid:'b',name:'B'},false,now);
 m.apply('a',{id:'start',revision:m.room.revision,action:{type:'start'}},now);
 const deck=E.deck(),initial=deck.filter(t=>['red-10-0','blue-10-0','orange-10-0'].includes(t.id)),rest=deck.filter(t=>!initial.some(i=>i.id===t.id));
 m.data.state={...E.start(['a','b']),hands:{a:[...initial,...rest.slice(0,11)],b:rest.slice(11,25)},pool:rest.slice(25),table:[],turnUid:'a'};
 const revision=m.room.revision,table=[initial.map(t=>t.id)],packet={id:'commit',revision,action:{type:'commit',table,layout:[{x:7.3,y:2.1}]}};
 assert.throws(()=>m.apply('a',{...packet,action:{...packet.action,layout:[{x:NaN,y:0}]}},now+1),/위치/);assert.equal(m.room.revision,revision);assert.deepEqual(m.state.table,[]);
 assert.equal(m.apply('a',packet,now+1),true);assert.deepEqual(m.view('a').state.tableLayout,[{x:7.3,y:2.1}]);assert.deepEqual(m.view('b').state.tableLayout,[{x:7.3,y:2.1}]);
 assert.ok(m.view('b').state.hands.a.every(t=>!t.color));
 const restored=new CubeRoom(JSON.parse(JSON.stringify(m.data)));assert.deepEqual(restored.view('b').state.tableLayout,[{x:7.3,y:2.1}]);
});
