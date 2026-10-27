const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const guest = fs.readFileSync(path.join(__dirname, '../guest-local.js'), 'utf8');
const entry = fs.readFileSync(path.join(__dirname, '../home-entry.js'), 'utf8');

function runtime({ user, storage = new Map(), unavailable = false, resolve = true } = {}) {
    const classes = () => {
        const items = new Set();
        return { toggle(name, enabled) { enabled ? items.add(name) : items.delete(name); }, contains: name => items.has(name) };
    };
    const menu = Object.fromEntries(['home-login', 'home-logout', 'home-withdraw'].map(id => [id, { classList: classes() }]));
    const handlers = {}, redirects = [], selectedTabs = [], timers = new Map();
    let cloudCalls = 0, prompts = 0, finishes = 0, cancellations = 0;
    const window = {
        enjoyUser: user,
        crypto: { randomUUID: () => 'public-visitor' },
        localStorage: {
            getItem(key) { if (unavailable) throw new Error('Storage blocked'); return storage.get(key) || null; },
            setItem(key, value) { if (unavailable) throw new Error('Storage blocked'); storage.set(key, value); }
        },
        document: { documentElement: { classList: classes() }, getElementById: id => menu[id] || null },
        location: { assign: url => redirects.push(url) },
        addEventListener(name, handler) { (handlers[name] ||= []).push(handler); },
        dispatchEvent(event) { (handlers[event.type] || []).forEach(handler => handler(event)); },
        CustomEvent: class { constructor(type) { this.type = type; } },
        requestAnimationFrame: fn => fn(),
        setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); },
        enjoyFinishAppLoading: () => finishes++,
        enjoyCancelAppLoading: () => cancellations++,
        selectHomeTab: tab => { selectedTabs.push(tab); window.homeActiveTab = tab; },
        enjoyOpenGuestProfile: () => prompts++,
        fsSetDoc: () => { cloudCalls++; throw new Error('Unexpected cloud write'); }
    };
    const context = vm.createContext({ window, queueMicrotask, console: { warn() {} } });
    vm.runInContext(guest, context);
    vm.runInContext(entry, context);
    function resolveAuth(nextUser = window.enjoyUser) {
        if (nextUser) window.enjoyLeaveLocalGuest();
        window.enjoyUser = nextUser || null;
        window.enjoyAuthResolved = true;
        window.dispatchEvent({ type: 'enjoy-auth-ready' });
        if (!window.enjoyUser) window.enjoyShowPublicHome();
    }
    if (resolve) resolveAuth();
    return { window, menu, storage, redirects, selectedTabs, timers, resolveAuth,
        cloudCalls: () => cloudCalls, prompts: () => prompts,
        finishes: () => finishes, cancellations: () => cancellations };
}

test('a first-time visitor gets Webnovel without a name prompt or cloud write', async () => {
    const app = runtime();
    assert.equal(app.prompts(), 0);
    assert.equal(app.window.enjoyUser, null);
    assert.equal(app.window.enjoyDataUser().localOnly, true);
    assert.equal(app.window.enjoyDataUser().displayName, '게스트');
    assert.deepEqual(app.selectedTabs, ['webnovel']);
    assert.equal(app.menu['home-login'].classList.contains('hidden'), false);
    assert.equal(app.menu['home-logout'].classList.contains('hidden'), true);
    await app.window.fsSetDoc(app.window.fsDoc('members', app.window.enjoyDataUser().uid), { name: '게스트' });
    assert.equal(app.cloudCalls(), 0);
    assert.equal(app.finishes(), 1);
    assert.equal(app.cancellations(), 0);
});

test('returning guest identity and local records are retained', () => {
    const storage = new Map([
        ['enjoy_guest_profile_v1', '기존 방문자'],
        ['enjoy_guest_device_id_v1', 'device-original'],
        ['enjoy_guest_records_v1', JSON.stringify({ 'community_posts/old': { title: '기존 기록' } })]
    ]);
    const app = runtime({ storage });
    assert.equal(app.window.enjoyDataUser().uid, 'device-original');
    assert.equal(app.window.enjoyDataUser().displayName, '기존 방문자');
    assert.equal(JSON.parse(storage.get('enjoy_guest_records_v1'))['community_posts/old'].title, '기존 기록');
    assert.deepEqual(app.selectedTabs, ['webnovel']);
});

test('background authentication completion does not reset the public tab or guest identity', () => {
    const app = runtime();
    const identity = app.window.enjoyDataUser();
    app.window.homeActiveTab = 'academic';
    app.window.enjoyShowPublicHome();
    assert.equal(app.window.homeActiveTab, 'academic');
    assert.equal(app.window.enjoyDataUser(), identity);
    assert.deepEqual(app.selectedTabs, ['webnovel']);
});

test('restoring a member session leaves the member identity intact and updates the account menu', () => {
    const member = { uid: 'member-user' };
    const app = runtime({ user: member });
    assert.equal(app.window.enjoyUser, member);
    assert.equal(app.window.enjoyIsLocalGuest(), false);
    assert.equal(app.menu['home-login'].classList.contains('hidden'), true);
    assert.equal(app.menu['home-logout'].classList.contains('hidden'), false);
    assert.equal(app.menu['home-withdraw'].classList.contains('hidden'), false);
    assert.deepEqual(app.selectedTabs, ['home']);
    assert.equal(app.finishes(), 0);
    assert.equal(app.cancellations(), 0);
});

test('auth state changes update the menu and all login entry points use the separate page', () => {
    const app = runtime();
    app.window.enjoyLeaveLocalGuest();
    app.window.enjoyUser = { uid: 'restored-user' };
    app.window.dispatchEvent({ type: 'enjoy-auth-ready' });
    assert.equal(app.menu['home-login'].classList.contains('hidden'), true);
    assert.equal(app.menu['home-logout'].classList.contains('hidden'), false);
    app.window.enjoyLogin();
    assert.deepEqual(app.redirects, ['login.html']);
});

test('blocked browser storage still permits viewing the public home', () => {
    const app = runtime({ unavailable: true });
    assert.deepEqual(app.selectedTabs, ['webnovel']);
    assert.equal(app.prompts(), 0);
    assert.equal(app.menu['home-login'].classList.contains('hidden'), false);
    assert.equal(app.cloudCalls(), 0);
});

test('initial loading waits for restored membership before choosing the default tab', () => {
    const app = runtime({ resolve: false });
    assert.deepEqual(app.selectedTabs, []);
    assert.equal(app.window.enjoyIsLocalGuest(), false);
    assert.equal(app.finishes(), 0);
    assert.equal(app.cancellations(), 0);
    app.resolveAuth({ uid: 'restored-member' });
    assert.deepEqual(app.selectedTabs, ['home']);
    assert.equal(app.window.enjoyIsLocalGuest(), false);
    assert.equal(app.timers.size, 0);
    // The member data subscriptions dismiss loading; the entry code does not skip it.
    assert.equal(app.finishes(), 0);
    assert.equal(app.cancellations(), 0);
});

test('a late restored session switches a guest fallback back to the member Drop default', () => {
    const app = runtime({ resolve: false });
    [...app.timers.values()][0]();
    assert.deepEqual(app.selectedTabs, ['webnovel']);
    assert.equal(app.finishes(), 1);
    assert.equal(app.cancellations(), 0);
    app.resolveAuth({ uid: 'late-member' });
    assert.deepEqual(app.selectedTabs, ['webnovel', 'home']);
    assert.equal(app.window.enjoyIsLocalGuest(), false);
});

test('repeated member auth events preserve a tab selected after the initial Drop default', () => {
    const app = runtime({ user: { uid: 'member' } });
    app.window.homeActiveTab = 'baseball';
    app.window.dispatchEvent({ type: 'enjoy-auth-ready' });
    assert.deepEqual(app.selectedTabs, ['home']);
    assert.equal(app.window.homeActiveTab, 'baseball');
});

test('upcoming/F1 content is deleted while published regional programs and the loader remain', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    for (const removed of ['공개 예정', 'F1 더 엔조이 무비', 'f1-movie', 'ig-coming-art', 'COMING SOON']) {
        assert.equal(html.includes(removed), false, removed);
    }
    assert.ok(html.includes('data-home-card="enjoy-vlog"'));
    assert.ok(html.includes('data-home-card="gwangju-2027"'));
    const initializer = html.slice(html.indexOf('        function initRegionalVlogRails()'));
    const collections = initializer.match(/const collections = (\[[\s\S]*?\n            \]);/)[1];
    assert.deepEqual(Array.from(vm.runInNewContext(collections), group => group.title), [
        '전남광주 브이로그', '부산울산경남 브이로그', '대구경북 브이로그', '대전충남 브이로그', '제주 브이로그'
    ]);
    const loader = html.match(/<div id="app-loader"[^>]*>/)[0];
    assert.ok(loader.includes('class="app-loading-skeleton"'));
    assert.ok(loader.includes('data-state="loading"'));
    assert.ok(loader.includes('aria-busy="true"'));
    assert.equal(loader.includes('display:none'), false);
    assert.equal(loader.includes('data-autostart="false"'), false);
    assert.ok(html.includes('src="app-loading.js?v=20261027-1"'));
    assert.equal(html.includes('src="loading-island.js'), false);
    assert.equal(html.includes('href="assets/loading-island/'), false);
    for (const file of ['loading-island.js', 'loading-island.css', 'assets/loading-island/scan.webp', 'assets/loading-island/done.webp', 'assets/loading-island/orbit.webp']) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
    }
});
