const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const benefits = require('../meeting-benefits.js');
const { createService, COLLECTION, approverFor } = require('../meeting-exemptions.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const start = html.indexOf('window.calculateMemberHistory = function(');
const code = html.slice(start, html.indexOf('window.renderMeetingStatus =', start));
const window = {};
vm.runInNewContext(code, { window, Date, Math });
const calculate = window.calculateMemberHistory;
const date = new Date('2026-10-29T12:00:00+09:00');
function setup(name = '성원제') {
    const meeting = { records: {}, exemptions: { [name]: 2, '류짱': 1 } };
    for (let year = 2025; year <= 2026; year++) for (let month = year === 2025 ? 10 : 1; month <= (year === 2026 ? 10 : 12); month++)
        meeting.records[`${year}-${month}`] = [{ name, status: 'paid', amount: year === 2025 ? 15000 : 20000, isLeader: false }];
    meeting.records['2026-9'][0] = { name, status: 'unpaid', amount: 0, isLeader: false };
    const db = new Map([['members/a', { name }], ['members/chair', { name: '전시기' }], ['members/alternate', { name: '성원제' }], ['members/other', { name: '류짱' }], ['meeting_account/dues_status', meeting]]);
    let sequence = Promise.resolve(), failNext = false, account = null;
    const tx = fn => {
        const result = sequence.then(async () => {
            const copy = structuredClone(db), writes = [];
            const transaction = { get: async key => ({ exists: () => copy.has(key), data: () => structuredClone(copy.get(key)) }),
                set: (key, value) => writes.push([key, structuredClone(value)]),
                update: (key, value) => writes.push([key, { ...copy.get(key), ...structuredClone(value) }]) };
            const value = await fn(transaction);
            if (failNext) { failNext = false; throw Error('offline'); }
            writes.forEach(([key, data]) => db.set(key, data));
            return value;
        });
        sequence = result.catch(() => {}); return result;
    };
    const service = createService({ transaction: tx, doc: (...parts) => parts.join('/'), stamp: () => 100,
        prepare: benefits.prepareRedemption, calculate, now: () => date, guard: uid => { if (account && uid !== account) throw Error('account changed'); } });
    return { db, service, request: () => db.get(`${COLLECTION}/a`), meeting: () => db.get('meeting_account/dues_status'),
        fail: () => { failNext = true; }, account: uid => { account = uid; } };
}
test('use is enabled now and creates a pending request without spending a ticket or changing dues', async () => {
    assert.equal(benefits.canUseExemption(date), true);
    const h = setup(), before = structuredClone(h.meeting());
    const request = await h.service.request('a', '성원제', 'attempt-1');
    assert.equal(request.status, 'pending'); assert.equal(request.monthKey, '2026-10');
    assert.deepEqual(h.meeting(), before);
    assert.equal(h.request().name, '성원제');
});
test('concurrent repeat requests retain one pending attempt', async () => {
    const h = setup();
    await Promise.all([h.service.request('a', '성원제', 'one'), h.service.request('a', '성원제', 'two')]);
    assert.equal(h.request().attemptId, 'one'); assert.equal(h.meeting().exemptions['성원제'], 2);
});
test('only the designated reviewer can approve or reject; spoofed requester names are refused', async () => {
    const h = setup();
    await assert.rejects(h.service.request('a', '류짱', 'fake'), /멤버/);
    await h.service.request('a', '성원제', 'one');
    for (const approve of [true, false]) await assert.rejects(h.service.decide('other', 'a', 'one', approve), /멤버/);
    assert.equal(h.request().status, 'pending');
});
test('approval atomically exempts the requested charge and consumes exactly one ticket even if clicked in two sessions', async () => {
    const h = setup(); await h.service.request('a', '성원제', 'one');
    const before = benefits.stateFor(h.meeting(), '성원제', calculate, date).remaining;
    const results = await Promise.all([h.service.decide('chair', 'a', 'one', true), h.service.decide('chair', 'a', 'one', true)]);
    assert.equal(results.filter(r => r.alreadyResolved).length, 1);
    assert.equal(h.meeting().exemptions['성원제'], 1);
    assert.equal(before - benefits.stateFor(h.meeting(), '성원제', calculate, date).remaining, 10000);
    assert.equal(h.meeting().records['2026-10'][0].ticketRequestId, 'one');
    assert.equal(h.request().resolvedBy, 'chair'); assert.equal(h.request().resultSeenAt, null);
});
test('rejection preserves balances and unread result until requester acknowledges, then allows another attempt', async () => {
    const h = setup(), before = structuredClone(h.meeting());
    await h.service.request('a', '성원제', 'one'); await h.service.decide('chair', 'a', 'one', false);
    assert.deepEqual(h.meeting(), before); assert.equal(h.request().status, 'rejected');
    await assert.rejects(h.service.request('a', '성원제', 'two'), /결과/);
    await h.service.acknowledge('a', 'one'); assert.equal(h.request().resultSeenAt, 100);
    await h.service.request('a', '성원제', 'two'); assert.equal(h.request().attemptId, 'two');
    await h.service.acknowledge('a', 'one'); assert.equal(h.request().resultSeenAt, null);
    await assert.rejects(h.service.decide('chair', 'a', 'one', true), /변경/);
});
test('failed commits leave both the request and voucher unchanged', async () => {
    const h = setup(); await h.service.request('a', '성원제', 'one');
    h.fail(); await assert.rejects(h.service.decide('chair', 'a', 'one', true), /offline/);
    assert.equal(h.request().status, 'pending'); assert.equal(h.meeting().exemptions['성원제'], 2);
    await h.service.decide('chair', 'a', 'one', true); assert.equal(h.meeting().exemptions['성원제'], 1);
});
test('fresh balance and exact requested month are rechecked at approval; paid charges never consume tickets', async () => {
    const h = setup(); await h.service.request('a', '성원제', 'one');
    h.meeting().records['2026-10'][0].amount = 50000;
    await assert.rejects(h.service.decide('chair', 'a', 'one', true), /미납 부과금/);
    assert.equal(h.request().status, 'pending'); assert.equal(h.meeting().exemptions['성원제'], 2);
    await h.service.decide('chair', 'a', 'one', false); assert.equal(h.request().status, 'rejected');
});
test('zero vouchers, guests, and changed accounts cannot submit or decide', async () => {
    const h = setup(); h.meeting().exemptions['성원제'] = 0;
    await assert.rejects(h.service.request('a', '성원제', 'one'), /면제권/);
    await assert.rejects(h.service.request('guest', '성원제', 'one'), /멤버/);
    h.meeting().exemptions['성원제'] = 2; await h.service.request('a', '성원제', 'one');
    h.account('other'); await assert.rejects(h.service.decide('chair', 'a', 'one', true), /account/);
    assert.equal(h.request().status, 'pending');
});
test('legacy alias voucher balances merge once on approval and unrelated members remain intact', async () => {
    const h = setup('이진누'); h.meeting().exemptions = { '이진누': 1, '지노': 1, '류짱': 3 };
    await h.service.request('a', '이진누', 'one'); await h.service.decide('chair', 'a', 'one', true);
    assert.deepEqual(h.meeting().exemptions, { '이진누': 1, '류짱': 3 });
});
test('전시기 requests are approved by 성원제 and cannot be self-approved or self-rejected', async () => {
    assert.equal(approverFor('전시기'), '성원제'); assert.equal(approverFor('류짱'), '전시기');
    const h = setup('전시기'); await h.service.request('a', '전시기', 'reverse');
    for (const uid of ['a', 'chair', 'other']) for (const approve of [true, false])
        await assert.rejects(h.service.decide(uid, 'a', 'reverse', approve), /멤버/);
    await h.service.decide('alternate', 'a', 'reverse', true);
    assert.equal(h.request().status, 'approved'); assert.equal(h.request().resolvedBy, 'alternate');
    assert.equal(h.meeting().exemptions['전시기'], 1);
});
test('성원제 may reject 전시기 without deducting a ticket, but may not decide other members requests', async () => {
    const h = setup('전시기'); await h.service.request('a', '전시기', 'reverse');
    const before = structuredClone(h.meeting()); await h.service.decide('alternate', 'a', 'reverse', false);
    assert.equal(h.request().status, 'rejected'); assert.deepEqual(h.meeting(), before);
    for (const name of ['성원제', '류짱']) {
        const other = setup(name); await other.service.request('a', name, 'normal');
        await assert.rejects(other.service.decide('alternate', 'a', 'normal', true), /멤버/);
        await other.service.decide('chair', 'a', 'normal', true); assert.equal(other.request().status, 'approved');
    }
});

// Exercise the actual realtime client with controllable Firestore snapshots.
// Nothing here writes to Firebase or contacts a real member.
function client(name = '성원제', uid = 'a') {
    const timers = new Map(), streams = [], events = {}, dialogs = [];
    let next = 0, blocked = false;
    const makeElement = () => {
        const children = new Map(), handlers = {};
        return { textContent: '', hidden: false, open: false, handlers, children,
            setAttribute() {}, focus() {}, remove() { this.removed = true; }, close() { this.open = false; }, showModal() { this.open = true; },
            querySelector(key) { if (!children.has(key)) children.set(key, makeElement()); return children.get(key); },
            querySelectorAll() { return []; }, addEventListener(key, fn) { handlers[key] = fn; } };
    };
    const document = { hidden: false, getElementById: () => null,
        querySelector: () => blocked ? {} : null, createElement: makeElement,
        body: { appendChild(element) { dialogs.push(element); } }, addEventListener(key, fn) { events[key] = fn; } };
    const root = { document, enjoyUser: { uid }, enjoyProfileName: name, enjoySync: true, isGuest: false,
        fsDoc: (...p) => p.join('/'), fsCol: p => p, fsWhere: (...p) => p, fsQuery: (...p) => p,
        fsServerTimestamp: () => 1, runTransaction: () => {}, enjoyMeetingBenefits: benefits, calculateMemberHistory: calculate,
        setTimeout(fn) { const id = ++next; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(key, fn) { events[key] = fn; }, fsOnSnapshot(ref, options, receive, fail) {
            const stream = { ref, options, receive, fail, stopped: false }; streams.push(stream); return () => { stream.stopped = true; };
        }, renderMeetingBenefits() {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../meeting-exemptions.js'), 'utf8'), { window: root });
    const snapshot = (data, fromCache = false) => ({ exists: () => !!data, data: () => data, metadata: { fromCache, hasPendingWrites: false } });
    return { root, streams, events, dialogs,
        send(data, cache = false) { streams.filter(s => typeof s.ref === 'string').at(-1).receive(snapshot(data, cache)); },
        own(data, cache = false) { streams[0].receive(snapshot(data, cache)); },
        inbox(requests) { streams[1].receive({ docs: requests.map(r => ({ id: r.uid, data: () => r })), metadata: {} }); },
        pump() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
        block(value) { blocked = value; } };
}
const example = { uid: 'a', name: '성원제', attemptId: 'attempt-one', monthKey: '2026-10', status: 'pending', resultSeenAt: null };
test('live rejection snapshot opens requester popup; cached results never surface as a new decision', () => {
    const h = client();
    h.own({ ...example, status: 'rejected' }, true); h.pump(); assert.equal(h.dialogs.length, 0);
    h.own(example); assert.equal(h.root.enjoyExemptions.state().pending, true);
    h.own({ ...example, status: 'rejected' }); h.pump();
    assert.equal(h.dialogs.length, 1);
    assert.match(h.dialogs[0].querySelector('h2').textContent, /거부/);
    assert.match(h.dialogs[0].querySelector('#exemption-popup-message').textContent, /차감되지/);
});
test('approver inbox queues behind an open dialog; Escape defers and never rejects a request', () => {
    const h = client('전시기', 'chair'); h.own(null); h.block(true); h.inbox([example]); h.pump();
    assert.equal(h.dialogs.length, 0); h.block(false); h.pump(); assert.equal(h.dialogs.length, 1);
    h.dialogs[0].handlers.cancel({ preventDefault() {} }); h.pump();
    assert.equal(h.dialogs[0].open, false); assert.equal(h.root.enjoyExemptions.state().inboxCount, 1);
    h.root.enjoyExemptions.review(); h.pump(); assert.equal(h.dialogs.length, 2);
});
test('auth reset unsubscribes, removes an old account popup, and discards delayed callbacks', () => {
    const h = client('전시기', 'chair'); h.own(null); h.inbox([example]); h.pump();
    const old = h.streams[1]; h.root.enjoyExemptions.stop();
    assert.equal(old.stopped, true); assert.equal(h.dialogs[0].open, false);
    h.root.enjoyUser = { uid: 'b' }; h.root.enjoyProfileName = '류짱'; h.events['enjoy-auth-ready']();
    old.receive({ docs: [{ id: 'a', data: () => example }], metadata: {} }); h.pump();
    assert.equal(h.root.enjoyExemptions.state().inboxCount, 0); assert.equal(h.dialogs.length, 1);
});
test('listener failure exposes retry and a new connection replaces the failed subscriptions', () => {
    const h = client(); h.streams[0].fail(); assert.equal(h.root.enjoyExemptions.state().error, true);
    h.root.enjoyExemptions.retry(); assert.equal(h.streams[0].stopped, true);
    h.send({ ...example, status: 'approved' }); h.pump(); assert.equal(h.root.enjoyExemptions.state().error, false);
    assert.match(h.dialogs[0].querySelector('h2').textContent, /승인/);
});
test('성원제 inbox receives 전시기 requests only; 전시기 inbox excludes its own requests and resolved items', () => {
    const reverse = { ...example, uid: 'chair', name: '전시기', attemptId: 'reverse' };
    const alternate = client('성원제', 'a'); alternate.own(null); alternate.inbox([example, reverse]); alternate.pump();
    assert.equal(alternate.root.enjoyExemptions.state().inboxCount, 1);
    assert.match(alternate.dialogs[0].querySelector('#exemption-popup-message').textContent, /전시기님이/);
    const chair = client('전시기', 'chair'); chair.own(null);
    chair.inbox([example, reverse, { ...example, uid: 'resolved', status: 'rejected' }]); chair.pump();
    assert.equal(chair.root.enjoyExemptions.state().inboxCount, 1);
    assert.match(chair.dialogs[0].querySelector('#exemption-popup-message').textContent, /성원제님이/);
});
test('전시기 result popup and waiting state identify 성원제 as the reviewer', () => {
    const h = client('전시기', 'chair'); h.own({ ...example, uid: 'chair', name: '전시기' });
    assert.equal(h.root.enjoyExemptions.state().approverName, '성원제');
    h.own({ ...example, uid: 'chair', name: '전시기', status: 'rejected' }); h.pump();
    assert.match(h.dialogs[0].querySelector('#exemption-popup-message').textContent, /성원제님이 사용 요청을 거부/);
});
