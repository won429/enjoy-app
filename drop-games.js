(() => {
    const screen = document.getElementById('drop-games-screen');
    const entry = document.getElementById('drop-games-button');
    if (!screen || !entry) return;

    const stack = screen.querySelector('.drop-wallet-stack');
    const cards = Array.from(stack.querySelectorAll('[data-game]'));
    const back = document.getElementById('drop-wallet-back');
    const play = document.getElementById('drop-wallet-play');
    const title = document.getElementById('drop-wallet-selected');
    const description = document.getElementById('drop-wallet-description');
    const count = document.getElementById('drop-wallet-count');
    const games = {
        uno: { title: '드롭 우노', description: '같은 색, 같은 숫자. 마지막 한 장까지 짜릿하게.', open: 'openDropGame' },
        cube: { title: '드롭 큐브', description: '숫자를 연결하고, 나만의 조합을 완성해 보세요.', open: 'openDropCube' },
        tekken: { title: '드롭 철권', description: '타이밍을 노려 한 방. 지금 대결을 시작해 보세요.', open: 'openDropTekken' },
        war: { title: '드롭 전쟁', description: '나만의 전략으로 영토를 넓혀 보세요.', open: 'openDropWar' }
    };
    let order = [], selected = 'uno', historyId = '', previousFocus = null, overflow = '';
    let liftTimer = null;
    const available = card => !card.hidden && card.style.display !== 'none';
    const gameIsOpen = () => ['uno', 'cube', 'tekken', 'war'].some(game => {
        const gameScreen = document.getElementById(game + '-game-screen');
        return gameScreen && !gameScreen.hidden;
    });

    function render() {
        const visible = cards.filter(available);
        order = order.filter(card => visible.includes(card));
        visible.forEach(card => { if (!order.includes(card)) order.unshift(card); });
        if (!order.some(card => card.dataset.game === selected)) selected = 'uno';
        const front = order.findIndex(card => card.dataset.game === selected);
        if (front >= 0 && front !== order.length - 1) {
            [order[front], order[order.length - 1]] = [order[order.length - 1], order[front]];
        }
        order.forEach((card, slot) => {
            card.style.setProperty('--wallet-slot', slot);
            card.style.zIndex = String(slot + 1);
            card.setAttribute('aria-pressed', String(card.dataset.game === selected));
        });
        stack.style.setProperty('--wallet-steps', Math.max(0, order.length - 1));
        title.textContent = games[selected].title;
        description.textContent = games[selected].description;
        count.textContent = order.length + '개의 게임';
        play.setAttribute('aria-label', games[selected].title + ' 게임하러 가기');
    }

    function select(card) {
        if (!available(card) || selected === card.dataset.game) return;
        clearTimeout(liftTimer);
        cards.forEach(item => item.classList.remove('is-lifting'));
        selected = card.dataset.game;
        card.classList.add('is-lifting');
        render();
        liftTimer = setTimeout(() => card.classList.remove('is-lifting'), 500);
        window.haptic?.();
    }

    function hide() {
        if (screen.hidden) return;
        screen.hidden = true;
        document.body.style.overflow = overflow;
        clearTimeout(liftTimer);
        cards.forEach(card => card.classList.remove('is-lifting'));
        previousFocus?.focus({ preventScroll: true });
    }

    window.openDropGames = () => {
        if (!screen.hidden) return;
        previousFocus = document.activeElement;
        overflow = document.body.style.overflow;
        selected = 'uno';
        order = cards.filter(available);
        render();
        screen.hidden = false;
        screen.querySelector('.drop-wallet-scroll').scrollTop = 0;
        document.body.style.overflow = 'hidden';
        historyId = 'drop-wallet-' + Date.now();
        history.pushState({ ...history.state, modal: 'drop-games', dropWalletViewId: historyId }, '', location.href);
        back.focus({ preventScroll: true });
    };
    window.closeDropGames = () => {
        if (screen.hidden || gameIsOpen()) return;
        const undo = history.state?.dropWalletViewId === historyId;
        hide();
        if (undo) history.back();
    };

    entry.addEventListener('click', () => window.openDropGames());
    back.addEventListener('click', () => window.closeDropGames());
    cards.forEach(card => card.addEventListener('click', () => select(card)));
    play.addEventListener('click', () => {
        render(); // Recheck access if an account change just hid a card.
        window[games[selected].open]?.();
    });
    window.addEventListener('popstate', () => {
        if (!screen.hidden && history.state?.dropWalletViewId !== historyId) hide();
    });
    screen.addEventListener('keydown', event => {
        if (screen.hidden || gameIsOpen()) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            window.closeDropGames();
        } else if (event.key === 'Tab') {
            const focusable = [back, ...cards.filter(available), play];
            const current = focusable.indexOf(document.activeElement);
            if (event.shiftKey && current <= 0) {
                event.preventDefault();
                play.focus();
            } else if (!event.shiftKey && (current < 0 || current === focusable.length - 1)) {
                event.preventDefault();
                back.focus();
            }
        }
    });
    new MutationObserver(render).observe(document.getElementById('drop-war-button'), {
        attributes: true, attributeFilter: ['hidden']
    });
    render();
})();
