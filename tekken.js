(() => {
 'use strict';
 const E=window.DropTekken,$=id=>document.getElementById(id),canvas=$('tekken-stage'),ctx=canvas.getContext('2d');
 const images={};for(const key of ['fighters','arena','effects']){const im=new Image();im.src='assets/tekken/'+(key==='fighters'?'fighters-v2':key)+'.png';images[key]=im;}
 let selected=0,state=null,mode='menu',players=[],ownUid='solo',room=null,socket=null,paused=false,lastFrame=0,accumulator=0,lastEvent=0,effect=null,muted=false,audio=null,roomGeneration=0,reconnectTimer=null,reconnects=0,connectionSpec=null,matchId=null,pausedBeforeHelp=false;
 let command={axis:0,guard:false,move:null},held=new Set(),pointerHeld=new Map(),lastPacket='',lastSent=0,sequence=0;
 const status=text=>{$('tekken-status').textContent=text;};
 function profile(){return window.enjoyTekkenProfile||{name:'나'};}
 function refreshProfile(){$('account-label').textContent=window.enjoyUser?(profile().name+' · 엔조이'):'엔조이 아케이드';}
 window.addEventListener('enjoy-auth-ready',()=>{refreshProfile();if(socket&&room&&!window.enjoyUser)home();});
 function show(id,on){$(id).hidden=!on;}
 function panels(menu=false,rooms=false,playing=false,result=false){show('menu',menu);show('room-panel',rooms);show('hud',playing||result);show('controls',playing);show('result',result);}
 function sound(kind){if(muted||paused||document.hidden)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=kind==='hit'?'sawtooth':'triangle';o.frequency.setValueAtTime(kind==='hit'?150:kind==='block'?430:680,audio.currentTime);o.frequency.exponentialRampToValueAtTime(55,audio.currentTime+.13);g.gain.setValueAtTime(.075,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.18);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.2);}catch(_){}}
 function clearInput(){held.clear();pointerHeld.clear();command={axis:0,guard:false,move:null};document.querySelectorAll('#controls .active').forEach(b=>b.classList.remove('active'));sendInput(true);}
 function syncHeld(){command.axis=(held.has('right')?1:0)-(held.has('left')?1:0);command.guard=held.has('guard');sendInput();}
 function disconnect(){roomGeneration++;clearTimeout(reconnectTimer);reconnectTimer=null;connectionSpec=null;reconnects=0;const ws=socket;if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'leave'}));socket=null;ws?.close(1000,'나가기');room=null;}
 function home(){disconnect();clearInput();mode='menu';state=null;players=[];paused=false;lastEvent=0;matchId=null;effect=null;panels(true);$('callout').textContent='';refreshProfile();}
 function solo(){disconnect();mode='solo';paused=false;ownUid='solo';players=[{uid:'solo',name:profile().name,character:selected},{uid:'ai',name:'AI',character:1-selected}];state=E.start(players);lastEvent=0;effect=null;panels(false,false,true);clearInput();sound('fight');}
 function send(packet){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(packet));}
 function sendInput(force=false){if(mode!=='friends'||!state||state.phase==='finished')return;const packet={axis:command.axis,guard:command.guard,move:command.move},signature=JSON.stringify(packet),now=performance.now();if(!force&&signature===lastPacket&&now-lastSent<200)return;lastPacket=signature;lastSent=now;send({type:'input',seq:++sequence,matchId,input:packet});command.move=null;}
 async function friends(){if(!window.enjoyUser){status('친구 대전은 엔조이 멤버 로그인이 필요해요.');window.loginForTekken?.();return;}mode='friends';state=null;panels(false,true);$('room-info').textContent='방을 만들거나 친구의 코드를 입력하세요.';show('join-form',true);document.querySelector('[data-action="create"]').hidden=false;document.querySelector('[data-action="start"]').hidden=true;}
 function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(6));return Array.from(bytes,b=>chars[b%chars.length]).join('');}
 async function connect(roomCode,create=false,reconnect=false){
   if(!reconnect)disconnect();const generation=roomGeneration;connectionSpec={roomCode,create:false};mode='friends';ownUid=window.enjoyUser?.uid;
   $('room-info').textContent=reconnect?'다시 연결하고 있어요…':'엔조이 계정으로 연결 중…';
   try{const token=await window.getEnjoyIdToken?.(reconnect);if(generation!==roomGeneration)return;if(!token)throw Error('엔조이 멤버로 로그인해주세요.');
    const ws=new WebSocket(window.ENJOY_TEKKEN_SERVER.replace(/^http/,'ws')+'/rooms/'+roomCode);socket=ws;sequence=0;
    const timeout=setTimeout(()=>{if(ws===socket&&ws.readyState!==WebSocket.OPEN)ws.close();},10000);
    ws.onopen=()=>{clearTimeout(timeout);ws.send(JSON.stringify({type:'hello',token,create,character:selected}));};
    ws.onmessage=event=>{if(ws!==socket||generation!==roomGeneration)return;let packet;try{packet=JSON.parse(event.data);}catch(_){return;}
      if(packet.type==='error'){$('room-info').textContent=packet.message;status(packet.message);if(packet.fatal){connectionSpec=null;ws.close();}return;}
      if(packet.type==='snapshot'){reconnects=0;room=packet.room;players=room.players;const next=packet.matchId;if(matchId!==next){lastEvent=0;effect=null;clearInput();}matchId=next;state=packet.state;ownUid=window.enjoyUser.uid;
        if(state){panels(false,false,state.phase!=='finished',state.phase==='finished');if(state.phase==='finished')finish();sendInput(true);}
        else{panels(false,true);$('room-info').replaceChildren();const label=document.createElement('div');label.textContent='방 코드';const value=document.createElement('strong');value.className='room-code';value.textContent=roomCode;const list=document.createElement('div');list.textContent=players.map(p=>p.name).join(' vs ') + (players.length<2?' · 친구를 기다리는 중':' · 대전 준비 완료');$('room-info').append(label,value,list);show('join-form',false);document.querySelector('[data-action="create"]').hidden=true;const start=document.querySelector('[data-action="start"]');start.hidden=room.hostUid!==ownUid;start.disabled=players.length!==2;}
      }
      if(packet.type==='ended'){const message=packet.message;home();status(message);}
    };
    ws.onclose=()=>{clearTimeout(timeout);if(ws!==socket||generation!==roomGeneration)return;socket=null;clearInput();if(connectionSpec&&reconnects<4&&!paused){const delay=Math.min(1000*2**reconnects++,8000);$('callout').textContent='다시 연결 중';reconnectTimer=setTimeout(()=>connect(roomCode,false,true),delay);}else{$('callout').textContent='';panels(false,true);$('room-info').textContent='연결이 끊겼어요. 캐릭터 선택으로 돌아가 다시 참가해주세요.';}};
    ws.onerror=()=>{$('room-info').textContent='서버 연결을 확인하고 있어요…';};
   }catch(error){$('room-info').textContent=error.message;}
 }
 function finish(){if(!state)return;show('result',true);show('controls',false);const winner=players.find(p=>p.uid===state.winner);$('result-title').textContent=state.winner===ownUid?'YOU WIN':'YOU LOSE';$('result-text').textContent=(winner?.name||'상대')+' 승리 · '+state.players.map(p=>p.wins).join(' : ');const b=document.querySelector('[data-action="rematch"]');b.disabled=mode==='friends'&&room?.hostUid!==ownUid;b.textContent=b.disabled?'방장이 다음 대전을 시작할 수 있어요':'다시 대전';}
 function updateHUD(){show('pause',mode==='solo'&&!!state&&state.phase!=='finished');$('pause').textContent=paused?'계속하기':'일시 정지';if(!state)return;state.players.forEach((p,i)=>{$('name-'+i).textContent=(players[i]?.name||'플레이어')+' · '+(p.character===0?'태오':'서린');$('hp-'+i).style.width=p.hp+'%';$('energy-'+i).style.width=p.energy+'%';$('wins-'+i).textContent='●'.repeat(p.wins)+'○'.repeat(2-p.wins);});$('timer').textContent=Math.ceil(state.time).toString().padStart(2,'0');$('timer').classList.toggle('urgent',state.time<10);$('round-label').textContent='ROUND '+state.round;const mine=state.players.find(p=>p.uid===ownUid);$('special').disabled=!mine||mine.energy<100;$('special').classList.toggle('ready',mine?.energy>=100);
  $('callout').textContent=mode==='friends'&&!socket?'다시 연결 중':paused?'일시 정지':state.phase==='countdown'?(state.phaseTime>1?'ROUND '+state.round:'FIGHT'):state.phase==='round-end'?(state.roundWinner===null?'DRAW':'K.O.'):'';
  if(state.event&&state.event.id!==lastEvent){lastEvent=state.event.id;const e=state.event;if(['hit','block'].includes(e.kind)){effect={...e,at:performance.now(),character:state.players[e.actor].character};sound(e.kind);}if(e.kind==='fight')sound('fight');}
 }
 function drawFighter(p,index,t,preview=false){const atlas=images.fighters;if(!atlas.complete||!atlas.naturalWidth)return;const cellW=atlas.naturalWidth/4,cellH=atlas.naturalHeight/2,col=p.pose==='guard'?3:p.pose==='kick'||p.pose==='special'?2:p.pose==='punch'?1:0;const sourceY=p.character===0?128:576,sourceH=p.character===0?384:448,tail=p.character===0?0:46;const height=preview?365:310,width=height*cellW/sourceH;const x=p.x,y=preview?550:505,bob=(p.pose==='idle'||p.pose==='walk')?Math.sin(t/(p.pose==='walk'?80:210)+index)*3:0;
  ctx.save();ctx.translate(x,y+bob);ctx.fillStyle='#06081165';ctx.beginPath();ctx.ellipse(0,0,65,12,0,0,Math.PI*2);ctx.fill();const face=state?state.players[1-index].x>p.x: index===0;if(!face)ctx.scale(-1,1);if(p.pose==='hurt'){ctx.globalAlpha=.75;ctx.rotate(-.1);}ctx.drawImage(atlas,col*cellW,sourceY,cellW,sourceH,-width/2,-height+height*tail/sourceH,width,height);ctx.restore();
 }
 function draw(t){ctx.clearRect(0,0,1100,620);if(images.arena.complete&&images.arena.naturalWidth)ctx.drawImage(images.arena,0,0,1100,620);else{ctx.fillStyle='#272033';ctx.fillRect(0,0,1100,620);}
  const shade=ctx.createLinearGradient(0,0,0,620);shade.addColorStop(0,'#07081380');shade.addColorStop(.5,'#07081300');shade.addColorStop(1,'#07081360');ctx.fillStyle=shade;ctx.fillRect(0,0,1100,620);
  if(state){for(let i=0;i<2;i++)drawFighter(state.players[i],i,t);}else{drawFighter({x:740,character:selected,pose:'idle'},0,t,true);drawFighter({x:1000,character:1-selected,pose:'guard'},1,t,true);}
  if(effect){const age=(t-effect.at)/1000;if(age<.4&&images.effects.complete&&images.effects.naturalWidth){const im=images.effects,cell=im.naturalWidth/2,cellH=im.naturalHeight/2,row=effect.move==='special'?1:0,size=effect.move==='special'?280:160;ctx.save();ctx.globalAlpha=1-age/.4;ctx.globalCompositeOperation='screen';ctx.drawImage(im,effect.character*cell,row*cellH,cell,cellH,effect.x-size/2,350-size/2,size,size);ctx.restore();if(effect.combo>1){ctx.font='italic 800 22px system-ui';ctx.fillStyle='#ffe5ba';ctx.textAlign='center';ctx.fillText(effect.combo+' HIT COMBO',effect.x,255);}}else if(age>=.4)effect=null;}
 }
 function frame(t){const delta=lastFrame?Math.min((t-lastFrame)/1000,.1):0;lastFrame=t;if(mode==='solo'&&state&&!paused&&!document.hidden){accumulator+=delta;while(accumulator>=E.STEP){E.tick(state,{solo:command,ai:E.bot(state,1)},E.STEP);command.move=null;accumulator-=E.STEP;}if(state.phase==='finished')finish();}if(mode==='friends'&&state&&!paused)sendInput();updateHUD();draw(t);requestAnimationFrame(frame);}
 function move(name){if(!state||paused||state.phase!=='playing')return;if(name==='special'&&state.players.find(p=>p.uid===ownUid)?.energy<100)return;command.move=name;sendInput(true);sound('tap');}
 document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>{selected=Number(button.dataset.character);document.querySelectorAll('[data-character]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
 document.querySelectorAll('[data-hold]').forEach(button=>{button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);pointerHeld.set(event.pointerId,button.dataset.hold);held.add(button.dataset.hold);button.classList.add('active');syncHeld();});const release=event=>{const key=pointerHeld.get(event.pointerId);pointerHeld.delete(event.pointerId);if(key&&!Array.from(pointerHeld.values()).includes(key))held.delete(key);button.classList.remove('active');syncHeld();};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);});
 document.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('pointerdown',event=>{event.preventDefault();move(button.dataset.move);}));
 const keymap={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',l:'guard',' ':'guard'},attackmap={j:'punch',k:'kick',i:'special'};
 window.addEventListener('keydown',event=>{if(event.target.matches('input')||$('help').open)return;if(event.key==='Escape'){if(mode==='solo'){paused=!paused;clearInput();}else window.leaveTekkenPage?.();return;}const key=event.key.length===1?event.key.toLowerCase():event.key;if(keymap[key]&&state){event.preventDefault();held.add(keymap[key]);syncHeld();}if(attackmap[key]&&state){event.preventDefault();if(!event.repeat)move(attackmap[key]);}});
 window.addEventListener('keyup',event=>{const key=event.key.length===1?event.key.toLowerCase():event.key;if(keymap[key]){held.delete(keymap[key]);syncHeld();}});
 window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{clearInput();if(document.hidden&&mode==='solo')paused=true;});
 $('join-form').addEventListener('submit',event=>{event.preventDefault();const id=$('room-code').value.trim().toUpperCase();if(/^[A-Z2-9]{6}$/.test(id))connect(id);});
 document.addEventListener('click',async event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='solo')solo();if(action==='friends')friends();if(action==='create')connect(code(),true);if(action==='room-back'||action==='home')home();if(action==='start'||action==='rematch'){if(mode==='solo')solo();else send({type:'start'});}
  if(action==='pause'){paused=!paused;clearInput();}if(action==='exit'){window.pauseTekkenGame();window.leaveTekkenPage?.();}if(action==='sound'){muted=!muted;event.target.textContent=muted?'소리 꺼짐':'소리 켜짐';}
  if(action==='help'){pausedBeforeHelp=paused;if(mode==='solo')paused=true;clearInput();$('help').showModal();}if(action==='help-close'){$('help').close();}
  if(action==='landscape'){try{await document.documentElement.requestFullscreen?.();await screen.orientation?.lock?.('landscape');}catch(_){}}
 });
 $('help').addEventListener('close',()=>{if(mode==='solo')paused=pausedBeforeHelp;});
 window.pauseTekkenGame=()=>{paused=true;clearInput();if(mode==='friends')home();};window.openDropTekken=()=>{paused=false;lastFrame=0;refreshProfile();};
 window.addEventListener('pagehide',()=>disconnect());window.addEventListener('resize',()=>{if(innerHeight>innerWidth){clearInput();if(mode==='solo')paused=true;}});
 home();requestAnimationFrame(frame);
})();
