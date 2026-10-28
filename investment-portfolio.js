(function () {
    'use strict';
    const root = document.getElementById('wallet-panel-investment');
    if (!root) return;
    const api = (window.ENJOY_INVESTMENT_API || 'https://enjoy-investment.sungwon4867.workers.dev').replace(/\/$/, '');
    const $ = id => document.getElementById(id);
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let uid = null, epoch = 0, account = null, ranking = null, market = null, pending = null, busy = false, lastRead = 0, error = '', message = '';
    let context = { currency: 'POINTS', selected: null, tab: 'chart', holdingView: 'value', active: false }, request = null, timer = null, generation = 0;
    let orderFilter = 'all', includeCancelled = false, calculatorOpen = false, orderSide = null;
    let calculatorPrice = '', calculatorQuantity = '';
    const currentUid = () => !window.isGuest && window.enjoyUser?.uid || null;
    const cash = value => context.currency === 'KRW'
        ? (value / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원'
        : Math.round(value).toLocaleString('ko-KR') + ' P';
    const signedCash = value => (value > 0 ? '+' : '') + cash(value);
    const rate = value => (value > 0 ? '+' : '') + value.toFixed(2) + '%';
    const changeClass = value => value > 0 ? 'iv-up' : value < 0 ? 'iv-down' : 'iv-flat';
    const preciseCash = (value, currency = context.currency) => (currency === 'KRW' ? value / 100 : value).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + (currency === 'KRW' ? '원' : ' P');
    const cancelled = row => ['cancelled', 'canceled'].includes(row.status);
    function renderCalculation() {
        const output = $('investment-calculator-result');
        if (!output || !account) return;
        const addedQuantity = Number(calculatorQuantity), enteredPrice = Number(calculatorPrice);
        const addedPrice = context.currency === 'KRW' ? Math.round(enteredPrice * 100) : enteredPrice;
        const addedCost = addedQuantity * addedPrice;
        const valid = calculatorPrice.trim() !== '' && enteredPrice > 0 && Math.abs(enteredPrice * (context.currency === 'KRW' ? 100 : 1) - addedPrice) < .000001 && Number.isSafeInteger(addedPrice) && Number.isSafeInteger(addedQuantity) && addedQuantity > 0 && addedQuantity <= 1000000 && Number.isSafeInteger(addedCost) && Number.isSafeInteger(account.costBasis + addedCost) && Number.isSafeInteger(account.quantity + addedQuantity);
        output.innerHTML = valid ? '<span>구매 후 1토큰 평균<strong>' + preciseCash((account.costBasis + addedCost) / (account.quantity + addedQuantity)) + '</strong></span><span>보유 수량<strong>' + (account.quantity + addedQuantity).toLocaleString('ko-KR') + '토큰</strong></span><span>추가 투자금<strong>' + cash(addedCost) + '</strong></span>' : '<p>구매 가격과 수량을 입력해 주세요.</p>';
    }
    function renderHoldings(holdings) {
        const active = document.activeElement;
        const focused = holdings.contains?.(active) && (active.id ? '#' + active.id : active.dataset.investmentFilter ? '[data-investment-filter="' + active.dataset.investmentFilter + '"]' : active.dataset.investmentAction ? '[data-investment-action="' + active.dataset.investmentAction + '"]' : null);
        if (!account) {
            holdings.innerHTML = '<p class="iv-book-notice">' + escape(!uid ? '로그인 후 확인해 주세요.' : error || '보유 내역을 불러오는 중이에요.') + '</p>';
            return;
        }
        const average = account.quantity ? account.costBasis / account.quantity : null;
        const rows = (account.orders || []).filter(row => (includeCancelled || !cancelled(row)) && (orderFilter === 'all' || row.side === orderFilter));
        holdings.innerHTML = '<section class="iv-holding-overview" aria-label="내 드롭 보유 현황"><div class="iv-average"><div><h3>1토큰 평균</h3><strong>' + (average === null ? '—' : preciseCash(average)) + '</strong><small>' + (average === null ? '아직 보유한 드롭이 없어요' : preciseCash(average, context.currency === 'KRW' ? 'POINTS' : 'KRW')) + '</small></div><button type="button" class="iv-calculator-toggle" data-investment-action="calculator" aria-expanded="' + calculatorOpen + '" aria-controls="investment-average-calculator">물타기 계산기</button></div>' +
            '<section id="investment-average-calculator" class="iv-average-calculator" aria-label="물타기 계산기"' + (calculatorOpen ? '' : ' hidden') + '><div class="iv-calculator-heading"><h4>물타기 계산기</h4><button type="button" data-investment-action="calculator-close" aria-label="계산기 닫기"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><p>추가 구매 후 평균 가격을 미리 계산해 보세요.</p><div class="iv-calculator-fields"><label>구매 가격 (' + (context.currency === 'KRW' ? '원' : 'P') + ')<input id="investment-calculator-price" type="number" inputmode="decimal" min="' + (context.currency === 'KRW' ? '0.01' : '1') + '" step="' + (context.currency === 'KRW' ? '0.01' : '1') + '" value="' + escape(calculatorPrice) + '"></label><label>구매 수량 (토큰)<input id="investment-calculator-quantity" type="number" inputmode="numeric" min="1" max="1000000" step="1" value="' + escape(calculatorQuantity) + '"></label></div><output id="investment-calculator-result" aria-live="polite"></output><small>계산 결과는 실제 주문에 반영되지 않아요.</small></section>' +
            '<dl class="iv-holdings-summary"><div><dt>보유 수량</dt><dd>' + account.quantity.toLocaleString('ko-KR') + '토큰</dd></div><div class="iv-holding-value"><dt>총 금액</dt><dd>' + cash(account.marketValue) + '<small class="' + changeClass(account.profit) + '">' + signedCash(account.profit) + ' (' + rate(account.returnPercent) + ')</small></dd></div><div><dt>투자 원금</dt><dd>' + cash(account.costBasis) + '</dd></div></dl></section>' +
            '<section class="iv-order-history" aria-labelledby="investment-orders-heading"><div class="iv-orders-toolbar"><h3 id="investment-orders-heading">주문내역</h3><button type="button" class="iv-cancelled-toggle" data-investment-action="cancelled" aria-pressed="' + includeCancelled + '"><i class="fa-' + (includeCancelled ? 'solid' : 'regular') + ' fa-circle-check" aria-hidden="true"></i> 취소 포함</button></div><div class="iv-order-filters" role="group" aria-label="주문내역 필터">' + [['all', '전체'], ['buy', '구매'], ['sell', '판매']].map(([value, label]) => '<button type="button" data-investment-filter="' + value + '" aria-pressed="' + (orderFilter === value) + '">' + label + '</button>').join('') + '</div><div aria-live="polite">' +
            (rows.length ? '<ol class="iv-orders-list">' + rows.map(row => '<li><div><strong class="' + (row.side === 'grant' ? 'iv-flat' : row.side === 'buy' ? 'iv-up' : 'iv-down') + '">' + (row.side === 'grant' ? '지급' : row.side === 'buy' ? '구매' : '판매') + ' ' + row.quantity.toLocaleString('ko-KR') + '토큰' + (cancelled(row) ? ' · 취소' : '') + '</strong><time datetime="' + new Date(row.executedAt).toISOString() + '">' + new Date(row.executedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + '</time></div><strong>' + (row.side === 'grant' ? '기준금액 ' + cash(row.total) : cash(row.total)) + '</strong></li>').join('') + '</ol>' : '<p class="iv-orders-empty">' + (orderFilter === 'all' ? '아직 주문내역이 없어요.' : (orderFilter === 'buy' ? '구매' : '판매') + ' 내역이 없어요.') + '</p>') + '</div></section>';
        renderCalculation();
        if (focused) holdings.querySelector(focused)?.focus({ preventScroll: true });
    }
    const pendingKey = id => 'enjoy_investment_pending_v1:' + id;
    function savePending() {
        try { if (pending) sessionStorage.setItem(pendingKey(uid), JSON.stringify(pending)); else sessionStorage.removeItem(pendingKey(uid)); return true; } catch (_) { return false; }
    }
    function switchAccount() {
        const next = currentUid();
        if (next === uid) return false;
        uid = next; epoch++; generation++; account = ranking = null; pending = null; error = message = ''; lastRead = 0; busy = false; request = null;
        orderFilter = 'all'; includeCancelled = calculatorOpen = false; orderSide = null; calculatorPrice = calculatorQuantity = '';
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
        const previous = context;
        if (next) context = { ...context, ...next };
        if (context.currency !== previous.currency) calculatorPrice = calculatorPrice === '' ? '' : String(Number(calculatorPrice) * (context.currency === 'KRW' ? .01 : 100));
        if (context.tab !== previous.tab || context.selected !== previous.selected) {
            orderSide = null; calculatorOpen = false;
            if ($('investment-order-quantity')) $('investment-order-quantity').value = '1';
        }
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
        if (summary) {
            summary.textContent = !uid ? '로그인 후 내 투자를 확인할 수 있어요' : !account ? error || '투자 기록을 불러오는 중이에요' :
                account.quantity ? signedCash(account.profit) + ' (' + rate(account.returnPercent) + ')' : '보유한 드롭이 없어요';
            summary.className = account?.quantity ? 'iv-portfolio-profit ' + changeClass(account.profit) : '';
        }
        const portfolio = $('investment-portfolio-list');
        if (portfolio) {
            portfolio.setAttribute('aria-busy', String(!!uid && !account && !error));
            if (!account || !account.quantity) portfolio.innerHTML = '<p class="iv-ranking-empty">' + escape(!uid ? '로그인 후 보유 토큰을 확인할 수 있어요.' : !account ? error || '보유 토큰을 불러오는 중이에요.' : '아직 보유한 토큰이 없어요.') + '</p>';
            else {
                const amount = context.holdingView === 'price' ? price() : account.marketValue;
                portfolio.innerHTML = '<div class="iv-portfolio-heading"><h2>보유 드롭</h2><span class="' + changeClass(account.profit) + '">' + rate(account.returnPercent) + '</span></div>' +
                    '<button type="button" class="iv-stock iv-portfolio-stock" data-stock="en-joy" aria-label="엔조이스튜디오 보유 토큰 상세 보기"><img src="assets/enjoy-symbol-rose.png" alt="" width="46" height="46"><span class="iv-stock-name"><strong>엔조이스튜디오</strong><small>' + account.quantity.toLocaleString('ko-KR') + '토큰</small></span><span class="iv-stock-price"><strong>' + (Number.isFinite(amount) ? cash(amount) : '—') + '</strong><small class="' + changeClass(account.profit) + '">' + signedCash(account.profit) + ' (' + rate(account.returnPercent) + ')</small></span></button>';
            }
        }
        if (account) {
            $('investment-account-points').textContent = account.points.toLocaleString('ko-KR') + ' P';
            $('investment-account-equivalent').textContent = '(= ' + (account.points / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원)';
            $('investment-account-equivalent').hidden = false;
        }
        const holdings = $('investment-holdings-panel');
        if (holdings) {
            holdings.hidden = context.tab !== 'holdings' || context.selected !== 'en-joy';
            renderHoldings(holdings);
        }
        const note = $('investment-trade-note'), controls = $('investment-order-controls'), amount = $('investment-order-total');
        if (!note || !controls) return;
        const stock = context.selected === 'en-joy', qty = quantity(), valid = Number.isSafeInteger(qty) && qty >= 1 && qty <= 1000000;
        const holdingsView = context.tab === 'holdings';
        controls.hidden = !stock || (holdingsView && !orderSide);
        const ticket = $('investment-order-ticket-heading');
        if (ticket) ticket.hidden = !stock || !holdingsView || !orderSide;
        const ticketTitle = $('investment-order-ticket-title');
        if (ticketTitle) ticketTitle.textContent = orderSide === 'sell' ? '드롭 판매' : '드롭 구매';
        const available = !!uid && !!account && market?.tradingEnabled === true && !market.stale && estimatedTime() < market.nextUpdateAt && open() && !busy && !pending && valid && Number.isSafeInteger(price() * qty);
        const buy = $('investment-buy'), sell = $('investment-sell'), retry = $('investment-order-retry');
        if (buy) { buy.hidden = holdingsView && orderSide === 'sell'; buy.textContent = holdingsView && orderSide === 'buy' ? '구매 확인' : '구매하기'; }
        if (sell) { sell.hidden = holdingsView && orderSide === 'buy'; sell.textContent = holdingsView && orderSide === 'sell' ? '판매 확인' : '판매하기'; }
        if (buy) buy.disabled = !available || account.points < price() * qty;
        if (sell) sell.disabled = !available || account.quantity < qty;
        if (retry) { retry.hidden = !pending; retry.disabled = busy; }
        if (amount) amount.textContent = valid && price() ? '예상 거래금액 ' + cash(price() * qty) : '수량을 확인해 주세요';
        note.className = holdingsView && !busy && !pending && !message && !error ? 'iv-sr-only' : '';
        if (stock) note.textContent = busy ? '주문을 처리하고 있어요' : pending ? '처리 결과를 확인하지 못했어요. 같은 주문으로 다시 확인해 주세요.' : message || error ||
            (!uid ? '로그인 후 거래할 수 있어요' : !account ? '투자 기록을 불러오는 중이에요' : !open() ? '운영시간 00:00~23:30' : market?.tradingEnabled ? '표시된 공통 시세로 체결돼요' : '현재 거래를 이용할 수 없어요');
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
            orderSide = null;
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
        root.addEventListener('input', event => {
            if (event.target.id === 'investment-order-quantity') render();
            else if (event.target.id === 'investment-calculator-price') { calculatorPrice = event.target.value; renderCalculation(); }
            else if (event.target.id === 'investment-calculator-quantity') { calculatorQuantity = event.target.value; renderCalculation(); }
        });
        root.addEventListener('click', event => {
            const button = event.target.closest('button[data-investment-action], button[data-investment-filter]');
            if (!button || button.disabled) return;
            if (['all', 'buy', 'sell'].includes(button.dataset.investmentFilter)) { orderFilter = button.dataset.investmentFilter; render(); return; }
            const action = button.dataset.investmentAction;
            if (action === 'retry') submit(null, true);
            else if (action === 'reload') refresh(true);
            else if (action === 'calculator' || action === 'calculator-close') {
                calculatorOpen = action === 'calculator' && !calculatorOpen;
                if (calculatorOpen && !calculatorPrice && price()) calculatorPrice = String(context.currency === 'KRW' ? price() / 100 : price());
                render();
                $(calculatorOpen ? 'investment-calculator-price' : 'investment-average-calculator')?.closest?.('.iv-holdings')?.querySelector(calculatorOpen ? '#investment-calculator-price' : '.iv-calculator-toggle')?.focus();
            }
            else if (action === 'cancelled') { includeCancelled = !includeCancelled; render(); }
            else if (action === 'order-close') { orderSide = null; $('investment-order-quantity').value = '1'; render(); }
            else if (action === 'buy' || action === 'sell') {
                if (context.tab === 'holdings' && orderSide !== action) { orderSide = action; render(); $('investment-order-quantity')?.focus?.(); }
                else submit(action);
            }
        });
        render();
    }
    window.enjoyInvestmentPortfolio = {
        mount, render, refresh, snapshot: () => account,
        reload() { generation++; request = null; lastRead = 0; return refresh(true); },
        updateMarket(data) { market = { ...data, receivedAt: Date.now() }; render(); if (context.active) refresh(true); },
        setActive(active) { context.active = active; render(); if (active) refresh(); else { clearTimeout(timer); timer = null; } }
    };
    window.addEventListener('enjoy-auth-ready', () => { switchAccount(); render(); refresh(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); timer = null; } else refresh(true); });
})();
