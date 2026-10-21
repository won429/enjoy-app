(function () {
    'use strict';
    const root = document.getElementById('wallet-panel-investment');
    if (!root) return;
    // Fixed point-denominated prices. Account data is read from the existing member cache.
    // Trading is closed: this module never writes balances, holdings or orders.
    const stocks = [
        { id: 'enjoy', name: '엔조이', ticker: 'ENJOY', kind: 'index', price: 0, change: 0, percent: 0, image: 'assets/enjoy-symbol-navy.png' },
        { id: 'en-joy', name: '엔조이스튜디오', ticker: 'enjoy studio', kind: 'stock', price: 0, change: 0, percent: 0, image: 'assets/enjoy-symbol-rose.png' }
    ];
    const pointsPerWon = 100;
    const state = { selected: null, currency: 'POINTS', period: 'day', tab: 'chart' };
    const pointAmount = amount => Math.round(amount).toLocaleString('ko-KR') + ' P';
    const wonAmount = amount => (amount / pointsPerWon).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원';
    const money = amount => state.currency === 'POINTS' ? pointAmount(amount) : wonAmount(amount);
    const icon = name => '<i class="fa-solid fa-' + name + '" aria-hidden="true"></i>';
    const currencyControl = () => '<div class="iv-segment" role="group" aria-label="표시 단위"><button type="button" data-currency="KRW" aria-label="원화로 보기" aria-pressed="' + (state.currency === 'KRW') + '">원화</button><button type="button" data-currency="POINTS" aria-label="포인트로 보기" aria-pressed="' + (state.currency === 'POINTS') + '">포인트</button></div>';
    root.innerHTML = `
        <section id="investment-home" aria-label="투자 첫 화면">
            <header class="iv-top"><h1>엔조이증권</h1><span class="iv-example">시세 고정</span></header>
            <div class="iv-account-heading"><img src="assets/enjoy-symbol.png" alt=""><strong id="investment-account-name">멤버 지갑</strong><span id="investment-account-status"></span></div>
            <div class="iv-balances"><div class="iv-balance"><span>보유 포인트</span><div class="iv-point-balance" aria-live="polite"><strong id="investment-account-points">—</strong><span id="investment-account-equivalent" class="iv-balance-equivalent" hidden></span></div><small>100포인트 = 1원</small></div></div>
            <section class="iv-summary" aria-label="내 투자"><h2>내 투자</h2><p class="iv-total" id="investment-total">0 P</p><small>보유한 주식이 없어요</small></section>
            <div class="iv-toolbar"><div id="investment-list-currency"></div></div>
            <div id="investment-index-list" class="iv-indices" role="region" aria-label="대표 지수"></div>
            <div id="investment-stock-list"></div>
        </section>
        <section id="investment-detail" class="iv-detail" aria-label="종목 상세" hidden>
            <div class="iv-detail-nav"><button class="iv-back" id="investment-back" type="button" aria-label="종목 목록으로 돌아가기">${icon('chevron-left')}</button><span class="iv-example">시세 고정</span></div>
            <div class="iv-detail-heading"><h2 id="investment-name" tabindex="-1"></h2><span class="iv-ticker" id="investment-ticker"></span></div>
            <div class="iv-quote"><p class="iv-price"><span id="investment-price"></span><small class="iv-secondary-price" id="investment-secondary-price"></small></p><div id="investment-detail-currency"></div></div>
            <p class="iv-change">기준가 대비<span id="investment-change"></span></p>
            <div class="iv-tabs" role="tablist" aria-label="종목 상세 메뉴"><button type="button" id="investment-chart-tab" role="tab" data-tab="chart" aria-controls="investment-chart-panel" aria-selected="true">차트</button><button type="button" id="investment-orderbook-tab" disabled>호가</button><button type="button" id="investment-holdings-tab" disabled>내 주식</button><button type="button" id="investment-info-tab" role="tab" data-tab="info" aria-controls="investment-info-panel" aria-selected="false">종목정보</button></div>
            <div id="investment-chart-panel" class="iv-chart-panel" role="tabpanel" aria-labelledby="investment-chart-tab"><p class="iv-chart-caption">${icon('circle-check')} 자세한 차트</p><div class="iv-chart-wrap"><canvas id="investment-chart" role="img" aria-label="고정 시세 차트"></canvas></div><div class="iv-periods" role="group" aria-label="차트 기간"><button type="button" data-period="day" aria-label="오늘" aria-pressed="true">${icon('sun')}</button><button type="button" data-period="1d" aria-pressed="false">1일</button><button type="button" data-period="1w" aria-pressed="false">1주</button><button type="button" data-period="3m" aria-pressed="false">3달</button><button type="button" data-period="1y" aria-pressed="false">1년</button><button type="button" data-period="5y" aria-pressed="false">5년</button><button type="button" data-period="all" aria-pressed="false">전체</button></div></div>
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
    }
    function renderList() {
        $('investment-list-currency').innerHTML = currencyControl();
        $('investment-total').textContent = money(0);
        $('investment-index-list').innerHTML = stocks.filter(stock => stock.kind === 'index').map(stock => `<button type="button" class="iv-index" data-stock="${stock.id}" aria-label="${stock.name} 종목 상세 보기"><span class="iv-index-name"><small>지수</small><strong>${stock.name}</strong></span><strong class="iv-index-price">${money(stock.price)}</strong><small class="iv-flat">0.0%</small></button>`).join('');
        const listedStocks = stocks.filter(stock => stock.kind === 'stock');
        $('investment-stock-list').innerHTML = `<h2 class="iv-stocks-heading"><span>주식</span><small>${listedStocks.length}개 종목</small></h2>` + listedStocks.map(stock => `<button type="button" class="iv-stock" data-stock="${stock.id}" aria-label="${stock.name} 종목 상세 보기"><img src="${stock.image}" alt="" width="46" height="46"><span class="iv-stock-name"><strong>${stock.name}</strong><small>주식 · 거래 잠김</small></span><span class="iv-stock-price"><strong>${money(stock.price)}</strong><small class="iv-flat">${money(0)} (0.0%)</small></span></button>`).join('');
    }
    function renderDetail() {
        const stock = stocks.find(item => item.id === state.selected);
        if (!stock) return;
        $('investment-name').textContent = stock.name;
        $('investment-ticker').textContent = stock.ticker;
        $('investment-price').textContent = money(stock.price);
        $('investment-secondary-price').textContent = state.currency === 'POINTS' ? wonAmount(stock.price) : pointAmount(stock.price);
        $('investment-detail-currency').innerHTML = currencyControl();
        $('investment-change').textContent = money(0) + ' (0.0%)';
        $('investment-change').className = 'iv-flat';
        $('investment-info-tab').textContent = stock.kind === 'index' ? '지수정보' : '종목정보';
        $('investment-orderbook-tab').hidden = stock.kind === 'index';
        $('investment-holdings-tab').hidden = stock.kind === 'index';
        $('investment-trade-buttons').hidden = stock.kind === 'index';
        $('investment-trade-note').textContent = stock.kind === 'index' ? '엔조이는 시장 흐름을 나타내는 지수예요' : '현재 거래가 잠겨 있어요';
        $('investment-info-panel').innerHTML = `<dl><div><dt>${stock.kind === 'index' ? '지수명' : '종목명'}</dt><dd>${stock.name}</dd></div><div><dt>코드</dt><dd>${stock.ticker}</dd></div><div><dt>유형</dt><dd>${stock.kind === 'index' ? '대표 지수' : '주식 · 거래 잠김'}</dd></div><div><dt>현재가</dt><dd>${money(stock.price)}</dd></div>${stock.kind === 'stock' ? '<div><dt>보유 주식</dt><dd>0주</dd></div>' : ''}</dl><p>100포인트 = 1원<br>현재 가격은 고정되어 있어요.</p>`;
        root.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === state.tab)));
        $('investment-chart-panel').hidden = state.tab !== 'chart';
        $('investment-info-panel').hidden = state.tab !== 'info';
        root.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === state.period)));
        requestAnimationFrame(drawChart);
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
        ctx.scale(ratio, ratio);
        const w = rect.width, h = rect.height;
        const color = '#a6a6b1';
        const chartW = w * .74, chartY = h * .46;
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(0, chartY); ctx.lineTo(chartW, chartY); ctx.stroke();
        ctx.fillStyle = color; ctx.globalAlpha = .1;
        ctx.beginPath(); ctx.arc(chartW, chartY, 9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(chartW, chartY, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = '12px Pretendard, -apple-system, sans-serif';
        ctx.textAlign = 'left'; ctx.fillText('최고·최저 ' + money(stock.price), 0, chartY - 22);
        ctx.strokeStyle = '#4c4c58'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(0,h*.83); ctx.lineTo(w,h*.83); ctx.stroke();
        canvas.setAttribute('aria-label', stock.name + ' 고정 시세 차트, 현재가·최고·최저 ' + money(stock.price) + ', 변동 0.0%');
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
        else if (button.dataset.tab) { state.tab = button.dataset.tab; renderDetail(); }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state.selected && !root.classList.contains('hidden') && !$('meeting-screen').classList.contains('hidden')) showList(true);
    });
    window.resetInvestmentView = () => showList(false);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawChart()).observe($('investment-chart'));
    else window.addEventListener('resize', drawChart);
    window.refreshInvestmentAccount = refreshAccount;
    window.addEventListener('enjoy-auth-ready', refreshAccount);
    refreshAccount();
    renderList();
})();
