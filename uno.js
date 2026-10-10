(function (window, document) {
    'use strict';
    const game = window.EnjoyUno;
    const screen = document.getElementById('uno-screen');
    if (!game || !screen) return;
    const content = document.getElementById('uno-content');
    const status = document.getElementById('uno-status');
    const connection = document.getElementById('uno-connection');
    const colors = { red: ['빨강', '#ce3447', '●'], yellow: ['노랑', '#f0be3b', '◆'], green: ['초록', '#168664', '▲'], blue: ['파랑', '#2468c8', '■'], wild: ['와일드', '#242939', '✦'] };
    const labels = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '✦', wild4: '+4' };
    const names = { skip: '건너뛰기', reverse: '방향 바꾸기', draw2: '두 장 뽑기', wild: '색 바꾸기', wild4: '와일드 네 장 뽑기' };
    let code = '', room = null, state = null, busy = false, liveRoom = false, liveGame = false;
    let roomUnsub = null, gameUnsub = null, selectedCard = null, armed = false, lastUid = '', epoch = 0;
    let savedOverflow = '', previousFocus = null;
    let historyToken = '';
    const inertElements = new Map();
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const user = () => window.enjoyUser;
    const uid = () => user()?.uid || '';
    const storageKey = () => 'enjoy_uno_room_v1_' + uid();
    const open = () => !screen.hidden;
    const ready = () => !!(uid() && window.meetingAuthed && window.meetingDb && window.fsDoc && window.runTransaction && window.fsOnSnapshot && window.getDoc);
    const online = () => window.navigator.onLine !== false;
    const synchronized = () => liveRoom && (room?.status !== 'playing' && room?.status !== 'finished' || liveGame && state?.revision === room?.revision);
    const allowed = () => ready() && online() && !busy && (!room || synchronized());
    const roomRef = value => window.fsDoc('uno_rooms', value);
    const gameRef = value => window.fsDoc('uno_rooms', value, 'private', 'game');
    const name = value => room?.players.find(player => player.uid === value)?.name || '친구';
    const button = (action, text, disabled = false, secondary = false) => '<button type="button" class="uno-btn' + (secondary ? ' uno-btn-secondary' : '') + '" data-uno-action="' + action + '"' + (disabled ? ' disabled' : '') + '>' + text + '</button>';
    function random() {
        if (!window.crypto?.getRandomValues) return Math.random();
        return window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    }
    function persist(value) {
        try { if (value) window.localStorage.setItem(storageKey(), value); else window.localStorage.removeItem(storageKey()); } catch (_) {}
    }
    function storedCode() {
        try { const value = window.localStorage.getItem(storageKey()) || ''; return /^[A-Z2-9]{6}$/.test(value) ? value : ''; } catch (_) { return ''; }
    }
    function makeCode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return Array.from({ length: 6 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
    }
    function stop() {
        if (roomUnsub) roomUnsub();
        if (gameUnsub) gameUnsub();
        roomUnsub = gameUnsub = null;
        liveRoom = liveGame = false;
    }
    function clearRoom() { stop(); persist(''); code = ''; room = state = selectedCard = null; armed = false; }
    function errorText(error) {
        if (error?.code === 'permission-denied') return '게임의 Firebase 접근 권한이 없어요. uno_rooms 규칙 설정을 확인해주세요.';
        if (['unavailable', 'deadline-exceeded'].includes(error?.code) || !online()) return '인터넷 연결을 확인해주세요. 연결이 복구되면 방에 다시 들어올 수 있어요.';
        return error?.message || '게임 연결에 실패했어요. 잠시 후 다시 시도해주세요.';
    }
    function watch(value) {
        stop();
        code = value;
        room = state = selectedCard = null;
        armed = false;
        const currentEpoch = epoch, currentUid = uid();
        roomUnsub = window.fsOnSnapshot(roomRef(code), { includeMetadataChanges: true }, snapshot => {
            if (currentEpoch !== epoch || uid() !== currentUid) return;
            if (!snapshot.exists()) {
                // A cache miss is not evidence that the room has been deleted.
                if (snapshot.metadata.fromCache) return;
                clearRoom(); status.textContent = '이 방은 더 이상 존재하지 않아요.'; render(); return;
            }
            const next = snapshot.data();
            if (!next.playerIds.includes(currentUid) || next.status === 'closed') {
                clearRoom(); status.textContent = '방에서 나왔어요. 새 방을 만들거나 친구의 방에 참가해주세요.'; render(); return;
            }
            room = next;
            liveRoom = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
            if (['playing', 'finished'].includes(room.status) && !gameUnsub) {
                gameUnsub = window.fsOnSnapshot(gameRef(code), { includeMetadataChanges: true }, gameSnapshot => {
                    if (currentEpoch !== epoch || uid() !== currentUid) return;
                    state = gameSnapshot.exists() ? gameSnapshot.data() : null;
                    liveGame = !gameSnapshot.metadata.fromCache && !gameSnapshot.metadata.hasPendingWrites;
                    if (selectedCard && (!state?.hands[currentUid]?.some(card => card.id === selectedCard.id) || state.turnUid !== currentUid || state.challenge)) selectedCard = null;
                    render();
                }, error => { liveGame = false; status.textContent = errorText(error); render(); });
            } else if (!['playing', 'finished'].includes(room.status)) {
                if (gameUnsub) gameUnsub();
                gameUnsub = null; state = selectedCard = null; liveGame = false;
            }
            render();
        }, error => { liveRoom = false; status.textContent = errorText(error); render(); });
        render();
    }
    async function profile() {
        if (!ready()) throw new Error('Firebase에 연결된 멤버 계정으로 로그인해주세요.');
        const current = user();
        const snapshot = await window.getDoc(window.fsDoc('members', current.uid));
        const member = snapshot.exists() ? snapshot.data() : null;
        if (!member?.name) throw new Error('멤버 프로필 등록 후 게임에 참가해주세요.');
        if (uid() !== current.uid) throw new Error('계정이 변경되었어요. 다시 들어와주세요.');
        return { uid: current.uid, name: String(member.name) };
    }
    async function execute(operation) {
        if (busy) return;
        if (!ready()) { status.textContent = 'Firebase에 연결된 멤버 계정으로 로그인해주세요.'; return; }
        if (!online()) { status.textContent = '인터넷 연결 후 게임을 진행해주세요.'; return; }
        busy = true;
        const currentEpoch = epoch;
        status.textContent = '';
        render();
        try { await operation(); }
        catch (error) { if (epoch === currentEpoch) status.textContent = errorText(error); }
        finally { if (epoch === currentEpoch) { busy = false; render(); } }
    }
    async function create() {
        await execute(async () => {
            const player = await profile(), currentEpoch = epoch;
            for (let attempts = 0; attempts < 5; attempts++) {
                const value = makeCode(), ref = roomRef(value);
                const created = await window.runTransaction(window.meetingDb, async tx => {
                    const snapshot = await tx.get(ref);
                    if (snapshot.exists()) return false;
                    tx.set(ref, game.createRoom(player, Date.now()));
                    return true;
                });
                if (created) {
                    if (epoch !== currentEpoch) return;
                    persist(value); code = value;
                    if (open()) watch(value);
                    return;
                }
            }
            throw new Error('방 코드를 만들지 못했어요. 다시 시도해주세요.');
        });
    }
    async function join(value) {
        value = String(value || '').trim().toUpperCase();
        if (!/^[A-Z2-9]{6}$/.test(value)) { status.textContent = '친구가 알려준 6자리 방 코드를 입력해주세요.'; return; }
        await execute(async () => {
            const player = await profile(), currentEpoch = epoch;
            await window.runTransaction(window.meetingDb, async tx => {
                const ref = roomRef(value), snapshot = await tx.get(ref);
                if (!snapshot.exists()) throw new Error('해당 코드의 방을 찾을 수 없어요.');
                const current = snapshot.data();
                if (current.version !== 1 || current.game !== 'uno' || current.status === 'closed') throw new Error('이 방에 참가할 수 없어요.');
                const next = game.joinRoom(current, player, Date.now());
                if (next !== current) tx.set(ref, next);
            });
            if (epoch !== currentEpoch) return;
            persist(value); code = value;
            if (open()) watch(value);
        });
    }
    async function act(action) {
        if (!allowed() || !room) { status.textContent = '방과 게임 상태가 동기화될 때까지 잠시 기다려주세요.'; return; }
        const value = code, currentUid = uid(), revision = room.revision, currentEpoch = epoch;
        await execute(async () => {
            await window.runTransaction(window.meetingDb, async tx => {
                const ref = roomRef(value), privateRef = gameRef(value);
                const roomSnapshot = await tx.get(ref);
                if (!roomSnapshot.exists()) throw new Error('방이 종료되었어요.');
                const current = roomSnapshot.data();
                if (!current.playerIds.includes(currentUid)) throw new Error('이 방에 참가한 멤버만 진행할 수 있어요.');
                if (current.revision !== revision) throw new Error('친구가 먼저 진행했어요. 갱신된 화면에서 다시 눌러주세요.');
                const next = { ...current, updatedAt: Date.now(), revision: revision + 1 };
                if (action.type === 'start') {
                    if (current.hostUid !== currentUid || !['waiting', 'finished'].includes(current.status)) throw new Error('방장만 새 게임을 시작할 수 있어요.');
                    next.round = current.round + 1; next.status = 'playing'; next.notice = '';
                    const initial = game.start(current.playerIds, next.round, random);
                    tx.set(privateRef, { ...initial, revision: next.revision });
                } else {
                    if (current.status !== 'playing') throw new Error('진행 중인 게임이 없어요.');
                    const gameSnapshot = await tx.get(privateRef);
                    if (!gameSnapshot.exists() || gameSnapshot.data().revision !== revision) throw new Error('게임 정보를 다시 불러와주세요.');
                    const result = game.move(gameSnapshot.data(), currentUid, action, random);
                    if (result.winnerUid) next.status = 'finished';
                    tx.set(privateRef, { ...result, revision: next.revision });
                }
                tx.set(ref, next);
            });
            if (epoch === currentEpoch) { selectedCard = null; armed = false; }
        });
    }
    async function leave() {
        if (room?.status === 'playing' && !window.confirm('방에서 나가면 이번 판이 종료됩니다. 나갈까요?')) return;
        const value = code, currentUid = uid(), currentEpoch = epoch;
        await execute(async () => {
            await window.runTransaction(window.meetingDb, async tx => {
                const ref = roomRef(value), snapshot = await tx.get(ref);
                if (!snapshot.exists()) return;
                const current = snapshot.data();
                if (!current.playerIds.includes(currentUid)) return;
                tx.set(ref, game.leaveRoom(current, currentUid, Date.now()));
                tx.delete(gameRef(value));
            });
            if (epoch === currentEpoch) clearRoom();
        });
    }
    function cardHtml(card, playable = false, interactive = false) {
        const color = colors[card.color] || colors.wild;
        const label = names[card.value] || card.value;
        const tag = interactive ? 'button' : 'div';
        return '<' + tag + (interactive ? ' type="button" data-uno-action="card" data-card-id="' + esc(card.id) + '"' + (!playable ? ' disabled' : '') : '') +
            ' class="uno-card' + (playable ? ' is-playable' : '') + '" data-color="' + esc(card.color) + '" aria-label="' + esc(color[0] + ' ' + label) + '"><small>' + esc(color[2] + ' ' + color[0]) + '</small><b>' + esc(labels[card.value] || card.value) + '</b><small>' + esc(labels[card.value] || card.value) + '</small></' + tag + '>';
    }
    function playersHtml() {
        return '<div class="uno-players">' + room.players.map(player => '<div class="uno-player' + (state?.turnUid === player.uid && room.status === 'playing' ? ' is-turn' : '') + '"><span aria-hidden="true">' + esc(player.name.slice(0, 1)) + '</span><div><strong>' + esc(player.name) + (player.uid === uid() ? ' · 나' : '') + '</strong><small>' +
            (state ? (state.hands[player.uid]?.length || 0) + '장' : player.uid === room.hostUid ? '방장' : '참가 완료') + '</small></div></div>').join('') + '</div>';
    }
    function pickerHtml(opening) {
        return '<div class="uno-picker" role="group" aria-label="다음 카드 색 선택"><p>' + (opening ? '첫 와일드 카드의 색을 골라주세요' : '다음 색을 골라주세요') + '</p><div class="uno-colors">' + game.COLORS.map(color => '<button type="button" data-uno-action="color" data-color="' + color + '" style="--dot:' + colors[color][1] + '"' + (!allowed() ? ' disabled' : '') + '>' + colors[color][2] + ' ' + colors[color][0] + '</button>').join('') + '</div>' + (opening ? '' : button('cancel-color', '취소', false, true)) + '</div>';
    }
    function messageHtml() {
        const message = state?.message;
        if (!message) return '카드를 골라 게임을 시작하세요.';
        const actor = esc(name(message.uid)), target = esc(name(message.target));
        if (message.type === 'play') return actor + '님이 ' + esc(names[message.value] || message.value) + ' 카드를 냈어요.' + (message.uno ? ' UNO!' : '');
        if (message.type === 'draw') return actor + '님이 카드 1장을 뽑았어요.';
        if (message.type === 'pass') return actor + '님이 차례를 넘겼어요.';
        if (message.type === 'uno') return actor + '님이 UNO를 외쳤어요!';
        if (message.type === 'catch') return target + '님이 우노를 놓쳐 2장을 받았어요.';
        if (message.type === 'accept4') return actor + '님이 +4를 받았어요.';
        if (message.type === 'challenge4') return message.succeeded ? '도전 성공! ' + target + '님이 4장을 받았어요.' : '도전 실패! ' + actor + '님이 6장을 받았어요.';
        return actor + '님이 ' + esc(colors[message.color]?.[0] || '') + ' 색을 골랐어요.';
    }
    function render() {
        if (!open()) return;
        const focus = document.activeElement;
        const focusAction = focus?.dataset?.unoAction, focusCard = focus?.dataset?.cardId, focusColor = focus?.dataset?.color;
        const oldInput = document.getElementById('uno-join-code');
        const inputValue = oldInput?.value || '', inputFocused = focus === oldInput;
        const handScroll = content.querySelector('.uno-hand')?.scrollLeft || 0;
        connection.textContent = !ready() ? '로그인 필요' : !online() ? '연결 끊김' : busy ? '반영 중…' : code && !synchronized() ? '동기화 중…' : code ? '실시간 연결' : '온라인';
        connection.classList.toggle('is-live', ready() && online() && (!code || synchronized()) && !busy);
        if (!code) {
            content.innerHTML = '<div class="uno-intro"><div class="uno-logo" aria-hidden="true">' + ['red', 'yellow', 'green', 'blue'].map((color, index) => cardHtml({ color, value: String(index + 1) })).join('') + '</div><h2>친구들과 한 판,<br>우노!</h2><p>방을 만들고 코드를 공유하세요.<br>2~10명이 함께 카드를 내려놓는 게임이에요.</p></div><div class="uno-panel">' + button('create', '우노 방 만들기', !allowed()) + '<form id="uno-join-form" class="uno-join"><label for="uno-join-code">친구 방에 참가하기</label><div><input id="uno-join-code" type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6자리 코드" value="' + esc(inputValue) + '" required><button type="submit" class="uno-btn"' + (!allowed() ? ' disabled' : '') + '>참가</button></div></form></div>';
        } else if (!room) {
            content.innerHTML = '<div class="uno-panel"><h2>방에 연결하고 있어요</h2><p class="uno-note">' + esc(code) + '</p>' + button('retry', '다시 연결', busy) + button('forget', '다른 방 찾기', busy, true) + '</div>';
        } else {
            let html = '<div class="uno-room-top"><div class="uno-room-code"><small>친구에게 알려줄 방 코드</small><strong>' + esc(code) + '</strong></div>' + button('copy', '코드 복사', false, true) + '</div>';
            if (room.status === 'waiting') {
                html += '<div class="uno-panel"><h2>친구들을 기다리는 중</h2><p class="uno-note">' + room.players.length + '/10명 참가 · 2명부터 시작할 수 있어요.</p>' + playersHtml() + button('start', uid() === room.hostUid ? '우노 시작하기' : '방장이 시작하면 함께 들어가요', !allowed() || room.players.length < 2 || uid() !== room.hostUid) + (room.notice ? '<p class="uno-note">' + esc(room.notice) + '</p>' : '') + '</div>';
            } else if (!state || state.revision !== room.revision) {
                html += '<div class="uno-panel"><p class="uno-note">최신 게임 상태를 불러오고 있어요.</p>' + button('retry', '다시 연결', busy, true) + '</div>';
            } else if (state.winnerUid) {
                html += '<div class="uno-panel uno-result"><span aria-hidden="true">🏆</span><h2>' + esc(name(state.winnerUid)) + '님 승리!</h2><p>모든 카드를 가장 먼저 냈어요.<br>이번 판 점수 ' + state.roundPoints + '점</p>' + button('start', '한 판 더 하기', !allowed() || uid() !== room.hostUid) + (uid() !== room.hostUid ? '<p>방장이 다시 시작할 수 있어요.</p>' : '') + '</div>' + playersHtml();
            } else {
                const hand = state.hands[uid()] || [], mine = state.turnUid === uid(), active = allowed() && mine;
                const top = state.discard[state.discard.length - 1], currentColor = colors[state.color] || colors.wild;
                html += playersHtml() + '<div class="uno-table"><p class="uno-turn" aria-live="polite">' + (mine ? '내 차례예요' : esc(name(state.turnUid)) + '님의 차례') + ' <span aria-label="진행 방향">' + (state.direction === 1 ? '↻' : '↺') + '</span></p><div class="uno-piles"><div><button type="button" class="uno-card uno-card-back" data-uno-action="draw" aria-label="카드 한 장 뽑기"' + (!active || state.drawnCardId || state.challenge || state.openingColorUid ? ' disabled' : '') + '><small>DRAW</small><b>UNO</b><small>+1</small></button><small>한 장 뽑기</small></div><div>' + cardHtml(top) + '<small>마지막 카드</small></div></div><span class="uno-color-label"><span class="uno-color-dot" style="--dot:' + currentColor[1] + '"></span>' + currentColor[2] + ' ' + currentColor[0] + ' · 같은 색/숫자/기호</span></div><p class="uno-note" aria-live="polite">' + messageHtml() + '</p>';
                if (state.challenge) html += '<div class="uno-panel"><h2>+4 ' + (mine ? '받을까요, 도전할까요?' : '응답을 기다리고 있어요') + '</h2><p class="uno-note">' + esc(name(state.challenge.actorUid)) + '님이 같은 색을 가지고 있었다면 도전 성공! 실패하면 6장을 받아요.</p><div class="uno-actions">' + button('accept4', '4장 받기', !active) + button('challenge4', '도전하기', !active, true) + '</div></div>';
                if (state.openingColorUid === uid() || selectedCard) html += pickerHtml(!!state.openingColorUid);
                html += '<div class="uno-hand-title"><h2>내 카드 · ' + hand.length + '장</h2><span>' + (state.drawnCardId && mine ? '방금 뽑은 카드만 낼 수 있어요' : '좌우로 넘겨보세요') + '</span></div><div class="uno-hand">' + hand.map(card => cardHtml(card, active && game.canPlay(state, uid(), card), true)).join('') + '</div><div class="uno-actions">';
                if (hand.length === 2 && !state.challenge) html += '<button type="button" class="uno-btn uno-btn-secondary uno-armed" data-uno-action="arm" aria-pressed="' + armed + '"' + (!active ? ' disabled' : '') + '>UNO 함께 외치기' + (armed ? ' ✓' : '') + '</button>';
                if (state.drawnCardId && mine) html += button('pass', '차례 넘기기', !active, true);
                if (state.unoPendingUid === uid()) html += button('uno', 'UNO!', !allowed());
                else if (state.unoPendingUid) html += button('catch', esc(name(state.unoPendingUid)) + '님 우노 지적!', !allowed(), true);
                html += '</div>';
            }
            html += '<div class="uno-leave">' + (!synchronized() ? button('retry', '다시 연결', busy, true) : '') + '<button type="button" data-uno-action="leave"' + (!allowed() ? ' disabled' : '') + '>방 나가기</button></div>';
            content.innerHTML = html;
        }
        const nextHand = content.querySelector('.uno-hand'); if (nextHand) nextHand.scrollLeft = handScroll;
        if (inputFocused) document.getElementById('uno-join-code')?.focus({ preventScroll: true });
        else if (focusAction && content.contains(focus) === false) {
            const replacement = Array.from(content.querySelectorAll('[data-uno-action]')).find(element => element.dataset.unoAction === focusAction && element.dataset.cardId === focusCard && element.dataset.color === focusColor);
            if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
        }
    }
    function hide() {
        if (!open()) return;
        screen.hidden = true;
        stop();
        document.body.style.overflow = savedOverflow;
        inertElements.forEach((previous, element) => { element.inert = previous; });
        inertElements.clear();
        previousFocus?.focus({ preventScroll: true });
    }
    window.openDropGame = function () {
        if (open()) return;
        if (lastUid !== uid()) { epoch++; stop(); code = ''; room = state = selectedCard = null; armed = false; lastUid = uid(); busy = false; }
        previousFocus = document.activeElement;
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        Array.from(document.body.children).forEach(element => {
            if (element !== screen && !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) { inertElements.set(element, element.inert); element.inert = true; }
        });
        screen.hidden = false;
        screen.focus({ preventScroll: true });
        historyToken = 'uno-' + Date.now() + '-' + random();
        window.history.pushState({ ...window.history.state, modal: 'uno', unoViewId: historyToken }, '', window.location.href);
        status.textContent = '';
        const resume = code || storedCode();
        if (resume && ready()) watch(resume);
        else render();
    };
    function close() {
        if (window.history.state?.unoViewId === historyToken) window.history.back();
        else hide();
    }
    screen.addEventListener('click', async event => {
        const target = event.target.closest('[data-uno-action]');
        if (!target || target.disabled) return;
        const action = target.dataset.unoAction;
        if (action === 'close') return close();
        if (action === 'create') return create();
        if (action === 'retry') { status.textContent = ''; if (ready() && code) watch(code); return; }
        if (action === 'forget') { clearRoom(); status.textContent = ''; render(); return; }
        if (action === 'leave') return leave();
        if (action === 'copy') {
            try { await window.navigator.clipboard.writeText(code); status.textContent = '방 코드를 복사했어요. 친구에게 보내주세요.'; }
            catch (_) { status.textContent = '친구에게 이 방 코드를 알려주세요: ' + code; }
            return;
        }
        if (action === 'arm') { armed = !armed; render(); return; }
        if (action === 'cancel-color') { selectedCard = null; render(); return; }
        if (action === 'card') {
            const card = state?.hands[uid()]?.find(item => item.id === target.dataset.cardId);
            if (!card || !game.canPlay(state, uid(), card)) return;
            if (card.color === 'wild') { selectedCard = card; render(); content.querySelector('.uno-colors button')?.focus({ preventScroll: true }); }
            else return act({ type: 'play', cardId: card.id, uno: armed });
            return;
        }
        if (action === 'color') return act(selectedCard ? { type: 'play', cardId: selectedCard.id, color: target.dataset.color, uno: armed } : { type: 'color', color: target.dataset.color });
        if (['start', 'draw', 'pass', 'uno', 'catch', 'accept4', 'challenge4'].includes(action)) return act({ type: action });
    });
    screen.addEventListener('submit', event => {
        if (event.target.id !== 'uno-join-form') return;
        event.preventDefault(); join(document.getElementById('uno-join-code').value);
    });
    screen.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const elements = Array.from(screen.querySelectorAll('button:not(:disabled), input, summary, a[href]')).filter(element => element.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === screen)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === screen)) { event.preventDefault(); first?.focus(); }
    });
    window.addEventListener('popstate', () => { if (open() && window.history.state?.unoViewId !== historyToken) hide(); });
    window.addEventListener('enjoy-auth-ready', () => {
        if (lastUid !== uid()) {
            epoch++; stop(); code = ''; room = state = selectedCard = null; armed = busy = false; lastUid = uid();
            if (open()) {
                hide();
                if (window.history.state?.modal === 'uno') {
                    const previous = { ...window.history.state }; delete previous.modal; delete previous.unoViewId;
                    window.history.replaceState(previous, '', window.location.href);
                }
            }
        }
    });
    window.addEventListener('online', () => { if (open() && ready() && code) { status.textContent = ''; watch(code); } else render(); });
    window.addEventListener('offline', () => { if (open()) { status.textContent = '연결이 끊겼어요. 연결이 돌아오면 이어서 진행할 수 있습니다.'; render(); } });
})(window, document);
