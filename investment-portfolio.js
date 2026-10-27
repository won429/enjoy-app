(function () {
    'use strict';
    const root = document.getElementById('wallet-panel-investment');
    if (!root) return;
    const api = (window.ENJOY_INVESTMENT_API || 'https://enjoy-investment.sungwon4867.workers.dev').replace(/\/$/, '');
    const $ = id => document.getElementById(id);
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let uid = null, epoch = 0, account = null, ranking = null, market = null, pending = null, busy = false, lastRead = 0, error = '', message = '';
    let context = { currency: 'POINTS', selected: null, tab: 'chart', active: false }, request = null, timer = null, generation = 0;
    const currentUid = () => !window.isGuest && window.enjoyUser?.uid || null;
    const cash = value => context.currency === 'KRW'
        ? (value / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원'
        : Math.round(value).toLocaleString('ko-KR') + ' P';
    const rate = value => (value > 0 ? '+' : '') + value.toFixed(2) + '%';
    const changeClass = value => value > 0 ? 'iv-up' : value < 0 ? 'iv-down' : 'iv-flat';
    const pendingKey = id => 'enjoy_investment_pending_v1:' + id;
    function savePending() {
        try { if (pending) sessionStorage.setItem(pendingKey(uid), JSON.stringify(pending)); else sessionStorage.removeItem(pendingKey(uid)); return true; } catch (_) { return false; }
    }
    function switchAccount() {
        const next = currentUid();
        if (next === uid) return false;
        uid = next; epoch++; generation++; account = ranking = null; pending = null; error = message = ''; lastRead = 0; busy = false; request = null;
        clearTimeout(timer); timer = null;
        if (uid) {
            try {
                const saved = JSON.parse(sessionStorage.getItem(pendingKey(uid)) || 'null');
                if (saved && saved.symbol === 'en-joy' && typeof saved.requestId === 'string') pending = saved;
            } catch (_) {}
        }
        return true;
    }
    async function call(path, input) {
        const token = await window.getEnjoyIdToken?.(false);
        if (!token) throw Object.assign(new Error('로그인을 다시 확인해 주세요.'), { status: 401 });
        const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(api + path, { method: input ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal,
                headers: { Authorization: 'Bearer ' + token, ...(input ? { 'Content-Type': 'application/json' } : {}) },
                ...(input ? { body: JSON.stringify(input) } : {}) });
            const data = await response.json();
            if (!response.ok) throw Object.assign(new Error(data.error || '투자 기록을 불러오지 못했어요.'), { status: response.status, code: data.code });
            return data;
        } finally { clearTimeout(deadline); }
    }
    function quantity() { return Number($('investment-order-quantity')?.value || 1); }
    function price() { return market?.quotes?.find(q => q.id === 'en-joy')?.price; }
    function estimatedTime() { return market ? market.serverTime + Math.max(0, Date.now() - market.receivedAt) : 0; }
    function open() { const time = estimatedTime(); return !!market && (time + 9 * 3600000) % 86400000 < 23.5 * 3600000; }
    function render(next) {
        if (next) context = { ...context, ...next };
        switchAccount();
        const panel = $('investment-ranking');
        if (!panel) return;
        if (!uid) panel.innerHTML = '<p class="iv-ranking-empty">로그인하면 멤버 투자 순위를 볼 수 있어요.</p>';
        else if (!ranking) panel.innerHTML = '<p class="iv-ranking-empty">' + escape(error || '투자 순위를 불러오는 중이에요.') + '</p>';
        else panel.innerHTML = '<table class="iv-ranking-table" aria-label="멤버별 투자 순위"><colgroup><col class="iv-ranking-rank-col"><col><col class="iv-ranking-amount-col"><col class="iv-ranking-rate-col"></colgroup><thead><tr><th scope="col">순위</th><th scope="col">멤버</th><th scope="col">총 투자금액</th><th scope="col">수익률</th></tr></thead><tbody>' +
            ranking.rows.map(row => '<tr' + (row.uid === uid ? ' class="iv-ranking-self"' : '') + '><td>' + row.rank + '</td><th scope="row"><span class="iv-ranking-name">' + escape(row.name) + '</span>' + (row.uid === uid ? '<small class="iv-ranking-me">나</small>' : '') + '</th><td>' + cash(row.investedPoints) + '</td><td class="' + changeClass(row.profit) + '">' + rate(row.returnPercent) + '</td></tr>').join('') +
            '</tbody></table><p class="iv-ranking-note">현재 보유한 드롭의 투자금액 기준 · 같은 금액은 공동 순위</p>';
        const total = $('investment-total'), summary = root.querySelector('.iv-summary > small');
        if (total) total.textContent = account ? cash(account.marketValue) : '—';
        if (summary) summary.textContent = !uid ? '로그인 후 내 투자를 확인할 수 있어요' : !account ? error || '투자 기록을 불러오는 중이에요' :
            account.quantity ? '투자금액 ' + cash(account.costBasis) + ' · 평가수익 ' + cash(account.profit) + ' (' + rate(account.returnPercent) + ')' : '보유한 드롭이 없어요';
        if (account) {
            $('investment-account-points').textContent = account.points.toLocaleString('ko-KR') + ' P';
            $('investment-account-equivalent').textContent = '(= ' + (account.points / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원)';
            $('investment-account-equivalent').hidden = false;
        }
        const holdings = $('investment-holdings-panel');
        if (holdings) {
            holdings.hidden = context.tab !== 'holdings' || context.selected !== 'en-joy';
            const rows = account?.orders || [];
            holdings.innerHTML = !account ? '<p class="iv-book-notice">' + escape(!uid ? '로그인 후 확인해 주세요.' : error || '보유 내역을 불러오는 중이에요.') + '</p>' :
                '<dl class="iv-holdings-summary"><div><dt>보유 드롭</dt><dd>' + account.quantity.toLocaleString('ko-KR') + '토큰</dd></div><div><dt>투자금액</dt><dd>' + cash(account.costBasis) + '</dd></div><div><dt>평가금액</dt><dd>' + cash(account.marketValue) + '</dd></div><div><dt>평가수익</dt><dd class="' + changeClass(account.profit) + '">' + cash(account.profit) + ' (' + rate(account.returnPercent) + ')</dd></div><div><dt>누적 실현수익</dt><dd>' + cash(account.realizedProfit) + '</dd></div></dl><h3 class="iv-orders-heading">최근 거래</h3>' +
                (rows.length ? '<ol class="iv-orders-list">' + rows.map(row => '<li><div><strong class="' + (row.side === 'buy' ? 'iv-up' : 'iv-down') + '">' + (row.side === 'buy' ? '구매' : '판매') + ' ' + row.quantity.toLocaleString('ko-KR') + '토큰</strong><time>' + new Date(row.executedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + '</time></div><strong>' + cash(row.total) + '</strong></li>').join('') + '</ol>' : '<p class="iv-book-notice">아직 거래 내역이 없어요.</p>');
        }
        const note = $('investment-trade-note'), controls = $('investment-order-controls'), amount = $('investment-order-total');
        if (!note || !controls) return;
        const stock = context.selected === 'en-joy', qty = quantity(), valid = Number.isSafeInteger(qty) && qty >= 1 && qty <= 1000000;
        controls.hidden = !stock;
        const available = !!uid && !!account && market?.tradingEnabled === true && !market.stale && estimatedTime() < market.nextUpdateAt && open() && !busy && !pending && valid && Number.isSafeInteger(price() * qty);
        const buy = $('investment-buy'), sell = $('investment-sell'), retry = $('investment-order-retry');
        if (buy) buy.disabled = !available || account.points < price() * qty;
        if (sell) sell.disabled = !available || account.quantity < qty;
        if (retry) { retry.hidden = !pending; retry.disabled = busy; }
        if (amount) amount.textContent = valid && price() ? '예상 거래금액 ' + cash(price() * qty) : '수량을 확인해 주세요';
        if (stock) note.textContent = busy ? '주문을 처리하고 있어요' : pending ? '처리 결과를 확인하지 못했어요. 같은 주문으로 다시 확인해 주세요.' : message || error ||
            (!uid ? '로그인 후 거래할 수 있어요' : !account ? '투자 기록을 불러오는 중이에요' : !open() ? '운영시간 00:00~23:30' : market?.tradingEnabled ? '표시된 공통 시세로 체결돼요 · 수수료 없음' : '현재 거래를 이용할 수 없어요');
    }
    function schedule() {
        clearTimeout(timer); timer = null;
        if (uid && context.active && !document.hidden) timer = setTimeout(() => refresh(true), 30000);
    }
    async function refresh(force = false) {
        switchAccount();
        if (busy || !uid || !context.active || document.hidden || typeof fetch !== 'function' || !window.getEnjoyIdToken) { render(); return; }
        if (request) return request;
        if (!force && Date.now() - lastRead < 1000) { render(); schedule(); return; }
        const version = epoch, owner = uid, readId = ++generation;
        request = (async () => {
            try {
                const [nextAccount, nextRanking] = await Promise.all([call('/account'), call('/ranking')]);
                if (version !== epoch || owner !== currentUid() || readId !== generation) return;
                if (nextAccount.uid !== owner || !Number.isSafeInteger(nextAccount.quantity) || !Array.isArray(nextAccount.orders) || !Array.isArray(nextRanking.rows)) throw new Error('투자 응답을 확인하지 못했어요.');
                account = nextAccount; ranking = nextRanking; lastRead = Date.now(); error = '';
            } catch (e) {
                if (version === epoch && owner === currentUid() && readId === generation) error = e.message || '투자 기록 연결이 지연되고 있어요.';
            } finally { if (version === epoch && readId === generation) { request = null; render(); schedule(); } }
        })();
        return request;
    }
    async function submit(side, retry = false) {
        switchAccount();
        if (busy || !uid || (!retry && pending)) return;
        const owner = uid, version = epoch;
        if (!retry) {
            const qty = quantity(), quote = price();
            if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000000 || !quote || !account || market?.tradingEnabled !== true) return;
            const input = { requestId: crypto.randomUUID(), symbol: 'en-joy', side, quantity: qty,
                expectedRevision: market.revision, expectedPrice: quote, expiresAt: Math.floor(estimatedTime() + 60000) };
            const confirmed = await window.enjoyConfirm?.('엔조이스튜디오 ' + qty.toLocaleString('ko-KR') + '토큰을 ' + cash(qty * quote) + '에 ' + (side === 'buy' ? '구매' : '판매') + '할까요?',
                { title: side === 'buy' ? '드롭 구매' : '드롭 판매', confirmText: side === 'buy' ? '구매하기' : '판매하기' });
            if (!confirmed || version !== epoch || owner !== currentUid() || pending) return;
            pending = input;
            if (!savePending()) { pending = null; error = '주문 확인 정보를 저장할 수 없어요. 브라우저 저장소 설정을 확인해 주세요.'; render(); return; }
        }
        if (!pending) return;
        busy = true; generation++; request = null; error = message = ''; render();
        try {
            const result = await call('/orders', pending);
            if (version !== epoch || owner !== currentUid()) return;
            if (result.order?.requestId !== pending.requestId) throw new Error('주문 결과를 확인하지 못했어요.');
            pending = null; savePending();
            message = (result.order.side === 'buy' ? '구매' : '판매') + '가 완료됐어요. ' + result.order.quantity.toLocaleString('ko-KR') + '토큰 · ' + cash(result.order.total);
            account = null; lastRead = 0;
        } catch (e) {
            if (version !== epoch || owner !== currentUid()) return;
            error = e.message || '주문 결과를 확인하지 못했어요.';
            // Only definite validation failures clear the receipt ID. Network/5xx
            // failures retain it across reload so retries cannot spend twice.
            if (e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status) && e.code !== 'request-conflict') { pending = null; savePending(); }
            if (e.code === 'quote-changed') await window.refreshInvestmentMarket?.();
        } finally {
            if (version === epoch && owner === currentUid()) { busy = false; render(); await refresh(true); }
        }
    }
    function mount() {
        const tab = $('investment-holdings-tab');
        if (tab) { tab.disabled = false; tab.dataset.tab = 'holdings'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'investment-holdings-panel'); }
        root.addEventListener('input', event => { if (event.target.id === 'investment-order-quantity') render(); });
        root.addEventListener('click', event => {
            const button = event.target.closest('button[data-investment-action]');
            if (!button || button.disabled) return;
            const action = button.dataset.investmentAction;
            if (action === 'retry') submit(null, true);
            else if (action === 'reload') refresh(true);
            else if (action === 'buy' || action === 'sell') submit(action);
        });
        render();
    }
    window.enjoyInvestmentPortfolio = {
        mount, render, refresh, snapshot: () => account,
        updateMarket(data) { market = { ...data, receivedAt: Date.now() }; render(); if (context.active) refresh(true); },
        setActive(active) { context.active = active; render(); if (active) refresh(); else { clearTimeout(timer); timer = null; } }
    };
    window.addEventListener('enjoy-auth-ready', () => { switchAccount(); render(); refresh(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); timer = null; } else refresh(true); });
})();
