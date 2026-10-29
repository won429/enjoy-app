(function () {
    'use strict';
    const root = document.getElementById('wallet-panel-investment');
    if (!root) return;
    const $ = id => document.getElementById(id);
    const api = (window.ENJOY_INVESTMENT_API || 'https://enjoy-investment.sungwon4867.workers.dev').replace(/\/$/, '');
    const icon = name => '<i class="fa-solid fa-' + name + '" aria-hidden="true"></i>';
    let data = {}, side = null, qty = '', limit = null, method = 'price', book = null, bookError = false, bookRequest = null, bookVersion = 0;
    let mounted = false, origin = 'buy';
    const quote = () => data.market?.quotes?.find(item => item.id === 'en-joy');
    const cash = (value, currency = data.context?.currency) => Number.isFinite(value)
        ? (currency === 'KRW' ? value / 100 : value).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + (currency === 'KRW' ? '원' : ' P') : '—';
    const loadingValue = shape => '<span class="iv-skeleton iv-ticket-skeleton-' + shape + '" aria-hidden="true"></span><span class="iv-sr-only">불러오는 중</span>';
    const rate = value => Number.isFinite(value) ? (value > 0 ? '+' : '') + value.toFixed(2) + '%' : '—';
    const color = value => value > 0 ? 'iv-up' : value < 0 ? 'iv-down' : 'iv-flat';
    const quantity = () => /^\d+$/.test(qty) && Number.isSafeInteger(Number(qty)) && Number(qty) <= 1000000 ? Number(qty) : 0;
    const validPrice = value => Number.isSafeInteger(value) && value > 0;
    const orderPrice = () => method === 'price' ? limit : quote()?.price;
    const amount = () => validPrice(orderPrice()) && Number.isSafeInteger(orderPrice() * quantity()) ? orderPrice() * quantity() : 0;
    const currentTime = () => data.market ? data.market.serverTime + Math.max(0, Date.now() - data.market.receivedAt) : Date.now();
    const locked = () => data.market?.tradingEnabled !== true || data.market?.stale || !validPrice(quote()?.price) || !Number.isFinite(data.market?.nextUpdateAt) || currentTime() >= data.market.nextUpdateAt || (currentTime() + 9 * 3600000) % 86400000 >= 23.5 * 3600000;
    function close(restore = true, pointer = false) {
        const dialog = $('investment-trade-ticket');
        const finishTransition = restore && dialog?.open ? window.beginEnjoyMenuTransition?.(dialog, $('investment-detail'), 39) : null;
        side = null; qty = ''; bookVersion++; bookRequest?.abort(); bookRequest = null;
        dismissNotice();
        if (dialog?.open) dialog.close();
        if (dialog) dialog.hidden = true;
        if (finishTransition) Promise.resolve(finishTransition()).then(() => { if (dialog.hidden) dialog.innerHTML = ''; });
        else if (dialog) dialog.innerHTML = '';
        if (restore) {
            const trigger = $('investment-' + origin);
            if (pointer) trigger?.blur?.();
            else trigger?.focus?.({ preventScroll: true });
        }
    }
    function dismissNotice() {
        const dialog = $('investment-ticket-notice');
        if (dialog?.open) dialog.close();
        if (dialog) dialog.hidden = true;
    }
    function notice(title, description) {
        const dialog = $('investment-ticket-notice');
        if (!dialog) return;
        $('investment-ticket-notice-title').textContent = title;
        $('investment-ticket-notice-description').textContent = description;
        dialog.hidden = false;
        if (!dialog.open) dialog.showModal();
        $('investment-ticket-notice-ok')?.focus?.({ preventScroll: true });
    }
    function markup() {
        return `<header class="iv-ticket-header"><button type="button" class="iv-back" data-ticket-action="close" aria-label="주문 화면 닫기">${icon('chevron-left')}</button><div><h2 id="investment-ticket-name" tabindex="-1" autofocus>엔조이스튜디오</h2><strong id="investment-ticket-quote"></strong></div><button type="button" class="iv-ticket-layout" data-ticket-action="layout" aria-label="호가 영역 숨기기" aria-pressed="false">${icon('table-columns')}</button></header>
        <div class="iv-ticket-method-row"><details id="investment-ticket-method-menu"><summary>주문 방법 바꾸기</summary><div><button type="button" data-ticket-method="price">구매할 가격</button><button type="button" data-ticket-method="current">현재가</button><button type="button" data-ticket-method="market">시장가</button></div></details></div>
        <div class="iv-ticket-body"><aside class="iv-ticket-book" aria-label="주문 호가"><div id="investment-ticket-levels" class="iv-ticket-levels"></div><div class="iv-ticket-strength"><span>체결강도<strong>—</strong></span><button type="button" data-ticket-action="executions" aria-expanded="false" aria-label="체결 내역 보기">${icon('chevron-up')}</button></div><p id="investment-ticket-executions" hidden>아직 체결 내역이 없어요</p></aside>
        <section class="iv-ticket-entry" aria-label="주문 입력"><div class="iv-ticket-side" role="tablist" aria-label="주문 구분"><button type="button" data-ticket-side="buy" role="tab">구매</button><button type="button" data-ticket-side="sell" role="tab">판매</button><button type="button" data-ticket-side="pending" role="tab">대기</button></div>
        <div id="investment-ticket-pending" class="iv-ticket-pending" hidden><strong>대기 주문</strong><p id="investment-ticket-pending-message">대기 중인 주문이 없어요</p></div>
        <div id="investment-ticket-form" class="iv-ticket-form"><div class="iv-ticket-fields"><section class="iv-ticket-card iv-ticket-price-card"><div class="iv-ticket-card-heading"><label for="investment-ticket-price" id="investment-ticket-price-label">구매할 가격</label><button type="button" data-ticket-method="current">현재가</button><button type="button" data-ticket-method="market">시장가</button></div><div class="iv-ticket-stepper"><div id="investment-ticket-price-field" class="iv-ticket-price-input"><span id="investment-ticket-price-skeleton" class="iv-skeleton iv-ticket-skeleton-input" aria-hidden="true" hidden></span><input id="investment-ticket-price" inputmode="decimal" type="text" autocomplete="off" aria-label="토큰당 주문 가격"><span id="investment-ticket-price-unit"></span></div><button type="button" data-ticket-action="price-minus" aria-label="가격 낮추기">${icon('minus')}</button><button type="button" data-ticket-action="price-plus" aria-label="가격 높이기">${icon('plus')}</button></div></section>
        <section class="iv-ticket-card iv-ticket-quantity-card"><div class="iv-ticket-card-heading"><label for="investment-ticket-quantity">수량</label><button type="button" data-ticket-action="fractional">소수점</button></div><div class="iv-ticket-stepper"><input id="investment-ticket-quantity" type="text" inputmode="numeric" autocomplete="off" placeholder="수량 입력" aria-label="주문 수량" aria-describedby="investment-ticket-status"><button type="button" data-ticket-action="quantity-minus" aria-label="수량 줄이기">${icon('minus')}</button><button type="button" data-ticket-action="quantity-plus" aria-label="수량 늘리기">${icon('plus')}</button></div><div class="iv-ticket-percentages" role="group" aria-label="주문 가능 수량 비율"><button type="button" data-ticket-percent="10">10%</button><button type="button" data-ticket-percent="25">25%</button><button type="button" data-ticket-percent="50">50%</button><button type="button" data-ticket-percent="100">최대</button></div></section>
        <dl class="iv-ticket-funds"><div><dt id="investment-ticket-available-label">구매가능 금액</dt><dd id="investment-ticket-available"></dd></div><div class="iv-ticket-muted"><dt>포인트</dt><dd id="investment-ticket-points"></dd></div><div class="iv-ticket-muted"><dt>원화</dt><dd id="investment-ticket-won"></dd></div></dl>
        <dl class="iv-ticket-estimates"><div><dt>내 드롭 평균</dt><dd id="investment-ticket-average"></dd></div><div><dt id="investment-ticket-after-average-label">구매 후 예상 평균</dt><dd id="investment-ticket-after-average"></dd></div></dl><dl class="iv-ticket-estimates"><div><dt>현재 수익</dt><dd id="investment-ticket-profit"></dd></div><div><dt id="investment-ticket-after-profit-label">구매 후 예상 수익</dt><dd id="investment-ticket-after-profit"></dd></div></dl><p id="investment-ticket-status" class="iv-ticket-status" role="status" aria-live="polite"></p><button type="button" id="investment-ticket-retry" class="iv-ticket-retry" data-ticket-action="retry" hidden>같은 주문으로 결과 확인</button>
        </div><footer class="iv-ticket-submit-area"><span>총 주문 금액</span><strong id="investment-ticket-total">0 P</strong><button type="button" id="investment-ticket-submit" data-ticket-action="submit">구매하기</button></footer></div></section></div>
        <footer class="iv-ticket-market-totals"><div class="iv-ticket-market-bars" aria-hidden="true"><span></span><span></span></div><div><span>판매대기 <strong id="investment-ticket-total-ask">—</strong></span><small>드롭 시장</small><span><strong id="investment-ticket-total-bid">—</strong> 구매대기</span></div></footer>`;
    }
    function renderLevels() {
        const levels = $('investment-ticket-levels');
        if (!levels || !side) return;
        if (!book || book.asOf !== data.market?.asOf) {
            const waiting = !bookError && (!!data.context?.quoteLoading || !!bookRequest || Number.isSafeInteger(data.market?.asOf));
            levels.setAttribute('aria-busy', String(waiting));
            levels.innerHTML = !waiting ? '<p class="iv-ticket-book-error">호가를 불러오지 못했어요<button type="button" data-ticket-action="book-retry">다시 불러오기</button></p>' : '<div class="iv-ticket-book-loading" role="status"><span class="iv-sr-only">호가를 불러오는 중이에요</span>' + '<span class="iv-skeleton"></span>'.repeat(11) + '</div>';
            return;
        }
        levels.setAttribute('aria-busy', 'false');
        const row = (level, current, isAsk) => {
            const change = (level.price - book.previous) / book.previous * 100;
            return '<button type="button" class="iv-ticket-level ' + (current ? 'iv-ticket-level-current ' : '') + (isAsk ? 'iv-ticket-level-ask' : 'iv-ticket-level-bid') + '" data-ticket-price="' + level.price + '" aria-label="토큰당 ' + cash(level.price) + ' 선택"><span class="' + color(change) + '"><strong>' + cash(level.price) + '</strong><small>' + rate(change) + '</small></span><span class="iv-ticket-depth"><span style="width:' + Math.max(0, Math.min(100, level.quantity / Math.max(1, ...book.asks.concat(book.bids).map(item => item.quantity)) * 100)) + '%"></span><strong>' + level.quantity.toLocaleString('ko-KR') + '</strong></span></button>';
        };
        levels.innerHTML = book.asks.map(level => row(level, false, true)).join('') + row({ price: book.price, quantity: 0 }, true, false) + book.bids.map(level => row(level, false, false)).join('');
        $('investment-ticket-total-ask').textContent = book.totalAsk.toLocaleString('ko-KR');
        $('investment-ticket-total-bid').textContent = book.totalBid.toLocaleString('ko-KR');
    }
    async function loadBook() {
        if (!side || bookRequest || !data.market || !Number.isSafeInteger(data.market.asOf)) return;
        if (book?.asOf === data.market.asOf && !bookError) { renderLevels(); return; }
        const version = ++bookVersion, asOf = data.market.asOf, controller = new AbortController();
        bookRequest = controller; bookError = false; renderLevels();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(api + '/orderbook?symbol=en-joy', { cache: 'no-store', credentials: 'omit', signal: controller.signal });
            if (!response.ok) throw new Error('book');
            const result = await response.json();
            const validLevels = rows => Array.isArray(rows) && rows.length <= 5 && rows.every(row => validPrice(row.price) && Number.isSafeInteger(row.quantity) && row.quantity >= 0);
            if (result.symbol !== 'en-joy' || result.asOf !== asOf || !validPrice(result.price) || !validPrice(result.previous) || !validLevels(result.asks) || !validLevels(result.bids) || !Number.isSafeInteger(result.totalAsk) || result.totalAsk < 0 || !Number.isSafeInteger(result.totalBid) || result.totalBid < 0) throw new Error('book');
            if (side && version === bookVersion && data.market.asOf === asOf) { book = result; renderLevels(); }
        } catch (_) { if (side && version === bookVersion) { bookError = true; renderLevels(); } }
        finally { clearTimeout(timeout); if (bookRequest === controller) bookRequest = null; }
    }
    function render() {
        if (!side) return;
        const dialog = $('investment-trade-ticket'), q = quote(), account = data.account;
        dialog.setAttribute('data-side', side);
        root.querySelectorAll?.('[data-ticket-side]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.ticketSide === side)));
        const profitRate = Number.isFinite(q?.percent) ? q.percent : book && q ? (q.price - book.previous) / book.previous * 100 : null;
        $('investment-ticket-quote').textContent = cash(q?.price) + (profitRate === null ? '' : ' ' + (profitRate > 0 ? '+' : '') + profitRate.toFixed(1) + '%');
        $('investment-ticket-quote').className = color(profitRate);
        const quoteLoading = !!data.context?.quoteLoading;
        $('investment-ticket-quote').setAttribute('aria-busy', String(quoteLoading));
        if (quoteLoading) $('investment-ticket-quote').innerHTML = loadingValue('quote');
        $('investment-ticket-price-field').setAttribute('aria-busy', String(quoteLoading));
        $('investment-ticket-price-skeleton').hidden = !quoteLoading;
        $('investment-ticket-price').disabled = quoteLoading;
        root.querySelectorAll?.('[data-ticket-action="price-minus"], [data-ticket-action="price-plus"], [data-ticket-method]').forEach(button => { button.disabled = quoteLoading; });
        root.querySelectorAll?.('[data-ticket-percent]').forEach(button => { button.disabled = !!data.accountLoading || !account || quoteLoading || !validPrice(orderPrice()); });
        $('investment-ticket-form').hidden = side === 'pending';
        $('investment-ticket-pending').hidden = side !== 'pending';
        $('investment-ticket-pending-message').textContent = data.pending ? '처리 결과를 확인 중인 주문이 있어요. 주문 화면을 닫고 같은 주문으로 결과를 확인해 주세요.' : '대기 중인 주문이 없어요';
        const selling = side === 'sell', label = selling ? '판매' : '구매';
        $('investment-ticket-price-label').textContent = label + '할 가격';
        $('investment-ticket-available-label').textContent = selling ? '판매가능 수량' : '구매가능 금액';
        $('investment-ticket-available').textContent = account ? selling ? account.quantity.toLocaleString('ko-KR') + '토큰' : cash(account.points) : '—';
        $('investment-ticket-points').textContent = cash(account?.points, 'POINTS');
        $('investment-ticket-won').textContent = cash(account?.points, 'KRW');
        const avg = account?.quantity ? account.costBasis / account.quantity : null;
        $('investment-ticket-average').textContent = cash(avg);
        $('investment-ticket-profit').textContent = account ? (account.profit > 0 ? '+' : '') + cash(account.profit) + ' (' + rate(account.returnPercent) + ')' : '—';
        $('investment-ticket-profit').className = color(account?.profit);
        const n = quantity(), afterQuantity = (account?.quantity || 0) + (selling ? -n : n);
        const cost = selling ? avg * afterQuantity : (account?.costBasis || 0) + amount();
        const estimate = account && n && afterQuantity > 0 && validPrice(orderPrice());
        $('investment-ticket-after-average-label').textContent = label + ' 후 예상 평균';
        $('investment-ticket-after-average').textContent = estimate ? cash(cost / afterQuantity) : '—';
        $('investment-ticket-after-profit-label').textContent = label + ' 후 예상 수익';
        const afterProfit = estimate ? q?.price * afterQuantity - cost : null;
        $('investment-ticket-after-profit').textContent = Number.isFinite(afterProfit) ? (afterProfit > 0 ? '+' : '') + cash(afterProfit) : '—';
        $('investment-ticket-after-profit').className = color(afterProfit);
        $('investment-ticket-total').textContent = cash(amount());
        for (const id of ['available', 'points', 'won', 'average', 'profit', 'after-average', 'after-profit']) {
            const field = $('investment-ticket-' + id);
            field.setAttribute('aria-busy', String(!!data.accountLoading));
            if (data.accountLoading) field.innerHTML = loadingValue('value');
        }
        $('investment-ticket-total').setAttribute('aria-busy', String(quoteLoading && n > 0));
        if (quoteLoading && n > 0) $('investment-ticket-total').innerHTML = loadingValue('quote');
        $('investment-ticket-submit').textContent = data.busy ? '처리 중' : label + '하기';
        $('investment-ticket-submit').disabled = !!data.busy || !!data.pending;
        $('investment-ticket-price-unit').textContent = data.context?.currency === 'KRW' ? '원' : 'P';
        $('investment-ticket-price').readOnly = method !== 'price';
        if (document.activeElement !== $('investment-ticket-price')) $('investment-ticket-price').value = validPrice(orderPrice()) ? (data.context?.currency === 'KRW' ? orderPrice() / 100 : orderPrice()).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '';
        $('investment-ticket-price').style?.setProperty('--iv-ticket-price-length', Math.max(1, String($('investment-ticket-price').value).length));
        if (document.activeElement !== $('investment-ticket-quantity')) $('investment-ticket-quantity').value = qty;
        root.querySelectorAll?.('[data-ticket-method]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ticketMethod === method)));
        $('investment-ticket-status').textContent = data.busy ? '주문 결과를 확인하고 있어요' : data.pending ? '처리 결과를 확인하지 못했어요. 같은 주문으로 다시 확인해 주세요.' : data.error || '';
        $('investment-ticket-retry').hidden = !data.pending;
        $('investment-ticket-retry').disabled = !!data.busy;
    }
    function open(sideToOpen) {
        if (data.context?.selected !== 'en-joy' || data.busy || data.pending) return;
        origin = sideToOpen; side = sideToOpen; qty = ''; limit = quote()?.price ?? null; method = 'price';
        const dialog = $('investment-trade-ticket');
        const finishTransition = window.beginEnjoyMenuTransition?.($('investment-detail'), dialog, 39, $('wallet-scroll'));
        dialog.innerHTML = markup(); dialog.setAttribute('data-book-hidden', 'false'); dialog.hidden = false;
        render(); renderLevels();
        if (!dialog.open) dialog.showModal();
        sizeToKeyboard();
        // Keep the mobile keyboard closed until the user explicitly chooses an input.
        dialog.querySelector('#investment-ticket-name')?.focus?.({ preventScroll: true });
        finishTransition?.();
        loadBook();
    }
    async function submit() {
        if (!side || side === 'pending' || data.busy || data.pending) return;
        if (locked()) { notice('지금은 거래가 잠겨 있어요', '주문 화면은 미리 볼 수 있지만, 실제 구매와 판매는 아직 이용할 수 없어요.'); return; }
        if (!data.uid || !data.account) { notice('투자 기록을 확인해 주세요', '로그인 후 투자 기록을 불러오면 주문할 수 있어요.'); return; }
        const n = quantity();
        if (!n) { notice('수량을 입력해 주세요', '1토큰 이상, 1,000,000토큰 이하의 정수로 입력해 주세요.'); return; }
        if (!validPrice(orderPrice()) || orderPrice() !== quote()?.price) { notice('현재가로 주문해 주세요', '지금은 표시된 공통 시세로만 거래할 수 있어요.'); return; }
        if (side === 'buy' && amount() > data.account.points || side === 'sell' && n > data.account.quantity) { notice('주문 가능 수량을 확인해 주세요', '보유 포인트 또는 토큰 수량을 초과했어요.'); return; }
        await window.enjoyInvestmentPortfolio?.placeOrder(side, n);
    }
    function sizeToKeyboard() {
        const viewport = window.visualViewport;
        if (!side || !viewport) return;
        $('investment-trade-ticket').style.setProperty('--iv-ticket-height', viewport.height + 'px');
        $('investment-trade-ticket').style.setProperty('--iv-ticket-top', viewport.offsetTop + 'px');
    }
    function mount() {
        if (mounted) return; mounted = true;
        window.visualViewport?.addEventListener('resize', sizeToKeyboard);
        window.visualViewport?.addEventListener('scroll', sizeToKeyboard);
        root.addEventListener('input', event => {
            if (event.target.id === 'investment-ticket-quantity') { qty = event.target.value; render(); }
            if (event.target.id === 'investment-ticket-price') {
                const raw = Number(event.target.value.replaceAll(',', ''));
                limit = data.context?.currency === 'KRW' ? Math.round(raw * 100) : raw;
                method = 'price'; render();
            }
        });
        root.addEventListener('click', event => {
            const button = event.target.closest('button[data-ticket-action],button[data-ticket-side],button[data-ticket-method],button[data-ticket-percent],button[data-ticket-price]');
            if (!button || button.disabled) return;
            const action = button.dataset.ticketAction;
            if (action === 'close') { close(true, event.detail > 0); return; }
            if (action === 'notice-close') { dismissNotice(); return; }
            if (!side) return;
            if (action === 'submit') { submit(); return; }
            if (action === 'retry') { window.enjoyInvestmentPortfolio?.retryOrder(); return; }
            if (button.dataset.ticketSide) side = button.dataset.ticketSide;
            if (button.dataset.ticketMethod) { method = button.dataset.ticketMethod; if (method === 'price') limit = quote()?.price; $('investment-ticket-method-menu').open = false; }
            if (button.dataset.ticketPrice) { limit = Number(button.dataset.ticketPrice); method = 'price'; }
            if (button.dataset.ticketPercent) {
                const capacity = side === 'sell' ? data.account?.quantity || 0 : validPrice(orderPrice()) ? Math.floor((data.account?.points || 0) / orderPrice()) : 0;
                qty = String(Math.min(1000000, Math.floor(capacity * Number(button.dataset.ticketPercent) / 100)));
            }
            if (action === 'quantity-minus' || action === 'quantity-plus') qty = String(Math.max(0, Math.min(1000000, quantity() + (action === 'quantity-plus' ? 1 : -1))));
            if (action === 'price-minus' || action === 'price-plus') { limit = Math.max(1, (orderPrice() || 1) + (action === 'price-plus' ? 1 : -1)); method = 'price'; }
            if (action === 'fractional') { notice('토큰 단위로 주문해요', '드롭은 소수점 없이 1토큰 단위로 구매하거나 판매할 수 있어요.'); return; }
            if (action === 'book-retry') { if (data.market) loadBook(); else window.refreshInvestmentMarket?.(); }
            if (action === 'layout') {
                const dialog = $('investment-trade-ticket'), hidden = dialog.getAttribute('data-book-hidden') !== 'true';
                dialog.setAttribute('data-book-hidden', String(hidden)); button.setAttribute('aria-pressed', String(hidden)); button.setAttribute('aria-label', hidden ? '호가 영역 표시하기' : '호가 영역 숨기기');
            }
            if (action === 'executions') { const details = $('investment-ticket-executions'); details.hidden = !details.hidden; button.setAttribute('aria-expanded', String(!details.hidden)); }
            render();
        });
        $('investment-trade-ticket')?.addEventListener('cancel', event => { event.preventDefault(); close(); });
        $('investment-ticket-notice')?.addEventListener('cancel', event => { event.preventDefault(); dismissNotice(); });
    }
    window.enjoyInvestmentTicket = {
        mount, open, close,
        update(next) {
            const ownerChanged = data.uid !== undefined && data.uid !== next.uid;
            const oldAsOf = data.market?.asOf, oldQuoteLoading = data.context?.quoteLoading;
            data = next;
            if (ownerChanged || !data.context?.active || data.context?.selected !== 'en-joy') { close(false); return; }
            if (!side) return;
            if (limit === null && validPrice(quote()?.price)) limit = quote().price;
            render();
            if (oldQuoteLoading !== data.context?.quoteLoading) renderLevels();
            if (oldAsOf !== data.market?.asOf) { bookVersion++; bookRequest?.abort(); bookRequest = null; book = null; renderLevels(); loadBook(); }
        },
        complete() { close(); },
        snapshot: () => ({ side, quantity: quantity(), price: orderPrice(), total: amount(), locked: locked() })
    };
})();
