const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../baseball-starter-prediction.js');
const winEngine = require('../baseball-win-prediction.js');

const dateAt = offset => new Date(Date.UTC(2026, 10, 4 + offset)).toISOString().slice(0, 10);
function fixture(offset, name, team = '삼성', extra = {}) {
    return { id: team + ':' + offset, date: dateAt(offset), time: '18:30', team1: team,
        team2: team === 'KIA' ? 'LG' : 'KIA', gameStatus: '종료', awayStarter: name, ...extra };
}
function rotation(team = '삼성', names = ['A', 'B', 'C', 'D', 'E']) {
    return Array.from({ length: 15 }, (_, i) => fixture(i - 15, names[i % names.length], team));
}
function target(offset = 0, team = '삼성', extra = {}) {
    return fixture(offset, '', team, { gameStatus: '경기전', ...extra });
}
function predict(history, game = target(), extra = {}) {
    return engine.predict(game, 'away', { today: dateAt(0), historyGames: history,
        scheduleGames: [game], postseason: false, ...extra });
}

test('follows repeated recent rotation for all ten teams and both home/away sides', () => {
    for (const team of ['삼성', 'KIA', 'LG', '두산', 'KT', 'SSG', '롯데', '한화', 'NC', '키움']) {
        const history = rotation(team), game = target(0, team);
        assert.equal(predict(history, game).name, 'A', team);
        const swap = item => ({ ...item, team1: item.team2, team2: item.team1, homeStarter: item.awayStarter, awayStarter: '' });
        assert.equal(engine.predict(swap(game), 'home', { today: dateAt(0), historyGames: history.map(swap), scheduleGames: [swap(game)] }).name, 'A');
    }
});

test('two isolated old 우승현 starts do not make him a current rotation member', () => {
    const old = [-60, -31].map(offset => fixture(offset, '이승현', '삼성', { awayStarterDetail: { name: '우승현', playerCode: 'right-lee' } }));
    const history = [...old, ...rotation('삼성', ['후라도', '최원태', '원태인', '페덱', '보스'])];
    const result = predict(history, target(), { postseason: true });
    assert.equal(result.name, '후라도');
    assert.equal(result.predicted, true);
});

test('recent repeated order takes precedence over older order in the 90-day window', () => {
    const old = Array.from({ length: 20 }, (_, i) => fixture(i - 70, ['A', 'B', 'C', 'D', 'E'][i % 5]));
    const recent = rotation('삼성', ['D', 'A', 'C', 'B', 'E']);
    assert.equal(predict([...old, ...recent], target(), { postseason: true }).name, 'D');
});

test('a one-off starter yesterday does not become the next regular starter', () => {
    const history = rotation().slice(0, -1);
    history.push(fixture(-1, '임시선발'));
    const result = predict(history);
    assert.notEqual(result.name, '임시선발');
    assert.notEqual(result.name, 'D'); // D started two days before the target.
    assert.ok(result.name);
});

test('last night and the night before are excluded; postseason still requires three full days off', () => {
    for (const postseason of [false, true]) {
        const result = predict(rotation(), target(), { postseason });
        assert.notEqual(result.name, 'E');
        assert.notEqual(result.name, 'D');
        assert.notEqual(result.name, 'C');
    }
});

test('known recent relief appearance prevents a predicted start on insufficient rest', () => {
    const history = rotation();
    history[history.length - 1].awayPitcher = 'A';
    const result = predict(history);
    assert.notEqual(result.name, 'A');
    assert.equal(result.name, ''); // Other four starters are also on short rest.
});

test('uses live completed-game corrections to yesterday’s starter', () => {
    const history = rotation(), corrected = { ...history.at(-1), awayStarter: 'A' };
    const result = predict(history, target(), { scheduleGames: [corrected, target()] });
    assert.equal(result.name, 'E'); // E's most recent actual start is now six days ago; A pitched yesterday.
});

test('merges sparse documents without erasing completed starts or duplicating string/number IDs', () => {
    const original = fixture(-1, 'A', '삼성', { id: 123, awayStarterDetail: { name: 'A' } });
    const merged = engine.mergeGames([original], [{ ...original, id: '123', gameStatus: '경기전', awayStarter: '-', awayStarterDetail: null }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].gameStatus, '종료');
    assert.equal(merged[0].awayStarterDetail.name, 'A');
    assert.equal(original.gameStatus, '종료');
});

test('a corrected starter string supersedes a stale detail for a different player', () => {
    const original = fixture(-1, 'A', '삼성', { awayStarterDetail: { name: 'A' } });
    const merged = engine.mergeGames([original], [{ ...fixture(-1, 'B') }]);
    assert.equal(engine.starter(merged[0], 'away').name, 'B');
});

test('completed status from a live status-only document supersedes the old pregame schedule', () => {
    const scheduled = fixture(-1, '', '삼성', { gameStatus: '경기전' });
    const live = fixture(-1, 'A');
    delete live.gameStatus;
    live.status = '종료';
    const merged = engine.mergeGames([scheduled], [live]);
    assert.equal(merged[0].gameStatus, '종료');
    assert.equal(merged[0].awayStarter, 'A');
});

test('preserves right/left 이승현 as distinct players rather than treating aliases as corrupt data', () => {
    assert.equal(engine.starter(fixture(-1, '이승현', '삼성', { awayStarterDetail: { name: '우승현' } }), 'away').name, '우승현');
    assert.equal(engine.starter(fixture(-1, '이승현', '삼성', { awayStarterDetail: { name: '좌승현' } }), 'away').name, '좌승현');
    assert.equal(engine.starter(fixture(-1, '이승현', '삼성', { awayStarterDetail: { name: '이승현', batsThrows: '우투좌타' } }), 'away').name, '우승현');
    assert.equal(engine.starter(fixture(-1, '이승현', '삼성', { awayStarterDetail: { name: '이승현', throws: 'L' } }), 'away').name, '좌승현');
    assert.equal(engine.starter(fixture(-1, '이승현', '삼성', { awayStarterDetail: { name: '이승현', batsThrows: '좌타' } }), 'away').name, '이승현');
    const merged = engine.mergeGames([fixture(-1, '이승현', '삼성', { awayStarterDetail: { name: '우승현' } })], [fixture(-1, '이승현')]);
    assert.equal(engine.starter(merged[0], 'away').name, '우승현');
});

test('unresolved 삼성 이승현 records cannot be combined into one established rotation role', () => {
    const history = rotation('삼성', ['A', 'B', '이승현', '이승현', '임시']);
    history.forEach((game, i) => { if (game.awayStarter === '임시') game.awayStarter = '임시' + i; });
    assert.equal(predict(history).name, ''); // Only two identifiable regular starters.
});

test('official starter wins even on short rest; detail and photo metadata survive', () => {
    const detail = { name: '우승현', playerCode: 'right-lee', batsThrows: '우투우타' };
    const game = target(0, '삼성', { awayStarter: '이승현', awayStarterDetail: detail });
    const result = predict(rotation(), game);
    assert.equal(result.name, '우승현');
    assert.equal(result.predicted, false);
    assert.deepEqual(result.raw, detail);
});

test('playerCode resolves generic 이승현 without mixing the two pitchers', () => {
    const known = fixture(-40, '이승현', '삼성', { awayStarterDetail: { name: '좌승현', playerCode: 'left-lee' } });
    const game = target(0, '삼성', { awayStarterDetail: { name: '이승현', playerCode: 'left-lee' } });
    assert.equal(predict([known, ...rotation()], game).name, '좌승현');
});

test('postseason uses 90 days, regular season uses 30 days, and older evidence expires', () => {
    const older = rotation().map(g => ({ ...g, date: dateAt((Date.parse(g.date) - Date.parse(dateAt(0))) / 86400000 - 40) }));
    assert.equal(predict(older).name, '');
    assert.equal(predict(older, target(), { postseason: true }).name, 'A');
    const expired = older.map(g => ({ ...g, date: dateAt(-91) }));
    assert.equal(predict(expired, target(), { postseason: true }).name, '');
});

test('does not count canceled games or treat current relievers as historical starters', () => {
    const history = rotation().map(g => ({ ...g, awayPitcher: g.awayStarter, awayStarter: '' }));
    assert.equal(predict(history).name, '');
    assert.equal(predict(rotation().map(g => ({ ...g, gameStatus: '취소' }))).name, '');
});

test('canceled announced starter carries over only if active and rested', () => {
    const history = rotation().map(g => ({ ...g, date: dateAt((Date.parse(g.date) - Date.parse(dateAt(0))) / 86400000 - 1) }));
    const canceled = fixture(-1, 'A', '삼성', { gameStatus: '우천취소' });
    const result = predict(history, target(), { scheduleGames: [canceled, target()] });
    assert.equal(result.name, 'A');
    assert.equal(result.carriedFromCancellation, true);
    const spot = { ...canceled, awayStarter: '임시선발' };
    assert.notEqual(predict(history, target(), { scheduleGames: [spot, target()] }).name, '임시선발');
});

test('future games advance the rotation and announced starters reset the next prediction', () => {
    const history = rotation(), tomorrow = target(1), today = target();
    assert.equal(predict(history, tomorrow, { scheduleGames: [today, tomorrow] }).name, 'B');
    const dayAfter = target(2);
    const result = predict(history, dayAfter, { scheduleGames: [target(0, '삼성', { awayStarter: 'C' }), tomorrow, dayAfter] });
    assert.equal(result.name, 'B');
});

test('missing latest starter evidence and unrecorded past games do not produce fabricated rotations', () => {
    const history = rotation();
    history[history.length - 1].awayStarter = '';
    assert.equal(predict(history).name, '');
    const older = rotation().map(g => ({ ...g, date: dateAt((Date.parse(g.date) - Date.parse(dateAt(0))) / 86400000 - 1) }));
    assert.equal(predict(older, target(), { scheduleGames: [fixture(-1, '', '삼성', { id: 'missing-game', gameStatus: '경기전' }), target()] }).name, '');
});

test('past games, distant future games, live games and canceled games are not guessed', () => {
    for (const game of [target(-1), target(15), target(0, '삼성', { gameStatus: '경기중' }), target(0, '삼성', { gameStatus: '취소' })]) {
        assert.equal(predict(rotation(), game).predicted, false);
    }
});

test('history months include the full lookback across a year boundary', () => {
    assert.deepEqual(engine.historyMonths('2026-11-04'), ['2026-08', '2026-09', '2026-10', '2026-11']);
    assert.deepEqual(engine.historyMonths('2027-01-01', 30), ['2026-12', '2027-01']);
});

function functionSource(source, name) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    const end = source.indexOf('\n        function ', start + 1);
    return source.slice(start, end < 0 ? undefined : end);
}
test('main and detail production callers return the same prediction and preserve postseason scope', () => {
    const history = rotation(), game = target();
    const context = vm.createContext({ window: { EnjoyBaseballStarterPrediction: engine },
        todayStr: dateAt(0), starterHistoryGames: history, scheduleData: [...history, game], liveDataStore: {},
        enjoyBaseballDateKey: () => dateAt(0), enjoyBaseballStarterHistoryGames: history,
        enjoyBaseballScheduleGames: [...history, game], postseasonRound: () => 'ks',
        postseasonGames: () => [], enjoyBaseballPostseasonRound: () => 'ks',
        enjoyBaseballMoreSeasonGames: () => ({ postseason: [] }) });
    const root = path.join(__dirname, '..');
    vm.runInContext(functionSource(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), 'enjoyBaseballStarterInfo'), context);
    vm.runInContext(functionSource(fs.readFileSync(path.join(root, 'baseball-game-detail.js'), 'utf8'), '_starterForLineup'), context);
    assert.deepEqual(context.enjoyBaseballStarterInfo(game, 'away'), context._starterForLineup(game, {}, 'away'));
    assert.equal(context.enjoyBaseballStarterInfo(game, 'away').name, 'A');
});

test('both real data loaders include latest completed games and historical month documents', async () => {
    const history = rotation().slice(0, -1), game = target();
    const yesterday = fixture(-1, 'A');
    const root = path.join(__dirname, '..');
    const mainSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const detailSource = fs.readFileSync(path.join(root, 'baseball-game-detail.js'), 'utf8');
    class FixedDate extends Date {
        constructor(...args) { super(...(args.length ? args : ['2026-11-04T12:00:00+09:00'])); }
    }
    for (const screen of ['main', 'detail']) {
        const calls = [], warnings = [];
        async function fetchDocument(key) {
            calls.push(key);
            if (key === 'schedule/2026-09') throw new Error('optional month unavailable');
            if (key === 'schedule/2026-11') return { games: [game] };
            if (key === 'games/2026-11-03') return { games: [yesterday] };
            return { games: [] };
        }
        const context = vm.createContext({
            window: { EnjoyBaseballStarterPrediction: engine, EnjoyBaseballWinPrediction: winEngine, parent: { postMessage() {} } },
            document: { getElementById: () => null }, console: { warn: (...args) => warnings.push(args) },
            Date: FixedDate, params: new URLSearchParams({ matchId: game.id, matchDate: game.date }),
            todayStr: dateAt(0), currentDate: new FixedDate(),
            scheduleData: history.map(g => ({ ...g })), liveDataStore: Object.fromEntries(history.map(g => [g.id, g])),
            starterHistoryGames: [], teamHex: { 삼성: '#000', KIA: '#000' },
            _fsGetDoc: fetchDocument, postseasonSeriesInfo: () => null,
            refreshRankingFromHistory() {}, renderPopupContent() {},
            enjoyBaseballGetDocument: fetchDocument,
            enjoyBaseballDateKey: () => dateAt(0),
            enjoyBaseballMonthKey: date => date.toISOString().slice(0, 7),
            enjoyBaseballEnsureFullHistory: async () => {},
            enjoyBaseballNormalizeGame: g => g,
            enjoyBaseballIsKboGame: () => true,
            enjoyBaseballMoreHistory: () => history,
            enjoyBaseballChooseRotation: () => [], enjoyBaseballSetRotation() {}
        });
        if (screen === 'main') {
            const start = mainSource.indexOf('        async function refreshEnjoyBaseballFeatured(');
            const end = mainSource.indexOf('        window.openEnjoyBaseballGame =', start);
            vm.runInContext(mainSource.slice(start, end), context);
            await context.refreshEnjoyBaseballFeatured();
        } else {
            context.window.KBO_HISTORY_2026 = { gamesByDate: { history } };
            vm.runInContext(detailSource.slice(detailSource.indexOf('    function normalizeGame('), detailSource.indexOf('    function loadHistory(')), context);
            const start = detailSource.indexOf('    async function refreshRequestedGame(');
            const end = detailSource.indexOf("    document.documentElement.classList.toggle(", start);
            vm.runInContext(detailSource.slice(start, end), context);
            await context.refreshRequestedGame(true);
        }
        assert.equal(warnings.length, 0, screen + ': optional month failure must not disable the screen');
        for (const month of ['2026-08', '2026-09', '2026-10']) assert.ok(calls.includes('schedule/' + month), screen + ': ' + month);
        const loaded = screen === 'main' ? context.enjoyBaseballStarterHistoryGames : context.starterHistoryGames;
        const result = predict(loaded, game);
        assert.equal(result.name, 'E', screen + ': yesterday’s server start must replace the stale file history');
    }
});
