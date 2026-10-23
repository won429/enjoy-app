(function () {
    'use strict';

    const panels = { wallet: 'wallet-panel-wallet', dues: 'mpanel-dues', expense: 'mpanel-expense' };
    const states = { meeting: 'loading', schedule: 'loading' };
    const labels = { wallet: '지갑', dues: '납부 내역', expense: '가계부' };
    const block = shape => '<span class="wallet-skeleton-block ws-' + shape + '"></span>';
    const row = '<div class="ws-row">' + block('avatar') + '<div class="ws-row-text">' + block('name') + block('caption') + '</div>' + block('amount') + '</div>';

    function markup(name) {
        if (name === 'wallet') {
            return '<div aria-hidden="true">' + block('caption') + block('balance') +
                '<div class="ws-card">' + block('name') + block('wide') + block('caption') + '</div>' +
                '<div class="ws-card">' + block('name') + row + '</div>' +
                '<div class="ws-folds">' + block('fold').repeat(3) + '</div></div>';
        }
        if (name === 'dues') {
            return '<div aria-hidden="true">' + block('month') + row.repeat(6) + '</div>';
        }
        return '<div aria-hidden="true"><div class="ws-card">' + block('caption') + block('wide') + block('caption') + '</div>' +
            '<div class="ws-card">' + block('name') + block('balance') + '<div class="ws-metrics">' + block('metric').repeat(2) + '</div>' + block('wide') + '</div>' +
            block('section') + row.repeat(4) + '</div>';
    }

    function render() {
        Object.entries(panels).forEach(([name, id]) => {
            const panel = document.getElementById(id);
            if (!panel) return;
            const dependencies = name === 'expense' ? ['meeting', 'schedule'] : ['meeting'];
            const loading = dependencies.some(source => states[source] === 'loading');
            const failed = !loading && dependencies.some(source => states[source] === 'error');
            let placeholder = panel.querySelector('.wallet-skeleton');
            if (!placeholder) {
                placeholder = document.createElement('div');
                placeholder.className = 'wallet-skeleton';
                placeholder.setAttribute('role', 'status');
                placeholder.setAttribute('aria-live', 'polite');
                panel.prepend(placeholder);
            }
            panel.classList.toggle('has-wallet-placeholder', loading || failed);
            panel.setAttribute('aria-busy', String(loading));
            placeholder.hidden = !loading && !failed;
            const state = loading ? 'loading' : failed ? 'error' : 'ready';
            if (placeholder.dataset.state === state) return;
            placeholder.dataset.state = state;
            placeholder.innerHTML = loading
                ? '<span class="wallet-skeleton-label">' + labels[name] + ' 정보를 불러오는 중</span>' + markup(name)
                : failed ? '<div class="ws-error">' + labels[name] + ' 정보를 불러오지 못했어요.<br>인터넷 연결을 확인해 주세요.</div>' : '';
        });
    }

    window.enjoyWalletLoading = {
        reset() {
            states.meeting = states.schedule = 'loading';
            render();
        },
        settle(source, failed) {
            if (!Object.prototype.hasOwnProperty.call(states, source)) return;
            // Keep usable data visible when a later live update fails.
            if (failed && states[source] === 'ready') return;
            states[source] = failed ? 'error' : 'ready';
            render();
        },
        local() {
            states.meeting = states.schedule = 'ready';
            render();
        }
    };
    render();
})();
