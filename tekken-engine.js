(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DropTekken=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const STEP=1/60, VERSION=2;
 const ROSTER=[
  {id:'taeo',name:'태오',title:'불꽃의 복서',style:'BOXING',color:'#ff6749',speed:275,power:1,kickPower:1,size:1,skill:'레드 버스트',description:'빠른 잽으로 거리를 좁히고, 연속 펀치로 몰아붙이는 균형형.',stats:[4,4,4]},
  {id:'seorin',name:'서린',title:'푸른 번개의 발끝',style:'TAEKWONDO',color:'#45e5ef',speed:305,power:.88,kickPower:1.15,size:.98,skill:'청뢰연각',description:'긴 리치와 빠른 회전 발차기. 빈틈을 읽고 흐름을 가져오는 속도형.',stats:[3,5,4]},
  {id:'mujin',name:'무진',title:'깨지지 않는 금빛',style:'POWER BRAWLER',color:'#ffc65b',speed:230,power:1.3,kickPower:1.1,size:1.07,skill:'지각 붕괴',description:'묵직한 주먹과 강한 압박. 한 번의 기회로 승부를 뒤집는 파워형.',stats:[5,2,5]},
  {id:'yura',name:'유라',title:'달빛을 가르는 잔상',style:'ACROBATIC',color:'#c49bff',speed:295,power:.95,kickPower:1.05,size:.97,skill:'월영섬',description:'유연한 스텝과 대시, 공중 연계로 상대의 균형을 무너뜨리는 기교형.',stats:[3,5,5]}
 ];
 const MOVES={punch:{wind:.12,active:.09,recover:.21,range:148,damage:8,energy:10},kick:{wind:.24,active:.11,recover:.28,range:208,damage:14,energy:14},launcher:{wind:.21,active:.12,recover:.36,range:150,damage:10,energy:12},special:{wind:.28,active:.25,recover:.4,range:248,damage:28,energy:0},dash:{wind:0,active:.18,recover:.08,range:0,damage:0,energy:0},jump:{wind:0,active:.1,recover:0,range:0,damage:0,energy:0}};
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const character=value=>Number.isInteger(value)&&value>=0&&value<ROSTER.length?value:0;
 const neutral=()=>({axis:0,guard:false,move:null});
 function fighter(uid,id,x){return{uid,character:character(id),x,y:0,vx:0,vy:0,facing:x<550?1:-1,hp:100,maxHp:100,energy:0,wins:0,pose:'idle',poseTime:0,walkPhase:0,attack:null,attackId:0,stun:0,combo:0,lastHit:-10,lastAttack:-10,lastMove:null,buffer:null,dashTime:0,dashDir:0,dashCooldown:0,landTime:0,airUsed:false,ai:null};}
 function start(players,now=0){return{version:VERSION,players:players.map((p,i)=>fighter(p.uid,p.character,i?755:345)),phase:'countdown',round:1,time:60,elapsed:0,phaseTime:2.05,winner:null,roundWinner:null,event:null,events:[],eventId:0,freeze:0,clock:now};}
 function upgrade(s){if(!s||s.version===VERSION)return s;s.players=s.players.map((p,i)=>({...fighter(p.uid,p.character,p.x??(i?755:345)),...p,character:character(p.character),attack:null,buffer:null,maxHp:100}));s.version=VERSION;s.events=[];s.freeze=0;return s;}
 function input(value){if(!value||typeof value!=='object')return neutral();return{axis:[-1,0,1].includes(value.axis)?value.axis:0,guard:value.guard===true,move:typeof value.move==='string'&&Object.hasOwn(MOVES,value.move)?value.move:null};}
 function announce(s,kind,data={}){const event={id:++s.eventId,kind,at:s.elapsed,...data};s.event=event;s.events.push(event);s.events=s.events.slice(-16);}
 function duration(p,move){const m=MOVES[move],speed=p.character===1&&move==='kick'?.91:p.character===2?1.12:p.character===3?.95:1;return(m.wind+m.active+m.recover)*speed;}
 function changePose(p,next,dt){if(p.pose===next)p.poseTime+=dt;else{p.pose=next;p.poseTime=0;}}
 function roundEnd(s){const[a,b]=s.players;const win=a.hp===b.hp?null:a.hp>b.hp?0:1;if(win!==null)s.players[win].wins++;s.roundWinner=win;s.phase=s.players.some(p=>p.wins>=2)?'finished':'round-end';s.phaseTime=2.65;s.winner=s.phase==='finished'?s.players.find(p=>p.wins>=2).uid:null;announce(s,'round-end',{winner:win,knockout:s.players.some(p=>p.hp<=0)});}
 function begin(s,p,i,move,axis){
  if(move==='special'&&p.energy<100)return false;
  if(move==='jump'){if(p.y>1||p.dashTime>0)return false;p.vy=565;p.y=.1;p.airUsed=false;announce(s,'jump',{actor:i});return true;}
  if(move==='dash'){if(p.y>1||p.dashCooldown>0)return false;p.dashTime=.18;p.dashDir=axis||p.facing;p.dashCooldown=.48;p.vx=p.dashDir*680;announce(s,'dash',{actor:i});return true;}
  if(p.y>1&&p.airUsed)return false;
  const chain=p.lastMove===move&&s.elapsed-p.lastAttack<1.1?((p.chain||1)%3)+1:1;
  p.attack={move,t:0,duration:duration(p,move),dir:p.facing,hitMask:0,id:++p.attackId,chain};p.chain=chain;p.lastMove=move;p.lastAttack=s.elapsed;
  if(p.y>1)p.airUsed=true;if(move==='special')p.energy=0;announce(s,'attack',{actor:i,move,chain,character:p.character});return true;
 }
 function strikePlan(p,a){
  const m=MOVES[a.move],scale=a.duration/(m.wind+m.active+m.recover),wind=m.wind*scale;
  if(a.move==='special'){
   if(p.character===1)return[{t:.25,damage:8,range:240},{t:.4,damage:8,range:258},{t:.56,damage:15,range:270}];
   if(p.character===2)return[{t:.43,damage:34,range:235}];
   if(p.character===3)return[{t:.26,damage:11,range:268},{t:.48,damage:18,range:285}];
   return[{t:.28,damage:10,range:236},{t:.47,damage:18,range:250}];
  }
  let damage=m.damage;if(a.move==='punch')damage*=ROSTER[p.character].power*(a.chain===3?1.3:a.chain===2?1.08:1);else if(a.move==='kick')damage*=ROSTER[p.character].kickPower;
  return[{t:wind,damage:Math.round(damage),range:m.range+(p.character===1&&a.move==='kick'?20:0)}];
 }
 function tick(s,commands={},dt=STEP){
  upgrade(s);dt=clamp(Number.isFinite(dt)?dt:0,0,.05);if(s.phase==='finished'||!dt)return s;s.elapsed+=dt;s.clock+=dt*1000;
  if(s.phase!=='playing'){
   s.phaseTime-=dt;if(s.phaseTime>0)return s;
   if(s.phase==='round-end'){s.round++;s.time=60;s.roundWinner=null;s.freeze=0;s.players=s.players.map((p,i)=>({...fighter(p.uid,p.character,i?755:345),wins:p.wins}));s.phase='countdown';s.phaseTime=2.05;return s;}
   s.phase='playing';announce(s,'fight');return s;
  }
  s.time=Math.max(0,s.time-dt);if(s.freeze>0){for(const p of s.players){const c=input(commands[p.uid]);if(c.move)p.buffer={move:c.move,until:s.elapsed+.18,axis:c.axis};}s.freeze=Math.max(0,s.freeze-dt);if(s.time===0)roundEnd(s);return s;}
  const inputs=s.players.map(p=>input(commands[p.uid]));
  for(let i=0;i<2;i++){
   const p=s.players[i],q=s.players[1-i],c=inputs[i];p.facing=q.x>=p.x?1:-1;p.stun=Math.max(0,p.stun-dt);p.dashCooldown=Math.max(0,p.dashCooldown-dt);p.landTime=Math.max(0,(p.landTime||0)-dt);p.dashTime=Math.max(0,p.dashTime-dt);
   if(c.move)p.buffer={move:c.move,until:s.elapsed+.18,axis:c.axis};
   if(p.attack){p.attack.t+=dt;if(p.attack.t>=p.attack.duration){p.lastAttack=s.elapsed;p.attack=null;}}
   if(p.stun>0){p.buffer=null;changePose(p,'hurt',dt);p.vx*=Math.exp(-7*dt);}
   else{
    if(!p.attack&&p.buffer&&p.buffer.until>=s.elapsed){const b=p.buffer;p.buffer=null;begin(s,p,i,b.move,b.axis);}
    if(p.attack){const a=p.attack;changePose(p,a.move,dt);const burst=a.move==='special'?(p.character===3?430:210):a.move==='launcher'?130:a.move==='kick'?70:105;p.vx+=(a.dir*burst*Math.sin(Math.PI*clamp(a.t/a.duration,0,1))-p.vx)*Math.min(1,dt*16);}
    else if(p.dashTime>0){changePose(p,'dash',dt);p.vx=p.dashDir*680;}
    else if(p.landTime>0&&p.y<1){changePose(p,'land',dt);p.vx*=Math.exp(-16*dt);}
    else if(c.guard&&p.y<1){changePose(p,'guard',dt);p.vx*=Math.exp(-22*dt);}
    else{const target=c.axis*ROSTER[p.character].speed;p.vx+=(target-p.vx)*Math.min(1,dt*(c.axis?17:23));changePose(p,p.y>1?'jump':Math.abs(p.vx)>24?'walk':'idle',dt);}
   }
   p.x=clamp(p.x+p.vx*dt,62,1038);p.walkPhase=(p.walkPhase+Math.abs(p.vx)*dt/100)%1;
   if(p.y>0||p.vy>0){p.vy-=1550*dt;p.y=Math.max(0,p.y+p.vy*dt);if(p.y===0){if(p.vy< -200){p.landTime=.12;announce(s,'land',{actor:i,x:p.x});}p.vy=0;p.airUsed=false;}}
   if(p.buffer&&p.buffer.until<s.elapsed)p.buffer=null;
  }
  const [a,b]=s.players,gap=b.x-a.x;if(Math.abs(gap)<86&&Math.abs(a.y-b.y)<100){const push=(86-Math.abs(gap))/2,sign=Math.sign(gap)||1;a.x=clamp(a.x-sign*push,62,1038);b.x=clamp(b.x+sign*push,62,1038);}
  const hits=[];
  for(let i=0;i<2;i++){
   const p=s.players[i],q=s.players[1-i],a=p.attack;if(!a||p.stun>0)continue;
   const plan=strikePlan(p,a);plan.forEach((hit,index)=>{const bit=1<<index;if(a.hitMask&bit||a.t<hit.t)return;a.hitMask|=bit;
    const invulnerable=q.dashTime>.13&&q.character!==2;
    if(!invulnerable&&Math.abs(q.x-p.x)<=hit.range&&Math.abs(q.y-p.y)<115&&(q.x-p.x)*a.dir>0)hits.push({i,hit,move:a.move,chain:a.chain,index});else announce(s,'whiff',{actor:i,move:a.move});
   });
  }
  for(const h of hits){
   const p=s.players[h.i],q=s.players[1-h.i],blocked=q.pose==='guard'&&!q.attack&&q.y<1,scaling=s.elapsed-p.lastHit<1.15?Math.max(.5,1-(p.combo||0)*.07):1;
   const damage=blocked?Math.max(1,Math.round(h.hit.damage*.15)):Math.max(1,Math.round(h.hit.damage*scaling));q.hp=Math.max(0,q.hp-damage);q.energy=clamp(q.energy+(blocked?5:damage*.95),0,100);p.energy=clamp(p.energy+(h.move==='special'?0:MOVES[h.move].energy),0,100);
   if(!blocked){p.combo=s.elapsed-p.lastHit<1.15?p.combo+1:1;p.lastHit=s.elapsed;q.stun=h.move==='launcher'?.62:h.move==='special'?.31:.23;q.attack=null;q.buffer=null;q.pose='hurt';q.poseTime=0;q.vx=(q.x>p.x?1:-1)*(h.move==='special'?230:135);if(h.move==='launcher'){q.vy=440;q.y=Math.max(1,q.y);}if(p.combo>7){q.vx*=2;q.stun=.48;}}
   s.freeze=Math.max(s.freeze,blocked?.018:h.move==='special'?.055:.032);announce(s,blocked?'block':'hit',{actor:h.i,target:1-h.i,move:h.move,chain:h.chain,damage,combo:p.combo,x:(p.x+q.x)/2,y:Math.max(p.y,q.y),character:p.character});
  }
  if(s.players.some(p=>p.hp<=0)||s.time<=0)roundEnd(s);return s;
 }
 function advance(s,commands,seconds){let first=true;const neutralized=Object.fromEntries(Object.entries(commands||{}).map(([uid,c])=>[uid,{...input(c),move:null}]));for(let left=clamp(Number.isFinite(seconds)?seconds:0,0,5);left>1e-8;left-=STEP){tick(s,first?commands:neutralized,Math.min(STEP,left));first=false;}return s;}
 function bot(s,index,rng=Math.random){
  const p=s.players[index],q=s.players[1-index];if(s.phase!=='playing')return neutral();const dist=Math.abs(p.x-q.x),dir=q.x>p.x?1:-1;p.ai||={next:0,axis:0,guard:false};
  if(s.elapsed<p.ai.next)return{axis:p.ai.axis,guard:p.ai.guard,move:null};p.ai.next=s.elapsed+.1+rng()*.17;let move=null,guard=!!q.attack&&dist<245&&rng()<.57,axis=dist>165?dir:dist<100?-dir:0;
  if(!guard&&!p.attack&&!p.stun){if(p.energy>=100&&dist<255)move='special';else if(dist<215&&rng()<.74)move=dist<155&&rng()<.62?'punch':rng()<.13?'launcher':'kick';else if(dist>315&&rng()<.15)move='dash';else if(q.attack?.move==='kick'&&rng()<.2)move='jump';}
  if(guard)axis=0;p.ai.axis=axis;p.ai.guard=guard;return{axis,guard,move};
 }
 return{VERSION,STEP,ROSTER,MOVES,character,start,upgrade,input,tick,advance,bot,strikePlan,duration};
});
