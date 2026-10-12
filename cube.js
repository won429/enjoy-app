(() => {
  'use strict';
  const E = window.DropCube, L=window.CubeLayout, content = document.getElementById('cube-content'), status = document.getElementById('cube-status'), connection = document.getElementById('cube-connection');
  let mode='solo', count=2, room=null, state=null, code='', active=true, selected=[], draft=null, soloPlayers=[], soloTimer=null, socket=null, lobby=null, rooms=[], live=false, pending=null, pendingTimer=null, reconnectTimer=null, messageTimer=null, lastUid='', generation=0, lobbyGeneration=0, retry=0, clockOffset=0, sort='color', sound=true, audio=null, drag=null, suppressClickUntil=0, lastPaint=new Map(), fitFrame=null, draftLayout=[], rackSlots=[], landingOrigin=null, lastAnimatedMove="", showErrors=false;
  const TURN_MS=30000, screen=document.getElementById('cube-screen');
  try { sound=localStorage.getItem('drop-cube-sound')!=='off'; } catch (_) {}
  const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const user = () => window.enjoyUser?.uid || '';
  const you = () => mode==='solo'?'you':user();
  const key = () => 'drop-cube-room-'+user();
  const people = () => mode==='solo'?soloPlayers.map(p=>p.uid==='you'&&window.enjoyUser?{...p,name:window.enjoyCubeProfile?.name||window.enjoyUser.displayName||'나',photoURL:window.enjoyCubeProfile?.photoURL||window.enjoyUser.photoURL||'',account:true}:p):room?.players||[];
  const name = uid => people().find(p=>p.uid===uid)?.name || '친구';
  const players = () => people().slice();
  const mine = () => !!state && state.turnUid===you() && !state.winnerUid;
  const canEdit = () => active && mine() && !pending && (mode==='solo'||live) && (!state.turnDeadline || state.turnDeadline>Date.now()+(mode==='friends'?clockOffset:0));
  const hintsLeft = () => Math.max(0,E.HINT_LIMIT-(state?.hintsUsed?.[you()]||0));
  const btn=(action,label,cls='',disabled=false,attrs='')=>`<button class="cube-btn ${cls}" data-action="${action}" ${disabled?'disabled':''} ${attrs}>${label}</button>`;
  function note(message) { status.textContent=message; clearTimeout(messageTimer); if(message) messageTimer=setTimeout(()=>{status.textContent='';},6500); }
  const mediaEffects=Object.fromEntries(['pick','draw','done'].map(kind=>[kind,{element:new Audio('assets/cube/sound-'+kind+'.wav'),unlocked:false,used:false}]));
  function unlockAudio() {
    if(!sound)return;
    try {
      if(navigator.audioSession)navigator.audioSession.type='playback';
      else for(const effect of Object.values(mediaEffects))if(!effect.unlocked){
        effect.element.muted=true;
        effect.element.play().then(()=>{effect.unlocked=true;if(!effect.used){effect.element.pause();effect.element.currentTime=0;}effect.element.muted=false;effect.element.volume=1;}).catch(()=>{});
      }
      audio ||= new (window.AudioContext||window.webkitAudioContext)();
      audio.resume().catch(()=>{});
    }catch(_){}
  }
  function beep(kind='pick') {
    if(!sound) return;
    unlockAudio();
    if(!navigator.audioSession){
      const effect=mediaEffects[kind]||mediaEffects.pick;effect.used=true;effect.element.muted=false;effect.element.volume=1;effect.element.currentTime=0;
      effect.element.play().catch(()=>{});return;
    }
    try { const osc=audio.createOscillator(), gain=audio.createGain(); osc.connect(gain);gain.connect(audio.destination); osc.type='sine';osc.frequency.value=kind==='done'?740:kind==='draw'?260:480;gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);osc.start();osc.stop(audio.currentTime+.13); }catch(_){}
  }
  function avatar(p,i=0) {
    if(!p.bot&&(p.account||mode==='friends')){
      let photo='';try{const url=new URL(p.photoURL||'');if(url.protocol==='https:'&&!url.username&&!url.password)photo=url.href;}catch(_){}
      return `<span class="cube-avatar cube-member-avatar" aria-hidden="true"><span class="cube-initial">${esc(Array.from(p.name||'?')[0])}</span>${photo?`<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer" draggable="false">`:''}</span>`;
    }
    return `<span class="cube-avatar" style="--avatar-x:${(i%5)*25}%" aria-hidden="true"></span>`;
  }
  content.addEventListener('error',event=>{if(event.target.matches('.cube-member-avatar img'))event.target.remove();},true);
  function tile(t,where,disabled=false,index=0) {
    const colors={red:'빨강',blue:'파랑',orange:'주황',black:'검정',joker:'조커'};
    return `<button draggable="false" class="cube-tile ${selected.includes(t.id)?'selected':''}" data-action="tile" data-id="${esc(t.id)}" data-where="${where}" data-slot="${index}" data-color="${esc(t.color)}" aria-label="${colors[t.color]} ${t.n||''}${selected.includes(t.id)?', 선택됨':''}" aria-pressed="${selected.includes(t.id)}" style="--tile-index:${index}" ${disabled?'disabled':''}><small>${t.color==='joker'?'':esc(colors[t.color])}</small>${t.color==='joker'?'<i class="ph ph-smiley" aria-hidden="true"></i>':t.n}</button>`;
  }
  function currentTiles() { return new Map([...(state?.table.flat()||[]),...(state?.hands[you()]||[])].map(t=>[t.id,t])); }
  function resetDraft() { showErrors=false;selected=[];draft=state?.table.map(row=>row.map(t=>t.id))||null;draftLayout=draft?L.ensure(draft,state.tableLayout):[]; }
  function statusText() { connection.textContent=mode==='solo'?'기기에서 플레이':live?'실시간 연결':socket||lobby?'연결 중':'연결 끊김';connection.classList.toggle('live',mode==='friends'&&live); }
  function renderSetup() {
    const logo=[{id:'logo-r',color:'red',n:10},{id:'logo-b',color:'blue',n:10},{id:'logo-o',color:'orange',n:10},{id:'logo-j',color:'joker',n:0}].map(t=>tile(t,'logo',true)).join('');
    let panel=mode==='solo'?`<h3>몇 명이 함께할까요?</h3><p class="cube-caption">나와 가상 플레이어가 한 테이블에서 만나요.</p><div class="cube-counts">${[2,3,4].map(n=>`<button data-action="count" data-count="${n}" aria-pressed="${count===n}">${n}명</button>`).join('')}</div>${btn('solo-start','게임 시작','wide')}<p class="cube-note">로그인 없이, 한 차례에 30초씩 즐겨요.</p>`:
    !user()?`<h3>멤버와 함께 플레이</h3><p class="cube-caption">드롭에서 멤버 계정으로 로그인하면 방을 만들고 친구와 함께할 수 있어요.</p>${btn('login','드롭으로 돌아가기','wide')}`:
    `${btn('create','새 방 만들기','wide',!!socket)}<div class="cube-join"><input id="cube-code" aria-label="6자리 방 코드" maxlength="6" placeholder="방 코드 6자리" autocomplete="off" autocapitalize="characters">${btn('join','입장','secondary',!!socket)}</div><div class="cube-room-list"><h3>친구들의 테이블</h3>${rooms.length?rooms.map(r=>`<div class="cube-room-item"><div><strong>${esc(r.title)}</strong><small>${esc(r.id)} · ${r.playerCount}/4명 · ${r.status==='waiting'?'대기 중':r.status==='finished'?'게임 종료':'플레이 중'}</small></div>${btn('join-listed','입장','secondary',r.status!=='waiting'||r.playerCount>=4||!!socket,`data-code="${esc(r.id)}"`)}</div>`).join(''):`<p class="cube-caption">${lobby?.readyState===WebSocket.OPEN?'열려 있는 방이 없어요. 첫 테이블을 만들어보세요.':'친구들의 방을 연결하고 있어요.'}</p>`}</div>`;
    content.innerHTML=`<div class="cube-setup"><div class="cube-hero"><span class="cube-kicker">A LITTLE STRATEGY. A LOT OF FUN.</span><div class="cube-logo">${logo}</div><h2>타일 하나로 바뀌는 판</h2><p>숫자를 잇고, 색을 모으고.<br>나만의 한 수를 내려놓으세요.</p></div><div class="cube-panel"><div class="cube-modes"><button data-action="mode-solo" aria-pressed="${mode==='solo'}">혼자하기</button><button data-action="mode-friends" aria-pressed="${mode==='friends'}">친구와 하기</button></div>${panel}</div></div>`;
  }
  function renderWaiting() {
    const host=room.hostUid===user();
    content.innerHTML=`<div class="cube-setup"><div class="cube-panel"><div class="cube-room-code"><div><small>친구에게 알려줄 방 코드</small><strong>${esc(code)}</strong></div>${btn('copy','코드 복사','secondary')}</div><h3>테이블을 준비하고 있어요</h3><p class="cube-caption">${esc(room.notice||'친구와 함께, 또는 가상 플레이어를 추가해 시작하세요.')}</p>${room.players.map((p,i)=>`<div class="cube-wait-player">${avatar(p,i)}<div><strong>${esc(p.name)}</strong><small>${p.uid===room.hostUid?'방장':p.bot?'가상 플레이어':'멤버'}${p.uid===user()?' · 나':''}</small></div>${host&&p.bot?btn('remove-bot','삭제','secondary',!live||!!pending,`data-uid="${esc(p.uid)}"`):''}</div>`).join('')}<div class="cube-wait-actions">${host?btn('add-bot','가상 플레이어 +','secondary',room.players.length>=4||!live||!!pending)+btn('start','게임 시작','',room.players.length<2||!live||!!pending):'<p class="cube-caption">방장이 시작하면 게임이 열려요.</p>'}</div><button class="cube-leave" data-action="leave" ${!live||pending?'disabled':''}>방 나가기</button></div></div>`;
  }
  function renderResult() {
    const ranking=mode==='solo'?E.rankings(state):state.rankings;
    content.innerHTML=`<div class="cube-setup"><div class="cube-panel cube-result"><i class="ph ph-trophy" aria-hidden="true"></i><h2>${esc(name(state.winnerUid))} 승리!</h2><p class="cube-caption">${state.blocked?'더미가 비고 모두 차례를 넘겼어요. 남은 타일 점수로 승자를 정했습니다.':'받침대의 모든 타일을 내려놓았어요.'}</p>${ranking.map((r,i)=>`<div class="cube-score"><div><strong>${i+1}. ${esc(name(r.uid))}</strong><small>남은 ${r.remaining}장 · 타일 점수 ${r.penalty}</small></div><b>${r.score>0?'+':''}${r.score}점</b></div>`).join('')}${mode==='solo'?btn('solo-start','한 판 더 하기','wide'):room.hostUid===user()?btn('start','새 판 시작','wide',!live||!!pending):'<p class="cube-caption">방장이 새 판을 시작할 수 있어요.</p>'}<button class="cube-leave" data-action="${mode==='solo'?'solo-exit':'leave'}">${mode==='solo'?'인원 선택으로':'방 나가기'}</button></div></div>`;
  }
  function renderMatch() {
    const map=currentTiles(), edit=canEdit(), me=you(), myself=people().find(p=>p.uid===me)||{name:'나'}, opponents=players().filter(p=>p.uid!==me);
    const rows=draft||state.table.map(row=>row.map(t=>t.id)), onBoard=new Set(rows.flat());
    const rack=state.hands[me]?.filter(t=>!onBoard.has(t.id))||[];
    rack.sort(sort==='number'?(a,b)=>a.n-b.n||E.COLORS.indexOf(a.color)-E.COLORS.indexOf(b.color):(a,b)=>E.COLORS.indexOf(a.color)-E.COLORS.indexOf(b.color)||a.n-b.n);
    const ordered=[...rack.map(t=>t.id),...(state.hands[me]||[]).filter(t=>onBoard.has(t.id)).map(t=>t.id)];
    rackSlots=L.syncRack(rackSlots,(state.hands[me]||[]).map(t=>t.id),ordered);
    const columns=Math.max(10,Math.ceil(rackSlots.length/2));
    const slots=Array.from({length:columns*2},(_,i)=>{const id=rackSlots[i];return id&&!onBoard.has(id)?tile(map.get(id),'rack',!edit,i):`<span class="cube-rack-space" data-slot="${i}" aria-hidden="true"></span>`;}).join('');
    const played=state.hands[me]?.length-rack.length;
    const opening=rows.filter(row=>row.every(id=>state.hands[me].some(t=>t.id===id))).reduce((sum,row)=>sum+(E.meld(row.map(id=>map.get(id)))?.points||0),0);
    const pool=mode==='solo'?state.pool.length:state.poolCount;
    const last=state.lastMove?`${name(state.lastMove.uid)} · ${state.lastMove.type==='draw'?(state.lastMove.count?'1장 뽑음':'차례 넘김'):`${state.lastMove.count}장 냄`}`:'타일을 끌어 테이블에 놓으세요';
    const seat=(p,i,self=false)=>`<div data-uid="${esc(p.uid)}" class="cube-seat ${self?'cube-self':''} ${state.turnUid===p.uid?'active':''}"><div class="cube-portrait">${avatar(p,i)}${state.turnUid===p.uid?'<span class="cube-turn-ring" aria-hidden="true"></span><span id="cube-clock" class="cube-seat-clock" role="timer" aria-label="남은 차례 시간"></span>':''}</div><div class="cube-seat-label"><strong>${esc(p.name)}</strong><span><i class="ph ph-cards" aria-hidden="true"></i> ${state.hands[p.uid].length}</span></div><small>${state.opened[p.uid]?'등록 완료':'첫 등록 전'}</small></div>`;
    draftLayout=L.ensure(rows,draftLayout);
    const board=rows.some(row=>row.length)?rows.map((row,i)=>row.length?`<div class="cube-meld ${E.meld(row.map(id=>map.get(id)))?'':'invalid'}" data-row="${i}" aria-label="${i+1}번 묶음">${row.map(id=>tile(map.get(id),'table',!edit||!state.opened[me]&&!state.hands[me].some(t=>t.id===id))).join('')}</div>`:'').join(''):
      `<div class="cube-empty"><h2>숫자를 잇고,<br>색을 모으세요</h2><p>패를 끌어 놓으세요 · 첫 등록은 30점 이상</p></div>`;
    content.innerHTML=`<div class="cube-match ${showErrors?'cube-validation-errors':''}" data-player-count="${people().length}" ${showErrors?'data-invalid="true"':''}>
      <aside class="cube-players-rail" aria-label="플레이어">${opponents.map((p,i)=>seat(p,i)).join('')}${seat(myself,3,true)}</aside>
      <div class="cube-turnbar"><strong class="${mine()?'myturn':''}">${mine()?'나의 차례':esc(name(state.turnUid))+'의 차례'}</strong><span>${mode==='friends'?'친구와 플레이':'혼자하기'}${code&&mode==='friends'?' · '+esc(code):''}</span></div>
      <div class="cube-board" aria-label="공유 테이블">${board}</div>
      <aside class="cube-game-controls" aria-label="게임 조작" data-editing="${JSON.stringify(rows.filter(row=>row.length))!==JSON.stringify(state.table.map(row=>row.map(t=>t.id)))}">
        <div class="cube-registration"><i class="ph ph-squares-four" aria-hidden="true"></i><strong>${state.opened[me]?'등록 완료':opening+' / 30'}</strong><small>${state.opened[me]?'타일을 자유롭게 조합':'첫 등록 점수'}</small></div>
        <div class="cube-sort-controls"><button data-action="sort-number" aria-label="숫자순 정렬" aria-pressed="${sort==='number'}"><b aria-hidden="true">789</b><small>숫자순</small></button><button data-action="sort-color" aria-label="색상순 정렬" aria-pressed="${sort==='color'}"><b aria-hidden="true">777</b><small>색상순</small></button></div>
        <button class="cube-draw" data-action="draw" aria-label="${pool?'1장 뽑기':'차례 넘기기'}" ${!edit?'disabled':''}><i class="ph ph-plus" aria-hidden="true"></i><span>${pool?'1장 뽑기':'차례 넘김'}</span><small><i class="ph ph-cards" aria-hidden="true"></i> ${pool}</small></button>
        <button class="cube-undo" data-action="undo" aria-label="이번 차례 되돌리기" ${!edit?'disabled':''}><i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i></button>
        <button class="cube-submit" data-action="commit" ${!edit||!played?'disabled':''}><i class="ph ph-check" aria-hidden="true"></i><span>${pending?'확인 중…':'차례 완료'}</span></button>
      </aside>
      <div class="cube-rack-area">
        <div class="cube-draft-tools"><span>${selected.length?`${selected.length}장 함께 이동`:played?`${played}장 내려놓는 중`:esc(last)}</span><button data-action="hint" aria-label="힌트, ${hintsLeft()}회 남음" title="한 게임에 2번 · ${hintsLeft()}회 남음" ${!edit||!hintsLeft()?'disabled':''}><i class="ph ph-lightbulb" aria-hidden="true"></i><small aria-hidden="true">${hintsLeft()}</small></button></div>
        <div class="cube-rack-shell"><div class="cube-rack" aria-label="내 타일 받침대" style="--rack-columns:${columns}">${slots}${!rack.length?'<p class="cube-rack-empty">차례 완료를 눌러 타일을 제출하세요.</p>':''}</div></div>
      </div>
      ${mode==='friends'?`<button class="cube-match-leave" data-action="leave" ${pending?'disabled':''}><i class="ph ph-sign-out" aria-hidden="true"></i><span>방 나가기</span></button>`:''}
    </div>`;
    fitBoard(); updateClock();
  }
  function render() {
    cancelDrag(); captureTiles();
    const rackScroll=content.querySelector('.cube-rack')?.scrollLeft||0, outerScroll=content.scrollTop;
    const input=document.getElementById('cube-code'), inputValue=input?.value||'', focused=document.activeElement, focusId=focused?.dataset?.id, focusAction=focused?.dataset?.action, inputFocused=focused===input;
    document.getElementById('cube-screen').classList.toggle('cube-playing',!!state&&!state.winnerUid);
    statusText();if(state?.winnerUid) renderResult();else if(state) renderMatch();else if(room) renderWaiting();else renderSetup();
    const board=content.querySelector('.cube-board'),rack=content.querySelector('.cube-rack');if(rack)rack.scrollLeft=rackScroll;content.scrollTop=outerScroll; animateTiles();
    const field=document.getElementById('cube-code');if(field){field.value=inputValue;if(inputFocused)field.focus({preventScroll:true});}
    if(focusId){const next=Array.from(content.querySelectorAll('[data-id]')).find(el=>el.dataset.id===focusId);next?.focus({preventScroll:true});}
    else if(focusAction&&!inputFocused&&content.contains(focused)===false){Array.from(content.querySelectorAll('[data-action]')).find(el=>el.dataset.action===focusAction)?.focus({preventScroll:true});}
  }
  function updateClock() {
    const el=document.getElementById('cube-clock');
    if(el&&state?.turnDeadline) {
      const seconds=Math.max(0,Math.ceil((state.turnDeadline-Date.now()-(mode==='friends'?clockOffset:0))/1000));
      el.textContent=seconds;el.setAttribute('aria-label','남은 차례 시간 '+seconds+'초');el.closest('.cube-portrait')?.style.setProperty('--turn-angle',Math.max(0,Math.min(360,(state.turnDeadline-Date.now()-(mode==='friends'?clockOffset:0))/TURN_MS*360))+'deg');el.closest('.cube-seat')?.classList.toggle('urgent',seconds<=10);
    }
  }
  setInterval(updateClock,250);
  function stopSolo() { clearTimeout(soloTimer);soloTimer=null; }
  function advanceSolo(action) { state=E.move(state,state.turnUid,action);state.tableLayout=action.type==='commit'?L.normalize(state.table,action.layout):L.ensure(state.table,state.tableLayout);state.turnDeadline=state.winnerUid?null:Date.now()+TURN_MS;resetDraft(); }
  function scheduleSolo() {
    stopSolo();if(!active||mode!=='solo'||!state||state.winnerUid) return;
    const remaining=Math.max(0,state.turnDeadline-Date.now());
    soloTimer=setTimeout(()=>{
      if(!active||mode!=='solo'||!state||state.winnerUid)return;
      try {const timeout=Date.now()>=state.turnDeadline;advanceSolo(timeout?{type:'draw'}:E.botAction(state,state.turnUid));beep(timeout?'draw':'done');render();if(timeout)note('30초가 끝나 미완성 배치를 취소하고 1장을 뽑았어요.');scheduleSolo();}catch(e){note(e.message);}
    },mine()?remaining:Math.min(1300,remaining));
  }
  function beginSolo() { rackSlots=[];lastAnimatedMove='';disconnectRoom();stopLobby();room=null;mode='solo';soloPlayers=[{uid:'you',name:'나'},...Array.from({length:count-1},(_,i)=>({uid:'bot-'+i,name:['루미','모모','하루'][i],bot:true}))];state=E.start(soloPlayers.map(p=>p.uid));state.turnDeadline=Date.now()+TURN_MS;resetDraft();note('14장씩 나눴어요. '+name(state.turnUid)+'부터 시작!');beep('done');render();scheduleSolo(); }
  function disconnectRoom() { generation++;clearTimeout(reconnectTimer);reconnectTimer=null;clearTimeout(pendingTimer);pendingTimer=null;const old=socket;socket=null;live=false;old?.close(); }
  function stopLobby() { lobbyGeneration++;const old=lobby;lobby=null;old?.close(); }
  function clearRoom() { disconnectRoom();pending=null;room=null;state=null;draft=null;selected=[];code='';try{localStorage.removeItem(key());}catch(_){}render();connectLobby(); }
  async function connectRoom(roomCode,create=false) {
    if(!user()||!window.getEnjoyIdToken) {note('먼저 멤버 계정으로 로그인해주세요.');return;}
    if(!/^[A-Z2-9]{6}$/.test(roomCode)){note('6자리 방 코드를 확인해주세요.');return;}
    disconnectRoom();stopLobby();const gen=generation, uid=user();code=roomCode;statusText();
    let token;try{token=await window.getEnjoyIdToken(retry>0);}catch(_){}
    if(gen!==generation||uid!==user()||!active||mode!=='friends') return;
    if(!token){note('멤버 로그인을 다시 확인해주세요.');render();return;}
    const ws=new WebSocket(window.ENJOY_CUBE_SERVER.replace(/^http/,'ws')+'/rooms/'+roomCode);socket=ws;render();
    let accepted=false, fatal=false;
    const handshake=setTimeout(()=>{if(!accepted&&socket===ws) ws.close();},12000);
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',token,create}));
    ws.onmessage=e=>{
      if(socket!==ws||gen!==generation||uid!==user())return;
      let p;try{p=JSON.parse(e.data);}catch(_){return;}
      if(p.type==='ready'){accepted=true;live=true;retry=0;clearTimeout(handshake);try{localStorage.setItem(key(),code);}catch(_){}if(pending){ws.send(JSON.stringify(pending));armPending();}statusText();}
      if(p.type==='snapshot'){
        const changed=room?.revision!==p.room.revision;if(room?.round!==p.room.round)rackSlots=[];room=p.room;state=p.state;clockOffset=(p.serverNow||Date.now())-Date.now();if(changed)resetDraft();render();
      }
      if(p.type==='ack'&&pending?.id===p.id){if(['commit','draw'].includes(pending.action.type))beep(pending.action.type==='draw'?'draw':'done');const leaving=pending.action.type==='leave',hinting=pending.action.type==='hint';pending=null;clearTimeout(pendingTimer);if(leaving)clearRoom();else if(hinting)showHint();else render();}
      if(p.type==='removed'){note(p.message||'방에서 나왔어요.');clearRoom();}
      if(p.type==='error'){
        if(p.id===pending?.id){pending=null;clearTimeout(pendingTimer);}
        note(p.message||'연결을 확인해주세요.');fatal=['room-missing','not-member','room-exists','too-many-connections'].includes(p.code)||!accepted&&p.code!=='auth-required';
        if(fatal){clearRoom();}else render();
      }
    };
    ws.onclose=()=>{clearTimeout(handshake);if(socket!==ws)return;socket=null;live=false;statusText();render();if(active&&mode==='friends'&&!fatal&&code&&(accepted||room)){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>connectRoom(code),Math.min(1000*2**retry++,15000));}else if(!accepted){note('방에 연결하지 못했어요. 다시 입장해주세요.');pending=null;render();connectLobby();}};
    ws.onerror=()=>{};
  }
  async function connectLobby() {
    if(!active||mode!=='friends'||room||socket||!user()||!window.getEnjoyIdToken||lobby) return;
    const gen=++lobbyGeneration,uid=user();let token;try{token=await window.getEnjoyIdToken();}catch(_){}
    if(gen!==lobbyGeneration||!token||uid!==user()||!active||mode!=='friends')return;
    const ws=new WebSocket(window.ENJOY_CUBE_SERVER.replace(/^http/,'ws')+'/rooms');lobby=ws;
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',token}));
    ws.onmessage=e=>{if(lobby!==ws)return;let p;try{p=JSON.parse(e.data);}catch(_){return;}if(p.type==='rooms'){rooms=p.rooms;live=true;render();}else if(p.type==='error'){note(p.message);}};
    ws.onclose=()=>{if(lobby!==ws)return;lobby=null;live=false;render();};ws.onerror=()=>{};
  }
  function armPending(){clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{if(pending&&active){note('연결을 다시 확인하고 있어요.');connectRoom(code);}},12000);}
  function send(action){
    if(mode==='solo'){try{if(action.type==='hint'){state=E.move(state,you(),action);showHint();return;}advanceSolo(action);beep(action.type==='draw'?'draw':'done');render();scheduleSolo();}catch(e){note(e.message);}return;}
    if(!live||socket?.readyState!==WebSocket.OPEN||pending){note('서버 연결을 기다려주세요.');return;}
    pending={type:'action',id:crypto.randomUUID(),revision:room.revision,action};socket.send(JSON.stringify(pending));armPending();render();
  }
  const splitRow = row => E.meld(row.map(id=>currentTiles().get(id)))?.kind!=='group';
  function placeAt(ids,point,free=false) {
    if(!canEdit()||!ids.length)return;
    showErrors=false;const next=L.move(draft,draftLayout,ids,point,{split:splitRow,free});draft=next.rows;draftLayout=next.layout;selected=[];beep();render();
  }
  function captureTiles() {
    lastPaint=new Map(Array.from(content.querySelectorAll('.cube-match .cube-tile'),el=>[el.dataset.id,{box:el.getBoundingClientRect(),where:el.dataset.where}]));
    if(landingOrigin){landingOrigin.ids.forEach((id,i)=>lastPaint.set(id,{box:{...landingOrigin.box,x:landingOrigin.box.x+i*landingOrigin.box.width},where:'drag'}));landingOrigin=null;}
  }
  function animateTiles() {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const draw=content.querySelector('.cube-draw')?.getBoundingClientRect(),actor=Array.from(content.querySelectorAll('.cube-seat')).find(el=>el.dataset.uid===state?.lastMove?.uid)?.querySelector('.cube-avatar')?.getBoundingClientRect();
    for(const el of content.querySelectorAll('.cube-match .cube-tile')) {
      const before=lastPaint.get(el.dataset.id),after=el.getBoundingClientRect();
      if(before) {
        const dx=before.box.x-after.x,dy=before.box.y-after.y,sx=before.box.width/after.width,sy=before.box.height/after.height;
        if(Math.abs(dx)+Math.abs(dy)>1||Math.abs(sx-1)>.01)el.animate([{translate:`${dx}px ${dy}px`,scale:`${sx} ${sy}`},{translate:'0px 0px',scale:'1 1'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
      }else if(draw){const origin=el.dataset.where==='table'&&actor?actor:draw;el.animate([{translate:`${origin.x+origin.width/2-after.x}px ${origin.y+origin.height/2-after.y}px`,scale:'.45',opacity:0,rotate:'-12deg'},{translate:'0px 0px',scale:'1',opacity:1,rotate:'0deg'}],{duration:360,delay:lastPaint.size?0:Math.min(Number(el.dataset.slot)||0,14)*22,easing:'cubic-bezier(.2,.8,.2,1)'});}
    }
    const move=state?.lastMove,tag=move?state.turn+':'+move.uid+':'+move.type+':'+move.count:'';
    if(move?.type==='draw'&&move.uid!==you()&&tag!==lastAnimatedMove&&draw){
      const seat=Array.from(content.querySelectorAll('.cube-seat')).find(el=>el.dataset.uid===move.uid)?.querySelector('.cube-avatar')?.getBoundingClientRect();
      if(seat){const card=document.createElement('span');card.className='cube-tile cube-flying-back';document.body.append(card);const flight=card.animate([{translate:`${draw.x}px ${draw.y}px`,scale:'.5',opacity:0},{translate:`${seat.x}px ${seat.y}px`,scale:'.3',opacity:1}],{duration:360,easing:'ease-out'});flight.onfinish=()=>card.remove();}
    }
    if(tag)lastAnimatedMove=tag;
  }
  function fitBoard() {
    const match=content.querySelector('.cube-match'),rack=content.querySelector('.cube-rack');
    if(match&&rack?.clientWidth){
      match.style.removeProperty('--tile-w');match.style.removeProperty('--tile-h');
      const base=parseFloat(getComputedStyle(rack.querySelector('.cube-tile,.cube-rack-space')||match).width)*.82||41,columns=Number(rack.style.getPropertyValue('--rack-columns'))||10;
      const width=Math.min(base,(rack.clientWidth-columns-1)/columns);
      if(width>0){match.style.setProperty('--tile-w',width+'px');match.style.setProperty('--tile-h',width*1.4+'px');}
    }
    const board=content.querySelector('.cube-board');if(!board||!board.clientWidth||!board.clientHeight)return;
    const rows=draft||state.table.map(row=>row.map(t=>t.id));draftLayout=L.ensure(rows,draftLayout);
    const base=matchMedia('(max-height:600px)').matches?34:50,fit=L.fit(rows,draftLayout,board.clientWidth-8,board.clientHeight-8,base);
    board.style.setProperty('--board-tile-w',fit.unit+'px');board.style.setProperty('--board-tile-h',fit.unit*L.TILE_HEIGHT+'px');board.style.setProperty('--board-font',fit.unit*.62+'px');
    board.dataset.unit=fit.unit;board.dataset.scale=(fit.unit/base).toFixed(3);
    for(const el of board.querySelectorAll('.cube-meld')){const p=draftLayout[Number(el.dataset.row)];el.style.left=4+p.x*fit.unit+'px';el.style.top=4+p.y*fit.unit+'px';}
  }
  new ResizeObserver(()=>{cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(fitBoard);}).observe(content);
  function returnTiles(ids,slot=null) {
    const original=new Set(state.table.flat().map(t=>t.id));
    if(ids.some(id=>original.has(id))){note('공유 테이블의 타일은 다른 위치로 옮겨주세요.');return false;}
    const remaining=L.remove(draft,draftLayout,ids,{split:splitRow});draft=remaining.rows;draftLayout=remaining.layout;if(slot!==null)rackSlots=L.moveRack(rackSlots,ids,slot);selected=[];beep();render();return true;
  }
  function selectTile(id) {selected=selected.includes(id)?selected.filter(t=>t!==id):[...selected,id];beep();render();}
  function showHint() {
    const hint=E.botAction(state,you());
    if(hint?.type==='commit'){draft=hint.table;draftLayout=L.ensure(draft,draftLayout);selected=[];showErrors=false;render();note('가능한 배치를 준비했어요. 힌트 '+hintsLeft()+'회 남음. 확인하고 차례 완료를 누르세요.');}
    else {render();note('배치 힌트를 찾지 못했어요. 힌트 '+hintsLeft()+'회 남음. 테이블을 재배열하거나 1장을 뽑아보세요.');}
  }
  function cancelDrag() {
    if(!drag)return;
    const current=drag;drag=null;
    if(screen.hasPointerCapture(current.pointer))screen.releasePointerCapture(current.pointer);
    current.ghost?.remove();current.source?.classList.remove('drag-source');content.querySelector('.drop-target')?.classList.remove('drop-target');
  }
  screen.addEventListener('pointerdown',event=>{
    if(event.button!==0||!canEdit()||drag)return;
    const source=event.target.closest('.cube-match .cube-tile:not(:disabled)');if(!source)return;
    event.preventDefault();source.focus({preventScroll:true});
    const box=source.getBoundingClientRect();unlockAudio();drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,grabX:event.clientX-box.x,grabY:event.clientY-box.y,source,downAt:Date.now(),free:event.altKey,ids:selected.includes(source.dataset.id)?selected.slice():[source.dataset.id],started:false};screen.setPointerCapture(event.pointerId);
  },{passive:false});
  screen.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    if(!drag.started&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
    if(!canEdit()){cancelDrag();return;}event.preventDefault();
    if(!drag.started){drag.free ||=Date.now()-drag.downAt>=450;drag.started=true;drag.ghost=drag.source.cloneNode(true);drag.ghost.classList.remove('selected');drag.ghost.classList.add('cube-drag-ghost');drag.ghost.classList.toggle('cube-free-drag',drag.free);drag.ghost.style.width=drag.source.offsetWidth+'px';drag.ghost.style.height=drag.source.offsetHeight+'px';drag.ghost.setAttribute('aria-hidden','true');document.body.append(drag.ghost);drag.source.classList.add('drag-source');}
    drag.ghost.style.left=event.clientX-drag.grabX+'px';drag.ghost.style.top=event.clientY-drag.grabY+'px';
    content.querySelector('.drop-target')?.classList.remove('drop-target');
    document.elementFromPoint(event.clientX,event.clientY)?.closest('.cube-meld,.cube-board,.cube-rack-shell')?.classList.add('drop-target');
  });
  screen.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    const current=drag,target=document.elementFromPoint(event.clientX,event.clientY),ghost=current.ghost?.getBoundingClientRect();
    if(current.started&&ghost)landingOrigin={ids:current.ids,box:{x:ghost.x,y:ghost.y,width:ghost.width,height:ghost.height}};
    event.preventDefault();cancelDrag();suppressClickUntil=Date.now()+350;
    if(!current.started){if(canEdit())selectTile(current.source.dataset.id);return;}
    if(!canEdit()||!target){landingOrigin=null;return;}
    if(target.closest('.cube-rack-shell')){
      const rack=content.querySelector('.cube-rack'),r=rack.getBoundingClientRect(),columns=Number(rack.style.getPropertyValue('--rack-columns'))||10;
      const slot=Math.min(columns*2-1,Math.max(0,Math.floor((event.clientY-r.y)/(r.height/2)))*columns+Math.min(columns-1,Math.max(0,Math.floor((event.clientX-r.x)/(r.width/columns)))));
      if(!returnTiles(current.ids,slot)){landingOrigin=null;render();}return;
    }
    const board=target.closest('.cube-board');if(!board){render();return;}
    const r=board.getBoundingClientRect(),unit=Number(board.dataset.unit);
    const x=ghost?ghost.x+ghost.width/2:event.clientX,y=ghost?ghost.y+ghost.height/2:event.clientY;
    placeAt(current.ids,{x:(x-r.x-4)/unit,y:(y-r.y-4)/unit},current.free);
  });
  screen.addEventListener('pointercancel',cancelDrag);
  screen.addEventListener('lostpointercapture',cancelDrag);
  // Suppress native selection, image dragging and long-press copy on the game tiles.
  for(const type of ['dragstart','selectstart','contextmenu'])screen.addEventListener(type,event=>{if(event.target.closest('.cube-match .cube-tile'))event.preventDefault();});
  screen.addEventListener('touchstart',event=>{if(event.target.closest('.cube-match .cube-tile:not(:disabled)')&&canEdit())event.preventDefault();},{passive:false});
  window.addEventListener('blur',cancelDrag);
  content.addEventListener('keydown',event=>{
    const tile=event.target.closest('.cube-match .cube-tile:not(:disabled)');if(!tile||!canEdit())return;
    const ids=selected.includes(tile.dataset.id)?selected.slice():[tile.dataset.id];
    if(event.key==='Enter'&&tile.dataset.where==='rack'){event.preventDefault();const point=L.freeSpace(draft,draftLayout,ids.length);placeAt(ids,{x:point.x+.5,y:point.y+.7});}
    else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();returnTiles(ids);}
    else if(tile.dataset.where==='table'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const row=Number(tile.closest('.cube-meld').dataset.row),p=draftLayout[row],index=draft[row].indexOf(tile.dataset.id);
      placeAt(ids,{x:Math.max(.5,p.x+index+.5+(event.key==='ArrowLeft'?-.5:event.key==='ArrowRight'?.5:0)),y:Math.max(.7,p.y+.7+(event.key==='ArrowUp'?-1.7:event.key==='ArrowDown'?1.7:0))},true);
    }
  });
  const portrait=matchMedia('(orientation:portrait)');
  function orientationChanged(){screen.inert=portrait.matches;if(portrait.matches&&document.getElementById('cube-rules').open)document.getElementById('cube-rules').close();cancelDrag();requestAnimationFrame(fitBoard);}
  portrait.addEventListener('change',orientationChanged);orientationChanged();
  document.querySelector('[data-action="rotate-back"]').addEventListener('click',()=>window.leaveCubePage?.());
  document.querySelector('[data-action="landscape"]').addEventListener('click',async()=>{
    try{await document.documentElement.requestFullscreen?.();await window.screen.orientation?.lock?.('landscape');}catch(_){}
  });
  content.addEventListener('click',handle);
  document.querySelector('.cube-header').addEventListener('click',handle);
  document.getElementById('cube-rules').addEventListener('click',handle);
  async function handle(event){
    if(Date.now()<suppressClickUntil&&event.target.closest('[data-action=tile]'))return;
    unlockAudio();
    const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;
    if(action==='rules'){document.getElementById('cube-rules').showModal();return;}
    if(action==='rules-close'){document.getElementById('cube-rules').close();return;}
    if(action==='sound'){sound=!sound;try{localStorage.setItem('drop-cube-sound',sound?'on':'off');}catch(_){}button.setAttribute('aria-pressed',String(sound));button.setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');button.innerHTML=`<i class="ph ph-speaker-${sound?'high':'slash'}" aria-hidden="true"></i>`;if(sound)beep();else {audio?.suspend().catch(()=>{});for(const {element} of Object.values(mediaEffects))element.pause();}return;}
    if(action==='back'){if(mode==='solo'&&state){stopSolo();state=null;resetDraft();render();}else window.leaveCubePage?.();return;}
    if(action==='mode-solo'){stopLobby();disconnectRoom();pending=null;mode='solo';render();return;}
    if(action==='mode-friends'){mode='friends';render();let saved='';try{saved=localStorage.getItem(key())||'';}catch(_){}if(saved&&user())connectRoom(saved);else connectLobby();return;}
    if(action==='login'){window.loginForCube?.();return;}
    if(action==='count'){count=Number(button.dataset.count);render();return;}
    if(action==='solo-start'){beginSolo();return;}
    if(action==='solo-exit'){stopSolo();state=null;resetDraft();render();return;}
    if(action==='create'){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const values=crypto.getRandomValues(new Uint32Array(6));connectRoom(Array.from(values,n=>alphabet[n%alphabet.length]).join(''),true);return;}
    if(action==='join'||action==='join-listed'){connectRoom(action==='join'?document.getElementById('cube-code').value.trim().toUpperCase():button.dataset.code);return;}
    if(action==='copy'){try{await navigator.clipboard.writeText(code);note('방 코드를 복사했어요.');}catch(_){note('방 코드: '+code);}return;}
    if(action==='start'||action==='add-bot'||action==='remove-bot'||action==='leave'){send({type:action,uid:button.dataset.uid});return;}
    if(['sort','sort-number','sort-color'].includes(action)){sort=action==='sort-number'?'number':action==='sort-color'?'color':sort==='color'?'number':'color';rackSlots=[];render();return;}
    if(!canEdit())return;
    if(action==='tile'){selectTile(button.dataset.id);return;}
    if(action==='return'){returnTiles(selected);return;}
    if(action==='undo'){resetDraft();render();return;}
    if(action==='hint'){if(hintsLeft())send({type:'hint'});return;}
    if(action==='draw'){resetDraft();send({type:'draw'});return;}
    if(action==='commit'){
      const table=draft.filter(row=>row.length),layout=draftLayout.filter((_,i)=>draft[i].length);
      try{const map=currentTiles();if(table.some(row=>!E.meld(row.map(id=>map.get(id)))))throw Error('빨간 테두리의 묶음을 먼저 완성해주세요.');
        // Use the same rule engine on the public view without exposing other hands.
        E.move(state,you(),{type:'commit',table});send({type:'commit',table,layout});
      }catch(e){showErrors=true;render();note(e.message);}return;
    }
  }
  window.pauseCubeGame=()=>{cancelDrag();audio?.suspend().catch(()=>{});for(const {element} of Object.values(mediaEffects))element.pause();active=false;stopSolo();disconnectRoom();stopLobby();};
  window.openDropCube=()=>{active=true;render();scheduleSolo();if(mode==='friends'){if(code)connectRoom(code);else connectLobby();}};
  window.addEventListener('enjoy-auth-ready',()=>{const uid=user();if(uid!==lastUid){disconnectRoom();stopLobby();pending=null;room=null;if(mode==='friends'){state=null;draft=null;selected=[];}code='';rooms=[];lastUid=uid;}render();if(active&&mode==='friends'){let saved='';try{saved=localStorage.getItem(key())||'';}catch(_){}if(saved&&uid)connectRoom(saved);else connectLobby();}});
  window.addEventListener('online',()=>{if(active&&mode==='friends'){if(code)connectRoom(code);else connectLobby();}});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('cube-rules').open)window.leaveCubePage?.();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSolo();}else if(active){scheduleSolo();if(mode==='friends'&&code&&!socket)connectRoom(code);}});
  const soundButton=document.querySelector('[data-action="sound"]');soundButton.setAttribute('aria-pressed',String(sound));soundButton.setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');soundButton.innerHTML=`<i class="ph ph-speaker-${sound?'high':'slash'}" aria-hidden="true"></i>`;
  render();
})();
