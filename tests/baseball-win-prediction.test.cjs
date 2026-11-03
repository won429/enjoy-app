const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../baseball-win-prediction.js');

const date = offset => new Date(Date.UTC(2026, 7, 1 + offset)).toISOString().slice(0, 10);
function game(offset, options = {}) {
    const g = { id: 'g' + offset, date: date(offset), time: '18:30', team1: 'KIA', team2: '삼성',
        gameStatus: '종료', awayScore: 0, homeScore: options.runs ?? 2,
        awayInning: [0, 0], homeInning: [options.runs ?? 2, 0],
        awayStarter: options.awayStarter || 'Bad', homeStarter: options.homeStarter || 'Good',
        awayStarterDetail: { name: options.awayStarter || 'Bad', batsThrows: '좌투좌타' },
        homeStarterDetail: { name: options.homeStarter || 'Good', batsThrows: '우투우타' },
        awayPitcher: options.awayStarter || 'Bad', homePitcher: options.relief ? 'Relief' : options.homeStarter || 'Good',
        awayPitcherCount: 40, homePitcherCount: options.relief ? 25 : 35,
        awayLineup: Array.from({ length: 9 }, (_, i) => 'A' + i), homeLineup: Array.from({ length: 9 }, (_, i) => 'B' + i),
        recordBatters: [] };
    const cumulative = new Map(); let seq = 0;
    for (let inning = 1; inning <= 2; inning++) for (const half of ['초', '말']) {
        const side = half === '초' ? 'away' : 'home';
        const plays = side === 'home' && inning === 1 ? [...Array(g.homeScore).fill('홈런'), ...Array(3).fill('삼진 아웃')] : Array(3).fill('삼진 아웃');
        plays.forEach((result, i) => {
            const name = (side === 'away' ? 'A' : 'B') + i;
            const totals = cumulative.get(name) || { plateAppearances: 0, atBats: 0, hits: 0, walks: 0, hbp: 0, homeRuns: 0, strikeouts: 0 };
            totals.plateAppearances++; totals.atBats++; totals.hits += Number(result === '홈런'); totals.homeRuns += Number(result === '홈런'); totals.strikeouts += Number(result.includes('삼진'));
            cumulative.set(name, totals);
            g.recordBatters.push({ inning, half, relayNo: ++seq, name, teamSide: side, ...totals,
                summary: name + ' : ' + result, events: options.relief && inning === 2 && side === 'away' && i === 0 ? ['투수 Good : 투수 Relief (으)로 교체'] : [] });
        });
    }
    return g;
}
function target(offset = 20, extra = {}) {
    return { ...game(offset), gameStatus: '경기전', ...extra };
}
function build(games = [], offset = 20) { return engine.create(games, { before: date(offset) }); }

test('requires an explicit historical cutoff and rejects mismatched target dates', () => {
    assert.throws(() => engine.create([]), /date/);
    assert.throws(() => engine.create([], { before: 'garbage' }), /date/);
    assert.throws(() => build().predict(target(21)), /date/);
});

test('postgame and future results cannot affect a prediction on an earlier date', () => {
    const past = [game(1), game(2)], future = game(30, { runs: 50 });
    const a = build(past), b = build([...past, future, { ...target(), gameStatus: '종료', homeScore: 100 }]);
    assert.deepEqual(a.predict(target()), b.predict(target()));
    assert.deepEqual(a.inspect(target()), b.inspect(target()));
});

test('same-day completed games are excluded when their availability before kickoff is not established', () => {
    assert.equal(build([game(20)]).coverage.games, 0);
});

test('final results, draws and canceled games preserve valid complementary percentages', () => {
    const model = build();
    assert.deepEqual(model.predict(target(20, { gameStatus: '종료', homeScore: 2, awayScore: 1 })), { home: 100, away: 0, decided: true });
    assert.equal(model.predict(target(20, { gameStatus: '종료', homeScore: 0, awayScore: 1 })).home, 0);
    assert.equal(model.predict(target(20, { gameStatus: '종료', homeScore: 1, awayScore: 1 })).home, 50);
    const canceled = model.predict(target(20, { gameStatus: '우천취소' }));
    assert.equal(canceled.canceled, true); assert.equal(canceled.home + canceled.away, 100);
});

test('empty and incomplete histories produce finite conservative forecasts', () => {
    for (const history of [[], [{ ...game(1), recordBatters: [], awayInning: null, homeInning: null }]]) {
        const result = build(history).predict(target(20, { awayStarter: '', awayStarterDetail: null, awayLineup: [] }));
        assert.ok(Number.isFinite(result.home)); assert.equal(result.home + result.away, 100); assert.equal(result.provisional, true);
    }
});

test('scoreboard totals must agree before live states are learned', () => {
    const valid = engine.analyze(game(1)); assert.ok(valid.states.length); assert.equal(valid.scoreboardValid, true);
    const invalid = engine.analyze({ ...game(1), homeScore: 90 });
    assert.equal(invalid.scoreboardValid, false); assert.equal(invalid.states.length, 0); assert.equal(invalid.pitching.length, 0);
});

test('reconstructs and validates pitcher outs, strikeouts, walks and runs without claiming earned runs', () => {
    const data = engine.analyze(game(1));
    const good = data.pitching.find(p => p.name === 'Good'), bad = data.pitching.find(p => p.name === 'Bad');
    assert.equal(good.outs, 6); assert.equal(good.runs, 0); assert.equal(good.k, 6);
    assert.equal(bad.outs, 6); assert.equal(bad.runs, 2); assert.equal(bad.hr, 2);
    assert.equal('earnedRuns' in good, false);
});

test('an unknown play invalidates pitcher statistics and base states rather than inventing outs', () => {
    const g = game(1); g.recordBatters[0].summary = '중계 누락';
    assert.equal(engine.analyze(g).pitching.some(p => p.name === 'Good'), false);
});

test('pitching strength reflects actual recent content instead of win-pitcher decisions', () => {
    const history = [game(1), game(5), game(10)];
    const model = build(history), input = model.inspect(target());
    assert.ok(input.values[4] > 0);
    assert.ok(input.evidence.homePitchingGames >= 3);
    const decisions = history.map(g => ({ ...g, winPitcher: 'Bad', losePitcher: 'Good' }));
    assert.equal(build(decisions).inspect(target()).values[4], input.values[4]);
});

test('predicted starters contribute less than confirmed starters and can be replaced on announcement', () => {
    const model = build([game(1), game(5), game(10)]);
    const confirmed = model.inspect(target()), predicted = model.inspect(target(), { starters: {
        away: { name: 'Bad', predicted: true }, home: { name: 'Good', predicted: true }
    } });
    assert.equal(predicted.values[4], confirmed.values[4] * .5);
    assert.equal(predicted.provisional, true);
    assert.equal(predicted.evidence.homeStarter, 'Good');
});

test('starter rest uses the latest pitching appearance, including relief work', () => {
    const history = [game(1), game(5), game(10), game(19, { relief: true })];
    const model = build(history);
    const input = model.inspect(target(), { starters: { away: { name: 'Bad' }, home: { name: 'Relief' } } });
    assert.equal(input.values[5], 0); // Both pitched yesterday; the relief pitcher cannot get an unobserved-rest bonus.
});

test('relief appearances and observed pitch counts feed the recent three-day bullpen load', () => {
    const unloaded = build([game(10)]).inspect(target());
    const loaded = build([game(10), game(19, { relief: true })]).inspect(target());
    assert.ok(loaded.values[6] < unloaded.values[6]); // Home bullpen is more used.
    const usage = engine.analyze(game(19, { relief: true })).usage.find(item => item.name === 'Relief');
    assert.equal(usage.pitches, 25); assert.equal(usage.bf, 3); assert.equal(usage.relief, true);
});

test('relief innings are not added as extra starts in the recent-five-start evaluation', () => {
    const model = build([game(1), game(5, { relief: true }), game(10, { relief: true })]);
    const input = model.inspect(target(), { starters: { away: { name: 'Bad' }, home: { name: 'Relief' } } });
    assert.equal(input.evidence.homePitchingGames, 0);
});

test('does not double-count a batter’s cumulative box-score totals on every plate appearance', () => {
    const data = engine.analyze(game(1));
    const first = data.batters.find(b => b.name === 'B0');
    assert.equal(first.pa, 2); assert.equal(first.hr, 1); assert.equal(first.reached, 1);
    assert.equal(first.totalBases, 4); assert.equal(first.powerAB, 2);
});

test('actual lineup changes alter on-base and power features using only prior batting records', () => {
    const model = build([game(1), game(5), game(10)]);
    const strong = model.inspect(target());
    const replacement = model.inspect(target(20, { homeLineup: Array.from({ length: 9 }, (_, i) => 'Unknown' + i) }));
    assert.notEqual(strong.values[7], replacement.values[7]);
    assert.notEqual(strong.values[8], replacement.values[8]);
    assert.equal(strong.evidence.homeLineupConfirmed, true);
    assert.equal(model.inspect(target(20, { homeLineup: [] })).provisional, true);
});

test('a batting-side label is not mistaken for a pitcher’s throwing hand', () => {
    const g = game(1); g.awayStarterDetail.batsThrows = '좌타'; g.homeStarterDetail.batsThrows = '우타';
    const model = build([g]);
    assert.equal(model.inspect(target()).values[9], 0);
});

test('preserves 좌승현 and 우승현 as separate pitcher identities', () => {
    const left = game(1, { homeStarter: '좌승현' }), right = game(5, { homeStarter: '우승현' });
    left.homeStarter = '이승현'; left.homeStarterDetail = { name: '이승현', playerCode: '51454', batsThrows: '좌투좌타' };
    right.homeStarter = '이승현'; right.homeStarterDetail = { name: '우승현', playerCode: '60146', batsThrows: '우투우타' };
    const model = build([left, right]);
    assert.equal(model.inspect(target(), { starters: { away: { name: 'Bad' }, home: { name: '좌승현' } } }).evidence.homePitchingGames, 1);
    assert.equal(model.inspect(target(), { starters: { away: { name: 'Bad' }, home: { name: '우승현' } } }).evidence.homePitchingGames, 1);
});

test('terminal ninth-inning states respect walkoffs and completed bottom halves', () => {
    const model = build([game(1)]);
    assert.equal(model.predict(target(20, { gameStatus: '경기중', inning: '9회말', out: 1, homeScore: 2, awayScore: 1 })).home, 100);
    assert.equal(model.predict(target(20, { gameStatus: '경기중', inning: '9회말', out: 3, homeScore: 1, awayScore: 2 })).home, 0);
});

test('empirical live estimates are monotone in the home score margin', () => {
    const model = build(Array.from({ length: 15 }, (_, i) => game(i, { runs: i % 3 })));
    let previous = -1;
    for (let lead = -5; lead <= 5; lead++) {
        const result = model.predict(target(20, { gameStatus: '경기중', inning: '2회초', out: 1,
            awayScore: Math.max(0, -lead), homeScore: Math.max(0, lead), base1: false, base2: false, base3: false }));
        assert.ok(result.home >= previous); assert.equal(result.home + result.away, 100); previous = result.home;
    }
});

test('unparseable live inning or missing outs falls back conservatively', () => {
    const model = build([game(1)]), pregame = model.predict(target());
    assert.equal(model.predict(target(20, { gameStatus: '경기중', inning: '중계 지연' })).home, pregame.home);
    assert.equal(model.predict(target(20, { gameStatus: '경기중', inning: '2회초', out: null })).source, 'pregame');
});

test('out-of-sample reports use separate chronological training/calibration/test dates and reliability bins', () => {
    const games = Array.from({ length: 180 }, (_, i) => game(i));
    const report = engine.evaluate(games);
    assert.ok(report.trainingThrough < report.testFrom);
    assert.ok(report.model.calibrationGames > 0);
    assert.ok(report.updated.n > 0); assert.ok(Number.isFinite(report.updated.brier));
    assert.equal(report.updated.bins.reduce((sum, bin) => sum + bin.n, 0), report.updated.n);
});

test('Brier score and log loss measure probabilities rather than only winning-team accuracy', () => {
    const confident = engine.metrics([{ p: .9, y: 1 }, { p: .1, y: 0 }]);
    const tentative = engine.metrics([{ p: .6, y: 1 }, { p: .4, y: 0 }]);
    assert.equal(confident.accuracy, tentative.accuracy); assert.ok(confident.brier < tentative.brier);
});

test('browser bundle exports the same engine without a CommonJS environment', () => {
    const context = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'baseball-win-prediction.js'), 'utf8'), context);
    assert.equal(typeof context.window.EnjoyBaseballWinPrediction.create, 'function');
});

test('production detail caller passes the newly predicted starters to the win engine', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'baseball-game-detail.js'), 'utf8');
    const start = source.indexOf('        function winProbability('), end = source.indexOf('        // 경기정보(스코어보드)', start);
    const seen = [];
    const context = vm.createContext({ window: { EnjoyBaseballWinPrediction: { create: () => ({ before: date(20), predict: (game, options) => { seen.push(options); return { home: 60, away: 40 }; } }) } },
        winPredictionModel: null, starterHistoryGames: [], _starterForLineup: (m, l, side) => ({ name: side === 'home' ? 'Good' : 'Bad', predicted: true }) });
    vm.runInContext(source.slice(start, end), context);
    const result = context.winProbability(target(), {});
    assert.equal(result.home, 60); assert.equal(seen[0].starters.home.name, 'Good'); assert.equal(seen[0].starters.away.predicted, true);
});
