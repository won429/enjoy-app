import { DurableObject } from 'cloudflare:workers';
import engine from '../tekken-engine.js';
import { verifyToken, member } from './tekken-auth.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const TTL=60*60*1000;
const validOrigin=(origin,env)=>(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)||/^https:\/\/[a-f0-9]+\.enjoy-app\.pages\.dev$/.test(origin);
export default{async fetch(request,env){
 const url=new URL(request.url);if(url.pathname==='/health')return json({ok:true,service:'enjoy-tekken',version:engine.VERSION,characters:engine.ROSTER.length,authoritative:true,roundSeconds:60,firstTo:2});
 const match=url.pathname.match(/^\/rooms\/([A-Z2-9]{6})$/);if(!match||request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'Not found'},404);
 if(!validOrigin(request.headers.get('Origin')||'',env))return json({error:'Origin not allowed'},403);
 if(env.TEKKEN_CONNECT_LIMITER&&!(await env.TEKKEN_CONNECT_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return json({error:'잠시 후 다시 연결해주세요.'},429);
 return env.TEKKEN_ROOMS.get(env.TEKKEN_ROOMS.idFromName(match[1])).fetch(request);
}};
export class TekkenRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.data=null;this.inputs={};this.timer=null;this.queue=Promise.resolve();this.lastTick=Date.now();this.savedAt=0;this.authPending=new Set();
  ctx.blockConcurrencyWhile(async()=>{this.data=await ctx.storage.get('match')||null;if(this.data?.state)engine.upgrade(this.data.state);if(this.data?.state&&!['finished'].includes(this.data.state.phase)){
    // Active rounds resume from their last checkpoint after an object restart.
    const gap=(Date.now()-(this.data.savedAt||Date.now()))/1000;engine.advance(this.data.state,{},Math.min(gap,5));this.ensureTimer();
  }});
 }
 async fetch(){for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(!a?.authenticated&&Date.now()-a?.createdAt>30000)ws.close(4001,'다시 연결해주세요.');}if(this.ctx.getWebSockets().length>=8)return json({error:'연결이 너무 많아요.'},429);const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({authenticated:false,createdAt:Date.now(),windowAt:Date.now(),count:0,seq:0});return new Response(null,{status:101,webSocket:client});}
 send(ws,packet){try{ws.send(JSON.stringify(packet));}catch(_){}}
 snapshot(){return{type:'snapshot',room:this.data?.room,state:this.data?.state||null,matchId:this.data?.matchId,protocol:engine.VERSION,serverNow:Date.now()};}
 broadcast(){for(const ws of this.ctx.getWebSockets()){const session=ws.deserializeAttachment();if(!session?.authenticated)continue;if(session.expiresAt<=Date.now()){ws.close(4001,'로그인을 갱신해주세요.');continue;}this.send(ws,this.snapshot());}}
 async save(){if(!this.data)return;this.data.savedAt=Date.now();await this.ctx.storage.put('match',this.data);this.savedAt=Date.now();await this.ctx.storage.setAlarm(this.data.room.updatedAt+TTL);}
 fail(message,code='invalid-action'){throw Object.assign(new Error(message),{code});}
 webSocketMessage(ws,raw){this.queue=this.queue.then(()=>this.handle(ws,raw)).catch(()=>this.send(ws,{type:'error',message:'서버 연결을 다시 확인해주세요.'}));return this.queue;}
 async handle(ws,raw){let packet,session=ws.deserializeAttachment();try{
  if(typeof raw!=='string'||raw.length>8000)this.fail('요청을 확인해주세요.');packet=JSON.parse(raw);if(!packet||typeof packet!=='object'||Array.isArray(packet))this.fail('요청을 확인해주세요.');const now=Date.now();
  if(!session)this.fail('다시 연결해주세요.');if(now-session.windowAt>1000){session.windowAt=now;session.count=0;}if(++session.count>80)this.fail('너무 빠른 요청이에요.','rate-limit');ws.serializeAttachment(session);
  if(packet.type==='hello'){
   if(session.authenticated||now-session.createdAt>30000)this.fail('다시 연결해주세요.','auth-required');const claims=await verifyToken(packet.token,this.env);if(!claims)this.fail('엔조이 멤버로 다시 로그인해주세요.','auth-required');const player=await member(packet.token,claims,this.env);player.character=engine.character(packet.character);
   if(packet.create===true){if(this.data&&now-this.data.room.updatedAt<TTL)this.fail('다른 방 코드로 다시 만들어주세요.');this.data={room:{hostUid:player.uid,players:[player],status:'waiting',createdAt:now,updatedAt:now},state:null,matchId:null};}
   else{
    if(!this.data||now-this.data.room.updatedAt>=TTL)this.fail('해당 방을 찾을 수 없어요.');const room=this.data.room,index=room.players.findIndex(p=>p.uid===player.uid);
    if(index<0){if(room.players.length>=2||room.status!=='waiting')this.fail('대전 중이거나 이미 가득 찬 방이에요.');room.players.push(player);}
    else{const old=room.players[index];room.players[index]={...player,character:old.character};}
    room.updatedAt=now;
   }
   // One connection per fighter prevents competing controls from two devices.
   for(const other of this.ctx.getWebSockets()){if(other!==ws&&other.deserializeAttachment()?.uid===player.uid)other.close(4000,'다른 기기에서 연결했어요.');}
   session={...session,authenticated:true,uid:player.uid,expiresAt:claims.exp*1000,seq:0};ws.serializeAttachment(session);this.inputs[player.uid]={axis:0,guard:false,move:null,at:now};await this.save();this.ensureTimer();this.broadcast();return;
  }
  if(!session.authenticated||session.expiresAt<=now)this.fail('엔조이 멤버 로그인을 갱신해주세요.','auth-required');if(!this.data?.room.players.some(p=>p.uid===session.uid))this.fail('방에 참가해주세요.');
  if(packet.type==='leave'){
   this.stopTimer();this.data.room.players=this.data.room.players.filter(p=>p.uid!==session.uid);this.data.room.hostUid=this.data.room.players[0]?.uid||'';this.data.room.status='waiting';this.data.room.updatedAt=now;this.data.state=null;this.data.matchId=null;delete this.inputs[session.uid];session.authenticated=false;ws.serializeAttachment(session);
   if(this.data.room.players.length)await this.save();else{await this.ctx.storage.deleteAll();this.data=null;}
   this.broadcast();ws.close(1000,'나가기');return;
  }
  if(packet.type==='input'){
   if(!this.data.state||this.data.state.phase==='finished'||packet.matchId!==this.data.matchId)return;
   if(!Number.isSafeInteger(packet.seq)||packet.seq<=session.seq)return;session.seq=packet.seq;ws.serializeAttachment(session);
   const next=engine.input(packet.input),previous=this.inputs[session.uid];this.inputs[session.uid]={...next,move:next.move||previous?.move||null,at:now};this.ensureTimer();return;
  }
  if(packet.type==='start'){
   if(session.uid!==this.data.room.hostUid)this.fail('방장만 대전을 시작할 수 있어요.');if(this.data.room.players.length!==2)this.fail('두 명이 모이면 시작할 수 있어요.');
   if(this.data.state&&this.data.state.phase!=='finished')this.fail('이미 대전 중이에요.');
   const connected=this.ctx.getWebSockets().filter(s=>s.deserializeAttachment()?.authenticated).map(s=>s.deserializeAttachment().uid);if(!this.data.room.players.every(p=>connected.includes(p.uid)))this.fail('친구의 연결을 기다려주세요.');
   this.data.state=engine.start(this.data.room.players,now);this.data.matchId=crypto.randomUUID();this.data.room.status='playing';this.data.room.updatedAt=now;this.inputs={};await this.save();this.ensureTimer();this.broadcast();return;
  }
  this.fail('게임 동작을 확인해주세요.');
 }catch(error){const fatal=packet?.type==='hello'||error.code==='auth-required';this.send(ws,{type:'error',message:error instanceof SyntaxError?'요청을 확인해주세요.':error.message,code:error.code||'invalid-action',fatal});if(fatal)ws.close(4001,'연결을 다시 확인해주세요.');}}
 ensureTimer(){if(this.timer||!this.data?.state||this.data.state.phase==='finished')return;this.lastTick=Date.now();this.timer=setInterval(()=>{this.queue=this.queue.then(()=>this.step()).catch(()=>{this.stopTimer();});},33);}
 stopTimer(){if(this.timer)clearInterval(this.timer);this.timer=null;}
 async step(){if(!this.data?.state||this.data.state.phase==='finished'){this.stopTimer();return;}const now=Date.now(),dt=Math.min(.1,(now-this.lastTick)/1000);this.lastTick=now;
  const connected=new Set(this.ctx.getWebSockets().filter(s=>{const a=s.deserializeAttachment();return a?.authenticated&&a.expiresAt>now;}).map(s=>s.deserializeAttachment().uid));
  const missing=this.data.room.players.filter(p=>!connected.has(p.uid));if(missing.length){this.data.disconnectedAt||=now;if(now-this.data.disconnectedAt>=15000){const survivor=this.data.room.players.find(p=>connected.has(p.uid));this.data.state.phase='finished';this.data.state.winner=survivor?.uid||null;for(const p of this.data.state.players)if(p.uid===survivor?.uid)p.wins=2;this.data.room.status='finished';await this.save();this.broadcast();this.stopTimer();return;}}else this.data.disconnectedAt=null;
  const inputs={};for(const p of this.data.room.players){const value=this.inputs[p.uid];inputs[p.uid]=value&&now-value.at<500?value:{axis:0,guard:false,move:null};}
  engine.advance(this.data.state,inputs,dt);for(const value of Object.values(this.inputs))value.move=null;this.data.room.updatedAt=now;
  if(this.data.state.phase==='finished')this.data.room.status='finished';if(now-this.savedAt>5000||this.data.state.phase==='finished')await this.save();this.broadcast();if(this.data.state.phase==='finished')this.stopTimer();
 }
 webSocketClose(ws,code){const uid=ws.deserializeAttachment()?.uid;if(uid)this.inputs[uid]={axis:0,guard:false,move:null,at:0};try{ws.close(code,'');}catch(_){}this.ensureTimer();}
 webSocketError(ws){try{ws.close(1011,'');}catch(_){}this.ensureTimer();}
 async alarm(){if(!this.data)return;const due=this.data.room.updatedAt+TTL;if(due>Date.now()){await this.ctx.storage.setAlarm(due);return;}this.stopTimer();for(const ws of this.ctx.getWebSockets()){this.send(ws,{type:'ended',message:'오래 사용하지 않은 방이 종료됐어요.'});ws.close(1000,'방 종료');}await this.ctx.storage.deleteAll();this.data=null;}
}
