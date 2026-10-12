(() => {
  'use strict';
  const E=window.WarEngine,$=id=>document.getElementById(id),fmt=n=>Math.round(n).toLocaleString('ko-KR');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selectedFaction='seongwon',you=selectedFaction,selected=E.factions[0].home,mode='friends',state=null,world=null,socket=null,ready=false,timer=null,paused=false,zoom=1,pan={x:0,y:0},pending=null,retries=0,reconnectTimer=null,refreshTimer=null,visible=true,mapLoaded=false,connectionGeneration=0,connectionPending=false;
  const paths=new Map(),points=new Map();
  let accountFaction=null,accountRevision=0;
  const project=([lon,lat])=>[(lon-124.45)*100,(38.85-lat)*136+20];
  const faction=id=>E.factions.find(f=>f.id===id);
  const setStatus=text=>{$('status').textContent=text;};
  const show=id=>{for(const name of ['lobby','battle'])$(name).hidden=name!==id;document.body.classList.toggle('is-playing',id==='battle');};
  const canAct=()=>state?.status==='playing'&&E.alive(state,you)&&(mode==='solo'||ready&&!world?.catchingUp)&&!paused;
  function picker(){
    $('faction-picker').innerHTML=E.factions.map(f=>`<div class="faction-choice ${f.id===accountFaction?'selected':''}" style="--faction-color:${f.color}"><span class="dot"></span><span><strong>${f.name}${f.id===accountFaction?' · 나':''}</strong><small>${esc(E.regions[f.home].name)}</small><em>${fmt(E.regions[f.home].population)}명</em></span></div>`).join('');
    document.documentElement.style.setProperty('--player-color',faction(selectedFaction).color);paintMap();
  }
  function accountControls(available){
    $('solo-start').disabled=!available;$('enter-world').disabled=!available||connectionPending;
  }
  async function resolveAccount(){
    const revision=++accountRevision;accountFaction=null;accountControls(false);picker();
    $('war-content').hidden=true;$('war-access').hidden=false;$('help').hidden=true;
    $('war-access-note').textContent='접근 권한을 확인하고 있습니다.';
    $('member-note').textContent='엔조이 멤버 계정을 확인하고 있습니다.';$('retry-member').hidden=true;
    try{
      const member=await window.getEnjoyWarMember();if(revision!==accountRevision)return false;
      if(member.name!=='성원제'||member.faction!=='seongwon')throw Error('현재 드롭 전쟁은 성원제만 사용할 수 있습니다.');
      $('war-content').hidden=false;$('war-access').hidden=true;$('help').hidden=false;
      accountFaction=member.faction;selectedFaction=member.faction;
      if(!state&&!world){you=selectedFaction;selected=member.home;chooseRegion(selected);}
      const text=`${member.name} · ${E.regions[member.home].name}에서 시작합니다.`;
      $('member-note').textContent=text;accountControls(true);picker();return true;
    }catch(error){
      if(revision!==accountRevision)return false;
      $('war-access-note').textContent=error.message;
      $('member-note').textContent=error.message;$('retry-member').hidden=false;return false;
    }
  }
  async function loadMap(){
    try{
      const response=await fetch('assets/war/korea-map.json?v=20261011-1');if(!response.ok)throw Error('지도 응답 오류');
      const data=await response.json(),NS='http://www.w3.org/2000/svg';
      for(const r of data.regions){
        const path=document.createElementNS(NS,'path');
        const d=r.rings.map(ring=>ring.map((p,i)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join('')+'Z').join('');
        path.setAttribute('d',d);path.setAttribute('fill-rule','evenodd');path.setAttribute('class','region');path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',`${r.province} ${r.name}, 인구 ${fmt(r.population)}명`);path.dataset.region=r.id;
        const title=document.createElementNS(NS,'title');title.textContent=`${r.province} ${r.name} · ${fmt(r.population)}명`;path.append(title);
        $('map-regions').append(path);paths.set(r.id,path);points.set(r.id,project(r.center));
      }
      for(const f of E.factions){
        const [x,y]=points.get(f.home),g=document.createElementNS(NS,'g');
        g.innerHTML=`<circle class="map-dot" cx="${x}" cy="${y}" r="7" fill="${f.color}"/><text class="map-label" x="${x+11}" y="${y+4}">${esc(E.regions[f.home].name.replace('전남광주통합특별시','전남광주'))}<tspan class="map-member" x="${x+11}" dy="15">${f.name}</tspan></text>`;
        $('map-labels').append(g);
      }
      mapLoaded=true;$('map-loading').hidden=true;paintMap();
    }catch(error){$('map-loading').textContent='지도를 불러오지 못했어요. 다시 시도해주세요.';setStatus('지도 로딩 실패 · '+error.message);}
  }
  function paintMap(){
    if(!mapLoaded)return;
    const front=new Set(state?E.frontier(state,you):[]),attacked=new Set(state?Object.values(state.armies).map(a=>a.target).filter(Boolean):[]);
    for(const [id,path] of paths){
      const owner=state?.territories[id].owner||E.factions.find(f=>f.home===id)?.id;
      // Neutral territories remain neutral after an owner loses them.
      const actual=state?state.territories[id].owner:owner;
      path.style.fill=actual?faction(actual).color:'#263a41';path.style.fillOpacity=actual?(actual===(state?you:accountFaction)?'.88':'.55'):'1';
      path.classList.toggle('frontier',front.has(id));path.classList.toggle('selected',selected===id);path.classList.toggle('attacked',attacked.has(id));path.setAttribute('aria-pressed',selected===id?'true':'false');
    }
    let lines='';
    if(state&&selected){const route=E.route(state,you,selected);if(route.length>1)lines+=`<polyline class="route-line" points="${route.map(k=>points.get(k).join(',')).join(' ')}"/>`;}
    if(state)for(const f of E.factions){
      const target=state.armies[f.id].target;if(!target)continue;
      const source=Object.keys(state.territories).find(k=>state.territories[k].owner===f.id&&(E.regions[k].neighbors.includes(target)||E.regions[k].seaNeighbors.includes(target)));
      if(source)lines+=`<line class="route-line battle" x1="${points.get(source)[0]}" y1="${points.get(source)[1]}" x2="${points.get(target)[0]}" y2="${points.get(target)[1]}"/>`;
    }
    $('map-routes').innerHTML=lines;
  }
  function chooseRegion(id){if(!E.regions[id])return;selected=id;paintMap();if(state)targetCard();else{const r=E.regions[id];$('map-subtitle').textContent=`${r.province} ${r.name} · 실제 인구 ${fmt(r.population)}명`;}}
  function targetCard(){
    const r=E.regions[selected],t=state.territories[selected],a=state.armies[you],owned=t.owner===you,reachable=E.frontier(state,you).includes(selected),invasion=a.target===selected;
    const route=E.route(state,you,selected),blockers=route.slice(1,-1).filter(k=>state.territories[k].owner!==you),progress=t.dead/r.population*100,owner=t.owner?faction(t.owner).name:'중립 지역';
    let hint=owned?'내 영토입니다. 방어를 강화하면 침략을 늦출 수 있어요.':reachable?'국경이 연결되어 있습니다. 이 지역을 점령하면 다음 지역으로 진출합니다.':blockers.length?`${blockers.map(k=>E.regions[k].name).join(' → ')}을(를) 먼저 점령해야 통과할 수 있습니다.`:'연결된 국경이 없어요. 섬으로 가려면 보급 2단계와 항로가 필요합니다.';
    if(invasion)hint=mode==='friends'?'침략 진행 중 · 1시간 단위로 전투가 반영됩니다. 접속을 끊어도 작전은 계속됩니다.':'침략 진행 중 · 연습 전투는 5초마다 진행됩니다.';
    if(!E.alive(state,you))hint='모든 영토를 잃어 탈락했습니다. 남은 전쟁을 관전할 수 있어요.';
    if(world?.catchingUp)hint='지난 시간의 전투를 반영하고 있습니다. 완료되면 작전을 변경할 수 있어요.';
    if(state.status==='finished')hint=`${faction(state.winner).name} 승리 · 전쟁이 종료되었습니다.`;
    const hours=E.attackEstimate(state,you,selected);
    const estimate=mode==='friends'&&!owned&&reachable?`<p class="target-hint">현재 전력 기준 ${hours===null?'방어력 강화로 점령 예상 불가':`약 ${Math.max(1,Math.ceil(hours/24))}일 예상`} · 보급과 방어 강화에 따라 달라집니다.</p>`:'';
    const active=a.target?`<p class="target-hint">현재 작전: ${esc(E.regions[a.target].name)} 침략 중</p>`:'';
    $('target-card').innerHTML=`<div class="target-top"><span>선택한 지역</span><span style="color:${t.owner?faction(t.owner).color:'#8da3aa'}">${owner}</span></div><h3>${esc(r.name)}</h3><p class="province">${esc(r.province)}</p><div class="population-stat"><span>생존 인구</span><strong>${fmt(t.remaining)}<small> 명</small></strong></div><div class="population-stat"><span>사망 / 실제 인구</span><span>${fmt(t.dead)} / ${fmt(r.population)}</span></div><div class="death-meter"><i style="width:${progress}%"></i></div><div class="population-stat"><span>방어 병력 · 방벽 ${t.fort}단계</span><span>${fmt(t.garrison)}</span></div><p class="target-hint">${esc(hint)}</p>${blockers.length?`<div class="route-chip">진격 경로 · ${route.map(k=>esc(E.regions[k].name)).join(' → ')}</div>`:''}${active}${estimate}<div class="target-actions">${owned?`<button class="secondary" data-command="fortify" ${!canAct()||t.fort>=5||a.credits<40+t.fort*25?'disabled':''}>방어 강화 · ${40+t.fort*25} CP</button>`:`<button class="primary" data-command="attack" ${!canAct()||!reachable||invasion||a.supply<15?'disabled':''}>${invasion?'침략 중…':'침략 시작 →'}</button>`}${a.target?`<button class="secondary" data-command="retreat" ${!canAct()?'disabled':''}>철수</button>`:''}</div><label class="field-label" for="target-list">지역 바로 선택</label><select id="target-list" class="region-select"><optgroup label="침략 가능한 지역">${E.frontier(state,you).map(k=>`<option value="${k}" ${k===selected?'selected':''}>${esc(E.regions[k].name)}</option>`).join('')}</optgroup><optgroup label="전체 지역">${Object.values(E.regions).map(r=>`<option value="${r.id}" ${r.id===selected?'selected':''}>${esc(r.province+' '+r.name)}</option>`).join('')}</optgroup></select>`;
  }
  function render(){
    if(!state){show('lobby');paintMap();return;}
    show('battle');const f=faction(you),a=state.armies[you];document.documentElement.style.setProperty('--player-color',f.color);
    $('player-name').textContent=f.name;$('player-home').textContent=E.regions[f.home].name+'에서 시작';$('player-avatar').textContent=f.name[0];
    $('territory-count').innerHTML=`${E.territoryCount(state,you)}<small>개</small>`;$('credits').innerHTML=`${fmt(a.credits)}<small>CP</small>`;
    $('supply-meter').style.width=a.supply+'%';$('supply-number').textContent=Math.round(a.supply)+'%';$('resupply').disabled=!canAct()||a.credits<35||a.supply>=100;
    const names={attack:['⚔','공격력','더 빠르게 인구·방어력 감소'],defense:['◇','방어력','침략 지연·방어 병력 회복'],logistics:['⇄','보급','보급 회복 · 2단계 해상 항로']};
    $('upgrade-list').innerHTML=Object.entries(names).map(([kind,[icon,name,desc]])=>`<div class="upgrade"><span class="upgrade-icon">${icon}</span><div><strong>${name} <span style="color:var(--player-color)">Lv.${a.levels[kind]}</span></strong><small>${desc}</small></div><button data-upgrade="${kind}" ${!canAct()||a.levels[kind]>=5||a.credits<E.cost(a,kind)?'disabled':''}>${a.levels[kind]>=5?'MAX':E.cost(a,kind)+' CP ↑'}</button></div>`).join('');
    $('death-total').textContent='총 사망 '+fmt(state.totalDead)+'명';
    $('ranking').innerHTML=E.rankings(state).map((f,i)=>`<div class="rank-row"><span class="rank">${i+1}</span><i style="background:${f.color}"></i><strong class="${f.territories?'':'eliminated'}">${f.name}${f.id===you?' · 나':''}</strong><span>${f.territories?f.territories+'개 영토':'탈락'} · ${mode==='friends'?(world.players.some(p=>p.faction===f.id&&p.online)?'접속 중':'미접속'):state.armies[f.id].bot?'AI':'멤버'}</span></div>`).join('');
    $('event-log').innerHTML=state.log.slice(0,15).map(l=>`<li><time>${mode==='friends'?dateTime(l.at):tickTime(l.tick)}</time>${esc(l.text)}</li>`).join('');
    $('clock').textContent=(paused?'일시정지 · ':state.status==='finished'?'전쟁 종료 · ':'진행 · ')+tickTime(state.tick);
    $('campaign-meta').hidden=mode!=='friends';
    if(mode==='friends'){$('campaign-age').textContent='공동 전장 · '+tickTime(state.tick)+' 경과';$('world-sync').textContent=world.catchingUp?`지난 ${world.pendingHours}시간 반영 중…`:`${dateTime(world.updatedAt)} 저장 · ${world.nextTickAt?'다음 전투 '+dateTime(world.nextTickAt):'최종 기록 보존'}`;}
    $('history').hidden=mode!=='friends';
    $('map-title').textContent=state.status==='finished'?`${faction(state.winner).name}, 전장에 남다.`:'국경을 넘어, 영토를 넓히세요.';
    $('map-subtitle').textContent=state.status==='finished'?'최종 기록이 저장되었습니다.':'지역 선택 → 침략 시작 · 노란 경계는 지금 공격 가능한 지역';
    $('pause-solo').hidden=mode!=='solo'||state.status!=='playing';$('pause-solo').textContent=paused?'계속하기':'일시정지';
    $('leave-match').textContent=mode==='solo'?'연습 끝내기':'전장 화면 닫기 · 영토 유지';
    targetCard();paintMap();
  }
  const tickTime=t=>mode==='friends'?`${Math.floor(t/24)}일 ${t%24}시간`:`${String(Math.floor(t*5/60)).padStart(2,'0')}:${String(t*5%60).padStart(2,'0')}`;
  const dateTime=at=>new Date(at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  function command(action){
    setStatus('');
    try{
      if(mode==='solo'){E.apply(state,you,action);render();return;}
      if(!canAct()||!socket||socket.readyState!==WebSocket.OPEN)throw Error('서버에 연결한 뒤 다시 시도해주세요.');
      if(pending)throw Error('직전 명령을 처리하는 중이에요.');
      pending={type:'action',id:crypto.randomUUID(),round:world.round,action};socket.send(JSON.stringify(pending));
    }catch(error){setStatus(error.message);}
  }
  async function startSolo(){
    if(!await resolveAccount())return;
    disconnect(true);mode='solo';you=selectedFaction;selected=faction(you).home;world=null;state=E.create([you]);paused=false;ready=false;
    $('connection').textContent='혼자 연습 · AI 5명';setStatus('');render();
    clearInterval(timer);timer=setInterval(()=>{if(!paused&&visible&&state?.status==='playing'){E.step(state);render();}},5000);
    if(window.innerWidth<700)$('battle').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function disconnect(clearPending=false){
    connectionGeneration++;clearTimeout(reconnectTimer);clearTimeout(refreshTimer);reconnectTimer=null;refreshTimer=null;connectionPending=false;
    if(socket){const ws=socket;socket=null;ws.onclose=null;ws.close();}ready=false;if(clearPending)pending=null;
  }
  async function getToken(){await window.getEnjoyWarMember();const token=await window.getEnjoyIdToken?.(true);if(!token)throw Error('엔조이에서 멤버 계정으로 로그인한 뒤 접속해주세요.');return token;}
  function wsURL(){const url=new URL(window.ENJOY_WAR_SERVER);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/world';return url.href;}
  async function connectWorld(reconnecting=false){
    if(mode!=='friends'||!visible||connectionPending)return;
    if(ready&&socket?.readyState===WebSocket.OPEN){render();return;}
    disconnect();const generation=connectionGeneration,uid=window.enjoyUser?.uid;connectionPending=true;accountControls(!!accountFaction);
    $('connection').textContent='공동 전장 연결 중';setStatus('');
    let token;try{token=await getToken();}catch(error){if(generation!==connectionGeneration)return;connectionPending=false;accountControls(!!accountFaction);setStatus(error.message);$('connection').textContent='로그인 확인 필요';return;}
    if(generation!==connectionGeneration||uid!==window.enjoyUser?.uid||mode!=='friends'||!visible)return;
    if(!reconnecting)retries=0;
    const ws=new WebSocket(wsURL());socket=ws;
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',token}));
    ws.onmessage=event=>{
      if(socket!==ws)return;let p;try{p=JSON.parse(event.data);}catch(_){return;}
      if(p.type==='ready'){
        ready=true;connectionPending=false;retries=0;accountControls(!!accountFaction);$('connection').textContent='공동 전장 · 연결됨';
        refreshTimer=setTimeout(()=>{ready=false;connectWorld(true);},Math.max(1000,Math.min(55*60000,p.expiresAt-Date.now()-60000)));
        if(pending)ws.send(JSON.stringify(pending));
      }
      if(p.type==='snapshot'){
        if(!p.world||!p.state||!p.you||p.uid!==window.enjoyUser?.uid)return;
        if(world&&p.world.revision<world.revision)return;
        const first=!world;world={...p.world,round:p.state.round,nextTickAt:p.nextTickAt,catchingUp:p.catchingUp,pendingHours:p.pendingHours};state=p.state;you=p.you;
        if(first)selected=faction(you).home;paused=false;render();
        setStatus(p.catchingUp?'지난 시간의 전투를 반영하고 있어요. 완료되면 작전을 변경할 수 있습니다.':'');
      }
      if(p.type==='ack'&&pending?.id===p.id)pending=null;
      if(p.type==='history')renderHistory(p);
      if(p.type==='error'){
        if(pending?.id===p.id)pending=null;setStatus(p.message);
        if(['not-member','faction-claimed','identity-changed','too-many-connections','upgrade-required'].includes(p.code)){
          ws.onclose=null;ws.close();socket=null;ready=false;connectionPending=false;clearTimeout(refreshTimer);accountControls(!!accountFaction);$('connection').textContent='접속 확인 필요';render();
        }
      }
    };
    ws.onclose=()=>{
      if(socket!==ws)return;ready=false;connectionPending=false;clearTimeout(refreshTimer);accountControls(!!accountFaction);render();$('connection').textContent='연결 끊김 · 작전은 계속';
      if(!visible)return;
      if(retries>=6){setStatus('연결을 복구하지 못했어요. 전장 화면을 닫고 다시 접속해주세요.');return;}
      retries++;reconnectTimer=setTimeout(()=>connectWorld(true),Math.min(30000,1000*2**retries));
    };
    ws.onerror=()=>setStatus('공동 전장 서버 연결을 확인하고 있습니다.');
  }
  function requestHistory(before=null){if(!ready||socket?.readyState!==WebSocket.OPEN){setStatus('공동 전장에 연결한 뒤 기록을 확인해주세요.');return;}socket.send(JSON.stringify({type:'history',before}));}
  function renderHistory(packet){
    info(`<span class="eyebrow">CAMPAIGN HISTORY</span><h2>공동 전장 전체 기록</h2><ol class="history-log">${packet.events.map(e=>`<li><time>${esc(dateTime(e.at))}</time><p>${esc(e.text)}</p></li>`).join('')||'<li>저장된 기록이 없습니다.</li>'}</ol>${packet.nextCursor?'<button id="older-history" class="secondary full">이전 기록 50개</button>':'<p class="quiet">첫 기록까지 확인했습니다.</p>'}`);
    if(packet.nextCursor)$('older-history').onclick=()=>requestHistory(packet.nextCursor);
  }
  function exitWorld(){
    disconnect();clearInterval(timer);timer=null;state=null;world=null;paused=false;$('connection').textContent='작전 대기';$('clock').textContent='상시 공동 전장';$('map-title').textContent='여섯 멤버, 하나의 전장.';$('map-subtitle').textContent='내 지역에서 시작해, 한 지역씩 진격하세요.';selected=faction(selectedFaction).home;you=selectedFaction;show('lobby');picker();accountControls(!!accountFaction);
  }
  function leave(){exitWorld();if(mode==='friends')setStatus('전장 접속을 닫았습니다. 영토와 진행 중인 침략은 유지됩니다.');}
  function switchMode(next){if(world||state)return;disconnect(true);mode=next;$('mode-solo').classList.toggle('active',mode==='solo');$('mode-friends').classList.toggle('active',mode==='friends');$('solo-options').hidden=mode!=='solo';$('friends-options').hidden=mode!=='friends';setStatus('');if(mode==='friends'&&accountFaction)connectWorld();else $('connection').textContent='작전 대기';}
  function info(content){$('info-content').innerHTML=`<div class="dialog-copy">${content}</div>`;if(!$('info-dialog').open)$('info-dialog').showModal();}
  const rules=`<span class="eyebrow">HOW TO PLAY</span><h2>같은 전장, 오래 이어지는 전쟁.</h2><p>여섯 멤버가 엔조이 계정으로 하나의 공동 전장에 접속합니다. 방 코드나 방장이 없고, 각 멤버의 지역은 처음부터 마련되어 있습니다.</p><h3>01 · 한 지역씩 진격</h3><p>내 땅과 맞닿은 지역만 침략할 수 있습니다. 중간 지역을 점령하지 않으면 통과할 수 없습니다. 실제 교량은 육로로 연결했고, 제주·울릉·옹진 항로는 보급 2단계부터 열립니다.</p><h3>02 · 며칠에서 몇 달의 작전</h3><p>공동 전투와 자원 회복은 실제 시간으로 1시간마다 반영됩니다. 지역 인구, 공격력, 방벽과 보급에 따라 점령에 며칠에서 수개월이 걸릴 수 있습니다. 지도에 표시되는 예상 기간은 현재 전력 기준이며 상대의 강화에 따라 달라집니다.</p><h3>03 · 인구 0명과 방어 병력 소진</h3><p>방어 병력이 먼저 피해를 받고 그 뒤 생존 인구가 줄어듭니다. 둘 다 0이 되면 점령하며, 재점령 시 인구는 되살아나지 않습니다. 공격 · 방어 · 보급을 강화하고 내 영토에 방벽을 세우세요.</p><h3>04 · 화면을 닫아도 계속</h3><p>영토, 병력, 강화와 침략은 계속 저장됩니다. 모두 접속을 끊어도 시작한 침략과 자원 회복은 진행됩니다. 미접속 멤버를 AI로 바꾸지 않습니다. 다시 접속하면 같은 전장으로 돌아옵니다.</p><h3>05 · 기한 없는 통일</h3><p>공동 전장에는 90분 종료나 미접속 시 삭제가 없습니다. 모든 영토를 잃으면 관전하며, 한 멤버가 대한민국 전역 ${E.data.regions.length}개 지역을 점령하면 끝납니다. 종료 후에도 기록은 보존됩니다. 전체 작전 기록은 ‘전체 기록’에서 이전 페이지까지 볼 수 있습니다.</p><h3>혼자 연습</h3><p>5초 단위로 AI 다섯 명과 하는 빠른 연습입니다. 공동 전장의 영토나 자원에는 영향을 주지 않습니다.</p>`;
  $('help').onclick=()=>info(rules);$('close-info').onclick=()=>$('info-dialog').close();$('info-dialog').addEventListener('click',event=>{if(event.target===$('info-dialog'))$('info-dialog').close();});
  $('sources').onclick=()=>info(`<span class="eyebrow">DATA & CREDITS</span><h2>실제 지도, 실제 인구.</h2><p>경계 기준일 2026년 7월 1일 · 자료 갱신 2026년 8월 26일. 인천 행정체제 개편과 전남광주통합특별시를 반영했습니다.</p><p>본 데이터는 통계청 통계지리정보서비스(<a href="https://sgis.kostat.go.kr" target="_blank" rel="noopener">SGIS</a>)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener">vuski/admdongkor</a>), CC BY 4.0으로 배포됩니다.</p><p>게임용으로 대구·부산·대전·전남광주를 전체 지역으로 병합하고 실제 교량과 해상 항로를 연결했습니다. 나머지는 시군구 단위로 총 ${E.data.regions.length}개 영토를 구성했습니다.</p><p>인구: <a href="https://jumin.mois.go.kr/statMonth.do" target="_blank" rel="noopener">행정안전부 주민등록 인구통계</a>, 2026년 9월 말 전체 주민등록 인구(외국인 제외). 전국 합계 ${fmt(E.data.regions.reduce((n,r)=>n+r.population,0))}명. 게임의 전투와 방어 병력은 가상 수치입니다.</p>`);
  $('back').onclick=()=>window.leaveWarPage?.();$('mode-solo').onclick=()=>switchMode('solo');$('mode-friends').onclick=()=>switchMode('friends');$('solo-start').onclick=startSolo;
  $('retry-access').onclick=()=>authChanged();
  $('retry-member').onclick=async()=>{if(await resolveAccount()&&mode==='friends')connectWorld();};
  $('enter-world').onclick=()=>connectWorld();$('history').onclick=()=>requestHistory();$('leave-match').onclick=leave;
  $('resupply').onclick=()=>command({type:'resupply'});$('upgrade-list').onclick=event=>{const b=event.target.closest('[data-upgrade]');if(b)command({type:'upgrade',kind:b.dataset.upgrade});};
  $('target-card').onclick=event=>{const b=event.target.closest('[data-command]');if(b)command({type:b.dataset.command,target:selected});};$('target-card').onchange=event=>{if(event.target.id==='target-list')chooseRegion(event.target.value);};
  $('pause-solo').onclick=()=>{paused=!paused;render();};
  $('map-regions').onclick=event=>{if(event.target.dataset.region)chooseRegion(event.target.dataset.region);};$('map-regions').onkeydown=event=>{if(['Enter',' '].includes(event.key)&&event.target.dataset.region){event.preventDefault();chooseRegion(event.target.dataset.region);}};
  function transformMap(){$('map-camera').setAttribute('transform',`translate(${pan.x} ${pan.y}) translate(370 440) scale(${zoom}) translate(-370 -440)`);}
  document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{if(b.dataset.map==='reset'){zoom=1;pan={x:0,y:0};}else zoom=Math.min(4,Math.max(1,zoom+(b.dataset.map==='in'?.35:-.35)));transformMap();});
  let drag=null,moved=false;
  $('korea-map').addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,pan:{...pan}};moved=false;});
  $('korea-map').addEventListener('pointermove',event=>{if(!drag||zoom===1)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)<5)return;moved=true;const scale=740/$('korea-map').getBoundingClientRect().width;pan={x:Math.max(-800,Math.min(800,drag.pan.x+dx*scale)),y:Math.max(-900,Math.min(900,drag.pan.y+dy*scale))};transformMap();});
  window.addEventListener('pointerup',()=>{drag=null;});$('korea-map').addEventListener('click',event=>{if(moved){event.preventDefault();event.stopImmediatePropagation();moved=false;}},true);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('info-dialog').open)window.leaveWarPage?.();});
  async function authChanged(){
    disconnect(true);clearInterval(timer);timer=null;state=null;world=null;paused=false;show('lobby');$('clock').textContent='상시 공동 전장';$('connection').textContent='작전 대기';
    if(await resolveAccount()&&mode==='friends'&&visible)connectWorld();
  }
  window.addEventListener('enjoy-auth-ready',authChanged);window.addEventListener('war-auth-available',authChanged);
  window.pauseWarGame=()=>{visible=false;if(mode==='solo'){paused=true;render();}else{disconnect();$('connection').textContent='접속 종료 · 작전은 계속';render();}};
  window.resumeWarGame=()=>{visible=true;if(mode==='friends'&&accountFaction)connectWorld(true);};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)window.pauseWarGame();else window.resumeWarGame();});
  picker();loadMap();switchMode(new URLSearchParams(location.search).get('mode')==='solo'?'solo':'friends');
})();
