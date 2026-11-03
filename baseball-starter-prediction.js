(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EnjoyBaseballStarterPrediction = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';

    const DAY = 86400000;
    const empty = () => ({ raw: null, name: '', predicted: false });
    const nameOf = raw => String(raw && typeof raw === 'object'
        ? raw.name || raw.playerName || raw.inName || (raw.player && raw.player.name) || '' : raw || '').trim();
    const hasName = raw => Boolean(nameOf(raw) && !/^(?:-|미정|TBD)$/i.test(nameOf(raw)));
    const dayOf = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? Date.parse(date + 'T00:00:00Z') / DAY : NaN;
    const keyOf = game => game.id != null && game.id !== '' ? String(game.id)
        : [game.date, game.team1, game.team2, game.time].join('|');
    const orderOf = game => String(game.date || '') + ' ' + String(game.time || '00:00');
    const statusOf = game => game.gameStatus || game.status || '경기전';
    const teamSide = (game, team) => game.team1 === team ? 'away' : game.team2 === team ? 'home' : '';
    function canceled(game) {
        return /취소|우취|우천|그라운드|폭염|cancel|rain|ground|heat/i.test([
            game.gameStatus, game.status, game.inning, game.cancelType, game.cancelReason,
            game.cancellationType, game.cancellationReason
        ].filter(Boolean).join(' '));
    }
    function normalize(raw) {
        return Object.assign({}, raw, {
            team1: String(raw.awayTeam || raw.team1 || '').trim(),
            team2: String(raw.homeTeam || raw.team2 || '').trim(),
            time: raw.gameTime || raw.time || '',
            gameStatus: raw.gameStatus || raw.status || '경기전'
        });
    }

    // Later sources contain live corrections. Sparse schedules must not erase a
    // completed result or a known starter from the history file.
    function mergeGames(...sources) {
        const merged = new Map();
        sources.forEach(games => (games || []).forEach(raw => {
            const game = normalize(raw);
            const key = keyOf(game), previous = merged.get(key) || {};
            const patch = Object.assign({}, game);
            for (const side of ['away', 'home']) {
                const field = side + 'Starter', detail = field + 'Detail';
                if (!hasName(patch[field])) delete patch[field];
                if (!hasName(patch[detail])) delete patch[detail];
                // A corrected starter string supersedes an old, different detail.
                const oldName = nameOf(previous[detail]);
                const newName = nameOf(patch[field]);
                const leeAlias = newName === '이승현' && /^(좌|우)승현$/.test(oldName);
                if (newName && oldName && newName !== oldName && !leeAlias && !patch[detail]) {
                    patch[detail] = null;
                }
            }
            if (statusOf(previous) === '종료' && statusOf(game) === '경기전') {
                for (const field of Object.keys(patch)) {
                    if (!['id', 'date', 'team1', 'team2', 'awayTeam', 'homeTeam', 'time', 'gameTime'].includes(field)) delete patch[field];
                }
            }
            merged.set(key, Object.assign({}, previous, patch));
        }));
        return Array.from(merged.values()).sort((a, b) => orderOf(a).localeCompare(orderOf(b)));
    }

    function throwingSide(raw) {
        if (!raw || typeof raw !== 'object') return '';
        const explicit = String(raw.throws || raw.throwingHand || raw.throwHand || '').trim();
        if (/^(L|좌|좌투|left)$/i.test(explicit)) return '좌';
        if (/^(R|우|우투|right)$/i.test(explicit)) return '우';
        const match = String(raw.batsThrows || '').match(/([좌우])(?:투|언|사)/);
        return match ? match[1] : '';
    }
    function aliasesFor(games) {
        const aliases = new Map();
        games.forEach(game => ['away', 'home'].forEach(side => {
            const team = side === 'away' ? game.team1 : game.team2;
            if (team !== '삼성') return;
            for (const raw of [game[side + 'StarterDetail'], game[side + 'PitcherDetail']]) {
                const name = nameOf(raw);
                if (raw && raw.playerCode && /^(좌|우)승현$/.test(name)) aliases.set(String(raw.playerCode), name);
            }
        }));
        return aliases;
    }
    function player(raw, team, aliases) {
        let name = nameOf(raw);
        if (team === '삼성' && name === '이승현') {
            const hand = throwingSide(raw);
            name = (hand && hand + '승현') || (raw && raw.playerCode && aliases.get(String(raw.playerCode))) || name;
        }
        return name;
    }
    function starter(game, side, aliases = new Map()) {
        const team = side === 'away' ? game.team1 || game.awayTeam : game.team2 || game.homeTeam;
        const raws = [game[side + 'StarterDetail'], game[side + 'Starter']].filter(hasName);
        if (!raws.length) return empty();
        // Preserve the explicit 좌승현/우승현 aliases, including when the other
        // field contains the shared real name. Never infer a pitcher from a batter.
        const raw = raws.find(value => /^(좌|우)승현$/.test(player(value, team, aliases))) || raws[0];
        const name = player(raw, team, aliases);
        return { raw: raw && typeof raw === 'object' ? Object.assign({}, raw, { name }) : name, name, predicted: false };
    }

    function historyMonths(today, days = 90) {
        const first = new Date((dayOf(today) - days) * DAY), last = new Date(dayOf(today) * DAY);
        if (!Number.isFinite(first.getTime())) return [];
        const months = [];
        first.setUTCDate(1);
        while (first <= last) {
            months.push(first.getUTCFullYear() + '-' + String(first.getUTCMonth() + 1).padStart(2, '0'));
            first.setUTCMonth(first.getUTCMonth() + 1);
        }
        return months;
    }

    function predict(rawGame, side, options) {
        const games = mergeGames(options.historyGames, options.scheduleGames, [rawGame]);
        const game = games.find(item => keyOf(item) === keyOf(normalize(rawGame)));
        const aliases = aliasesFor(games), official = starter(game, side, aliases);
        if (official.name) return official;
        const today = dayOf(options.today), target = dayOf(game.date);
        if (!Number.isFinite(today) || !Number.isFinite(target) || target < today || target - today > 14 ||
            statusOf(game) !== '경기전' || canceled(game)) return empty();

        const team = side === 'away' ? game.team1 : game.team2;
        const lookback = options.postseason ? 90 : 30;
        const teamGames = games.filter(item => teamSide(item, team));
        const completed = teamGames.filter(item => dayOf(item.date) >= today - lookback &&
            dayOf(item.date) <= today && orderOf(item) < orderOf(game) && statusOf(item) === '종료' && !canceled(item));
        const starts = completed.map((item, index) => {
            const info = starter(item, teamSide(item, team), aliases);
            // An unqualified 삼성 이승현 cannot be assigned to either player.
            return { name: team === '삼성' && info.name === '이승현' ? '' : info.name, game: item, index };
        });
        if (!starts.length || !starts[starts.length - 1].name) return empty();

        // Repeated starts in the latest team games establish the CURRENT rotation.
        // Two isolated starts months apart do not establish an active rotation role.
        const counts = new Map(), strength = new Map();
        starts.forEach((entry, index) => {
            if (!entry.name) return;
            if (index >= starts.length - 12) counts.set(entry.name, (counts.get(entry.name) || 0) + 1);
            strength.set(entry.name, (strength.get(entry.name) || 0) + Math.exp((index - starts.length + 1) / 6));
        });
        const rotation = Array.from(counts.keys()).filter(name => counts.get(name) >= 2)
            .sort((a, b) => strength.get(b) - strength.get(a)).slice(0, 5);
        if (rotation.length < 3) return empty();
        const active = new Set(rotation);
        const flow = starts.filter(entry => active.has(entry.name));
        const events = starts.filter(entry => entry.name).map(entry => ({ name: entry.name, date: entry.game.date }));
        const appearances = new Map();
        completed.forEach(item => {
            const itemSide = teamSide(item, team);
            const declared = starter(item, itemSide, aliases).name;
            for (const name of [declared, player(item[itemSide + 'PitcherDetail'], team, aliases), player(item[itemSide + 'Pitcher'], team, aliases)]) {
                if (name && dayOf(item.date) > (appearances.get(name) ?? -Infinity)) appearances.set(name, dayOf(item.date));
            }
        });
        const minRest = options.postseason ? 4 : 5; // Calendar days: 3/4 full days off.
        function rested(name, date) {
            return dayOf(date) - (appearances.get(name) ?? -Infinity) >= minRest;
        }
        function nextStarter(slot) {
            const eligible = rotation.filter(name => rested(name, slot.date));
            if (!eligible.length) return '';
            const context = events.filter(entry => active.has(entry.name)).map(entry => entry.name);
            return eligible.map(name => {
                let continuation = 0;
                // Match recent sequences of 1–3 starters against observed repeated
                // sequences. Newer evidence outweighs the early part of the window.
                for (let length = 1; length <= Math.min(3, context.length); length++) {
                    let total = 0, matching = 0;
                    for (let index = length; index < flow.length; index++) {
                        const preceding = flow.slice(index - length, index);
                        if (!preceding.every((entry, offset) => entry.name === context[context.length - length + offset])) continue;
                        // Do not learn a transition over a missing starter record.
                        if (starts.slice(preceding[0].index, flow[index].index + 1).some(entry => !entry.name)) continue;
                        const weight = Math.exp((flow[index].index - starts.length + 1) / 8);
                        total += weight;
                        if (flow[index].name === name) matching += weight;
                    }
                    if (total) continuation += (matching / total) * (1 + (length - 1) * 0.5);
                }
                let last = -1;
                events.forEach((entry, index) => { if (entry.name === name) last = index; });
                const due = Math.min(2, (events.length - 1 - last) / rotation.length);
                const rest = Math.min(1, (dayOf(slot.date) - (appearances.get(name) ?? dayOf(slot.date)) - minRest) / 7);
                return { name, score: continuation * 2 + due + rest * 0.25 + strength.get(name) * 0.05 };
            }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0].name;
        }

        const lastCompleted = completed[completed.length - 1];
        const upcoming = teamGames.filter(item => !canceled(item) && orderOf(item) > orderOf(lastCompleted) &&
            orderOf(item) <= orderOf(game));
        for (const slot of upcoming) {
            const isTarget = keyOf(slot) === keyOf(game);
            const known = starter(slot, teamSide(slot, team), aliases);
            let name = known.name;
            let carried = false;
            if (!name) {
                // An old, unplayed-looking schedule is missing evidence, not an
                // opportunity to invent historical starts and propagate them.
                if (dayOf(slot.date) < today) return empty();
                const previous = teamGames.filter(item => orderOf(item) < orderOf(slot)).pop();
                const canceledName = previous && canceled(previous) && starter(previous, teamSide(previous, team), aliases).name;
                if (canceledName && active.has(canceledName) && rested(canceledName, slot.date)) {
                    name = canceledName;
                    carried = true;
                } else name = nextStarter(slot);
            }
            if (!name) return empty();
            if (isTarget) return Object.assign({ raw: name, name, predicted: true }, carried ? { carriedFromCancellation: true } : {});
            events.push({ name, date: slot.date });
            appearances.set(name, dayOf(slot.date));
        }
        return empty();
    }

    return { predict, mergeGames, starter, historyMonths };
});
