(function (root) {
    'use strict';
    const loader = root.document.getElementById('app-loader');
    if (!loader) return;
    const memberSources = ['auth', 'profile', 'members', 'meeting', 'schedule', 'drop', 'community', 'notice', 'home'];
    let version = 0, owner = null, mode = 'pending', completed = false, framePending = false, deadline = null;
    let required = ['auth', 'home'], states = new Map(required.map(source => [source, 'pending']));
    const errorBox = loader.querySelector('.app-loading-error');
    const errorMessage = loader.querySelector('[data-app-loading-message]');
    const frame = callback => root.requestAnimationFrame ? root.requestAnimationFrame(callback) : root.setTimeout(callback, 0);
    const readyAll = () => required.every(source => states.get(source) === 'ready');

    function render() {
        if (completed) return;
        const failed = required.some(source => states.get(source) === 'error');
        loader.style.display = '';
        loader.dataset.state = failed ? 'error' : 'loading';
        loader.setAttribute('aria-hidden', 'false');
        loader.setAttribute('aria-busy', String(!failed));
        if (errorBox) errorBox.hidden = !failed;
        if (errorMessage && failed) errorMessage.textContent = states.get('auth') === 'error'
            ? '로그인 상태를 확인하지 못했어요. 연결을 확인한 뒤 다시 불러와 주세요.'
            : '첫 화면 데이터를 서버에서 가져오지 못했어요. 연결을 확인한 뒤 다시 불러와 주세요.';
    }
    function check() {
        if (completed) return;
        render();
        if (!readyAll() || framePending) return;
        const expected = version;
        framePending = true;
        frame(() => {
            if (expected !== version) return;
            framePending = false;
            if (!readyAll()) return;
            completed = true;
            root.clearTimeout(deadline); deadline = null;
            loader.dataset.state = 'hidden';
            loader.style.display = 'none';
            loader.setAttribute('aria-busy', 'false');
            loader.setAttribute('aria-hidden', 'true');
            if (errorBox) errorBox.hidden = true;
        });
    }
    function fail(source) {
        if (completed || !states.has(source) || states.get(source) === 'ready') return;
        states.set(source, 'error'); render();
    }
    function armDeadline() {
        root.clearTimeout(deadline);
        const expected = version;
        deadline = root.setTimeout(() => {
            if (expected !== version || completed) return;
            required.filter(source => states.get(source) !== 'ready').forEach(fail);
        }, 20000);
    }
    function begin(user) {
        version++; owner = user && !user.isAnonymous ? user.uid : null;
        mode = owner ? 'member' : 'public'; completed = false; framePending = false;
        required = owner ? memberSources.slice() : ['auth', 'home'];
        states = new Map(required.map(source => [source, source === 'auth' ? 'ready' : 'pending']));
        loader.dataset.mode = mode;
        render(); armDeadline();
        return version;
    }
    function ready(source, expected = version) {
        if (expected !== version || !states.has(source)) return;
        states.set(source, 'ready'); check();
    }
    function paint() {
        const expected = version;
        frame(() => ready('home', expected));
    }
    function local() {
        // An undecided or failed auth request must never silently become a guest success.
        if (states.get('auth') !== 'ready' || root.enjoyAuthInitFailed) return;
        mode = owner ? 'local' : 'public'; loader.dataset.mode = mode;
        required = owner ? ['auth', 'profile', 'home'] : ['auth', 'home'];
        states = new Map(required.map(source => [source, source === 'home' ? 'pending' : 'ready']));
        paint();
    }
    function observe(source, reference, apply, onError) {
        const expected = version, uid = owner;
        const isLocal = !!(root.enjoyIsLocalGuest && root.enjoyIsLocalGuest());
        const current = () => expected === version && uid === owner;
        const failure = error => {
            if (!current()) return;
            fail(source);
            if (onError) onError(error);
        };
        const receive = snapshot => {
            if (!current()) return;
            try { apply(snapshot); } catch (error) { failure(error); return; }
            // A cached/optimistic document may render behind the skeleton, but it
            // cannot confirm that this session has fetched the current server data.
            if (!isLocal && snapshot.metadata?.fromCache === false && snapshot.metadata?.hasPendingWrites !== true) ready(source, expected);
        };
        try {
            return isLocal
                ? root.fsOnSnapshot(reference, receive, failure)
                : root.fsOnSnapshot(reference, { includeMetadataChanges: true }, receive, failure);
        } catch (error) { failure(error); return null; }
    }
    root.enjoyAppLoading = {
        begin, ready, fail, paint, local, observe,
        snapshot: () => ({ version, owner, mode, completed, states: Object.fromEntries(states) })
    };
    // Legacy callers may ask to finish; only the readiness gate can dismiss it.
    root.enjoyFinishAppLoading = check;
    root.enjoyCancelAppLoading = () => required.filter(source => states.get(source) !== 'ready').forEach(fail);
    loader.querySelector('[data-app-loading-retry]')?.addEventListener('click', () => root.location.reload());
    root.enjoyInitialSnapshot = observe;
    render(); armDeadline();
})(window);
