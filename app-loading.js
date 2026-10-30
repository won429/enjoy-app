(function (root) {
    'use strict';
    const loader = root.document.getElementById('app-loader');
    if (!loader) return;
    const memberSources = ['auth', 'profile', 'members', 'meeting', 'schedule', 'drop', 'community', 'prediction', 'notice', 'home'];
    const labels = { auth: '로그인 상태', profile: '회원 정보', members: '멤버 목록', meeting: '모임통장', schedule: '일정', drop: '사진', community: '글·일정', prediction: '예측', notice: '공지', home: '홈 화면' };
    const hardError = error => /permission-denied|unauthenticated|invalid-argument|failed-precondition/.test(String(error?.code || ''));
    let version = 0, owner = null, mode = 'pending', completed = false, framePending = false, deadline = null;
    let required = ['auth', 'home'], states = new Map(required.map(source => [source, 'pending']));
    let confirmed = new Set(), errors = new Map(), slowSources = new Set();
    const retries = new Map(), observers = new Set(), listeners = new Set();
    const errorBox = loader.querySelector('.app-loading-error');
    const errorMessage = loader.querySelector('[data-app-loading-message]');
    const errorTitle = loader.querySelector('[data-app-loading-title]');
    const frame = callback => root.requestAnimationFrame ? root.requestAnimationFrame(callback) : root.setTimeout(callback, 0);
    const readyAll = () => required.every(source => states.get(source) === 'ready');
    const snapshot = () => ({ version, owner, mode, completed, required: required.slice(), states: Object.fromEntries(states),
        confirmed: Array.from(confirmed), errors: Object.fromEntries(errors) });
    function emit() { listeners.forEach(fn => { try { fn(snapshot()); } catch (error) { root.console?.warn('Loading region:', error); } }); }
    function render() {
        if (completed) return;
        const failed = required.filter(source => states.get(source) === 'error');
        const slow = required.filter(source => states.get(source) === 'slow');
        loader.style.display = '';
        loader.dataset.state = failed.length ? 'error' : slow.length ? 'slow' : 'loading';
        loader.setAttribute('aria-hidden', 'false');
        loader.setAttribute('aria-busy', String(!failed.length));
        if (errorBox) errorBox.hidden = !failed.length && !slow.length;
        if (errorTitle) errorTitle.textContent = failed.length ? '연결을 확인해 주세요' : '서버 응답을 기다리고 있어요';
        if (errorMessage && (failed.length || slow.length)) {
            const names = (failed.length ? failed : slow).map(source => labels[source] || source).join(', ');
            errorMessage.textContent = failed.length ? names + ' 확인에 실패했어요. 해당 연결을 다시 시도해 주세요.' :
                names + ' 확인이 평소보다 오래 걸리고 있어요. 완료되는 대로 화면이 열려요.';
        }
    }
    function check() {
        render(); emit();
        if (completed || !readyAll() || framePending) return;
        const expected = version;
        framePending = true;
        frame(() => {
            if (expected !== version) return;
            framePending = false;
            if (!readyAll()) return;
            completed = true;
            root.clearTimeout(deadline); deadline = null;
            loader.dataset.state = 'hidden'; loader.style.display = 'none';
            loader.setAttribute('aria-busy', 'false'); loader.setAttribute('aria-hidden', 'true');
            if (errorBox) errorBox.hidden = true;
            emit();
        });
    }
    function set(source, state, expected = version, error) {
        if (expected !== version || !states.has(source)) return;
        if (state === 'slow') slowSources.add(source);
        if (['pending', 'retrying'].includes(state) && slowSources.has(source) && !confirmed.has(source)) state = 'slow';
        const before = states.get(source), previousError = errors.get(source), wasConfirmed = confirmed.has(source);
        states.set(source, state);
        if (error) errors.set(source, String(error.message || error.code || '연결 실패'));
        else if (state === 'ready' || state === 'retrying') errors.delete(source);
        if (state === 'ready') { confirmed.add(source); slowSources.delete(source); }
        if (before === state && previousError === errors.get(source) && wasConfirmed === confirmed.has(source)) return;
        check();
    }
    const fail = (source, expected = version, error) => set(source, 'error', expected, error);
    const slow = (source, expected = version) => { if (!confirmed.has(source)) set(source, 'slow', expected); };
    function armDeadline() {
        root.clearTimeout(deadline);
        const expected = version;
        deadline = root.setTimeout(() => {
            if (expected !== version || completed) return;
            required.filter(source => !confirmed.has(source) && states.get(source) !== 'error').forEach(source => slow(source, expected));
        }, 20000);
    }
    function begin(user) {
        [...observers].forEach(stop => stop()); retries.clear();
        version++; owner = user && !user.isAnonymous ? user.uid : null;
        mode = owner ? 'member' : 'public'; completed = false; framePending = false;
        // Authenticated identity is essential. Other services own their placeholders.
        required = owner ? ['auth', 'profile', 'home'] : ['auth', 'home'];
        states = new Map((owner ? memberSources : required).map(source => [source, source === 'auth' ? 'ready' : 'pending']));
        confirmed = new Set(['auth']); errors = new Map(); slowSources.clear();
        loader.dataset.mode = mode; render(); armDeadline(); emit();
        return version;
    }
    const ready = (source, expected = version) => set(source, 'ready', expected);
    function paint() { const expected = version; frame(() => ready('home', expected)); }
    function local() {
        if (states.get('auth') !== 'ready' || root.enjoyAuthInitFailed) return;
        mode = owner ? 'local' : 'public'; loader.dataset.mode = mode;
        required = owner ? ['auth', 'profile', 'home'] : ['auth', 'home'];
        states = new Map(required.map(source => [source, source === 'home' ? 'pending' : 'ready']));
        confirmed = new Set(required.filter(source => source !== 'home')); errors.clear(); slowSources.clear();
        paint(); emit();
    }
    function registerRetry(source, callback) {
        retries.set(source, callback);
        return () => { if (retries.get(source) === callback) retries.delete(source); };
    }
    function retry(source) {
        const targets = source ? [source] : required.filter(key => states.get(key) !== 'ready');
        targets.forEach(key => {
            if (retries.has(key)) retries.get(key)();
            else if (key === 'profile') root.enjoyRetryMemberProfile?.();
            else if (key === 'auth' && root.enjoyAuthInitFailed) {
                if (root.enjoyRetryFirebaseInit) root.enjoyRetryFirebaseInit();
                else root.location.reload(); // SDK itself could not be loaded.
            }
        });
        render(); emit();
    }
    function observe(source, reference, apply, onError) {
        const expected = version, uid = owner;
        const isLocal = !!(root.enjoyIsLocalGuest && root.enjoyIsLocalGuest());
        let unsub = null, retryTimer = null, slowTimer = null, attempt = 0, serial = 0, stopped = false;
        const current = () => !stopped && expected === version && uid === owner;
        function stop() {
            stopped = true; serial++;
            root.clearTimeout(retryTimer); root.clearTimeout(slowTimer);
            if (unsub) { unsub(); unsub = null; }
            unregister(); observers.delete(stop);
        }
        function attach(manual = false) {
            if (!current()) return;
            if (manual) attempt = 0;
            const generation = ++serial;
            root.clearTimeout(retryTimer); root.clearTimeout(slowTimer);
            if (unsub) { unsub(); unsub = null; }
            if (!isLocal && !confirmed.has(source)) set(source, attempt || manual ? 'retrying' : 'pending', expected);
            if (!isLocal && !confirmed.has(source)) root.enjoyWalletLoading?.pending?.(source);
            if (!isLocal) slowTimer = root.setTimeout(() => { if (current() && generation === serial) slow(source, expected); }, 20000);
            const failure = error => {
                if (!current() || generation !== serial) return;
                root.clearTimeout(slowTimer);
                const again = !isLocal && !hardError(error) && attempt < 2;
                if (again) {
                    attempt++;
                    set(source, 'retrying', expected, error);
                    retryTimer = root.setTimeout(() => attach(), 1000 * Math.pow(2, attempt - 1));
                } else {
                    fail(source, expected, error);
                    if (onError) onError(error);
                }
            };
            const receive = data => {
                if (!current() || generation !== serial) return;
                try { apply(data); } catch (error) { failure(error); return; }
                if (!isLocal && data.metadata?.fromCache === false && data.metadata?.hasPendingWrites !== true) {
                    attempt = 0; root.clearTimeout(retryTimer); root.clearTimeout(slowTimer); ready(source, expected);
                }
            };
            try { unsub = isLocal ? root.fsOnSnapshot(reference, receive, failure) :
                root.fsOnSnapshot(reference, { includeMetadataChanges: true }, receive, failure); }
            catch (error) { failure(error); }
        }
        const unregister = registerRetry(source, () => attach(true));
        observers.add(stop); attach();
        return stop;
    }
    root.enjoyAppLoading = {
        begin, ready, fail, slow, paint, local, observe, retry, registerRetry, snapshot,
        pending: (source, expected = version) => set(source, 'retrying', expected),
        report: (source, error, expected = version) => hardError(error) ? fail(source, expected, error) : set(source, 'retrying', expected, error),
        subscribe(callback) { listeners.add(callback); callback(snapshot()); return () => listeners.delete(callback); }
    };
    root.enjoyFinishAppLoading = check;
    root.enjoyCancelAppLoading = () => required.filter(source => !confirmed.has(source)).forEach(source => slow(source));
    loader.querySelector('[data-app-loading-retry]')?.addEventListener('click', () => retry());
    const resume = () => { for (const [source, callback] of retries) if (['error', 'slow', 'retrying'].includes(states.get(source))) callback(); };
    root.addEventListener?.('online', resume);
    root.addEventListener?.('error', event => {
        if (event.target?.tagName === 'SCRIPT' && event.target.type === 'module' && !completed) {
            root.enjoyAuthInitFailed = true; fail('auth', version, new Error('로그인 모듈을 불러오지 못했어요.'));
        }
    }, true);
    root.document.addEventListener?.('visibilitychange', () => { if (!root.document.hidden) resume(); });
    root.enjoyInitialSnapshot = observe;
    render(); armDeadline();
})(window);
