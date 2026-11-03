const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../baseball-win-prediction.js');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const input = option('--input', ''), testFrom = option('--test-from', '2026-09-15');
let games;
if (input) games = JSON.parse(fs.readFileSync(input, 'utf8'));
else {
    const context = vm.createContext({ window: {} }), dates = {};
    for (const file of ['kbo_history_2026.js', 'kbo_history_2026_08.js', 'kbo_history_2026_09.js', 'kbo_history_2026_10.js', 'kbo_history_2026_11.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
        Object.assign(dates, context.window.KBO_HISTORY_2026.gamesByDate || {});
    }
    games = Object.values(dates).flat();
}
const report = engine.evaluate(games, { testFrom });
if (report.error) throw new Error(report.error);
const output = path.resolve(option('--output', path.join(root, 'output', 'baseball-win-validation')));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output + '.json', JSON.stringify(report, null, 2) + '\n');
const percent = n => (n * 100).toFixed(1) + '%';
const metricRow = (name, result) => `| ${name} | ${result.n} | ${result.brier.toFixed(4)} | ${result.logLoss.toFixed(4)} | ${percent(result.accuracy)} |`;
const latestDate = engine.completedGames(games).at(-1).date;
const predictionDate = new Date(Date.parse(latestDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const current = engine.create(games, { before: predictionDate });
const markdown = `# 야구 승리 예측 검증

학습·보정 기간: ${report.trainingThrough}까지 ${report.trainingGames}경기. 별도 검증 기간: ${report.testFrom}~${report.testTo}, ${report.testGames}경기.

각 경기의 특성은 그 경기 날짜보다 이전의 기록으로만 계산했습니다. 같은 날짜의 다른 경기 결과도 사용하지 않습니다. 새 가중치와 기존 공식 중 선택 및 보정은 학습 기간 안의 별도 시계열 구간에서만 수행하며, 아래 검증 결과로 다시 선택하지 않습니다. 검증 중에는 앞선 날짜의 성적을 최신 정보로 반영하되 가중치는 고정합니다.

## 경기 전 예측

| 방식 | 경기 수 | Brier ↓ | Log loss ↓ | 승리 팀 적중률 |
| --- | ---: | ---: | ---: | ---: |
${metricRow('기존 공식', report.previousFormula)}
${metricRow('개선 공식', report.updated)}

적중률 하나만으로 확률의 품질을 판단하지 않습니다. 아래 구간은 예측 확률과 실제 홈 승률을 비교한 것이며, 표본이 작은 구간은 해석을 제한해야 합니다.

| 구간 표본 수 | 평균 홈 승리 확률 | 실제 홈 승률 |
| ---: | ---: | ---: |
${report.updated.bins.map(bin => `| ${bin.n} | ${percent(bin.predicted)} | ${percent(bin.actual)} |`).join('\n')}

## 경기 중 예측

검증 경기마다 시간 순서로 정렬한 상태의 1/3, 2/3 지점을 사용했습니다. 학습된 과거 상태와 현재 이닝·점수 차·아웃·주자를 비교합니다. 경기 전 확률과의 비교이며, 기존 실시간 공식과의 직접 비교는 아닙니다.

| 방식 | 상태 수 | Brier ↓ | Log loss ↓ | 승리 팀 적중률 |
| --- | ---: | ---: | ---: | ---: |
${metricRow('경기 전 확률 유지', report.live.pregameOnly)}
${metricRow('과거 상태 기반 실시간 확률', report.live.empirical)}

## 확보된 기록과 제한

- 완료 경기 ${report.coverage.games}개 중 타자 기록을 사용할 수 있는 경기는 ${report.coverage.battingGames}개, 검증된 투구 내용을 사용할 수 있는 경기는 ${report.coverage.pitchingGames}개, 이닝 상태를 사용할 수 있는 경기는 ${report.coverage.liveGames}개입니다.
- 투구 내용은 중계와 이닝별 점수·아웃 수가 일치하는 구간에서만 재구성합니다. 자책점을 알 수 없으므로 ERA/FIP로 표시하거나 만들어 넣지 않습니다.
- 타자의 누적 경기 성적을 매 타석마다 중복 합산하지 않습니다. 장타율은 모든 타석과 안타·홈런 수를 확인할 수 있는 경기에서만 집계합니다.
- 불펜은 확인된 투구 수를 사용하고, 누락된 경우 확인된 상대 타자 수와 등판일을 사용합니다. 누락된 전체 투구 수나 부상 여부를 추정하지 않습니다.
- 예상 선발의 영향은 확정 선발보다 작게 반영합니다. 선발 또는 9명 타선이 미확정이면 화면에 ‘잠정’을 표시합니다.
- 타석별 볼카운트가 과거 자료에 없어 볼·스트라이크를 별도 학습하지 않습니다. 중계가 불완전한 주자·아웃 상태는 학습에서 제외합니다.
- 이 결과는 저장된 한 시즌과 제한된 기록에 대한 후향 검증이며, 미래의 적중률을 보장하지 않습니다.

## 현재 자료 기준 선택

- 사용 가능한 완료 기록: ${current.coverage.games}경기.
- 기준 공식: ${current.model.anchorType === 'baseline' ? '기존 팀·상대 전적 공식' : '작은 표본을 보정하고 중복 최근 흐름을 줄인 공식'}.
- 추가 특성 보정 강도: ${current.model.temperature}. 사전 검증 수용 여부: ${current.model.correctionsAccepted ? '수용' : '미수용: 기존 기준 유지'}.
- 이 선택은 독립 검증 기간을 사용하지 않으며, 내부 보정 구간에서 기존 공식 대비 Brier 개선이 표본 오차보다 충분히 크고 0.001을 초과할 때만 추가 가중치를 적용합니다. 검증 기간을 반복 조정해 적중률이 올라간 것처럼 보고하지 않습니다.
- 추가 특성은 사전 검증에서 도움이 되는 만큼만 반영되므로, 기록이 부족한 항목의 계수는 0일 수 있습니다.

## 다시 실행

\`node scripts/validate-baseball-win-prediction.cjs\`

방법 참고: [시계열 검증](https://scikit-learn.org/stable/modules/cross_validation.html#time-series-split), [확률 보정과 검증](https://scikit-learn.org/stable/modules/calibration.html).
`;
fs.writeFileSync(output + '.md', markdown);
console.log(JSON.stringify({ output, previous: report.previousFormula, updated: report.updated, live: report.live,
    current: { anchor: current.model.anchorType, correctionStrength: current.model.temperature, weights: current.model.weights } }));
