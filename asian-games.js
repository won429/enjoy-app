(function () {
    'use strict';
    const competition = window.enjoyBaseballCompetition;
    const countries = [
        ['대한민국', 'KOR'], ['대만', 'TPE'], ['홍콩', 'HKG'], ['태국', 'THA'],
        ['일본', 'JPN'], ['중국', 'CHN'], ['필리핀', 'PHI'], ['팔레스타인', 'PLE']
    ];
    const firestoreBase = 'https://firestore.googleapis.com/v1/projects/enjoykbooo/databases/(default)/documents/';
    const apiKey = 'AIzaSyCQt6_wZA5oXTDVBlK0R6Rm2EXMfzCsOx0';
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const initialMonth = today.startsWith('2026-09') || today.startsWith('2026-10') ? today.slice(0, 7) : '2026-09';
    const state = { month: initialMonth, date: today.startsWith(initialMonth) ? today : initialMonth + '-01', country: 'KOR', games: [], loading: false, error: '', request: 0, active: true };
    const $ = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    function countryCode(name) {
        const flag = competition.flags[competition.teamName(name)];
        return flag ? flag.split('/').pop().replace('.png', '') : '';
    }
    function normalize(raw) {
        return Object.assign({}, raw, {
            id: raw.id == null ? '' : String(raw.id),
            team1: competition.teamName(raw.awayTeam || raw.team1),
            team2: competition.teamName(raw.homeTeam || raw.team2),
            time: raw.gameTime || raw.time || '',
            gameStatus: raw.gameStatus || raw.status || '경기전'
        });
    }
    function mergeGames(documents) {
        const games = new Map();
        documents.forEach(doc => {
            (Array.isArray(doc?.games) ? doc.games : []).forEach(raw => {
                const game = normalize(raw);
                const key = game.id || [game.date, game.team1, game.team2, game.time].join('_');
                games.set(key, Object.assign({}, games.get(key), raw));
            });
        });
        return Array.from(games.values()).map(normalize).filter(game => competition.isAsianGames(game) && /^\d{4}-\d{2}-\d{2}$/.test(game.date || ''))
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    }
    function decode(value) {
        if (value.stringValue !== undefined) return value.stringValue;
        if (value.integerValue !== undefined) return Number(value.integerValue);
        if (value.doubleValue !== undefined) return value.doubleValue;
        if (value.booleanValue !== undefined) return value.booleanValue;
        if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
        if (value.mapValue) return decodeFields(value.mapValue.fields || {});
        return null;
    }
    function decodeFields(fields) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)])); }
    async function getDocument(path) {
        const response = await fetch(firestoreBase + path + '?key=' + encodeURIComponent(apiKey), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('경기정보 조회 실패');
        const json = await response.json();
        return json.fields ? decodeFields(json.fields) : null;
    }
    function canceled(game) {
        return /취소|우천|노게임|노 게임|서스펜디드|연기/.test([game.gameStatus, game.status, game.inning, game.cancelReason].join(' '));
    }
    function teamMatches(game, code) { return !code || countryCode(game.team1) === code || countryCode(game.team2) === code; }
    function displayDate(date) {
        const parsed = new Date(date + 'T12:00:00+09:00');
        return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' }).format(parsed);
    }
    function flag(name) {
        const src = competition.flags[name];
        return src ? '<img src="' + escape(src) + '" width="46" height="46" alt="' + escape(name) + ' 국기">' : '';
    }
    function card(game) {
        const isCanceled = canceled(game);
        const hasScore = !isCanceled && ['경기중', '종료'].includes(game.gameStatus);
        const status = isCanceled ? (game.gameStatus === '경기전' ? '취소 / 연기' : game.gameStatus) : game.gameStatus;
        const score = hasScore ? escape(game.awayScore ?? '–') + ' : ' + escape(game.homeScore ?? '–') : escape(game.time || '미정');
        const tag = game.id ? 'button' : 'div';
        const action = game.id ? ' type="button" data-match="' + escape(game.id) + '" data-date="' + game.date + '" aria-label="' + escape(displayDate(game.date) + ' ' + game.team1 + ' 대 ' + game.team2 + ' 경기정보') + '"' : '';
        return '<' + tag + action + ' class="match-card" style="--away-soft:' + (competition.colors[game.team1] || '#64748B') + '18;--home-soft:' + (competition.colors[game.team2] || '#64748B') + '18">' +
            '<div class="match-meta"><span>' + displayDate(game.date) + '</span><span class="match-status">' + escape(status) + '</span></div>' +
            '<div class="match-main"><div class="match-team">' + flag(game.team1) + '<strong>' + escape(game.team1) + '</strong></div>' +
            '<div class="match-center"><b>' + score + '</b><small>' + escape(hasScore ? (game.inning || game.gameStatus) : '한국 시간') + '</small></div>' +
            '<div class="match-team">' + flag(game.team2) + '<strong>' + escape(game.team2) + '</strong></div></div>' +
            '<div class="match-foot"><span>' + escape(game.stadium || game.ballpark || '경기장 미정') + '</span><span>' + (game.id ? '경기정보 →' : '상세정보 준비 중') + '</span></div></' + tag + '>';
    }
    function renderCountries() {
        $('country-tabs').innerHTML = '<button class="country-tab" data-country="" aria-pressed="' + (state.country === '') + '"><span class="all-icon">ALL</span>전체</button>' + countries.map(([name, code]) =>
            '<button class="country-tab" data-country="' + code + '" aria-pressed="' + (state.country === code) + '">' + flag(name) + escape(name) + '</button>').join('');
    }
    function renderDates(scroll) {
        const [year, month] = state.month.split('-').map(Number);
        $('month-label').textContent = year + '년 ' + month + '월';
        const days = new Date(year, month, 0).getDate();
        const datesWithGames = new Set(state.games.filter(game => teamMatches(game, state.country)).map(game => game.date));
        $('date-rail').innerHTML = Array.from({length:days}, (_, i) => {
            const date = state.month + '-' + String(i + 1).padStart(2, '0');
            const weekday = ['일','월','화','수','목','금','토'][new Date(year, month - 1, i + 1).getDay()];
            return '<button class="date-button' + (datesWithGames.has(date) ? ' has-games' : '') + '" data-date="' + date + '" aria-pressed="' + (date === state.date) + '" aria-label="' + escape(displayDate(date) + (datesWithGames.has(date) ? ' 경기 있음' : '')) + '"><span>' + weekday + '</span><b>' + (i + 1) + '</b></button>';
        }).join('');
        if (scroll) $('date-rail').querySelector('[aria-pressed="true"]')?.scrollIntoView({behavior:'instant', block:'nearest', inline:'center'});
    }
    function render() {
        const games = state.games.filter(game => game.date === state.date && teamMatches(game, state.country));
        $('day-label').textContent = displayDate(state.date);
        $('game-count').textContent = state.loading ? '' : games.length + '경기';
        $('refresh').disabled = state.loading;
        $('load-status').textContent = state.loading ? '경기 정보를 불러오는 중입니다.' : state.error;
        $('game-list').innerHTML = games.length ? games.map(card).join('') : '<p class="state-message">' + (state.loading ? '잠시만 기다려 주세요.' : state.error ? '새로고침을 눌러 다시 확인해 주세요.' : '<strong>등록된 경기가 없습니다.</strong>다른 날짜나 국가를 선택해 보세요.') + '</p>';
        const next = state.games.find(game => game.date >= today && teamMatches(game,'KOR') && !canceled(game) && game.gameStatus !== '종료');
        $('next-game').innerHTML = next ? card(next) : '<p class="state-message">' + (state.loading ? '대한민국 경기를 확인하고 있어요.' : state.error ? '경기 일정을 확인하지 못했어요.' : '<strong>다음 경기를 기다리고 있어요.</strong>등록된 대한민국 일정이 생기면 여기에 표시됩니다.') + '</p>';
    }
    async function load(selectGame) {
        const request = ++state.request;
        const requestedMonth = state.month;
        const requestedDate = state.date;
        state.loading = true; state.error = ''; render();
        // Include the tournament months so the next Korea game is independent of the calendar filter.
        const monthKeys = Array.from(new Set([requestedMonth, '2026-09', '2026-10']));
        const paths = monthKeys.map(month => 'schedule/' + month).concat(['games/' + requestedDate, 'live/today']);
        const results = await Promise.allSettled(paths.map(getDocument));
        if (request !== state.request) return;
        state.loading = false;
        const selectedMonthResult = results[monthKeys.indexOf(requestedMonth)];
        if (selectedMonthResult.status === 'rejected') {
            state.error = '일정을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.';
            render(); return;
        }
        state.games = mergeGames(results.filter(result => result.status === 'fulfilled').map(result => result.value));
        if (results.some(result => result.status === 'rejected')) state.error = '일부 경기정보를 갱신하지 못했어요. 새로고침해 주세요.';
        if (selectGame) {
            const matching = state.games.filter(game => game.date.startsWith(state.month) && teamMatches(game,state.country));
            if (!matching.some(game => game.date === state.date)) {
                const first = matching.find(game => game.date >= today) || matching[0];
                if (first && first.date !== state.date) {
                    state.date = first.date;
                    renderDates(true); render();
                    return load(false);
                }
            }
        }
        renderDates(selectGame); render();
    }
    function shiftMonth(delta) {
        const [year, month] = state.month.split('-').map(Number);
        const target = new Date(year, month - 1 + delta, 1);
        state.month = target.getFullYear() + '-' + String(target.getMonth() + 1).padStart(2,'0');
        state.date = state.month + '-01';
        state.games = []; renderDates(true); load(true);
    }
    function closeDetail() {
        $('detail-dialog').close(); $('detail-frame').removeAttribute('src');
    }
    function init() {
        renderCountries(); renderDates(true); load(true);
        $('back').addEventListener('click', () => {
            if (window.parent !== window) window.parent.postMessage({type:'enjoy-asian-games-close'}, window.location.origin);
            else window.location.href = 'index.html';
        });
        $('refresh').addEventListener('click', () => load(false));
        $('prev-month').addEventListener('click', () => shiftMonth(-1));
        $('next-month').addEventListener('click', () => shiftMonth(1));
        $('country-tabs').addEventListener('click', event => {
            const button = event.target.closest('[data-country]'); if (!button) return;
            state.country = button.dataset.country;
            $('country-tabs').querySelectorAll('[data-country]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.country === state.country)));
            const matching = state.games.filter(game => game.date.startsWith(state.month) && teamMatches(game,state.country));
            const next = matching.find(game => game.date === state.date) || matching.find(game => game.date >= state.date) || matching[0];
            if (next && next.date !== state.date) { state.date = next.date; load(false); }
            renderDates(true); render();
        });
        $('date-rail').addEventListener('click', event => {
            const button = event.target.closest('[data-date]'); if (!button) return;
            state.date = button.dataset.date; renderDates(false); load(false);
            $('date-rail').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
        });
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-match]'); if (!button) return;
            const id = button.dataset.match, date = button.dataset.date;
            if (window.parent !== window) window.parent.postMessage({type:'enjoy-asian-games-open-match', id, date}, window.location.origin);
            else {
                $('detail-frame').src = 'baseball-game-detail.html?matchId=' + encodeURIComponent(id) + '&matchDate=' + encodeURIComponent(date);
                $('detail-dialog').showModal();
            }
        });
        $('close-detail').addEventListener('click', closeDetail);
        $('detail-dialog').addEventListener('cancel', () => $('detail-frame').removeAttribute('src'));
        window.addEventListener('message', event => {
            if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'enjoy-asian-games-visibility') return;
            state.active = Boolean(event.data.visible);
            if (state.active) load(false);
        });
        setInterval(() => { if (state.active && !document.hidden && !state.loading) load(false); }, 30000);
    }
    init();
})();
