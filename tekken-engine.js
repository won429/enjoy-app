(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DropTekken=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STEP=1/30, MOVES={punch:{wind:.1,active:.12,recover:.2,range:145,damage:8,energy:9},kick:{wind:.22,active:.14,recover:.3,range:205,damage:14,energy:13},special:{wind:.32,active:.2,recover:.65,range:250,damage:28,energy:0}};
  function fighter(uid,character,x){return{uid,character:character===1?1:0,x,hp:100,energy:0,wins:0,pose:'idle',attack:null,stun:0,combo:0,lastHit:-10};}
  function start(players,now=0){return{players:players.map((p,i)=>fighter(p.uid,p.character,i?760:340)),phase:'countdown',round:1,time:60,elapsed:0,phaseTime:2.2,winner:null,roundWinner:null,event:null,eventId:0,clock:now};}
  function input(value){if(!value||typeof value!=='object')return{axis:0,guard:false,move:null};return{axis:[-1,0,1].includes(value.axis)?value.axis:0,guard:value.guard===true,move:Object.hasOwn(MOVES,value.move)?value.move:null};}
  function announce(s,kind,data={}){s.event={id:++s.eventId,kind,...data};}
  function roundEnd(s){const[a,b]=s.players;let win=a.hp===b.hp?null:a.hp>b.hp?0:1;if(win!==null)s.players[win].wins++;s.roundWinner=win;s.phase=s.players.some(p=>p.wins>=2)?'finished':'round-end';s.phaseTime=3;s.winner=s.phase==='finished'?s.players.find(p=>p.wins>=2).uid:null;announce(s,'round-end',{winner:win});}
  function tick(s,inputs={},dt=STEP){
    dt=Math.max(0,Math.min(dt,.05));if(s.phase==='finished')return s;
    s.elapsed+=dt;s.clock+=dt*1000;
    if(s.phase!=='playing'){
      s.phaseTime-=dt;if(s.phaseTime>0)return s;
      if(s.phase==='round-end'){s.round++;s.time=60;s.roundWinner=null;s.players=s.players.map((p,i)=>({...fighter(p.uid,p.character,i?760:340),wins:p.wins}));s.phase='countdown';s.phaseTime=2.2;return s;}
      s.phase='playing';announce(s,'fight');return s;
    }
    s.time=Math.max(0,s.time-dt);
    const commands=s.players.map(p=>input(inputs[p.uid]));
    for(let i=0;i<2;i++){
      const p=s.players[i],c=commands[i];p.stun=Math.max(0,p.stun-dt);
      if(p.attack){p.attack.t+=dt;const m=MOVES[p.attack.move];if(p.attack.t>=m.wind+m.active+m.recover)p.attack=null;}
      if(p.stun>0){p.pose='hurt';continue;}
      if(!p.attack&&c.move&&(c.move!=='special'||p.energy>=100)){
        p.attack={move:c.move,t:0,hit:false,dir:s.players[1-i].x>=p.x?1:-1};if(c.move==='special')p.energy=0;
      }
      if(p.attack)p.pose=p.attack.move;
      else if(c.guard)p.pose='guard';
      else{p.x=Math.max(65,Math.min(1035,p.x+c.axis*245*dt));p.pose=c.axis?'walk':'idle';}
    }
    let gap=s.players[1].x-s.players[0].x;
    if(Math.abs(gap)<85){const center=(s.players[1].x+s.players[0].x)/2;s.players[0].x=Math.max(65,center-42.5);s.players[1].x=Math.min(1035,center+42.5);}
    const hits=[];
    for(let i=0;i<2;i++){
      const p=s.players[i],other=s.players[1-i],a=p.attack;if(!a||a.hit||p.stun>0)continue;const m=MOVES[a.move];
      if(a.t>=m.wind&&a.t<m.wind+m.active){a.hit=true;if(Math.abs(other.x-p.x)<=m.range&&(other.x-p.x)*a.dir>0)hits.push({i,move:a.move});else announce(s,'whiff',{actor:i,move:a.move});}
    }
    for(const hit of hits){const p=s.players[hit.i],q=s.players[1-hit.i],m=MOVES[hit.move],blocked=q.pose==='guard'&&!q.attack;
      const damage=blocked?Math.max(1,Math.round(m.damage*.18)):m.damage;q.hp=Math.max(0,q.hp-damage);q.energy=Math.min(100,q.energy+(blocked?5:damage*.9));p.energy=Math.min(100,p.energy+m.energy);
      if(!blocked){q.stun=hit.move==='special'?.55:.26;q.attack=null;q.pose='hurt';q.x=Math.max(65,Math.min(1035,q.x+(q.x>p.x?1:-1)*(hit.move==='special'?38:16)));p.combo=s.elapsed-p.lastHit<1.2?p.combo+1:1;p.lastHit=s.elapsed;}
      announce(s,blocked?'block':'hit',{actor:hit.i,move:hit.move,damage,combo:p.combo,x:(p.x+q.x)/2});
    }
    if(s.players.some(p=>p.hp<=0)||s.time<=0)roundEnd(s);
    return s;
  }
  function advance(s,inputs,seconds){for(let remaining=Math.min(Math.max(seconds,0),5);remaining>0;remaining-=STEP)tick(s,inputs,Math.min(STEP,remaining));return s;}
  function bot(s,index,rng=Math.random){const p=s.players[index],q=s.players[1-index],distance=Math.abs(p.x-q.x),toward=q.x>p.x?1:-1;
    if(s.phase!=='playing')return input();if(q.attack&&distance<220&&rng()<.65)return{axis:0,guard:true,move:null};
    return{axis:distance>160?toward:distance<95?-toward:0,guard:false,move:distance<225&&rng()<.14?(p.energy>=100?'special':rng()<.55?'punch':'kick'):null};}
  return{STEP,MOVES,start,input,tick,advance,bot};
});
