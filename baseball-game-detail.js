(function () {
    'use strict';

    const firebaseConfig = {
        apiKey: "AIzaSyCQt6_wZA5oXTDVBlK0R6Rm2EXMfzCsOx0",
        authDomain: "enjoykbooo.firebaseapp.com",
        projectId: "enjoykbooo",
        storageBucket: "enjoykbooo.firebasestorage.app",
        messagingSenderId: "878790224198",
        appId: "1:878790224198:web:56a3b91d2538e11627dd47"
    };
    const _FS_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
    const _FS_KEY = firebaseConfig.apiKey;

    function _fsDecode(v) {
        if (!v) return null;
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return Number(v.integerValue);
        if (v.doubleValue !== undefined) return v.doubleValue;
        if (v.booleanValue !== undefined) return v.booleanValue;
        if (v.nullValue !== undefined) return null;
        if (v.timestampValue !== undefined) return v.timestampValue;
        if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(_fsDecode);
        if (v.mapValue !== undefined) return _fsDecodeFields(v.mapValue.fields || {});
        return null;
    }
    function _fsDecodeFields(f) {
        let o = {};
        for (let k in f) o[k] = _fsDecode(f[k]);
        return o;
    }
    async function _fsGetDoc(path) {
        const r = await fetch(`${_FS_BASE}/${path}?key=${_FS_KEY}`, { cache: 'no-store' });
        if (!r.ok) {
            if (r.status === 404) return null;
            throw new Error('fs ' + r.status);
        }
        const j = await r.json();
        return j.fields ? _fsDecodeFields(j.fields) : null;
    }

    let scheduleData = [];
    let rankingData = [];
    let liveDataStore = {};
    let currentPopupMatchId = null;
    let currentGameInfoTab = 'lineup';
    let currentGameRecordInning = 1;

    const initialRankingData = [
        {rank:'-',team:'KIA',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'삼성',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'LG',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'두산',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'KT',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'SSG',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'롯데',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'한화',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'NC',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'},
        {rank:'-',team:'키움',w:0,d:0,l:0,winRate:'-',gb:'-',streak:'-'}
    ];
    const teamColors = {'LG':'bg-[#C30452]', '두산':'bg-[#131230]', 'KIA':'bg-[#EA0029]', '삼성':'bg-[#074CA1]', 'SSG':'bg-[#CE0E2D]', '롯데':'bg-[#041E42]', '한화':'bg-[#FF6600]', 'KT':'bg-[#000000]', 'NC':'bg-[#315288]', '키움':'bg-[#820024]', '나눔':'bg-[#002038]', '드림':'bg-[#90C0E0]', '북부 올스타':'bg-[#123B8D]', '남부 올스타':'bg-[#13B9D1]'};
    const teamHex = {'LG':'#C30452', '두산':'#131230', 'KIA':'#EA0029', '삼성':'#074CA1', 'SSG':'#CE0E2D', '롯데':'#041E42', '한화':'#FF6600', 'KT':'#000000', 'NC':'#315288', '키움':'#820024', '나눔':'#002038', '드림':'#90C0E0', '북부 올스타':'#123B8D', '남부 올스타':'#13B9D1'};
    const teamLogos = {'삼성':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/samsung_logo.png', 'KIA':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/kia_logoo.png', '롯데':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/lotteegi.png', 'NC':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/ncdin.png', 'LG':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/lgtwins.png', '두산':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/doosa.png', 'SSG':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/ssglan.png', 'KT':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/kt_logo.png', '한화':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/hanwha_logo.png', '키움':'https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/kiwoom.png'};
    const ALLSTAR_DATES = new Set(['2026-07-10', '2026-07-11']);
    const ALLSTAR_LOGO_URL = 'https://qlotfqlu5749.edge.naverncp.com/KBO_IMAGE/KBOAllstar/Client/resources/images/common/img_logo.png';
    const FUTURES_ALLSTAR_LOGO_URL = ALLSTAR_LOGO_URL;
    const isAllstarDate = date => ALLSTAR_DATES.has(date);
    const uiTeamLogo = (team, imgCls, divCls, extraCls = '') => teamLogos[team]
        ? `<img src="${teamLogos[team]}" class="${imgCls} object-contain ${extraCls}">`
        : `<div class="${divCls} rounded-full ${teamColors[team] || 'bg-gray-500'} flex items-center justify-center text-white text-[10px] font-bold ${extraCls}">${team.substring(0,1)}</div>`;
    const teamWinHex = {'LG':'#E4376E', '두산':'#3D5AFE', 'KIA':'#FF2D55', '삼성':'#2F7BE0', 'SSG':'#E63950', '롯데':'#3B6FD4', '한화':'#FF7A1A', 'KT':'#9AA0A6', 'NC':'#4A78C0', '키움':'#C23A6B', '나눔':'#002038', '드림':'#90C0E0', '북부 올스타':'#123B8D', '남부 올스타':'#13B9D1'};
    const KBO_TEAMS = ['LG','두산','KIA','삼성','SSG','롯데','한화','KT','NC','키움'];
    const CLASSIC_SERIES_DATES = new Set(['2026-05-22', '2026-05-23', '2026-05-24', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19']);
    let teamStats = {};
    const currentDate = new Date();
    const todayStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
    const params = new URLSearchParams(location.search);
    let selectedTeam = params.get('theme');
    if (selectedTeam !== 'KIA' && selectedTeam !== '삼성') selectedTeam = 'KIA';

    function openTicketPopup() {}
        function isMatchup(m, a, b) {
            return m && ((m.team1 === a && m.team2 === b) || (m.team1 === b && m.team2 === a));
        }

        function isClassicSeriesGame(m) {
            return Boolean(m && CLASSIC_SERIES_DATES.has(m.date) && isMatchup(m, '롯데', '삼성'));
        }

        function classicSeriesDateLabel(m) {
            return m && m.date && m.date.startsWith('2026-07') ? '7.16(목)-19(일)' : '5.22(금)-24(일)';
        }

        function hasHangulBatchim(text) {
            const s = String(text || '').trim();
            if (!s) return false;
            const code = s.charCodeAt(s.length - 1);
            return code >= 0xAC00 && code <= 0xD7A3 && ((code - 0xAC00) % 28) !== 0;
        }

        function teamSubject(team) {
            return `${team}${hasHangulBatchim(team) ? '이' : '가'}`;
        }

        function teamAnd(team) {
            return `${team}${hasHangulBatchim(team) ? '과' : '와'}`;
        }

        // 완료된 경기들로부터 팀별 전적/최근 흐름/상대전적을 집계한다. (과거 데이터 파일 기반)
        function buildTeamStats() {
            const s = {};
            KBO_TEAMS.forEach(t => s[t] = { w: 0, l: 0, d: 0, results: [], dates: [], h2h: {} });
            let finished = scheduleData.filter(m => {
                let l = liveDataStore[m.id];
                if (!l || l.gameStatus !== '종료') return false;
                let iC = (l.inning && (l.inning.includes('취소') || l.inning.includes('우취')));
                return !iC;
            }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "00:00").localeCompare(b.time || "00:00"));

            finished.forEach(m => {
                let l = liveDataStore[m.id];
                let away = m.team1, home = m.team2;
                if (!s[home] || !s[away]) return;
                let a = parseInt(l.awayScore || 0), h = parseInt(l.homeScore || 0);
                let hWin = h > a, aWin = a > h;
                if (hWin) { s[home].w++; s[away].l++; } else if (aWin) { s[away].w++; s[home].l++; } else { s[home].d++; s[away].d++; }
                s[home].results.push(hWin ? 'W' : aWin ? 'L' : 'D');
                s[away].results.push(aWin ? 'W' : hWin ? 'L' : 'D');
                s[home].dates.push(m.date); s[away].dates.push(m.date);
                s[home].h2h[away] = s[home].h2h[away] || { w: 0, l: 0, d: 0 };
                s[away].h2h[home] = s[away].h2h[home] || { w: 0, l: 0, d: 0 };
                if (hWin) { s[home].h2h[away].w++; s[away].h2h[home].l++; }
                else if (aWin) { s[away].h2h[home].w++; s[home].h2h[away].l++; }
                else { s[home].h2h[away].d++; s[away].h2h[home].d++; }
            });
            teamStats = s;
        }

        // 집계된 전적으로 정규리그 순위표를 만든다. (firestore 대신 js 파일 기반으로 변동)
        function computeRankingFromHistory() {
            if (!teamStats || Object.keys(teamStats).length === 0) return null;
            let any = false;
            let rows = KBO_TEAMS.map(team => {
                let st = teamStats[team] || { w: 0, l: 0, d: 0, results: [] };
                if (st.w + st.l + st.d > 0) any = true;
                let wr = (st.w + st.l) > 0 ? st.w / (st.w + st.l) : 0;
                return { team, w: st.w, d: st.d, l: st.l, wrNum: wr };
            });
            if (!any) return null;
            rows.sort((a, b) => (b.wrNum - a.wrNum) || (b.w - a.w) || (a.l - b.l));
            let first = rows[0];
            return rows.map((r, i) => {
                let gb = ((first.w - r.w) + (r.l - first.l)) / 2;
                let res = (teamStats[r.team] || {}).results || [];
                let streak = '-';
                if (res.length) {
                    let j = res.length - 1;
                    while (j >= 0 && res[j] === 'D') j--;
                    if (j >= 0) {
                        let t = res[j], c = 0;
                        while (j >= 0) {
                            if (res[j] === 'D') { j--; continue; }
                            if (res[j] !== t) break;
                            c++; j--;
                        }
                        streak = c + (t === 'W' ? '승' : '패');
                    }
                }
                return {
                    rank: String(i + 1), team: r.team, w: r.w, d: r.d, l: r.l,
                    winRate: (r.w + r.l) > 0 ? r.wrNum.toFixed(3) : '0.000',
                    gb: i === 0 ? '-' : (Number.isInteger(gb) ? String(gb) : gb.toFixed(1)),
                    streak: streak
                };
            });
        }

        // 순위표를 과거 데이터 기반으로 갱신. (가능하면 firestore 대신 사용)
        function refreshRankingFromHistory() {
            buildTeamStats();
            let rk = computeRankingFromHistory();
            if (rk && rk.length) { rankingData = rk; return true; }
            return false;
        }

        // ── 승리 확률 모델 ─────────────────────────────────────────────────────────
        function _teamWr(t) { let s = teamStats[t]; return (s && (s.w + s.l) > 0) ? s.w / (s.w + s.l) : 0.5; }
        function _teamForm(t) { let s = teamStats[t]; if (!s || !s.results.length) return 0.5; let r = s.results.slice(-10); let w = r.filter(x => x === 'W').length, l = r.filter(x => x === 'L').length; return (w + l) === 0 ? 0.5 : w / (w + l); }
        // 최근 7일(약 1주일) 승패 흐름 — 날짜 기준으로 집계
        function _teamFormWeek(t) {
            let s = teamStats[t]; if (!s || !s.results.length || !s.dates) return 0.5;
            let cutoff = new Date(todayStr); cutoff.setDate(cutoff.getDate() - 7);
            let cs = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
            let w = 0, l = 0;
            for (let i = 0; i < s.results.length; i++) { if (s.dates[i] && s.dates[i] >= cs) { if (s.results[i] === 'W') w++; else if (s.results[i] === 'L') l++; } }
            return (w + l) === 0 ? 0.5 : w / (w + l);
        }
        function _teamH2H(home, away) { let s = teamStats[home]; if (s && s.h2h && s.h2h[away]) { let x = s.h2h[away]; return { hw: x.w, aw: x.l, d: x.d || 0, n: x.w + x.l }; } return { hw: 0, aw: 0, d: 0, n: 0 }; }
        function _normCdf(z) { let t = 1 / (1 + 0.2316419 * Math.abs(z)); let d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }

        function _probabilityClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
        function _probabilityPitcherName(l, side) {
            return _pitcherName(l[side + 'StarterDetail'] || l[side + 'Starter'] || l[side + 'PitcherDetail'] || l[side + 'Pitcher']);
        }
        function _pitcherProbabilityStrength(l, side, team, opp) {
            const record = pitcherRecords(_probabilityPitcherName(l, side), team, opp);
            const seasonGames = record.seasonW + record.seasonL;
            const vsGames = record.vsW + record.vsL;
            const seasonRate = seasonGames ? record.seasonW / seasonGames : 0.5;
            const vsRate = vsGames ? record.vsW / vsGames : 0.5;
            return (seasonRate - 0.5) * 0.28 + (vsRate - 0.5) * 0.12 * Math.min(1, vsGames / 3);
        }
        function _latestRecordedHomeProbability(m, l) {
            let selected = null, selectedRelay = -1;
            for (const batter of _recordBatters(l)) {
                const probability = Number(_recordValue(batter, ['winProbability', 'winningProbability', '승리확률']));
                const team = String(_recordValue(batter, ['winProbabilityTeam', 'probabilityTeam', '승리확률팀']) || '');
                if (!Number.isFinite(probability) || probability < 0 || probability > 100 || (team !== m.team1 && team !== m.team2)) continue;
                const relay = Number(_recordValue(batter, ['relayNo', 'sequence', 'seq']) || 0);
                if (selected === null || relay > selectedRelay) {
                    selected = team === m.team2 ? probability / 100 : 1 - probability / 100;
                    selectedRelay = relay;
                }
            }
            return selected;
        }
        function _liveSituationLead(l, lead, isTop) {
            const number = key => Number(l[key] || 0);
            const statLead = _probabilityClamp(
                (number('homeHit') - number('awayHit')) * 0.035 +
                (number('awayError') - number('homeError')) * 0.07 +
                (number('homeBase') - number('awayBase')) * 0.025,
                -0.5, 0.5
            );
            const outs = _probabilityClamp(number('out'), 0, 3);
            const outFactor = [1, 0.68, 0.34, 0][outs];
            const runnerValue = (l.base1 ? 0.30 : 0) + (l.base2 ? 0.50 : 0) + (l.base3 ? 0.72 : 0);
            const countValue = _probabilityClamp((number('ball') - number('strike')) * 0.04, -0.08, 0.12);
            const offenseSide = isTop ? 'away' : 'home';
            const batterName = _curBatterName(l, offenseSide);
            const averageRaw = _batterAverageOf(l, offenseSide, batterName);
            const average = averageRaw === '' ? NaN : Number(averageRaw);
            const batterValue = Number.isFinite(average) ? _probabilityClamp((average - 0.25) * 0.9, -0.14, 0.16) : 0;
            const defendingPitchCount = number(isTop ? 'homePitcherCount' : 'awayPitcherCount');
            const fatigueValue = _probabilityClamp((defendingPitchCount - 75) / 100, 0, 0.35);
            const offenseThreat = (runnerValue + countValue + batterValue + fatigueValue) * outFactor;
            return lead + statLead + (isTop ? -offenseThreat : offenseThreat);
        }

        // 전적·최근 흐름·상대전적·선발 + 실시간 점수/이닝/주자/카운트/타자/투구 기록을 종합한 승리 확률(%)
        function winProbability(m, l) {
            const sig = x => 1 / (1 + Math.exp(-x));
            const home = m.team2, away = m.team1;
            let hWr = _teamWr(home), aWr = _teamWr(away);
            let logit = (hWr - aWr) * 2.4 + 0.16; // 팀 전력차 + 홈 이점
            let h = _teamH2H(home, away);
            if (h.n > 0) logit += ((h.hw / h.n) - 0.5) * 0.7 * Math.min(1, h.n / 6); // 시즌 상대전적
            logit += (_teamForm(home) - _teamForm(away)) * 0.55; // 최근 10경기 흐름
            logit += (_teamFormWeek(home) - _teamFormWeek(away)) * 0.5; // 최근 1주일(7일) 흐름
            logit += _pitcherProbabilityStrength(l, 'home', home, away) - _pitcherProbabilityStrength(l, 'away', away, home); // JS 기록의 선발 시즌/상대 승패
            let pre = Math.max(0.1, Math.min(0.9, sig(logit)));

            let status = l.gameStatus;
            if (status === '종료') {
                let a = parseInt(l.awayScore || 0), hh = parseInt(l.homeScore || 0);
                let hp = a === hh ? 50 : (hh > a ? 100 : 0);
                return { home: hp, away: 100 - hp, decided: true };
            }
            if (status !== '경기중') {
                let hp = Math.round(pre * 100);
                return { home: hp, away: 100 - hp };
            }
            // 경기중: 점수차 + 남은 이닝으로 실시간 보정
            let a = parseInt(l.awayScore || 0), hh = parseInt(l.homeScore || 0), lead = hh - a;
            let innNum = parseInt((l.inning || '').replace(/[^0-9]/g, '')) || 1;
            let isTop = (l.inning || '').includes('초');
            let elapsed = Math.min(9, (innNum - 1) + (isTop ? 0 : 0.5));
            let remInn = Math.max(0.3, 9 - elapsed);
            let progress = Math.max(0, Math.min(1, elapsed / 9));
            if (innNum > 9) { progress = 1; remInn = 0.5; } // 연장
            let sigma = 1.6 * Math.sqrt(remInn);
            let situationLead = _liveSituationLead(l, lead, isTop);
            let inGame = _normCdf(situationLead / sigma);
            let w = Math.pow(progress, 0.65); // 경기가 진행될수록 현재 점수(흐름)에 더 가중
            let hp = (1 - w) * pre + w * inGame;
            const recordedHomeProbability = _latestRecordedHomeProbability(m, l);
            if (recordedHomeProbability !== null) hp = hp * 0.65 + recordedHomeProbability * 0.35; // 기록 탭의 최신 타석 승리확률 반영
            hp = Math.max(0.02, Math.min(0.98, hp));
            let hpI = Math.round(hp * 100);
            return { home: hpI, away: 100 - hpI };
        }

        // 경기정보(스코어보드) 아래에 들어갈 승리 확률 막대
        function winProbBarHtml(m, l) {
            let st = (l && l.gameStatus) || '경기전';
            if (st !== '경기전' && st !== '경기중') return ''; // 종료/취소 제외
            let iC = l && ((l.gameStatus && (l.gameStatus.includes('취소') || l.gameStatus.includes('우취'))) || (l.inning && (l.inning.includes('취소') || l.inning.includes('우취'))));
            if (iC) return '';
            let p = winProbability(m, l);
            let c1 = teamWinHex[m.team1] || '#9AA0A6', c2 = teamWinHex[m.team2] || '#9AA0A6';
            let note = st === '경기중' ? '실시간 승리 확률' : '예상 승리 확률';
            let live = st === '경기중', atk = live ? ((l.inning || '').includes('말') ? 'home' : 'away') : '';
            let lc = live ? ` wp-live wp-atk-${atk}` : '', front = live ? `<div class="wp-home" style="left:${p.away}%"></div><div class="wp-front" style="left:${p.away}%"></div>` : '';
            return `<div class="w-full mb-6">
                <div class="text-[12px] mb-3 wp-name wp-note">${note} <span class="wp-byline">with 엔조이 비서실장</span></div>
                <div class="flex items-baseline justify-between mb-2.5">
                    <div class="flex items-baseline gap-1.5">
                        <span class="text-[26px] font-bold leading-none wp-num" style="color:${c1}">${p.away}%</span>
                        <span class="text-[13px] font-semibold wp-name">${m.team1}</span>
                    </div>
                    <div class="flex items-baseline gap-1.5">
                        <span class="text-[13px] font-semibold wp-name">${m.team2}</span>
                        <span class="text-[26px] font-bold leading-none wp-num" style="color:${c2}">${p.home}%</span>
                    </div>
                </div>
                <div class="relative w-full h-2.5 rounded-full overflow-hidden${lc}" style="background:${c2}">
                    <div class="wp-bar" style="width:${p.away}%;background:${c1}"></div>
                    ${front}
                </div>
            </div>`;
        }

        // 홈화면 배너용 슬림 승리 확률 막대
        function winProbBarMini(m, l) {
            let st = (l && l.gameStatus) || '경기전';
            if (st !== '경기전' && st !== '경기중') return '';
            let iC = l && ((l.gameStatus && (l.gameStatus.includes('취소') || l.gameStatus.includes('우취'))) || (l.inning && (l.inning.includes('취소') || l.inning.includes('우취'))));
            if (iC) return '';
            let p = winProbability(m, l);
            let c1 = teamWinHex[m.team1] || '#9AA0A6', c2 = teamWinHex[m.team2] || '#9AA0A6';
            let live = st === '경기중', atk = live ? ((l.inning || '').includes('말') ? 'home' : 'away') : '';
            let lc = live ? ` wp-live wp-atk-${atk}` : '', extra = live ? `<div class="wp-home" style="left:${p.away}%"></div><div class="wp-front" style="left:${p.away}%"></div>` : '';
            return `<div class="relative z-10 w-full flex items-center gap-2.5 px-1 mt-2">
                <span class="text-[11px] font-bold w-8 text-left wp-num" style="color:${c1}">${p.away}%</span>
                <div class="relative flex-1 h-1.5 rounded-full overflow-hidden${lc}" style="background:${c2}">
                    <div class="wp-bar" style="width:${p.away}%;background:${c1}"></div>
                    ${extra}
                </div>
                <span class="text-[11px] font-bold w-8 text-right wp-num" style="color:${c2}">${p.home}%</span>
            </div>`;
        }

        // [추가] 투수 투구 손(우투/좌투) — 파이어베이스 투수 데이터에 입력된 값(batsThrows)이 있으면 표시.
        function _throwsOf(raw) {
            return (raw && typeof raw === 'object' && raw.batsThrows) ? raw.batsThrows : '';
        }
        // [추가] 현재(마운드 위) 투수 이름 — 라이브에서 갱신되는 awayPitcher 문자열을 우선(불펜 교체 반영). 없으면 상세 객체 이름.
        function _curPitcherName(l, side) {
            let s = l[side + 'Pitcher'];
            if (typeof s === 'string' && s && s !== '-') return s;
            let d = l[side + 'PitcherDetail'];
            return (d && d.name) || (typeof s === 'string' && s ? s : '-');
        }

        // 실시간 타자/교체 선수 데이터는 관리자 페이지 필드명이 조금 달라도 읽을 수 있게 정규화한다.
        function _lineupPlayerName(raw) {
            if (raw && typeof raw === 'object') return raw.name || raw.playerName || raw.inName || (raw.player && raw.player.name) || '';
            return raw || '';
        }
        function _lineupOrderOf(raw, fallback = null) {
            if (!raw || typeof raw !== 'object') return fallback;
            let value = raw._lineupOrder ?? raw.battingOrder ?? raw.order ?? raw.slot ?? raw.lineupOrder ?? raw.battingSlot;
            let number = parseInt(value, 10);
            return Number.isFinite(number) && number > 0 ? number : fallback;
        }
        function _substitutionRoleOf(raw) {
            if (!raw || typeof raw !== 'object') return '';
            return raw.role || raw.changeType || raw.substitutionType || raw.entryType || '';
        }
        function _isSubstitutionPlayer(raw) {
            if (!raw || typeof raw !== 'object') return false;
            if (raw._isSubstitute || raw.isSubstitute || raw.substitute || raw.isReplacement || raw.replacement || raw.entered || raw.changed) return true;
            let role = _substitutionRoleOf(raw);
            return ['교체', '대타', '대주자', '수비교체', '투수교체'].includes(role);
        }
        function _lineupWithSubstitutions(l, side) {
            let detail = l[side + 'LineupDetail'];
            let rawLineup = Array.isArray(detail) && detail.length ? detail : (Array.isArray(l[side + 'Lineup']) ? l[side + 'Lineup'] : []);
            let lineup = rawLineup.map((raw, index) => {
                let player = raw && typeof raw === 'object' ? { ...raw } : { name: raw };
                let explicitOrder = _lineupOrderOf(player, null);
                player._lineupOrder = explicitOrder || index + 1;
                player._hasExplicitLineupOrder = Boolean(explicitOrder);
                player.position = _normalizeDefensePosition(player.position);
                player._lineupDisplayPosition = player.position;
                if (_isSubstitutionPlayer(raw)) player._isSubstitute = true;
                return player;
            });
            // 일부 경기 데이터는 교체 선수를 LineupDetail에 바로 이어 붙인다.
            // 같은 타순의 직전 선수를 내보내고, 포지션이 비어 있으면 그 수비 위치를 승계한다.
            let embeddedActiveSlots = new Map();
            lineup.forEach((player, index) => {
                let order = _lineupOrderOf(player, index + 1);
                let previous = player._hasExplicitLineupOrder ? embeddedActiveSlots.get(order) : lineup[index - 1];
                if (_isSubstitutionPlayer(player) && previous && previous !== player) {
                    if (!player._hasExplicitLineupOrder) {
                        order = _lineupOrderOf(previous, order);
                        player._lineupOrder = order;
                    }
                    if (!player.position) player.position = previous.position || '';
                    if (!player._lineupDisplayPosition) player._lineupDisplayPosition = player.position;
                    previous._isReplaced = true;
                }
                embeddedActiveSlots.set(order, player);
            });
            let canonicalChanges = l[side + 'Substitutions'];
            let changeLists = Array.isArray(canonicalChanges) ? [canonicalChanges] : [
                l[side + 'Substitution'], l[side + 'Changes'], l[side + 'Replacements']
            ].filter(Array.isArray);
            changeLists.flat().forEach(change => {
                if (!change) return;
                let changeRole = change.role || change.changeType || change.substitutionType || '';
                // 투수는 별도의 현재 투수 필드로 관리하므로 타자 타순·수비 교체 목록에서는 제외한다.
                if (changeRole === '투수교체') return;
                let incoming = change.in || change.inPlayer || change.player || change;
                let name = _lineupPlayerName(incoming) || change.inName || change.name || change.playerName;
                if (!name) return;
                let outgoingName = _lineupPlayerName(change.out || change.outPlayer) || change.outName || '';
                let explicitOrder = _lineupOrderOf(change, _lineupOrderOf(incoming, null));
                let outgoing = outgoingName ? [...lineup].reverse().find(player => _lineupPlayerName(player) === outgoingName && !player._isReplaced) : null;
                if (!outgoing && explicitOrder) outgoing = [...lineup].reverse().find(player => _lineupOrderOf(player) === explicitOrder && !player._isReplaced);
                let order = explicitOrder || _lineupOrderOf(outgoing, null);
                let alreadyThere = [...lineup].reverse().find(player => _lineupPlayerName(player) === name && !player._isReplaced && (_isSubstitutionPlayer(player) || !order || _lineupOrderOf(player) === order));
                let requestedPosition = _normalizeDefensePosition(change.position || change.newPosition || (incoming && incoming.position));
                let outgoingPosition = _normalizeDefensePosition(outgoing && outgoing.position);
                // 새 선수가 다른 수비 위치로 들어가면, 그 자리에 있던 선수는 교체로 비는 기존 위치로 이동한다.
                if (requestedPosition && outgoingPosition && requestedPosition !== outgoingPosition) {
                    let displaced = [...lineup].reverse().find(player =>
                        player !== outgoing && player !== alreadyThere && !player._isReplaced &&
                        _normalizeDefensePosition(player.position) === requestedPosition
                    );
                    if (displaced) displaced.position = outgoingPosition;
                }
                if (outgoing && outgoing !== alreadyThere) outgoing._isReplaced = true;
                if (alreadyThere) {
                    alreadyThere.position = requestedPosition || _normalizeDefensePosition(alreadyThere.position) || outgoingPosition || '';
                    if (!alreadyThere._lineupDisplayPosition) alreadyThere._lineupDisplayPosition = alreadyThere.position;
                    alreadyThere.role = change.role || change.changeType || change.substitutionType || alreadyThere.role || '교체';
                    alreadyThere._isSubstitute = true;
                    if (order) alreadyThere._lineupOrder = order;
                    return;
                }
                let player = incoming && typeof incoming === 'object' ? { ...incoming } : { name };
                player.name = name;
                player.position = requestedPosition || _normalizeDefensePosition(player.position) || outgoingPosition || '';
                player._lineupDisplayPosition = player.position;
                player.role = player.role || change.role || change.changeType || change.substitutionType || '교체';
                player._isSubstitute = true;
                player._lineupOrder = order || lineup.length + 1;
                let insertAfter = -1;
                if (order) lineup.forEach((existing, index) => { if (_lineupOrderOf(existing) === order) insertAfter = index; });
                lineup.splice(insertAfter >= 0 ? insertAfter + 1 : lineup.length, 0, player);
            });
            return lineup;
        }
        function _activeBattingLineup(lineup) {
            let slots = new Map();
            lineup.forEach((player, index) => {
                if (!player._isReplaced) slots.set(_lineupOrderOf(player, index + 1), player);
            });
            return Array.from(slots.entries()).sort((a, b) => a[0] - b[0]).map(entry => entry[1]);
        }
        function _normalizeDefensePosition(raw) {
            let value = String(raw || '').trim().replace(/\s+/g, '');
            const aliases = {
                'P': '투수', '투': '투수', 'C': '포수', '포': '포수',
                '1B': '1루수', '1': '1루수', '一': '1루수', '1루': '1루수', '일루수': '1루수',
                '2B': '2루수', '2': '2루수', '二': '2루수', '2루': '2루수', '이루수': '2루수',
                '3B': '3루수', '3': '3루수', '三': '3루수', '3루': '3루수', '삼루수': '3루수',
                'SS': '유격수', '유격': '유격수',
                '유': '유격수', 'LF': '좌익수', '좌': '좌익수', '좌익': '좌익수',
                'CF': '중견수', '중': '중견수', '중견': '중견수',
                'RF': '우익수', '우': '우익수', '우익': '우익수',
                'DH': '지명타자', '지명': '지명타자'
            };
            let direct = aliases[value.toUpperCase()] || aliases[value];
            if (direct) return direct;
            // 네이버 문자 중계의 교체 코드: 대/타/주는 공격 역할이고 뒤 문자가 실제 수비 위치다.
            let compact = value.replace(/^(?:대타|대주자|대주|대|타|주)+/, '');
            if (!compact) return '';
            let normalized = aliases[compact.toUpperCase()] || aliases[compact];
            if (normalized) return normalized;
            // 二유·우중처럼 여러 수비 코드가 이어진 값은 먼저 기록된 위치를 사용한다.
            for (let token of compact) {
                let tokenPosition = aliases[token.toUpperCase()] || aliases[token];
                if (tokenPosition) return tokenPosition;
            }
            return compact;
        }
        function _activeDefenseLineup(lineup) {
            let activeSlots = new Map();
            lineup.forEach((player, index) => {
                if (!player || player._isReplaced) return;
                activeSlots.set(_lineupOrderOf(player, index + 1), player);
            });
            let positions = new Map();
            activeSlots.forEach(player => {
                let position = _normalizeDefensePosition(player.position);
                if (!position || position === '지명타자') return;
                positions.set(position, { ...player, position });
            });
            return Array.from(positions.values());
        }
        function _curBatterName(l, side) {
            let keys = [side + 'CurrentBatter', side + 'Batter', side + 'CurrentBatterDetail', side + 'BatterDetail'];
            for (let key of keys) {
                let name = _lineupPlayerName(l[key]);
                if (name && name !== '-') return name;
            }
            let globalBatter = _lineupPlayerName(l.currentBatter || l.batter || l.batterDetail);
            return globalBatter && globalBatter !== '-' ? globalBatter : '-';
        }

        function _batterAverageOf(l, side, batterName) {
            let selected = null, selectedRelay = -1;
            for (const batter of _recordBatters(l)) {
                if (_lineupPlayerName(batter) !== batterName) continue;
                const teamSide = String(_recordValue(batter, ['teamSide', 'side', '팀구분']) || '').toLowerCase();
                if (teamSide && teamSide !== side) continue;
                const average = _recordValue(batter, ['average', 'battingAverage', 'avg', '타율']);
                if (average === undefined) continue;
                const relay = Number(_recordValue(batter, ['relayNo', 'sequence', 'seq']) || 0);
                if (selected === null || relay > selectedRelay) { selected = average; selectedRelay = relay; }
            }
            return selected === null ? '' : _recordSafeText(selected);
        }

        function _batterSideOf(l, side, batterData) {
            const candidates = [
                l[side + 'CurrentBatterSide'], l[side + 'BatterSide'],
                l.currentBatterSide, l.batterSide,
                l[side + 'CurrentBatterDetail'], l[side + 'BatterDetail'],
                l.currentBatterDetail, l.batterDetail, batterData
            ];
            for (let raw of candidates) {
                if (raw && typeof raw === 'object') raw = raw.bats || raw.battingSide || raw.batSide || raw.batsThrows || raw.hand || '';
                const value = String(raw || '').trim().toUpperCase();
                if (!value) continue;
                if (value.includes('양타') || value.includes('SWITCH') || value === 'S') return 'switch';
                if (value.includes('좌타') || value.includes('LEFT') || value === 'L') return 'left';
                if (value.includes('우타') || value.includes('RIGHT') || value === 'R') return 'right';
            }
            return 'unknown';
        }

        function _baseRunnerName(l, base, offenseSide) {
            const baseWords = { 1: 'First', 2: 'Second', 3: 'Third' };
            const canonicalKey = `base${base}Runner`;
            if (Object.prototype.hasOwnProperty.call(l, canonicalKey)) {
                return _lineupPlayerName(l[canonicalKey]) || '-';
            }
            const keys = [
                `base${base}RunnerName`, `runner${base}`,
                `${offenseSide}Base${base}Runner`, `${offenseSide}Runner${base}`,
                `${baseWords[base]}BaseRunner`
            ];
            for (let key of keys) {
                let name = _lineupPlayerName(l[key]);
                if (name && name !== '-') return name;
            }
            const runnerMap = l.runners && typeof l.runners === 'object' ? l.runners : {};
            return _lineupPlayerName(runnerMap[`base${base}`] || runnerMap[base] || runnerMap[baseWords[base].toLowerCase()]) || '-';
        }

        // 스코어보드 선수 행: 초 공격은 원정 타자/홈 투수, 말 공격은 원정 투수/홈 타자로 표시한다.
        function _scoreboardLivePersonnel(l, isTop) {
            let awayPitcher = _curPitcherName(l, 'away');
            let homePitcher = _curPitcherName(l, 'home');
            let awayBatter = _curBatterName(l, 'away');
            let homeBatter = _curBatterName(l, 'home');
            let awayPitchCount = l.awayPitcherCount || '0';
            let homePitchCount = l.homePitcherCount || '0';
            if (awayPitcher === '-') awayPitcher = '투수 미정';
            if (homePitcher === '-') homePitcher = '투수 미정';
            if (awayBatter === '-') awayBatter = '타자 미정';
            if (homeBatter === '-') homeBatter = '타자 미정';
            const awayAverage = _batterAverageOf(l, 'away', awayBatter);
            const homeAverage = _batterAverageOf(l, 'home', homeBatter);
            const awayAverageHtml = awayAverage ? `<span class="scoreboard-batter-average text-[9px] font-black ml-1 whitespace-nowrap">타율 ${awayAverage}</span>` : '';
            const homeAverageHtml = homeAverage ? `<span class="scoreboard-batter-average text-[9px] font-black ml-1 whitespace-nowrap">타율 ${homeAverage}</span>` : '';

            const awayPitcherHtml = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate">P.${awayPitcher}</span><div class="scoreboard-pitch-count flex items-center gap-1 opacity-80 shrink-0"><i class="scoreboard-pitch-icon fa-solid fa-baseball text-[10px]"></i><span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md">${awayPitchCount}</span></div>`;
            const homePitcherHtml = `<div class="scoreboard-pitch-count flex items-center gap-1 opacity-80 shrink-0"><span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md">${homePitchCount}</span><i class="scoreboard-pitch-icon fa-solid fa-baseball text-[10px]"></i></div><span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate text-right">P.${homePitcher}</span>`;
            const awayBatterHtml = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate"><span class="scoreboard-batter-label font-black">타.</span>${awayBatter}${awayAverageHtml}</span>`;
            const homeBatterHtml = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate text-right"><span class="scoreboard-batter-label font-black">타.</span>${homeBatter}${homeAverageHtml}</span>`;

            return isTop
                ? { away: awayBatterHtml, home: homePitcherHtml }
                : { away: awayPitcherHtml, home: homeBatterHtml };
        }

        // [추가] 선발 투수의 상대 팀 맞대결 전적 + 시즌 전적 (과거 데이터 파일 기반)
        function _pitcherName(raw) { return (raw && typeof raw === 'object') ? (raw.name || '') : (raw || ''); }
        function pitcherRecords(pitcher, team, opp) {
            let vsW = 0, vsL = 0, seasonW = 0, seasonL = 0;
            if (!pitcher || pitcher === '-') return { vsW, vsL, seasonW, seasonL };
            for (let g of scheduleData) {
                let ld = liveDataStore[g.id];
                if (!ld || ld.gameStatus !== '종료') continue;
                let isWin = ld.winPitcher && ld.winPitcher === pitcher;
                let isLose = ld.losePitcher && ld.losePitcher === pitcher;
                if (!isWin && !isLose) continue;
                // 이 투수의 팀이 이 경기에 참가했는지 확인
                if (g.team1 !== team && g.team2 !== team) continue;
                if (isWin) seasonW++; else seasonL++;
                // 상대 팀과의 맞대결인지
                if (g.team1 === opp || g.team2 === opp) { if (isWin) vsW++; else vsL++; }
            }
            return { vsW, vsL, seasonW, seasonL };
        }

        function _dayDistanceFromToday(dateStr) {
            const from = new Date(`${todayStr}T00:00:00`);
            const to = new Date(`${dateStr}T00:00:00`);
            return Math.round((to.getTime() - from.getTime()) / 86400000);
        }

        function _officialStarterForSide(m, l, side) {
            const values = [
                l[side + 'StarterDetail'], l[side + 'Starter'],
                m[side + 'StarterDetail'], m[side + 'Starter']
            ];
            if (String(l.gameStatus || '경기전') === '경기전') {
                values.push(l[side + 'PitcherDetail'], l[side + 'Pitcher'], m[side + 'PitcherDetail'], m[side + 'Pitcher']);
            }
            const raw = values.find(value => {
                const name = _pitcherName(value);
                return name && name !== '-';
            });
            return raw || null;
        }

        function _recentStarterRotation(team) {
            const starts = scheduleData.filter(game => {
                const live = liveDataStore[game.id] || game;
                return game.date < todayStr && (game.team1 === team || game.team2 === team) && live.gameStatus === '종료';
            }).sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || ''))).map(game => {
                const live = liveDataStore[game.id] || game;
                const side = game.team1 === team ? 'away' : 'home';
                return _pitcherName(live[side + 'StarterDetail'] || live[side + 'Starter'] || live[side + 'PitcherDetail'] || live[side + 'Pitcher']);
            }).filter(name => name && name !== '-');
            const recentUnique = [];
            for (let index = starts.length - 1; index >= 0 && recentUnique.length < 5; index--) {
                if (!recentUnique.includes(starts[index])) recentUnique.push(starts[index]);
            }
            return recentUnique.reverse();
        }

        function _starterForLineup(m, l, side) {
            const official = _officialStarterForSide(m, l, side);
            if (official) return { raw: official, name: _pitcherName(official), predicted: false };
            const dayDistance = _dayDistanceFromToday(m.date);
            if (dayDistance < 0 || dayDistance > 14 || String(l.gameStatus || '경기전') !== '경기전') return { raw: null, name: '', predicted: false };
            const team = side === 'away' ? m.team1 : m.team2;
            const rotation = _recentStarterRotation(team);
            if (rotation.length < 3) return { raw: null, name: '', predicted: false };
            const upcoming = scheduleData.filter(game => {
                if (game.date < todayStr || game.date > m.date || (game.team1 !== team && game.team2 !== team)) return false;
                const live = liveDataStore[game.id] || {};
                const status = String(live.gameStatus || '경기전');
                const inning = String(live.inning || '');
                return !status.includes('취소') && !status.includes('우취') && !inning.includes('취소') && !inning.includes('우취');
            }).sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')));
            let gameIndex = upcoming.findIndex(game => String(game.id) === String(m.id));
            if (gameIndex < 0) gameIndex = Math.max(0, upcoming.length - 1);
            const name = rotation[gameIndex % rotation.length];
            return { raw: name, name, predicted: true };
        }

        function expectedStarterPreviewHtml(m, awayInfo, homeInfo) {
            if (!awayInfo.name && !homeInfo.name) return '';
            const column = (info, team, opponent, color) => {
                if (!info.name) return `<div class="expected-starter-column"><div class="expected-starter-team">${team}</div><div class="expected-starter-label">예상 선발</div><div class="expected-starter-name">미정</div></div>`;
                const record = pitcherRecords(info.name, team, opponent);
                const label = info.predicted ? '예상 선발' : '선발 투수';
                return `<div class="expected-starter-column"><div class="expected-starter-team">${team}</div><div class="expected-starter-label" style="color:${color}">${label}</div><div class="expected-starter-name">${info.name}</div><div class="expected-starter-record">시즌 ${record.seasonW}승 ${record.seasonL}패 · 상대 ${record.vsW}승 ${record.vsL}패</div></div>`;
            };
            const hasPrediction = awayInfo.predicted || homeInfo.predicted;
            const note = hasPrediction ? `<div class="expected-starter-note">최근 선발 순서와 예정 경기 기준 예상입니다. 구단 발표나 실제 라인업이 등록되면 자동으로 변경됩니다.</div>` : '';
            return `<section class="expected-starter-preview"><div class="expected-starter-grid">${column(awayInfo, m.team1, m.team2, teamHex[m.team1] || '#64748b')}${column(homeInfo, m.team2, m.team1, teamHex[m.team2] || '#64748b')}</div>${note}</section>`;
        }

        // 요정 화면 캐릭터 이미지를 미리 받아둬 탭 전환 시 즉시 표시되게 한다.
        function mkStamp(label, hex, big) {
            let shape = big
                ? 'text-[25px] px-4 py-1 border-[2.5px] rounded-tl-[26px] rounded-br-[26px] rounded-tr-md rounded-bl-md tracking-[0.12em]'
                : 'text-[10px] px-1.5 py-[3px] border-2 rounded-tl-[11px] rounded-br-[11px] rounded-tr-[3px] rounded-bl-[3px] tracking-[0.14em]';
            let yShift = big ? '-translate-y-1/2' : '-translate-y-[30%]';
            let z = big ? 'z-0' : 'z-20';
            return `<div class="absolute top-1/2 left-1/2 -translate-x-1/2 ${yShift} -rotate-[13deg] font-black pointer-events-none whitespace-nowrap ${shape} ${z}" style="color:${hex};border-color:${hex};background:${hex}1f;box-shadow:0 2px 8px ${hex}40, inset 0 0 0 1px ${hex}30;text-shadow:0 1px 1px rgba(0,0,0,0.12);">${label}</div>`;
        }
        const STAMP_HEX = { WIN: '#EA0029', LOSE: '#64748B', DRAW: '#10B981', CANCEL: '#3B82F6' };
        // 스코어보드 위에 쾅 찍히는 큰 도장 (모션 포함)
        function bigStamp(label, hex) { return `<div class="stamp-pop absolute top-1/2 left-1/2 z-30 font-black pointer-events-none whitespace-nowrap text-[26px] px-5 py-1.5 border-[3px] rounded-tl-[26px] rounded-br-[26px] rounded-tr-md rounded-bl-md tracking-[0.12em]" style="color:${hex};border-color:${hex};background:${hex}26;box-shadow:0 6px 18px ${hex}55, inset 0 0 0 1px ${hex}33;text-shadow:0 1px 2px rgba(0,0,0,0.18);">${label}</div>`; }
        function classicSeriesHeader(m) {
            if (!isClassicSeriesGame(m)) return '';
            return `
                <style>
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #lineup-popup.app-bg,
                    html.light-mode:has(#lineup-popup:not(.render-hidden) .classic-marker) #lineup-popup.app-bg {
                        background-color: #EBE7DF !important;
                        background-image: linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px) !important;
                        background-size: 15px 15px !important;
                        transition: none !important;
                    }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) header.app-bg,
                    html.light-mode:has(#lineup-popup:not(.render-hidden) .classic-marker) header.app-bg {
                        background-color: transparent !important;
                        background-image: none !important;
                    }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #header-popup-text {
                        color: #111 !important;
                        font-weight: 900 !important;
                    }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #ctrl-back button {
                        color: #004A99 !important;
                    }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #app-header.home-header-compact #app-header-shell,
                    html.light-mode:has(#lineup-popup:not(.render-hidden) .classic-marker) #app-header.home-header-compact #app-header-shell {
                        background: rgba(255,255,255,0.92) !important;
                        border-color: rgba(0,0,0,0.10) !important;
                        box-shadow: 0 7px 20px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.86) !important;
                    }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #app-header.home-header-compact #ctrl-back button {
                        color: #fff !important;
                        background: #004A99 !important;
                        box-shadow: 0 6px 15px rgba(0,74,153,0.24) !important;
                    }
                    #lineup-content:has(.classic-marker) { color: #111 !important; }
                    #lineup-content:has(.classic-marker) span.text-white,
                    #lineup-content:has(.classic-marker) div.text-white,
                    #lineup-content:has(.classic-marker) .text-\\[\\#FFFFFF\\] {
                        color: #111 !important;
                        text-shadow: none !important;
                    }
                    #lineup-content:has(.classic-marker) span.text-gray-200,
                    #lineup-content:has(.classic-marker) span.text-gray-400,
                    #lineup-content:has(.classic-marker) span.text-gray-500,
                    #lineup-content:has(.classic-marker) div.text-gray-500 {
                        color: #444 !important;
                    }
                    #lineup-content:has(.classic-marker) .text-gray-400\\/60 { color: #555 !important; }
                    #lineup-content:has(.classic-marker) .wp-name {
                        color: #475569 !important;
                        text-shadow: none !important;
                    }
                    #lineup-content:has(.classic-marker) .wp-note { color: #334155 !important; }
                    #lineup-content:has(.classic-marker) .wp-byline { color: #64748b !important; }
                    #lineup-content:has(.classic-marker) .bg-white\\/5 {
                        background-color: rgba(255,255,255,0.40) !important;
                        border-color: rgba(0,0,0,0.10) !important;
                        border-bottom: 1px solid rgba(0,0,0,0.10) !important;
                    }
                    #lineup-content:has(.classic-marker) .bg-white\\/10 { background-color: rgba(0,0,0,0.05) !important; }
                    #lineup-content:has(.classic-marker) .bg-\\[\\#222224\\] {
                        background-color: #fff !important;
                        border-color: #e5e7eb !important;
                        box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
                    }
                    #lineup-content:has(.classic-marker) .fa-user,
                    #lineup-content:has(.classic-marker) .fa-clipboard-question { color: #9ca3af !important; }
                    #lineup-content:has(.classic-marker) .border-white\\/5,
                    #lineup-content:has(.classic-marker) .border-white\\/10 { border-color: rgba(0,0,0,0.08) !important; }
                    #lineup-content:has(.classic-marker) .text-\\[14px\\].font-bold.text-gray-200.truncate {
                        color: #111 !important;
                        font-weight: 900 !important;
                        font-size: 16px !important;
                    }
                    #lineup-content:has(.classic-marker) .bg-blue-600 {
                        background-color: #004A99 !important;
                        color: white !important;
                    }
                    #lineup-content:has(.classic-marker) .scoreboard-surface,
                    #lineup-content:has(.classic-marker) .scoreboard-surface * {
                        text-shadow: inherit;
                    }
                    #lineup-content:has(.classic-marker) .scoreboard-surface span.text-white,
                    #lineup-content:has(.classic-marker) .scoreboard-surface div.text-white,
                    #lineup-content:has(.classic-marker) .scoreboard-surface .text-\\[\\#FFFFFF\\] {
                        color: #ffffff !important;
                        text-shadow: 0 1px 3px rgba(0,0,0,0.35) !important;
                    }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-200 { color: #e5e7eb !important; }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-300 { color: #d1d5db !important; }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-400 { color: #9ca3af !important; }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-500 { color: #6b7280 !important; }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .bg-white\\/5 { background-color: rgba(255,255,255,0.05) !important; border-color: rgba(255,255,255,0.05) !important; }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .bg-white\\/10 { background-color: rgba(255,255,255,0.10) !important; }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .border-white\\/5 { border-color: rgba(255,255,255,0.05) !important; }
                    #lineup-content:has(.classic-marker) .scoreboard-surface .border-white\\/10 { border-color: rgba(255,255,255,0.10) !important; }
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface span.text-white,
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface div.text-white,
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface .text-\\[\\#FFFFFF\\] {
                        color: #111827 !important;
                        text-shadow: none !important;
                    }
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-200 { color: #374151 !important; }
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-300 { color: #4b5563 !important; }
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-400 { color: #6b7280 !important; }
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface .text-gray-500 { color: #8b95a1 !important; }
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface .bg-white\\/5 { background-color: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.05) !important; }
                    html.light-mode #lineup-content:has(.classic-marker) .scoreboard-surface .bg-white\\/10 { background-color: rgba(0,0,0,0.06) !important; }
                </style>
                <div class="classic-marker hidden"></div>
                <div class="relative px-4 pb-5 pt-1 mb-2 mt-0">
                    <div class="flex justify-center items-center gap-[1.5px] mt-1 mb-2 z-10 relative opacity-95">
                        <span class="text-[14px] font-black px-1.5 py-0.5 -rotate-3 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #111111 !important; font-family: 'Georgia', serif; font-style: italic;">클</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 rotate-2 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #0F3789 !important; font-style: italic;">래</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 -rotate-6 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #111111 !important; background-color: #E2235B !important; font-style: italic;">식</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 rotate-3 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #0F3789 !important; font-family: 'Georgia', serif; font-style: italic;">씨</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 -rotate-2 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #111111 !important; background-color: #D1D1D1 !important; font-style: italic;">리</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 rotate-6 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #E2235B !important; font-family: 'Georgia', serif; font-style: italic;">즈</span>
                    </div>
                    <div class="flex justify-center mt-3">
                        <span class="text-[11px] font-black text-[#2A2A2A] bg-[#D1BA98] px-3 py-1 rotate-[-1deg] shadow-[1.5px_1.5px_0_rgba(0,0,0,0.10)] border-b border-[#A6906A]" style="clip-path: polygon(1% 0%, 99% 1%, 100% 98%, 0% 100%);">${classicSeriesDateLabel(m)}</span>
                    </div>
                </div>`;
        }

        // [추가] 홈 Now Brief 피드 — 배너 아래 카드형 콘텐츠
        function switchGameInfoTab(tab) {
            if (!['lineup', 'broadcast', 'record'].includes(tab) || !currentPopupMatchId) return;
            if (tab === 'record' && currentGameInfoTab !== 'record') {
                const live = liveDataStore[currentPopupMatchId] || {};
                const liveInning = Number(String(live.inning || '').replace(/[^0-9]/g, ''));
                currentGameRecordInning = Number.isFinite(liveInning) && liveInning > 0
                    ? Math.max(1, Math.min(11, liveInning))
                    : 1;
            }
            currentGameInfoTab = tab;
            renderPopupContent(currentPopupMatchId);
        }

        function selectGameRecordInning(inning) {
            currentGameRecordInning = Math.max(1, Math.min(11, Number(inning) || 1));
            if (currentPopupMatchId) renderPopupContent(currentPopupMatchId);
        }

        function gameInfoTabsHtml() {
            const tabs = [
                { id: 'lineup', label: '라인업' },
                { id: 'broadcast', label: '중계' },
                { id: 'record', label: '기록' }
            ];
            const themedTeam = selectedTeam === 'KIA' || selectedTeam === '삼성' ? selectedTeam : null;
            const activeColor = themedTeam ? teamHex[themedTeam] : '#ffffff';
            const activeTextColor = themedTeam ? '#ffffff' : '#111827';
            return `<div id="game-info-tabs" class="game-info-tabs" role="tablist" aria-label="경기 정보 메뉴" style="--game-info-tab-color:${activeColor};--game-info-tab-text:${activeTextColor}">${tabs.map(tab => {
                const active = currentGameInfoTab === tab.id;
                return `<button type="button" class="game-info-tab ${active ? 'active' : ''}" role="tab" aria-selected="${active}" onclick="switchGameInfoTab('${tab.id}')">${tab.label}</button>`;
            }).join('')}</div>`;
        }

        function _recordSafeText(value) {
            return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
        }

        function _recordValue(source, keys) {
            if (!source || typeof source !== 'object') return undefined;
            for (const key of keys) {
                if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
            }
            return undefined;
        }

        function _recordBatters(l) {
            const raw = l.recordBatters || l.batterRecords || l.hitterRecords || l.타자기록 || [];
            return Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
        }

        function gameRecordHtml(m, l) {
            const batters = _recordBatters(l);
            const recordInnings = batters.map(batter => Number(_recordValue(batter, ['inning', 'inningNumber', '회']) || 1)).filter(Number.isFinite);
            const gameInning = Number(String(l.inning || '').replace(/[^0-9]/g, '')) || 9;
            const scoreInningCount = Math.max(
                Array.isArray(l.awayInning) ? l.awayInning.length : 0,
                Array.isArray(l.homeInning) ? l.homeInning.length : 0
            );
            const maxInning = Math.max(9, Math.min(11, Math.max(gameInning, scoreInningCount, ...recordInnings, 9)));
            currentGameRecordInning = Math.max(1, Math.min(maxInning, currentGameRecordInning));
            const inningTabs = Array.from({ length: maxInning }, (_, index) => {
                const inning = index + 1;
                return `<button type="button" class="game-record-inning-tab ${inning === currentGameRecordInning ? 'active' : ''}" onclick="selectGameRecordInning(${inning})" aria-pressed="${inning === currentGameRecordInning}">${inning}회</button>`;
            }).join('');
            const visibleBatters = batters.filter(batter => {
                const inning = Number(_recordValue(batter, ['inning', 'inningNumber', '회']) || 1);
                return inning === currentGameRecordInning;
            });
            const cards = visibleBatters.map(batter => {
                const rawName = _recordValue(batter, ['name', 'playerName', 'batterName', '선수명']) || '타자';
                const name = _recordSafeText(rawName);
                const order = _recordSafeText(_recordValue(batter, ['battingOrder', 'order', '타순']) || '-');
                const average = _recordSafeText(_recordValue(batter, ['average', 'battingAverage', 'avg', '타율']) || '-');
                const stat = (keys, fallback = 0) => _recordSafeText(_recordValue(batter, keys) ?? fallback);
                const stats = `타석 ${stat(['plateAppearances','pa','타석'])}　타수 ${stat(['atBats','ab','타수'])}　안타 ${stat(['hits','h','안타'])}　득점 ${stat(['runs','r','득점'])}<br>타점 ${stat(['rbi','타점'])}　홈런 ${stat(['homeRuns','hr','홈런'])}　볼넷 ${stat(['walks','bb','볼넷'])}　피삼진 ${stat(['strikeouts','so','삼진'])}`;
                const photo = playerImages[rawName];
                const photoHtml = photo ? `<img src="${photo}" alt="${name}">` : `<i class="fa-solid fa-user text-gray-500"></i>`;
                const summaryRaw = _recordValue(batter, ['summary', 'playSummary', 'description', '상황설명']) || '';
                const summary = Array.isArray(summaryRaw) ? summaryRaw.map(_recordSafeText).join('\n') : _recordSafeText(summaryRaw);
                const eventsRaw = _recordValue(batter, ['events', 'playEvents', 'eventLog', '상황기록']) || [];
                const events = (Array.isArray(eventsRaw) ? eventsRaw : String(eventsRaw).split('\n')).filter(Boolean).map(event => {
                    const text = typeof event === 'object' ? _recordValue(event, ['text', 'description', 'event', '내용']) : event;
                    return text ? `<div class="game-record-event">${_recordSafeText(text)}</div>` : '';
                }).join('');
                return `<article class="game-record-card"><div class="game-record-head"><div class="game-record-photo">${photoHtml}</div><div class="min-w-0"><div><span class="game-record-name">${name}</span><span class="game-record-meta">${order}번타자 · 타율 ${average}</span></div><div class="game-record-stats">${stats}</div></div></div><div class="game-record-body">${summary ? `<div class="game-record-summary">${summary}</div>` : ''}${events}</div></article>`;
            }).join('');
            const empty = `<section class="min-h-[220px] flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/5 px-5 text-center"><div class="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center mb-3"><i class="fa-solid fa-chart-column text-lg text-gray-400"></i></div><span class="text-[15px] font-black text-white">${currentGameRecordInning}회 상세 기록 입력 대기중</span><span class="mt-2 text-[10px] text-gray-500">관리자페이지에서 이닝을 선택해 기록을 입력하세요.</span></section>`;
            return `<div class="game-record-inning-tabs" role="tablist" aria-label="이닝별 기록">${inningTabs}</div><section class="game-record-list">${cards || empty}</section>`;
        }

        function gameBroadcastHtml(m, l) {
            const isLive = l.gameStatus === '경기중';
            const inningText = isLive && l.inning ? l.inning : (l.gameStatus === '종료' ? '경기 종료' : '경기 전');
            const isTop = String(l.inning || '').includes('초');
            const defenseSide = isLive ? (isTop ? 'home' : 'away') : 'home';
            const offenseSide = defenseSide === 'home' ? 'away' : 'home';
            const lineup = _lineupWithSubstitutions(l, defenseSide);
            const activeDefenseLineup = _activeDefenseLineup(lineup);
            const offenseLineup = _lineupWithSubstitutions(l, offenseSide);
            const activeOffenseLineup = _activeBattingLineup(offenseLineup);
            const currentPitcher = _curPitcherName(l, defenseSide);
            const pitcherDetail = l[`${defenseSide}PitcherDetail`] || l[`${defenseSide}StarterDetail`] || null;
            const pitcherName = currentPitcher !== '-' ? currentPitcher : ((pitcherDetail && pitcherDetail.name) || '-');
            const awayScore = l.awayScore ?? '-';
            const homeScore = l.homeScore ?? '-';
            const awayColor = teamHex[m.team1] || '#39424e';
            const homeColor = teamHex[m.team2] || '#39424e';
            const fielders = {};
            activeDefenseLineup.forEach(player => {
                if (!player || typeof player !== 'object' || !player.position) return;
                fielders[player.position] = player.name || '-';
            });
            fielders['투수'] = pitcherName;
            const positions = [
                ['중견수', 'cf'], ['좌익수', 'lf'], ['우익수', 'rf'], ['유격수', 'ss'], ['2루수', 'sb'],
                ['3루수', 'tb'], ['1루수', 'fb'], ['투수', 'p'], ['포수', 'c']
            ];
            const playerHtml = positions.map(([position, cls]) => {
                const rawName = fielders[position] || '-';
                const name = rawName === '-' ? position : rawName;
                const photo = playerImages[rawName];
                const portrait = photo ? `<img src="${photo}" alt="${_recordSafeText(rawName)}">` : `<i class="fa-solid fa-user text-[14px] text-gray-300 mb-1"></i>`;
                return `<div class="broadcast-player ${cls}"><div class="portrait">${portrait}</div><span class="name" title="${_recordSafeText(position)} ${_recordSafeText(name)}">${_recordSafeText(name)}</span></div>`;
            }).join('');
            const countDots = (value, max, type) => Array.from({ length: max }, (_, index) => `<span class="broadcast-count-dot ${type} ${index < Number(value || 0) ? 'on' : ''}"></span>`).join('');
            const baseClass = key => l[key] ? 'active' : '';
            const hasFielders = Object.keys(fielders).some(key => key !== '투수');
            const liveBatterName = _curBatterName(l, offenseSide);
            const matchedBatter = activeOffenseLineup.find(player => _lineupPlayerName(player) === liveBatterName) || null;
            const batterData = matchedBatter || (liveBatterName === '-' ? activeOffenseLineup[0] : null) || null;
            const batterName = liveBatterName !== '-' ? liveBatterName : (_lineupPlayerName(batterData) || '타자');
            const batterSide = _batterSideOf(l, offenseSide, batterData);
            const batterPhoto = playerImages[batterName];
            const batterPortrait = batterPhoto ? `<img src="${batterPhoto}" alt="${_recordSafeText(batterName)}">` : `<i class="fa-solid fa-user text-[15px] text-gray-300 mb-1"></i>`;
            const runnerClasses = { 1: 'first', 2: 'second', 3: 'third' };
            const runnerHtml = [1, 2, 3].filter(base => Boolean(l[`base${base}`])).map(base => {
                const savedName = _baseRunnerName(l, base, offenseSide);
                const runnerName = savedName !== '-' ? savedName : `${base}루 주자`;
                const runnerPhoto = playerImages[runnerName];
                const runnerPortrait = runnerPhoto ? `<img src="${runnerPhoto}" alt="${_recordSafeText(runnerName)}">` : `<i class="fa-solid fa-user text-[11px] text-gray-500 mb-1"></i>`;
                return `<div class="broadcast-runner ${runnerClasses[base]}" aria-label="${base}루 주자 ${_recordSafeText(runnerName)}"><div class="portrait">${runnerPortrait}</div><span class="name">${_recordSafeText(runnerName)}</span></div>`;
            }).join('');
            const batterIndex = activeOffenseLineup.findIndex(player => _lineupPlayerName(player) === batterName);
            const waitingList = activeOffenseLineup.length > 1 ? Array.from({ length: Math.min(3, activeOffenseLineup.length - 1) }, (_, index) => activeOffenseLineup[(Math.max(0, batterIndex) + index + 1) % activeOffenseLineup.length]) : [];
            const waitingPlayers = waitingList.map((player, index) => `<span>${index + 1}. ${_recordSafeText(_lineupPlayerName(player) || '-')}</span>`).join('') || '<span>라인업 발표 전</span>';
            const scoreboardHtml = `<div class="broadcast-scoreboard">
                <div class="broadcast-score-team ${offenseSide === 'away' ? 'at-bat' : ''}" style="background:${awayColor}"><img src="${teamLogos[m.team1]}" alt="${_recordSafeText(m.team1)}"><strong>${_recordSafeText(awayScore)}</strong></div>
                <div class="broadcast-score-team ${offenseSide === 'home' ? 'at-bat' : ''}" style="background:${homeColor}"><img src="${teamLogos[m.team2]}" alt="${_recordSafeText(m.team2)}"><strong>${_recordSafeText(homeScore)}</strong></div>
                <div class="broadcast-score-state"><div class="broadcast-score-state-top">
                    <span>${_recordSafeText(inningText)}</span>
                    <span class="broadcast-mini-bases" aria-label="주자 현황"><i class="broadcast-mini-base second ${baseClass('base2')}"></i><i class="broadcast-mini-base third ${baseClass('base3')}"></i><i class="broadcast-mini-base first ${baseClass('base1')}"></i></span>
                    <span class="broadcast-counts"><b>${Number(l.ball || 0)}B</b><b>${Number(l.strike || 0)}S</b>${countDots(l.out, 2, 'out')}<span class="broadcast-out-label">OUT</span></span>
                </div></div>
            </div>`;
            return `<section class="broadcast-card" aria-label="문자 중계">${scoreboardHtml}
                <div class="broadcast-field">
                    <img class="broadcast-field-art" src="baseball-assets/baseball-field-broadcast.png" alt="" aria-hidden="true">
                    ${playerHtml}
                    ${runnerHtml}
                    <div class="broadcast-batter bats-${batterSide}" aria-label="${batterSide === 'left' ? '좌타자' : batterSide === 'right' ? '우타자' : '타자'} ${_recordSafeText(batterName)}"><div class="portrait">${batterPortrait}</div><span class="name">${_recordSafeText(batterName)}</span></div>
                    ${hasFielders ? '' : `<div class="absolute inset-x-0 top-[42%] z-10 bg-black/45 px-4 py-3 text-center text-[12px] font-bold text-white backdrop-blur-sm">라인업 발표 후 수비 위치가 표시됩니다</div>`}
                    <div class="broadcast-waiting"><strong>대기타석</strong>${waitingPlayers}</div>
                </div>
            </section>`;
        }

        function renderPopupContent(id) {
            const c = document.getElementById('lineup-content'), m = scheduleData.find(x => x.id === parseInt(id) || x.id === id); if (!m) return;
            const l = liveDataStore[id] || {}; if (!l.gameStatus) l.gameStatus = '경기전';
            const iC = Boolean(
                (l.gameStatus && (l.gameStatus.includes('취소') || l.gameStatus.includes('우취'))) ||
                (l.inning && (l.inning.includes('취소') || l.inning.includes('우취')))
            );
            
            const isAllstarGame = isAllstarDate(m.date);
            let h1 = teamHex[m.team1] || '#888888', h2 = teamHex[m.team2] || '#888888';
            
            let sch = `<span class="text-2xl font-black text-gray-700">VS</span>`;
            if (l.gameStatus !== '경기전') {
                if (iC) {
                    let txt = (l.inning && (l.inning.includes('취소') || l.inning.includes('우취'))) ? l.inning : (l.gameStatus || '취소'); if (txt === '취소') txt = '우천취소'; txt = txt.replace('우취', '우천취소');
                    sch = `<div class="flex flex-col items-center gap-1"><span class="text-[11px] font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">${txt}</span><span class="text-2xl font-black text-gray-700 mt-1">VS</span></div>`;
                } else if (l.gameStatus !== '경기전') {
                    let dis = (l.gameStatus === '경기중' && l.inning) ? l.inning : l.gameStatus, as = parseInt(l.awayScore || 0), hs = parseInt(l.homeScore || 0), asz = as > hs ? 'text-[38px]' : as < hs ? 'text-[24px] opacity-50' : 'text-[30px]', hsz = hs > as ? 'text-[38px]' : hs < as ? 'text-[24px] opacity-50' : 'text-[30px]', ac = as > hs ? 'text-point drop-shadow-xl' : 'text-white', hc = hs > as ? 'text-point drop-shadow-xl' : 'text-white';
                    let badgeHtml = l.gameStatus !== '종료' ? `<span class="text-[12px] font-black text-[#EA0029] flex items-center gap-1.5 tracking-widest drop-shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-[#EA0029] animate-pulse"></span>${dis}</span>` : `<span class="text-[10px] font-bold text-gray-400 bg-gray-600/30 px-2 py-0.5 rounded border border-gray-500/20">${dis}</span>`;
                    
                    let winLoseHtml = '';
                    if (l.gameStatus === '종료' && (l.winPitcher || l.losePitcher)) {
                        let wp = l.winPitcher ? `<span class="text-[#f87171] font-black mr-1">승</span><span class="text-white">${l.winPitcher}</span>` : '';
                        let lp = l.losePitcher ? `<span class="text-[#60a5fa] font-black mr-1">패</span><span class="text-white">${l.losePitcher}</span>` : '';
                        let divLine = (wp && lp) ? `<span class="text-gray-600 mx-1.5">|</span>` : '';
                        if (hs > as) {
                            winLoseHtml = `<div class="inline-flex items-center justify-center mt-2 text-[11px] bg-white/5 px-3 py-1 rounded-full border border-white/10 shadow-sm whitespace-nowrap">${lp}${divLine}${wp}</div>`;
                        } else {
                            winLoseHtml = `<div class="inline-flex items-center justify-center mt-2 text-[11px] bg-white/5 px-3 py-1 rounded-full border border-white/10 shadow-sm whitespace-nowrap">${wp}${divLine}${lp}</div>`;
                        }
                    }
                    
                    sch = `<div class="flex flex-col items-center gap-1">${badgeHtml}<div class="flex items-center gap-3 mt-1.5"><span class="${asz} font-black ${ac} leading-none tracking-tighter transition-all duration-500">${l.awayScore}</span><span class="text-lg text-gray-500 mb-1">:</span><span class="${hsz} font-black ${hc} leading-none tracking-tighter transition-all duration-500">${l.homeScore}</span></div>${winLoseHtml}</div>`;
                }
            }
            
            const l1Lg = uiTeamLogo(m.team1, 'w-12 h-12', 'w-12 h-12', 'drop-shadow-lg mb-1.5');
            const l2Lg = uiTeamLogo(m.team2, 'w-12 h-12', 'w-12 h-12', 'drop-shadow-lg mb-1.5');
            
            let isDal = (m.date === '2026-05-15' || m.date === '2026-05-16' || m.date === '2026-05-17' || m.date === '2026-06-05' || m.date === '2026-06-06' || m.date === '2026-06-07') && ((m.team1 === 'KIA' && m.team2 === '삼성') || (m.team1 === '삼성' && m.team2 === 'KIA'));
            let isClassicSeries = isClassicSeriesGame(m);
            let isClassic = false;
            
            let sbh = '';
            if (isDal) {
                let aScoreBanner = l.awayScore || '0', hScoreBanner = l.homeScore || '0';
                let aHit = l.awayHit || '0', aErr = l.awayError || '0', aBase = l.awayBase || '0';
                let hHit = l.homeHit || '0', hErr = l.homeError || '0', hBase = l.homeBase || '0';
                
                let innNum = (l.inning || '').replace(/[^0-9]/g, '') || '1';
                let currentInnInt = parseInt(innNum) || 1;
                let aInnings = l.awayInning || [];
                let hInnings = l.homeInning || [];
                
                let maxInning = Math.max(9, aInnings.length, hInnings.length);
                if (l.gameStatus === '경기중' && currentInnInt > 9) maxInning = Math.max(maxInning, currentInnInt);
                
                let isExtra = maxInning > 9;
                
                let inningHeaderHtml = '', aInningsHtml = '', hInningsHtml = '';
                let isTop = (l.inning && l.inning.includes('초'));
                
                for (let i = 1; i <= maxInning; i++) {
                    let aVal = aInnings[i-1] !== undefined ? aInnings[i-1] : '-';
                    let hVal = hInnings[i-1] !== undefined ? hInnings[i-1] : '-';
                    let isCurA = (i === currentInnInt && isTop && l.gameStatus === '경기중');
                    let isCurH = (i === currentInnInt && !isTop && l.gameStatus === '경기중');
                    
                    let aFormatted = isCurA ? `<div class="relative inline-block"><span class="relative z-10 text-white font-bold">${aVal}</span><div class="absolute -bottom-[2px] left-1/2 -translate-x-1/2 w-[10px] h-[1.5px] bg-[#6ee7b7]"></div></div>` : aVal;
                    let hFormatted = isCurH ? `<div class="relative inline-block"><span class="relative z-10 text-white font-bold">${hVal}</span><div class="absolute -bottom-[2px] left-1/2 -translate-x-1/2 w-[10px] h-[1.5px] bg-[#6ee7b7]"></div></div>` : hVal;

                    if (isExtra) {
                        inningHeaderHtml += `<div class="w-[20px] text-center shrink-0">${i}</div>`;
                        aInningsHtml += `<div class="w-[20px] text-center shrink-0">${aFormatted}</div>`;
                        hInningsHtml += `<div class="w-[20px] text-center shrink-0">${hFormatted}</div>`;
                    } else {
                        inningHeaderHtml += `<div>${i}</div>`;
                        aInningsHtml += `<div>${aFormatted}</div>`;
                        hInningsHtml += `<div>${hFormatted}</div>`;
                    }
                }
                
                let tableWrapperClass = isExtra ? 'flex-1 overflow-x-auto scrollbar-hide ml-1' : 'flex-1 ml-1';
                let tableInnerClass = isExtra ? 'flex flex-col min-w-max gap-y-1.5 w-full pr-3' : 'flex flex-col gap-y-1.5 w-full pr-2';
                let rowClass = isExtra ? 'flex gap-1.5 justify-start' : 'grid grid-cols-9 text-center';

                let aPitcherArea = '', hPitcherArea = '', inningArea = '', centerArea = '';
                let apRawBanner = l.awayPitcherDetail || l.awayPitcher || '-';
                let hpRawBanner = l.homePitcherDetail || l.homePitcher || '-';
                let aPitcher = _curPitcherName(l, 'away');
                let hPitcher = _curPitcherName(l, 'home');
                let aPCount = l.awayPitcherCount || '0', hPCount = l.homePitcherCount || '0';
                
                let oCount = parseInt(l.out || 0), bCount = parseInt(l.ball || 0), sCount = parseInt(l.strike || 0);
                let outDotsHtml = ''; for(let i=1; i<=2; i++) outDotsHtml += `<div class="w-1.5 h-1.5 rounded-full ${i <= oCount ? 'bg-[#ef4444] shadow-[0_0_3px_#ef4444]' : 'bg-[#4b5563]'}"></div>`;
                let base1 = l.base1 ? 'bg-[#6ee7b7] shadow-[0_0_5px_rgba(110,231,183,0.6)]' : 'bg-[#374151]', base2 = l.base2 ? 'bg-[#6ee7b7] shadow-[0_0_5px_rgba(110,231,183,0.6)]' : 'bg-[#374151]', base3 = l.base3 ? 'bg-[#6ee7b7] shadow-[0_0_5px_rgba(110,231,183,0.6)]' : 'bg-[#374151]';
                let innIcon = isTop ? `<div class="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-[#6ee7b7] mt-0.5"></div>` : `<div class="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-[#6ee7b7] mt-0.5"></div>`;

                if (l.gameStatus === '종료' && !iC) {
                    let aWin = parseInt(aScoreBanner) > parseInt(hScoreBanner), hWin = parseInt(hScoreBanner) > parseInt(aScoreBanner);
                    let aText = aWin ? `<span class="text-[#f87171] font-black mr-1">승</span>${l.winPitcher||'-'}` : (hWin ? `<span class="text-[#60a5fa] font-black mr-1">패</span>${l.losePitcher||'-'}` : `<span class="text-gray-400">무승부</span>`);
                    let hText = hWin ? `<span class="text-[#f87171] font-black mr-1">승</span>${l.winPitcher||'-'}` : (aWin ? `<span class="text-[#60a5fa] font-black mr-1">패</span>${l.losePitcher||'-'}` : `<span class="text-gray-400">무승부</span>`);
                    aPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate">${aText}</span>`; 
                    hPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate text-right">${hText}</span>`;
                    inningArea = `<span class="text-[14px] font-black text-[#FFFFFF] drop-shadow-md tracking-widest mt-1">종료</span>`; 
                    centerArea = `<span class="text-[12px] font-bold text-gray-400 tracking-widest mt-px">경기결과</span>`;
                } else if (l.gameStatus === '경기전' || iC) {
                    let awayExpectedStarter = _starterForLineup(m, l, 'away');
                    let homeExpectedStarter = _starterForLineup(m, l, 'home');
                    let awayStarterText = awayExpectedStarter.name ? `${awayExpectedStarter.predicted ? '예상 선발 ' : '선발 '}${awayExpectedStarter.name}` : '예상 선발 미정';
                    let homeStarterText = homeExpectedStarter.name ? `${homeExpectedStarter.predicted ? '예상 선발 ' : '선발 '}${homeExpectedStarter.name}` : '예상 선발 미정';
                    aPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate">${awayStarterText}</span>`;
                    hPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate text-right">${homeStarterText}</span>`;
                    let centerTxt = iC ? '우천취소' : m.time;
                    inningArea = `<span class="text-[14px] font-black text-[#FFFFFF] drop-shadow-md tracking-widest mt-1">${centerTxt}</span>`;
                    centerArea = `<span class="text-[11px] font-bold text-gray-400 tracking-widest mt-px">${m.stadium}</span>`;
                    aScoreBanner = '-'; hScoreBanner = '-';
                } else {
                    let livePersonnel = _scoreboardLivePersonnel(l, isTop);
                    aPitcherArea = livePersonnel.away;
                    hPitcherArea = livePersonnel.home;
                    inningArea = `<div class="w-[28px] h-[24px] relative mb-0.5"><div class="absolute top-[1px] left-[10px] w-[8px] h-[8px] rotate-45 ${base2}"></div><div class="absolute top-[9px] left-[2px] w-[8px] h-[8px] rotate-45 ${base3}"></div><div class="absolute top-[9px] left-[18px] w-[8px] h-[8px] rotate-45 ${base1}"></div></div><div class="flex items-center gap-1.5">${innIcon}<span class="text-[13px] font-black text-[#FFFFFF] drop-shadow-md leading-none tracking-tighter">${innNum}</span></div>`;
                    centerArea = `<div class="flex gap-[3px] mr-1.5">${outDotsHtml}</div><span class="text-[12px] font-black text-[#FFFFFF] tracking-widest mt-px">${bCount}-${sCount}</span>`;
                }

                let dalImg = "https://cdn.jsdelivr.net/gh/won429/enjoy_ballbase@main/dal.png";
                let bgStyle = `background: radial-gradient(ellipse at top, #1E3A8A, #0A1128, #02040A);`;
                let dalBadge = `<div class="absolute top-0 left-1/2 -translate-x-1/2 bg-[#0B132B] px-4 py-0.5 rounded-b-md border-x border-b border-[#1E3A8A]/50 flex items-center justify-center shadow-md z-20"><span class="text-[8px] font-bold text-blue-200 tracking-widest">MOONLIGHT</span></div>`;
                let centerDalLogo1 = `<img src="${dalImg}" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.12] pointer-events-none object-contain z-10 mix-blend-screen">`;

                sbh = `<div class="sb-dark scoreboard-surface w-[calc(100%+48px)] -mx-6 rounded-none border-x-0 relative overflow-hidden mb-5 shadow-xl flex flex-col border-y border-white/15" style="${bgStyle} --score-away-soft:${h1}24; --score-home-soft:${h2}24;">
                    ${dalBadge}${centerDalLogo1}
                    <img src="${teamLogos[m.team1]}" class="scoreboard-team-watermark absolute -left-6 top-[35%] -translate-y-1/2 w-32 h-32 opacity-15 grayscale mix-blend-overlay pointer-events-none scale-110">
                    <img src="${teamLogos[m.team2]}" class="scoreboard-team-watermark absolute -right-6 top-[35%] -translate-y-1/2 w-32 h-32 opacity-15 grayscale mix-blend-overlay pointer-events-none scale-110">
                    
                    <div class="flex justify-between items-center px-5 py-2 relative z-10 h-[62px]">
                        <div class="flex items-center gap-3 w-[36%]">
                            <span class="text-[26px] font-black text-[#FFFFFF] tracking-tighter drop-shadow-md">${m.team1}</span>
                            <span class="text-[34px] font-black text-[#FFFFFF] drop-shadow-md ml-auto leading-none">${aScoreBanner}</span>
                        </div>
                        <div class="flex flex-col items-center justify-center w-[28%] mt-0.5">${inningArea}</div>
                        <div class="flex items-center gap-3 w-[36%]">
                            <span class="text-[34px] font-black text-[#FFFFFF] drop-shadow-md mr-auto leading-none">${hScoreBanner}</span>
                            <span class="text-[26px] font-black text-[#FFFFFF] tracking-tighter drop-shadow-md">${m.team2}</span>
                        </div>
                    </div>
                    
                    <div class="w-full h-px bg-[rgba(255,255,255,0.3)] relative z-10"></div>
                    
                    <div class="flex justify-between items-center bg-[rgba(0,0,0,0.4)] relative z-10 h-[28px]">
                        <div class="flex items-center gap-2.5 w-[36%] pl-5">${aPitcherArea}</div>
                        <div class="flex items-center justify-center bg-[#0d0d0e] h-full w-[28%]" style="border-left: 1px solid rgba(255,255,255,0.2); border-right: 1px solid rgba(255,255,255,0.2);">${centerArea}</div>
                        <div class="flex items-center justify-end gap-2.5 w-[36%] pr-5">${hPitcherArea}</div>
                    </div>
                    
                    <div class="w-full bg-[#111113]/90 flex flex-col pt-1.5 pb-2 px-3 relative z-10 border-t border-[rgba(255,255,255,0.15)] backdrop-blur-md">
                        <div class="flex w-full text-[10px] font-bold items-center">
                            <div class="flex flex-col w-[36px] shrink-0 text-left pl-1 gap-y-1.5 pt-0">
                                <div class="text-gray-400">팀명</div>
                                <div class="text-white truncate mt-0.5">${m.team1}</div>
                                <div class="text-white truncate mt-0.5">${m.team2}</div>
                            </div>
                            
                            <div class="${tableWrapperClass}">
                                <div class="${tableInnerClass}">
                                    <div class="${rowClass} text-gray-400">${inningHeaderHtml}</div>
                                    <div class="${rowClass} text-gray-300 mt-0.5">${aInningsHtml}</div>
                                    <div class="${rowClass} text-gray-300 mt-0.5">${hInningsHtml}</div>
                                </div>
                            </div>
                            
                            <div class="scoreboard-rheb-panel flex flex-col shrink-0 gap-y-1.5 px-1 text-center" style="border-left: 1px solid rgba(255,255,255,0.1);">
                                <div class="flex gap-1 text-[#60A5FA] justify-center"><div class="font-black w-[12px]">R</div><div class="w-[12px]">H</div><div class="w-[12px]">E</div><div class="w-[12px]">B</div></div>
                                <div class="flex gap-1 mt-0.5 justify-center"><div class="text-white font-black w-[12px]">${aScoreBanner}</div><div class="text-gray-400 w-[12px]">${aHit}</div><div class="text-gray-400 w-[12px]">${aErr}</div><div class="text-gray-400 w-[12px]">${aBase}</div></div>
                                <div class="flex gap-1 mt-0.5 justify-center"><div class="text-white font-black w-[12px]">${hScoreBanner}</div><div class="text-gray-400 w-[12px]">${hHit}</div><div class="text-gray-400 w-[12px]">${hErr}</div><div class="text-gray-400 w-[12px]">${hBase}</div></div>
                            </div>
                        </div>
                    </div>
                </div>`;
                if (iC) sbh = sbh.replace(/<\/div>\s*$/, bigStamp('우천취소', STAMP_HEX.CANCEL) + '</div>');

                if (m.date.startsWith('2026-05')) {
                    sbh += `<div class="w-full mb-5">
                        <button onclick="openTicketPopup('${m.date}')" class="w-full bg-gradient-to-r from-[#0B132B] to-[#1E3A8A]/40 border border-blue-500/30 shadow-[0_4px_12px_rgba(37,99,235,0.15)] text-blue-50 text-[14px] font-black tracking-tight py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all" style="color: #ffffff !important;">
                            <i class="fa-solid fa-ticket text-blue-300 text-lg rotate-[-15deg]" style="color: #93c5fd !important;"></i> MOONLIGHT 기념 티켓 발급
                        </button>
                    </div>`;
                }
            } else if (isClassic) {
                let classicSch = sch.replace(/text-white/g, 'text-gray-900 drop-shadow-none').replace(/text-point/g, 'text-[#EA0029] drop-shadow-none').replace(/text-gray-700/g, 'text-gray-800').replace(/text-gray-500/g, 'text-gray-600').replace(/text-gray-400/g, 'text-gray-600').replace(/bg-white\/5/g, 'bg-black/5 border-black/10 text-gray-900 shadow-none border').replace(/text-\[#FFFFFF\]/g, 'text-[#111]').replace(/text-\[#93c5fd\]/g, 'text-gray-800');
                
                sbh = `
                <style>
                    /* 팝업 전체 테마 덮어쓰기 (클래식 모드) */
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #lineup-popup.app-bg,
                    html.light-mode:has(#lineup-popup:not(.render-hidden) .classic-marker) #lineup-popup.app-bg { background-color: #EBE7DF !important; background-image: linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px) !important; background-size: 15px 15px !important; transition: none !important; }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) header.app-bg,
                    html.light-mode:has(#lineup-popup:not(.render-hidden) .classic-marker) header.app-bg { background-color: transparent !important; background-image: none !important; transition: none !important; }
                    #lineup-content { color: #111 !important; }
                    #lineup-content span.text-white, #lineup-content div.text-white { color: #111 !important; text-shadow: none !important; }
                    #lineup-content span.text-gray-200, #lineup-content span.text-gray-400, #lineup-content span.text-gray-500, #lineup-content div.text-gray-500 { color: #444 !important; }
                    #lineup-content .text-gray-400\\/60 { color: #555 !important; }
                    #lineup-content .bg-white\\/5 { background-color: rgba(255,255,255,0.4) !important; border-color: rgba(0,0,0,0.1) !important; border-bottom: 1px solid rgba(0,0,0,0.1) !important;}
                    #lineup-content .bg-\\[\\#222224\\] { background-color: #fff !important; border-color: #e5e7eb !important; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
                    #lineup-content .bg-white\\/10 { background-color: rgba(0,0,0,0.05) !important; }
                    #lineup-content .fa-user, #lineup-content .fa-clipboard-question { color: #9ca3af !important; }
                    #lineup-content .border-white\\/5, #lineup-content .border-white\\/10 { border-color: rgba(0,0,0,0.08) !important; }
                    #lineup-content .text-\\[14px\\].font-bold.text-gray-200.truncate { color: #111 !important; font-weight: 900 !important; font-size: 16px !important; }
                    #lineup-content span[style*="background-color"] { color: #fff !important; border: none !important; }
                    #lineup-content .bg-blue-600 { background-color: #004A99 !important; color: white !important; }
                    
                    /* 헤더 네비게이션 테마 덮어쓰기 (팝업 내부에서만 적용됨) */
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #left-wrapper { background: transparent !important; box-shadow: none !important; border: none !important; }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #header-popup-title { background: #fff !important; border-radius: 100px !important; border: 1px solid rgba(0,0,0,0.1) !important; box-shadow: 0 4px 10px rgba(0,0,0,0.05) !important; padding: 2px 16px !important; }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #header-popup-text { color: #111 !important; font-weight: 900 !important; }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #ctrl-back button { background: #004A99 !important; color: #fff !important; box-shadow: 0 4px 10px rgba(0,74,153,0.3) !important; }
                    html:has(#lineup-popup:not(.render-hidden) .classic-marker) #ctrl-wrapper { background: transparent !important; box-shadow: none !important; border: none !important; }
                </style>
                <div class="classic-marker hidden"></div>
                <div class="relative px-4 pb-6 pt-1 mb-2 mt-0">
                    <div class="flex justify-center items-center gap-[1.5px] mt-1 mb-2 z-10 relative opacity-95">
                        <span class="text-[14px] font-black px-1.5 py-0.5 -rotate-3 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #111111 !important; font-family: 'Georgia', serif; font-style: italic;">클</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 rotate-2 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #0F3789 !important; font-style: italic;">래</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 -rotate-6 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #111111 !important; background-color: #E2235B !important; font-style: italic;">식</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 rotate-3 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #0F3789 !important; font-family: 'Georgia', serif; font-style: italic;">씨</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 -rotate-2 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #111111 !important; background-color: #D1D1D1 !important; font-style: italic;">리</span>
                        <span class="text-[14px] font-black px-1.5 py-0.5 rotate-6 shadow-[1.5px_1.5px_0_#000] border border-black" style="color: #ffffff !important; background-color: #E2235B !important; font-family: 'Georgia', serif; font-style: italic;">즈</span>
                    </div>

                    <div class="flex justify-between items-center relative z-10 mt-4">
                        <div class="flex flex-col items-center w-[30%]">${l1Lg.replace('drop-shadow-lg', 'drop-shadow-md')}<span class="text-[16px] font-black text-gray-900 tracking-wider mt-1" style="color: #111 !important;">${m.team1}</span><span class="text-[12px] font-black text-gray-600 tracking-widest mt-0.5" style="color: #444 !important;">AWAY</span></div>
                        <div class="flex flex-col items-center justify-center w-[40%]">${classicSch}</div>
                        <div class="flex flex-col items-center w-[30%]">${l2Lg.replace('drop-shadow-lg', 'drop-shadow-md')}<span class="text-[16px] font-black text-gray-900 tracking-wider mt-1" style="color: #111 !important;">${m.team2}</span><span class="text-[12px] font-black text-gray-600 tracking-widest mt-0.5" style="color: #444 !important;">HOME</span></div>
                    </div>
                </div>`;
            } else {
                let aScoreBanner = l.awayScore || '0', hScoreBanner = l.homeScore || '0';
                let aHit = l.awayHit || '0', aErr = l.awayError || '0', aBase = l.awayBase || '0';
                let hHit = l.homeHit || '0', hErr = l.homeError || '0', hBase = l.homeBase || '0';
                
                let innNum = (l.inning || '').replace(/[^0-9]/g, '') || '1';
                let currentInnInt = parseInt(innNum) || 1;
                let aInnings = l.awayInning || [];
                let hInnings = l.homeInning || [];
                
                let maxInning = Math.max(9, aInnings.length, hInnings.length);
                if (l.gameStatus === '경기중' && currentInnInt > 9) maxInning = Math.max(maxInning, currentInnInt);
                
                let isExtra = maxInning > 9;
                
                let inningHeaderHtml = '', aInningsHtml = '', hInningsHtml = '';
                let isTop = (l.inning && l.inning.includes('초'));
                
                for (let i = 1; i <= maxInning; i++) {
                    let aVal = aInnings[i-1] !== undefined ? aInnings[i-1] : '-';
                    let hVal = hInnings[i-1] !== undefined ? hInnings[i-1] : '-';
                    let isCurA = (i === currentInnInt && isTop && l.gameStatus === '경기중');
                    let isCurH = (i === currentInnInt && !isTop && l.gameStatus === '경기중');
                    
                    let aFormatted = isCurA ? `<div class="relative inline-block"><span class="relative z-10 text-white font-bold">${aVal}</span><div class="absolute -bottom-[2px] left-1/2 -translate-x-1/2 w-[10px] h-[1.5px] bg-[#6ee7b7]"></div></div>` : aVal;
                    let hFormatted = isCurH ? `<div class="relative inline-block"><span class="relative z-10 text-white font-bold">${hVal}</span><div class="absolute -bottom-[2px] left-1/2 -translate-x-1/2 w-[10px] h-[1.5px] bg-[#6ee7b7]"></div></div>` : hVal;

                    if (isExtra) {
                        inningHeaderHtml += `<div class="w-[20px] text-center shrink-0">${i}</div>`;
                        aInningsHtml += `<div class="w-[20px] text-center shrink-0">${aFormatted}</div>`;
                        hInningsHtml += `<div class="w-[20px] text-center shrink-0">${hFormatted}</div>`;
                    } else {
                        inningHeaderHtml += `<div>${i}</div>`;
                        aInningsHtml += `<div>${aFormatted}</div>`;
                        hInningsHtml += `<div>${hFormatted}</div>`;
                    }
                }
                
                let tableWrapperClass = isExtra ? 'flex-1 overflow-x-auto scrollbar-hide ml-1' : 'flex-1 ml-1';
                let tableInnerClass = isExtra ? 'flex flex-col min-w-max gap-y-1.5 w-full pr-3' : 'flex flex-col gap-y-1.5 w-full pr-2';
                let rowClass = isExtra ? 'flex gap-1.5 justify-start' : 'grid grid-cols-9 text-center';

                let aPitcherArea = '', hPitcherArea = '', inningArea = '', centerArea = '';
                let apRawBanner = l.awayPitcherDetail || l.awayPitcher || '-';
                let hpRawBanner = l.homePitcherDetail || l.homePitcher || '-';
                let aPitcher = _curPitcherName(l, 'away');
                let hPitcher = _curPitcherName(l, 'home');
                let aPCount = l.awayPitcherCount || '0', hPCount = l.homePitcherCount || '0';
                
                let oCount = parseInt(l.out || 0), bCount = parseInt(l.ball || 0), sCount = parseInt(l.strike || 0);
                let outDotsHtml = ''; for(let i=1; i<=2; i++) outDotsHtml += `<div class="w-1.5 h-1.5 rounded-full ${i <= oCount ? 'bg-[#ef4444] shadow-[0_0_3px_#ef4444]' : 'bg-[#4b5563]'}"></div>`;
                let base1 = l.base1 ? 'bg-[#6ee7b7] shadow-[0_0_5px_rgba(110,231,183,0.6)]' : 'bg-[#374151]', base2 = l.base2 ? 'bg-[#6ee7b7] shadow-[0_0_5px_rgba(110,231,183,0.6)]' : 'bg-[#374151]', base3 = l.base3 ? 'bg-[#6ee7b7] shadow-[0_0_5px_rgba(110,231,183,0.6)]' : 'bg-[#374151]';
                let innIcon = isTop ? `<div class="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-[#6ee7b7] mt-0.5"></div>` : `<div class="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-[#6ee7b7] mt-0.5"></div>`;

                if (l.gameStatus === '종료' && !iC) {
                    let aWin = parseInt(aScoreBanner) > parseInt(hScoreBanner), hWin = parseInt(hScoreBanner) > parseInt(aScoreBanner);
                    let aText = aWin ? `<span class="text-[#f87171] font-black mr-1">승</span>${l.winPitcher||'-'}` : (hWin ? `<span class="text-[#60a5fa] font-black mr-1">패</span>${l.losePitcher||'-'}` : `<span class="text-gray-400">무승부</span>`);
                    let hText = hWin ? `<span class="text-[#f87171] font-black mr-1">승</span>${l.winPitcher||'-'}` : (aWin ? `<span class="text-[#60a5fa] font-black mr-1">패</span>${l.losePitcher||'-'}` : `<span class="text-gray-400">무승부</span>`);
                    aPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate">${aText}</span>`; 
                    hPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate text-right">${hText}</span>`;
                    inningArea = `<span class="text-[14px] font-black text-[#FFFFFF] drop-shadow-md tracking-widest mt-1">종료</span>`; 
                    centerArea = `<span class="text-[12px] font-bold text-gray-400 tracking-widest mt-px">경기결과</span>`;
                } else if (l.gameStatus === '경기전' || iC) {
                    let awayExpectedStarter = _starterForLineup(m, l, 'away');
                    let homeExpectedStarter = _starterForLineup(m, l, 'home');
                    let awayStarterText = awayExpectedStarter.name ? `${awayExpectedStarter.predicted ? '예상 선발 ' : '선발 '}${awayExpectedStarter.name}` : '예상 선발 미정';
                    let homeStarterText = homeExpectedStarter.name ? `${homeExpectedStarter.predicted ? '예상 선발 ' : '선발 '}${homeExpectedStarter.name}` : '예상 선발 미정';
                    aPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate">${awayStarterText}</span>`;
                    hPitcherArea = `<span class="text-[11px] font-bold text-[#FFFFFF] drop-shadow-md tracking-tight truncate text-right">${homeStarterText}</span>`;
                    let centerTxt = iC ? '우천취소' : m.time;
                    inningArea = `<span class="text-[14px] font-black text-[#FFFFFF] drop-shadow-md tracking-widest mt-1">${centerTxt}</span>`;
                    centerArea = `<span class="text-[11px] font-bold text-gray-400 tracking-widest mt-px">${m.stadium}</span>`;
                    aScoreBanner = '-'; hScoreBanner = '-';
                } else {
                    let livePersonnel = _scoreboardLivePersonnel(l, isTop);
                    aPitcherArea = livePersonnel.away;
                    hPitcherArea = livePersonnel.home;
                    inningArea = `<div class="w-[28px] h-[24px] relative mb-0.5"><div class="absolute top-[1px] left-[10px] w-[8px] h-[8px] rotate-45 ${base2}"></div><div class="absolute top-[9px] left-[2px] w-[8px] h-[8px] rotate-45 ${base3}"></div><div class="absolute top-[9px] left-[18px] w-[8px] h-[8px] rotate-45 ${base1}"></div></div><div class="flex items-center gap-1.5">${innIcon}<span class="text-[13px] font-black text-[#FFFFFF] drop-shadow-md leading-none tracking-tighter">${innNum}</span></div>`;
                    centerArea = `<div class="flex gap-[3px] mr-1.5">${outDotsHtml}</div><span class="text-[12px] font-black text-[#FFFFFF] tracking-widest mt-px">${bCount}-${sCount}</span>`;
                }

                const allstarLogo1 = isAllstarGame ? `<img src="${teamLogos[m.team1]}" class="w-[clamp(26px,8vw,42px)] h-[clamp(26px,8vw,42px)] object-contain shrink-0">` : '';
                const allstarLogo2 = isAllstarGame ? `<img src="${teamLogos[m.team2]}" class="w-[clamp(26px,8vw,42px)] h-[clamp(26px,8vw,42px)] object-contain shrink-0">` : '';
                const sideWidthClass = isAllstarGame ? 'w-[40%]' : 'w-[36%]';
                const centerWidthClass = isAllstarGame ? 'w-[20%]' : 'w-[28%]';
                const sideGapClass = isAllstarGame ? 'gap-1' : 'gap-3';
                const allstarNameStyle = isAllstarGame ? 'font-size:clamp(13px,4.2vw,22px);white-space:nowrap;line-height:1;' : '';

                sbh = `<div class="sb-dark scoreboard-surface w-[calc(100%+48px)] -mx-6 rounded-none border-x-0 relative overflow-hidden mb-5 shadow-xl flex flex-col border-y border-white/15" style="background: linear-gradient(to right, ${h1}E6 0%, #18181b 45%, #18181b 55%, ${h2}E6 100%); --score-away-soft:${h1}24; --score-home-soft:${h2}24;">
                    <img src="${teamLogos[m.team1]}" class="scoreboard-team-watermark absolute -left-6 top-[35%] -translate-y-1/2 w-32 h-32 opacity-15 grayscale mix-blend-overlay pointer-events-none scale-110">
                    <img src="${teamLogos[m.team2]}" class="scoreboard-team-watermark absolute -right-6 top-[35%] -translate-y-1/2 w-32 h-32 opacity-15 grayscale mix-blend-overlay pointer-events-none scale-110">
                    
                    <div class="flex justify-between items-center px-5 py-2 relative z-10 h-[62px]">
                        <div class="flex items-center ${sideGapClass} ${sideWidthClass} min-w-0">
                            ${allstarLogo1}<span class="text-[26px] font-black text-[#FFFFFF] tracking-tighter drop-shadow-md" style="${allstarNameStyle}">${m.team1}</span>
                            <span class="text-[34px] font-black text-[#FFFFFF] drop-shadow-md ml-auto leading-none">${aScoreBanner}</span>
                        </div>
                        <div class="flex flex-col items-center justify-center ${centerWidthClass} mt-0.5">${inningArea}</div>
                        <div class="flex items-center ${sideGapClass} ${sideWidthClass} min-w-0">
                            <span class="text-[34px] font-black text-[#FFFFFF] drop-shadow-md mr-auto leading-none">${hScoreBanner}</span>
                            <span class="text-[26px] font-black text-[#FFFFFF] tracking-tighter drop-shadow-md" style="${allstarNameStyle}">${m.team2}</span>${allstarLogo2}
                        </div>
                    </div>
                    
                    <div class="w-full h-px bg-[rgba(255,255,255,0.3)] relative z-10"></div>
                    
                    <div class="flex justify-between items-center bg-[rgba(0,0,0,0.4)] relative z-10 h-[28px]">
                        <div class="flex items-center gap-2.5 w-[36%] pl-5">${aPitcherArea}</div>
                        <div class="flex items-center justify-center bg-[#0d0d0e] h-full w-[28%]" style="border-left: 1px solid rgba(255,255,255,0.2); border-right: 1px solid rgba(255,255,255,0.2);">${centerArea}</div>
                        <div class="flex items-center justify-end gap-2.5 w-[36%] pr-5">${hPitcherArea}</div>
                    </div>
                    
                    <div class="w-full bg-[#111113]/90 flex flex-col pt-1.5 pb-2 px-3 relative z-10 border-t border-[rgba(255,255,255,0.15)] backdrop-blur-md">
                        <div class="flex w-full text-[10px] font-bold items-center">
                            <div class="flex flex-col w-[36px] shrink-0 text-left pl-1 gap-y-1.5 pt-0">
                                <div class="text-gray-400">팀명</div>
                                <div class="text-white truncate mt-0.5">${m.team1}</div>
                                <div class="text-white truncate mt-0.5">${m.team2}</div>
                            </div>
                            
                            <div class="${tableWrapperClass}">
                                <div class="${tableInnerClass}">
                                    <div class="${rowClass} text-gray-400">${inningHeaderHtml}</div>
                                    <div class="${rowClass} text-gray-300 mt-0.5">${aInningsHtml}</div>
                                    <div class="${rowClass} text-gray-300 mt-0.5">${hInningsHtml}</div>
                                </div>
                            </div>
                            
                            <div class="scoreboard-rheb-panel flex flex-col shrink-0 gap-y-1.5 px-1 text-center" style="border-left: 1px solid rgba(255,255,255,0.1);">
                                <div class="flex gap-1 text-[#60A5FA] justify-center"><div class="font-black w-[12px]">R</div><div class="w-[12px]">H</div><div class="w-[12px]">E</div><div class="w-[12px]">B</div></div>
                                <div class="flex gap-1 mt-0.5 justify-center"><div class="text-white font-black w-[12px]">${aScoreBanner}</div><div class="text-gray-400 w-[12px]">${aHit}</div><div class="text-gray-400 w-[12px]">${aErr}</div><div class="text-gray-400 w-[12px]">${aBase}</div></div>
                                <div class="flex gap-1 mt-0.5 justify-center"><div class="text-white font-black w-[12px]">${hScoreBanner}</div><div class="text-gray-400 w-[12px]">${hHit}</div><div class="text-gray-400 w-[12px]">${hErr}</div><div class="text-gray-400 w-[12px]">${hBase}</div></div>
                            </div>
                        </div>
                    </div>
                </div>`;
                if (iC) sbh = sbh.replace(/<\/div>\s*$/, bigStamp('우천취소', STAMP_HEX.CANCEL) + '</div>');
            }

            if (isClassicSeries) sbh = classicSeriesHeader(m) + sbh;

            // [추가] 스코어보드 밑 승리 확률 막대 (클래식 테마는 레트로 디자인 유지 위해 제외)
            let wpb = isClassic ? '' : winProbBarHtml(m, l);
            const infoTabs = gameInfoTabsHtml();

            if (currentGameInfoTab === 'broadcast') {
                c.innerHTML = sbh + wpb + infoTabs + gameBroadcastHtml(m, l);
                return;
            }
            if (currentGameInfoTab === 'record') {
                c.innerHTML = sbh + wpb + infoTabs + gameRecordHtml(m, l);
                requestAnimationFrame(() => {
                    const activeInning = c.querySelector('.game-record-inning-tab.active');
                    const inningTabs = activeInning && activeInning.parentElement;
                    if (inningTabs) inningTabs.scrollLeft = activeInning.offsetLeft - (inningTabs.clientWidth - activeInning.clientWidth) / 2;
                });
                return;
            }

            const awayStarterInfo = _starterForLineup(m, l, 'away');
            const homeStarterInfo = _starterForLineup(m, l, 'home');
            let apRaw = awayStarterInfo.raw || '-';
            let hpRaw = homeStarterInfo.raw || '-';
            let aLineupSrc = _lineupWithSubstitutions(l, 'away');
            let hLineupSrc = _lineupWithSubstitutions(l, 'home');

            if (aLineupSrc.length === 0 && hLineupSrc.length === 0) {
                const starterPreview = expectedStarterPreviewHtml(m, awayStarterInfo, homeStarterInfo);
                c.innerHTML = sbh + wpb + infoTabs + starterPreview + `<div class="flex flex-col items-center justify-center min-h-32 text-gray-400 mt-2 gap-2"><span class="text-[15px] font-black text-white tracking-wide">라인업 미발표</span><span class="text-[11px] text-gray-500 text-center leading-relaxed">선발 라인업은 경기 시작 1~2시간 전에 공개됩니다.</span></div>`;
                return;
            }
            
            let lg1 = uiTeamLogo(m.team1, 'w-6 h-6', 'w-6 h-6');
            let lg2 = uiTeamLogo(m.team2, 'w-6 h-6', 'w-6 h-6');
            
            // 투수 행 렌더 헬퍼 (선발/불펜 공통)
            const _pf_img = (nm) => playerImages[nm] ? `<img src="${playerImages[nm]}" class="w-full h-full object-contain object-bottom scale-[1.3] drop-shadow-md origin-bottom">` : `<i class="fa-solid fa-user text-gray-500 text-[16px] mt-1.5"></i>`;
            const _pf_box = (nm) => playerImages[nm] ? "w-9 h-9 flex items-end justify-center shrink-0" : "w-9 h-9 bg-[#222224] rounded-full flex items-center justify-center overflow-hidden shrink-0 border border-white/10";
            const pitcherRow = (raw, hx, label, recHtml, filled) => {
                let nm = (typeof raw === 'object' && raw !== null) ? raw.name : raw;
                if (!nm || nm === '-') return '';
                let pos = (typeof raw === 'object' && raw !== null && raw.position) ? raw.position : '투수';
                let thr = _throwsOf(raw);
                let bat = thr ? `<span class="text-[9px] font-bold text-gray-500 border border-gray-600/50 rounded-sm px-1 ml-1 leading-none inline-flex items-center justify-center h-[14px] opacity-80 shrink-0">${thr}</span>` : '';
                let bs = filled ? `background-color:${hx};border:1px solid ${hx};color:#ffffff !important;` : `background:transparent;border:1px solid ${hx};color:${hx};`;
                return `<div class="mb-3.5"><div class="flex items-center gap-2"><div class="w-[22px] flex justify-center shrink-0"><span style="${bs}" class="text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm">${label}</span></div><div class="${_pf_box(nm)}">${_pf_img(nm)}</div><div class="flex flex-col min-w-0 flex-1"><div class="flex items-center gap-x-1"><span class="text-[clamp(11px,3vw,14px)] font-bold text-white whitespace-nowrap tracking-tight shrink">${nm}</span>${bat}</div><span class="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">${pos}</span></div></div>${recHtml || ''}</div>`;
            };
            // 선발 = 상세 객체(awayStarterDetail/awayPitcherDetail, 사진·좌우 포함), 현재(마운드) 투수 = 라이브에서 갱신되는 문자열(awayPitcher)
            let aStarterRaw = awayStarterInfo.raw || '-';
            let hStarterRaw = homeStarterInfo.raw || '-';
            let aStarterDisp = (typeof aStarterRaw === 'object' && aStarterRaw !== null) ? aStarterRaw.name : aStarterRaw;
            let hStarterDisp = (typeof hStarterRaw === 'object' && hStarterRaw !== null) ? hStarterRaw.name : hStarterRaw;
            let aCurName = (typeof l.awayPitcher === 'string' && l.awayPitcher) ? l.awayPitcher : ((l.awayPitcherDetail && l.awayPitcherDetail.name) || aStarterDisp);
            let hCurName = (typeof l.homePitcher === 'string' && l.homePitcher) ? l.homePitcher : ((l.homePitcherDetail && l.homePitcherDetail.name) || hStarterDisp);
            let _liveOrEnd = (l.gameStatus === '경기중' || l.gameStatus === '종료');
            let aBullpenOn = _liveOrEnd && aCurName && aCurName !== '-' && aCurName !== aStarterDisp;
            let hBullpenOn = _liveOrEnd && hCurName && hCurName !== '-' && hCurName !== hStarterDisp;

            // [추가] 선발 투수 전적 — 얼굴/이름 아래 전체 너비로 표시(글자 잘림 방지)
            const starterRecHtml = (name, team, opp, hx) => {
                if (!name || name === '-') return '';
                let r = pitcherRecords(name, team, opp);
                let parts = [
                    `<span style="color:${hx}">시즌 ${r.seasonW}승 ${r.seasonL}패</span>`,
                    `<span class="text-gray-400">${opp}전 ${r.vsW}승 ${r.vsL}패</span>`
                ];
                return `<div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-2 text-[10px] font-bold leading-tight">${parts.join('<span class="text-gray-600">·</span>')}</div>`;
            };
            let apRecHtml = isClassic ? '' : starterRecHtml(aStarterDisp, m.team1, m.team2, h1);
            let hpRecHtml = isClassic ? '' : starterRecHtml(hStarterDisp, m.team2, m.team1, h2);

            let aph = pitcherRow(aStarterRaw, h1, awayStarterInfo.predicted ? '예상' : '선발', apRecHtml, true) + (aBullpenOn ? pitcherRow(aCurName, h1, '불펜', '', false) : '');
            let hph = pitcherRow(hStarterRaw, h2, homeStarterInfo.predicted ? '예상' : '선발', hpRecHtml, true) + (hBullpenOn ? pitcherRow(hCurName, h2, '불펜', '', false) : '');
            
            const lineupRows = (source, hex) => (source && source.length > 0) ? source.map((pObj, i) => {
                let p = _lineupPlayerName(pObj) || '-';
                let isSub = _isSubstitutionPlayer(pObj);
                let role = _substitutionRoleOf(pObj);
                let position = _normalizeDefensePosition(pObj && (pObj._lineupDisplayPosition || pObj.position));
                let pos = position || role || '타자';
                if (isSub && position && role && role !== '교체') pos = `${position} · ${role}`;
                let batRaw = pObj && pObj.batsThrows ? pObj.batsThrows : '';
                let bat = batRaw ? `<span class="text-[9px] font-bold text-gray-500 border border-gray-600/50 rounded-sm px-1 ml-1 leading-none inline-flex items-center justify-center h-[14px] opacity-80 shrink-0">${batRaw}</span>` : '';
                let hi = playerImages[p], pim = hi ? `<img src="${hi}" class="w-full h-full object-contain object-bottom scale-[1.3] drop-shadow-md origin-bottom">` : `<i class="fa-solid fa-user text-gray-500 text-[16px] mt-1.5"></i>`;
                let pf = hi ? 'w-9 h-9 flex items-end justify-center shrink-0' : 'w-9 h-9 bg-[#222224] rounded-full flex items-center justify-center overflow-hidden shrink-0 border border-white/10';
                let marker = isSub ? '<span class="lineup-sub-arrow">↑</span>' : String(_lineupOrderOf(pObj, i + 1));
                let markerStyle = isSub ? '' : `color:${hex}`;
                return `<div class="flex items-center gap-2 mb-3.5"><span class="w-[22px] min-h-[20px] flex items-center justify-center text-center text-[15px] font-black shrink-0" style="${markerStyle}">${marker}</span><div class="${pf}">${pim}</div><div class="flex flex-col min-w-0 flex-1"><div class="flex items-center gap-x-1"><span class="text-[clamp(11px,3vw,14px)] font-bold text-white whitespace-nowrap tracking-tight shrink">${p}</span>${bat}</div><span class="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">${pos}</span></div></div>`;
            }).join('') : '<div class="text-center text-xs text-gray-500 py-4">라인업 정보 없음</div>';

            let abh = lineupRows(aLineupSrc, h1);
            let hbh = lineupRows(hLineupSrc, h2);
            
            c.innerHTML = sbh + wpb + infoTabs + `<div class="flex w-full pt-1 px-1"><div class="flex-1 flex flex-col pr-2 min-w-0"><div class="flex items-center gap-1.5 mb-3"><div class="w-6 h-6 flex items-center justify-center shrink-0">${lg1}</div><span class="text-[14px] font-bold text-gray-200 truncate">${m.team1}선발</span></div>${aph}<div class="w-full h-px bg-white/5 mb-3.5"></div>${abh}</div><div class="w-px bg-white/10 shrink-0 mx-2 mb-4"></div><div class="flex-1 flex flex-col pl-2 min-w-0"><div class="flex items-center gap-1.5 mb-3"><div class="w-6 h-6 flex items-center justify-center shrink-0">${lg2}</div><span class="text-[14px] font-bold text-gray-200 truncate">${m.team2}선발</span></div>${hph}<div class="w-full h-px bg-white/5 mb-3.5"></div>${hbh}</div></div>`;
        }

    window.switchGameInfoTab = switchGameInfoTab;
    window.selectGameRecordInning = selectGameRecordInning;

    function normalizeGame(raw) {
        const game = Object.assign({}, raw || {});
        game.id = game.id == null ? '' : String(game.id);
        game.team1 = game.awayTeam || game.team1;
        game.team2 = game.homeTeam || game.team2;
        game.time = game.gameTime || game.time;
        game.bannerLink = '';
        return game;
    }

    function mergeGame(raw, live) {
        if (!raw) return;
        const game = normalizeGame(raw);
        let scheduled = scheduleData.find(item => String(item.id) === game.id);
        if (!scheduled) {
            scheduled = game;
            scheduleData.push(scheduled);
        } else {
            Object.assign(scheduled, game);
        }
        if (live) liveDataStore[game.id] = Object.assign({}, liveDataStore[game.id] || {}, game);
    }

    function mergeDocument(documentData, live) {
        ((documentData && documentData.games) || []).forEach(game => mergeGame(game, live));
    }

    function loadHistory() {
        if (!window.KBO_HISTORY_2026 || !window.KBO_HISTORY_2026.gamesByDate) return;
        Object.values(window.KBO_HISTORY_2026.gamesByDate).forEach(dayGames => {
            dayGames.forEach(game => mergeGame(game, true));
        });
    }

    async function refreshRequestedGame(showError) {
        const id = params.get('matchId') || '';
        const date = params.get('matchDate') || todayStr;
        const month = /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : todayStr.slice(0, 7);
        try {
            const results = await Promise.all([
                _fsGetDoc(`schedule/${month}`),
                _fsGetDoc(`games/${date}`),
                _fsGetDoc('live/today')
            ]);
            mergeDocument(results[0], false);
            mergeDocument(results[1], true);
            mergeDocument(results[2], true);
            scheduleData.sort((a, b) => a.date === b.date
                ? (a.time || '00:00').localeCompare(b.time || '00:00')
                : String(a.date || '').localeCompare(String(b.date || '')));
            refreshRankingFromHistory();
            const match = scheduleData.find(game => String(game.id) === String(id));
            if (!match) throw new Error('match not found');
            currentPopupMatchId = match.id;
            renderPopupContent(match.id);
            const loader = document.getElementById('detail-loader');
            if (loader) loader.classList.add('hidden');
            window.parent.postMessage({ type: 'enjoy-baseball-detail-ready' }, '*');
        } catch (error) {
            if (showError) {
                const loader = document.getElementById('detail-loader');
                if (loader) loader.innerHTML = '<i class="fa-regular fa-circle-xmark text-2xl text-gray-400"></i><span>경기 정보를 불러오지 못했어요.</span>';
            }
            console.warn('경기 상세 정보를 불러오지 못했습니다.', error);
        }
    }

    document.documentElement.classList.toggle('light-mode', window.matchMedia('(prefers-color-scheme: light)').matches);
    document.body.dataset.theme = selectedTeam;
    loadHistory();
    refreshRankingFromHistory();
    refreshRequestedGame(true);
    setInterval(() => refreshRequestedGame(false), 30000);
})();
