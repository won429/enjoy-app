(function (root) {
    'use strict';
    const ADMIN = 'tdC9Bzxz7JRjpEceOLzpDCMKeBE2';
    const API = root.ENJOY_PREDICTION_WORKER_URL || 'https://enjoy-drop-prediction.sungwon4867.workers.dev';
    let epoch = 0, uid = '', timer = null, loading = false, offset = 0, fixtures = [], dateVersion = 0, opener = null;
    let posting = false, draftId = '', editing = null, returnToManager = false, adminBusy = false;
    let adminPosts = new Map(), managerOpener = null;
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
        ['drop-prediction-add', 'drop-prediction-manage'].forEach(id => {
            const button = document.getElementById(id);
            if (button) { button.hidden = identity() !== ADMIN; button.classList.toggle('hidden', identity() !== ADMIN); }
        });
    }
    function signature(posts) {
        return JSON.stringify(posts.map(p => [p._id, p.status, p.title, p.game, p.publishStart, p.publishEnd,
            p.startsAt, p.closesAt, p.revealAt, p.reward, p.penalty, p.updatedAt, p.answer, p.result, phase(p)]));
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
            ${identity() === ADMIN && p.authorUid === ADMIN ? adminActions(p) : ''}
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
        cardNode.querySelectorAll('[data-prediction-choice]').forEach(node => { node.disabled = true; });
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
                if (node.dataset.predictionId === id) node.querySelectorAll('[data-prediction-choice]').forEach(b => { b.disabled = phase(post) !== '예측 참여 중'; });
            });
        }
    }
    function adminActions(post) {
        return `<div class="drop-prediction-admin-actions"><button type="button" data-prediction-edit="${esc(post._id)}">수정</button><button type="button" class="is-danger" data-prediction-delete="${esc(post._id)}" ${post.status === 'settling' ? 'disabled' : ''}>삭제</button></div>`;
    }
    function trapDialog(event, layer, onClose) {
        // The app's confirmation dialog has its own focus handling above this overlay.
        if (event.target.closest('#enjoy-dialog')) return;
        if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
        if (event.key !== 'Tab') return;
        const nodes = Array.from(layer.querySelectorAll('button,input,select,[tabindex]')).filter(n => !n.disabled && n.tabIndex >= 0 && !n.hidden);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    function buildManager() {
        if (document.getElementById('drop-prediction-manager')) return;
        const layer = document.createElement('div');
        layer.id = 'drop-prediction-manager'; layer.className = 'drop-prediction-overlay'; layer.hidden = true;
        layer.innerHTML = `<section class="drop-prediction-dialog" role="dialog" aria-modal="true" aria-labelledby="drop-prediction-manager-title" tabindex="-1"><div class="drop-prediction-dialog-head"><h2 id="drop-prediction-manager-title">예측 관리</h2><button type="button" data-prediction-manager-close aria-label="관리 닫기">×</button></div><div class="drop-prediction-manager-body"><p class="drop-prediction-hint">게시 전·게시 종료된 예측도 여기서 수정하거나 삭제할 수 있어요.</p><button type="button" class="drop-prediction-refresh" data-prediction-manager-refresh>목록 새로고침</button><p id="drop-prediction-manager-feedback" role="status" aria-live="polite"></p><div id="drop-prediction-manager-list"></div></div></section>`;
        document.body.appendChild(layer);
        layer.addEventListener('click', event => {
            if (event.target === layer || event.target.closest('[data-prediction-manager-close]')) closeManager();
            if (event.target.closest('[data-prediction-manager-refresh]')) refreshManager();
        });
        layer.addEventListener('keydown', event => trapDialog(event, layer, closeManager));
    }
    function managerFeedback(message) {
        const node = document.getElementById('drop-prediction-manager-feedback');
        if (node) node.textContent = message;
    }
    function renderManager() {
        const list = document.getElementById('drop-prediction-manager-list');
        if (!list) return;
        list.innerHTML = Array.from(adminPosts.values()).map(post => {
            const label = post.status === 'settling' ? '정산 중' : post.status === 'settled' ? '정산 완료' : now() < post.publishStart ? '게시 예정' : now() >= post.publishEnd ? '게시 종료' : phase(post);
            return `<article class="drop-prediction-manager-item"><span class="drop-prediction-manager-state">${esc(label)} · 참여 ${post.management.participants}명</span><h3>${esc(post.title)}</h3><p>${esc(post.game.date + ' ' + post.game.time + ' · ' + post.game.team1 + ' vs ' + post.game.team2)}</p><p>게시 ${format(post.publishStart)} ~ ${format(post.publishEnd)}</p>${adminActions(post)}</article>`;
        }).join('') || '<p class="drop-prediction-hint">등록한 예측이 없어요.</p>';
    }
    async function loadAdminPosts() {
        const data = await api('/manage');
        adminPosts = new Map(data.posts.map(post => [post._id, post]));
        renderManager();
        return adminPosts;
    }
    async function refreshManager() {
        if (identity() !== ADMIN || adminBusy) return;
        adminBusy = true; managerFeedback('예측 목록을 불러오고 있어요…');
        try { await loadAdminPosts(); managerFeedback(''); }
        catch (error) { if (identity() === ADMIN) managerFeedback(error.message); }
        finally { adminBusy = false; }
    }
    async function openManager() {
        if (identity() !== ADMIN || posting) return;
        root.closeDropPicker?.(); buildManager();
        managerOpener = document.activeElement;
        const layer = document.getElementById('drop-prediction-manager');
        layer.hidden = false; layer.querySelector('[role="dialog"]').focus();
        await refreshManager();
    }
    function closeManager() {
        const layer = document.getElementById('drop-prediction-manager');
        if (layer) layer.hidden = true;
        if (managerOpener?.isConnected) managerOpener.focus();
    }
    function actionError(error) {
        const layer = document.getElementById('drop-prediction-manager');
        if (layer && !layer.hidden) managerFeedback(error.message || '예측을 변경하지 못했어요.');
        else root.enjoyAlert?.(error.message || '예측을 변경하지 못했어요.');
    }
    async function editPrediction(id) {
        if (identity() !== ADMIN || adminBusy || posting) return;
        adminBusy = true;
        try {
            const posts = await loadAdminPosts(), post = posts.get(id);
            if (!post) throw new Error('이미 삭제되었거나 찾을 수 없는 예측이에요.');
            const manager = document.getElementById('drop-prediction-manager');
            returnToManager = !!manager && !manager.hidden;
            if (manager) manager.hidden = true;
            open(post);
        } catch (error) { if (identity() === ADMIN) actionError(error); }
        finally { adminBusy = false; }
    }
    async function removePrediction(id) {
        if (identity() !== ADMIN || adminBusy || posting) return;
        adminBusy = true;
        try {
            const posts = await loadAdminPosts(), post = posts.get(id);
            if (!post) throw new Error('이미 삭제되었거나 찾을 수 없는 예측이에요.');
            if (post.management.deletingBlocked) throw new Error('포인트 정산 중이에요. 정산이 끝난 뒤 삭제해 주세요.');
            const message = post.status === 'pending'
                ? '이 예측을 삭제할까요?\n참여 기록은 보관하고, 포인트 지급·차감 없이 예측을 취소합니다.'
                : '이 예측을 삭제할까요?\n이미 정산된 포인트와 참여 기록은 유지됩니다.';
            const confirmed = root.enjoyConfirm ? await root.enjoyConfirm(message, { title: '예측 삭제', confirmText: '삭제', danger: true }) : root.confirm(message);
            if (!confirmed) return;
            await api('/delete', { id, revision: post.management.revision });
            adminPosts.delete(id); renderManager();
            root._dropPredictions = root._dropPredictions.filter(p => p._id !== id);
            root.renderDropFeed?.();
            managerFeedback('예측을 삭제했어요.');
            await refresh(true);
        } catch (error) { if (identity() === ADMIN) actionError(error); }
        finally { adminBusy = false; }
    }
    function buildComposer() {
        if (document.getElementById('drop-prediction-composer')) return;
        const layer = document.createElement('div');
        layer.id = 'drop-prediction-composer'; layer.className = 'drop-prediction-overlay'; layer.hidden = true;
        layer.innerHTML = `<section class="drop-prediction-dialog" role="dialog" aria-modal="true" aria-labelledby="drop-prediction-title" tabindex="-1">
            <div class="drop-prediction-dialog-head"><h2 id="drop-prediction-title">야구 예측 추가</h2><button type="button" data-prediction-close aria-label="닫기">×</button></div>
            <form id="drop-prediction-form"><p class="drop-prediction-hint">모든 시간은 한국시간입니다. 무승부·취소 시 포인트가 변동되지 않아요.</p>
            <p id="drop-prediction-edit-notice" class="drop-prediction-edit-notice" hidden></p>
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
        layer.addEventListener('keydown', event => trapDialog(event, layer, close));
    }
    function formFeedback(text) { document.getElementById('drop-prediction-form-feedback').textContent = text; }
    async function loadGames() {
        if (editing && !editing.management.termsEditable) return;
        const form = document.getElementById('drop-prediction-form'), select = form.elements.gameKey, version = ++dateVersion;
        select.disabled = true; select.innerHTML = '<option value="">경기 일정을 불러오는 중…</option>'; fixtures = [];
        try {
            const data = await api('/games?date=' + encodeURIComponent(form.elements.date.value));
            if (version !== dateVersion) return;
            fixtures = data.games;
            if (editing && form.elements.date.value === editing.game.date && !fixtures.some(g => fixtureKey(g) === fixtureKey(editing.game))) fixtures.push(editing.game);
            select.innerHTML = '<option value="">' + (fixtures.length ? '경기를 선택해 주세요' : '예측 가능한 경기 일정이 없어요') + '</option>' + fixtures.map(g => `<option value="${esc(g.id || [g.date, g.team1, g.team2, g.time].join('_'))}">${esc(g.time + ' · ' + g.team1 + ' vs ' + g.team2)}</option>`).join('');
            if (editing && form.elements.date.value === editing.game.date) select.value = fixtureKey(editing.game);
            formFeedback('');
        } catch (error) { if (version === dateVersion) { select.innerHTML = '<option value="">일정을 불러오지 못했어요</option>'; formFeedback(error.message); } }
        finally { if (version === dateVersion) select.disabled = false; }
    }
    const fixtureKey = game => game.id || [game.date, game.team1, game.team2, game.time].join('_');
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
        if (editing) {
            input.id = editing._id; input.revision = editing.management.revision;
            if (!editing.management.termsEditable) {
                input.date = editing.game.date; input.gameKey = fixtureKey(editing.game);
                ['startsAt', 'closesAt'].forEach(key => { input[key] = localInput(editing[key]); });
                ['reward', 'penalty'].forEach(key => { input[key] = editing[key]; });
            }
            if (!editing.management.revealEditable) input.revealAt = localInput(editing.revealAt);
        }
        ['publishStart', 'publishEnd', 'startsAt', 'closesAt', 'revealAt'].forEach(key => { input[key] = parseInput(input[key]); });
        ['reward', 'penalty'].forEach(key => { input[key] = Number(input[key]); });
        if (editing && !editing.management.termsEditable) ['startsAt', 'closesAt'].forEach(key => { input[key] = editing[key]; });
        if (editing && !editing.management.revealEditable) input.revealAt = editing.revealAt;
        if (!(input.publishStart <= input.startsAt && input.startsAt < input.closesAt && input.closesAt <= input.revealAt && input.revealAt < input.publishEnd)) {
            formFeedback('게시 시작 ≤ 참여 시작 < 참여 마감 ≤ 결과 공개 < 게시 종료 순서로 설정해 주세요.'); return;
        }
        const isEditing = !!editing;
        posting = true; button.disabled = true; formFeedback(isEditing ? '변경 내용을 저장하고 있어요…' : '예측을 등록하고 있어요…');
        try {
            await api(isEditing ? '/update' : '/create', input);
            close(true); await refresh(true);
            if (isEditing) {
                try { await loadAdminPosts(); managerFeedback('변경 내용을 저장했어요.'); }
                catch (_) { managerFeedback('변경 내용은 저장했어요. 목록 새로고침으로 다시 확인해 주세요.'); }
            }
            else root.enjoyAlert?.('예측을 등록했어요. 설정한 게시 시작부터 드롭에 표시됩니다.');
        }
        catch (error) { formFeedback(error.message || '예측을 등록하지 못했어요.'); }
        finally { posting = false; button.disabled = false; }
    }
    function open(post = null) {
        if (identity() !== ADMIN) return;
        root.closeDropPicker?.(); buildComposer();
        const layer = document.getElementById('drop-prediction-composer'), form = layer.querySelector('form');
        opener = document.activeElement;
        draftId = root.crypto.randomUUID();
        editing = post;
        if (!post) returnToManager = false;
        form.reset(); form.elements.date.value = dateKey(now());
        Array.from(form.elements).forEach(el => { el.disabled = false; });
        form.elements.publishStart.value = form.elements.startsAt.value = localInput(now());
        document.getElementById('drop-prediction-title').textContent = post ? '야구 예측 수정' : '야구 예측 추가';
        form.querySelector('[type="submit"]').textContent = post ? '변경 내용 저장' : '예측 등록';
        const notice = document.getElementById('drop-prediction-edit-notice');
        notice.hidden = !post || post.management.termsEditable;
        notice.textContent = post?.management.revealEditable
            ? '참여자가 있거나 참여가 마감되어 경기·참여 기간·포인트는 고정됩니다. 제목과 게시 기간, 결과 공개 시각을 수정할 수 있어요.'
            : '정산이 시작되어 제목과 게시 기간만 수정할 수 있어요. 이미 정산된 포인트는 유지됩니다.';
        if (post) {
            form.elements.title.value = post.title; form.elements.date.value = post.game.date;
            ['publishStart', 'publishEnd', 'startsAt', 'closesAt', 'revealAt'].forEach(key => { form.elements[key].value = localInput(post[key]); });
            ['reward', 'penalty'].forEach(key => { form.elements[key].value = post[key]; });
            if (!post.management.termsEditable) {
                ['date', 'gameKey', 'startsAt', 'closesAt', 'reward', 'penalty'].forEach(key => { form.elements[key].disabled = true; });
                form.elements.gameKey.innerHTML = `<option value="${esc(fixtureKey(post.game))}">${esc(post.game.time + ' · ' + post.game.team1 + ' vs ' + post.game.team2)}</option>`;
            }
            if (!post.management.revealEditable) form.elements.revealAt.disabled = true;
        }
        formFeedback(''); layer.hidden = false; layer.querySelector('.drop-prediction-dialog').focus();
        if (!post || post.management.termsEditable) loadGames();
    }
    function close(force = false) {
        if (posting && !force) return;
        const layer = document.getElementById('drop-prediction-composer');
        if (layer) layer.hidden = true;
        dateVersion++;
        editing = null;
        if (returnToManager && identity() === ADMIN) {
            const manager = document.getElementById('drop-prediction-manager');
            if (manager) { manager.hidden = false; manager.querySelector('[role="dialog"]').focus(); }
            returnToManager = false; return;
        }
        if (opener?.isConnected) opener.focus();
    }
    function connect() {
        const next = identity();
        menu();
        if (next === uid) return;
        uid = next; epoch++; loading = false; clearInterval(timer); timer = null;
        root._dropPredictions = []; root._dropPredictionError = ''; saving.clear(); returnToManager = false;
        adminPosts.clear(); renderManager(); close(true);
        const manager = document.getElementById('drop-prediction-manager'); if (manager) manager.hidden = true;
        root.renderDropFeed?.();
        if (uid) { refresh(true); timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000); }
    }
    root.EnjoyDropPrediction = { now, card, menu, open, refresh, connect, openManager, editPrediction, removePrediction };
    root.openDropPredictionComposer = open;
    root.openDropPredictionManager = openManager;
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-prediction-choice]'); if (button) choose(button);
        const edit = event.target.closest('[data-prediction-edit]'); if (edit) editPrediction(edit.dataset.predictionEdit);
        const remove = event.target.closest('[data-prediction-delete]'); if (remove) removePrediction(remove.dataset.predictionDelete);
    });
    root.addEventListener('enjoy-auth-ready', connect);
    root.addEventListener('enjoy-guest-entered', connect);
    root.addEventListener('online', () => refresh(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { connect(); refresh(true); } });
    connect();
})(window);
