(function () {
    'use strict';
    const root = document.getElementById('wallet-panel-investment');
    if (!root) return;
    // Shared half-hour reference prices come only from Cloudflare. Per-device animation stays in memory.
    // Trading is closed: this module never writes balances, holdings or orders.
    const stocks = [
        { id: 'enjoy', name: '엔조이', ticker: 'ENJOY', kind: 'index', price: 100, change: 0, percent: 0, image: 'assets/enjoy-symbol-navy.png' },
        { id: 'en-joy', name: '엔조이스튜디오', ticker: 'enjoy studio', kind: 'stock', price: 100, change: 0, percent: 0, image: 'assets/enjoy-symbol-rose.png' }
    ];
    const pointsPerWon = 100;
    const state = { selected: null, currency: 'POINTS', period: 'day', tab: 'chart', quotePeriod: 'daily', chartType: 'line' };
    const marketApi = (window.ENJOY_INVESTMENT_API || 'https://enjoy-investment.sungwon4867.workers.dev').replace(/\/$/, '');
    const vlogClicks = new Map();
    let vlogClickHour = -1;
    window.recordEnjoyVlogClick = function (value, source) {
        let videoId = '';
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:') return;
            if (url.hostname === 'youtu.be') videoId = url.pathname.split('/')[1];
            else if (['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) videoId = url.searchParams.get('v') || /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1];
        } catch (_) { return; }
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !['latest','episode'].includes(source) || typeof fetch !== 'function') return;
        const hour = Math.floor(Date.now()/1_800_000);
        if (hour !== vlogClickHour) { vlogClicks.clear(); vlogClickHour = hour; }
        const key = hour + ':' + (window.enjoyUser?.uid || 'guest') + ':' + videoId;
        if (vlogClicks.has(key)) return vlogClicks.get(key);
        const pending = (async () => {
            let success = false, timer;
            try {
                const controller = new AbortController();
                timer = setTimeout(() => controller.abort(), 10000);
                const token = window.getEnjoyIdToken ? await window.getEnjoyIdToken(false) : null;
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers.Authorization = 'Bearer ' + token;
                const response = await fetch(marketApi + '/activity/click', { method: 'POST', credentials: 'omit', keepalive: true,
                    headers, body: JSON.stringify({ videoId, source }), signal: controller.signal });
                success = response.ok;
            } catch (_) {} finally {
                if (timer) clearTimeout(timer);
                if (!success) vlogClicks.delete(key);
            }
        })();
        vlogClicks.set(key, pending);
        return pending;
    };
    const feed = { ready: false, status: 'loading', asOf: 0, revision: -1, validUntil: 0, timer: null, pending: null, interval: 1_800_000, serverTime: 0, receivedAt: 0, nextUpdateAt: 0, histories: new Map(), historyErrors: new Set(), closes: new Map(), ticks: new Map(), books: new Map(), loading: new Map() };
    const motion = { timer: null, price: null, samples: [] };
    const chartInspection = { pointer: null, time: null, key: null, view: null };
    const pointAmount = amount => Math.round(amount).toLocaleString('ko-KR') + ' P';
    const wonAmount = amount => (amount / pointsPerWon).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원';
    const money = amount => state.currency === 'POINTS' ? pointAmount(amount) : wonAmount(amount);
    const displayQuote = stock => {
        if (stock.kind !== 'stock' || motion.price === null || marketClosed()) return stock;
        const price = motion.price, change = price - stock.previous;
        return { ...stock, price, change, percent: change / stock.previous * 100 };
    };
    const priceLabel = stock => feed.ready ? money(displayQuote(stock).price) : '—';
    const marketLoading = () => !feed.ready && feed.status === 'loading' && typeof fetch === 'function';
    const skeleton = size => '<span class="iv-skeleton iv-skeleton-' + size + '" aria-hidden="true"></span><span class="iv-sr-only">시세 불러오는 중</span>';
    const quoteMarkup = (value, size) => marketLoading() ? skeleton(size) : value;
    const trendClass = stock => stock.change > 0 ? 'iv-up' : stock.change < 0 ? 'iv-down' : 'iv-flat';
    const percentLabel = stock => (stock.percent > 0 ? '+' : '') + stock.percent.toFixed(1) + '%';
    const changeLabel = stock => feed.ready ? (stock.change > 0 ? '+' : stock.change < 0 ? '-' : '') + money(Math.abs(stock.change)) + ' (' + percentLabel(stock) + ')' : '—';
    const icon = name => '<i class="fa-solid fa-' + name + '" aria-hidden="true"></i>';
    const currencyControl = () => '<div class="iv-segment" role="group" aria-label="표시 단위"><button type="button" data-currency="KRW" aria-label="원화로 보기" aria-pressed="' + (state.currency === 'KRW') + '">원화</button><button type="button" data-currency="POINTS" aria-label="포인트로 보기" aria-pressed="' + (state.currency === 'POINTS') + '">포인트</button></div>';
    root.innerHTML = `
        <section id="investment-home" aria-label="투자 첫 화면">
            <header class="iv-top"><h1>엔조이증권</h1><span class="iv-market-heading"><span>운영시간 00:00~23:30</span><span id="market-home-status" class="iv-market-status">시세 연결 중</span></span></header>
            <div class="iv-account-heading"><img src="assets/enjoy-symbol.png" alt=""><strong id="investment-account-name">멤버 지갑</strong><span id="investment-account-status"></span></div>
            <div class="iv-balances"><div class="iv-balance"><span>보유 포인트</span><div class="iv-point-balance" aria-live="polite"><strong id="investment-account-points">—</strong><span id="investment-account-equivalent" class="iv-balance-equivalent" hidden></span></div><small>100포인트 = 1원</small></div></div>
            <section class="iv-summary" aria-label="내 투자"><h2>내 투자</h2><p class="iv-total" id="investment-total">0 P</p><small>보유한 주식이 없어요</small></section>
            <div class="iv-toolbar"><div id="investment-list-currency"></div></div>
            <div id="investment-index-list" class="iv-indices" role="region" aria-label="대표 지수"></div>
            <div id="investment-stock-list"></div>
            <section class="iv-ranking" aria-labelledby="investment-ranking-title">
                <div class="iv-ranking-heading"><h2 id="investment-ranking-title">투자 순위</h2><small>총 투자금액 순</small></div>
                <div id="investment-ranking"></div>
            </section>
        </section>
        <section id="investment-detail" class="iv-detail" aria-label="종목 상세" hidden>
            <div class="iv-detail-nav"><button class="iv-back" id="investment-back" type="button" aria-label="종목 목록으로 돌아가기">${icon('chevron-left')}</button><span class="iv-market-heading"><span>운영시간 00:00~23:30</span><span id="market-detail-status" class="iv-market-status">시세 연결 중</span></span></div>
            <div class="iv-detail-heading"><h2 id="investment-name" tabindex="-1"></h2><span class="iv-ticker" id="investment-ticker"></span></div>
            <div class="iv-quote"><p class="iv-price"><span id="investment-price"></span><small class="iv-secondary-price" id="investment-secondary-price"></small></p><div id="investment-detail-currency"></div></div>
            <p class="iv-change"><span id="investment-change-caption" style="margin-left:0">전일 대비</span><span id="investment-change"></span></p>
            <div class="iv-tabs" role="tablist" aria-label="종목 상세 메뉴"><button type="button" id="investment-chart-tab" role="tab" data-tab="chart" aria-controls="investment-chart-panel" aria-selected="true">차트</button><button type="button" id="investment-orderbook-tab" role="tab" data-tab="book" aria-controls="investment-orderbook-panel" aria-selected="false">호가</button><button type="button" id="investment-closes-tab" role="tab" data-tab="closes" aria-controls="investment-closes-panel" aria-selected="false">시세</button><button type="button" id="investment-holdings-tab" disabled>내 주식</button><button type="button" id="investment-info-tab" role="tab" data-tab="info" aria-controls="investment-info-panel" aria-selected="false">종목정보</button></div>
            <div id="investment-chart-panel" class="iv-chart-panel" role="tabpanel" aria-labelledby="investment-chart-tab"><p class="iv-chart-caption">${icon('circle-check')} <span id="investment-chart-caption">자세한 차트</span></p><div class="iv-chart-wrap"><canvas id="investment-chart" role="img" tabindex="0" aria-description="차트를 누른 채 좌우로 움직이거나 좌우 방향키로 시점별 가격을 확인하세요. Escape 키로 선택을 해제해요." aria-label="시세 차트"></canvas><div id="investment-chart-skeleton" class="iv-chart-skeleton" aria-hidden="true" hidden><span class="iv-skeleton iv-skeleton-chart-title"></span><span class="iv-skeleton iv-skeleton-chart-area"></span><span class="iv-skeleton-chart-axis"><span class="iv-skeleton"></span><span class="iv-skeleton"></span><span class="iv-skeleton"></span></span></div><span id="investment-chart-pulse" class="iv-chart-pulse" aria-hidden="true" hidden></span><output id="investment-chart-inspection" class="iv-chart-inspection" aria-live="off" hidden><span id="investment-chart-time"></span><strong id="investment-chart-value"></strong></output></div><div class="iv-periods" role="group" aria-label="차트 기간"><button type="button" data-period="day" aria-label="오늘" aria-pressed="true">오늘</button><button type="button" data-period="1d" aria-pressed="false">1일</button><button type="button" data-period="1w" aria-pressed="false">1주</button><button type="button" data-period="3m" aria-pressed="false">3달</button><button type="button" data-period="1y" aria-pressed="false">1년</button><button type="button" data-period="5y" aria-pressed="false">5년</button><button type="button" data-period="all" aria-pressed="false">전체</button><button type="button" id="investment-chart-type" class="iv-chart-type" data-chart-type="toggle" aria-label="캔들 차트로 전환" aria-pressed="false"><img src="assets/investment/chart-candle.png" alt="" width="28" height="28"></button></div></div>
            <div id="investment-orderbook-panel" class="iv-orderbook" role="tabpanel" aria-labelledby="investment-orderbook-tab" hidden></div>
            <div id="investment-closes-panel" class="iv-closes" role="tabpanel" aria-labelledby="investment-closes-tab" hidden></div>
            <div id="investment-info-panel" class="iv-info" role="tabpanel" aria-labelledby="investment-info-tab" hidden></div>
            <footer class="iv-trade"><div class="iv-trade-buttons" id="investment-trade-buttons"><button type="button" disabled>판매하기</button><button type="button" disabled>구매하기</button></div><p id="investment-trade-note">현재 거래가 잠겨 있어요</p></footer>
        </section>`;
    const $ = id => document.getElementById(id);
    const quotePrices = new Map();
    function stopQuotePrice(id) {
        const current = quotePrices.get(id);
        if (current?.animations) current.animations.forEach(animation => animation.cancel());
        quotePrices.delete(id);
    }
    function quoteDigits(label) {
        const parts = /^([\d,]+)(?:\.(\d+))?/.exec(label), digits = new Map();
        if (!parts) return digits;
        const integer = parts[1].replaceAll(',', '');
        [...integer].forEach((digit, index) => digits.set(integer.length - index - 1, digit));
        [...(parts[2] || '')].forEach((digit, index) => digits.set(-index - 1, digit));
        return digits;
    }
    function renderQuotePrice(element, stock) {
        const loading = marketLoading();
        element.setAttribute('aria-busy', String(loading));
        if (loading) {
            stopQuotePrice(element.id);
            element.innerHTML = skeleton('price');
            return;
        }
        const label = priceLabel(stock), value = feed.ready ? stock.price : null;
        const key = stock.id + ':' + state.currency, previous = quotePrices.get(element.id);
        if (previous?.key === key && previous.label === label && previous.element === element) return;
        stopQuotePrice(element.id);
        const current = { key, label, value, element, animations: [] };
        quotePrices.set(element.id, current);
        element.textContent = label;
        if (stock.kind !== 'stock' || previous?.key !== key || previous.value === null || value === null || previous.value === value ||
            document.hidden || !document.createElement || !element.replaceChildren || !element.getClientRects?.().length ||
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const probe = document.createElement('span');
        if (typeof probe.animate !== 'function') return;
        const oldDigits = quoteDigits(previous.label), integer = /^([\d,]+)/.exec(label)?.[1].replaceAll(',', '') || '';
        const fragment = document.createDocumentFragment(), rising = value > previous.value;
        const ink = window.getComputedStyle(element).color;
        let integerIndex = 0, fractionIndex = 0, fractional = false;
        for (const char of label) {
            if (char === '.') fractional = true;
            if (!/\d/.test(char)) { fragment.append(document.createTextNode(char)); continue; }
            const place = fractional ? -1 - fractionIndex++ : integer.length - 1 - integerIndex++;
            const old = oldDigits.get(place);
            if (old === char) { fragment.append(document.createTextNode(char)); continue; }
            const digit = document.createElement('span');
            digit.className = 'iv-price-digit'; digit.append(document.createTextNode(char));
            const viewport = document.createElement('span');
            viewport.className = 'iv-price-window'; viewport.setAttribute('aria-hidden', 'true');
            viewport.style.setProperty('--iv-price-ink', ink);
            const strip = document.createElement('span'); strip.className = 'iv-price-strip';
            const steps = old === undefined ? [' ', char] : [old];
            if (old !== undefined) {
                const distance = rising ? (Number(char) - Number(old) + 10) % 10 : (Number(old) - Number(char) + 10) % 10;
                for (let step = 1; step <= distance; step++) steps.push(String((Number(old) + (rising ? step : -step) + 10) % 10));
            }
            const ordered = rising ? steps : [...steps].reverse();
            ordered.forEach(text => { const step = document.createElement('span'); step.className = 'iv-price-step'; step.textContent = text; strip.append(step); });
            viewport.append(strip); digit.append(viewport); fragment.append(digit);
            const end = (steps.length - 1) * 100;
            const animation = strip.animate([
                { transform: 'translateY(' + (rising ? 0 : -end) + '%)' },
                { transform: 'translateY(' + (rising ? -end : 0) + '%)' }
            ], { duration: 650, easing: 'cubic-bezier(.22,.8,.18,1)', fill: 'both' });
            animation.id = 'iv-price-roll'; current.animations.push(animation);
        }
        element.replaceChildren(fragment);
        Promise.allSettled(current.animations.map(animation => animation.finished)).then(() => {
            if (quotePrices.get(element.id) !== current) return;
            element.textContent = label;
            current.animations.forEach(animation => animation.cancel()); current.animations = [];
        });
    }
    function refreshAccount() {
        const user = window.enjoyUser && !window.isGuest ? window.enjoyUser : null;
        const candidate = user && window.enjoyStoreMember ? window.enjoyStoreMember() : null;
        const member = candidate && candidate.uid === user.uid ? candidate : null;
        const rawPoints = member && Number(member.points);
        const points = Number.isFinite(rawPoints) ? Math.max(0, Math.floor(rawPoints)) : 0;
        $('investment-account-name').textContent = member ? (member.name || user.displayName || '멤버') + ' 지갑' : '멤버 지갑';
        $('investment-account-status').textContent = member ? '연결됨' : user ? '불러오는 중' : '로그인 필요';
        $('investment-account-points').textContent = member ? pointAmount(points) : '—';
        $('investment-account-equivalent').textContent = member ? '(= ' + wonAmount(points) + ')' : '';
        $('investment-account-equivalent').hidden = !member;
        renderRanking();
    }
    function renderRanking() {
        const panel = $('investment-ranking');
        const user = window.enjoyUser && !window.isGuest ? window.enjoyUser : null;
        if (!user) {
            panel.innerHTML = '<p class="iv-ranking-empty">로그인하면 멤버 투자 순위를 볼 수 있어요.</p>';
            return;
        }
        const members = window.enjoyJoinedMembers ? window.enjoyJoinedMembers() : [];
        const unique = new Map();
        for (const member of members) {
            if (member && typeof member.uid === 'string' && member.uid && typeof member.name === 'string' && member.name.trim()) {
                unique.set(member.uid, { uid: member.uid, name: member.name.trim() });
            }
        }
        const entries = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR') || a.uid.localeCompare(b.uid));
        if (!entries.length) {
            panel.innerHTML = '<p class="iv-ranking-empty">멤버 정보를 불러오면 순위가 표시돼요.</p>';
            return;
        }
        const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        // No member can hold stock while trading is closed. Wallet points are not invested capital.
        const rankLabel = entries.length > 1 ? '공동 1위' : '1위';
        panel.innerHTML = '<table class="iv-ranking-table" aria-label="멤버별 투자 순위"><colgroup><col class="iv-ranking-rank-col"><col><col class="iv-ranking-amount-col"><col class="iv-ranking-rate-col"></colgroup><thead><tr><th scope="col">순위</th><th scope="col">멤버</th><th scope="col">총 투자금액</th><th scope="col">등락률</th></tr></thead><tbody>' +
            entries.map(member => `<tr${member.uid === user.uid ? ' class="iv-ranking-self"' : ''}><td><span aria-label="${rankLabel}">1</span></td><th scope="row"><span class="iv-ranking-name">${escape(member.name)}</span>${member.uid === user.uid ? '<small class="iv-ranking-me">나</small>' : ''}</th><td>${money(0)}</td><td class="iv-flat">0.0%</td></tr>`).join('') +
            '</tbody></table><p class="iv-ranking-note">같은 투자금액은 공동 순위로 표시해요.</p>';
    }
    function renderList() {
        ['investment-index-list','investment-stock-list'].forEach(id => $(id).setAttribute('aria-busy', String(marketLoading())));
        $('investment-list-currency').innerHTML = currencyControl();
        $('investment-total').textContent = money(0);
        $('investment-index-list').innerHTML = stocks.filter(stock => stock.kind === 'index').map(stock => `<button type="button" class="iv-index" data-stock="${stock.id}" aria-label="${stock.name} 종목 상세 보기"><span class="iv-index-name"><small>지수</small><strong>${stock.name}</strong></span><strong class="iv-index-price">${quoteMarkup(priceLabel(stock), 'price')}</strong><small class="${trendClass(stock)}">${quoteMarkup(feed.ready ? percentLabel(stock) : '—', 'rate')}</small></button>`).join('');
        const listedStocks = stocks.filter(stock => stock.kind === 'stock');
        $('investment-stock-list').innerHTML = `<h2 class="iv-stocks-heading"><span>주식</span><small>${listedStocks.length}개 종목</small></h2>` + listedStocks.map(serverStock => { const stock = displayQuote(serverStock); return `<button type="button" class="iv-stock" data-stock="${stock.id}" aria-label="${stock.name} 종목 상세 보기"><img src="${stock.image}" alt="" width="46" height="46"><span class="iv-stock-name"><strong>${stock.name}</strong><small>주식 · 거래 잠김</small></span><span class="iv-stock-price"><strong id="investment-list-price-${stock.id}">${priceLabel(stock)}</strong><small id="investment-list-change-${stock.id}" class="${trendClass(stock)}">${quoteMarkup(changeLabel(stock), 'change')}</small></span></button>`; }).join('');
        listedStocks.forEach(stock => renderQuotePrice($('investment-list-price-' + stock.id), displayQuote(stock)));
        renderRanking();
    }
    function renderDetail() {
        const serverStock = stocks.find(item => item.id === state.selected);
        if (!serverStock) return;
        const stock = displayQuote(serverStock);
        $('investment-name').textContent = stock.name;
        $('investment-ticker').textContent = stock.ticker;
        renderQuotePrice($('investment-price'), stock);
        $('investment-secondary-price').textContent = feed.ready ? (state.currency === 'POINTS' ? wonAmount(stock.price) : pointAmount(stock.price)) : '';
        $('investment-detail-currency').innerHTML = currencyControl();
        $('investment-change').textContent = changeLabel(stock);
        $('investment-change').className = trendClass(stock);
        if (marketLoading()) {
            $('investment-secondary-price').innerHTML = skeleton('secondary');
            $('investment-change').innerHTML = skeleton('change');
        }
        $('investment-change').setAttribute('aria-busy', String(marketLoading()));
        $('investment-change-caption').textContent = '전일 대비';
        $('investment-chart-caption').textContent = stock.kind === 'stock' && state.period === 'day' ? '실선 기록 · 점선 화면 시세' : '자세한 차트';
        $('investment-info-tab').textContent = stock.kind === 'index' ? '지수정보' : '종목정보';
        $('investment-orderbook-tab').hidden = stock.kind === 'index';
        $('investment-holdings-tab').hidden = stock.kind === 'index';
        $('investment-trade-buttons').hidden = stock.kind === 'index';
        $('investment-trade-note').textContent = stock.kind === 'index' ? '엔조이는 시장 흐름을 나타내는 지수예요' : '현재 거래가 잠겨 있어요';
        $('investment-info-panel').innerHTML = `<dl><div><dt>${stock.kind === 'index' ? '지수명' : '종목명'}</dt><dd>${stock.name}</dd></div><div><dt>코드</dt><dd>${stock.ticker}</dd></div><div><dt>유형</dt><dd>${stock.kind === 'index' ? '대표 지수' : '주식 · 거래 잠김'}</dd></div>${stock.kind === 'index' ? '<div><dt>현재가</dt><dd>' + (feed.ready ? money(stock.price) : '—') + '</dd></div>' : ''}${stock.kind === 'stock' ? '<div><dt>보유 주식</dt><dd>0주</dd></div>' : ''}</dl><p>100포인트 = 1원<br>${stock.kind === 'index' ? '관리자가 설정한 지수 값이 유지돼요.' : '30분 주기로 갱신돼요.<br>시세 탭에서 갱신 기록을 볼 수 있어요.'}</p>`;
        root.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === state.tab)));
        $('investment-chart-panel').hidden = state.tab !== 'chart';
        $('investment-info-panel').hidden = state.tab !== 'info';
        $('investment-orderbook-panel').hidden = state.tab !== 'book';
        $('investment-closes-panel').hidden = state.tab !== 'closes';
        root.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === state.period)));
        requestAnimationFrame(drawChart);
        if (state.tab === 'chart') loadHistory();
        if (state.tab === 'book') renderOrderbook();
        if (state.tab === 'closes') renderCloses();
        updateMarketStatus();
    }
    function isActive() {
        return !document.hidden && !root.classList.contains('hidden') && !$('meeting-screen').classList.contains('hidden');
    }
    function updateMarketStatus() {
        const closed = feed.ready && marketClosed();
        const label = closed ? '운영 종료 · 00:00 재개' : feed.status === 'online' ? '30분 주기 갱신' : feed.status === 'loading' ? '시세 연결 중' : '시세 연결 지연';
        root.querySelectorAll('.iv-market-status').forEach(element => { element.textContent = label; });
    }
    function renderMotionQuote() {
        const stock = stocks.find(item => item.kind === 'stock');
        const quote = displayQuote(stock);
        renderQuotePrice($('investment-list-price-' + stock.id), quote);
        const change = $('investment-list-change-' + stock.id);
        change.textContent = changeLabel(quote); change.className = trendClass(quote);
        if (state.selected !== stock.id) return;
        renderQuotePrice($('investment-price'), quote);
        $('investment-secondary-price').textContent = state.currency === 'POINTS' ? wonAmount(quote.price) : pointAmount(quote.price);
        $('investment-change').textContent = changeLabel(quote);
        $('investment-change').className = trendClass(quote);
        if (state.tab === 'chart' && state.period === 'day') requestAnimationFrame(drawChart);
    }
    function stopMotion() {
        if (motion.timer !== null) clearTimeout(motion.timer);
        motion.timer = null;
    }
    function resetMotion() {
        stopMotion();
        motion.price = null; motion.samples = [];
    }
    // Neither animation prices nor samples leave this page or enter server history/balances.
    function motionTime() { return feed.serverTime + (Date.now() - feed.receivedAt); }
    // Use the server clock and KST, including when the device uses another timezone.
    function marketClosed() {
        const kstTime = ((motionTime() + 9 * 3_600_000) % 86_400_000 + 86_400_000) % 86_400_000;
        return kstTime >= 23.5 * 3_600_000;
    }
    function scheduleMotion() {
        stopMotion();
        if (feed.ready && marketClosed()) {
            resetMotion(); renderMotionQuote(); updateMarketStatus(); return;
        }
        if (!isActive() || !feed.ready || feed.status !== 'online' || motionTime() >= feed.nextUpdateAt) return;
        // End the local timer exactly at the shared update/closing boundary.
        motion.timer = setTimeout(tickMotion, Math.max(1, Math.min(10_000, feed.nextUpdateAt - motionTime())));
    }
    function tickMotion() {
        motion.timer = null;
        if (!isActive() || !feed.ready || feed.status !== 'online') return;
        if (marketClosed() || motionTime() >= feed.nextUpdateAt) {
            // Stop at the boundary even while the shared snapshot is still in flight.
            resetMotion(); renderMotionQuote(); updateMarketStatus(); return;
        }
        const stock = stocks.find(item => item.kind === 'stock');
        const current = motion.price === null ? stock.price : motion.price;
        const jump = Math.random() < .12;
        const amplitude = jump ? .06 + Math.random() * .06 : .01 + Math.random() * .03;
        const step = Math.max(1, Math.round(stock.price * amplitude));
        const direction = Math.random() < .5 ? -1 : 1;
        const pull = Math.round((stock.price - current) * .08);
        const lower = Math.max(1, Math.round(stock.price * .7));
        const upper = Math.max(lower + 1, Math.round(stock.price * 1.3));
        let price = Math.max(lower, Math.min(upper, current + direction * step + pull));
        // Bounce inward at a limit rather than appearing stuck on the same quote.
        if (price === current) price = Math.max(lower, Math.min(upper, current - direction * step));
        motion.price = price;
        motion.samples.push({ time: Math.round(motionTime()), close: price });
        if (motion.samples.length > 180) motion.samples.splice(0, motion.samples.length - 180);
        renderMotionQuote(); scheduleMotion();
    }
    function scheduleMarket(delay) {
        if (feed.timer) clearTimeout(feed.timer);
        feed.timer = null;
        if (!isActive() || typeof setTimeout !== 'function') return;
        feed.timer = setTimeout(() => { feed.timer = null; syncMarket(true); }, Math.max(1000, delay));
    }
    async function readApi(path) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(marketApi + path, { signal: controller.signal, credentials: 'omit' });
            if (!response.ok) throw new Error('Market unavailable');
            return await response.json();
        } finally { clearTimeout(timeout); }
    }
    function validQuote(quote) {
        return quote && Number.isSafeInteger(quote.price) && quote.price >= 1 && quote.price <= 1_000_000_000 &&
            Number.isSafeInteger(quote.change) && Number.isFinite(quote.percent);
    }
    async function syncMarket(force = false) {
        if (!isActive() || typeof fetch !== 'function') return;
        if (feed.pending) return feed.pending;
        if (!force && Date.now() < feed.validUntil) { scheduleMarket(feed.validUntil - Date.now()); return; }
        if (!feed.ready && feed.status !== 'loading') {
            feed.status = 'loading';
            renderList(); renderDetail(); updateMarketStatus();
        }
        feed.pending = (async () => {
            try {
                const data = await readApi('/market');
                if (!Array.isArray(data.quotes) || !Number.isSafeInteger(data.asOf) || !Number.isSafeInteger(data.revision) || !Number.isFinite(data.serverTime) ||
                    ![1_800_000, 3_600_000].includes(data.updateIntervalMs || 1_800_000) || !Number.isSafeInteger(data.nextUpdateAt) || data.nextUpdateAt < data.asOf + (data.updateIntervalMs || 1_800_000) || data.nextUpdateAt % (data.updateIntervalMs || 1_800_000) !== 0 || data.asOf < feed.asOf ||
                    !stocks.every(stock => {
                        const quote = data.quotes.find(quote => quote.id === stock.id);
                        const previous = quote && (quote.previous ?? quote.price - quote.change);
                        return validQuote(quote) && Number.isSafeInteger(previous) && previous >= 1;
                    })) throw new Error('Invalid market response');
                const changed = !feed.ready || feed.asOf !== data.asOf || feed.revision !== data.revision;
                stocks.forEach(stock => {
                    const quote = data.quotes.find(item => item.id === stock.id);
                    const previous = quote.previous ?? quote.price - quote.change;
                    stock.price = quote.price; stock.previous = previous; stock.change = quote.change; stock.percent = quote.percent;
                });
                feed.interval = data.updateIntervalMs || 1_800_000; feed.ready = true; feed.asOf = data.asOf; feed.revision = data.revision;
                feed.status = data.stale ? 'delayed' : 'online';
                // Schedule by server time, so a wrong phone clock cannot trigger rapid polling.
                const delay = data.stale ? 60_000 : Math.max(1000, Math.min(feed.interval + 1500, data.nextUpdateAt - data.serverTime + 1500));
                feed.validUntil = Date.now() + delay;
                feed.serverTime = data.serverTime; feed.receivedAt = Date.now(); feed.nextUpdateAt = data.nextUpdateAt;
                if (changed) { resetMotion(); feed.histories.clear(); feed.historyErrors.clear(); feed.closes.clear(); feed.ticks.clear(); feed.books.clear(); }
                renderList(); renderDetail(); updateMarketStatus(); scheduleMarket(delay); scheduleMotion();
            } catch (_) {
                feed.status = 'delayed';
                stopMotion();
                feed.validUntil = Date.now() + 60_000;
                if (!feed.ready) { renderList(); renderDetail(); }
                updateMarketStatus(); scheduleMarket(60_000);
            }
        })();
        try { await feed.pending; } finally { feed.pending = null; }
    }
    const historyKey = () => state.selected + ':' + state.period + ':' + feed.asOf + ':' + feed.revision;
    async function loadHistory() {
        if (!state.selected || state.tab !== 'chart' || !feed.ready || !isActive() || typeof fetch !== 'function') return;
        const key = historyKey(), symbol = state.selected, period = state.period, asOf = feed.asOf, revision = feed.revision;
        if (feed.histories.has(key) || feed.loading.has(key)) return;
        feed.historyErrors.delete(key);
        requestAnimationFrame(drawChart);
        const promise = (async () => {
            try {
                const data = await readApi('/history?symbol=' + encodeURIComponent(symbol) + '&period=' + encodeURIComponent(period));
                if (data.symbol !== symbol || data.period !== period || data.asOf !== asOf || !Array.isArray(data.points) || data.points.length > 130 ||
                    !data.points.every(point => Number.isSafeInteger(point.time) && ['open','high','low','close'].every(field => Number.isSafeInteger(point[field]) && point[field] >= 1))) throw new Error('Invalid chart response');
                if (asOf !== feed.asOf || revision !== feed.revision) return;
                const today = Math.floor((feed.asOf + 9 * 3_600_000) / 86_400_000) * 86_400_000 - 9 * 3_600_000;
                feed.histories.set(key, { points: data.points, axisStart: Number.isSafeInteger(data.axisStart) ? data.axisStart : today, axisEnd: Number.isSafeInteger(data.axisEnd) ? data.axisEnd : today + 86_400_000 - 1_800_000 });
                if (feed.histories.size > 16) feed.histories.delete(feed.histories.keys().next().value);
            } catch (_) {
                if (historyKey() === key) feed.historyErrors.add(key);
            }
        })();
        feed.loading.set(key, promise);
        try { await promise; } finally {
            feed.loading.delete(key);
            if (historyKey() === key) requestAnimationFrame(drawChart);
        }
    }
    const closesKey = () => 'closes:' + state.selected + ':' + feed.asOf + ':' + feed.revision;
    const quoteTabs = () => '<div class="iv-quote-tabs" role="tablist" aria-label="시세 기록 기간"><button type="button" id="investment-daily-tab" role="tab" data-quote-period="daily" aria-controls="investment-quotes-content" aria-selected="' + (state.quotePeriod === 'daily') + '">일별</button><button type="button" id="investment-realtime-tab" role="tab" data-quote-period="realtime" aria-controls="investment-quotes-content" aria-selected="' + (state.quotePeriod === 'realtime') + '">실시간</button></div>';
    function renderCloses() {
        if (state.quotePeriod === 'realtime') { renderTicks(); return; }
        const panel = $('investment-closes-panel'), entry = feed.closes.get(closesKey());
        const stock = stocks.find(item => item.id === state.selected), isStock = stock.kind === 'stock';
        const note = '<p class="iv-closes-note">매일 23:30 종가 · 한국시간 기준<br>마감 전에는 전날까지의 종가를 보여드려요.' + (isStock ? '<br>현재 거래가 잠겨 있어 거래량·거래대금은 0이에요.' : '') + '</p>';
        const rows = entry?.rows || [];
        panel.setAttribute('aria-busy', String(!!entry?.loading));
        const table = rows.length ? '<div class="iv-closes-scroll" tabindex="0" role="region" aria-label="날짜별 종가 표"><table class="iv-closes-table' + (isStock ? ' iv-closes-stock' : '') + '"><thead><tr><th scope="col">날짜</th><th scope="col">종가</th><th scope="col">등락률</th>' + (isStock ? '<th scope="col">거래량(주)</th><th scope="col">거래대금</th>' : '') + '</tr></thead><tbody>' + rows.map(row => {
            const date = new Date(row.day + 9 * 3_600_000).toISOString().slice(0, 10);
            const percent = (row.change > 0 ? '+' : row.change < 0 ? '-' : '') + Math.abs(row.percent).toFixed(2) + '%';
            return '<tr><th scope="row"><time datetime="' + date + '">' + date.replaceAll('-', '.') + '</time></th><td>' + money(row.close) + '</td><td class="' + trendClass(row) + '">' + percent + '</td>' + (isStock ? '<td>' + row.volume.toLocaleString('ko-KR') + '</td><td>' + money(row.turnover) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>' : '';
        const status = !feed.ready ? '시세 연결을 기다리고 있어요' : entry?.error ? '종가 기록 연결이 지연되고 있어요' : !entry || entry.loading ? '종가 기록을 불러오는 중이에요' : rows.length ? '' : '아직 마감된 종가 기록이 없어요';
        const action = entry?.error ? '<button type="button" class="iv-closes-more" data-closes="retry">다시 불러오기</button>' : entry?.nextBefore ? '<button type="button" class="iv-closes-more" data-closes="more"' + (entry.loading ? ' disabled' : '') + '>이전 기록 더 보기</button>' : '';
        panel.innerHTML = quoteTabs() + '<div id="investment-quotes-content" role="tabpanel" aria-labelledby="investment-daily-tab">' + note + table + (status ? '<p class="iv-closes-status" role="status">' + status + '</p>' : '') + action + '</div>';
        if (!entry && feed.ready) loadCloses();
    }
    async function loadCloses(more = false) {
        if (!state.selected || state.tab !== 'closes' || state.quotePeriod !== 'daily' || !feed.ready || !isActive() || typeof fetch !== 'function') return;
        const key = closesKey(), symbol = state.selected, asOf = feed.asOf, revision = feed.revision;
        const entry = feed.closes.get(key) || { rows: [], nextBefore: null, loading: false, error: false };
        if (entry.loading) return;
        const before = (more || entry.rows.length > 0) ? entry.nextBefore : null;
        if (more && before === null) return;
        entry.loading = true; entry.error = false; feed.closes.set(key, entry); renderCloses();
        try {
            const data = await readApi('/closes?symbol=' + encodeURIComponent(symbol) + '&revision=' + revision + (before === null ? '' : '&before=' + before));
            let lastDay = before ?? Infinity;
            if (data.symbol !== symbol || data.asOf !== asOf || data.revision !== revision || !Array.isArray(data.rows) || data.rows.length > 30 ||
                !data.rows.every(row => {
                    const valid = Number.isSafeInteger(row.day) && row.day >= 0 && (row.day + 9 * 3_600_000) % 86_400_000 === 0 && row.day < lastDay && row.day + 86_400_000 - 1_800_000 <= data.serverTime &&
                        Number.isSafeInteger(row.close) && row.close >= 1 && Number.isSafeInteger(row.previous) && row.previous >= 1 && row.change === row.close - row.previous && Number.isFinite(row.percent) &&
                        (symbol !== 'en-joy' || (Number.isSafeInteger(row.volume) && row.volume >= 0 && Number.isSafeInteger(row.turnover) && row.turnover >= 0));
                    lastDay = row.day; return valid;
                }) || !(data.nextBefore === null || (data.rows.length === 30 && data.nextBefore === lastDay))) throw new Error('Invalid closing response');
            if (feed.asOf !== asOf || feed.revision !== revision) return;
            entry.rows = before === null ? data.rows : entry.rows.concat(data.rows);
            entry.nextBefore = data.nextBefore;
        } catch (_) { entry.error = true; }
        finally { entry.loading = false; if (closesKey() === key && state.tab === 'closes') renderCloses(); }
    }
    const ticksKey = () => 'ticks:' + state.selected + ':' + feed.asOf + ':' + feed.revision;
    function renderTicks() {
        const panel = $('investment-closes-panel'), entry = feed.ticks.get(ticksKey());
        const rows = entry?.rows || [];
        panel.setAttribute('aria-busy', String(!!entry?.loading));
        const table = rows.length ? '<div class="iv-closes-scroll" tabindex="0" role="region" aria-label="30분 시세 기록 표"><table class="iv-closes-table iv-ticks-table"><thead><tr><th scope="col">날짜·시간</th><th scope="col">시세</th><th scope="col">등락률</th></tr></thead><tbody>' + rows.map(row => {
            const kst = new Date(row.time + 9 * 3_600_000).toISOString();
            const percent = (row.change > 0 ? '+' : row.change < 0 ? '-' : '') + Math.abs(row.percent).toFixed(2) + '%';
            return '<tr><th scope="row"><time datetime="' + new Date(row.time).toISOString() + '"><span>' + kst.slice(0,10).replaceAll('-', '.') + '</span> <strong>' + kst.slice(11,16) + '</strong></time></th><td>' + money(row.price) + '</td><td class="' + trendClass(row) + '">' + percent + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '';
        const status = !feed.ready ? '시세 연결을 기다리고 있어요' : entry?.error ? '시세 기록 연결이 지연되고 있어요' : !entry || entry.loading ? '시세 기록을 불러오는 중이에요' : rows.length ? '' : '아직 시세 기록이 없어요';
        const action = entry?.error ? '<button type="button" class="iv-closes-more" data-ticks="retry">다시 불러오기</button>' : entry?.nextBefore ? '<button type="button" class="iv-closes-more" data-ticks="more"' + (entry.loading ? ' disabled' : '') + '>이전 기록 더 보기</button>' : '';
        panel.innerHTML = quoteTabs() + '<div id="investment-quotes-content" role="tabpanel" aria-labelledby="investment-realtime-tab"><p class="iv-closes-note">30분 주기 갱신 · 한국시간 기준<br>등락률은 직전 기록 대비예요.</p>' + table + (status ? '<p class="iv-closes-status" role="status">' + status + '</p>' : '') + action + '</div>';
        if (!entry && feed.ready) loadTicks();
    }
    async function loadTicks(more = false) {
        if (!state.selected || state.tab !== 'closes' || state.quotePeriod !== 'realtime' || !feed.ready || !isActive() || typeof fetch !== 'function') return;
        const key = ticksKey(), symbol = state.selected, asOf = feed.asOf, revision = feed.revision;
        const entry = feed.ticks.get(key) || { rows: [], nextBefore: null, loading: false, error: false };
        if (entry.loading) return;
        const before = (more || entry.rows.length > 0) ? entry.nextBefore : null;
        if (more && before === null) return;
        entry.loading = true; entry.error = false; feed.ticks.set(key, entry); renderTicks();
        try {
            const data = await readApi('/ticks?symbol=' + encodeURIComponent(symbol) + '&revision=' + revision + (before === null ? '' : '&before=' + before));
            let lastTime = before ?? Infinity;
            if (data.symbol !== symbol || data.asOf !== asOf || data.revision !== revision || !Array.isArray(data.rows) || data.rows.length > 48 ||
                !data.rows.every(row => {
                    const valid = Number.isSafeInteger(row.time) && row.time >= 0 && row.time % 1_800_000 === 0 && row.time < lastTime && row.time <= asOf && row.time <= data.serverTime &&
                        Number.isSafeInteger(row.price) && row.price >= 1 && Number.isSafeInteger(row.previous) && row.previous >= 1 && row.change === row.price - row.previous && Number.isFinite(row.percent);
                    lastTime = row.time; return valid;
                }) || !(data.nextBefore === null || (data.rows.length === 48 && data.nextBefore === lastTime))) throw new Error('Invalid tick response');
            if (feed.asOf !== asOf || feed.revision !== revision) return;
            entry.rows = before === null ? data.rows : entry.rows.concat(data.rows);
            entry.nextBefore = data.nextBefore;
        } catch (_) { entry.error = true; }
        finally { entry.loading = false; if (ticksKey() === key && state.tab === 'closes' && state.quotePeriod === 'realtime') renderTicks(); }
    }
    function renderOrderbook() {
        const panel = $('investment-orderbook-panel');
        const key = 'book:' + state.selected + ':' + feed.asOf;
        const book = feed.books.get(key);
        if (!book) {
            panel.innerHTML = '<p class="iv-book-notice">' + (feed.ready ? '호가를 불러오는 중이에요' : '시세 연결을 기다리고 있어요') + '</p>';
            loadOrderbook(key); return;
        }
        const alternative = value => state.currency === 'POINTS' ? wonAmount(value) : pointAmount(value);
        const rate = value => {
            const percent = (value - book.previous) / book.previous * 100;
            return (percent > 0 ? '+' : '') + percent.toFixed(1) + '%';
        };
        const quoteCell = (value, current = false) => `<div class="iv-book-price ${current ? 'iv-book-current' : ''}"><div><strong class="${value > book.previous ? 'iv-up' : value < book.previous ? 'iv-down' : 'iv-flat'}">${money(value)}</strong><small>${rate(value)}</small></div><span>${alternative(value)}</span></div>`;
        const statValue = value => value === null ? '—' : money(value);
        const stat = (label, value, cls = '') => `<div><dt>${label}</dt><dd class="${cls}">${statValue(value)}</dd></div>`;
        panel.innerHTML = `<p class="iv-book-notice">기준 호가 <span>거래 잠김 · 대기 주문 없음</span></p>
            <div class="iv-book-scroll" tabindex="0" aria-label="호가 가격대와 잔량">
                <div class="iv-book-columns">
                    <div class="iv-book-left"><div class="iv-book-side-label">매도 잔량</div>${book.asks.map(level => `<div class="iv-book-size iv-down">${level.quantity}</div>`).join('')}<section class="iv-book-executions"><h3>체결 내역</h3><p>아직 체결 내역이 없어요</p></section></div>
                    <div class="iv-book-prices"><div class="iv-book-side-label">가격</div>${book.asks.map(level => quoteCell(level.price)).join('')}${quoteCell(book.price, true)}${book.bids.map(level => quoteCell(level.price)).join('')}</div>
                    <div class="iv-book-right"><div class="iv-book-side-label">시세 정보</div><dl class="iv-book-stats">${stat('52주 최고', book.stats.yearHigh)}${stat('52주 최저', book.stats.yearLow)}<div class="iv-book-stat-divider"></div>${stat('시작', book.stats.open)}${stat('최고', book.stats.high, 'iv-up')}${stat('최저', book.stats.low, 'iv-down')}<div class="iv-book-stat-divider"></div><div><dt>거래량</dt><dd>${book.stats.volume}주</dd></div></dl><div class="iv-book-bid-heading">매수 잔량</div>${book.bids.map(level => `<div class="iv-book-size iv-up">${level.quantity}</div>`).join('')}</div>
                </div>
            </div><div class="iv-book-total"><span>매도 <strong>${book.totalAsk}주</strong></span><span>매수 <strong>${book.totalBid}주</strong></span></div>`;
        requestAnimationFrame(() => {
            const scroll = panel.querySelector('.iv-book-scroll'), current = panel.querySelector('.iv-book-current');
            if (!scroll?.clientHeight || !current) return;
            const row = current.getBoundingClientRect();
            scroll.scrollTop += row.top - scroll.getBoundingClientRect().top - (scroll.clientHeight - row.height) / 2;
        });
    }
    async function loadOrderbook(key) {
        if (!feed.ready || !isActive() || state.tab !== 'book' || state.selected !== 'en-joy' || feed.loading.has(key) || typeof fetch !== 'function') return;
        const asOf = feed.asOf;
        const promise = (async () => {
            try {
                const book = await readApi('/orderbook?symbol=en-joy');
                const validLevels = levels => Array.isArray(levels) && levels.length <= 5 && levels.every(level => Number.isSafeInteger(level.price) && level.price >= 1 && Number.isSafeInteger(level.quantity) && level.quantity >= 0);
                if (book.symbol !== 'en-joy' || book.asOf !== asOf || !validQuote({ price: book.price, change: 0, percent: 0 }) ||
                    !Number.isSafeInteger(book.previous) || book.previous < 1 || !validLevels(book.asks) || !validLevels(book.bids) ||
                    !book.stats || !['open','high','low','yearHigh','yearLow'].every(field => book.stats[field] === null || Number.isSafeInteger(book.stats[field]) && book.stats[field] >= 1) ||
                    book.indicative !== true || book.tradingEnabled !== false || book.totalAsk !== 0 || book.totalBid !== 0 || book.stats.volume !== 0 ||
                    book.asks.some(level => level.quantity !== 0) || book.bids.some(level => level.quantity !== 0)) throw new Error('Invalid orderbook');
                if (asOf !== feed.asOf) return;
                feed.books.set(key, book);
                if (state.tab === 'book' && key === 'book:' + state.selected + ':' + feed.asOf) renderOrderbook();
            } catch (_) {
                if (state.tab === 'book' && key === 'book:' + state.selected + ':' + feed.asOf) $('investment-orderbook-panel').innerHTML = '<p class="iv-book-notice">호가 연결이 지연되고 있어요</p>';
            }
        })();
        feed.loading.set(key, promise);
        try { await promise; } finally { feed.loading.delete(key); }
    }
    function drawChart() {
        const pulse = $('investment-chart-pulse');
        pulse.hidden = true;
        $('investment-chart-skeleton').hidden = true;
        $('investment-chart-inspection').hidden = true;
        chartInspection.view = null;
        if (!state.selected || state.tab !== 'chart' || root.classList.contains('hidden')) return;
        const stock = stocks.find(item => item.id === state.selected);
        const canvas = $('investment-chart');
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(rect.height * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const styles = window.getComputedStyle ? window.getComputedStyle(root) : null;
        const themeColor = (name, fallback) => styles?.getPropertyValue(name).trim() || fallback;
        ctx.scale(ratio, ratio);
        const w = rect.width, h = rect.height;
        const series = feed.histories.get(historyKey());
        const history = series && series.points;
        const loading = marketLoading() || (feed.ready && !history && !feed.historyErrors.has(historyKey()));
        $('investment-chart-skeleton').hidden = !loading;
        canvas.setAttribute('aria-busy', String(loading));
        if (!feed.ready || !history) {
            const message = loading ? '차트 불러오는 중' : '차트 연결이 지연되고 있어요';
            canvas.setAttribute('aria-label', message);
            if (!loading) {
                ctx.fillStyle = themeColor('--iv-muted', '#909096'); ctx.font = '13px Pretendard, -apple-system, sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(message, w/2, h*.46);
            }
            return;
        }
        const chartLeft = 6, chartRight = w - 6;
        const intraday = state.period === 'day';
        const candlestick = state.chartType === 'candle';
        if (intraday) {
            ctx.fillStyle = themeColor('--iv-muted', '#909096'); ctx.font = '11px Pretendard, -apple-system, sans-serif';
            [0,6,12,18,23.5].forEach(hour => {
                ctx.textAlign = hour === 0 ? 'left' : hour === 23.5 ? 'right' : 'center';
                ctx.fillText((hour === 23.5 ? '23:30' : String(hour).padStart(2,'0') + '시'), chartLeft + hour / 23.5 * (chartRight-chartLeft), h*.95);
            });
        }
        if (!history.length) {
            ctx.fillStyle = themeColor('--iv-muted', '#909096'); ctx.font = '13px Pretendard, -apple-system, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(intraday ? '오늘의 시세 기록을 기다리고 있어요' : '아직 과거 시세 기록이 없어요', w/2, h*.46);
            canvas.setAttribute('aria-label', intraday ? '당일 시세 기록 없음, 00시부터 23시 30분까지' : '과거 시세 기록 없음'); return;
        }
        const quote = state.period === 'day' ? displayQuote(stock) : stock;
        const color = quote.change > 0 ? themeColor('--iv-red', '#f04452') : quote.change < 0 ? themeColor('--iv-blue', '#3182f6') : themeColor('--iv-flat', '#a6a6b1');
        const high = Math.max(...history.map(point => point.high)), low = Math.min(...history.map(point => point.low));
        const axisStart = intraday ? series.axisStart : history[0].time;
        const axisEnd = intraday ? series.axisEnd : history[history.length - 1].time;
        const xFor = time => chartLeft + (axisEnd === axisStart ? 0 : Math.max(0, Math.min(1, (time-axisStart)/(axisEnd-axisStart)))) * (chartRight-chartLeft);
        const last = history[history.length - 1];
        const local = !candlestick && intraday && stock.kind === 'stock' && !marketClosed()
            ? motion.samples.filter(point => point.time >= last.time).map(point => ({ ...point, time: Math.min(axisEnd, point.time) })) : [];
        const endpoint = local.length ? local[local.length - 1] : last;
        const key = historyKey();
        if (chartInspection.key !== key) clearChartInspection(false);
        chartInspection.key = key;
        const inspectPoints = history.concat(local);
        chartInspection.view = { points: inspectPoints, xFor };
        const selected = chartInspection.time === null ? null : inspectPoints.reduce((nearest, point) =>
            Math.abs(point.time - chartInspection.time) < Math.abs(nearest.time - chartInspection.time) ? point : nearest);
        const chartW = xFor(endpoint.time);
        const showPrevious = intraday || state.period === '1d';
        // Only daily views compare against yesterday; longer views scale to their own prices.
        const previous = stock.previous;
        const scaleHigh = Math.max(high, showPrevious ? previous : high, ...local.map(point => point.close)), scaleLow = Math.min(low, showPrevious ? previous : low, ...local.map(point => point.close));
        const yFor = value => scaleHigh === scaleLow ? h * .46 : h * .23 + (scaleHigh - value) / (scaleHigh - scaleLow) * h * .48;
        if (showPrevious) {
            const previousY = yFor(previous);
            ctx.strokeStyle = themeColor('--iv-grid', '#4c4c58'); ctx.lineWidth = 1; ctx.setLineDash([4,4]);
            ctx.beginPath(); ctx.moveTo(0, previousY); ctx.lineTo(w, previousY); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = themeColor('--iv-muted', '#909096'); ctx.font = '11px Pretendard, -apple-system, sans-serif'; ctx.textAlign = 'right';
            ctx.fillText('전일 종가 ' + money(previous), chartRight, previousY - 9);
        }
        const chartY = yFor(endpoint.close);
        if (candlestick) {
            const spacing = history.length > 1 ? Math.min(...history.slice(1).map((point, index) => xFor(point.time) - xFor(history[index].time))) : 12;
            const bodyWidth = Math.max(1, Math.min(6, spacing * .62));
            history.forEach((point, index) => {
                // Snapshot-only records span the interval from the previous recorded price.
                const snapshot = point.open === point.close && point.high === point.close && point.low === point.close;
                const open = snapshot && index > 0 ? history[index - 1].close : point.open;
                const x = xFor(point.time), top = yFor(Math.max(open, point.close)), bottom = yFor(Math.min(open, point.close));
                const candleColor = point.close > open ? themeColor('--iv-red', '#f04452') : point.close < open ? themeColor('--iv-blue', '#3182f6') : themeColor('--iv-muted', '#909096');
                ctx.strokeStyle = candleColor; ctx.fillStyle = candleColor; ctx.lineWidth = 1; ctx.lineCap = 'butt';
                ctx.beginPath(); ctx.moveTo(x, yFor(Math.max(point.high, open))); ctx.lineTo(x, yFor(Math.min(point.low, open))); ctx.stroke();
                if (open === point.close) {
                    ctx.beginPath(); ctx.moveTo(x - bodyWidth / 2, top); ctx.lineTo(x + bodyWidth / 2, top); ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.roundRect(x - bodyWidth / 2, top, bodyWidth, Math.max(1, bottom - top), Math.min(1.2, bodyWidth / 2, (bottom - top) / 2)); ctx.fill();
                }
            });
        } else {
            ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = color;
            ctx.beginPath();
            history.forEach((point, index) => {
                const x = xFor(point.time), y = yFor(point.close);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            if (local.length) {
                ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xFor(last.time), yFor(last.close));
                local.forEach(point => ctx.lineTo(xFor(point.time), yFor(point.close)));
                ctx.stroke(); ctx.setLineDash([]);
            }
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(chartW, chartY, 4, 0, Math.PI * 2); ctx.fill();
        }
        pulse.setAttribute('style', 'left:' + chartW + 'px;top:' + chartY + 'px;--iv-pulse-color:' + color);
        pulse.hidden = candlestick || !intraday || document.hidden || !isActive() || marketClosed();
        const markExtreme = (point, value, label, markerColor, below) => {
            const x = xFor(point.time), y = yFor(value);
            ctx.strokeStyle = markerColor; ctx.fillStyle = markerColor; ctx.lineWidth = 1;
            // Aggregated periods may reach a high/low between their closing samples.
            if (!candlestick && value !== point.close) {
                ctx.beginPath(); ctx.moveTo(x, yFor(point.close)); ctx.lineTo(x, y); ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
            ctx.font = '12px Pretendard, -apple-system, sans-serif'; ctx.textAlign = 'left';
            const text = label + ' ' + money(value), width = ctx.measureText(text).width;
            const labelX = Math.max(chartLeft, Math.min(x - width / 2, chartRight - width));
            ctx.fillText(text, labelX, y + (below ? 22 : -13));
        };
        const highPoint = history.find(point => point.high === high), lowPoint = history.find(point => point.low === low);
        let selectionLabel = '';
        if (selected) {
            const x = xFor(selected.time), tooltip = $('investment-chart-inspection');
            const date = new Date(selected.time + 9 * 3_600_000).toISOString();
            const time = date.slice(0,10).replaceAll('-', '.') + (showPrevious ? ' ' + date.slice(11,16) : '');
            $('investment-chart-time').textContent = time;
            $('investment-chart-value').textContent = money(selected.close);
            tooltip.hidden = false;
            const tooltipWidth = tooltip.getBoundingClientRect().width;
            const center = Math.max(chartLeft + tooltipWidth / 2, Math.min(x, chartRight - tooltipWidth / 2));
            tooltip.setAttribute('style', 'left:' + center + 'px');
            ctx.strokeStyle = themeColor('--iv-muted', '#909096'); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, h * .09 + 48); ctx.lineTo(x, h * .9); ctx.stroke();
            selectionLabel = ', 선택 ' + time + ', ' + money(selected.close);
        } else if (high === low) markExtreme(highPoint, high, '최고·최저', candlestick ? themeColor('--iv-muted', '#909096') : color, false);
        else {
            const markerColor = candlestick ? themeColor('--iv-muted', '#909096') : color;
            markExtreme(highPoint, high, '최고', markerColor, false);
            markExtreme(lowPoint, low, '최저', markerColor, true);
        }
        canvas.setAttribute('aria-label', stock.name + (intraday ? ' 당일 차트, 00시부터 23시 30분까지, ' : ' 과거 차트, ') + (candlestick ? '캔들 차트, ' : '') + '최고 ' + money(high) + ', 최저 ' + money(low) + (showPrevious ? ', 전일 종가 ' + money(previous) : '') + (stock.kind === 'index' ? ', 관리자 설정' : ', 30분 주기 갱신' + (local.length ? ', 기기별 화면 시세 ' + money(quote.price) : '')) + selectionLabel);
    }
    function clearChartInspection(redraw = true) {
        const canvas = $('investment-chart'), pointer = chartInspection.pointer;
        chartInspection.pointer = null; chartInspection.time = null;
        $('investment-chart-inspection').hidden = true;
        if (pointer !== null && canvas.hasPointerCapture?.(pointer)) canvas.releasePointerCapture(pointer);
        if (redraw) requestAnimationFrame(drawChart);
    }
    const chartCanvas = $('investment-chart');
    const inspectAt = clientX => {
        const view = chartInspection.view;
        if (!view || !view.points.length) return;
        const x = clientX - chartCanvas.getBoundingClientRect().left;
        const point = view.points.reduce((nearest, item) => Math.abs(view.xFor(item.time) - x) < Math.abs(view.xFor(nearest.time) - x) ? item : nearest);
        if (chartInspection.time === point.time) return;
        chartInspection.time = point.time;
        requestAnimationFrame(drawChart);
    };
    chartCanvas.addEventListener('pointerdown', event => {
        if (event.isPrimary === false || event.button !== 0 || !chartInspection.view || chartInspection.pointer !== null) return;
        chartInspection.pointer = event.pointerId;
        chartCanvas.setPointerCapture?.(event.pointerId);
        inspectAt(event.clientX);
    });
    chartCanvas.addEventListener('pointermove', event => {
        if (chartInspection.pointer === event.pointerId) inspectAt(event.clientX);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type => chartCanvas.addEventListener(type, event => {
        if (chartInspection.pointer === event.pointerId) clearChartInspection();
    }));
    chartCanvas.addEventListener('keydown', event => {
        const view = chartInspection.view;
        if (event.key === 'Escape') { event.stopPropagation(); clearChartInspection(); return; }
        if (!view || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const points = view.points, current = points.findIndex(point => point.time === chartInspection.time);
        const index = event.key === 'Home' ? 0 : event.key === 'End' || current === -1 ? points.length - 1 : Math.max(0, Math.min(points.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)));
        chartInspection.time = points[index].time;
        requestAnimationFrame(drawChart);
    });
    chartCanvas.addEventListener('blur', () => clearChartInspection());
    function showList(restoreFocus) {
        clearChartInspection(false);
        const previous = state.selected;
        stopQuotePrice('investment-price');
        state.selected = null;
        refreshAccount();
        $('investment-home').hidden = false;
        $('investment-detail').hidden = true;
        $('wallet-scroll').scrollTop = 0;
        if (window.setWalletNavCompact) window.setWalletNavCompact(false);
        if (restoreFocus && previous) root.querySelector('[data-stock="' + previous + '"]')?.focus({ preventScroll: true });
        syncOrPause();
    }
    root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (window.haptic) window.haptic();
        if (button.dataset.stock) {
            clearChartInspection(false);
            stopQuotePrice('investment-price');
            state.selected = button.dataset.stock; state.period = 'day'; state.tab = 'chart'; state.quotePeriod = 'daily';
            $('investment-home').hidden = true; $('investment-detail').hidden = false;
            $('wallet-scroll').scrollTop = 0;
            renderDetail(); $('investment-name').focus({ preventScroll: true });
        } else if (button.id === 'investment-back') showList(true);
        else if (button.dataset.currency) {
            state.currency = button.dataset.currency;
            renderList(); renderDetail();
            const container = state.selected ? $('investment-detail-currency') : $('investment-list-currency');
            container.querySelector('[data-currency="' + state.currency + '"]').focus({ preventScroll: true });
        }
        else if (button.dataset.quotePeriod) { state.quotePeriod = button.dataset.quotePeriod; renderCloses(); }
        else if (button.dataset.ticks) loadTicks(button.dataset.ticks === 'more');
        else if (button.dataset.closes) loadCloses(button.dataset.closes === 'more');
        else if (button.dataset.chartType) {
            clearChartInspection(false);
            state.chartType = state.chartType === 'line' ? 'candle' : 'line';
            const control = $('investment-chart-type'), candle = state.chartType === 'candle';
            control.setAttribute('aria-label', candle ? '선 차트로 전환' : '캔들 차트로 전환');
            control.setAttribute('aria-pressed', String(candle));
            control.innerHTML = '<img src="assets/investment/chart-' + (candle ? 'line' : 'candle') + '.png" alt="" width="28" height="28">';
            requestAnimationFrame(drawChart);
        }
        else if (button.dataset.period) { clearChartInspection(false); state.period = button.dataset.period; renderDetail(); }
        else if (button.dataset.tab) {
            if (button.dataset.tab === 'book' && stocks.find(stock => stock.id === state.selected)?.kind !== 'stock') return;
            clearChartInspection(false);
            state.tab = button.dataset.tab; renderDetail();
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state.selected && !root.classList.contains('hidden') && !$('meeting-screen').classList.contains('hidden')) showList(true);
    });
    window.resetInvestmentView = () => showList(false);
    if (window.matchMedia) {
        const colorScheme = window.matchMedia('(prefers-color-scheme: light)');
        const redrawForTheme = () => requestAnimationFrame(drawChart);
        if (colorScheme.addEventListener) colorScheme.addEventListener('change', redrawForTheme);
        else if (colorScheme.addListener) colorScheme.addListener(redrawForTheme);
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawChart()).observe($('investment-chart'));
    else window.addEventListener('resize', drawChart);
    window.refreshInvestmentAccount = refreshAccount;
    window.addEventListener('enjoy-auth-ready', refreshAccount);
    function syncOrPause() {
        if (!isActive()) clearChartInspection(false);
        $('investment-chart-pulse').hidden = true;
        if (isActive()) requestAnimationFrame(drawChart);
        if (isActive()) { syncMarket(); scheduleMotion(); }
        else { stopMotion(); }
        if (!isActive() && feed.timer) { clearTimeout(feed.timer); feed.timer = null; }
    }
    document.addEventListener('visibilitychange', syncOrPause);
    window.addEventListener('offline', () => { feed.status = 'delayed'; stopMotion(); updateMarketStatus(); });
    window.addEventListener('online', () => { if (isActive()) syncMarket(true); });
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(syncOrPause);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        observer.observe($('meeting-screen'), { attributes: true, attributeFilter: ['class'] });
    }
    refreshAccount();
    renderList();
    syncOrPause();
})();
