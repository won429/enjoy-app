(function () {
    'use strict';
    const root = document.getElementById('wallet-panel-investment');
    if (!root) return;
    // Shared hourly prices come only from Cloudflare. Member points stay in Firebase.
    // Trading is closed: this module never writes balances, holdings or orders.
    const stocks = [
        { id: 'enjoy', name: '엔조이', ticker: 'ENJOY', kind: 'index', price: 100, change: 0, percent: 0, image: 'assets/enjoy-symbol-navy.png' },
        { id: 'en-joy', name: '엔조이스튜디오', ticker: 'enjoy studio', kind: 'stock', price: 100, change: 0, percent: 0, image: 'assets/enjoy-symbol-rose.png' }
    ];
    const pointsPerWon = 100;
    const state = { selected: null, currency: 'POINTS', period: 'day', tab: 'chart' };
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
        const hour = Math.floor(Date.now()/3_600_000);
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
    const feed = { ready: false, status: 'loading', asOf: 0, revision: -1, validUntil: 0, timer: null, pending: null, histories: new Map(), books: new Map(), loading: new Map() };
    const pointAmount = amount => Math.round(amount).toLocaleString('ko-KR') + ' P';
    const wonAmount = amount => (amount / pointsPerWon).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원';
    const money = amount => state.currency === 'POINTS' ? pointAmount(amount) : wonAmount(amount);
    const priceLabel = stock => feed.ready ? money(stock.price) : '—';
    const trendClass = stock => stock.change > 0 ? 'iv-up' : stock.change < 0 ? 'iv-down' : 'iv-flat';
    const percentLabel = stock => (stock.percent > 0 ? '+' : '') + stock.percent.toFixed(1) + '%';
    const changeLabel = stock => feed.ready ? (stock.change > 0 ? '+' : stock.change < 0 ? '-' : '') + money(Math.abs(stock.change)) + ' (' + percentLabel(stock) + ')' : '—';
    const icon = name => '<i class="fa-solid fa-' + name + '" aria-hidden="true"></i>';
    const currencyControl = () => '<div class="iv-segment" role="group" aria-label="표시 단위"><button type="button" data-currency="KRW" aria-label="원화로 보기" aria-pressed="' + (state.currency === 'KRW') + '">원화</button><button type="button" data-currency="POINTS" aria-label="포인트로 보기" aria-pressed="' + (state.currency === 'POINTS') + '">포인트</button></div>';
    root.innerHTML = `
        <section id="investment-home" aria-label="투자 첫 화면">
            <header class="iv-top"><h1>엔조이증권</h1><span class="iv-market-heading"><span>운영시간 00:00~23:00</span><span id="market-home-status" class="iv-market-status">시세 연결 중</span></span></header>
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
            <div class="iv-detail-nav"><button class="iv-back" id="investment-back" type="button" aria-label="종목 목록으로 돌아가기">${icon('chevron-left')}</button><span class="iv-market-heading"><span>운영시간 00:00~23:00</span><span id="market-detail-status" class="iv-market-status">시세 연결 중</span></span></div>
            <div class="iv-detail-heading"><h2 id="investment-name" tabindex="-1"></h2><span class="iv-ticker" id="investment-ticker"></span></div>
            <div class="iv-quote"><p class="iv-price"><span id="investment-price"></span><small class="iv-secondary-price" id="investment-secondary-price"></small></p><div id="investment-detail-currency"></div></div>
            <p class="iv-change"><span id="investment-change-caption" style="margin-left:0">전일 대비</span><span id="investment-change"></span></p>
            <div class="iv-tabs" role="tablist" aria-label="종목 상세 메뉴"><button type="button" id="investment-chart-tab" role="tab" data-tab="chart" aria-controls="investment-chart-panel" aria-selected="true">차트</button><button type="button" id="investment-orderbook-tab" role="tab" data-tab="book" aria-controls="investment-orderbook-panel" aria-selected="false">호가</button><button type="button" id="investment-holdings-tab" disabled>내 주식</button><button type="button" id="investment-info-tab" role="tab" data-tab="info" aria-controls="investment-info-panel" aria-selected="false">종목정보</button></div>
            <div id="investment-chart-panel" class="iv-chart-panel" role="tabpanel" aria-labelledby="investment-chart-tab"><p class="iv-chart-caption">${icon('circle-check')} 자세한 차트</p><div class="iv-chart-wrap"><canvas id="investment-chart" role="img" aria-label="시세 차트"></canvas></div><div class="iv-periods" role="group" aria-label="차트 기간"><button type="button" data-period="day" aria-label="실시간" aria-pressed="true">실시간</button><button type="button" data-period="1d" aria-pressed="false">1일</button><button type="button" data-period="1w" aria-pressed="false">1주</button><button type="button" data-period="3m" aria-pressed="false">3달</button><button type="button" data-period="1y" aria-pressed="false">1년</button><button type="button" data-period="5y" aria-pressed="false">5년</button><button type="button" data-period="all" aria-pressed="false">전체</button></div></div>
            <div id="investment-orderbook-panel" class="iv-orderbook" role="tabpanel" aria-labelledby="investment-orderbook-tab" hidden></div>
            <div id="investment-info-panel" class="iv-info" role="tabpanel" aria-labelledby="investment-info-tab" hidden></div>
            <footer class="iv-trade"><div class="iv-trade-buttons" id="investment-trade-buttons"><button type="button" disabled>판매하기</button><button type="button" disabled>구매하기</button></div><p id="investment-trade-note">현재 거래가 잠겨 있어요</p></footer>
        </section>`;
    const $ = id => document.getElementById(id);
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
        $('investment-list-currency').innerHTML = currencyControl();
        $('investment-total').textContent = money(0);
        $('investment-index-list').innerHTML = stocks.filter(stock => stock.kind === 'index').map(stock => `<button type="button" class="iv-index" data-stock="${stock.id}" aria-label="${stock.name} 종목 상세 보기"><span class="iv-index-name"><small>지수</small><strong>${stock.name}</strong></span><strong class="iv-index-price">${priceLabel(stock)}</strong><small class="${trendClass(stock)}">${feed.ready ? percentLabel(stock) : '—'}</small></button>`).join('');
        const listedStocks = stocks.filter(stock => stock.kind === 'stock');
        $('investment-stock-list').innerHTML = `<h2 class="iv-stocks-heading"><span>주식</span><small>${listedStocks.length}개 종목</small></h2>` + listedStocks.map(stock => `<button type="button" class="iv-stock" data-stock="${stock.id}" aria-label="${stock.name} 종목 상세 보기"><img src="${stock.image}" alt="" width="46" height="46"><span class="iv-stock-name"><strong>${stock.name}</strong><small>주식 · 거래 잠김</small></span><span class="iv-stock-price"><strong>${priceLabel(stock)}</strong><small class="${trendClass(stock)}">${changeLabel(stock)}</small></span></button>`).join('');
        renderRanking();
    }
    function renderDetail() {
        const stock = stocks.find(item => item.id === state.selected);
        if (!stock) return;
        $('investment-name').textContent = stock.name;
        $('investment-ticker').textContent = stock.ticker;
        $('investment-price').textContent = priceLabel(stock);
        $('investment-secondary-price').textContent = feed.ready ? (state.currency === 'POINTS' ? wonAmount(stock.price) : pointAmount(stock.price)) : '';
        $('investment-detail-currency').innerHTML = currencyControl();
        $('investment-change').textContent = changeLabel(stock);
        $('investment-change').className = trendClass(stock);
        $('investment-change-caption').textContent = '전일 대비';
        $('investment-info-tab').textContent = stock.kind === 'index' ? '지수정보' : '종목정보';
        $('investment-orderbook-tab').hidden = stock.kind === 'index';
        $('investment-holdings-tab').hidden = stock.kind === 'index';
        $('investment-trade-buttons').hidden = stock.kind === 'index';
        $('investment-trade-note').textContent = stock.kind === 'index' ? '엔조이는 시장 흐름을 나타내는 지수예요' : '현재 거래가 잠겨 있어요';
        $('investment-info-panel').innerHTML = `<dl><div><dt>${stock.kind === 'index' ? '지수명' : '종목명'}</dt><dd>${stock.name}</dd></div><div><dt>코드</dt><dd>${stock.ticker}</dd></div><div><dt>유형</dt><dd>${stock.kind === 'index' ? '대표 지수' : '주식 · 거래 잠김'}</dd></div><div><dt>현재가</dt><dd>${priceLabel(stock)}</dd></div>${stock.kind === 'stock' ? '<div><dt>보유 주식</dt><dd>0주</dd></div>' : ''}</dl><p>100포인트 = 1원<br>${stock.kind === 'index' ? '관리자가 설정한 지수 값이 유지돼요.' : '시세는 1시간마다 변동돼요.'}</p>`;
        root.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === state.tab)));
        $('investment-chart-panel').hidden = state.tab !== 'chart';
        $('investment-info-panel').hidden = state.tab !== 'info';
        $('investment-orderbook-panel').hidden = state.tab !== 'book';
        root.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === state.period)));
        requestAnimationFrame(drawChart);
        if (state.tab === 'chart') loadHistory();
        if (state.tab === 'book') renderOrderbook();
        updateMarketStatus();
    }
    function isActive() {
        return !document.hidden && !root.classList.contains('hidden') && !$('meeting-screen').classList.contains('hidden');
    }
    function updateMarketStatus() {
        const label = feed.status === 'online' ? '1시간마다 변동' : feed.status === 'loading' ? '시세 연결 중' : '시세 연결 지연';
        root.querySelectorAll('.iv-market-status').forEach(element => {
            element.textContent = feed.status === 'online' && element.id === 'market-detail-status'
                ? (state.selected === 'enjoy' ? '관리자 설정' : '1시간마다 변동') : label;
        });
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
        feed.pending = (async () => {
            try {
                const data = await readApi('/market');
                if (!Array.isArray(data.quotes) || !Number.isSafeInteger(data.asOf) || !Number.isSafeInteger(data.revision) || !Number.isFinite(data.serverTime) ||
                    data.nextUpdateAt !== data.asOf + 3_600_000 || data.asOf < feed.asOf ||
                    !stocks.every(stock => validQuote(data.quotes.find(quote => quote.id === stock.id)))) throw new Error('Invalid market response');
                const changed = !feed.ready || feed.asOf !== data.asOf || feed.revision !== data.revision;
                stocks.forEach(stock => {
                    const quote = data.quotes.find(item => item.id === stock.id);
                    stock.price = quote.price; stock.change = quote.change; stock.percent = quote.percent;
                });
                feed.ready = true; feed.asOf = data.asOf; feed.revision = data.revision;
                feed.status = data.stale ? 'delayed' : 'online';
                // Schedule by server time, so a wrong phone clock cannot trigger rapid polling.
                const delay = data.stale ? 60_000 : Math.max(1000, Math.min(3_601_500, data.nextUpdateAt - data.serverTime + 1500));
                feed.validUntil = Date.now() + delay;
                if (changed) { feed.histories.clear(); feed.books.clear(); }
                renderList(); renderDetail(); updateMarketStatus(); scheduleMarket(delay);
            } catch (_) {
                feed.status = 'delayed';
                feed.validUntil = Date.now() + 60_000;
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
        const promise = (async () => {
            try {
                const data = await readApi('/history?symbol=' + encodeURIComponent(symbol) + '&period=' + encodeURIComponent(period));
                if (data.symbol !== symbol || data.period !== period || data.asOf !== asOf || !Array.isArray(data.points) || data.points.length > 130 ||
                    !data.points.every(point => Number.isSafeInteger(point.time) && ['open','high','low','close'].every(field => Number.isSafeInteger(point[field]) && point[field] >= 1))) throw new Error('Invalid chart response');
                if (asOf !== feed.asOf || revision !== feed.revision) return;
                const today = Math.floor((feed.asOf + 9 * 3_600_000) / 86_400_000) * 86_400_000 - 9 * 3_600_000;
                feed.histories.set(key, { points: data.points, axisStart: Number.isSafeInteger(data.axisStart) ? data.axisStart : today, axisEnd: Number.isSafeInteger(data.axisEnd) ? data.axisEnd : today + 23 * 3_600_000 });
                if (feed.histories.size > 16) feed.histories.delete(feed.histories.keys().next().value);
                if (historyKey() === key) requestAnimationFrame(drawChart);
            } catch (_) {
                if (historyKey() === key) $('investment-chart').setAttribute('aria-label', '차트 연결이 지연되고 있어요');
            }
        })();
        feed.loading.set(key, promise);
        try { await promise; } finally { feed.loading.delete(key); }
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
        const quoteCell = (value, current = false) => `<div class="iv-book-price ${current ? 'iv-book-current' : ''}"><div><strong class="${value > book.previous ? 'iv-up' : value < book.previous ? 'iv-down' : 'iv-flat'}">${money(value)}</strong><small>${rate(value)}</small></div><span>${alternative(value)}${current ? ' · 현재가' : ''}</span></div>`;
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
        if (!feed.ready || !history) { canvas.setAttribute('aria-label', '차트 불러오는 중'); return; }
        const chartLeft = 6, chartRight = w - 6;
        const intraday = state.period === 'day';
        if (intraday) {
            ctx.fillStyle = themeColor('--iv-muted', '#909096'); ctx.font = '11px Pretendard, -apple-system, sans-serif';
            [0,6,12,18,23].forEach(hour => {
                ctx.textAlign = hour === 0 ? 'left' : hour === 23 ? 'right' : 'center';
                ctx.fillText(String(hour).padStart(2,'0') + '시', chartLeft + hour / 23 * (chartRight-chartLeft), h*.95);
            });
        }
        if (!history.length) {
            ctx.fillStyle = themeColor('--iv-muted', '#909096'); ctx.font = '13px Pretendard, -apple-system, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(intraday ? '오늘의 시세 기록을 기다리고 있어요' : '아직 과거 시세 기록이 없어요', w/2, h*.46);
            canvas.setAttribute('aria-label', intraday ? '당일 시세 기록 없음, 00시부터 23시까지' : '과거 시세 기록 없음'); return;
        }
        const color = stock.change > 0 ? themeColor('--iv-red', '#f04452') : stock.change < 0 ? themeColor('--iv-blue', '#3182f6') : themeColor('--iv-flat', '#a6a6b1');
        const high = Math.max(...history.map(point => point.high)), low = Math.min(...history.map(point => point.low));
        const axisStart = intraday ? series.axisStart : history[0].time;
        const axisEnd = intraday ? series.axisEnd : history[history.length - 1].time;
        const xFor = time => chartLeft + (axisEnd === axisStart ? 0 : Math.max(0, Math.min(1, (time-axisStart)/(axisEnd-axisStart)))) * (chartRight-chartLeft);
        const chartW = xFor(history[history.length - 1].time);
        const yFor = value => high === low ? h * .46 : h * .23 + (high - value) / (high - low) * h * .29;
        const chartY = yFor(history[history.length - 1].close);
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = color;
        ctx.beginPath();
        history.forEach((point, index) => {
            const x = xFor(point.time), y = yFor(point.close);
            if (index === 0) ctx.moveTo(x, y);
            else { ctx.lineTo(x, yFor(history[index - 1].close)); ctx.lineTo(x, y); }
        });
        ctx.stroke();
        ctx.fillStyle = color; ctx.globalAlpha = .1;
        ctx.beginPath(); ctx.arc(chartW, chartY, 9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(chartW, chartY, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = '12px Pretendard, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(high === low ? '최고·최저 ' + money(high) : '최고 ' + money(high) + ' · 최저 ' + money(low), 0, h * .23 - 18);
        ctx.strokeStyle = themeColor('--iv-grid', '#4c4c58'); ctx.lineWidth = 1; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(0,h*.83); ctx.lineTo(w,h*.83); ctx.stroke();
        canvas.setAttribute('aria-label', stock.name + (intraday ? ' 당일 차트, 00시부터 23시까지, ' : ' 과거 차트, ') + '최고 ' + money(high) + ', 최저 ' + money(low) + (stock.kind === 'index' ? ', 관리자 설정' : ', 1시간마다 변동'));
    }
    function showList(restoreFocus) {
        const previous = state.selected;
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
            state.selected = button.dataset.stock; state.period = 'day'; state.tab = 'chart';
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
        else if (button.dataset.period) { state.period = button.dataset.period; renderDetail(); }
        else if (button.dataset.tab) {
            if (button.dataset.tab === 'book' && stocks.find(stock => stock.id === state.selected)?.kind !== 'stock') return;
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
        if (isActive()) syncMarket();
        else if (feed.timer) { clearTimeout(feed.timer); feed.timer = null; }
    }
    document.addEventListener('visibilitychange', syncOrPause);
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
