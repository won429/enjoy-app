(function(root) {
  'use strict';
  const data = typeof module !== 'undefined' && module.exports ? require('./war-regions.js') : root.WarRegions;
  const factions = [
    { id:'seongwon', name:'성원제', home:'4785000000', color:'#f472b6' },
    { id:'jinnu', name:'이진누', home:'2700000000', color:'#818cf8' },
    { id:'hong', name:'홍박사', home:'2600000000', color:'#60a5fa' },
    { id:'austin', name:'오스틴', home:'5214000000', color:'#34d399' },
    { id:'jeon', name:'전시기', home:'3000000000', color:'#fb923c' },
    { id:'ryu', name:'류짱', home:'1200000000', color:'#c084fc' }
  ];
  const regions = Object.fromEntries(data.regions.map(r => [r.id,r]));
  const fail = message => { throw new Error(message); };
  const territoryCount = (state,id) => Object.values(state.territories).filter(t=>t.owner===id).length;
  const alive = (state,id) => territoryCount(state,id)>0;
  function frontier(state,id) {
    const found = new Set();
    for(const [key,t] of Object.entries(state.territories)) if(t.owner===id) {
      for(const target of regions[key].neighbors) if(state.territories[target].owner!==id) found.add(target);
      if(state.armies[id].levels.logistics>=2) for(const target of regions[key].seaNeighbors) if(state.territories[target].owner!==id) found.add(target);
    }
    return [...found];
  }
  function log(state,text) { state.log.unshift({tick:state.tick,text});state.log=state.log.slice(0,35); }
  function create(humans=[],now=Date.now()) {
    const territories=Object.fromEntries(data.regions.map(r=>[r.id,{owner:factions.find(f=>f.home===r.id)?.id||null,remaining:r.population,dead:0,garrison:Math.round(r.population*.04),fort:0}]));
    const armies=Object.fromEntries(factions.map(f=>[f.id,{credits:80,supply:100,target:null,levels:{attack:1,defense:1,logistics:1},bot:!humans.includes(f.id),captured:0,kills:0}]));
    return {territories,armies,tick:0,round:now,status:'playing',winner:null,log:[{tick:0,text:'여섯 지역에서 드롭 전쟁이 시작되었습니다.'}],totalDead:0};
  }
  const cost = (army,kind) => 45+army.levels[kind]*30;
  function apply(state,id,action) {
    if(state.status!=='playing') fail('지금은 전쟁이 진행 중이지 않아요.');
    const a=state.armies[id];if(!a||!alive(state,id)) fail('보유 지역이 없어 이번 전쟁에서 탈락했어요.');
    if(action.type==='attack') {
      if(typeof action.target!=='string'||!frontier(state,id).includes(action.target)) fail('맞닿은 지역을 먼저 점령해야 지나갈 수 있어요. 해상 항로는 보급 2단계가 필요해요.');
      if(a.target===action.target) fail('이미 침략 중인 지역이에요.');
      if(a.supply<15) fail('보급이 부족해요. 철수 후 병력을 회복하세요.');
      a.target=action.target;log(state,factions.find(f=>f.id===id).name+' → '+regions[action.target].name+' 침략 개시');
    } else if(action.type==='retreat') {a.target=null;}
    else if(action.type==='upgrade') {
      if(!['attack','defense','logistics'].includes(action.kind)) fail('강화할 항목을 확인해주세요.');
      if(a.levels[action.kind]>=5) fail('최고 단계에 도달했어요.');
      const price=cost(a,action.kind);if(a.credits<price) fail('작전 포인트가 부족해요.');
      a.credits-=price;a.levels[action.kind]++;
    } else if(action.type==='fortify') {
      const t=state.territories[action.target];if(!t||t.owner!==id) fail('내 지역만 방어할 수 있어요.');
      if(t.fort>=5) fail('이 지역의 방어가 최고 단계예요.');
      const price=40+t.fort*25;if(a.credits<price) fail('작전 포인트가 부족해요.');
      a.credits-=price;t.fort++;t.garrison+=Math.round(regions[action.target].population*.035);
    } else if(action.type==='resupply') {
      if(a.credits<35) fail('작전 포인트 35가 필요해요.');if(a.supply>=100) fail('이미 보급이 가득 찼어요.');
      a.credits-=35;a.supply=Math.min(100,a.supply+45);
    } else fail('게임 동작을 확인해주세요.');
    return state;
  }
  function bot(state,id) {
    const a=state.armies[id];if(!alive(state,id)) return;
    if(a.supply<25 && a.credits>=35) apply(state,id,{type:'resupply'});
    if(state.tick%6===0) {
      const kind=state.tick%18===0?'logistics':state.tick%12===0?'defense':'attack';
      if(a.levels[kind]<5&&a.credits>=cost(a,kind)) apply(state,id,{type:'upgrade',kind});
    }
    if(!a.target&&a.supply>=35) {
      const targets=frontier(state,id).sort((x,y)=>{
        const score=k=>state.territories[k].remaining+state.territories[k].garrison+(state.territories[k].owner?500000:0);
        return score(x)-score(y);
      });
      if(targets.length) apply(state,id,{type:'attack',target:targets[0]});
    }
  }
  function step(state) {
    if(state.status!=='playing')return state;
    state.tick++;
    for(const f of factions) {
      const a=state.armies[f.id],count=territoryCount(state,f.id);
      if(!count) {a.target=null;continue;}
      a.credits=Math.min(9999,a.credits+5+Math.min(12,count)*2);
      a.supply=Math.min(100,a.supply+(a.target?.2:3)+a.levels.logistics*.4);
      if(a.bot) bot(state,f.id);
    }
    const order=factions.slice(state.tick%6).concat(factions.slice(0,state.tick%6));
    for(const f of order) {
      const a=state.armies[f.id],target=a.target;
      if(!target)continue;
      if(!frontier(state,f.id).includes(target)) {a.target=null;continue;}
      const t=state.territories[target],r=regions[target],defender=t.owner&&state.armies[t.owner];
      const resistance=1+t.fort*.22+(defender?defender.levels.defense*.15:0);
      let damage=Math.round((9500+r.population*.027)*(1+(a.levels.attack-1)*.32)*(Math.max(.35,a.supply/100))/resistance);
      const shield=Math.min(t.garrison,damage);t.garrison-=shield;damage-=shield;
      const deaths=Math.min(t.remaining,damage);t.remaining-=deaths;t.dead+=deaths;state.totalDead+=deaths;a.kills+=deaths;
      a.supply=Math.max(0,a.supply-(defender?2.3:1.5));
      if(t.remaining===0&&t.garrison===0) {
        const previous=t.owner;t.owner=f.id;t.fort=0;t.garrison=Math.round(r.population*.12);a.target=null;a.captured++;a.credits+=30;
        log(state,f.name+' · '+r.name+' 점령 완료');
        if(previous&&!alive(state,previous)) {state.armies[previous].target=null;log(state,factions.find(x=>x.id===previous).name+' 탈락');}
      } else if(a.supply<=0) {a.target=null;log(state,f.name+' · 보급 소진으로 철수');}
    }
    for(const [id,t] of Object.entries(state.territories)) if(t.owner) {
      const cap=regions[id].population*(.12+t.fort*.035);
      t.garrison=Math.min(cap,t.garrison+Math.round(regions[id].population*.0006*state.armies[t.owner].levels.defense));
    }
    const survivors=factions.filter(f=>alive(state,f.id));
    if(survivors.length===1) {state.status='finished';state.winner=survivors[0].id;log(state,survivors[0].name+' 최종 승리!');}
    // A bounded match also ends when the server has simulated 90 minutes.
    if(state.tick>=1080&&state.status==='playing') {
      state.status='finished';state.winner=rankings(state)[0].id;log(state,'90분 작전 종료 · 보유 영토 순으로 최종 순위를 정합니다.');
    }
    return state;
  }
  function rankings(state) {
    return factions.map(f=>({...f,territories:territoryCount(state,f.id),population:Object.entries(state.territories).filter(([,t])=>t.owner===f.id).reduce((n,[key])=>n+regions[key].population,0),kills:state.armies[f.id].kills})).sort((a,b)=>b.territories-a.territories||b.population-a.population||b.kills-a.kills);
  }
  function route(state,id,target) {
    const starts=Object.keys(state.territories).filter(k=>state.territories[k].owner===id),queue=starts.map(k=>[k]),seen=new Set(starts);
    for(let i=0;i<queue.length;i++) {
      const path=queue[i],last=path.at(-1);if(last===target)return path;
      for(const next of [...regions[last].neighbors,...(state.armies[id].levels.logistics>=2?regions[last].seaNeighbors:[])]) if(!seen.has(next)) {seen.add(next);queue.push([...path,next]);}
    }
    return [];
  }
  const api={data,factions,regions,create,apply,step,frontier,route,alive,territoryCount,rankings,cost};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WarEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
