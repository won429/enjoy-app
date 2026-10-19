(() => {
    const QUIZ_ID = '2026-10-19-seongwonje-birthplace';
    const STARTS_AT = Date.parse('2026-10-19T17:48:22+09:00');
    const CLOSES_AT = Date.parse('2026-10-23T00:00:00+09:00');
    const REVEALS_AT = CLOSES_AT;
    const MEMBER_NAMES = ['전시기', '성원제', '오스틴', '이진누', '류짱', '홍박사', '관리자'];

    function validSubmission(value) {
        return !!(value && value.quizId === QUIZ_ID && Number.isInteger(value.choice) &&
            value.choice >= 1 && value.choice <= 5 && Number.isFinite(value.submittedAt) &&
            value.submittedAt >= STARTS_AT && value.submittedAt < CLOSES_AT);
    }
    function quizState(now, submission, correctChoice = null) {
        const revealed = now >= REVEALS_AT && Number.isInteger(correctChoice) && correctChoice >= 1 && correctChoice <= 5;
        const phase = now < STARTS_AT ? 'scheduled' : now < CLOSES_AT ? 'open' : revealed ? 'revealed' : 'closed';
        const choice = validSubmission(submission) ? submission.choice : null;
        return { phase, choice, correctChoice: revealed ? correctChoice : null,
            result: !revealed ? null : choice === null ? 'unanswered' : choice === correctChoice ? 'correct' : 'incorrect' };
    }
    const resultLabel = result => ({ correct: '정답', incorrect: '오답', unanswered: '미참여' }[result] || '공개 대기');
    function timeLabel(timestamp) {
        return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul',
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(timestamp) : '—';
    }
    function csvField(value) {
        let text = String(value ?? '');
        if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }
    function resultsCSV(participants, now, correctChoice = null) {
        return '\ufeff' + [['멤버', 'UID', '선택 번호', '접수 시각 (한국시간)', '채점 결과'], ...participants.map(row => {
            const state = quizState(now, row.submission, correctChoice);
            return [row.name, row.uid, state.choice === null ? '' : state.choice + '번',
                row.submission ? timeLabel(row.submission.submittedAt) : '', state.choice === null ? '미참여' : resultLabel(state.result)];
        })].map(row => row.map(csvField).join(',')).join('\r\n');
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { QUIZ_ID, STARTS_AT, CLOSES_AT, REVEALS_AT, MEMBER_NAMES, validSubmission, quizState, resultsCSV };
        return;
    }

    const screen = document.getElementById('drop-quiz-screen');
    const entry = document.getElementById('drop-quiz-button');
    if (!screen || !entry) return;
    const back = document.getElementById('drop-quiz-back');
    const form = document.getElementById('drop-quiz-form');
    const choices = document.getElementById('drop-quiz-choices');
    const inputs = Array.from(choices.querySelectorAll('input[name="answer"]'));
    const submit = document.getElementById('drop-quiz-submit');
    const feedback = document.getElementById('drop-quiz-feedback');
    const description = document.getElementById('drop-quiz-description');
    const adminPanel = document.getElementById('drop-quiz-admin');
    const adminSummary = document.getElementById('drop-quiz-admin-summary');
    const adminRows = document.getElementById('drop-quiz-admin-rows');
    const exportButton = document.getElementById('drop-quiz-export');
    let previousFocus = null, overflow = '', historyId = '', timer = null;
    let selectedChoice = null, seenUid = '', seenSubmission = '', adminSignature = '', legacyDraft = null;
    const store = window.EnjoyDropQuizFirebase?.createStore(window, {
        quizId: QUIZ_ID, startsAt: STARTS_AT, closesAt: CLOSES_AT, memberNames: MEMBER_NAMES, onChange: () => render()
    });
    const disconnected = { uid: '', connected: false, loading: false, saving: false, member: false, admin: false,
        submission: null, participants: [], error: '', rosterError: '', correctChoice: null, revealError: '' };

    function renderAdmin(data, now) {
        adminPanel.hidden = !data.admin;
        if (!data.admin) { adminRows.replaceChildren(); adminSummary.textContent = ''; adminSignature = ''; return; }
        const participants = data.participants;
        const count = participants.filter(row => validSubmission(row.submission)).length;
        const winners = data.correctChoice !== null && now >= REVEALS_AT ? participants.filter(row => quizState(now, row.submission, data.correctChoice).result === 'correct').length : null;
        adminSummary.textContent = data.rosterError || (data.rosterLoading || !data.rosterConnected ? '참여 현황을 불러오는 중이에요.' :
            '참여 ' + count + '명 / 멤버 ' + participants.length + '명' + (winners === null ? ' · 채점 결과는 금요일 00:00 공개' : ' · 정답 ' + winners + '명'));
        exportButton.disabled = data.rosterLoading || !data.rosterConnected || !!data.rosterError || !participants.length;
        const signature = JSON.stringify([participants, data.correctChoice, now >= REVEALS_AT]);
        if (signature === adminSignature) return;
        adminSignature = signature;
        const fragment = document.createDocumentFragment();
        participants.forEach(row => {
            const state = quizState(now, row.submission, data.correctChoice), tr = document.createElement('tr');
            const name = document.createElement('td'), uid = document.createElement('small');
            name.textContent = row.name; uid.textContent = row.uid; uid.title = 'Firebase UID'; name.append(uid);
            const choice = document.createElement('td'); choice.textContent = state.choice === null ? '—' : state.choice + '번';
            const time = document.createElement('td'); time.textContent = row.submission ? timeLabel(row.submission.submittedAt) : '—';
            const result = document.createElement('td');
            result.textContent = state.choice === null ? '미참여' : resultLabel(state.result);
            result.dataset.result = state.result || '';
            tr.append(name, choice, time, result); fragment.append(tr);
        });
        adminRows.replaceChildren(fragment);
    }
    function render() {
        const data = store?.state || disconnected, now = Date.now();
        if (seenUid !== data.uid) {
            legacyDraft = null;
            if (data.uid) {
                try {
                    const draft = JSON.parse(localStorage.getItem('enjoy_drop_quiz_v1_' + QUIZ_ID + '_' + data.uid));
                    if (validSubmission(draft)) legacyDraft = draft;
                } catch (_) {}
            }
        }
        if (seenUid !== data.uid || seenSubmission !== (data.submission?.id || '')) {
            seenUid = data.uid; seenSubmission = data.submission?.id || '';
            selectedChoice = data.submission?.choice || legacyDraft?.choice || null;
            if (data.submission) legacyDraft = null;
        }
        const state = quizState(now, data.submission, data.correctChoice), open = state.phase === 'open';
        const connected = data.uid && data.member && data.connected && !data.loading;
        screen.dataset.phase = state.phase;
        choices.disabled = !open || !connected || data.saving;
        if (!open) selectedChoice = state.choice;
        inputs.forEach(input => {
            const number = Number(input.value), label = input.closest('label');
            input.checked = selectedChoice === number;
            const correct = state.correctChoice === number, wrong = state.result === 'incorrect' && state.choice === number;
            label.dataset.result = correct ? 'correct' : wrong ? 'incorrect' : '';
            label.querySelector('.drop-quiz-option-result').textContent = correct ? (state.choice === number ? '정답 · 나의 답안' : '정답') : wrong ? '나의 답안 · 오답' : '';
        });
        description.textContent = open ? '아래 보기 중 정답 하나를 선택해 주세요.' : state.phase === 'scheduled'
            ? '아직 퀴즈 참여가 시작되지 않았어요.' : '퀴즈 참여가 종료되었어요. 정답과 채점 결과를 확인해 주세요.';
        const retry = data.uid && !data.loading && !data.saving && (!data.connected || !!data.error);
        submit.disabled = !retry && (!open || !connected || data.saving || !selectedChoice || selectedChoice === state.choice);
        submit.textContent = !data.uid ? '멤버 로그인 필요' : data.loading ? '참여 기록 확인 중…' : data.saving ? '서버에 저장 중…' : retry
            ? '연결 다시 확인' : !open ? (state.phase === 'scheduled' ? '참여 시작 전' : '참여 종료') : !data.member ? '멤버 등록 필요' :
            state.choice && selectedChoice === state.choice ? '제출 완료' : state.choice ? '답안 변경' : '답안 제출';
        let message = '';
        if (!store) message = '퀴즈 연결 파일을 불러오지 못했어요. 페이지를 새로고침해 주세요.';
        else if (!data.uid) message = '선물 지급을 위한 참여자 확인이 필요해요. 엔조이 멤버 계정으로 로그인해 주세요.';
        else if (data.loading) message = '참여 기록을 불러오는 중이에요.';
        else if (data.error) message = data.error;
        else if (!data.member) message = '멤버 프로필을 등록한 뒤 참여해 주세요.';
        else if (!data.connected) message = '연결을 확인하고 있어요. 서버에 접수된 답안만 참여로 인정됩니다.';
        else if (state.phase === 'closed') message = data.revealError || '참여가 종료되었어요. 정답과 채점 결과를 서버에서 확인하고 있어요.';
        else if (state.phase === 'revealed') {
            message = state.result === 'correct' ? '정답이에요! 제출한 ' + state.choice + '번 답안이 정답입니다.' : state.result === 'incorrect'
                ? '아쉬워요. 제출한 ' + state.choice + '번 답안은 오답입니다. 정답은 ' + state.correctChoice + '번이에요.' : '제출한 답안이 없습니다. 정답은 ' + state.correctChoice + '번이에요.';
            message += '\n정답: ' + inputs.find(input => Number(input.value) === state.correctChoice).closest('label').querySelector('.drop-quiz-option-text').firstChild.textContent;
        } else if (state.choice) message = state.choice + '번 답안이 접수되었어요.\n정답과 채점 결과는 10월 23일(금) 00:00에 공개돼요.';
        else if (legacyDraft) message = '이전에 이 기기에만 저장한 ' + legacyDraft.choice + '번 답안이 있어요. 답안 제출을 눌러 참여를 확정해 주세요.';
        if (feedback.textContent !== message) feedback.textContent = message;
        renderAdmin(data, now);
        scheduleRefresh();
    }
    function scheduleRefresh() {
        clearTimeout(timer); timer = null;
        if (screen.hidden || document.visibilityState === 'hidden') return;
        const now = Date.now(), next = now < STARTS_AT ? STARTS_AT : now < REVEALS_AT ? REVEALS_AT :
            store?.state.uid && store.state.correctChoice === null ? now + 30000 : null;
        if (next !== null) timer = setTimeout(() => { store?.refresh(); render(); }, Math.min(60000, Math.max(1, next - now)));
    }
    function hide() {
        if (screen.hidden) return;
        screen.hidden = true; clearTimeout(timer); timer = null; store?.stop();
        adminPanel.hidden = true; adminRows.replaceChildren(); adminSignature = '';
        document.body.style.overflow = overflow;
        (previousFocus?.isConnected ? previousFocus : document.getElementById('drop-quiz-button'))?.focus({ preventScroll: true });
    }
    window.openDropQuiz = () => {
        if (!screen.hidden) return;
        previousFocus = document.activeElement; overflow = document.body.style.overflow;
        screen.hidden = false; store?.start(); render();
        screen.querySelector('.drop-quiz-scroll').scrollTop = 0; document.body.style.overflow = 'hidden';
        historyId = 'drop-quiz-' + Date.now();
        history.pushState({ ...history.state, modal: 'drop-quiz', dropQuizViewId: historyId }, '', location.href);
        back.focus({ preventScroll: true });
    };
    window.closeDropQuiz = () => {
        if (screen.hidden) return;
        const undo = history.state?.dropQuizViewId === historyId; hide(); if (undo) history.back();
    };
    entry.addEventListener('click', () => window.openDropQuiz());
    back.addEventListener('click', () => window.closeDropQuiz());
    form.addEventListener('change', event => {
        if (!inputs.includes(event.target)) return;
        selectedChoice = Number(event.target.value); render();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!store) return;
        const data = store.state;
        if (!data.connected || data.error) { store.refresh(true); return; }
        const uid = data.uid;
        try { await store.submit(selectedChoice); } catch (_) { /* The store exposes the actual server error. */ }
        if (!screen.hidden && store.state.uid === uid) { render(); feedback.focus({ preventScroll: true }); }
    });
    exportButton.addEventListener('click', () => {
        const data = store?.state;
        if (!data?.admin || exportButton.disabled) return;
        const url = URL.createObjectURL(new Blob([resultsCSV(data.participants, Date.now(), data.correctChoice)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = '엔조이-드롭퀴즈-20261019.csv';
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const refresh = () => { if (!screen.hidden) { store?.refresh(); render(); } };
    ['enjoy-auth-ready', 'enjoy-local-ready', 'enjoy-guest-entered', 'pageshow', 'focus', 'online'].forEach(type => window.addEventListener(type, refresh));
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pagehide', () => { clearTimeout(timer); store?.stop(); });
    window.addEventListener('pageshow', () => { if (!screen.hidden) store?.start(); });
    window.addEventListener('popstate', () => { if (!screen.hidden && history.state?.dropQuizViewId !== historyId) hide(); });
    screen.addEventListener('keydown', event => {
        if (screen.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); window.closeDropQuiz(); }
        else if (event.key === 'Tab') {
            const selectedRadio = inputs.find(input => input.checked) || inputs[0];
            const focusable = [back, ...(!choices.disabled ? [selectedRadio] : []), ...(!submit.disabled ? [submit] : []), ...(!adminPanel.hidden && !exportButton.disabled ? [exportButton] : [])];
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
    });
    render();
})();
