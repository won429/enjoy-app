(function (root) {
    'use strict';
    const COLLECTION = 'meeting_exemption_requests';
    const APPROVER = '전시기';
    const ALTERNATE = '성원제';
    const members = ['홍박사', '류짱', '오스틴', APPROVER, '이진누', '성원제'];
    const nameOf = value => value === '지노' ? '이진누' : String(value || '').trim();
    const approverFor = name => nameOf(name) === APPROVER ? ALTERNATE : APPROVER;
    const terminal = request => request && ['approved', 'rejected'].includes(request.status);
    const monthLabel = key => { const [y, m] = String(key).split('-'); return `${y}년 ${m}월`; };
    const failure = message => { throw new Error(message); };

    // Every decision reads fresh documents in the same transaction as the balance
    // change. A retried/competing approval cannot redeem the same request twice.
    function createService({ transaction, doc, stamp, prepare, calculate, now = () => new Date(), guard = () => {} }) {
        const meetingRef = () => doc('meeting_account', 'dues_status');
        const requestRef = uid => doc(COLLECTION, uid);
        const memberRef = uid => doc('members', uid);
        function identity(snapshot, expectedName) {
            const name = snapshot.exists() && nameOf(snapshot.data().name);
            if (!members.includes(name) || (expectedName && name !== expectedName)) failure('로그인한 멤버 정보를 다시 확인해 주세요.');
            return name;
        }
        return {
            request(uid, expectedName, attemptId) {
                return transaction(async tx => {
                    const member = await tx.get(memberRef(uid));
                    const meeting = await tx.get(meetingRef());
                    const previous = await tx.get(requestRef(uid));
                    guard(uid);
                    const name = identity(member, expectedName);
                    if (previous.exists()) {
                        const old = previous.data();
                        if (old.status === 'pending') return { ...old, duplicate: true };
                        if (terminal(old) && !old.resultSeenAt) failure('이전 승인 결과를 먼저 확인해 주세요.');
                    }
                    if (!meeting.exists()) failure('모임통장 내역을 불러올 수 없습니다.');
                    const plan = prepare(meeting.data(), name, uid, calculate, now());
                    const request = { uid, name, attemptId, status: 'pending', monthKey: plan.monthKey,
                        requestedAt: stamp(), resolvedAt: null, resolvedBy: null, resultSeenAt: null, recordIndex: null };
                    tx.set(requestRef(uid), request);
                    return request;
                });
            },
            decide(actorUid, requesterUid, attemptId, approve) {
                return transaction(async tx => {
                    const actor = await tx.get(memberRef(actorUid));
                    const saved = await tx.get(requestRef(requesterUid));
                    const meeting = await tx.get(meetingRef());
                    const requester = await tx.get(memberRef(requesterUid));
                    guard(actorUid);
                    if (!saved.exists() || saved.data().attemptId !== attemptId) failure('요청 내역이 변경됐어요. 다시 확인해 주세요.');
                    const request = saved.data();
                    identity(actor, approverFor(request.name));
                    if (request.status !== 'pending') return { alreadyResolved: true, status: request.status };
                    let plan = null;
                    if (approve) {
                        identity(requester, request.name);
                        if (!meeting.exists()) failure('모임통장 내역을 불러올 수 없습니다.');
                        plan = prepare(meeting.data(), request.name, requesterUid, calculate, now(), request.monthKey);
                        plan.data.records[plan.monthKey][plan.rowIndex].ticketRequestId = attemptId;
                        tx.update(meetingRef(), { records: plan.data.records, exemptions: plan.data.exemptions });
                    }
                    const result = { status: approve ? 'approved' : 'rejected', resolvedAt: stamp(), resolvedBy: actorUid,
                        recordIndex: plan ? plan.rowIndex : null };
                    tx.update(requestRef(requesterUid), result);
                    return { ...request, ...result };
                });
            },
            acknowledge(uid, attemptId) {
                return transaction(async tx => {
                    const saved = await tx.get(requestRef(uid));
                    guard(uid);
                    if (!saved.exists()) return;
                    const request = saved.data();
                    if (request.uid === uid && request.attemptId === attemptId && terminal(request) && !request.resultSeenAt)
                        tx.update(requestRef(uid), { resultSeenAt: stamp() });
                });
            }
        };
    }
    if (typeof module === 'object' && module.exports) module.exports = { createService, COLLECTION, APPROVER, approverFor };
    if (!root || !root.document) return;
    const document = root.document;
    let context = '', epoch = 0, unsubs = [], own = null, inbox = [], loaded = false, error = false;
    let busy = false, submitting = false, popup = null, displayed = null, pumpTimer = null;
    const dismissed = new Set();
    const session = () => root.enjoyUser && !root.isGuest && root.enjoySync && members.includes(nameOf(root.enjoyProfileName))
        ? `${root.enjoyUser.uid}:${nameOf(root.enjoyProfileName)}` : '';
    const render = () => root.renderMeetingBenefits?.();
    function service() {
        const expected = context;
        return createService({ transaction: callback => root.runTransaction(root.meetingDb, callback), doc: root.fsDoc,
            stamp: root.fsServerTimestamp, prepare: root.enjoyMeetingBenefits.prepareRedemption,
            calculate: root.calculateMemberHistory,
            guard: uid => { if (expected !== context || session() !== expected || root.enjoyUser?.uid !== uid) failure('로그인 계정이 변경됐어요. 다시 시도해 주세요.'); }
        });
    }
    function clearPopup() {
        if (popup) { popup.close(); popup.remove(); }
        popup = displayed = null;
    }
    function stop() {
        epoch++;
        unsubs.forEach(unsubscribe => unsubscribe()); unsubs = [];
        root.clearTimeout(pumpTimer); pumpTimer = null;
        context = ''; own = null; inbox = []; loaded = error = busy = submitting = false;
        dismissed.clear(); clearPopup();
        render();
    }
    function schedule() {
        root.clearTimeout(pumpTimer);
        pumpTimer = root.setTimeout(pump, 250);
    }
    function unreadResult() { return terminal(own) && !own.resultSeenAt; }
    function popupKey(request, result) { return `${result ? 'result' : 'review'}:${request.uid}:${request.attemptId}`; }
    function pump() {
        pumpTimer = null;
        if (!context || session() !== context || document.hidden || submitting) return;
        if (displayed) {
            const valid = displayed.result ? unreadResult() && own.attemptId === displayed.request.attemptId :
                inbox.some(item => item.uid === displayed.request.uid && item.attemptId === displayed.request.attemptId);
            if (!valid && !busy) clearPopup();
        }
        if (popup) return;
        const result = unreadResult() && !dismissed.has(popupKey(own, true));
        const request = result ? own : inbox.find(item => !dismissed.has(popupKey(item, false)));
        if (!request) return;
        const loader = document.getElementById('app-loader');
        if ((loader && root.getComputedStyle(loader).display !== 'none') ||
            document.querySelector('dialog[open], #enjoy-dialog:not(.hidden)')) {
            pumpTimer = root.setTimeout(pump, 1000); return;
        }
        openPopup(request, !!result);
    }
    function openPopup(request, result) {
        const expectedEpoch = epoch;
        popup = document.createElement('dialog');
        popup.className = 'meeting-exemption-popup';
        popup.setAttribute('aria-labelledby', 'exemption-popup-title');
        popup.setAttribute('aria-describedby', 'exemption-popup-message');
        const approved = request.status === 'approved';
        popup.innerHTML = `<form method="dialog"><span class="exemption-popup-icon" aria-hidden="true">${result ? approved ? '✓' : '!' : '✓'}</span>
            <h2 id="exemption-popup-title" tabindex="-1"></h2><p id="exemption-popup-message"></p>
            <div class="exemption-popup-summary"><span>적용 부과금</span><strong></strong></div>
            <p class="exemption-popup-note"></p><p class="exemption-popup-error" role="alert" hidden></p>
            <div class="exemption-popup-actions">${result ? '<button type="button" data-action="ack" class="primary">확인</button>' :
                '<button type="button" data-action="reject">거부</button><button type="button" data-action="approve" class="primary">승인</button>'}</div>
            <button type="button" data-action="later" class="exemption-popup-later">나중에 확인</button></form>`;
        popup.querySelector('h2').textContent = result ? approved ? '면제권 사용이 승인됐어요' : '면제권 사용이 거부됐어요' : '면제권 사용 승인 요청';
        popup.querySelector('.exemption-popup-summary strong').textContent = `${monthLabel(request.monthKey)} · 10,000원`;
        const approver = approverFor(request.name);
        popup.querySelector('#exemption-popup-message').textContent = result ? approved ?
            `${approver}님이 승인했어요. 면제권 1개를 사용해 부과금 10,000원을 면제했어요.` :
            `${approver}님이 사용 요청을 거부했어요. 면제권은 차감되지 않았어요.` : `${request.name}님이 면제권 1개 사용을 요청했어요.`;
        popup.querySelector('.exemption-popup-note').textContent = result ? approved ? '모임통장 내역에도 반영됐어요.' : '보유 면제권은 그대로이며, 다시 요청할 수 있어요.' :
            '승인하면 면제권 1개가 차감돼요. 거부하면 요청자에게 결과를 알려드려요.';
        displayed = { request, result };
        popup.addEventListener('cancel', event => { event.preventDefault(); if (!busy) defer(); });
        popup.addEventListener('click', event => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (!action || busy) return;
            if (action === 'later') defer();
            else void respond(action);
        });
        document.body.appendChild(popup); popup.showModal();
        popup.querySelector('h2').focus({ preventScroll: true });
        function defer() {
            dismissed.add(popupKey(request, result)); clearPopup(); schedule();
        }
        async function respond(action) {
            busy = true;
            const active = popup;
            active.querySelectorAll('button').forEach(button => button.disabled = true);
            const errorBox = active.querySelector('[role="alert"]'); errorBox.hidden = true;
            render();
            try {
                if (action === 'ack') await service().acknowledge(root.enjoyUser.uid, request.attemptId);
                else await service().decide(root.enjoyUser.uid, request.uid, request.attemptId, action === 'approve');
                if (expectedEpoch !== epoch) return;
                // Hide the same item until its committed snapshot arrives.
                dismissed.add(popupKey(request, result)); clearPopup();
            } catch (error) {
                if (expectedEpoch !== epoch) return;
                errorBox.textContent = readableError(error); errorBox.hidden = false;
                active.querySelectorAll('button').forEach(button => button.disabled = false);
            } finally {
                if (expectedEpoch === epoch) { busy = false; render(); schedule(); }
            }
        }
    }
    function readableError(error) {
        if (error.code === 'permission-denied') return '승인 요청 권한을 확인하지 못했어요. 잠시 후 다시 연결해 주세요.';
        if (/면제권|부과금|멤버 정보|모임통장|요청 내역|로그인 계정|승인 결과/.test(error.message || '')) return error.message;
        return '저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
    }
    function connect(force = false) {
        const next = session();
        if (!next) { if (context) stop(); return; }
        if (!force && context === next) { schedule(); return; }
        stop();
        if (!root.fsOnSnapshot || !root.fsServerTimestamp || !root.runTransaction) return;
        context = next;
        const currentEpoch = epoch, uid = root.enjoyUser.uid;
        const receive = fn => snapshot => {
            if (currentEpoch !== epoch || session() !== next || snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites) return;
            fn(snapshot); render(); schedule();
        };
        const failed = () => { if (currentEpoch === epoch) { error = true; render(); } };
        try {
            unsubs.push(root.fsOnSnapshot(root.fsDoc(COLLECTION, uid), { includeMetadataChanges: true }, receive(snapshot => {
                own = snapshot.exists() ? snapshot.data() : null; loaded = true;
            }), failed));
            const reviewer = nameOf(root.enjoyProfileName);
            if ([APPROVER, ALTERNATE].includes(reviewer)) {
                // One indexed name predicate also includes requests made before
                // reciprocal approval was introduced. Filter resolved items locally.
                unsubs.push(root.fsOnSnapshot(root.fsQuery(root.fsCol(COLLECTION), root.fsWhere('name', reviewer === APPROVER ? '!=' : '==', APPROVER)),
                    { includeMetadataChanges: true }, receive(snapshot => {
                        inbox = snapshot.docs.map(item => ({ ...item.data(), uid: item.id }))
                            .filter(item => item.status === 'pending' && approverFor(item.name) === reviewer && item.uid !== uid)
                            .sort((a, b) => (a.requestedAt?.toMillis?.() || 0) - (b.requestedAt?.toMillis?.() || 0));
                    }), failed));
            }
        } catch (_) { failed(); }
    }
    root.enjoyExemptions = {
        stop,
        state: () => ({ busy: submitting, pending: own?.status === 'pending', error, inboxCount: inbox.length,
            approverName: approverFor(own?.name || root.enjoyProfileName) }),
        retry: () => connect(true),
        review: () => { dismissed.clear(); schedule(); },
        async request() {
            if (submitting || busy) return;
            connect();
            if (!session()) return root.enjoyAlert('정식 멤버로 로그인한 후 사용할 수 있습니다.');
            if (!loaded || error) {
                if (error) connect(true);
                return root.enjoyAlert('승인 내역을 연결하고 있어요. 잠시 후 다시 눌러주세요.');
            }
            if (unreadResult()) { dismissed.clear(); schedule(); return; }
            if (own?.status === 'pending') return root.enjoyAlert(`이미 ${approverFor(own.name)}님의 승인을 기다리는 요청이 있어요.`);
            const expectedEpoch = epoch;
            const expectedName = nameOf(root.enjoyProfileName), approver = approverFor(expectedName);
            submitting = true; render();
            try {
                await service().request(root.enjoyUser.uid, expectedName, root.crypto.randomUUID());
                if (epoch === expectedEpoch) await root.enjoyAlert(`${approver}님에게 승인 요청을 보냈어요. 승인되면 면제권이 적용돼요.`, { title: '면제권 사용 요청' });
            } catch (error) {
                if (epoch === expectedEpoch) await root.enjoyAlert(readableError(error));
            } finally {
                if (epoch === expectedEpoch) { submitting = false; render(); schedule(); }
            }
        }
    };
    root.addEventListener('enjoy-member-sync-ready', () => connect());
    root.addEventListener('enjoy-auth-ready', () => connect());
    root.addEventListener('focus', () => { connect(error); schedule(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { connect(error); schedule(); } });
    connect();
})(typeof window === 'object' ? window : null);
