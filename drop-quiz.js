(() => {
    const screen = document.getElementById('drop-quiz-screen');
    const entry = document.getElementById('drop-quiz-button');
    if (!screen || !entry) return;

    // Set the single question here once its content is supplied:
    // { prompt: '...', answer: '...', acceptedAnswers: ['...'], explanation: '...' }
    const question = null;
    const back = document.getElementById('drop-quiz-back');
    const form = document.getElementById('drop-quiz-form');
    const answer = document.getElementById('drop-quiz-answer');
    const submit = document.getElementById('drop-quiz-submit');
    const feedback = document.getElementById('drop-quiz-feedback');
    let previousFocus = null, overflow = '', historyId = '', solved = false;
    const normalize = value => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');

    function render() {
        const ready = Boolean(question?.prompt && question?.answer != null);
        document.getElementById('drop-quiz-question').textContent = ready ? question.prompt : '문제를 준비하고 있어요';
        document.getElementById('drop-quiz-description').textContent = ready ? '정답을 입력해 주세요.' : '문제가 등록되면 이곳에서 바로 풀 수 있어요.';
        answer.disabled = !ready || solved;
        submit.disabled = !ready || solved;
        submit.textContent = solved ? '정답 확인 완료' : '정답 제출';
    }

    function hide() {
        if (screen.hidden) return;
        screen.hidden = true;
        document.body.style.overflow = overflow;
        (previousFocus?.isConnected ? previousFocus : document.getElementById('drop-quiz-button'))?.focus({ preventScroll: true });
    }

    window.openDropQuiz = () => {
        if (!screen.hidden) return;
        previousFocus = document.activeElement;
        overflow = document.body.style.overflow;
        render();
        screen.hidden = false;
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

    // Fallback for the static button before the React entry bundle loads.
    entry.addEventListener('click', () => window.openDropQuiz());
    back.addEventListener('click', () => window.closeDropQuiz());
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!question || solved) return;
        const value = normalize(answer.value);
        if (!value) {
            feedback.textContent = '정답을 입력해 주세요.';
            answer.focus();
            return;
        }
        const accepted = [question.answer, ...(question.acceptedAnswers || [])].map(normalize);
        solved = accepted.includes(value);
        feedback.textContent = solved
            ? '정답이에요!' + (question.explanation ? '\n' + question.explanation : '')
            : '아쉬워요. 다시 한번 생각해 보세요.';
        answer.setAttribute('aria-invalid', String(!solved));
        render();
        if (solved) feedback.focus({ preventScroll: true });
        else answer.focus();
    });
    answer.addEventListener('input', () => {
        answer.removeAttribute('aria-invalid');
        feedback.textContent = '';
    });
    window.addEventListener('popstate', () => {
        if (!screen.hidden && history.state?.dropQuizViewId !== historyId) hide();
    });
    screen.addEventListener('keydown', event => {
        if (screen.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            window.closeDropQuiz();
        } else if (event.key === 'Tab') {
            const focusable = Array.from(screen.querySelectorAll('button:not(:disabled), input:not(:disabled)'));
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
