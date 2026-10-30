(function (root) {
    'use strict';
    const groups = ['drop', 'community', 'prediction'];
    const names = { drop: '사진', community: '글·일정', prediction: '예측', members: '멤버 목록', meeting: '모임통장', schedule: '일정' };
    function view(snapshot, sources) {
        const member = snapshot.mode === 'member';
        const confirmed = snapshot.confirmed || [];
        return { ready: !member || sources.every(source => confirmed.includes(source)),
            failed: member ? sources.filter(source => snapshot.states[source] === 'error') : [],
            slow: member ? sources.filter(source => snapshot.states[source] === 'slow') : [],
            pending: member ? sources.filter(source => !confirmed.includes(source)) : [] };
    }
    const block = shape => '<span class="home-sk-block home-sk-' + shape + '"></span>';
    function skeleton(shape) {
        if (shape === 'members') return '<div class="home-sk-members" aria-hidden="true">' + block('member').repeat(7) + '</div>';
        if (shape === 'summary') return '<div class="home-sk-summary" aria-hidden="true">' + block('title') + block('line') + block('line') + '</div>';
        return '<div class="home-sk-feed" aria-hidden="true"><div class="home-sk-prediction">' + block('title') + block('line') + block('choices') + block('line') + '</div>' +
            '<div class="home-sk-photo">' + block('avatar') + block('media') + '</div></div>';
    }
    function notice(status, sources) {
        const failed = status.failed, slow = status.slow;
        if (!failed.length && !slow.length) return '';
        const targets = failed.length ? failed : slow;
        return '<div class="home-source-notice" role="status"><p>' + targets.map(source => names[source] || source).join(', ') +
            (failed.length ? ' 정보를 불러오지 못했어요.' : ' 연결이 평소보다 오래 걸리고 있어요.') + '</p><div>' +
            targets.map(source => '<button type="button" data-home-loading-retry="' + source + '">' + (names[source] || source) + ' 다시 연결</button>').join('') + '</div></div>';
    }
    if (typeof module === 'object' && module.exports) module.exports = { view, skeleton };
    if (!root || !root.document || !root.enjoyAppLoading) return;
    const document = root.document;
    function status(sources) { return view(root.enjoyAppLoading.snapshot(), sources); }
    root.enjoyHomeLoading = {
        guardFeed(wrap) {
            const current = status(groups);
            wrap.setAttribute('aria-busy', String(!current.ready));
            wrap.dataset.loadingState = current.ready ? 'ready' : current.failed.length ? 'error' : 'loading';
            if (current.ready) return false;
            wrap.innerHTML = '<div class="home-source-placeholder" role="status"><span class="home-sk-label">사진·글·예측을 불러오는 중</span>' + notice(current, groups) + skeleton('feed') + '</div>';
            return true;
        },
        feedNotice: () => notice(status(groups), groups)
    };
    function render() {
        document.querySelectorAll('[data-home-loading]').forEach(content => {
            const sources = content.dataset.homeLoading.split(' '), current = status(sources);
            const id = content.id + '-loading-region';
            let placeholder = document.getElementById(id);
            if (!placeholder) {
                placeholder = document.createElement('section'); placeholder.id = id;
                placeholder.className = 'home-source-placeholder'; placeholder.setAttribute('role', 'status');
                content.before(placeholder);
            }
            content.dataset.sourcePending = String(!current.ready);
            content.setAttribute('aria-busy', String(!current.ready));
            placeholder.hidden = current.ready && !current.failed.length && !current.slow.length;
            const next = notice(current, sources) + (current.ready ? '' : '<span class="home-sk-label">정보를 불러오는 중</span>' + skeleton(content.dataset.homeLoadingShape));
            if (placeholder.innerHTML !== next) placeholder.innerHTML = next;
        });
        root.renderDropFeed?.();
    }
    document.addEventListener('click', event => {
        const source = event.target.closest?.('[data-home-loading-retry]')?.dataset.homeLoadingRetry;
        if (source && names[source]) root.enjoyAppLoading.retry(source);
    });
    root.enjoyAppLoading.subscribe(render);
    document.addEventListener('DOMContentLoaded', render, { once: true });
})(typeof window === 'object' ? window : null);
