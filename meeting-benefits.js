(function (root) {
    'use strict';
    const members = ['홍박사', '류짱', '오스틴', '전시기', '이진누', '성원제'];
    const normalizeName = name => name === '지노' ? '이진누' : String(name || '').trim();
    const won = amount => Math.max(0, Number(amount) || 0).toLocaleString('ko-KR') + '원';
    const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    function normalizedData(data) {
        const records = {};
        Object.entries(data.records || {}).forEach(([key, rows]) => {
            records[key] = rows.map(row => ({ ...row, name: normalizeName(row.name) }));
        });
        return { ...data, records };
    }

    function rowsAt(data, year, month) {
        const key = `${year}-${month}`;
        const legacy = (year === 2025 && month >= 10) || (year === 2026 && month <= 9);
        return (data.records || {})[key] || (legacy && (data.records || {})[month]) || [];
    }

    function ticketCount(data, name) {
        const tickets = data.exemptions || {};
        const count = Number(tickets[name] || 0) + (name === '이진누' ? Number(tickets['지노'] || 0) : 0);
        return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }

    function stateFor(data, name, calculate, now = new Date()) {
        name = normalizeName(name);
        const history = calculate(normalizedData(data), now)[name] || {};
        const year = now.getFullYear(), month = now.getMonth() + 1;
        const months = Object.entries(history).map(([key, h]) => {
            const [y, m] = key.split('-').map(Number);
            return { key, year: y, month: m, h, record: rowsAt(data, y, m).find(row => normalizeName(row.name) === name) };
        }).filter(item => item.year < year || (item.year === year && item.month <= month))
            .sort((a, b) => a.year - b.year || a.month - b.month);
        let lastSettled = -1;
        months.forEach((item, index) => {
            if (item.h.status === 'paid' && item.h.balanceAfter >= 0) lastSettled = index;
        });
        return {
            name, count: ticketCount(data, name), months,
            outstanding: months.slice(lastSettled + 1),
            remaining: Math.max(0, -(history[`${year}-${month}`] || {}).balanceAfter || 0)
        };
    }

    // Try the latest unpaid charge first. Recalculate through today so a previously
    // settled charge can never consume a ticket merely because an old row is unpaid.
    function prepareRedemption(data, name, uid, calculate, now = new Date()) {
        name = normalizeName(name);
        if (!members.includes(name)) throw new Error('정식 멤버로 로그인한 후 사용할 수 있습니다.');
        const state = stateFor(data, name, calculate, now);
        if (!state.count) throw new Error('면제권이 없으므로 사용할 수 없습니다.');
        const candidates = state.outstanding.slice().reverse().filter(item => {
            const h = item.h;
            if (h.isPaymentStopped || h.isExempted) return false;
            const past = item.year < now.getFullYear() || item.month < now.getMonth() + 1;
            return h.penaltyAmount > 0 || (past && h.status !== 'deferred' && !h.currentDuesPaid);
        });
        for (const item of candidates) {
            const records = { ...(data.records || {}) };
            const rows = rowsAt(data, item.year, item.month).map(row => ({ ...row }));
            let index = rows.findIndex(row => normalizeName(row.name) === name);
            if (index < 0) {
                index = rows.length;
                rows.push({ name, status: item.h.status, amount: item.h.amount, isLeader: name === '전시기' });
            }
            rows[index] = { ...rows[index], ticketUsed: true, ticketUsedByUid: uid, ticketUsedAt: now.getTime() };
            records[item.key] = rows;
            const next = { ...data, records };
            const after = stateFor(next, name, calculate, now);
            const benefit = state.remaining - after.remaining;
            if (benefit <= 0 || benefit > 10000) continue;
            const exemptions = { ...(data.exemptions || {}), [name]: state.count - 1 };
            if (name === '이진누') delete exemptions['지노'];
            next.exemptions = exemptions;
            return { data: next, monthKey: item.key };
        }
        throw new Error('사용할 미납 부과금이 없습니다. 면제권은 부과금이 있을 때 사용할 수 있습니다.');
    }

    const api = { stateFor, prepareRedemption, rowsAt, ticketCount };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (!root || !root.document) return;
    root.enjoyMeetingBenefits = api;
    let busy = false;
    const myName = () => normalizeName(root.enjoyProfileName);
    const notify = message => root.enjoyAlert ? root.enjoyAlert(message) : root.alert(message);

    root.renderMeetingBenefits = function () {
        const panel = root.document.getElementById('meeting-my-benefits');
        if (!panel) return;
        const name = myName();
        if (!root.enjoyUser || !members.includes(name)) {
            panel.innerHTML = '<h3 class="meeting-benefits-heading">내 부과금·유예 및 면제권</h3><p class="meeting-benefits-empty">정식 멤버로 로그인하면 내 내역을 확인할 수 있어요.</p>';
            return;
        }
        if (!root.meetingData || !root.calculateMemberHistory) {
            panel.innerHTML = '<p class="meeting-benefits-empty">내 내역을 불러오는 중이에요.</p>';
            return;
        }
        const now = new Date();
        const state = stateFor(root.meetingData, name, root.calculateMemberHistory, now);
        const history = state.outstanding.filter(item => {
            const h = item.h;
            return !h.isPaymentStopped && (h.status === 'deferred' || h.penaltyAmount > 0 ||
                (item.key !== `${now.getFullYear()}-${now.getMonth() + 1}` && !h.currentDuesPaid));
        }).map(item => {
            const h = item.h;
            const parts = [];
            const unpaid = Math.max(0, h.regularDues - h.amount);
            if (h.status === 'deferred') parts.push(`유예 회비 ${won(unpaid)}`);
            else if (unpaid) parts.push(`미납 회비 ${won(unpaid)}`);
            if (h.penaltyAmount) parts.push(`부과금 ${won(h.penaltyAmount)}`);
            return `<li><span class="meeting-benefits-month">${item.year}년 ${item.month}월</span><span class="meeting-benefits-description ${h.status === 'deferred' ? 'is-deferred' : ''}">${parts.join(' · ')}</span></li>`;
        });
        state.months.filter(item => item.record && item.record.ticketUsedByUid).forEach(item => {
            history.push(`<li><span class="meeting-benefits-month">${item.year}년 ${item.month}월</span><span class="meeting-benefits-description is-used">면제권 사용 · 부과금 10,000원 면제</span></li>`);
        });
        panel.innerHTML = `<h3 class="meeting-benefits-heading">${escape(name)}님의 부과금·유예 및 면제권</h3>
            <div class="meeting-benefits-totals"><div><span class="meeting-benefits-label">남은 납부금액</span><strong class="meeting-benefits-amount">${won(state.remaining)}</strong></div><div><span class="meeting-benefits-label">보유 면제권</span><strong class="meeting-benefits-amount meeting-benefits-ticket">${state.count}개</strong></div></div>
            <ul class="meeting-benefits-history">${history.length ? history.join('') : '<li class="meeting-benefits-empty">부과금·유예 내역이 없습니다.</li>'}</ul>
            <button type="button" class="meeting-benefits-use ${state.count ? '' : 'is-empty'}" ${busy ? 'disabled aria-busy="true"' : ''} onclick="window.useMeetingExemption()">${busy ? '면제권 사용 중…' : '면제권 사용'}</button>`;
    };

    root.useMeetingExemption = async function () {
        if (busy) return;
        const name = myName(), user = root.enjoyUser;
        if (!user || !members.includes(name) || !root.enjoySync) return notify('정식 멤버로 로그인한 후 사용할 수 있습니다.');
        if (!ticketCount(root.meetingData || {}, name)) return notify('면제권이 없으므로 사용할 수 없습니다.');
        if (!root.runTransaction || !root.fsDoc || !root.meetingDb) return notify('연결 확인 중입니다. 잠시 후 다시 시도해 주세요.');
        busy = true;
        root.renderMeetingBenefits();
        const usedAt = new Date();
        try {
            const memberRef = root.fsDoc('members', user.uid);
            const meetingRef = root.fsDoc(...root.MEETING_PATH);
            const result = await root.runTransaction(root.meetingDb, async transaction => {
                const member = await transaction.get(memberRef);
                const meeting = await transaction.get(meetingRef);
                if (!root.enjoyUser || root.enjoyUser.uid !== user.uid || myName() !== name) throw new Error('로그인한 사용자의 멤버 정보가 변경되었습니다. 다시 시도해 주세요.');
                if (!member.exists() || normalizeName(member.data().name) !== name) throw new Error('로그인한 사용자의 멤버 정보를 확인할 수 없습니다.');
                if (!meeting.exists()) throw new Error('모임통장 내역을 불러올 수 없습니다.');
                const plan = prepareRedemption(meeting.data(), name, user.uid, root.calculateMemberHistory, usedAt);
                transaction.update(meetingRef, { records: plan.data.records, exemptions: plan.data.exemptions });
                return plan;
            });
            if (root.enjoyUser && root.enjoyUser.uid === user.uid) {
                root.currentDuesYear = Number(result.monthKey.split('-')[0]);
                root.currentDuesMonth = Number(result.monthKey.split('-')[1]);
                root.updateMeetingUI(result.data);
                if (root.renderMeetingStatus) root.renderMeetingStatus();
                await notify('면제권 1개를 사용하여 부과금 10,000원을 면제했습니다.');
            }
        } catch (error) {
            const known = /면제권|미납 부과금|멤버 정보|모임통장 내역/.test(error.message || '');
            await notify(known ? error.message : '면제권 사용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            busy = false;
            root.renderMeetingBenefits();
        }
    };
    root.addEventListener('enjoy-auth-ready', root.renderMeetingBenefits);
    root.addEventListener('focus', root.renderMeetingBenefits);
    root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) root.renderMeetingBenefits(); });
    root.renderMeetingBenefits();
})(typeof window === 'object' ? window : null);
