(() => {
  'use strict';
  const E=window.WarEngine,$=id=>document.getElementById(id),fmt=n=>Math.round(n).toLocaleString('ko-KR');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selectedFaction='seongwon',you=selectedFaction,selected=E.factions[0].home,mode='solo',state=null,room=null,code='',socket=null,lobbySocket=null,ready=false,timer=null,paused=false,zoom=1,pan={x:0,y:0},pending=null,retries=0,reconnectTimer=null,lobbyRetry=null,visible=true,mapLoaded=false;
  const paths=new Map(),points=new Map();
  const project=([lon,lat])=>[(lon-124.45)*100,(38.85-lat)*136+20];
  const faction=id=>E.factions.find(f=>f.id===id);
  const setStatus=text=>{$('status').textContent=text;};
  const show=id=>{for(const name of ['lobby','waiting','battle'])$(name).hidden=name!==id;document.body.classList.toggle('is-playing',id==='battle');};
  function storageGet(key){try{return localStorage.getItem(key);}catch(_){return null;}}
  function storageSet(key,value){try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch(_){}}
  const canAct=()=>state?.status==='playing'&&E.alive(state,you)&&(mode==='solo'||ready)&&!paused;
  function picker(){
    $('faction-picker').innerHTML=E.factions.map(f=>`<button class="faction-choice ${f.id===selectedFaction?'selected':''}" style="--faction-color:${f.color}" data-faction="${f.id}" aria-pressed="${f.id===selectedFaction}"><span class="dot"></span><span><strong>${f.name}</strong><small>${esc(E.regions[f.home].name)}</small><em>${fmt(E.regions[f.home].population)}명</em></span></button>`).join('');
    document.documentElement.style.setProperty('--player-color',faction(selectedFaction).color);paintMap();
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
      path.style.fill=actual?faction(actual).color:'#263a41';path.style.fillOpacity=actual?(actual===you?'.88':'.55'):'1';
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
    if(invasion)hint='침략 진행 중 · 5초마다 전투가 진행됩니다. 인구 0명과 방어 병력 소진 시 점령합니다.';
    if(!E.alive(state,you))hint='모든 영토를 잃어 탈락했습니다. 남은 전쟁을 관전할 수 있어요.';
    if(state.status==='finished')hint=`${faction(state.winner).name} 승리 · 전쟁이 종료되었습니다.`;
    const active=a.target?`<p class="target-hint">현재 작전: ${esc(E.regions[a.target].name)} 침략 중</p>`:'';
    $('target-card').innerHTML=`<div class="target-top"><span>선택한 지역</span><span style="color:${t.owner?faction(t.owner).color:'#8da3aa'}">${owner}</span></div><h3>${esc(r.name)}</h3><p class="province">${esc(r.province)}</p><div class="population-stat"><span>생존 인구</span><strong>${fmt(t.remaining)}<small> 명</small></strong></div><div class="population-stat"><span>사망 / 실제 인구</span><span>${fmt(t.dead)} / ${fmt(r.population)}</span></div><div class="death-meter"><i style="width:${progress}%"></i></div><div class="population-stat"><span>방어 병력 · 방벽 ${t.fort}단계</span><span>${fmt(t.garrison)}</span></div><p class="target-hint">${esc(hint)}</p>${blockers.length?`<div class="route-chip">진격 경로 · ${route.map(k=>esc(E.regions[k].name)).join(' → ')}</div>`:''}${active}<div class="target-actions">${owned?`<button class="secondary" data-command="fortify" ${!canAct()||t.fort>=5||a.credits<40+t.fort*25?'disabled':''}>방어 강화 · ${40+t.fort*25} CP</button>`:`<button class="primary" data-command="attack" ${!canAct()||!reachable||invasion||a.supply<15?'disabled':''}>${invasion?'침략 중…':'침략 시작 →'}</button>`}${a.target?`<button class="secondary" data-command="retreat" ${!canAct()?'disabled':''}>철수</button>`:''}</div><label class="field-label" for="target-list">지역 바로 선택</label><select id="target-list" class="region-select"><optgroup label="침략 가능한 지역">${E.frontier(state,you).map(k=>`<option value="${k}" ${k===selected?'selected':''}>${esc(E.regions[k].name)}</option>`).join('')}</optgroup><optgroup label="전체 지역">${Object.values(E.regions).map(r=>`<option value="${r.id}" ${r.id===selected?'selected':''}>${esc(r.province+' '+r.name)}</option>`).join('')}</optgroup></select>`;
  }
  function render(){
    if(!state){if(room)renderWaiting();else show('lobby');paintMap();return;}
    show('battle');const f=faction(you),a=state.armies[you];document.documentElement.style.setProperty('--player-color',f.color);
    $('player-name').textContent=f.name;$('player-home').textContent=E.regions[f.home].name+'에서 시작';$('player-avatar').textContent=f.name[0];
    $('territory-count').innerHTML=`${E.territoryCount(state,you)}<small>개</small>`;$('credits').innerHTML=`${fmt(a.credits)}<small>CP</small>`;
    $('supply-meter').style.width=a.supply+'%';$('supply-number').textContent=Math.round(a.supply)+'%';$('resupply').disabled=!canAct()||a.credits<35||a.supply>=100;
    const names={attack:['⚔','공격력','더 빠르게 인구·방어력 감소'],defense:['◇','방어력','침략 지연·방어 병력 회복'],logistics:['⇄','보급','보급 회복 · 2단계 해상 항로']};
    $('upgrade-list').innerHTML=Object.entries(names).map(([kind,[icon,name,desc]])=>`<div class="upgrade"><span class="upgrade-icon">${icon}</span><div><strong>${name} <span style="color:var(--player-color)">Lv.${a.levels[kind]}</span></strong><small>${desc}</small></div><button data-upgrade="${kind}" ${!canAct()||a.levels[kind]>=5||a.credits<E.cost(a,kind)?'disabled':''}>${a.levels[kind]>=5?'MAX':E.cost(a,kind)+' CP ↑'}</button></div>`).join('');
    $('death-total').textContent='총 사망 '+fmt(state.totalDead)+'명';
    $('ranking').innerHTML=E.rankings(state).map((f,i)=>`<div class="rank-row"><span class="rank">${i+1}</span><i style="background:${f.color}"></i><strong class="${f.territories?'':'eliminated'}">${f.name}${f.id===you?' · 나':''}</strong><span>${f.territories?f.territories+'개 영토':'탈락'} · ${state.armies[f.id].bot?'AI':'멤버'}</span></div>`).join('');
    $('event-log').innerHTML=state.log.slice(0,15).map(l=>`<li><time>${tickTime(l.tick)}</time>${esc(l.text)}</li>`).join('');
    $('clock').textContent=(paused||room?.paused?'일시정지 · ':state.status==='finished'?'전쟁 종료 · ':'LIVE · ')+tickTime(state.tick);
    $('map-title').textContent=state.status==='finished'?`${faction(state.winner).name}, 전장에 남다.`:'국경을 넘어, 영토를 넓히세요.';
    $('map-subtitle').textContent=state.status==='finished'?'최종 순위는 오른쪽 전장 현황에서 확인하세요.':'지역 선택 → 침략 시작 · 노란 경계는 지금 공격 가능한 지역';
    $('pause-solo').hidden=mode!=='solo'||state.status!=='playing';$('pause-solo').textContent=paused?'계속하기':'일시정지';
    $('leave-match').textContent=mode==='solo'?'연습 끝내기':'전쟁방 나가기';
    targetCard();paintMap();
  }
  const tickTime=t=>`${String(Math.floor(t*5/60)).padStart(2,'0')}:${String(t*5%60).padStart(2,'0')}`;
  function renderWaiting(){
    show('waiting');$('waiting-code').textContent=code;
    $('waiting-players').innerHTML=E.factions.map(f=>{const p=room.players.find(p=>p.faction===f.id);return `<div class="seat"><i style="background:${f.color}"></i><strong>${f.name}</strong><span>${esc(E.regions[f.home].name.replace('전남광주통합특별시','전남광주'))}</span><small>${p?(p.uid===room.hostUid?'방장':'참가 완료'):'AI 대기'}</small></div>`;}).join('');
    $('start-room').disabled=!ready||window.enjoyUser?.uid!==room.hostUid;
    $('start-room').textContent=window.enjoyUser?.uid===room.hostUid?'전쟁 시작 →':'방장이 시작하면 전쟁에 참가합니다';
    $('leave-waiting').disabled=!ready;paintMap();
  }
  function command(action){
    setStatus('');
    try{
      if(mode==='solo'){E.apply(state,you,action);render();return;}
      if(!ready||!socket||socket.readyState!==WebSocket.OPEN)throw Error('서버에 연결한 뒤 다시 시도해주세요.');
      if(pending)throw Error('직전 명령을 처리하는 중이에요.');
      pending={type:'action',id:crypto.randomUUID(),round:room.round,action};socket.send(JSON.stringify(pending));
    }catch(error){setStatus(error.message);}
  }
  function startSolo(){
    disconnect();mode='solo';you=selectedFaction;selected=faction(you).home;room=null;state=E.create([you]);paused=false;ready=false;
    $('connection').textContent='혼자 연습 · AI 5명';setStatus('');render();
    clearInterval(timer);timer=setInterval(()=>{if(!paused&&visible&&state?.status==='playing'){E.step(state);render();}},5000);
    if(window.innerWidth<700)$('battle').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function disconnect(){
    clearTimeout(reconnectTimer);clearTimeout(lobbyRetry);reconnectTimer=null;lobbyRetry=null;
    if(socket){const ws=socket;socket=null;ws.onclose=null;ws.close();}if(lobbySocket){const ws=lobbySocket;lobbySocket=null;ws.onclose=null;ws.close();}ready=false;pending=null;
  }
  async function getToken(){await window.ensureWarAuth?.();const token=await window.getEnjoyIdToken?.(true);if(!token)throw Error('드롭 화면에서 멤버 계정으로 로그인한 뒤 참가해주세요.');return token;}
  function wsURL(path){const url=new URL(window.ENJOY_WAR_SERVER);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=path;return url.href;}
  async function connectRoom(nextCode,create=false,reconnecting=false){
    if(!/^[A-Z2-9]{6}$/.test(nextCode)){setStatus('방 코드는 영문과 숫자 여섯 자리예요.');return;}
    let token;try{token=await getToken();}catch(error){setStatus(error.message);return;}
    if(!reconnecting){disconnect();state=null;room=null;retries=0;}
    clearTimeout(reconnectTimer);code=nextCode;ready=false;$('connection').textContent='전쟁방 연결 중';
    const ws=new WebSocket(wsURL('/rooms/'+code));socket=ws;
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',token,create}));
    ws.onmessage=event=>{
      if(socket!==ws)return;let p;try{p=JSON.parse(event.data);}catch(_){return;}
      if(p.type==='ready'){ready=true;retries=0;storageSet('drop-war-room',code);$('connection').textContent='친구와 전쟁 · 연결됨';if(pending)ws.send(JSON.stringify(pending));}
      if(p.type==='snapshot'){
        if(!p.room||!p.you||!p.room.players.some(player=>player.uid===window.enjoyUser?.uid)){exitRoom();return;}
        if(room&&p.room.revision<room.revision)return;
        room={...p.room,paused:p.paused};state=p.state;you=p.you;
        if(!state)selected=faction(you).home;paused=false;render();
        if(p.paused)setStatus('모두 접속을 끊어서 전쟁이 잠시 멈췄어요. 재접속하면 이어집니다.');
      }
      if(p.type==='ack'&&pending?.id===p.id){const leave=pending.action.type==='leave';pending=null;if(leave)exitRoom();}
      if(p.type==='error'){if(pending?.id===p.id)pending=null;setStatus(p.message);if(p.code==='room-missing'||p.code==='not-member'||p.code==='room-exists'){socket=null;ws.onclose=null;ws.close();ready=false;$('connection').textContent='참가 실패';}}
      if(p.type==='removed'){setStatus(p.message||'전쟁방이 종료되었어요.');exitRoom(false);}
    };
    ws.onclose=event=>{
      if(socket!==ws)return;ready=false;render();$('connection').textContent='연결 끊김';
      if(event.code===4001&&retries>=2||retries>=6){setStatus('연결을 복구하지 못했어요. 이전 전쟁방 다시 연결을 눌러주세요.');return;}
      retries++;reconnectTimer=setTimeout(()=>connectRoom(code,false,true),Math.min(15000,1000*2**retries));
    };
    ws.onerror=()=>setStatus('전쟁 서버 연결을 확인하고 있습니다.');
  }
  async function openLobby(){
    if(mode!=='friends'||room)return;
    if(lobbySocket){lobbySocket.onclose=null;lobbySocket.close();lobbySocket=null;}
    try{
      const token=await getToken();if(mode!=='friends'||room)return;
      $('auth-note').textContent=(window.enjoyUser?.displayName||'멤버')+' · 본인 지역이 자동 배정됩니다.';
      const ws=new WebSocket(wsURL('/rooms'));lobbySocket=ws;
      ws.onopen=()=>ws.send(JSON.stringify({type:'hello',token}));
      ws.onmessage=event=>{if(lobbySocket!==ws)return;const p=JSON.parse(event.data);if(p.type==='rooms'){renderRooms(p.rooms);$('connection').textContent='친구와 전쟁 · 방 목록 연결됨';}if(p.type==='error'){setStatus(p.message);ws.onclose=null;ws.close();}};
      ws.onerror=()=>setStatus('방 목록 서버에 연결하는 중이에요.');
      ws.onclose=()=>{if(mode==='friends'&&!room&&lobbySocket===ws){lobbyRetry=setTimeout(openLobby,10000);}};
    }catch(error){$('room-list').innerHTML='<p class="quiet">멤버 로그인이 필요합니다.</p>';setStatus(error.message);}
    $('resume-room').hidden=!storageGet('drop-war-room');
  }
  function renderRooms(rooms){$('room-list').innerHTML=rooms.length?rooms.map(r=>`<div class="room-item"><div><strong>${esc(r.hostName)}의 전쟁방</strong><small>${r.id} · ${r.playerCount}/6명 · ${r.status==='waiting'?'대기 중':r.status==='playing'?'전쟁 중':'종료'}</small></div><button class="secondary" data-room="${r.id}" ${r.status!=='waiting'||r.playerCount>=6?'disabled':''}>참가</button></div>`).join(''):'<p class="quiet">대기 중인 전쟁방이 없어요. 첫 방을 만들어보세요.</p>';}
  function exitRoom(clear=true){
    disconnect();clearInterval(timer);timer=null;state=null;room=null;paused=false;if(clear)storageSet('drop-war-room',null);$('connection').textContent='작전 대기';$('clock').textContent='전쟁 준비';$('map-title').textContent='여섯 멤버, 하나의 전장.';$('map-subtitle').textContent='내 지역에서 시작해, 한 지역씩 진격하세요.';selected=faction(selectedFaction).home;you=selectedFaction;show('lobby');picker();if(mode==='friends')openLobby();
  }
  function leave(){if(mode==='solo')exitRoom();else if(ready)command({type:'leave'});else{exitRoom(false);setStatus('연결이 끊겨 방에서는 아직 탈퇴하지 않았어요. 다시 연결해서 방 나가기를 눌러주세요.');}}
  function switchMode(next){if(room||state)return;disconnect();mode=next;$('mode-solo').classList.toggle('active',mode==='solo');$('mode-friends').classList.toggle('active',mode==='friends');$('solo-options').hidden=mode!=='solo';$('friends-options').hidden=mode!=='friends';setStatus('');if(mode==='friends')openLobby();else $('connection').textContent='작전 대기';}
  function info(content){$('info-content').innerHTML=`<div class="dialog-copy">${content}</div>`;$('info-dialog').showModal();}
  const rules=`<span class="eyebrow">HOW TO PLAY</span><h2>한 지역씩, 끝까지.</h2><p>여섯 멤버가 각자 사는 지역에서 시작하는 가상 전략 게임입니다. 지도에서 지역을 누르면 인구와 진격 경로를 볼 수 있습니다.</p><h3>01 · 국경을 먼저 연결하세요</h3><p>내 땅과 맞닿은 지역만 침략할 수 있습니다. 중간 지역을 점령하지 않으면 통과할 수 없습니다. 실제 교량은 육로로 연결했고, 제주·울릉·옹진 항로는 보급 2단계부터 열립니다.</p><h3>02 · 인구가 0명이 되면 점령</h3><p>인구는 행정안전부 2026년 9월 주민등록 인구입니다. 전투가 5초마다 진행되고, 방어 병력이 먼저 피해를 받은 뒤 생존 인구가 줄어듭니다. 인구가 0명이고 방어 병력까지 소진되면 점령합니다. 재점령 시 인구는 되살아나지 않고 새 방어 병력과 싸웁니다.</p><h3>03 · 공격 · 방어 · 보급</h3><p>시간과 보유 영토에 따라 작전 포인트가 쌓입니다. 공격력을 높여 진격하고, 내 지역에 방벽을 세우고, 보급을 보강하세요. 한 번에 한 지역을 침략하며 다른 곳을 공격하면 작전이 전환됩니다.</p><h3>04 · 마지막 세력까지</h3><p>모든 영토를 잃으면 탈락합니다. 마지막 세력이 승리하며, 90분이 지나면 영토 수 → 보유 지역의 원래 인구 → 사망 인구 기여 순으로 순위를 정합니다. 비어 있는 멤버 자리는 AI가 플레이합니다.</p><h3>친구와 이어하기</h3><p>우노처럼 기존 멤버 계정을 사용합니다. 뒤로가기로 닫아도 방에는 남고, 다시 열면 이어집니다. 모두 연결을 끊으면 서버 전쟁이 멈추고 다시 연결할 때 이어집니다. ‘전쟁방 나가기’를 누르면 내 세력은 AI로 넘어갑니다.</p>`;
  $('help').onclick=()=>info(rules);$('close-info').onclick=()=>$('info-dialog').close();$('info-dialog').addEventListener('click',event=>{if(event.target===$('info-dialog'))$('info-dialog').close();});
  $('sources').onclick=()=>info(`<span class="eyebrow">DATA & CREDITS</span><h2>실제 지도, 실제 인구.</h2><p>경계 기준일 2026년 7월 1일 · 자료 갱신 2026년 8월 26일. 인천 행정체제 개편과 전남광주통합특별시를 반영했습니다.</p><p>본 데이터는 통계청 통계지리정보서비스(<a href="https://sgis.kostat.go.kr" target="_blank" rel="noopener">SGIS</a>)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener">vuski/admdongkor</a>), CC BY 4.0으로 배포됩니다.</p><p>게임용으로 대구·부산·대전·전남광주를 전체 지역으로 병합하고 실제 교량과 해상 항로를 연결했습니다. 나머지는 시군구 단위로 총 ${E.data.regions.length}개 영토를 구성했습니다.</p><p>인구: <a href="https://jumin.mois.go.kr/statMonth.do" target="_blank" rel="noopener">행정안전부 주민등록 인구통계</a>, 2026년 9월 말 전체 주민등록 인구(외국인 제외). 전국 합계 ${fmt(E.data.regions.reduce((n,r)=>n+r.population,0))}명. 게임의 전투와 방어 병력은 가상 수치입니다.</p>`);
  $('back').onclick=()=>window.leaveWarPage?.();$('mode-solo').onclick=()=>switchMode('solo');$('mode-friends').onclick=()=>switchMode('friends');$('solo-start').onclick=startSolo;
  $('faction-picker').onclick=event=>{const button=event.target.closest('[data-faction]');if(button){selectedFaction=button.dataset.faction;you=selectedFaction;selected=faction(you).home;picker();chooseRegion(selected);}};
  $('create-room').onclick=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',values=crypto.getRandomValues(new Uint8Array(6));connectRoom([...values].map(v=>chars[v%chars.length]).join(''),true);};
  $('join-form').onsubmit=event=>{event.preventDefault();connectRoom($('room-code').value.trim().toUpperCase());};$('room-list').onclick=event=>{const b=event.target.closest('[data-room]');if(b)connectRoom(b.dataset.room);};
  $('refresh-rooms').onclick=openLobby;$('resume-room').onclick=()=>connectRoom(storageGet('drop-war-room')||'');
  $('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(code);setStatus('방 코드를 복사했어요.');}catch(_){setStatus('방 코드: '+code);}};
  $('start-room').onclick=()=>command({type:'start'});$('leave-waiting').onclick=leave;$('leave-match').onclick=leave;
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
  window.addEventListener('enjoy-auth-ready',()=>{if(mode==='friends'&&!room)openLobby();});
  window.pauseWarGame=()=>{clearTimeout(reconnectTimer);clearTimeout(lobbyRetry);visible=false;if(mode==='solo'){paused=true;render();}else if(socket){socket.onclose=null;socket.close();socket=null;ready=false;}if(lobbySocket){lobbySocket.onclose=null;lobbySocket.close();lobbySocket=null;}};
  window.resumeWarGame=()=>{visible=true;if(mode==='friends'){if(room)connectRoom(code,false,true);else openLobby();}};
  document.addEventListener('visibilitychange',()=>{if(mode==='solo'){visible=!document.hidden;if(!visible){paused=true;render();}}});
  picker();loadMap();if(new URLSearchParams(location.search).get('mode')==='friends')switchMode('friends');
})();
