(function (root) {
    'use strict';
    const ADMIN = 'tdC9Bzxz7JRjpEceOLzpDCMKeBE2';
    const API = root.ENJOY_PREDICTION_WORKER_URL || 'https://enjoy-drop-prediction.sungwon4867.workers.dev';
    let epoch = 0, uid = '', timer = null, loading = false, offset = 0, fixtures = [], dateVersion = 0, opener = null;
    let posting = false, draftId = '';
    const saving = new Set();
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const now = () => Date.now() + offset;
    const dateKey = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
    const localInput = time => new Date(time + 9 * 3600000).toISOString().slice(0, 16);
    const parseInput = value => Date.parse(value + ':00+09:00');
    const format = time => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(time);
    const identity = () => root.meetingAuthed && !root.enjoyIsLocalGuest?.() && !root.enjoyUser?.isAnonymous ? root.enjoyUser?.uid || '' : '';
    root._dropPredictions = [];
    root._dropPredictionError = '';
    async function api(path, body) {
        const expected = identity(), generation = epoch;
        const token = await root.getEnjoyIdToken?.();
        if (!expected || !token) throw new Error('멤버 로그인이 필요해요.');
        const response = await fetch(API + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
            headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
        if (identity() !== expected || generation !== epoch) throw new Error('계정이 변경되었어요. 다시 열어 주세요.');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '예측 정보를 불러오지 못했어요.');
        if (Number.isFinite(data.serverNow)) offset = data.serverNow - Date.now();
        return data;
    }
    function menu() {
        const button = document.getElementById('drop-prediction-add');
        if (button) { button.hidden = identity() !== ADMIN; button.classList.toggle('hidden', identity() !== ADMIN); }
    }
    function signature(posts) {
        return JSON.stringify(posts.map(p => [p._id, p.status, p.answer, p.result, phase(p)]));
    }
    async function refresh(force = false) {
        menu();
        if (!uid || loading || identity() !== uid) return;
        const generation = epoch;
        loading = true;
        try {
            const data = await api('/feed');
            if (generation !== epoch) return;
            const changed = signature(root._dropPredictions) !== signature(data.posts) || !!root._dropPredictionError;
            root._dropPredictions = data.posts;
            root._dropPredictionError = '';
            if (changed || force) root.renderDropFeed?.();
        } catch (error) {
            if (generation !== epoch) return;
            root._dropPredictionError = '야구 예측: ' + (error.message || '연결을 확인해 주세요.');
            root.renderDropFeed?.();
        } finally { if (generation === epoch) loading = false; }
    }
    function phase(p) {
        const time = now();
        if (time < p.startsAt) return '예측 시작 전';
        if (time < p.closesAt && time < Date.parse(`${p.game.date}T${p.game.time.padStart(5, '0')}:00+09:00`)) return '예측 참여 중';
        if (time < p.revealAt) return '결과 공개 대기';
        if (!p.result) return '경기 결과 확인 중';
        return p.result.kind === 'void' ? p.result.reason : '결과 공개';
    }
    function card(p) {
        const state = phase(p), answer = p.answer, active = state === '예측 참여 중' && !saving.has(p._id);
        let result = '';
        if (p.result) {
            const settled = !!answer?.settledAt;
            const success = answer && answer.choice === p.result.winner;
            const delta = answer?.delta;
            result = `<div class="drop-prediction-result" role="status"><strong>${p.result.kind === 'void' ? esc(p.result.reason) + ' · 포인트 변동 없음' : esc(p.result.winner) + ' 승리 · ' + p.result.away + ' : ' + p.result.home}</strong><span>${!answer ? '이번 예측에 참여하지 않았어요.' : settled ? p.result.kind === 'void' ? '지급·차감 없이 마감했어요.' : `${success ? '예측 성공' : '예측 실패'} · ${delta > 0 ? '+' : ''}${Number(delta).toLocaleString('ko-KR')} P ${delta === 0 ? '변동 없음' : delta < 0 ? '차감 완료' : '지급 완료'}` : '포인트를 자동 정산하고 있어요.'}</span></div>`;
        }
        return `<article class="drop-prediction-card" data-prediction-id="${esc(p._id)}" aria-label="${esc(p.title)}">
            <div class="drop-prediction-heading"><span><i class="fa-solid fa-baseball" aria-hidden="true"></i> 야구 승리 예측</span><b>${esc(state)}</b></div>
            <h3>${esc(p.title)}</h3><p class="drop-prediction-fixture">${esc(p.game.date)} ${esc(p.game.time)} · ${esc(p.game.team1)} vs ${esc(p.game.team2)}</p>
            <div class="drop-prediction-choices" role="group" aria-label="승리할 팀 선택">${[p.game.team1, p.game.team2].map(team => `<button type="button" data-prediction-choice="${esc(team)}" data-prediction-id="${esc(p._id)}" aria-pressed="${answer?.choice === team}" ${active ? '' : 'disabled'}>${esc(team)} 승리${answer?.choice === team ? '<small>내 선택</small>' : ''}</button>`).join('')}</div>
            <div class="drop-prediction-points"><span>성공 <b>+${p.reward.toLocaleString('ko-KR')} P</b></span><span>실패 <b>−${p.penalty.toLocaleString('ko-KR')} P</b></span></div>
            ${p.penalty ? '<p class="drop-prediction-schedule">잔액이 부족해도 설정한 포인트가 차감됩니다.</p>' : ''}
            <p class="drop-prediction-schedule">참여 ${format(p.startsAt)} ~ ${format(p.closesAt)}<br>결과 공개 ${format(p.revealAt)}부터 · 경기 종료 후 확정<br>게시 종료 ${format(p.publishEnd)} · 한국시간</p>
            ${answer && !p.result ? `<p class="drop-prediction-saved">${esc(answer.choice)} 승리 예측을 저장했어요.${active ? ' 마감 전까지 변경할 수 있어요.' : ''}</p>` : ''}${result}
            <p class="drop-prediction-feedback" role="status" aria-live="polite"></p>
        </article>`;
    }
    async function choose(button) {
        const id = button.dataset.predictionId;
        if (saving.has(id)) return;
        const post = root._dropPredictions.find(p => p._id === id);
        if (!post || phase(post) !== '예측 참여 중') return;
        const cardNode = button.closest('.drop-prediction-card');
        saving.add(id);
        cardNode.querySelectorAll('button').forEach(node => { node.disabled = true; });
        try {
            const data = await api('/submit', { id, choice: button.dataset.predictionChoice });
            if (identity() !== uid) return;
            post.answer = data.answer;
            root.renderDropFeed?.();
            await refresh(true);
        } catch (error) {
            const message = cardNode.querySelector('.drop-prediction-feedback');
            if (message) message.textContent = error.message || '예측을 저장하지 못했어요.';
        } finally {
            saving.delete(id);
            document.querySelectorAll('.drop-prediction-card').forEach(node => {
                if (node.dataset.predictionId === id) node.querySelectorAll('button').forEach(b => { b.disabled = phase(post) !== '예측 참여 중'; });
            });
        }
    }
    function buildComposer() {
        if (document.getElementById('drop-prediction-composer')) return;
        const layer = document.createElement('div');
        layer.id = 'drop-prediction-composer'; layer.className = 'drop-prediction-overlay'; layer.hidden = true;
        layer.innerHTML = `<section class="drop-prediction-dialog" role="dialog" aria-modal="true" aria-labelledby="drop-prediction-title" tabindex="-1">
            <div class="drop-prediction-dialog-head"><h2 id="drop-prediction-title">야구 예측 추가</h2><button type="button" data-prediction-close aria-label="닫기">×</button></div>
            <form id="drop-prediction-form"><p class="drop-prediction-hint">모든 시간은 한국시간입니다. 무승부·취소 시 포인트가 변동되지 않아요.</p>
            <label>제목<input name="title" maxlength="80" placeholder="예: 오늘의 승리 팀을 맞혀보세요"></label>
            <label>경기 날짜<input name="date" type="date" required></label>
            <label>경기 선택<select name="gameKey" required><option value="">경기 날짜를 선택해 주세요</option></select></label>
            <fieldset><legend>공개·게시 기간</legend><p>시작하면 드롭에 나타나고, 종료하면 사라져요.</p><div class="drop-prediction-fields"><label>게시 시작<input name="publishStart" type="datetime-local" required></label><label>게시 종료<input name="publishEnd" type="datetime-local" required></label></div></fieldset>
            <fieldset><legend>예측 참여 기간</legend><div class="drop-prediction-fields"><label>참여 시작<input name="startsAt" type="datetime-local" required></label><label>참여 마감<input name="closesAt" type="datetime-local" required></label></div></fieldset>
            <label>결과 공개 시각<input name="revealAt" type="datetime-local" required><small>이 시각 이후 경기 종료 결과에 맞춰 자동 정산해요.</small></label>
            <fieldset><legend>포인트 설정</legend><div class="drop-prediction-fields"><label>성공 시 지급<input name="reward" type="number" min="0" max="1000000" step="1" value="100" required></label><label>실패 시 차감<input name="penalty" type="number" min="0" max="1000000" step="1" value="100" required></label></div><p>설정한 만큼 차감되며 잔액이 부족하면 마이너스 포인트가 됩니다.</p></fieldset>
            <p id="drop-prediction-form-feedback" role="status" aria-live="polite"></p><button class="drop-prediction-publish" type="submit">예측 등록</button></form></section>`;
        document.body.appendChild(layer);
        const form = layer.querySelector('form');
        form.elements.date.addEventListener('change', loadGames);
        form.elements.gameKey.addEventListener('change', defaultsForGame);
        form.addEventListener('submit', publish);
        layer.addEventListener('click', event => { if (event.target === layer || event.target.closest('[data-prediction-close]')) close(); });
        layer.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key !== 'Tab') return;
            const nodes = Array.from(layer.querySelectorAll('button,input,select,[tabindex]')).filter(n => !n.disabled && n.tabIndex >= 0);
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
    }
    function formFeedback(text) { document.getElementById('drop-prediction-form-feedback').textContent = text; }
    async function loadGames() {
        const form = document.getElementById('drop-prediction-form'), select = form.elements.gameKey, version = ++dateVersion;
        select.disabled = true; select.innerHTML = '<option value="">경기 일정을 불러오는 중…</option>'; fixtures = [];
        try {
            const data = await api('/games?date=' + encodeURIComponent(form.elements.date.value));
            if (version !== dateVersion) return;
            fixtures = data.games;
            select.innerHTML = '<option value="">' + (fixtures.length ? '경기를 선택해 주세요' : '예측 가능한 경기 일정이 없어요') + '</option>' + fixtures.map(g => `<option value="${esc(g.id || [g.date, g.team1, g.team2, g.time].join('_'))}">${esc(g.time + ' · ' + g.team1 + ' vs ' + g.team2)}</option>`).join('');
            formFeedback('');
        } catch (error) { if (version === dateVersion) { select.innerHTML = '<option value="">일정을 불러오지 못했어요</option>'; formFeedback(error.message); } }
        finally { if (version === dateVersion) select.disabled = false; }
    }
    function defaultsForGame() {
        const form = document.getElementById('drop-prediction-form');
        const game = fixtures.find(g => (g.id || [g.date, g.team1, g.team2, g.time].join('_')) === form.elements.gameKey.value);
        if (!game) return;
        const start = Date.parse(`${game.date}T${game.time.padStart(5, '0')}:00+09:00`);
        form.elements.closesAt.value = localInput(start);
        form.elements.revealAt.value = localInput(start + 4 * 3600000);
        form.elements.publishEnd.value = localInput(start + 28 * 3600000);
    }
    async function publish(event) {
        event.preventDefault();
        if (posting || identity() !== ADMIN) return;
        const form = event.target, button = form.querySelector('[type="submit"]');
        const input = Object.fromEntries(new FormData(form));
        input.requestId = draftId;
        ['publishStart', 'publishEnd', 'startsAt', 'closesAt', 'revealAt'].forEach(key => { input[key] = parseInput(input[key]); });
        ['reward', 'penalty'].forEach(key => { input[key] = Number(input[key]); });
        if (!(input.publishStart <= input.startsAt && input.startsAt < input.closesAt && input.closesAt <= input.revealAt && input.revealAt < input.publishEnd)) {
            formFeedback('게시 시작 ≤ 참여 시작 < 참여 마감 ≤ 결과 공개 < 게시 종료 순서로 설정해 주세요.'); return;
        }
        posting = true; button.disabled = true; formFeedback('예측을 등록하고 있어요…');
        try { await api('/create', input); close(true); await refresh(true); root.enjoyAlert?.('예측을 등록했어요. 설정한 게시 시작부터 드롭에 표시됩니다.'); }
        catch (error) { formFeedback(error.message || '예측을 등록하지 못했어요.'); }
        finally { posting = false; button.disabled = false; }
    }
    function open() {
        if (identity() !== ADMIN) return;
        root.closeDropPicker?.(); buildComposer();
        const layer = document.getElementById('drop-prediction-composer'), form = layer.querySelector('form');
        opener = document.activeElement;
        draftId = root.crypto.randomUUID();
        form.reset(); form.elements.date.value = dateKey(now());
        form.elements.publishStart.value = form.elements.startsAt.value = localInput(now());
        formFeedback(''); layer.hidden = false; layer.querySelector('.drop-prediction-dialog').focus(); loadGames();
    }
    function close(force = false) {
        if (posting && !force) return;
        const layer = document.getElementById('drop-prediction-composer');
        if (layer) layer.hidden = true;
        dateVersion++;
        if (opener?.isConnected) opener.focus();
    }
    function connect() {
        const next = identity();
        menu();
        if (next === uid) return;
        uid = next; epoch++; loading = false; clearInterval(timer); timer = null;
        root._dropPredictions = []; root._dropPredictionError = ''; saving.clear(); close(true); root.renderDropFeed?.();
        if (uid) { refresh(true); timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000); }
    }
    root.EnjoyDropPrediction = { now, card, menu, open, refresh, connect };
    root.openDropPredictionComposer = open;
    document.addEventListener('click', event => { const button = event.target.closest('[data-prediction-choice]'); if (button) choose(button); });
    root.addEventListener('enjoy-auth-ready', connect);
    root.addEventListener('enjoy-guest-entered', connect);
    root.addEventListener('online', () => refresh(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { connect(); refresh(true); } });
    connect();
})(window);
