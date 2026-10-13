(function (root) {
    'use strict';
    // Guest records never use a Firebase identity or the members' shared store.
    const RECORDS_KEY = 'enjoy_guest_records_v1';
    const ID_KEY = 'enjoy_guest_device_id_v1';
    const PROFILE_KEY = 'enjoy_guest_profile_v1';
    const listeners = new Set();
    const remote = {};
    const wrappers = {};
    let transactionChain = Promise.resolve();
    let identity = null;
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const active = () => root.enjoyLocalMode === true && !root.enjoyUser;
    const read = () => {
        const value = JSON.parse(root.localStorage.getItem(RECORDS_KEY) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    };
    const newId = () => root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const path = parts => parts.flatMap(part => typeof part === 'string' ? [part] : part && part.localOnly && part.path ? [part.path] : []).join('/');
    const ref = (parts, kind) => ({ path: path(parts), id: path(parts).split('/').pop(), kind, localOnly: true });
    const field = (value, key) => key.split('.').reduce((item, part) => item == null ? undefined : item[part], value);
    function resolve(value, previous) {
        if (!value || typeof value !== 'object') return value;
        if (value.__enjoyLocalOperation === 'increment') return (Number(previous) || 0) + value.value;
        if (value.__enjoyLocalOperation === 'union') {
            const result = Array.isArray(previous) ? clone(previous) : [];
            value.values.forEach(item => { if (!result.some(existing => JSON.stringify(existing) === JSON.stringify(item))) result.push(clone(item)); });
            return result;
        }
        if (value.__enjoyLocalOperation === 'remove') return (Array.isArray(previous) ? previous : []).filter(item => !value.values.some(other => JSON.stringify(other) === JSON.stringify(item)));
        if (Array.isArray(value)) return value.map(item => resolve(item));
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, previous && previous[key])]));
    }
    function merge(previous, value) {
        const result = clone(previous || {});
        Object.entries(value).forEach(([key, item]) => {
            const old = result[key];
            result[key] = item && typeof item === 'object' && !Array.isArray(item) && !item.__enjoyLocalOperation
                ? merge(old && typeof old === 'object' ? old : {}, item) : resolve(item, old);
        });
        return result;
    }
    function update(records, reference, data, options, dotted) {
        const previous = records[reference.path];
        if (dotted && !previous) throw new Error('저장된 기록을 찾을 수 없어요.');
        if (!dotted) { records[reference.path] = options && options.merge ? merge(previous, data) : resolve(data, previous); return; }
        const result = clone(previous);
        Object.entries(data).forEach(([key, value]) => {
            const parts = key.split('.');
            let target = result;
            parts.slice(0, -1).forEach(part => { target[part] = target[part] && typeof target[part] === 'object' ? target[part] : {}; target = target[part]; });
            const last = parts[parts.length - 1];
            target[last] = resolve(value, target[last]);
        });
        records[reference.path] = result;
    }
    function documentSnapshot(reference, records) {
        const value = records[reference.path];
        return { id: reference.id, ref: reference, exists: () => value !== undefined, data: () => clone(value) };
    }
    function snapshot(reference, records) {
        if (reference.kind === 'doc') return documentSnapshot(reference, records);
        let docs = Object.keys(records).filter(key => key.startsWith(reference.path + '/') && key.slice(reference.path.length + 1).indexOf('/') === -1)
            .map(key => documentSnapshot(ref([key], 'doc'), records));
        for (const rule of reference.rules || []) {
            if (rule.kind === 'where') docs = docs.filter(entry => {
                const value = field(entry.data(), rule.field);
                if (rule.operator === '==') return value === rule.value;
                if (rule.operator === 'array-contains') return Array.isArray(value) && value.includes(rule.value);
                throw new Error('지원되지 않는 검색 조건입니다.');
            });
            if (rule.kind === 'order') docs.sort((a, b) => {
                const left = field(a.data(), rule.field), right = field(b.data(), rule.field);
                return (left < right ? -1 : left > right ? 1 : 0) * (rule.direction === 'desc' ? -1 : 1);
            });
            if (rule.kind === 'limit') docs = docs.slice(0, rule.count);
        }
        return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback) };
    }
    function publish() {
        for (const listener of listeners) queueMicrotask(() => {
            if (!active() || !listeners.has(listener)) return;
            try { listener.callback(snapshot(listener.reference, read())); }
            catch (error) { if (listener.error) listener.error(error); }
        });
    }
    function commit(records) {
        try { root.localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); }
        catch (error) { throw new Error('기록을 저장하지 못했어요. 다시 시도해 주세요.'); }
        publish();
    }
    function enqueue(callback) {
        const job = transactionChain.catch(() => {}).then(callback);
        transactionChain = job;
        return job;
    }
    const local = {
        doc: (...parts) => ref(parts.length === 1 && parts[0] && parts[0].kind === 'collection' ? [parts[0], newId()] : parts, 'doc'),
        collection: (...parts) => ref(parts, 'collection'),
        getDoc: reference => Promise.resolve(documentSnapshot(reference, read())),
        getDocs: reference => Promise.resolve(snapshot(reference, read())),
        setDoc: (reference, data, options) => enqueue(() => { const records = read(); update(records, reference, data, options); commit(records); }),
        updateDoc: (reference, data) => enqueue(() => { const records = read(); update(records, reference, data, null, true); commit(records); }),
        deleteDoc: reference => enqueue(() => { const records = read(); delete records[reference.path]; commit(records); }),
        addDoc: (reference, data) => enqueue(() => {
            const id = newId();
            const document = ref([reference.path, id], 'doc'), records = read();
            update(records, document, data); commit(records); return document;
        }),
        query: (reference, ...rules) => ({ ...reference, rules }),
        orderBy: (name, direction) => ({ kind: 'order', field: name, direction }),
        limit: count => ({ kind: 'limit', count }),
        where: (name, operator, value) => ({ kind: 'where', field: name, operator, value }),
        arrayUnion: (...values) => ({ __enjoyLocalOperation: 'union', values }),
        arrayRemove: (...values) => ({ __enjoyLocalOperation: 'remove', values }),
        increment: value => ({ __enjoyLocalOperation: 'increment', value }),
        serverTimestamp: () => Date.now(),
        timestampFromMillis: ms => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1000000 }),
        onSnapshot: (reference, callback, error) => {
            const listener = { reference, callback, error }; listeners.add(listener);
            queueMicrotask(() => {
                if (!active() || !listeners.has(listener)) return;
                try { callback(snapshot(reference, read())); } catch (failure) { if (error) error(failure); }
            });
            return () => listeners.delete(listener);
        },
        runTransaction: (database, callback) => enqueue(async () => {
            const records = read();
            const transaction = {
                get: reference => Promise.resolve(documentSnapshot(reference, records)),
                set: (reference, data, options) => { update(records, reference, data, options); return transaction; },
                update: (reference, data) => { update(records, reference, data, null, true); return transaction; },
                delete: reference => { delete records[reference.path]; return transaction; }
            };
            const result = await callback(transaction);
            if (!active()) throw new Error('접속 상태가 변경되어 저장을 취소했어요.');
            commit(records); return result;
        })
    };
    const aliases = {
        doc: 'doc', fsDoc: 'doc', collection: 'collection', fsCol: 'collection', getDoc: 'getDoc',
        getDocs: 'getDocs', fsGetDocs: 'getDocs', setDoc: 'setDoc', fsSetDoc: 'setDoc',
        fsUpdateDoc: 'updateDoc', fsDeleteDoc: 'deleteDoc', addDoc: 'addDoc', fsAddDoc: 'addDoc',
        query: 'query', fsQuery: 'query', orderBy: 'orderBy', fsOrderBy: 'orderBy', limit: 'limit', fsLimit: 'limit',
        fsWhere: 'where', arrayUnion: 'arrayUnion', fsArrayUnion: 'arrayUnion', fsArrayRemove: 'arrayRemove',
        fsIncrement: 'increment', fsServerTimestamp: 'serverTimestamp', fsTimestampFromMillis: 'timestampFromMillis',
        fsOnSnapshot: 'onSnapshot', runTransaction: 'runTransaction'
    };
    root.enjoyInstallLocalData = function () {
        for (const [name, operation] of Object.entries(aliases)) {
            if (root[name] && root[name] !== wrappers[name]) remote[name] = root[name];
            wrappers[name] = wrappers[name] || function (...args) {
                if (active()) return local[operation](...args);
                if (!remote[name]) throw new Error('연결을 확인하고 있어요.');
                return remote[name](...args);
            };
            root[name] = wrappers[name];
        }
    };
    root.enjoyIsLocalGuest = active;
    root.enjoyDataUser = () => root.enjoyUser || (active() ? identity : null);
    root.enjoyLocalMember = () => active() && identity ? { uid: identity.uid, ...clone(read()['members/' + identity.uid] || {}) } : null;
    root.enjoyRefreshGuestNavigation = function () {
        const guest = !root.enjoyUser;
        if (!root.document) return;
        root.document.documentElement.classList.toggle('enjoy-guest', guest);
        const home = root.document.getElementById('nav-home');
        if (home && guest) home.setAttribute('aria-label', '홈');
        if (guest && ['shorts', 'attendance'].includes(root.homeActiveTab) && root.switchHomeTab) root.switchHomeTab('home');
        if (guest && (root.activeTabIndex === 1 || root.activeTabIndex === 4) && root.goHome) root.goHome();
        if (root.updateNavIndicator) root.requestAnimationFrame(root.updateNavIndicator);
    };
    root.enjoyNormalizeProfileName = name => String(name || '').replace(/\s*\(스페셜\)\s*$/, ' (엔조이)');
    root.enjoyGuestProfileName = () => root.enjoyNormalizeProfileName(root.localStorage.getItem(PROFILE_KEY));
    root.enjoyStartLocalGuest = function (profileName) {
        if (root.enjoyUser) return;
        const name = root.enjoyNormalizeProfileName(profileName === undefined ? root.enjoyGuestProfileName() : profileName).trim();
        if (!name) return false;
        if (name.length > 30 || /[\u0000-\u001f\u007f<>&"'\\`]/.test(name)) throw new Error('이름은 30자 이내로 입력하고 따옴표와 특수 기호는 제외해주세요.');
        let uid = root.localStorage.getItem(ID_KEY);
        if (!uid) {
            uid = 'device-' + (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
            root.localStorage.setItem(ID_KEY, uid);
        }
        identity = { uid, displayName: name, email: '', photoURL: '', localOnly: true };
        root.enjoyLocalMode = true;
        root.isGuest = true;
        root.enjoySync = false;
        root.enjoyProfileName = identity.displayName;
        root._availMine = null;
        if (!root.meetingDb) root.meetingDb = { localOnly: true };
        const records = read(), key = 'members/' + uid;
        if (!records[key]) records[key] = { name: identity.displayName, photoURL: '', points: 0, avail: {} };
        records[key].name = name;
        for (const value of Object.values(records)) {
            if (value.authorUid === uid) value.authorName = name;
            for (const comment of value.commentPreview || []) if (comment.authorUid === uid) comment.authorName = name;
            if (value.likedByProfiles && value.likedByProfiles[uid]) value.likedByProfiles[uid].name = name;
        }
        if (!records[key].timetable) records[key].timetable = { classes: [] };
        commit(records);
        root.localStorage.setItem(PROFILE_KEY, name);
        root.enjoyInstallLocalData();
        root.enjoyRefreshGuestNavigation();
        root.enjoyEnterLocalMode && root.enjoyEnterLocalMode();
        root.enjoyLocalMembersStart && root.enjoyLocalMembersStart();
        root.enjoyCommunityOnAuth && root.enjoyCommunityOnAuth(identity);
        root.enjoyDropOnAuth && root.enjoyDropOnAuth(identity);
        root.enjoyEchoOnAuth && root.enjoyEchoOnAuth(identity);
        root.prepareEnjoyAttendance && root.prepareEnjoyAttendance();
        root.dispatchEvent && root.dispatchEvent(new root.CustomEvent('enjoy-local-ready'));
        return true;
    };
    root.enjoyLeaveLocalGuest = function () {
        if (root.enjoyGuestProfilePending && root.enjoyCancelGuestProfile) root.enjoyCancelGuestProfile();
        if (active() && root.enjoyLocalMembersStop) root.enjoyLocalMembersStop();
        root.enjoyLocalMode = false; listeners.clear(); identity = null;
    };
    function finishEntry() {
        root.enjoyGuestProfilePending = false;
        const screen = root.document && root.document.getElementById('login-screen');
        if (screen) screen.style.display = 'none';
        try {
            root.localStorage.setItem('enjoy_chat_account_v1', 'guest');
            root.localStorage.setItem('enjoy_chat_account_label_v1', root.enjoyProfileName || '게스트');
        } catch (error) {}
        root.dispatchEvent && root.dispatchEvent(new root.CustomEvent('enjoy-guest-entered'));
    }
    root.enjoyCompleteGuestEntry = function (name) {
        if (root.enjoyUser) return;
        if (!root.enjoyStartLocalGuest(name)) throw new Error('이름을 입력해주세요.');
        finishEntry();
    };
    root.enjoyRequestGuestEntry = function (resume) {
        if (root.enjoyUser) return;
        if (resume !== true || !active()) {
            if (root.enjoyOpenGuestProfile) root.enjoyOpenGuestProfile();
            return;
        }
        try { if (!root.enjoyStartLocalGuest()) return; }
        catch (error) { if (root.enjoyAlert) root.enjoyAlert(error.message); return; }
        finishEntry();
    };
    root.enjoyGuest = root.enjoyRequestGuestEntry;
    root.enjoyLocalPhotoUrl = blob => new Promise((resolve, reject) => {
        const reader = new root.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
        reader.readAsDataURL(blob);
    });
    root.addEventListener && root.addEventListener('storage', event => { if (active() && event.key === RECORDS_KEY) publish(); });
    root.enjoyInstallLocalData();
})(typeof window !== 'undefined' ? window : globalThis);
