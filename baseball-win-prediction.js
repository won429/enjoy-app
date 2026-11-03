(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EnjoyBaseballWinPrediction = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';

    const DAY = 86400000;
    const TEAMS = new Set(['LG', '두산', 'KIA', '삼성', 'SSG', '롯데', '한화', 'KT', 'NC', '키움']);
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const number = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;
    const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00Z') / DAY : NaN;
    const nameOf = raw => String(raw && typeof raw === 'object' ? raw.name || raw.playerName || '' : raw || '').trim();
    const validName = raw => nameOf(raw) && !/^(?:-|미정|TBD)$/i.test(nameOf(raw));
    const sigmoid = value => 1 / (1 + Math.exp(-clamp(value, -30, 30)));
    const logit = p => Math.log(clamp(p, .001, .999) / (1 - clamp(p, .001, .999)));
    const status = game => game.gameStatus || game.status || '';
    const canceled = game => /취소|우취|우천|cancel/i.test([status(game), game.inning, game.cancelReason].filter(Boolean).join(' '));
    const key = game => game.id == null || game.id === '' ? [game.date, game.team1, game.team2, game.time].join('|') : String(game.id);
    const playerKey = (team, name) => team + '|' + name;
    function normalize(raw) {
        return Object.assign({}, raw, { team1: raw.awayTeam || raw.team1, team2: raw.homeTeam || raw.team2,
            time: raw.gameTime || raw.time || '', gameStatus: status(raw) });
    }
    function records(game) {
        return [game.recordBatters, game.hitterRecords, game.batterRecords].find(Array.isArray) || [];
    }
    function hand(raw) {
        const text = String(raw && (raw.throws || raw.throwingHand || raw.batsThrows) || '');
        if (/^(?:L|left|좌투)$/i.test(text)) return 'L';
        if (/^(?:R|right|우투)$/i.test(text)) return 'R';
        const match = text.match(/([좌우])(?:투|언|사)/);
        return match ? match[1] === '좌' ? 'L' : 'R' : '';
    }
    function pitcherName(raw, team) {
        const name = nameOf(raw);
        if (team !== '삼성' || name !== '이승현') return name;
        const code = String(raw && raw.playerCode || '');
        const h = hand(raw) || (code === '51454' ? 'L' : code === '60146' ? 'R' : '');
        return h === 'L' ? '좌승현' : h === 'R' ? '우승현' : '';
    }
    function starter(game, side) {
        const team = side === 'away' ? game.team1 : game.team2;
        const raws = [game[side + 'StarterDetail'], game[side + 'Starter']].filter(validName);
        const raw = raws.find(value => /^(좌|우)승현$/.test(pitcherName(value, team))) || raws[0];
        return { name: pitcherName(raw, team), hand: hand(raw) || (/^좌승현$/.test(nameOf(raw)) ? 'L' : /^우승현$/.test(nameOf(raw)) ? 'R' : ''), raw };
    }
    function lineup(game, side) {
        const source = [game[side + 'LineupDetail'], game[side + 'Lineup'], game[side + 'Players'], game[side + 'Batters']]
            .find(value => Array.isArray(value) && value.length);
        return [...new Set((source || []).map(nameOf).filter(validName))].slice(0, 9);
    }
    function completedGames(rawGames, cutoff) {
        const merged = new Map();
        for (const raw of rawGames || []) {
            const game = normalize(raw);
            if (!TEAMS.has(game.team1) || !TEAMS.has(game.team2) || !Number.isFinite(day(game.date))) continue;
            const previous = merged.get(key(game));
            if (previous && status(previous) === '종료' && status(game) !== '종료' && !canceled(game)) continue;
            merged.set(key(game), Object.assign({}, previous, game));
        }
        return [...merged.values()].filter(game => status(game) === '종료' && !canceled(game) &&
            (!cutoff || game.date < cutoff) && number(game.awayScore) !== null && number(game.homeScore) !== null &&
            Number(game.awayScore) >= 0 && Number(game.homeScore) >= 0)
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || key(a).localeCompare(key(b)));
    }

    function inningScores(raw) {
        if (!Array.isArray(raw) || raw.length < 1) return null;
        const values = raw.map(value => /^\d+$/.test(String(value).trim()) ? Number(value) : /^[-Xx]$/.test(String(value).trim()) ? null : NaN);
        return values.some(Number.isNaN) ? null : values;
    }
    function battingResult(summary, batter) {
        const lines = String(summary || '').split('\n');
        const first = lines.find(line => line.split(':')[0].trim() === batter) || lines[0];
        const text = first.includes(':') ? first.slice(first.indexOf(':') + 1) : first;
        const hr = /홈런/.test(text), triple = /3루타/.test(text), double = /2루타/.test(text);
        const hit = hr || triple || double || /1루타|내야안타|안타/.test(text);
        const walk = /볼넷|고의4구|고의사구|자동.*4구/.test(text), hbp = /몸에 맞|사구 출루/.test(text);
        const strikeout = /삼진/.test(text), dp = /병살/.test(text), tp = /삼중살/.test(text);
        const out = tp ? 3 : dp ? 2 : /아웃|희생번트|희생플라이/.test(text) ? 1 : 0;
        const known = hit || walk || hbp || out > 0;
        return { known, hr: Number(hr), double: Number(double), triple: Number(triple), hit: Number(hit),
            walk: Number(walk), hbp: Number(hbp), strikeout: Number(strikeout), out,
            reach: hr ? 4 : triple ? 3 : double ? 2 : hit || walk || hbp ? 1 : 0 };
    }

    // Only replay halves whose run and out totals agree with the authoritative
    // inning scoreboard. Unknown plays invalidate base states rather than being guessed.
    function analyze(game) {
        const rows = [...new Map(records(game).filter(row => row && row.name && number(row.inning) > 0 && /초|말/.test(row.half || row.inningLabel || ''))
            .map(row => [[row.inning, row.half || row.inningLabel, row.relayNo ?? row.sequence ?? row.name].join('|'), row])).values()]
            .sort((a, b) => Number(a.inning) - Number(b.inning) ||
                Number(/말/.test(a.half || a.inningLabel)) - Number(/말/.test(b.half || b.inningLabel)) || Number(a.relayNo || 0) - Number(b.relayNo || 0));
        const away = inningScores(game.awayInning), home = inningScores(game.homeInning);
        const scoreboardValid = away && home && away.reduce((n, v) => n + (v || 0), 0) === Number(game.awayScore) &&
            home.reduce((n, v) => n + (v || 0), 0) === Number(game.homeScore);
        const outcome = Number(game.homeScore) === Number(game.awayScore) ? .5 : Number(game.homeScore) > Number(game.awayScore) ? 1 : 0;
        const states = [], pitching = new Map(), appearances = new Map(), split = [], finalBatters = new Map();
        const groups = new Map(), latestPitcher = { away: starter(game, 'away'), home: starter(game, 'home') };
        for (const row of rows) {
            const half = /말/.test(row.half || row.inningLabel) ? 'home' : 'away';
            const groupKey = row.inning + '|' + half;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(row);
            const team = half === 'home' ? game.team2 : game.team1;
            const k = playerKey(team, row.name), previous = finalBatters.get(k);
            if (!previous || Number(row.plateAppearances || 0) > Number(previous.row.plateAppearances || 0) ||
                (Number(row.plateAppearances || 0) === Number(previous.row.plateAppearances || 0) && Number(row.relayNo || 0) > Number(previous.row.relayNo || 0))) {
                finalBatters.set(k, { team, name: row.name, row });
            }
        }
        function getPitcher(side, info) {
            if (!info.name) return null;
            const team = side === 'home' ? game.team2 : game.team1, k = playerKey(team, info.name);
            if (!pitching.has(k)) pitching.set(k, { team, name: info.name, hand: info.hand, start: info.name === starter(game, side).name, outs: 0, bf: 0, runs: 0, k: 0, bb: 0, hbp: 0, hr: 0, valid: true });
            if (!appearances.has(k)) appearances.set(k, { team, name: info.name, date: game.date, bf: 0, pitches: null,
                relief: info.name !== starter(game, side).name });
            return pitching.get(k);
        }
        for (const side of ['away', 'home']) {
            getPitcher(side, latestPitcher[side]);
            const team = side === 'home' ? game.team2 : game.team1;
            const raw = game[side + 'PitcherDetail'] || game[side + 'Pitcher'];
            const name = pitcherName(raw, team);
            if (name) {
                const info = { name, hand: hand(raw) };
                getPitcher(side, info);
                appearances.get(playerKey(team, name)).pitches = number(game[side + 'PitcherCount']);
            }
        }
        let awayRuns = 0, homeRuns = 0;
        const maxInning = scoreboardValid ? Math.max(away.length, home.length) : Math.max(0, ...rows.map(row => Number(row.inning)));
        for (let inning = 1; inning <= maxInning; inning++) for (const offense of ['away', 'home']) {
            const defense = offense === 'away' ? 'home' : 'away';
            const inningRun = scoreboardValid ? (offense === 'away' ? away : home)[inning - 1] : null;
            if (scoreboardValid && inningRun != null) states.push({ inning, half: offense, outs: 0, bases: 0, lead: homeRuns - awayRuns, outcome });
            const halfRows = groups.get(inning + '|' + offense) || [], localStates = [], localSplits = [];
            const localPitching = new Map();
            let outs = 0, runs = 0, bases = [null, null, null], knownBases = true, knownPlays = true;
            function line(info) {
                const global = getPitcher(defense, info);
                if (!global) return null;
                const k = playerKey(global.team, global.name);
                if (!localPitching.has(k)) localPitching.set(k, { ...global, outs: 0, bf: 0, runs: 0, k: 0, bb: 0, hbp: 0, hr: 0 });
                return localPitching.get(k);
            }
            function charge(owner) { if (owner && localPitching.has(owner)) localPitching.get(owner).runs++; else knownBases = false; }
            for (const row of halfRows) {
                for (const event of row.events || []) {
                    const text = typeof event === 'string' ? event : event.text || event.description || '';
                    const replacement = text.match(/투수\s+[^:]+:\s*투수\s+([^\s(]+)\s*\(/);
                    if (replacement) {
                        const team = defense === 'home' ? game.team2 : game.team1;
                        latestPitcher[defense] = { name: pitcherName(replacement[1], team), hand: '' };
                        line(latestPitcher[defense]);
                    } else if (/도루|견제사|주루사|폭투|포일|보크/.test(text)) knownBases = false;
                }
                const current = line(latestPitcher[defense]);
                const result = battingResult(row.summary, row.name);
                const lead = homeRuns - awayRuns + (offense === 'home' ? runs : -runs);
                if (knownBases && outs < 3) localStates.push({ inning, half: offense, outs, bases: bases.reduce((mask, runner, i) => mask | (runner ? 1 << i : 0), 0), lead, outcome });
                if (!current || !result.known || outs >= 3) { knownPlays = false; knownBases = false; continue; }
                const currentKey = playerKey(current.team, current.name);
                current.bf++; current.k += result.strikeout; current.bb += result.walk; current.hbp += result.hbp; current.hr += result.hr;
                appearances.get(currentKey).bf++;
                localSplits.push({ team: offense === 'home' ? game.team2 : game.team1, name: row.name,
                    hand: latestPitcher[defense].hand, pa: 1, reached: result.hit + result.walk + result.hbp, hr: result.hr });
                const old = bases.slice(), next = bases.slice();
                const runnerMoves = [], summaryLines = String(row.summary || '').split('\n');
                let explicitOuts = 0, explicitRuns = 0;
                for (const text of summaryLines) {
                    const move = text.match(/([123])루주자[^:]*:\s*(.+)/);
                    if (!move) continue;
                    const from = Number(move[1]) - 1, action = move[2];
                    next[from] = null;
                    if (/홈인/.test(action)) { explicitRuns++; charge(old[from]); }
                    else if (/아웃|실패|주루사|견제사/.test(action)) explicitOuts++;
                    else {
                        const destination = action.match(/([123])루(?:까지)?\s*(?:진루|도루|세이프)/);
                        if (destination) runnerMoves.push([Number(destination[1]) - 1, old[from]]);
                        else knownBases = false;
                    }
                }
                for (const [to, owner] of runnerMoves) { if (!owner || next[to]) knownBases = false; next[to] = owner; }
                if (result.hr) {
                    // A home run clears every occupied base, even if runner lines are omitted.
                    const totalRuns = old.filter(Boolean).length + 1;
                    for (let i = 0; i < old.length; i++) if (old[i] && next[i]) charge(old[i]);
                    charge(currentKey); runs += totalRuns; bases = [null, null, null];
                } else {
                    runs += explicitRuns;
                    if (result.walk || result.hbp) {
                        let carry = currentKey;
                        for (let i = 0; i < 3 && carry; i++) {
                            const displaced = next[i]; next[i] = carry; carry = displaced;
                        }
                        if (carry) { charge(carry); runs++; }
                    } else if (result.reach) {
                        if (next[result.reach - 1]) knownBases = false;
                        next[result.reach - 1] = currentKey;
                    } else if (result.out >= 2 && explicitOuts < result.out - 1) {
                        // Unspecified double-play runners cannot define a trustworthy base state.
                        knownBases = false;
                    }
                    bases = next;
                }
                const playOuts = result.out >= 2 ? result.out : result.out + explicitOuts;
                outs += playOuts; current.outs += playOuts;
                if (outs > 3) knownPlays = false;
            }
            const walkoff = offense === 'home' && inning >= 9 && Number(game.homeScore) > Number(game.awayScore) &&
                scoreboardValid && inning === home.length;
            const verified = scoreboardValid && inningRun != null && halfRows.length > 0 && knownPlays &&
                runs === inningRun && (outs === 3 || walkoff && outs <= 3);
            for (const [k, item] of localPitching) {
                const global = pitching.get(k);
                if (!verified || !knownBases) global.valid = false;
                if (verified) for (const field of ['outs', 'bf', 'runs', 'k', 'bb', 'hbp', 'hr']) global[field] += item[field];
            }
            if (verified) {
                states.push(...localStates);
                split.push(...localSplits.filter(item => item.hand));
            }
            if (scoreboardValid && inningRun != null) {
                if (offense === 'away') awayRuns += inningRun; else homeRuns += inningRun;
            }
        }
        const batters = [...finalBatters.values()].flatMap(({ team, name, row }) => {
            const values = ['plateAppearances', 'atBats', 'hits', 'walks', 'hbp', 'homeRuns'].map(field => number(row[field]));
            if (values.some(value => value === null || value < 0)) return [];
            const [pa, ab, hits, bb, hbp, hr] = values;
            if (!pa || hits > ab || ab > pa || hits + bb + hbp > pa || hr > hits) return [];
            const side = team === game.team1 ? 'away' : 'home';
            const plays = rows.filter(r => r.name === name && (/말/.test(r.half || r.inningLabel) ? 'home' : 'away') === side).map(r => battingResult(r.summary, name));
            const completeBatting = plays.length === pa && plays.every(p => p.known) && plays.reduce((n, p) => n + p.hit, 0) === hits &&
                plays.reduce((n, p) => n + p.hr, 0) === hr;
            const extraBases = plays.reduce((n, p) => n + p.double + p.triple * 2, 0);
            return [{ team, name, pa, ab, reached: hits + bb + hbp, hr,
                totalBases: completeBatting ? hits + extraBases + hr * 3 : 0, powerAB: completeBatting ? ab : 0 }];
        });
        return { batters, pitching: [...pitching.values()].filter(item => item.valid && item.outs >= 1),
            usage: [...appearances.values()], split,
            states: [...new Map(states.map(state => [[state.inning, state.half, state.outs, state.bases, state.lead].join('|'), state])).values()],
            scoreboardValid: Boolean(scoreboardValid), replayedHalves: states.filter(state => state.outs || state.bases).length };
    }

    const blankTeam = () => ({ games: [], w: 0, l: 0, runs: 0, allowed: 0, batting: { pa: 0, reached: 0, hr: 0, totalBases: 0, powerAB: 0 } });
    function newState() { return { teams: new Map(), pitchers: new Map(), players: new Map(), usage: [],
        league: { games: 0, runs: 0, pa: 0, reached: 0, hr: 0, totalBases: 0, powerAB: 0, pitchOuts: 0, pitchRuns: 0, pitchBF: 0, k: 0, bb: 0, hbp: 0 },
        h2h: new Map(), pitcherWL: new Map(), live: new Map(), coverage: { games: 0, battingGames: 0, pitchingGames: 0, liveGames: 0 } }; }
    function teamStats(state, team) { if (!state.teams.has(team)) state.teams.set(team, blankTeam()); return state.teams.get(team); }
    function ingest(state, game) {
        const data = analyze(game), a = Number(game.awayScore), h = Number(game.homeScore), date = day(game.date);
        state.coverage.games++;
        if (data.batters.length) state.coverage.battingGames++;
        if (data.pitching.length) state.coverage.pitchingGames++;
        if (data.states.length) state.coverage.liveGames++;
        for (const [team, opponent, scored, conceded] of [[game.team1, game.team2, a, h], [game.team2, game.team1, h, a]]) {
            const stats = teamStats(state, team), result = scored > conceded ? 1 : scored < conceded ? 0 : .5;
            stats.games.push({ date, result, scored, conceded }); stats.runs += scored; stats.allowed += conceded;
            if (result === 1) stats.w++; if (result === 0) stats.l++;
            const pair = playerKey(team, opponent), head = state.h2h.get(pair) || { w: 0, l: 0 };
            if (result === 1) head.w++; if (result === 0) head.l++; state.h2h.set(pair, head);
            for (const [field, decision] of [['winPitcher', 'w'], ['losePitcher', 'l']]) {
                const name = nameOf(game[field]); if (!name) continue;
                const k = playerKey(team, name), wl = state.pitcherWL.get(k) || { w: 0, l: 0, vs: new Map() };
                wl[decision]++;
                const vs = wl.vs.get(opponent) || { w: 0, l: 0 }; vs[decision]++; wl.vs.set(opponent, vs);
                state.pitcherWL.set(k, wl);
            }
        }
        state.league.games += 2; state.league.runs += a + h;
        for (const item of data.batters) {
            const k = playerKey(item.team, item.name), stats = state.players.get(k) || { pa: 0, reached: 0, hr: 0, totalBases: 0, powerAB: 0, games: [], splits: {} };
            for (const field of ['pa', 'reached', 'hr', 'totalBases', 'powerAB']) { stats[field] += item[field]; state.league[field] += item[field]; teamStats(state, item.team).batting[field] += item[field]; }
            stats.games.push({ ...item, date });
            state.players.set(k, stats);
        }
        for (const item of data.split) {
            const stats = state.players.get(playerKey(item.team, item.name)); if (!stats) continue;
            const split = stats.splits[item.hand] || { pa: 0, reached: 0, hr: 0 };
            for (const field of ['pa', 'reached', 'hr']) split[field] += item[field]; stats.splits[item.hand] = split;
        }
        for (const item of data.pitching) {
            const k = playerKey(item.team, item.name), stats = state.pitchers.get(k) || { starts: [], hand: item.hand };
            if (item.start) stats.starts.push({ ...item, date }); if (item.hand) stats.hand = item.hand; state.pitchers.set(k, stats);
            state.league.pitchOuts += item.outs; state.league.pitchRuns += item.runs; state.league.pitchBF += item.bf;
            state.league.k += item.k; state.league.bb += item.bb; state.league.hbp += item.hbp;
        }
        state.usage.push(...data.usage.map(item => ({ ...item, date })));
        for (const item of data.states) {
            const k = [Math.min(12, item.inning), item.half, item.outs, item.bases, clamp(item.lead, -8, 8)].join('|');
            const stats = state.live.get(k) || { n: 0, wins: 0 }; stats.n++; stats.wins += item.outcome; state.live.set(k, stats);
        }
    }

    function winRate(stats) { return (stats.w + 10) / (stats.w + stats.l + 20); }
    function recentForm(stats) {
        const recent = stats.games.slice(-10).filter(item => item.result !== .5);
        return (recent.reduce((sum, item) => sum + item.result, 0) + 6 * winRate(stats)) / (recent.length + 6) - winRate(stats);
    }
    function pitchingStrength(state, info, team, date) {
        const stats = state.pitchers.get(playerKey(team, info.name));
        const lines = stats ? stats.starts.slice(-5) : [];
        const sum = field => lines.reduce((total, item) => total + item[field], 0);
        const leagueRA = state.league.pitchOuts ? state.league.pitchRuns * 27 / state.league.pitchOuts : state.league.runs / Math.max(1, state.league.games);
        const leagueKBB = state.league.pitchBF ? (state.league.k - state.league.bb - state.league.hbp) / state.league.pitchBF : 0;
        const outs = sum('outs'), bf = sum('bf');
        const ra = (sum('runs') * 27 + leagueRA * 45) / (outs + 45);
        const kbb = (sum('k') - sum('bb') - sum('hbp') + leagueKBB * 60) / (bf + 60);
        const observed = state.usage.filter(item => item.team === team && item.name === info.name && item.date < date);
        const latest = observed.length ? Math.max(...observed.map(item => item.date)) : null;
        const confidence = !info.name ? 0 : info.predicted ? .5 : 1;
        return { quality: ((leagueRA - ra) / 3 + (kbb - leagueKBB) * 2) * confidence,
            rest: latest === null ? 0 : clamp((date - latest - 5) / 5, -1, 1) * confidence,
            hand: info.hand || hand(info.raw) || (/^좌승현$/.test(info.name) ? 'L' : /^우승현$/.test(info.name) ? 'R' : '') || stats && stats.hand || '', observedStarts: lines.length };
    }
    function bullpenLoad(state, team, date) {
        const recent = state.usage.filter(item => item.team === team && item.relief && date - item.date >= 1 && date - item.date <= 3);
        const players = new Map(); let burden = 0;
        for (const item of recent) {
            const age = date - item.date, weight = age === 1 ? 1 : age === 2 ? .6 : .3;
            // Pitch counts are used where present; recorded batters faced are the
            // fallback workload measurement, never invented pitch counts.
            burden += weight * (item.pitches !== null && item.pitches > 0 ? item.pitches / 100 : item.bf / 25);
            const days = players.get(item.name) || new Set(); days.add(item.date); players.set(item.name, days);
        }
        for (const days of players.values()) if (days.has(date - 1) && days.has(date - 2)) burden += .25;
        return Math.min(4, burden);
    }
    function lineupStrength(state, game, side, opponentHand) {
        const team = side === 'away' ? game.team1 : game.team2, stats = teamStats(state, team);
        const league = state.league, leagueOB = league.pa ? league.reached / league.pa : .32, leagueHR = league.pa ? league.hr / league.pa : .025;
        const leagueSLG = league.powerAB ? league.totalBases / league.powerAB : .4;
        const teamOB = (stats.batting.reached + leagueOB * 100) / (stats.batting.pa + 100);
        const teamHR = (stats.batting.hr + leagueHR * 100) / (stats.batting.pa + 100);
        const teamSLG = (stats.batting.totalBases + leagueSLG * 100) / (stats.batting.powerAB + 100);
        const names = lineup(game, side); let ob = 0, hr = 0, slugging = 0, platoon = 0;
        for (const name of names) {
            const p = state.players.get(playerKey(team, name)) || { pa: 0, reached: 0, hr: 0, totalBases: 0, powerAB: 0, games: [], splits: {} };
            const seasonRate = (p.reached + teamOB * 45) / (p.pa + 45), seasonHR = (p.hr + teamHR * 75) / (p.pa + 75);
            const recent = p.games.filter(item => item.date >= day(game.date) - 30);
            const recentSum = field => recent.reduce((sum, item) => sum + item[field], 0);
            const rate = (recentSum('reached') + seasonRate * 60) / (recentSum('pa') + 60);
            ob += rate; hr += (recentSum('hr') + seasonHR * 75) / (recentSum('pa') + 75);
            slugging += (p.totalBases + teamSLG * 75) / (p.powerAB + 75);
            const split = p.splits[opponentHand];
            if (split) platoon += ((split.reached + rate * 60) / (split.pa + 60) - rate);
        }
        ob += (9 - names.length) * teamOB; hr += (9 - names.length) * teamHR; slugging += (9 - names.length) * teamSLG;
        return { ob: (ob / 9 - leagueOB) * 10, power: (slugging / 9 - leagueSLG) * 3 + (hr / 9 - leagueHR) * 10,
            platoon: platoon / 9 * 10, confirmed: names.length === 9 };
    }
    const FEATURE_NAMES = ['home', 'seasonStrength', 'runDifferential', 'recentForm', 'starterQuality', 'starterRest', 'bullpenAvailability', 'lineupOnBase', 'lineupPower', 'platoon'];
    function features(state, game, starters = {}) {
        const date = day(game.date), away = teamStats(state, game.team1), home = teamStats(state, game.team2);
        const aInfo = starters.away || starter(game, 'away'), hInfo = starters.home || starter(game, 'home');
        const aPitcher = pitchingStrength(state, aInfo, game.team1, date), hPitcher = pitchingStrength(state, hInfo, game.team2, date);
        const aLineup = lineupStrength(state, game, 'away', hPitcher.hand), hLineup = lineupStrength(state, game, 'home', aPitcher.hand);
        const rd = stats => (stats.runs - stats.allowed) / (stats.games.length + 20);
        return { values: [1, (winRate(home) - winRate(away)) * 4, (rd(home) - rd(away)) / 3,
            (recentForm(home) - recentForm(away)) * 2, hPitcher.quality - aPitcher.quality,
            hPitcher.rest - aPitcher.rest, bullpenLoad(state, game.team1, date) - bullpenLoad(state, game.team2, date),
            hLineup.ob - aLineup.ob, hLineup.power - aLineup.power,
            hLineup.platoon * (aInfo.predicted ? .5 : 1) - aLineup.platoon * (hInfo.predicted ? .5 : 1)],
            provisional: !aInfo.name || !hInfo.name || Boolean(aInfo.predicted || hInfo.predicted) || !aLineup.confirmed || !hLineup.confirmed,
            evidence: { awayStarter: aInfo.name || '', homeStarter: hInfo.name || '',
                awayPitchingGames: aPitcher.observedStarts, homePitchingGames: hPitcher.observedStarts,
                awayLineupConfirmed: aLineup.confirmed, homeLineupConfirmed: hLineup.confirmed } };
    }
    function legacyProbability(state, game, includeWeek = true) {
        const a = teamStats(state, game.team1), h = teamStats(state, game.team2);
        const wr = t => t.w + t.l ? t.w / (t.w + t.l) : .5;
        const form = t => { const rows = t.games.slice(-10).filter(r => r.result !== .5); return rows.length ? rows.reduce((s, r) => s + r.result, 0) / rows.length : .5; };
        const week = t => { const rows = t.games.filter(r => r.date >= day(game.date) - 7 && r.result !== .5); return rows.length ? rows.reduce((s, r) => s + r.result, 0) / rows.length : .5; };
        const pair = state.h2h.get(playerKey(game.team2, game.team1)) || { w: 0, l: 0 }, n = pair.w + pair.l;
        const pitcherWL = (side, team, opponent) => {
            const raw = game[side + 'StarterDetail'] || game[side + 'Starter'];
            const stats = state.pitcherWL.get(playerKey(team, nameOf(raw))) || { w: 0, l: 0, vs: new Map() };
            const vs = stats.vs.get(opponent) || { w: 0, l: 0 }, n = stats.w + stats.l, vn = vs.w + vs.l;
            return ((n ? stats.w / n : .5) - .5) * .28 + ((vn ? vs.w / vn : .5) - .5) * .12 * Math.min(1, vn / 3);
        };
        const season = includeWeek ? wr(h) - wr(a) : winRate(h) - winRate(a);
        const trend = includeWeek ? form(h) - form(a) : recentForm(h) - recentForm(a);
        return clamp(sigmoid(season * 2.4 + .16 + (n ? (pair.w / n - .5) * .7 * Math.min(1, n / 6) : 0) +
            trend * .55 + (includeWeek ? (week(h) - week(a)) * .5 + pitcherWL('home', game.team2, game.team1) - pitcherWL('away', game.team1, game.team2) : 0)), .1, .9);
    }
    function trainingRows(games) {
        const state = newState(), rows = [];
        // Process a whole date together: no game on a date can consume the result
        // of another game on that date without a trustworthy completion timestamp.
        for (let i = 0; i < games.length;) {
            let end = i + 1; while (end < games.length && games[end].date === games[i].date) end++;
            for (const game of games.slice(i, end)) {
                const y = Number(game.homeScore) === Number(game.awayScore) ? .5 : Number(game.homeScore) > Number(game.awayScore) ? 1 : 0;
                if (y !== .5) rows.push({ date: game.date, id: key(game), x: features(state, game).values, y,
                    baseline: legacyProbability(state, game), anchor: legacyProbability(state, game, false) });
            }
            for (const game of games.slice(i, end)) ingest(state, game);
            i = end;
        }
        return { rows, state };
    }
    function fit(rows) {
        const length = FEATURE_NAMES.length, weights = Array(length).fill(0);
        const scales = Array.from({ length }, (_, j) => j ? Math.max(.15, Math.sqrt(rows.reduce((sum, r) => sum + r.x[j] ** 2, 0) / Math.max(1, rows.length))) : 1);
        const rate = (rows.reduce((sum, row) => sum + row.y, 0) + 10) / (rows.length + 20);
        weights[0] = 0;
        for (let step = 0; step < 350 && rows.length; step++) {
            const gradient = Array(length).fill(0);
            for (const row of rows) {
                const score = logit(row.anchor) + row.x.reduce((sum, value, j) => sum + weights[j] * value / scales[j], 0), error = sigmoid(score) - row.y;
                for (let j = 0; j < length; j++) gradient[j] += error * row.x[j] / scales[j];
            }
            for (let j = 0; j < length; j++) {
                weights[j] -= .12 * (gradient[j] / rows.length + (j ? .035 * weights[j] : 0));
                // Every non-intercept feature is oriented in the home team's favor.
                // Weak data can suppress a feature, but cannot invert its meaning.
                if (j) weights[j] = clamp(weights[j], 0, 3);
            }
        }
        return { weights: weights.map((value, j) => value / scales[j]), base: rate, temperature: 1 };
    }
    function modelProbability(model, values, anchor) {
        const score = values.reduce((sum, value, j) => sum + value * model.weights[j], 0);
        return clamp(sigmoid(logit(anchor) + model.temperature * score), .05, .95);
    }
    function metrics(rows) {
        if (!rows.length) return { n: 0, brier: null, logLoss: null, accuracy: null, bins: [] };
        const bins = Array.from({ length: 5 }, () => ({ n: 0, forecast: 0, actual: 0 }));
        let brier = 0, loss = 0, correct = 0;
        for (const row of rows) {
            const p = clamp(row.p, .001, .999); brier += (p - row.y) ** 2;
            loss -= row.y * Math.log(p) + (1 - row.y) * Math.log(1 - p); correct += Number((p >= .5) === Boolean(row.y));
            const bin = bins[Math.min(4, Math.floor(p * 5))]; bin.n++; bin.forecast += p; bin.actual += row.y;
        }
        return { n: rows.length, brier: brier / rows.length, logLoss: loss / rows.length, accuracy: correct / rows.length,
            bins: bins.filter(bin => bin.n).map(bin => ({ n: bin.n, predicted: bin.forecast / bin.n, actual: bin.actual / bin.n })) };
    }
    function train(rows) {
        if (rows.length < 100) return { weights: [logit(.5), ...Array(FEATURE_NAMES.length - 1).fill(0)], base: .5, temperature: 0, trainingGames: rows.length, calibrated: false };
        let cut = Math.max(Math.floor(rows.length * .8), rows.length - 80);
        while (cut > 0 && rows[cut - 1].date === rows[cut].date) cut--;
        const model = fit(rows.slice(0, cut)), validation = rows.slice(cut);
        let best = Infinity, selected = model;
        for (const anchorType of ['anchor', 'baseline']) {
            const fitted = anchorType === 'anchor' ? model : fit(rows.slice(0, cut).map(row => ({ ...row, anchor: row.baseline })));
            for (const temperature of [0, .25, .5, .75, 1]) {
                const candidate = { ...fitted, temperature, anchorType };
                const error = metrics(validation.map(row => ({ p: modelProbability(candidate, row.x, row[anchorType]), y: row.y }))).brier;
                if (error < best) { best = error; selected = candidate; }
            }
        }
        const gains = validation.map(row => (row.baseline - row.y) ** 2 -
            (modelProbability(selected, row.x, row[selected.anchorType]) - row.y) ** 2);
        const gain = gains.reduce((sum, value) => sum + value, 0) / gains.length;
        const variance = gains.reduce((sum, value) => sum + (value - gain) ** 2, 0) / Math.max(1, gains.length - 1);
        const uncertainty = Math.sqrt(variance / gains.length);
        // Selection among several candidates can find noise in a short season.
        // Require a meaningful paired improvement before changing the prior formula.
        const accepted = gain > 1.96 * uncertainty && gain > .001;
        if (!accepted) selected = { ...selected, temperature: 0, anchorType: 'baseline' };
        return { ...selected, trainingGames: cut, calibrationGames: validation.length, calibrated: true,
            correctionsAccepted: accepted, validationGain: gain, validationUncertainty: uncertainty };
    }

    function pava(points) {
        const blocks = [];
        for (const point of points) {
            blocks.push({ indices: [point.index], weight: point.weight, wins: point.p * point.weight });
            while (blocks.length > 1 && blocks.at(-2).wins / blocks.at(-2).weight > blocks.at(-1).wins / blocks.at(-1).weight) {
                const b = blocks.pop(), a = blocks.pop(); blocks.push({ indices: a.indices.concat(b.indices), weight: a.weight + b.weight, wins: a.wins + b.wins });
            }
        }
        const result = []; for (const block of blocks) for (const index of block.indices) result[index] = block.wins / block.weight;
        return result;
    }
    function liveProbability(state, game, prior) {
        const match = String(game.inning || '').match(/(\d+)\s*회?\s*(초|말)/);
        if (!match || number(game.awayScore) === null || number(game.homeScore) === null) return { p: prior, source: 'pregame', samples: 0 };
        let inning = Number(match[1]), half = match[2] === '초' ? 'away' : 'home', outs = number(game.out);
        if (outs === null || !Number.isInteger(outs) || outs < 0 || outs > 3) return { p: prior, source: 'pregame', samples: 0 };
        const lead = Number(game.homeScore) - Number(game.awayScore);
        if (inning >= 9 && half === 'home' && lead > 0) return { p: 1, source: 'terminal', samples: 0 };
        if (inning >= 9 && half === 'home' && outs === 3 && lead < 0) return { p: 0, source: 'terminal', samples: 0 };
        const occupied = value => value === true || value === 1 || value === '1' || value === 'true';
        let bases = Number(occupied(game.base1)) | Number(occupied(game.base2)) << 1 | Number(occupied(game.base3)) << 2;
        if (outs === 3) { outs = 0; bases = 0; if (half === 'away') half = 'home'; else { half = 'away'; inning++; } }
        const counts = Array(17).fill(0), totals = Array(17).fill(0);
        for (const [k, item] of state.live) {
            const [historicalInning, historicalHalf, historicalOuts, historicalBases, historicalLead] = k.split('|');
            const distance = Math.abs(Number(historicalInning) - Math.min(12, inning));
            if (historicalHalf !== half || distance > 1) continue;
            const baseDifference = ((Number(historicalBases) ^ bases).toString(2).match(/1/g) || []).length;
            const stateWeight = (distance ? .2 : 1) * (Number(historicalOuts) === outs ? 1 : .08) * (baseDifference ? .1 ** baseDifference : 1);
            for (let margin = Math.max(-8, Number(historicalLead) - 1); margin <= Math.min(8, Number(historicalLead) + 1); margin++) {
                const weight = stateWeight * (Number(historicalLead) === margin ? 1 : .15);
                counts[margin + 8] += item.n * weight; totals[margin + 8] += item.wins * weight;
            }
        }
        const points = counts.map((n, index) => {
            // A small pregame prior stabilizes sparse states; the observed score
            // and inning dominate once comparable historical states are available.
            return { index, p: (totals[index] + prior * 3) / (n + 3), weight: n + 3, n };
        });
        const index = clamp(lead, -8, 8) + 8, curve = pava(points);
        return { p: clamp(curve[index], .01, .99), source: points[index].n >= 3 ? 'empirical' : 'sparse', samples: points[index].n };
    }

    function create(rawGames, options) {
        const cutoff = options && options.before;
        if (!Number.isFinite(day(cutoff))) throw new Error('A prediction date is required');
        const games = completedGames(rawGames, cutoff), { rows, state } = trainingRows(games), model = train(rows);
        function predict(rawGame, options = {}) {
            const game = normalize(rawGame);
            if (game.date !== cutoff) throw new Error('Prediction date must match the historical cutoff');
            if (canceled(game)) return { home: 50, away: 50, canceled: true, provisional: true };
            if (status(game) === '종료' && number(game.awayScore) !== null && number(game.homeScore) !== null) {
                const home = Number(game.homeScore) === Number(game.awayScore) ? 50 : Number(game.homeScore) > Number(game.awayScore) ? 100 : 0;
                return { home, away: 100 - home, decided: true };
            }
            const input = features(state, game, options.starters), prior = modelProbability(model, input.values, legacyProbability(state, game, model.anchorType === 'baseline'));
            const live = status(game) === '경기중' ? liveProbability(state, game, prior) : { p: prior, source: 'pregame', samples: 0 };
            const home = Math.round(live.p * 100);
            return { home, away: 100 - home, provisional: input.provisional || !model.calibrated,
                source: live.source, comparableStates: live.samples, evidence: input.evidence };
        }
        return { predict, before: cutoff, coverage: state.coverage, model: { ...model, features: FEATURE_NAMES.slice() },
            inspect: (rawGame, options = {}) => features(state, normalize(rawGame), options.starters) };
    }
    function evaluate(rawGames, options = {}) {
        const games = completedGames(rawGames), { rows, state } = trainingRows(games);
        if (rows.length < 150) return { games: rows.length, error: 'At least 150 decisive historical games are required' };
        let cut = options.testFrom ? rows.findIndex(row => row.date >= options.testFrom) : Math.floor(rows.length * .75);
        if (cut < 100 || cut >= rows.length) return { games: rows.length, error: 'The chronological split needs at least 100 training games and a later test period' };
        while (cut > 0 && rows[cut - 1].date === rows[cut].date) cut--;
        const model = train(rows.slice(0, cut)), test = rows.slice(cut);
        const rolling = newState(), lookup = new Map(test.map(row => [row.id, row])), liveRows = [], priorRows = [];
        for (let i = 0; i < games.length;) {
            let end = i + 1; while (end < games.length && games[end].date === games[i].date) end++;
            for (const game of games.slice(i, end)) {
                const row = lookup.get(key(game)); if (!row) continue;
                const prior = modelProbability(model, row.x, row[model.anchorType || 'anchor']);
                const observed = analyze(game).states;
                const samples = [...new Set([Math.floor(observed.length / 3), Math.floor(observed.length * 2 / 3)])]
                    .map(index => observed[index]).filter(Boolean);
                for (const sample of samples) {
                    const live = { ...game, gameStatus: '경기중', inning: sample.inning + '회' + (sample.half === 'away' ? '초' : '말'),
                        awayScore: Math.max(0, -sample.lead), homeScore: Math.max(0, sample.lead), out: sample.outs,
                        base1: Boolean(sample.bases & 1), base2: Boolean(sample.bases & 2), base3: Boolean(sample.bases & 4) };
                    liveRows.push({ p: liveProbability(rolling, live, prior).p, y: row.y });
                    priorRows.push({ p: prior, y: row.y });
                }
            }
            for (const game of games.slice(i, end)) ingest(rolling, game);
            i = end;
        }
        return { trainingThrough: rows[cut - 1].date, testFrom: test[0].date, testTo: test.at(-1).date,
            trainingGames: cut, testGames: test.length, coverage: state.coverage, model: { ...model, features: FEATURE_NAMES.slice() },
            updated: metrics(test.map(row => ({ p: modelProbability(model, row.x, row[model.anchorType || 'anchor']), y: row.y }))),
            previousFormula: metrics(test.map(row => ({ p: row.baseline, y: row.y }))),
            live: { sampling: 'Two deterministic intermediate states per held-out game; historical state counts update only after each date.',
                empirical: metrics(liveRows), pregameOnly: metrics(priorRows) } };
    }

    return { create, evaluate, analyze, completedGames, metrics };
});
