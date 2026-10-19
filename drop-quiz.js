(() => {
    const QUIZ_ID = '2026-10-19-seongwonje-birthplace';
    const STARTS_AT = Date.parse('2026-10-19T17:48:22+09:00');
    // Thursday 23:59:59 is included; submissions close at Friday midnight in Korea.
    const CLOSES_AT = Date.parse('2026-10-23T00:00:00+09:00');
    const REVEALS_AT = CLOSES_AT;
    const CORRECT_CHOICE = 1;

    function validSubmission(value) {
        return !!(value && value.quizId === QUIZ_ID && Number.isInteger(value.choice) &&
            value.choice >= 1 && value.choice <= 5 && Number.isFinite(value.submittedAt) &&
            value.submittedAt >= STARTS_AT && value.submittedAt < CLOSES_AT);
    }
    function quizState(now, submission) {
        const phase = now < STARTS_AT ? 'scheduled' : now < CLOSES_AT ? 'open' : 'revealed';
        const choice = validSubmission(submission) ? submission.choice : null;
        return {
            phase, choice,
            correctChoice: now >= REVEALS_AT ? CORRECT_CHOICE : null,
            result: now < REVEALS_AT ? null : choice === null ? 'unanswered' : choice === CORRECT_CHOICE ? 'correct' : 'incorrect'
        };
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { QUIZ_ID, STARTS_AT, CLOSES_AT, REVEALS_AT, validSubmission, quizState };
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
    let previousFocus = null, overflow = '', historyId = '', timer = null;
    let storageKey = '', submission = null, selectedChoice = null, saveError = false;

    function currentStorageKey() {
        const user = window.enjoyDataUser?.() || window.enjoyUser;
        return 'enjoy_drop_quiz_v1_' + QUIZ_ID + '_' + (user?.uid || 'guest');
    }
    function readSubmission() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey));
            return validSubmission(value) ? value : null;
        } catch (_) { return null; }
    }
    function loadSubmission(force = false) {
        const key = currentStorageKey();
        if (!force && key === storageKey) return;
        storageKey = key;
        submission = readSubmission();
        selectedChoice = submission?.choice || null;
        saveError = false;
    }
    function render() {
        loadSubmission();
        const state = quizState(Date.now(), submission);
        const open = state.phase === 'open';
        screen.dataset.phase = state.phase;
        choices.disabled = !open;
        if (!open) selectedChoice = state.choice;
        inputs.forEach(input => {
            const number = Number(input.value);
            input.checked = selectedChoice === number;
            const label = input.closest('label');
            const result = label.querySelector('.drop-quiz-option-result');
            const correct = state.correctChoice === number;
            const wrong = state.result === 'incorrect' && state.choice === number;
            label.dataset.result = correct ? 'correct' : wrong ? 'incorrect' : '';
            result.textContent = correct ? (state.choice === number ? '정답 · 나의 답안' : '정답') : wrong ? '나의 답안 · 오답' : '';
        });
        description.textContent = open ? '아래 보기 중 정답 하나를 선택해 주세요.' :
            state.phase === 'scheduled' ? '아직 퀴즈 참여가 시작되지 않았어요.' : '퀴즈 참여가 종료되었어요. 정답과 채점 결과를 확인해 주세요.';
        submit.disabled = !open || !selectedChoice || selectedChoice === state.choice;
        submit.textContent = !open ? (state.phase === 'scheduled' ? '참여 시작 전' : '참여 종료') :
            state.choice && selectedChoice === state.choice ? '제출 완료' : state.choice ? '답안 변경' : '답안 제출';
        let message = '';
        if (state.phase === 'revealed') {
            message = state.result === 'correct' ? '정답이에요! 제출한 1번 답안이 정답입니다.' :
                state.result === 'incorrect' ? '아쉬워요. 제출한 ' + state.choice + '번 답안은 오답입니다. 정답은 1번이에요.' :
                '참여 기간이 종료되었어요. 제출한 답안이 없습니다. 정답은 1번이에요.';
            message += '\n정답: 경북 구미시(구. 칠곡군 인동면 소재지)';
        } else if (saveError) {
            message = '답안을 저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 제출해 주세요.';
        } else if (state.choice) {
            message = state.choice + '번으로 참여했어요.\n정답과 채점 결과는 10월 23일(금) 00:00에 공개돼요.';
        }
        if (feedback.textContent !== message) feedback.textContent = message;
        scheduleRefresh();
    }
    function scheduleRefresh() {
        clearTimeout(timer);
        timer = null;
        if (screen.hidden || document.visibilityState === 'hidden') return;
        const now = Date.now();
        const next = now < STARTS_AT ? STARTS_AT : now < REVEALS_AT ? REVEALS_AT : null;
        // Recheck device time regularly and refresh at the boundary without a page reload.
        if (next !== null) timer = setTimeout(render, Math.min(60000, Math.max(1, next - now)));
    }
    function hide() {
        if (screen.hidden) return;
        screen.hidden = true;
        clearTimeout(timer);
        timer = null;
        document.body.style.overflow = overflow;
        (previousFocus?.isConnected ? previousFocus : document.getElementById('drop-quiz-button'))?.focus({ preventScroll: true });
    }

    window.openDropQuiz = () => {
        if (!screen.hidden) return;
        previousFocus = document.activeElement;
        overflow = document.body.style.overflow;
        loadSubmission(true);
        screen.hidden = false;
        render();
        screen.querySelector('.drop-quiz-scroll').scrollTop = 0;
        document.body.style.overflow = 'hidden';
        historyId = 'drop-quiz-' + Date.now();
        history.pushState({ ...history.state, modal: 'drop-quiz', dropQuizViewId: historyId }, '', location.href);
        back.focus({ preventScroll: true });
    };
    window.closeDropQuiz = () => {
        if (screen.hidden) return;
        const undo = history.state?.dropQuizViewId === historyId;
        hide();
        if (undo) history.back();
    };

    entry.addEventListener('click', () => window.openDropQuiz());
    back.addEventListener('click', () => window.closeDropQuiz());
    form.addEventListener('change', event => {
        if (!inputs.includes(event.target)) return;
        loadSubmission();
        selectedChoice = Number(event.target.value);
        saveError = false;
        render();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        loadSubmission();
        const now = Date.now();
        if (quizState(now, submission).phase !== 'open' || !inputs.some(input => Number(input.value) === selectedChoice)) {
            render();
            return;
        }
        const value = { quizId: QUIZ_ID, choice: selectedChoice, submittedAt: now };
        try {
            localStorage.setItem(storageKey, JSON.stringify(value));
            submission = value;
            saveError = false;
        } catch (_) { saveError = true; }
        render();
        feedback.focus({ preventScroll: true });
    });
    window.addEventListener('storage', event => {
        if (event.key !== null && event.key !== storageKey) return;
        loadSubmission(true);
        render();
    });
    ['enjoy-auth-ready', 'enjoy-local-ready', 'enjoy-guest-entered'].forEach(type => {
        window.addEventListener(type, () => { loadSubmission(true); render(); });
    });
    window.addEventListener('pageshow', () => { loadSubmission(true); render(); });
    window.addEventListener('focus', render);
    document.addEventListener('visibilitychange', render);
    window.addEventListener('popstate', () => {
        if (!screen.hidden && history.state?.dropQuizViewId !== historyId) hide();
    });
    screen.addEventListener('keydown', event => {
        if (screen.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            window.closeDropQuiz();
        } else if (event.key === 'Tab') {
            const selectedRadio = inputs.find(input => input.checked) || inputs[0];
            const focusable = [back, ...(!choices.disabled ? [selectedRadio] : []), ...(!submit.disabled ? [submit] : [])];
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    render();
})();
