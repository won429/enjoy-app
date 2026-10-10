(function (window, document) {
    'use strict';
    const game = window.EnjoyUno;
    const screen = document.getElementById('uno-screen');
    if (!game || !screen) return;
    const content = document.getElementById('uno-content');
    const status = document.getElementById('uno-status');
    const connection = document.getElementById('uno-connection');
    const colors = { red: ['빨강', '#ce3447', '●'], yellow: ['노랑', '#f0be3b', '◆'], green: ['초록', '#168664', '▲'], blue: ['파랑', '#2468c8', '■'], wild: ['와일드', '#242939', '✦'] };
    const labels = { draw2: '+2', wild4: '+4' };
    const icon = value => '<i class="ph ph-' + value + '" aria-hidden="true"></i>';
    const cardValue = card => card.value === 'skip' ? icon('prohibit') : card.value === 'reverse' ? icon('arrows-clockwise') : card.value === 'wild' ? icon('palette') : esc(labels[card.value] || card.value);
    const names = { skip: '건너뛰기', reverse: '방향 바꾸기', draw2: '두 장 뽑기', wild: '색 바꾸기', wild4: '와일드 네 장 뽑기' };
    let code = '', room = null, state = null, busy = false, liveRoom = false, liveGame = false;
    let roomUnsub = null, gameUnsub = null, selectedCard = null, armed = false, lastUid = '', epoch = 0;
    let savedOverflow = '', previousFocus = null;
    let historyToken = '';
    let mode = 'friends', soloCount = 4, botTimer = null;
    let presentation = null, motionBusy = false, motionToken = 0, motionLayer = null;
    let dealing = null;
    let artwork = null;
    const motionQueue = [], motionAnimations = new Set(), motionTimers = new Map();
    const pendingReceipts = new Set();
    const soloUid = 'solo-you';
    const botNames = ['루미', '모모', '하루', '노아', '보리', '레오', '나리', '도담', '유리'];
    const inertElements = new Map();
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const user = () => window.enjoyUser;
    const accountUid = () => user()?.uid || '';
    const uid = () => mode === 'solo' ? soloUid : accountUid();
    const storageKey = () => 'enjoy_uno_room_v1_' + uid();
    const open = () => !screen.hidden;
    const ready = () => !!(accountUid() && window.meetingAuthed && window.meetingDb && window.fsDoc && window.runTransaction && window.fsOnSnapshot && window.getDoc);
    const online = () => window.navigator.onLine !== false;
    const synchronized = () => mode === 'solo' || liveRoom && (room?.status !== 'playing' && room?.status !== 'finished' || liveGame && state?.revision === room?.revision);
    const allowed = () => !motionBusy && (mode === 'solo' ? !busy : ready() && online() && !busy && (!room || synchronized()));
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
        cancelMotion();
        window.clearTimeout(botTimer); botTimer = null;
        if (roomUnsub) roomUnsub();
        if (gameUnsub) gameUnsub();
        roomUnsub = gameUnsub = null;
        liveRoom = liveGame = false;
    }
    function clearRoom() { stop(); presentation = null; persist(''); code = ''; room = state = selectedCard = null; armed = false; }
    function startSolo() {
        stop();
        presentation = null;
        const players = [{ uid: soloUid, name: '나' }, ...botNames.slice(0, soloCount - 1).map((name, index) => ({ uid: 'solo-bot-' + index, name }))];
        room = { ...game.createRoom(players[0], Date.now()), players, playerIds: players.map(player => player.uid), round: (room?.round || 0) + 1, status: 'playing' };
        state = { ...game.start(room.playerIds, room.round, random), revision: 0 };
        code = 'LOCAL'; selectedCard = null; armed = false; status.textContent = ''; render();
    }
    function localMove(actor, action) {
        window.clearTimeout(botTimer); botTimer = null;
        try {
            state = { ...game.move(state, actor, action, random), revision: room.revision + 1 };
            room = { ...room, revision: state.revision, status: state.winnerUid ? 'finished' : 'playing' };
            selectedCard = null; armed = false; status.textContent = '';
        } catch (error) { status.textContent = errorText(error); }
        render();
    }
    function scheduleBot() {
        if (botTimer || motionBusy || mode !== 'solo' || !open() || document.hidden || !state || state.winnerUid || state.turnUid === soloUid) return;
        const current = state, actor = state.turnUid;
        botTimer = window.setTimeout(() => {
            botTimer = null;
            if (mode !== 'solo' || !open() || document.hidden || state !== current) return;
            const action = game.botAction(state, actor);
            if (action) localMove(actor, action);
        }, state.unoPendingUid ? 1500 : 850);
    }
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
        if (mode === 'solo') {
            if (!room || !allowed()) return;
            if (action.type === 'start') return startSolo();
            return localMove(soloUid, action);
        }
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
    function returnToSoloSetup() {
        stop(); presentation = null; code = ''; room = state = selectedCard = null; armed = false; status.textContent = ''; render();
    }
    async function leave() {
        if (mode === 'solo') {
            if (room?.status === 'playing' && !window.confirm('혼자하기를 끝내고 인원 선택으로 돌아갈까요?')) return;
            returnToSoloSetup(); return;
        }
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
    function cardHtml(card, playable = false, interactive = false, angle = 0) {
        const color = colors[card.color] || colors.wild;
        const label = names[card.value] || card.value;
        const tag = interactive ? 'button' : 'div';
        return '<' + tag + (interactive ? ' type="button" data-uno-action="card" data-card-id="' + esc(card.id) + '"' + (!playable ? ' disabled' : '') : '') +
            ' class="uno-card' + (playable ? ' is-playable' : '') + '" style="--hand-angle:' + angle + 'deg" data-color="' + esc(card.color) + '" aria-label="' + esc(color[0] + ' ' + label) + '"><small>' + cardValue(card) + '</small><b>' + cardValue(card) + '</b><small>' + cardValue(card) + '</small></' + tag + '>';
    }
    function avatarHtml(player) {
        const index = room.players.findIndex(item => item.uid === player.uid);
        return '<span class="uno-avatar" aria-hidden="true" style="--avatar-x:' + index % 5 * 25 + '%;--avatar-y:' + Math.floor(index / 5) * 100 + '%"></span>';
    }
    function profileHtml(player) {
        return '<div class="uno-player' + (state?.turnUid === player.uid && room.status === 'playing' ? ' is-turn' : '') + '" data-player-uid="' + esc(player.uid) + '">' + avatarHtml(player) + '<div><strong>' + esc(player.name) + (mode !== 'solo' && player.uid === uid() ? ' · 나' : '') + '</strong><small data-uno-count="' + esc(player.uid) + '">' + (state ? (state.hands[player.uid]?.length || 0) + '장' : player.uid === room.hostUid ? '방장' : '참가 완료') + '</small></div></div>';
    }
    function playersHtml() {
        return '<div class="uno-players' + (room.players.length > 4 ? ' uno-players-many' : '') + '">' + room.players.map(profileHtml).join('') + '</div>';
    }
    function seatsHtml() {
        const ordered = room.players.slice(room.playerIds.indexOf(uid()) + 1).concat(room.players.slice(0, room.playerIds.indexOf(uid())));
        const topCount = ordered.length % 2 ? 3 : 2, sideCount = (ordered.length - topCount) / 2;
        const sideRows = sideCount === 1 ? [56] : sideCount === 2 ? [43, 77] : [40, 63, 86];
        const positions = ordered.length === 1 ? [[50, 22]] : ordered.length === 2 ? [[23, 25], [77, 25]] : ordered.length === 3 ? [[13, 52], [50, 21], [87, 52]] :
            Array.from({ length: ordered.length }, (_, index) => index < topCount ? [topCount === 2 ? 30 + index * 40 : 20 + index * 30, 14] : [(index - topCount) % 2 ? 87 : 13, sideRows[Math.floor((index - topCount) / 2)]]);
        return ordered.map((player, index) => {
            const hand = state.hands[player.uid] || [], position = positions[index];
            return '<div class="uno-seat' + (ordered.length > 3 ? ' uno-seat-compact' : '') + ((ordered.length === 1 || ordered.length === 3) && position[0] === 50 ? ' uno-seat-top' : '') + '" style="--seat-x:' + position[0] + '%;--seat-y:' + position[1] + '%">' + profileHtml(player) +
                '<div class="uno-opponent-hand" role="img" aria-label="' + esc(player.name) + '님의 카드 ' + hand.length + '장" style="--fan-count:' + Math.max(1, hand.length) + '">' + hand.map((card, cardIndex) => '<div class="uno-opponent-card" data-opponent-uid="' + esc(player.uid) + '" data-hand-index="' + cardIndex + '" style="--fan-position:' + (hand.length > 1 ? cardIndex / (hand.length - 1) : .5) + ';--fan-angle:' + (hand.length > 1 ? (cardIndex / (hand.length - 1) - .5) * 28 : 0) + 'deg">' + backHtml() + '</div>').join('') + '</div></div>';
        }).join('');
    }
    function pickerHtml(opening) {
        return '<div class="uno-picker" role="group" aria-label="다음 카드 색 선택"><p>' + (opening ? '첫 와일드 카드의 색을 골라주세요' : '다음 색을 골라주세요') + '</p><div class="uno-colors">' + game.COLORS.map(color => '<button type="button" data-uno-action="color" data-color="' + color + '" style="--dot:' + colors[color][1] + '"' + (!allowed() ? ' disabled' : '') + '>' + colors[color][2] + ' ' + colors[color][0] + '</button>').join('') + '</div>' + (opening ? '' : button('cancel-color', '취소', false, true)) + '</div>';
    }
    function messageHtml() {
        const message = state?.message;
        if (!message) return '카드를 골라 게임을 시작하세요.';
        const actor = message.uid === uid() ? '내가' : esc(name(message.uid)) + '님이';
        const target = message.target === uid() ? '내가' : esc(name(message.target)) + '님이';
        if (message.type === 'play') return actor + ' ' + esc(names[message.value] || message.value) + ' 카드를 냈어요.' + (message.uno ? ' UNO!' : '');
        if (message.type === 'draw') return actor + ' 카드 1장을 뽑았어요.';
        if (message.type === 'pass') return actor + ' 차례를 넘겼어요.';
        if (message.type === 'uno') return actor + ' UNO를 외쳤어요!';
        if (message.type === 'catch') return target + ' 우노를 놓쳐 2장을 받았어요.';
        if (message.type === 'accept4') return actor + ' +4를 받았어요.';
        if (message.type === 'challenge4') return message.succeeded ? '도전 성공! ' + target + ' 4장을 받았어요.' : '도전 실패! ' + actor + ' 6장을 받았어요.';
        return actor + ' ' + esc(colors[message.color]?.[0] || '') + ' 색을 골랐어요.';
    }
    function motionEnabled() {
        return typeof screen.animate === 'function' && typeof document.createElement === 'function' &&
            !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !document.hidden;
    }
    function loadArtwork() {
        if (!artwork) artwork = typeof window.Image !== 'function' ? Promise.resolve() : Promise.all(
            ['avatars', 'card-faces', 'card-back', 'card-wild', 'table'].map(file => new Promise(resolve => {
                const image = new window.Image();
                const timeout = window.setTimeout(resolve, 8000);
                image.onload = image.onerror = () => { window.clearTimeout(timeout); resolve(); };
                image.src = 'assets/uno/' + file + '.webp';
            }))
        );
        return artwork;
    }
    function cancelMotion() {
        motionToken++;
        motionQueue.length = 0;
        motionTimers.forEach((resolve, id) => { window.clearTimeout(id); resolve(false); }); motionTimers.clear();
        motionAnimations.forEach(animation => animation.cancel()); motionAnimations.clear();
        motionLayer?.remove(); motionLayer = null; motionBusy = false; dealing = null;
        pendingReceipts.clear();
        screen.classList.remove?.('uno-is-dealing', 'uno-is-playing', 'uno-is-shuffling');
    }
    function pauseMotion(ms, token) {
        return new Promise(resolve => {
            const id = window.setTimeout(() => { motionTimers.delete(id); resolve(token === motionToken && open()); }, ms);
            motionTimers.set(id, resolve);
        });
    }
    async function animateNode(node, frames, options, token) {
        if (!node || token !== motionToken) return;
        const animation = node.animate(frames, options);
        motionAnimations.add(animation);
        try { await animation.finished; } catch (_) {} // Leaving cancels in-flight cards.
        motionAnimations.delete(animation);
        animation.cancel();
    }
    const backHtml = () => '<div class="uno-card uno-card-back" aria-hidden="true"></div>';
    function rect(node) {
        if (!node?.getBoundingClientRect) return null;
        const value = node.getBoundingClientRect();
        return value.width && value.height ? { x: value.left, y: value.top, width: value.width, height: value.height } : null;
    }
    function playerNode(player) { return Array.from(content.querySelectorAll('[data-player-uid]')).find(node => node.dataset.playerUid === player); }
    function handNode(id) { return Array.from(content.querySelectorAll('.uno-hand [data-card-id]')).find(node => node.dataset.cardId === id); }
    function opponentNode(player, id) {
        const index = state?.hands[player]?.findIndex(card => card.id === id);
        return Array.from(content.querySelectorAll('[data-opponent-uid]')).find(node => node.dataset.opponentUid === player && Number(node.dataset.handIndex) === index);
    }
    function visibleRect(value) {
        const scroll = rect(screen.querySelector('.uno-scroll'));
        return value && scroll && value.x + value.width > scroll.x && value.x < scroll.x + scroll.width &&
            value.y + value.height > scroll.y && value.y < scroll.y + scroll.height;
    }
    function recipientRect(player, id) {
        const hand = rect(player === uid() ? handNode(id) : opponentNode(player, id));
        return visibleRect(hand) ? hand : rect(playerNode(player));
    }
    function geometry() {
        const cards = new Map(), players = new Map(), fans = new Map();
        content.querySelectorAll('.uno-hand [data-card-id]').forEach(node => { const value = rect(node); if (visibleRect(value)) cards.set(node.dataset.cardId, value); });
        content.querySelectorAll('[data-player-uid]').forEach(node => players.set(node.dataset.playerUid, rect(node)));
        content.querySelectorAll('[data-opponent-uid]').forEach(node => { const value = rect(node); if (visibleRect(value)) fans.set(node.dataset.opponentUid, value); });
        return { cards, players, fans };
    }
    function motionCard(html, origin, size) {
        const node = document.createElement('div'), bounds = rect(screen);
        node.className = 'uno-flight-card'; node.setAttribute('aria-hidden', 'true'); node.innerHTML = html;
        node.style.width = size.width + 'px'; node.style.height = size.height + 'px';
        node.style.left = (origin.x + origin.width / 2 - bounds.x - size.width / 2) + 'px';
        node.style.top = (origin.y + origin.height / 2 - bounds.y - size.height / 2) + 'px';
        motionLayer.appendChild(node);
        return node;
    }
    async function fly(html, from, to, token, options = {}) {
        if (!from || !to || token !== motionToken) return;
        const targetSize = rect(content.querySelector('.uno-discard .uno-card')) || { width: 64, height: 96 };
        const size = targetSize;
        const face = options.reveal ? '<div class="uno-flight-front">' + html + '</div><div class="uno-flight-back">' + backHtml() + '</div>' : html;
        const node = motionCard(face, from, size);
        const dx = to.x + to.width / 2 - from.x - from.width / 2, dy = to.y + to.height / 2 - from.y - from.height / 2;
        const initialScale = options.play ? from.height / size.height : options.deal ? .9 : 1;
        const scale = options.deal ? Math.min(to.width / size.width, to.height / size.height) : 1;
        await animateNode(node, [
            { transform: 'translate(0,0) scale(' + initialScale + ') rotate(-4deg) rotateY(' + (options.reveal ? 180 : 0) + 'deg)', opacity: 1 },
            { transform: 'translate(' + dx * .28 + 'px,' + (dy * .28 - 24) + 'px) scale(' + (initialScale + (scale - initialScale) * .28) + ') rotate(6deg) rotateY(' + (options.reveal ? 90 : 0) + 'deg)', offset: .28 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ') rotate(0deg) rotateY(0deg)', opacity: 1 }
        ], { duration: options.deal ? 360 : 650, easing: 'cubic-bezier(.22,.7,.22,1)', fill: 'both' }, token);
        node.remove();
    }
    function syncDealView() {
        if (!dealing) return;
        content.querySelectorAll('[data-uno-count]').forEach(node => { node.textContent = (dealing.counts[node.dataset.unoCount] || 0) + '장'; });
        content.querySelectorAll('.uno-hand [data-card-id]').forEach(node => node.classList.toggle('uno-is-received', dealing.received.has(node.dataset.cardId)));
        content.querySelectorAll('[data-opponent-uid]').forEach(node => node.classList.toggle('uno-is-received', Number(node.dataset.handIndex) < (dealing.counts[node.dataset.opponentUid] || 0)));
        const turn = content.querySelector('.uno-turn'); if (turn) turn.textContent = dealing.label;
        const title = content.querySelector('.uno-hand-title h2'); if (title) title.textContent = '내 카드 · ' + (dealing.counts[uid()] || 0) + '장';
    }
    async function receiveCard(player, card, token) {
        if (token !== motionToken) return;
        pendingReceipts.delete(card.id);
        handNode(card.id)?.classList.remove('uno-await-receive');
        opponentNode(player, card.id)?.classList.remove('uno-await-receive');
        if (dealing) { dealing.counts[player] = (dealing.counts[player] || 0) + 1; dealing.received.add(card.id); syncDealView(); }
        const node = player === uid() ? handNode(card.id) : opponentNode(player, card.id);
        if (node && visibleRect(rect(node))) await animateNode(node, [
            { transform: player === uid() ? 'translateY(12px) rotateY(-65deg)' : 'scale(1.04)', opacity: .4 },
            { transform: 'translateY(0) rotateY(0) scale(1)', opacity: 1 }
        ], { duration: 230, easing: 'ease-out' }, token);
    }
    async function animateDeal(plan, token) {
        screen.classList.add('uno-is-dealing', 'uno-is-shuffling');
        const scroll = screen.querySelector('.uno-scroll'); if (scroll) scroll.scrollTop = 0;
        dealing = { counts: {}, received: new Set(), label: '카드를 섞고 있어요…' }; syncDealView();
        const origin = rect(content.querySelector('[data-uno-action="draw"]'));
        if (!origin) return;
        const stack = Array.from({ length: 3 }, () => motionCard(backHtml(), origin, origin));
        await Promise.all(stack.map((node, index) => animateNode(node, [
            { transform: 'translate(' + (index - 1) * 3 + 'px,0) rotate(0deg)' },
            { transform: 'translate(' + (index - 1) * 35 + 'px,-12px) rotate(' + (index - 1) * 16 + 'deg)', offset: .3 },
            { transform: 'translate(' + (1 - index) * 26 + 'px,5px) rotate(' + (1 - index) * 9 + 'deg)', offset: .7 },
            { transform: 'translate(' + (index - 1) * 2 + 'px,0) rotate(0deg)' }
        ], { duration: 820, easing: 'ease-in-out' }, token)));
        stack.forEach(node => node.remove());
        if (token === motionToken) screen.classList.remove('uno-is-shuffling');
        if (token !== motionToken) return;
        dealing.label = '한 장씩 나눠드리는 중…'; syncDealView();
        const flights = [], gap = Math.max(24, Math.round(150 / plan.state.players.length));
        for (let index = 0; index < 7; index++) {
            for (const player of plan.state.players) {
                if (token !== motionToken) return;
                const card = plan.state.hands[player][index];
                flights.push(fly(backHtml(), origin, recipientRect(player, card.id), token, { deal: true }).then(() => receiveCard(player, card, token)));
                if (!await pauseMotion(gap, token)) return;
            }
        }
        await Promise.all(flights);
        if (token !== motionToken) return;
        // Opening +2 follows the regular seven cards, using the real game state.
        for (const player of plan.state.players) for (const card of plan.state.hands[player].slice(7)) {
            await fly(backHtml(), origin, recipientRect(player, card.id), token, { deal: true }); await receiveCard(player, card, token);
        }
        dealing.label = '첫 카드를 공개해요'; syncDealView();
        await fly(cardHtml(plan.state.discard[0]), origin, rect(content.querySelector('.uno-discard .uno-card')), token);
        if (token !== motionToken) return;
        dealing = null; screen.classList.remove('uno-is-dealing');
    }
    async function animateTurn(plan, token) {
        const reflow = [];
        content.querySelectorAll('.uno-hand [data-card-id]').forEach(node => {
            const old = plan.handRects.get(node.dataset.cardId), next = rect(node);
            if (visibleRect(old) && visibleRect(next) && Math.abs(old.x - next.x) > 1) reflow.push(animateNode(node,
                [{ transform: 'translateX(' + (old.x - next.x) + 'px)' }, { transform: 'translateX(0)' }],
                { duration: 420, easing: 'cubic-bezier(.22,.7,.22,1)' }, token));
        });
        if (plan.card) {
            screen.classList.add('uno-is-playing');
            const target = rect(content.querySelector('.uno-discard .uno-card'));
            const previous = target && motionCard(cardHtml(plan.oldTop), target, target);
            const origin = visibleRect(plan.origin) ? plan.origin : rect(playerNode(plan.actor));
            await fly(cardHtml(plan.card), origin, target, token, { play: true, reveal: plan.actor !== uid() });
            previous?.remove();
            if (token !== motionToken) return;
            screen.classList.remove('uno-is-playing');
            const top = content.querySelector('.uno-discard .uno-card');
            if (top) await animateNode(top, [{ transform: 'scale(1.06) rotate(2deg)' }, { transform: 'scale(1) rotate(0deg)' }], { duration: 180, easing: 'ease-out' }, token);
        }
        const flights = [], origin = rect(content.querySelector('[data-uno-action="draw"]'));
        for (const item of plan.draws) {
            if (token !== motionToken) return;
            flights.push(fly(backHtml(), origin, recipientRect(item.player, item.card.id), token, { deal: true }).then(() => receiveCard(item.player, item.card, token)));
            if (!await pauseMotion(75, token)) return;
        }
        await Promise.all([...flights, ...reflow]);
    }
    function planMotion() {
        if (!code || !room || !state || state.revision !== room.revision || !['playing', 'finished'].includes(room.status)) return;
        const key = mode + ':' + code + ':' + room.round;
        if (presentation?.key === key && presentation.state.revision === state.revision) return;
        const before = presentation, currentGeometry = geometry();
        presentation = { key, state, geometry: currentGeometry };
        if (!motionEnabled()) return;
        if (!before || before.key !== key) {
            if (!state.message && !state.winnerUid) motionQueue.push({ type: 'deal', state });
        } else {
            const oldTop = before.state.discard.at(-1), top = state.discard.at(-1);
            const actor = top.id !== oldTop.id ? before.state.players.find(player => before.state.hands[player].some(card => card.id === top.id)) : null;
            const draws = state.players.flatMap(player => state.hands[player].filter(card => !before.state.hands[player]?.some(old => old.id === card.id)).map(card => ({ player, card })));
            draws.forEach(item => pendingReceipts.add(item.card.id));
            if (actor || draws.length) motionQueue.push({ type: 'turn', card: actor ? top : null, oldTop, actor, draws, handRects: currentGeometry.cards.size ? currentGeometry.cards : before.geometry.cards,
                origin: currentGeometry.cards.get(top.id) || before.geometry.cards.get(top.id) || currentGeometry.fans.get(actor) || before.geometry.fans.get(actor) || currentGeometry.players.get(actor) || before.geometry.players.get(actor) });
        }
        if (motionQueue.length) {
            motionBusy = true;
            window.clearTimeout(botTimer); botTimer = null;
        }
    }
    async function runMotion() {
        if (!motionBusy || motionLayer || !motionQueue.length) return;
        const token = ++motionToken;
        motionLayer = document.createElement('div'); motionLayer.className = 'uno-motion-layer'; motionLayer.setAttribute('aria-hidden', 'true'); screen.appendChild(motionLayer);
        if (motionQueue[0]?.type === 'deal') {
            screen.classList.add('uno-is-dealing', 'uno-is-shuffling');
            dealing = { counts: {}, received: new Set(), label: '카드를 준비하고 있어요…' }; syncDealView();
        }
        try {
            await loadArtwork();
            if (token !== motionToken || !open()) return;
            while (motionQueue.length && token === motionToken && open()) {
                const plan = motionQueue.shift();
                if (plan.type === 'deal') await animateDeal(plan, token);
                else await animateTurn(plan, token);
            }
        } catch (error) {
            window.console?.warn('우노 카드 연출을 건너뜁니다.', error);
        } finally {
            if (token === motionToken) { cancelMotion(); render(); }
        }
    }
    function render() {
        if (!open()) return;
        planMotion();
        if (!code || room?.status === 'waiting' || room?.status === 'closed') cancelMotion();
        const focus = document.activeElement;
        const focusAction = focus?.dataset?.unoAction, focusCard = focus?.dataset?.cardId, focusColor = focus?.dataset?.color;
        const oldInput = document.getElementById('uno-join-code');
        const inputValue = oldInput?.value || '', inputFocused = focus === oldInput;
        const handScroll = content.querySelector('.uno-hand')?.scrollLeft || 0;
        connection.textContent = mode === 'solo' ? '혼자하기' : !ready() ? '로그인 필요' : !online() ? '연결 끊김' : busy ? '반영 중…' : code && !synchronized() ? '동기화 중…' : code ? '실시간 연결' : '온라인';
        connection.classList.toggle('is-live', mode === 'solo' || ready() && online() && (!code || synchronized()) && !busy);
        screen.classList.toggle('uno-game-active', !!(code && state && room && ['playing', 'finished'].includes(room.status)));
        screen.classList.toggle('uno-fullscreen-match', !!(code && state && room && state.revision === room.revision && ['playing', 'finished'].includes(room.status) && (!state.winnerUid || motionBusy)));
        screen.querySelector('.uno-back')?.setAttribute('aria-label', mode === 'solo' && code ? '인원 선택으로 돌아가기' : '드롭으로 돌아가기');
        if (!code) {
            const intro = '<div class="uno-intro"><div class="uno-logo" aria-hidden="true">' + ['red', 'yellow', 'green', 'blue'].map((color, index) => cardHtml({ color, value: String(index + 1) })).join('') + '</div><span class="uno-eyebrow">색을 맞추고, 한 장 남으면 UNO!</span><h2>가볍게 즐기는 우노 한 판</h2><p>친구와 함께, 또는 가상 플레이어와 함께.<br>내 카드를 가장 먼저 내려놓으면 승리해요.</p></div>';
            const tabs = '<div class="uno-modes" role="group" aria-label="플레이 방식"><button type="button" data-uno-action="mode-friends" aria-pressed="' + (mode === 'friends') + '">친구와 하기</button><button type="button" data-uno-action="mode-solo" aria-pressed="' + (mode === 'solo') + '">혼자하기</button></div>';
            const friends = '<div class="uno-panel uno-setup"><h2>친구들과 함께</h2><p class="uno-note">2~10명 · 방 코드를 공유해서 모여요.</p>' + button('create', '우노 방 만들기', !allowed()) + '<form id="uno-join-form" class="uno-join"><label for="uno-join-code">초대받은 코드가 있나요?</label><div><input id="uno-join-code" type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6자리 방 코드" aria-describedby="uno-friends-help" value="' + esc(inputValue) + '" required><button type="submit" class="uno-btn"' + (!allowed() ? ' disabled' : '') + '>참가</button></div></form><p id="uno-friends-help" class="uno-footnote">' + (!ready() ? '친구와 하려면 멤버 계정으로 로그인해주세요.' : '친구와의 게임은 실시간으로 연결돼요.') + '</p></div>';
            const solo = '<div class="uno-panel uno-setup"><h2>가상 플레이어와 함께</h2><p class="uno-note">로그인 없이, 인터넷 없이도 즐길 수 있어요.</p><div class="uno-count-heading"><strong>총 플레이 인원</strong><span>나 포함</span></div><div class="uno-counts" role="group" aria-label="나를 포함한 총 플레이 인원">' + Array.from({ length: 9 }, (_, index) => index + 2).map(count => '<button type="button" data-uno-action="count" data-count="' + count + '" aria-pressed="' + (count === soloCount) + '">' + count + '명</button>').join('') + '</div><p class="uno-solo-description">나 1명 + 가상 플레이어 ' + (soloCount - 1) + '명</p>' + button('solo-start', '혼자하기 시작') + '<p class="uno-footnote">이 게임은 내 기기에서만 진행돼요.</p></div>';
            content.innerHTML = intro + tabs + (mode === 'solo' ? solo : friends);
        } else if (!room) {
            content.innerHTML = '<div class="uno-panel"><h2>방에 연결하고 있어요</h2><p class="uno-note">' + esc(code) + '</p>' + button('retry', '다시 연결', busy) + button('forget', '다른 방 찾기', busy, true) + '</div>';
        } else {
            let html = mode === 'solo' ? '<div class="uno-solo-top"><div><strong>혼자하기 · ' + room.players.length + '명</strong><small>나 + 가상 플레이어 ' + (room.players.length - 1) + '명</small></div><span>기기에서 진행</span></div>' : '<div class="uno-room-top"><div class="uno-room-code"><small>친구에게 알려줄 방 코드</small><strong>' + esc(code) + '</strong></div>' + button('copy', '코드 복사', false, true) + '</div>';
            if (room.status === 'waiting') {
                html += '<div class="uno-panel"><h2>친구들을 기다리는 중</h2><p class="uno-note">' + room.players.length + '/10명 참가 · 2명부터 시작할 수 있어요.</p>' + playersHtml() + button('start', uid() === room.hostUid ? '우노 시작하기' : '방장이 시작하면 함께 들어가요', !allowed() || room.players.length < 2 || uid() !== room.hostUid) + (room.notice ? '<p class="uno-note">' + esc(room.notice) + '</p>' : '') + '</div>';
            } else if (!state || state.revision !== room.revision) {
                html += '<div class="uno-panel"><p class="uno-note">최신 게임 상태를 불러오고 있어요.</p>' + button('retry', '다시 연결', busy, true) + '</div>';
            } else if (state.winnerUid && !motionBusy) {
                html += '<div class="uno-panel uno-result"><span aria-hidden="true">' + icon('trophy') + '</span><h2>' + (state.winnerUid === uid() ? '내가 이겼어요!' : esc(name(state.winnerUid)) + '님 승리!') + '</h2><p>모든 카드를 가장 먼저 냈어요.<br>이번 판 점수 ' + state.roundPoints + '점</p>' + button('start', '한 판 더 하기', !allowed() || uid() !== room.hostUid) + (uid() !== room.hostUid ? '<p>방장이 다시 시작할 수 있어요.</p>' : '') + '</div>' + playersHtml();
            } else {
                const hand = state.hands[uid()] || [], mine = state.turnUid === uid(), active = allowed() && mine;
                const top = state.discard[state.discard.length - 1], currentColor = colors[state.color] || colors.wild;
                const tableHtml = '<div class="uno-table" data-player-count="' + room.players.length + '"><div class="uno-seat-field">' + seatsHtml() + '<div class="uno-center"><p class="uno-turn" aria-live="polite">' + (mine ? '내 차례예요' : esc(name(state.turnUid)) + '님의 차례') + ' <span aria-label="진행 방향">' + icon(state.direction === 1 ? 'arrow-clockwise' : 'arrow-counter-clockwise') + '</span></p><div class="uno-piles"><div><button type="button" class="uno-card uno-card-back" data-uno-action="draw" aria-label="카드 한 장 뽑기"' + (!active || state.drawnCardId || state.challenge || state.openingColorUid ? ' disabled' : '') + '></button><small>한 장 뽑기</small></div><div class="uno-discard">' + cardHtml(top) + '<small>마지막 카드</small></div></div><span class="uno-color-label"><span class="uno-color-dot" style="--dot:' + currentColor[1] + '"></span>' + currentColor[0] + '</span></div></div><div class="uno-hand-zone"><div class="uno-hand-heading">' + profileHtml(room.players.find(player => player.uid === uid())) + '<div class="uno-hand-title"><h2>내 카드 · ' + hand.length + '장</h2><span>' + (state.challenge && mine ? '먼저 +4에 응답해주세요' : state.openingColorUid === uid() || selectedCard ? '먼저 색을 골라주세요' : state.drawnCardId && mine ? '방금 뽑은 카드만 낼 수 있어요' : mine ? '빛나는 카드를 골라주세요' : '내 차례를 기다려주세요') + '</span></div></div><div class="uno-hand">' + hand.map((card, index) => cardHtml(card, active && game.canPlay(state, uid(), card), true, hand.length > 1 ? (index / (hand.length - 1) - .5) * 10 : 0)).join('') + '</div></div></div><p class="uno-note uno-move-note" aria-live="polite">' + messageHtml() + '</p>';
                if (state.challenge) html += '<div class="uno-panel uno-match-response"><h2>+4 ' + (mine ? '받을까요, 도전할까요?' : '응답을 기다리고 있어요') + '</h2><p class="uno-note">' + esc(name(state.challenge.actorUid)) + '님이 같은 색을 가지고 있었다면 도전 성공! 실패하면 6장을 받아요.</p><div class="uno-actions">' + button('accept4', '4장 받기', !active) + button('challenge4', '도전하기', !active, true) + '</div></div>';
                if (state.openingColorUid === uid() || selectedCard) html += pickerHtml(!!state.openingColorUid);
                html += tableHtml + '<div class="uno-actions uno-match-actions">';
                if (hand.length === 2 && !state.challenge) html += '<button type="button" class="uno-btn uno-btn-secondary uno-armed" data-uno-action="arm" aria-pressed="' + armed + '"' + (!active ? ' disabled' : '') + '>UNO 함께 외치기' + (armed ? ' ✓' : '') + '</button>';
                if (state.drawnCardId && mine) html += button('pass', '차례 넘기기', !active, true);
                if (state.unoPendingUid === uid()) html += button('uno', 'UNO!', !allowed());
                else if (state.unoPendingUid) html += button('catch', esc(name(state.unoPendingUid)) + '님 우노 지적!', !allowed(), true);
                html += '</div>';
            }
            if (mode !== 'solo') html += '<div class="uno-leave">' + (!synchronized() ? button('retry', '다시 연결', busy, true) : '') + '<button type="button" data-uno-action="leave"' + (!allowed() ? ' disabled' : '') + '>방 나가기</button></div>';
            content.innerHTML = html;
        }
        const nextHand = content.querySelector('.uno-hand'); if (nextHand) nextHand.scrollLeft = handScroll;
        if (inputFocused) document.getElementById('uno-join-code')?.focus({ preventScroll: true });
        else if (focusAction && content.contains(focus) === false) {
            const replacement = Array.from(content.querySelectorAll('[data-uno-action]')).find(element => element.dataset.unoAction === focusAction && element.dataset.cardId === focusCard && element.dataset.color === focusColor && element.dataset.count === focus?.dataset?.count);
            if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
        }
        syncDealView();
        content.querySelectorAll('.uno-hand [data-card-id]').forEach(node => node.classList.toggle('uno-await-receive', pendingReceipts.has(node.dataset.cardId)));
        content.querySelectorAll('[data-opponent-uid]').forEach(node => {
            const card = state?.hands[node.dataset.opponentUid]?.[Number(node.dataset.handIndex)];
            node.classList.toggle('uno-await-receive', !!card && pendingReceipts.has(card.id));
        });
        if (presentation && state === presentation.state && state.revision === room?.revision && content.querySelector('.uno-table')) presentation.geometry = geometry();
        runMotion();
        scheduleBot();
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
        if (mode !== 'solo' && lastUid !== accountUid()) { epoch++; stop(); code = ''; room = state = selectedCard = null; armed = false; lastUid = accountUid(); busy = false; }
        previousFocus = document.activeElement;
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        Array.from(document.body.children).forEach(element => {
            if (element !== screen && !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) { inertElements.set(element, element.inert); element.inert = true; }
        });
        screen.hidden = false;
        loadArtwork();
        screen.focus({ preventScroll: true });
        historyToken = 'uno-' + Date.now() + '-' + random();
        window.history.pushState({ ...window.history.state, modal: 'uno', unoViewId: historyToken }, '', window.location.href);
        status.textContent = '';
        const resume = mode === 'solo' ? '' : code || storedCode();
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
        if (action === 'close') return mode === 'solo' && code ? returnToSoloSetup() : close();
        if (!code && !busy && (action === 'mode-friends' || action === 'mode-solo')) {
            mode = action === 'mode-solo' ? 'solo' : 'friends'; status.textContent = '';
            if (mode === 'friends') {
                lastUid = accountUid(); const resume = storedCode();
                if (resume && ready()) { watch(resume); return; }
            }
            render(); return;
        }
        if (action === 'count' && mode === 'solo' && !code) { soloCount = Math.max(2, Math.min(10, Number(target.dataset.count) || 4)); render(); return; }
        if (action === 'solo-start' && mode === 'solo' && !code) return startSolo();
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
            if (card.color === 'wild') { selectedCard = card; render(); content.querySelector('.uno-colors button')?.focus(); }
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
        if (mode === 'solo') { lastUid = accountUid(); return; }
        if (lastUid !== accountUid()) {
            epoch++; stop(); code = ''; room = state = selectedCard = null; armed = busy = false; lastUid = accountUid();
            if (open()) {
                hide();
                if (window.history.state?.modal === 'uno') {
                    const previous = { ...window.history.state }; delete previous.modal; delete previous.unoViewId;
                    window.history.replaceState(previous, '', window.location.href);
                }
            }
        }
    });
    window.addEventListener('online', () => { if (mode === 'solo') return render(); if (open() && ready() && code) { status.textContent = ''; watch(code); } else render(); });
    window.addEventListener('offline', () => { if (mode === 'solo') return render(); if (open()) { status.textContent = '연결이 끊겼어요. 연결이 돌아오면 이어서 진행할 수 있습니다.'; render(); } });
    document.addEventListener('visibilitychange', () => { window.clearTimeout(botTimer); botTimer = null; cancelMotion(); render(); });
    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { cancelMotion(); render(); });
})(window, document);
