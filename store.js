(function (root) {
    'use strict';
    const RATE = 100;
    const memberNames = ['홍박사', '류짱', '오스틴', '전시기', '이진누', '성원제'];
    const products = {
        waiver: { title: '부과금 면제권', amount: 10000, cost: 1000000, icon: 'fa-ticket-simple' },
        dues: { title: '모임비 차감권', minPoints: 10000, icon: 'fa-coins' },
        baemin: { title: '배달의 민족 5천원 상품권', amount: 5000, cost: 500000, icon: 'fa-motorcycle' }
    };
    const nameOf = value => value === '지노' ? '이진누' : String(value || '').trim();
    function pointsOf(member) {
        const value = Math.floor(Number(member && member.points) || 0);
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }
    function koreaDate(now = new Date()) {
        const date = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes());
    }
    function purchaseMonth(now = new Date()) {
        const date = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    function purchaseBlock(member, productId, orders = [], now = new Date()) {
        const limits = member && member.storePurchaseLimits || {};
        if (productId === 'baemin') {
            if (limits.baemin && limits.baemin.pendingOrderId || orders.some(order => order.productId === 'baemin' && !['fulfilled', 'cancelled'].includes(order.status)))
                return '관리자가 지급 완료 처리한 후 다시 구매할 수 있습니다.';
        } else if (['waiver', 'dues'].includes(productId)) {
            const month = purchaseMonth(now);
            if (limits[productId] && limits[productId].month === month || orders.some(order => order.productId === productId && purchaseMonth(new Date(order.createdAt)) === month))
                return '이 상품은 월 1회 구매할 수 있습니다. 다음 달 1일부터 다시 구매해 주세요.';
        }
        return '';
    }
    function normalizedMeeting(meeting) {
        const records = {};
        Object.entries(meeting.records || {}).forEach(([key, rows]) => {
            records[key] = rows.map(row => ({ ...row, name: nameOf(row.name) }));
        });
        return { ...meeting, records };
    }
    function monthRows(meeting, date) {
        const year = date.getFullYear(), month = date.getMonth() + 1;
        const legacy = (year === 2025 && month >= 10) || (year === 2026 && month <= 9);
        return (meeting.records || {})[`${year}-${month}`] || (legacy && (meeting.records || {})[month]) || [];
    }
    function duesQuote(member, meeting, calculate, now = new Date()) {
        const date = koreaDate(now), monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        const points = pointsOf(member), converted = Math.floor(points / RATE);
        const history = meeting && calculate ? (calculate(normalizedMeeting(meeting), date)[nameOf(member && member.name)] || {})[monthKey] : null;
        const remainingDues = history && !history.isPaymentStopped ? Math.max(0, history.baseDues - history.amount) : 0;
        const amount = Math.min(converted, Math.floor(remainingDues));
        return { converted, remainingDues, amount, cost: amount * RATE, monthKey };
    }
    function error(message) { const value = new Error(message); value.storeReason = true; throw value; }
    function planPurchase({ member, meeting, productId, uid, id, calculate, now = new Date(), expectedAmount, previousOrders = [] }) {
        const product = products[productId];
        if (!product) error('구매할 상품을 확인해 주세요.');
        const name = nameOf(member && member.name);
        if (!memberNames.includes(name)) error('정식 멤버로 로그인한 후 구매할 수 있습니다.');
        const blocked = purchaseBlock(member, productId, previousOrders, now);
        if (blocked) error(blocked);
        const points = pointsOf(member);
        let cost = product.cost, amount = product.amount, updatedMeeting = meeting, monthKey = '';
        if (productId === 'dues') {
            if (!meeting || !calculate) error('모임통장 정보를 불러온 후 다시 시도해 주세요.');
            const quote = duesQuote(member, meeting, calculate, now);
            if (points < product.minPoints) error('모임비 차감권은 10,000포인트 이상 보유 시 구매할 수 있습니다.');
            if (quote.remainingDues <= 0) error('이번 달 차감할 회비가 없습니다.');
            if (quote.amount !== expectedAmount) error('할인 가능 금액이 변경되었습니다. 화면을 확인한 후 다시 구매해 주세요.');
            ({ cost, amount, monthKey } = quote);
        }
        if (points < cost) error('보유 포인트가 부족합니다.');
        if (productId === 'waiver') {
            if (!meeting) error('모임통장 정보를 불러온 후 다시 시도해 주세요.');
            const exemptions = { ...(meeting.exemptions || { '류짱': 1, '성원제': 1, '전시기': 1 }) };
            exemptions[name] = Math.max(0, Math.floor(Number(exemptions[name]) || 0)) +
                (name === '이진누' ? Math.max(0, Math.floor(Number(exemptions['지노']) || 0)) : 0) + 1;
            if (name === '이진누') delete exemptions['지노'];
            updatedMeeting = { ...meeting, exemptions };
        } else if (productId === 'dues') {
            const date = koreaDate(now), records = { ...(meeting.records || {}) };
            const savedRows = monthRows(meeting, date);
            const rows = (savedRows.length ? savedRows : memberNames.map(name => ({ name, status: 'unpaid', amount: 0, isLeader: name === '전시기' }))).map(row => ({ ...row }));
            let index = rows.findIndex(row => nameOf(row.name) === name);
            if (index < 0) {
                index = rows.length;
                rows.push({ name, status: 'unpaid', amount: 0, isLeader: name === '전시기' });
            }
            rows[index] = { ...rows[index], duesDiscountAmount: (Number(rows[index].duesDiscountAmount) || 0) + amount,
                duesDiscountPoints: (Number(rows[index].duesDiscountPoints) || 0) + cost, duesDiscountLastOrderId: id };
            records[monthKey] = rows;
            updatedMeeting = { ...meeting, records };
            const history = calculate(normalizedMeeting(updatedMeeting), date)[name][monthKey];
            if (history.balanceAfter >= 0 && !history.isPaymentStopped) rows[index].status = 'paid';
        }
        const order = { id, uid, memberName: name, productId, productTitle: product.title,
            pointsSpent: cost, amount, createdAt: now.getTime(), status: productId === 'baemin' ? 'pending' : productId === 'dues' ? 'applied' : 'issued' };
        if (monthKey) order.appliedMonth = monthKey;
        if (productId === 'baemin') order.fulfillment = 'admin';
        const storePurchaseLimits = { ...(member.storePurchaseLimits || {}), [productId]: productId === 'baemin'
            ? { pendingOrderId: id } : { month: purchaseMonth(now), orderId: id } };
        return { points: points - cost, storePurchaseLimits, meeting: updatedMeeting, order };
    }
    const api = { RATE, products, pointsOf, duesQuote, purchaseMonth, purchaseBlock, planPurchase };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (!root || !root.document) return;
    root.enjoyStore = api;
    let busy = false, pendingAttempt = null, orders = [], ordersUid = '', ordersUnsub = null, ordersEpoch = 0, ordersError = '', ordersLoading = false;
    const byId = id => root.document.getElementById(id);
    const user = () => root.enjoyUser && !root.isGuest ? root.enjoyUser : null;
    const member = () => user() && root.enjoyStoreMember ? root.enjoyStoreMember() : null;
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const format = value => Number(value || 0).toLocaleString('ko-KR');
    const notify = text => root.enjoyAlert ? root.enjoyAlert(text) : root.alert(text);
    const eligible = value => !!(user() && root.enjoySync && value && value.uid === user().uid && memberNames.includes(nameOf(value.name)));
    const ready = () => !!(root.meetingDb && root.runTransaction && root.fsDoc && root.fsCol && root.fsOnSnapshot && root.fsQuery && root.fsWhere && root.fsGetDocs);

    root.renderEnjoyStore = function () {
        const container = byId('store-root');
        if (!container) return;
        const current = member(), points = pointsOf(current);
        const allowed = eligible(current);
        const quote = duesQuote(current, root.meetingData, root.calculateMemberHistory);
        const cards = Object.entries(products).map(([key, product]) => {
            const cost = key === 'dues' ? quote.cost : product.cost;
            const history = ordersUid === (user() && user().uid) ? orders : [];
            const blocked = purchaseBlock(current, key, history);
            const checking = !!(allowed && (ordersLoading || ordersError || ordersUid !== user().uid));
            const confirming = !!(pendingAttempt && pendingAttempt.productId === key);
            const disabled = busy || !allowed || (!confirming && (checking || !!blocked || (key === 'dues' ? points < product.minPoints || quote.amount <= 0 : points < cost)));
            const waiverStart = root.enjoyMeetingBenefits && !root.enjoyMeetingBenefits.canUseExemption() ? ' 면제권 사용은 11월 1일부터 가능합니다.' : '';
            const description = key === 'waiver' ? '부과금 10,000원 면제권 1개를 모임통장에 지급해요.' + waiverStart : key === 'baemin' ? '관리자 확인 후 상품권을 지급해요. 구매 내역에서 지급 상태를 확인할 수 있어요.' :
                `10,000포인트 이상 보유 시 구매할 수 있어요. 포인트 환산 ${format(quote.converted)}원 · 이번 달 남은 회비 ${format(quote.remainingDues)}원`;
            const price = key === 'dues' ? `모임비 ${format(quote.amount)}원 차감` : `${format(cost)} P`;
            const sub = key === 'dues' ? `${format(cost)} P 사용 · 남는 포인트 ${format(points - cost)} P` : `100 P = 1원 · ${format(product.amount)}원`;
            return `<article class="store-product"><div class="store-product-icon ${key === 'baemin' ? 'is-baemin' : ''}"><i class="fa-solid ${product.icon}" aria-hidden="true"></i></div><h2>${product.title}</h2><p>${description}</p><strong class="store-product-price">${price}</strong><small>${sub}</small><button type="button" onclick="window.buyEnjoyStoreProduct('${key}', ${key === 'dues' ? quote.amount : 'null'})" ${disabled ? 'disabled' : ''}>${busy ? '구매 처리 중…' : confirming ? '구매 저장 확인' : blocked ? key === 'baemin' ? '지급 완료 대기' : '이번 달 구매 완료' : checking ? '구매 내역 확인 중' : key === 'baemin' ? '구매 신청' : '구매'}</button><small>${blocked || (key === 'baemin' ? '관리자 지급 완료 전까지 추가 구매가 제한돼요.' : '상품별 월 1회 · 매월 1일 0시(KST)에 초기화돼요.')}</small></article>`;
        }).join('');
        const history = ordersUid === (user() && user().uid) ? orders : [];
        const statusText = order => order.productId === 'baemin' ? (order.status === 'fulfilled' ? '지급 완료' : order.status === 'cancelled' ? '취소' : '지급 대기') : order.productId === 'dues' ? `${esc(order.appliedMonth || '')} 모임비 차감 완료` : '모임통장 지급 완료';
        container.innerHTML = `<div class="store-balance"><span>내 보유 포인트</span><strong>${format(points)} <small>P</small></strong><p>${allowed ? `100포인트당 1원 · ${format(Math.floor(points / RATE))}원으로 환산` : user() ? (current ? '정식 멤버만 구매할 수 있어요.' : '정식 멤버 포인트를 불러오는 중이에요.') : '로그인하면 내 포인트로 구매할 수 있어요.'}</p></div><div class="store-products">${cards}</div>
            <details class="store-history"><summary>구매 내역 <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div>${history.length ? history.slice().sort((a, b) => b.createdAt - a.createdAt).map(order => `<div class="store-order"><strong>${esc(order.productTitle)}</strong><span>${format(order.pointsSpent)} P · ${format(order.amount)}원</span><small>${statusText(order)}</small></div>`).join('') : `<p class="store-empty">${ordersError || (ordersLoading ? '구매 내역을 불러오는 중이에요.' : '아직 구매 내역이 없습니다.')}</p>`}</div></details>`;
    };
    root.leaveEnjoyStore = function () {
        ordersEpoch++;
        if (ordersUnsub) ordersUnsub();
        ordersUnsub = null; ordersLoading = false;
    };
    root.prepareEnjoyStore = function () {
        const current = user(), account = member();
        if (!current || !eligible(account)) { root.renderEnjoyStore(); return; }
        if (ordersUid !== current.uid) { root.leaveEnjoyStore(); ordersUid = current.uid; orders = []; ordersError = ''; }
        if (!ordersUnsub && ready()) {
            const epoch = ++ordersEpoch, uid = current.uid;
            ordersLoading = true;
            ordersUnsub = root.fsOnSnapshot(root.fsQuery(root.fsCol('store_orders'), root.fsWhere('uid', '==', uid)), snapshot => {
                if (epoch !== ordersEpoch || !user() || user().uid !== uid) return;
                orders = []; snapshot.forEach(entry => { const order = entry.data(); if (order.uid === uid) orders.push({ ...order, id: entry.id || order.id }); });
                ordersLoading = false; ordersError = ''; root.renderEnjoyStore();
            }, () => { if (epoch === ordersEpoch) { root.leaveEnjoyStore(); ordersError = '구매 내역을 불러오지 못했어요.'; root.renderEnjoyStore(); } });
        }
        root.renderEnjoyStore();
    };
    root.refreshEnjoyStore = () => root.activeTabIndex === 1 ? root.prepareEnjoyStore() : root.renderEnjoyStore();
    root.buyEnjoyStoreProduct = async function (productId, expectedAmount) {
        if (busy) return;
        const current = user(), account = member();
        if (!eligible(account)) return notify('정식 멤버로 로그인한 후 구매할 수 있습니다.');
        if (!ready()) return notify('연결 확인 중입니다. 잠시 후 다시 시도해 주세요.');
        const name = nameOf(account.name);
        if (!pendingAttempt || pendingAttempt.productId !== productId) pendingAttempt = { productId, expectedAmount,
            id: root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : `store-${Date.now()}-${Math.random().toString(36).slice(2)}` };
        const attempt = pendingAttempt;
        busy = true; root.renderEnjoyStore();
        try {
            const memberRef = root.fsDoc('members', current.uid), meetingRef = root.fsDoc(...root.MEETING_PATH), orderRef = root.fsDoc('store_orders', attempt.id);
            // 이전 버전에서 저장한 주문도 제한에 포함한다. 새 주문의 동시 구매는 멤버 문서 잠금으로 막는다.
            const saved = await root.fsGetDocs(root.fsQuery(root.fsCol('store_orders'), root.fsWhere('uid', '==', current.uid)));
            const priorIds = [];
            saved.forEach(entry => { const order = entry.data(); if (order.uid === current.uid && order.productId === productId) priorIds.push(entry.id || order.id); });
            const result = await root.runTransaction(root.meetingDb, async transaction => {
                const person = await transaction.get(memberRef);
                const meeting = productId === 'baemin' ? null : await transaction.get(meetingRef);
                const previous = await transaction.get(orderRef);
                if (!user() || user().uid !== current.uid || nameOf(member() && member().name) !== name) error('로그인한 멤버 정보가 변경되었습니다. 다시 시도해 주세요.');
                if (!person.exists() || nameOf(person.data().name) !== name) error('로그인한 멤버 정보를 확인할 수 없습니다.');
                if (previous.exists()) {
                    if (previous.data().uid !== current.uid || previous.data().productId !== productId) error('구매 기록을 확인할 수 없습니다.');
                    return { points: pointsOf(person.data()), storePurchaseLimits: person.data().storePurchaseLimits || {}, meeting: meeting && meeting.exists() ? meeting.data() : null, order: previous.data() };
                }
                const persisted = person.data(), previousOrders = [];
                const pointer = persisted.storePurchaseLimits && persisted.storePurchaseLimits.baemin && persisted.storePurchaseLimits.baemin.pendingOrderId;
                if (productId === 'baemin' && pointer && !priorIds.includes(pointer)) priorIds.push(pointer);
                for (const priorId of priorIds) {
                    const snapshot = await transaction.get(root.fsDoc('store_orders', priorId));
                    if (snapshot.exists() && snapshot.data().uid === current.uid) previousOrders.push({ ...snapshot.data(), id: priorId });
                }
                // 완료 상태를 직접 확인하므로 완료 직후 주문 목록 갱신을 기다릴 필요가 없다.
                const effectiveMember = { ...persisted, storePurchaseLimits: { ...(persisted.storePurchaseLimits || {}) } };
                if (pointer && previousOrders.some(order => order.id === pointer && ['fulfilled', 'cancelled'].includes(order.status))) effectiveMember.storePurchaseLimits.baemin = null;
                const plan = planPurchase({ member: effectiveMember, previousOrders, meeting: meeting && meeting.exists() ? meeting.data() : null,
                    productId, uid: current.uid, id: attempt.id, calculate: root.calculateMemberHistory, now: new Date(), expectedAmount: attempt.expectedAmount });
                transaction.update(memberRef, { points: plan.points, storePurchaseLimits: plan.storePurchaseLimits });
                if (productId === 'waiver') transaction.update(meetingRef, { exemptions: plan.meeting.exemptions });
                if (productId === 'dues') transaction.update(meetingRef, { records: plan.meeting.records });
                transaction.set(orderRef, plan.order);
                return plan;
            });
            pendingAttempt = null;
            if (user() && user().uid === current.uid) {
                if (root.enjoyApplyStoreMember) root.enjoyApplyStoreMember(current.uid, result.points, result.storePurchaseLimits);
                if (result.meeting && root.updateMeetingUI) root.updateMeetingUI(result.meeting);
                ordersUid = current.uid;
                if (!orders.some(order => order.id === result.order.id)) orders.push(result.order);
                await notify(productId === 'waiver' ? '부과금 면제권 1개를 모임통장에 지급했습니다.' : productId === 'dues' ? `포인트로 이번 달 모임비 ${format(result.order.amount)}원을 차감했습니다.` : '배민 5천원 상품권 구매 신청이 완료되었습니다. 관리자 확인 후 지급됩니다.');
            }
        } catch (failure) {
            if (failure.storeReason) pendingAttempt = null;
            await notify(failure.storeReason ? failure.message : '구매 저장을 확인하지 못했습니다. 잠시 후 같은 상품을 다시 눌러 주세요.');
        } finally { busy = false; root.refreshEnjoyStore(); }
    };
    root.addEventListener('enjoy-auth-ready', () => {
        root.leaveEnjoyStore(); ordersUid = ''; orders = []; ordersError = ''; pendingAttempt = null; root.refreshEnjoyStore();
    });
    root.addEventListener('online', root.refreshEnjoyStore);
    root.addEventListener('focus', root.refreshEnjoyStore);
    function scheduleMidnight() {
        if (!root.setTimeout) return;
        const now = new Date(), korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const next = Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate() + 1) - 9 * 60 * 60 * 1000;
        root.setTimeout(() => { if (root.activeTabIndex === 1) root.renderEnjoyStore(); scheduleMidnight(); }, Math.max(1, next - now.getTime()));
    }
    scheduleMidnight();
    root.renderEnjoyStore();
})(typeof window === 'object' ? window : null);
