(function () {
    'use strict';
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const pad = value => String(value).padStart(2, '0');
    function dateParts(value = Date.now()) {
        const date = new Date(Number(value) + KST_OFFSET);
        const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
        const monthKey = year + '-' + pad(month);
        return { year, month, day, monthKey, dateKey: monthKey + '-' + pad(day), daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate() };
    }
    function monthParts(key) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return null;
        const [year, month] = key.split('-').map(Number);
        return { year, month, daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(), firstWeekday: new Date(Date.UTC(year, month - 1, 1)).getUTCDay() };
    }
    function validDate(key, todayKey) {
        if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key) || key > todayKey) return false;
        const month = monthParts(key.slice(0, 7));
        const day = Number(key.slice(8));
        return !!month && day >= 1 && day <= month.daysInMonth;
    }
    function daysForMonth(state, key, todayKey) {
        const record = state && state.months && state.months[key];
        return [...new Set(record && Array.isArray(record.days) ? record.days.filter(day => validDate(day, todayKey) && day.slice(0, 7) === key) : [])].sort();
    }
    // A deterministic monthly coupon and the visit are committed together.
    // Firestore transaction retries cannot issue a second coupon or reset a used one.
    function applyVisits(value, visits, today, issuedAt) {
        const source = value && typeof value === 'object' ? value : {};
        const state = { ...source, months: { ...(source.months || {}) }, coupons: { ...(source.coupons || {}) } };
        const eligibleVisits = [...new Set(visits.filter(key => validDate(key, today.dateKey)))].sort();
        const months = new Set(eligibleVisits.map(key => key.slice(0, 7)));
        let changed = false;
        for (const key of months) {
            const old = state.months[key] || {};
            const existing = daysForMonth(state, key, today.dateKey);
            const days = [...new Set([...existing, ...eligibleVisits.filter(day => day.slice(0, 7) === key)])].sort();
            const record = { ...old, days };
            if (days.length !== existing.length) changed = true;
            const month = monthParts(key);
            if (days.length === month.daysInMonth) {
                const id = 'attendance-' + key;
                if (!state.coupons[id]) {
                    state.coupons[id] = { id, type: 'penalty-discount', title: '부과금 1천원 할인권', amount: 1000, earnedMonth: key, issuedAt, status: 'available' };
                    changed = true;
                }
                if (!record.rewardIssued) {
                    record.rewardIssued = true;
                    record.rewardIssuedAt = issuedAt;
                    changed = true;
                }
            }
            state.months[key] = record;
        }
        return { state, changed };
    }
    function nextMidnightDelay(value = Date.now()) {
        return DAY_MS - ((Number(value) + KST_OFFSET) % DAY_MS) + 50;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { dateParts, monthParts, validDate, daysForMonth, applyVisits, nextMidnightDelay };
        return;
    }

    const byId = id => document.getElementById(id);
    const empty = () => ({ months: {}, coupons: {} });
    let state = empty(), uid = '', epoch = 0, unsubscribe = null, inFlight = null;
    let selectedMonth = dateParts().monthKey, viewingCurrentMonth = true, midnightTimer = 0, retryTimer = 0;
    let syncing = false, saveError = false;
    const cacheKey = id => 'enjoy_attendance_cache_v1_' + id;
    const pendingKey = id => 'enjoy_attendance_pending_v1_' + id;
    function readLocal(key, fallback) {
        try { const value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; }
        catch (_) { return fallback; }
    }
    function writeLocal(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }
    function pendingDates(id) {
        const dates = readLocal(pendingKey(id), []);
        return Array.isArray(dates) ? dates.filter(value => typeof value === 'string') : [];
    }
    function signedInUser() {
        return window.enjoyUser && window.enjoyUser.uid && !window.isGuest ? window.enjoyUser : null;
    }
    function ready() {
        return !!(window.meetingDb && window.fsDoc && window.fsOnSnapshot && window.runTransaction && window.fsServerTimestamp);
    }
    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    function render() {
        const root = byId('home-attendance-panel');
        if (!root) return;
        const today = dateParts();
        if (viewingCurrentMonth) selectedMonth = today.monthKey;
        const month = monthParts(selectedMonth);
        const dates = daysForMonth(state, selectedMonth, today.dateKey);
        const checked = daysForMonth(state, today.monthKey, today.dateKey).includes(today.dateKey);
        const status = byId('attendance-status');
        status.classList.toggle('is-checked', checked);
        status.textContent = !uid ? '로그인 후 자동 출석' : checked ? '오늘 출석 완료' : syncing ? '출석 기록 중…' : '출석 저장 대기';
        byId('attendance-status-message').textContent = !uid ? '로그인하면 오늘의 출석이 자동으로 기록됩니다.' :
            saveError ? '연결되면 접속한 날짜의 출석을 자동으로 저장합니다.' : '매일 한국 시간 0시에 새 날짜가 시작됩니다.';
        byId('attendance-month-title').textContent = month.year + '년 ' + month.month + '월';
        byId('attendance-count').textContent = dates.length + ' / ' + month.daysInMonth + '일';
        byId('attendance-progress').max = month.daysInMonth;
        byId('attendance-progress').value = dates.length;
        byId('attendance-next-month').disabled = selectedMonth >= today.monthKey;
        const cells = Array.from({ length: month.firstWeekday }, () => '<li class="attendance-day is-blank" aria-hidden="true"></li>');
        for (let day = 1; day <= month.daysInMonth; day++) {
            const key = selectedMonth + '-' + pad(day);
            const attended = dates.includes(key), isToday = key === today.dateKey;
            const label = month.month + '월 ' + day + '일' + (attended ? ' 출석 완료' : key < today.dateKey ? ' 미출석' : isToday ? ' 오늘' : '');
            cells.push('<li class="attendance-day' + (attended ? ' is-attended' : key > today.dateKey ? ' is-future' : ' is-missed') +
                (isToday ? ' is-today' : '') + '"><time datetime="' + key + '" aria-label="' + label + '">' + day +
                '</time><span aria-hidden="true">' + (attended ? '<i class="fa-solid fa-check"></i>' : '') + '</span></li>');
        }
        byId('attendance-days').innerHTML = cells.join('');
        byId('attendance-calendar').setAttribute('aria-label', month.year + '년 ' + month.month + '월 출석 기록');
        const earned = !!(state.coupons && state.coupons['attendance-' + selectedMonth]);
        byId('attendance-reward-status').textContent = earned ? '개근 할인권 지급 완료' : '1일부터 마지막 날까지 모두 출석하면 자동 지급';
        const coupons = Object.values(state.coupons || {}).filter(coupon => coupon && coupon.type === 'penalty-discount' && coupon.amount === 1000);
        coupons.sort((a, b) => String(b.earnedMonth).localeCompare(String(a.earnedMonth)));
        byId('attendance-coupon-count').textContent = coupons.filter(coupon => coupon.status === 'available').length + '개';
        byId('attendance-coupons').innerHTML = coupons.length ? coupons.map(coupon => {
            const earnedMonth = monthParts(coupon.earnedMonth);
            const label = earnedMonth ? earnedMonth.year + '년 ' + earnedMonth.month + '월 개근' : '월간 개근';
            return '<li class="attendance-coupon"><i class="fa-solid fa-ticket-simple" aria-hidden="true"></i><div><strong>부과금 1천원 할인권</strong><small>' +
                escapeHtml(label) + '</small></div><span>' + (coupon.status === 'available' ? '보유 중' : '사용 완료') + '</span></li>';
        }).join('') : '<li class="attendance-coupons-empty">아직 지급된 할인권이 없어요.</li>';
    }
    function scheduleMidnight() {
        window.clearTimeout(midnightTimer);
        midnightTimer = window.setTimeout(() => {
            checkAttendance();
        }, nextMidnightDelay());
    }
    async function checkAttendance() {
        scheduleMidnight();
        const user = signedInUser();
        if (!user || document.visibilityState === 'hidden') { render(); return; }
        if (uid !== user.uid) { start(); return; }
        const today = dateParts();
        const queued = [...new Set([...pendingDates(uid), today.dateKey])].filter(key => validDate(key, today.dateKey));
        writeLocal(pendingKey(uid), queued);
        if (inFlight && inFlight.uid === uid) return inFlight.promise;
        if (!ready()) { saveError = true; render(); retry(); return; }
        const expectedUid = uid, expectedEpoch = epoch;
        const visits = queued.filter(key => validDate(key, today.dateKey));
        syncing = true;
        render();
        const job = { uid: expectedUid, epoch: expectedEpoch };
        inFlight = job;
        job.promise = (async () => {
            let succeeded = false;
            try {
                const ref = window.fsDoc('members', expectedUid);
                const committed = await window.runTransaction(window.meetingDb, async transaction => {
                    const snapshot = await transaction.get(ref);
                    if (epoch !== expectedEpoch || !signedInUser() || signedInUser().uid !== expectedUid) throw new Error('attendance-account-changed');
                    const source = snapshot.exists() ? snapshot.data().attendance : null;
                    const result = applyVisits(source, visits, dateParts(), window.fsServerTimestamp());
                    if (result.changed) transaction.set(ref, { attendance: result.state }, { merge: true });
                    return result.state;
                });
                if (epoch !== expectedEpoch || uid !== expectedUid) return;
                state = committed;
                writeLocal(cacheKey(uid), state);
                writeLocal(pendingKey(uid), pendingDates(uid).filter(key => !visits.includes(key)));
                saveError = false;
                succeeded = true;
            } catch (error) {
                if (epoch === expectedEpoch && uid === expectedUid) {
                    saveError = true;
                    console.warn('출석 기록 저장 실패:', error);
                }
            } finally {
                if (inFlight === job) inFlight = null;
                if (epoch === expectedEpoch && uid === expectedUid) {
                    syncing = false;
                    render();
                    if (!succeeded) retry();
                    else if (pendingDates(uid).some(key => validDate(key, dateParts().dateKey))) {
                        window.setTimeout(checkAttendance, 50);
                    }
                }
            }
        })();
        return job.promise;
    }
    function retry() {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(checkAttendance, 30000);
    }
    function start() {
        const user = signedInUser();
        const nextUid = user ? user.uid : '';
        if (uid === nextUid && (!nextUid || unsubscribe)) { checkAttendance(); return; }
        epoch += 1;
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        window.clearTimeout(retryTimer);
        inFlight = null;
        uid = nextUid;
        state = uid ? readLocal(cacheKey(uid), empty()) : empty();
        if (!state || typeof state !== 'object') state = empty();
        selectedMonth = dateParts().monthKey;
        viewingCurrentMonth = true;
        syncing = false;
        saveError = false;
        render();
        if (uid && ready()) {
            const expectedEpoch = epoch;
            unsubscribe = window.fsOnSnapshot(window.fsDoc('members', uid), snapshot => {
                if (epoch !== expectedEpoch) return;
                state = snapshot.exists() ? snapshot.data().attendance || empty() : empty();
                writeLocal(cacheKey(uid), state);
                render();
            }, () => {
                if (epoch !== expectedEpoch) return;
                saveError = true;
                render();
            });
        }
        checkAttendance();
    }
    window.prepareEnjoyAttendance = function () { render(); start(); };
    window.changeEnjoyAttendanceMonth = function (offset) {
        const month = monthParts(selectedMonth);
        const next = new Date(Date.UTC(month.year, month.month - 1 + offset, 1));
        const key = next.getUTCFullYear() + '-' + pad(next.getUTCMonth() + 1);
        if (key > dateParts().monthKey) return;
        selectedMonth = key;
        viewingCurrentMonth = selectedMonth === dateParts().monthKey;
        window.haptic && window.haptic();
        render();
    };
    window.addEventListener('enjoy-auth-ready', start);
    window.addEventListener('focus', start);
    window.addEventListener('online', start);
    window.addEventListener('pageshow', start);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') start(); });
    render();
    if (window.enjoyAuthResolved) start();
    else scheduleMidnight();
})();
