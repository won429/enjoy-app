const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../guest-local.js'), 'utf8');
const attendance = require('../attendance.js');
const plain = value => JSON.parse(JSON.stringify(value));

function runtime(storage = new Map(), cloud = {}) {
    const window = {
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        crypto: { randomUUID: () => 'test-device' }, ...cloud
    };
    vm.runInNewContext(source, { window, queueMicrotask });
    window.enjoyStartLocalGuest(window.enjoyGuestProfileName() || '테스트');
    return { window, storage };
}

test('entry prompts for a profile, preserves its identity and existing records, and preloads the saved name', async () => {
    const { window: app, storage } = runtime();
    const uid = app.enjoyDataUser().uid;
    await app.fsAddDoc(app.fsCol('community_posts'), { authorUid: uid, authorName: '테스트', title: '기존 이야기' });
    app.enjoyLeaveLocalGuest();
    let prompts = 0;
    app.enjoyOpenGuestProfile = () => { prompts++; app.enjoyGuestProfilePending = true; };
    app.enjoyGuest();
    assert.equal(prompts, 1);
    assert.equal(app.enjoyIsLocalGuest(), false);
    app.enjoyCompleteGuestEntry('새 이름');
    assert.equal(app.enjoyDataUser().uid, uid);
    assert.equal(app.enjoyDataUser().displayName, '새 이름');
    assert.equal(app.enjoyGuestProfileName(), '새 이름');
    assert.equal(app.enjoyGuestProfilePending, false);
    const restored = runtime(storage).window;
    assert.equal(restored.enjoyGuestProfileName(), '새 이름');
    const posts = await restored.fsGetDocs(restored.fsCol('community_posts'));
    assert.equal(posts.docs[0].data().title, '기존 이야기');
    assert.equal(posts.docs[0].data().authorName, '새 이름');
    assert.throws(() => restored.enjoyCompleteGuestEntry("a' onclick=alert(1)"), /이름은/);
    assert.throws(() => restored.enjoyCompleteGuestEntry('   '), /이름을 입력/);
});

test('a restored Google session cancels a pending guest profile and retains the signed-in identity', () => {
    const app = runtime().window;
    app.enjoyGuestProfilePending = true;
    let cancelled = false;
    app.enjoyCancelGuestProfile = () => { cancelled = true; app.enjoyGuestProfilePending = false; };
    app.enjoyLeaveLocalGuest();
    app.enjoyUser = { uid: 'signed-in' };
    assert.equal(cancelled, true);
    app.enjoyCompleteGuestEntry('다른 이름');
    assert.equal(app.enjoyDataUser().uid, 'signed-in');
});

test('legacy profile labels become Enjoy without changing records or another author', async () => {
    const { window: app, storage } = runtime();
    const uid = app.enjoyDataUser().uid;
    const post = app.fsDoc('community_posts', 'legacy');
    await app.fsSetDoc(post, {
        authorUid: uid, authorName: '야호 (스페셜)', body: '본문 (스페셜)',
        commentPreview: [{ authorUid: uid, authorName: '야호 (스페셜)' }, { authorUid: 'other', authorName: '다른 사람' }],
        likedByProfiles: { [uid]: { name: '야호 (스페셜)' }, other: { name: '다른 사람' } }
    });
    storage.set('enjoy_guest_profile_v1', '야호 (스페셜)');
    const restored = runtime(storage).window;
    assert.equal(restored.enjoyDataUser().uid, uid);
    assert.equal(restored.enjoyDataUser().displayName, '야호 (엔조이)');
    assert.equal(restored.enjoyGuestProfileName(), '야호 (엔조이)');
    const saved = (await restored.getDoc(post)).data();
    assert.equal(saved.authorName, '야호 (엔조이)');
    assert.equal(saved.body, '본문 (스페셜)');
    assert.equal(saved.commentPreview[0].authorName, '야호 (엔조이)');
    assert.equal(saved.commentPreview[1].authorName, '다른 사람');
    assert.equal(saved.likedByProfiles[uid].name, '야호 (엔조이)');
    assert.equal(saved.likedByProfiles.other.name, '다른 사람');
});

test('guest feed, comments, availability and timetable survive reload without using cloud functions', async () => {
    const forbidden = () => { throw new Error('guest must not touch cloud'); };
    const { window: app, storage } = runtime(new Map(), { fsSetDoc: forbidden, fsOnSnapshot: forbidden, runTransaction: forbidden });
    const uid = app.enjoyDataUser().uid;
    const post = await app.fsAddDoc(app.fsCol('community_posts'), { authorUid: uid, title: '내 여행', createdAt: 1, likedBy: [], commentCount: 0 });
    await app.runTransaction(app.meetingDb, async transaction => {
        const current = await transaction.get(post);
        assert.equal(current.data().title, '내 여행');
        transaction.update(post, { likedBy: app.fsArrayUnion(uid), commentCount: app.fsIncrement(1) });
        const commentRef = app.doc(app.fsCol('community_posts', post.id, 'comments'));
        assert.match(commentRef.path, new RegExp('^community_posts/' + post.id + '/comments/'));
        transaction.set(commentRef, { authorUid: uid, text: '기록' });
        transaction.set(app.fsDoc('members', uid), { avail: { '2026-10-13': 'yes' }, timetable: { classes: [{ name: '수학' }] } }, { merge: true });
    });
    const restored = runtime(storage).window;
    assert.equal(restored.enjoyDataUser().uid, uid);
    const member = restored.enjoyLocalMember();
    assert.equal(member.avail['2026-10-13'], 'yes');
    assert.equal(member.timetable.classes[0].name, '수학');
    assert.deepEqual(plain((await restored.getDoc(restored.fsDoc('community_posts', post.id))).data().likedBy), [uid]);
    const feed = await restored.fsGetDocs(restored.fsQuery(restored.fsCol('community_posts'), restored.fsOrderBy('createdAt', 'desc')));
    assert.equal(feed.size, 1, 'nested comments must not be returned as feed entries');
    const comments = await restored.fsGetDocs(restored.fsCol('community_posts', post.id, 'comments'));
    assert.equal(comments.size, 1);
    await restored.fsDeleteDoc(restored.fsDoc('community_posts', post.id));
    assert.equal((await restored.getDoc(restored.fsDoc('community_posts', post.id))).exists(), false);
});

test('transactions serialize concurrent edits and roll back all writes when an operation fails', async () => {
    const app = runtime().window;
    const document = app.fsDoc('community_posts', 'counter');
    await app.fsSetDoc(document, { count: 0 });
    await Promise.all(Array.from({ length: 8 }, () => app.runTransaction(app.meetingDb, async transaction => {
        const current = await transaction.get(document);
        await Promise.resolve();
        transaction.update(document, { count: current.data().count + 1 });
    })));
    assert.equal((await app.getDoc(document)).data().count, 8);
    await assert.rejects(app.runTransaction(app.meetingDb, async transaction => {
        transaction.update(document, { count: 100 });
        throw new Error('cancel');
    }), /cancel/);
    assert.equal((await app.getDoc(document)).data().count, 8);
});

test('logged-in operations retain the real Firebase route and never read guest records', async () => {
    const calls = [];
    const app = runtime(new Map(), {
        fsDoc: (...parts) => ({ cloud: true, path: parts.join('/') }),
        fsSetDoc: async (...args) => calls.push(args)
    }).window;
    const guestId = app.enjoyDataUser().uid;
    await app.fsSetDoc(app.fsDoc('members', guestId), { privateNote: 'guest only' }, { merge: true });
    assert.equal(calls.length, 0);
    app.enjoyLeaveLocalGuest();
    app.enjoyUser = { uid: 'real-member' };
    app.isGuest = false;
    const reference = app.fsDoc('members', 'real-member');
    await app.fsSetDoc(reference, { avail: { '2026-10-13': 'no' } }, { merge: true });
    assert.equal(reference.cloud, true);
    assert.equal(calls.length, 1);
    assert.equal(app.enjoyDataUser().uid, 'real-member');
    assert.equal(app.enjoyLocalMember(), null);
});

test('guest attendance is deduplicated across reloads and remains in the guest member record', async () => {
    const { window: app, storage } = runtime();
    const uid = app.enjoyDataUser().uid;
    const today = attendance.dateParts(Date.parse('2026-10-13T12:00:00+09:00'));
    async function record(target) {
        const reference = target.fsDoc('members', uid);
        return target.runTransaction(target.meetingDb, async transaction => {
            const snapshot = await transaction.get(reference);
            const result = attendance.applyVisits(snapshot.data().attendance, [today.dateKey], today, target.fsServerTimestamp());
            if (result.changed) transaction.set(reference, { attendance: result.state }, { merge: true });
            return result;
        });
    }
    assert.equal((await record(app)).changed, true);
    const restored = runtime(storage).window;
    assert.equal((await record(restored)).changed, false);
    assert.deepEqual(plain(restored.enjoyLocalMember().attendance.months['2026-10'].days), ['2026-10-13']);
});

test('storage failures report failure and do not publish unsaved data', async () => {
    const app = runtime().window;
    const reference = app.fsDoc('community_posts', 'saved');
    await app.fsSetDoc(reference, { title: 'before' });
    app.localStorage.setItem = () => { throw new Error('quota'); };
    await assert.rejects(app.fsUpdateDoc(reference, { title: 'after' }), /저장하지 못했어요/);
    assert.equal((await app.getDoc(reference)).data().title, 'before');
});

test('reinstalling the gateway after Firebase loads preserves remote helpers and guest isolation', async () => {
    const app = runtime().window;
    let cloudWrites = 0;
    app.fsSetDoc = () => { cloudWrites++; };
    app.fsDoc = (...parts) => ({ real: true, path: parts.join('/') });
    app.enjoyInstallLocalData();
    await app.fsSetDoc(app.fsDoc('community_posts', 'local'), { title: 'device' });
    assert.equal(cloudWrites, 0);
    app.enjoyLeaveLocalGuest();
    app.enjoyUser = { uid: 'cloud-user' };
    await app.fsSetDoc(app.fsDoc('members', 'cloud-user'), { avail: {} });
    assert.equal(cloudWrites, 1);
});
