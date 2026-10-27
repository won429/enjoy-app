(function () {
    'use strict';
    const root = document.getElementById('wallet-panel-investment');
    if (!root) return;
    const $ = id => document.getElementById(id);
    const api = (window.ENJOY_INVESTMENT_API || 'https://enjoy-investment.sungwon4867.workers.dev').replace(/\/$/, '');
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = value => value.toLocaleString('ko-KR') + ' P';
    let account = null, owner = null, epoch = 0, preview = null, busy = false, error = '';
    function render(next) {
        if (arguments.length) account = next;
        const uid = window.enjoyUser?.uid || null;
        if (owner !== uid) { owner = uid; epoch++; preview = null; busy = false; error = ''; }
        const section = $('investment-grant-admin');
        if (!section) return;
        section.hidden = !owner || account?.uid !== owner || account.canGrant !== true;
        if (section.hidden) return;
        const completed = preview?.status === 'completed';
        $('investment-grant-preview').disabled = busy;
        $('investment-grant-execute').hidden = !preview || completed;
        $('investment-grant-execute').disabled = busy;
        $('investment-grant-details').innerHTML = !preview ? '' :
            '<p>대상 ' + preview.recipients.length + '명 · 1명당 2토큰 · 총 ' + preview.totalQuantity + '토큰</p><p>지급 기준가 ' + money(preview.price) + ' · 1명당 기준금액 ' + money(preview.price * 2) + '</p><ul>' +
            preview.recipients.map(p => '<li>' + escape(p.name) + '<span>2토큰</span></li>').join('') + '</ul>';
        $('investment-grant-status').textContent = busy ? '지급 정보를 확인하고 있어요' : error || (completed ?
            '지급 완료 · ' + new Date(preview.executedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' · 중복 지급되지 않아요' :
            '포인트 차감 없음 · 지급 시점 기준가 적용 · 구매·판매 잠금 유지');
    }
    async function call(input) {
        const token = await window.getEnjoyIdToken?.(false);
        if (!token) throw new Error('관리자 계정으로 다시 로그인해 주세요.');
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(api + '/admin/grants', { method: input ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit', signal: controller.signal,
                headers: { Authorization: 'Bearer ' + token, ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '지급 정보를 확인하지 못했어요.');
            if (data.campaignId !== 'member-two-token-gift-v1' || data.quantityPerMember !== 2 ||
                !['pending', 'completed'].includes(data.status) || !Number.isSafeInteger(data.price) || data.price < 1 ||
                !Array.isArray(data.recipients) || !data.recipients.length || data.recipients.length > 100 || data.totalQuantity !== data.recipients.length * 2 ||
                !data.recipients.every(p => typeof p.uid === 'string' && typeof p.name === 'string' && p.quantity === 2)) throw new Error('지급 응답을 확인하지 못했어요.');
            return { ...data, receivedAt: Date.now() };
        } finally { clearTimeout(timer); }
    }
    function allowed() { return owner && owner === window.enjoyUser?.uid && account?.uid === owner && account.canGrant === true; }
    async function loadPreview() {
        if (!allowed() || busy) return;
        const version = epoch; busy = true; error = ''; render();
        try { const result = await call(); if (version === epoch && allowed()) preview = result; }
        catch (e) { if (version === epoch) { preview = null; error = e.message || '지급 대상·결과를 다시 확인해 주세요.'; } }
        finally { if (version === epoch) { busy = false; render(); } }
    }
    async function execute() {
        if (!allowed() || busy || preview?.status !== 'pending') return;
        const selected = preview, version = epoch;
        const confirmed = await window.enjoyConfirm?.('확인한 ' + selected.recipients.length + '명에게 기준가 ' + money(selected.price) + '로 2토큰씩 지급할까요?\n포인트는 차감하지 않으며 이 지급은 한 번만 실행됩니다.',
            { title: '전 멤버 2토큰 지급', confirmText: '2토큰씩 지급' });
        if (!confirmed || version !== epoch || !allowed() || preview !== selected || busy) return;
        busy = true; error = ''; render();
        try {
            const result = await call({ campaignId: selected.campaignId, expectedPrice: selected.price, expectedRevision: selected.quoteRevision,
                recipientKey: selected.recipientKey, expiresAt: Math.floor(selected.serverTime + Math.max(0, Date.now() - selected.receivedAt) + 60000) });
            if (version !== epoch || !allowed()) return;
            if (result.status !== 'completed') throw new Error('지급 결과를 다시 확인해 주세요.');
            preview = result;
            await window.enjoyInvestmentPortfolio?.reload();
        } catch (e) {
            if (version === epoch) { preview = null; error = (e.message || '지급 결과를 확인하지 못했어요.') + ' 지급 대상·결과 확인 버튼으로 다시 확인해 주세요.'; }
        } finally { if (version === epoch) { busy = false; render(); } }
    }
    function mount() {
        const home = $('investment-home');
        if (!home) return;
        if (!$('investment-grant-admin')) home.insertAdjacentHTML('beforeend', '<section id="investment-grant-admin" class="iv-admin-grant" aria-labelledby="investment-grant-title" hidden><h2 id="investment-grant-title">관리자 지급</h2><p>전 멤버 2토큰 지급 · 1회</p><button id="investment-grant-preview" type="button" data-investment-grant="preview">지급 대상·결과 확인</button><div id="investment-grant-details"></div><button id="investment-grant-execute" type="button" data-investment-grant="execute" hidden>전 멤버에게 2토큰씩 지급</button><p id="investment-grant-status" role="status" aria-live="polite"></p></section>');
        root.addEventListener('click', event => {
            const button = event.target.closest('button[data-investment-grant]');
            if (!button || button.disabled) return;
            if (button.dataset.investmentGrant === 'preview') loadPreview();
            else if (button.dataset.investmentGrant === 'execute') execute();
        });
        render();
    }
    window.enjoyInvestmentGrantAdmin = { mount, render };
})();
