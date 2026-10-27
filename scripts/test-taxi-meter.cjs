// node scripts/test-taxi-meter.cjs — 요금 경계 및 GPS 측정 상태 회귀 검사
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const meter = require('../taxi-meter-engine.js');
const settings = { preset: 'seoul', surcharge: 'auto', outside: false, custom: { ...meter.defaults } };
const at = Date.parse('2026-10-27T12:00:00Z'); // KST 21:00
const day = meter.rates(settings, at);
function drive(meters, slowSeconds = 0, plan = settings, timestamp = at) {
    const trip = meter.createTrip(plan, timestamp);
    meter.advance(trip, plan, { meters, slowSeconds, from: timestamp, to: timestamp + 1000 });
    return trip;
}
const cost = (m, s = 0) => meter.fare(drive(m, s), day);
assert.equal(cost(1599.99), 4800);
assert.equal(cost(1600), 4900, '기본구간이 소진되면 첫 요금 증가');
assert.equal(cost(1730.99), 4900);
assert.equal(cost(1731), 5000);
assert.equal(cost(0, 366), 4800);
assert.equal(cost(0, 1600 / 131 * 30), 4900, '이동하지 않아도 기본시간 소진');
assert.equal(cost(800, 800 / 131 * 30), 4900, '기본구간도 시간과 거리 동시병산');
assert.equal(cost(1600, 30), 5000);
assert.equal(meter.rates({ ...settings, surcharge: 20 }, at).base, 5800);
assert.equal(meter.rates({ ...settings, surcharge: 40 }, at).base, 6700);
assert.equal(meter.rates({ ...settings, preset: 'custom', surcharge: 20 }, at).base, 5760);
for (const [clock, expected] of [['21:59:59', 0], ['22:00:00', 20], ['22:59:59', 20], ['23:00:00', 40], ['00:00:00', 40], ['01:59:59', 40], ['02:00:00', 20], ['03:59:59', 20], ['04:00:00', 0]]) {
    assert.equal(meter.nightSurcharge(Date.parse('2026-10-27T' + clock + '+09:00')), expected, 'KST ' + clock);
}
const peak = { ...settings, surcharge: 40 };
const peakTrip = drive(1731, 0, peak);
assert.equal(meter.fare(peakTrip, meter.rates(peak, at)), 6980);
assert.equal(meter.fare(peakTrip, meter.rates(peak, at), true), 7000, '지불 시 십원 자리 반올림');
const nightEdge = Date.parse('2026-10-27T22:59:59+09:00');
const changing = drive(1600, 0, settings, nightEdge - 1000);
assert.equal(changing.amount, 5920);
meter.advance(changing, settings, { meters: 262, from: nightEdge, to: nightEdge + 2000 });
assert.equal(changing.amount, 6180, '시간대 경계를 나눠 120원+140원을 가산, 이전 요금 유지');
const outsideTrip = drive(1600);
meter.setOutside(outsideTrip, true, at + 3000);
meter.advance(outsideTrip, { ...settings, outside: true }, { meters: 262, from: at + 2000, to: at + 4000 });
assert.equal(outsideTrip.amount, 5120, '시계외 전환 구간만 20% 적용');
assert.equal(meter.rates({ ...peak, outside: true }, at).unitFare, 160, '할증은 곱하지 않고 합산');
assert.equal(meter.rates({ ...peak, outside: true }, at).base, 6700, '시계외 할증으로 기본요금을 재계산하지 않는다');
const whole = drive(2400, 90);
const parts = meter.createTrip(settings, at);
for (let i = 0; i < 30; i++) meter.advance(parts, settings, { meters: 80, slowSeconds: 3, from: at + i * 1000, to: at + (i + 1) * 1000 });
assert.equal(whole.amount, parts.amount, 'GPS 업데이트 횟수가 달라도 누적 요금은 동일');
assert.throws(() => meter.advance(parts, settings, { meters: -1, from: at, to: at + 1000 }), RangeError);
assert.equal(meter.distance({ latitude: 37, longitude: 127 }, { latitude: 37, longitude: 127 }), 0);
assert.ok(Math.abs(meter.distance({ latitude: 0, longitude: 0 }, { latitude: .001, longitude: 0 }) - 111.195) < .01);

// 실제 위치 권한 없이 앱을 실행하고 결정적인 가상 GPS/시계를 주입한다.
function harness(saved, secure = true, skinReady = true) {
    const ids = [...fs.readFileSync(path.join(__dirname, '../taxi.html'), 'utf8').matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const elements = Object.fromEntries(ids.map(id => [id, {
        value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, complete: id === 'taxi-body-image' && skinReady, dataset: {}, listeners: {}, children: {},
        addEventListener(event, fn) { this.listeners[event] = fn; },
        querySelector(selector) { return this.children[selector] ||= { textContent: '' }; },
        checkValidity() { return this.value !== '' && Number.isFinite(Number(this.value)) && Number(this.value) >= 0; },
        reportValidity() {}
    }]));
    let now = 0, timestamp = at, stored = saved ? JSON.stringify(saved) : null;
    let success, failure, interval, cleared = 0;
    const events = {};
    const document = { hidden: false, documentElement: { dataset: { loading: 'true' } }, getElementById: id => elements[id], addEventListener: (event, fn) => { events[event] = fn; } };
    const window = { EnjoyTaxiMeter: meter, isSecureContext: secure, addEventListener: (event, fn) => { events[event] = fn; }, location: { origin: 'http://localhost', assign() {} } };
    window.parent = window;
    const context = { window, document, navigator: { geolocation: {
        watchPosition(ok, error) { success = ok; failure = error; return 1; },
        clearWatch() { cleared++; }
    } }, performance: { now: () => now }, Date: { now: () => timestamp }, localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } }, setTimeout: () => 1, clearTimeout() {}, setInterval: fn => { interval = fn; return 1; }, clearInterval: () => { interval = null; } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../taxi.js'), 'utf8'), context);
    return {
        elements, events, document,
        click(id) { elements[id].listeners.click(); },
        input(id, value) { elements[id].value = String(value); (elements[id].listeners.input || elements['taxi-rate-controls'].listeners.input)(); },
        fix(lat = 37, speed = 0, accuracy = 5) { success({ coords: { latitude: lat, longitude: 127, accuracy, speed }, timestamp }); },
        error(code) { failure({ code }); },
        advance(seconds) { for (let i = 0; i < seconds; i++) { now += 1000; timestamp += 1000; if (interval) interval(); } },
        snapshot() { return JSON.parse(stored); },
        state() { return elements['taxi-state'].dataset.state; },
        get cleared() { return cleared; }
    };
}
const app = harness();
assert.equal(app.document.documentElement.dataset.loading, 'false', '캐시된 본체 이미지는 바로 표시');
assert.equal(app.elements['taxi-loading'].hidden, true);
const loadingApp = harness(null, true, false);
assert.equal(loadingApp.document.documentElement.dataset.loading, 'true', '이미지 준비 전에는 스켈레톤 유지');
loadingApp.elements['taxi-body-image'].listeners.load();
assert.equal(loadingApp.document.documentElement.dataset.loading, 'false');
assert.equal(loadingApp.elements['taxi-app'].ariaBusy, 'false');
const failedImageApp = harness(null, true, false);
failedImageApp.elements['taxi-body-image'].listeners.error();
assert.equal(failedImageApp.elements['taxi-loading'].hidden, true, '이미지 실패로 스켈레톤이 고착되지 않는다');
app.click('taxi-start'); assert.equal(app.state(), 'locating');
app.advance(5); app.fix(); assert.equal(app.snapshot().trip.elapsed, 0, '위치 대기 중 과금하지 않는다');
app.advance(2); app.fix(37.0001, 10); assert.equal(app.state(), 'running');
assert.ok(app.snapshot().trip.distance > 10);
app.click('taxi-start'); assert.equal(app.state(), 'paused');
const paused = app.snapshot().trip;
app.advance(20); assert.deepEqual(app.snapshot().trip, paused, '일시정지 동안 과금하지 않는다');
app.click('taxi-start'); app.fix(38, 0);
assert.equal(app.snapshot().trip.distance, paused.distance, '재개 시 이동 공백을 연결하지 않는다');
app.advance(2); app.fix(38.0001, 10);
app.click('taxi-finish'); assert.equal(app.state(), 'finished');
assert.equal(app.elements['taxi-rate-controls'].disabled, true);
app.click('taxi-start'); assert.equal(app.state(), 'idle');
assert.equal(app.snapshot().trip.distance, 0);
app.input('taxi-surcharge', 40); assert.equal(app.elements['taxi-fare'].textContent, '6,700');
app.click('taxi-start'); app.error(1); assert.equal(app.state(), 'idle');
assert.match(app.elements['taxi-feedback'].textContent, /위치 권한/);
app.click('taxi-start'); app.fix(37, 0, 100); assert.equal(app.state(), 'locating', '부정확한 GPS는 시작하지 않는다');
app.click('taxi-start'); assert.equal(app.state(), 'idle');
app.click('taxi-start'); app.fix(); app.advance(31);
assert.equal(app.state(), 'paused', '오래된 GPS로 과금하지 않는다');
app.click('taxi-start'); app.fix(); app.document.hidden = true; app.events.visibilitychange();
assert.equal(app.state(), 'paused', '화면 이탈 시 측정을 멈춘다');
const restored = harness({ engineVersion: 2, settings, state: 'running', trip: { ...drive(2000, 30), elapsed: 100 } });
assert.equal(restored.state(), 'paused', '복원 시 사용자 조작 없이 위치를 수집하지 않는다');
const slow = harness({ engineVersion: 2, settings, state: 'paused', trip: { ...drive(2000), elapsed: 100 } });
slow.click('taxi-start'); slow.fix(); slow.advance(10); slow.fix(); slow.click('taxi-start');
assert.equal(slow.snapshot().trip.slowSeconds, 10, '기본거리 이후 정차 시간을 계산한다');
const slowFare = slow.elements['taxi-fare'].textContent;
slow.advance(20); assert.equal(slow.elements['taxi-fare'].textContent, slowFare);
const stale = harness(); stale.click('taxi-start'); stale.click('taxi-start'); stale.fix();
assert.equal(stale.state(), 'idle', '취소된 위치 요청의 늦은 응답을 무시한다');
const withinBase = harness(); withinBase.click('taxi-start'); withinBase.fix(); withinBase.advance(10); withinBase.fix();
assert.equal(withinBase.snapshot().trip.slowSeconds, 10, '기본거리 안에서도 정차시간을 누적한다');
const beforeOutside = withinBase.snapshot().trip.amount;
withinBase.input('taxi-outside', 'outside');
assert.equal(withinBase.snapshot().settings.outside, true);
assert.equal(withinBase.snapshot().trip.amount, beforeOutside, '할증을 켜도 과거 요금은 그대로');
const legacy = harness({ settings: { ...settings, surcharge: 0 }, state: 'running', trip: { distance: 2000, elapsed: 100, slowSeconds: 30 } });
assert.equal(legacy.state(), 'finished', '이전 계산 결과는 새 규칙으로 이어 계산하지 않는다');
const insecure = harness(null, false); insecure.click('taxi-start'); assert.equal(insecure.state(), 'idle');
const broken = harness({ settings: { preset: 'custom' } }); assert.equal(broken.state(), 'idle');
const custom = harness(); custom.input('taxi-preset', 'custom'); custom.input('taxi-base', 6000);
assert.equal(custom.elements['taxi-fare'].textContent, '6,000');
custom.input('taxi-distance-unit', 0); custom.click('taxi-start'); assert.equal(custom.state(), 'idle');
console.log('택시 미터기: 기본거리·기본시간 병산, 첫 요금 경계, KST 자동 할증, 시계외 구간 합산, 지불 반올림, GPS·일시정지·복원 검사 통과');

// 지자체별 공개 운임표의 수치와 서로 다른 중복 정책을 검증한다.
const regional = (preset, extra = {}) => ({ ...settings, preset, route: 'normal', zone: '0', ...extra });
const kst = clock => Date.parse('2026-10-27T' + clock + '+09:00');
const daytime = kst('12:00:00');
const expected = {
    daegu: [4500, 1700, 125, 31, 100], daejeon: [4300, 1800, 132, 33, 100],
    gwangju: [4800, 1700, 132, 32, 100], busan: [4800, 2000, 132, 33, 100],
    gumi: [4500, 1700, 128, 30, 100], chilgok: [4500, 1700, 128, 30, 100],
    andong: [4500, 1700, 128, 30, 100], cheonan: [4000, 1400, 110, 30, 100],
    asan: [4000, 1400, 105, 30, 100], naju: [4300, 2000, 130, 30, 140],
    yeosu: [4300, 2000, 130, 30, 100], mokpo: [4300, 2000, 130, 30, 100],
    jinju: [4600, 2000, 128, 30, 100], changwon: [4600, 2000, 128, 30, 100],
    gimhae: [4600, 2000, 128, 30, 100], yangsan: [4600, 2000, 128, 30, 100]
};
for (const [id, values] of Object.entries(expected)) {
    const plan = regional(id), r = meter.rates(plan, daytime);
    assert.deepEqual([r.base, r.baseDistance, r.distanceUnit, r.timeUnit, r.unitFare], values, id + ' 공개 운임표');
    const t = drive(r.baseDistance, 0, plan, daytime);
    assert.equal(t.amount, r.base + r.unitFare, id + ' 기본구간 종료');
    const ui = harness(); ui.input('taxi-preset', id);
    assert.equal(ui.snapshot().settings.preset, id);
    assert.match(ui.elements['taxi-source'].href, /^https:\/\//);
    ui.click('taxi-start'); assert.equal(ui.state(), 'locating');
}
for (const [id, hour, value] of [['busan', '23:00:00', 20], ['busan', '00:00:00', 30], ['busan', '02:00:00', 20], ['busan', '04:00:00', 0], ['cheonan', '22:00:00', 30], ['asan', '22:00:00', 30], ['naju', '23:59:59', 0], ['naju', '00:00:00', 20], ['gumi', '23:00:00', 20], ['yangsan', '22:00:00', 20]]) assert.equal(meter.rates(regional(id), kst(hour)).night, value, id + hour);
for (const [id, hour, percent] of [['daegu', '00:30:00', 40], ['daejeon', '00:30:00', 50], ['busan', '00:30:00', 50], ['busan', '23:30:00', 40], ['gwangju', '23:30:00', 50], ['cheonan', '23:30:00', 62], ['naju', '00:30:00', 40], ['jinju', '23:30:00', 50], ['yangsan', '23:30:00', 30]]) {
    const r = meter.rates(regional(id, { zone: 'outside' }), kst(hour));
    assert.equal(r.surcharge, percent, id + ' 중복 할증'); assert.equal(r.supported, true);
}
assert.equal(meter.rates(regional('yangsan', { zone: 'rural30' }), kst('23:00:00')).surcharge, 30);
for (const [id, route, distance, percent, timePercent] of [['gumi', 'normal', 2999, 0, 0], ['gumi', 'normal', 3000, 30, 30], ['gumi', 'normal', 8000, 50, 50], ['gumi', 'rural', 1700, 38, 38], ['gumi', 'rural', 8000, 55, 55], ['andong', 'normal', 4000, 100, 0], ['andong', 'normal', 7000, 50, 0], ['andong', 'rural', 1700, 60, 0], ['andong', 'rural', 7000, 80, 0], ['chilgok', 'normal', 2000, 50, 0], ['chilgok', 'normal', 3000, 60, 0], ['yeosu', 'normal', 9000, 40, 40]]) {
    const r = meter.rates(regional(id, { route }), daytime, distance);
    assert.equal(r.unitFare, 100 * (1 + percent / 100)); assert.equal(r.timeFare, 100 * (1 + timePercent / 100));
}
assert.equal(meter.rates(regional('andong', { route: 'rural' }), daytime).base, 5500);
assert.equal(meter.rates(regional('mokpo', { route: 'outer' }), daytime).unitFare, 160);
assert.equal(meter.rates(regional('mokpo', { route: 'namak' }), daytime).base, 5000);
const beforeNov = Date.parse('2026-10-31T23:59:59+09:00'), november = beforeNov + 1000;
assert.equal(meter.rates(regional('daejeon'), beforeNov).baseDistance, 1800);
assert.equal(meter.rates(regional('daejeon'), november).baseDistance, 1650);
assert.equal(meter.rates(regional('daejeon'), november).distanceUnit, 125);
assert.equal(meter.rates(regional('daejeon'), november).timeUnit, 29);
assert.equal(meter.rates(regional('daejeon'), november, 0, beforeNov).baseDistance, 1800, '운행 도중 시행일이 바뀌어도 출발 요금표 유지');
for (const id of ['gumi', 'chilgok', 'andong', 'yeosu']) {
    const p = regional(id), one = drive(11000, 0, p, daytime), many = meter.createTrip(p, daytime);
    for (let i = 0; i < 110; i++) meter.advance(many, p, { meters: 100, from: daytime + i * 1000, to: daytime + (i + 1) * 1000 });
    assert.ok(Math.abs(one.amount - many.amount) < 1e-6, id + ' 구간 경계 분할 불변성');
    assert.equal(!!one.adjusted, id === 'chilgok');
}
const unknown = regional('gumi'), safe = meter.createTrip(unknown, kst('23:00:00')), savedSafe = JSON.stringify(safe);
assert.throws(() => meter.advance(safe, unknown, { meters: 9000, from: safe.startedAt, to: safe.startedAt + 1000 }), /UNVERIFIED_COMBINATION/);
assert.equal(JSON.stringify(safe), savedSafe, '미확인 중복에서 일부 요금만 과금하지 않는다');
const switched = harness(); switched.input('taxi-preset', 'gumi'); switched.input('taxi-route', 'rural'); switched.input('taxi-preset', 'asan');
assert.equal(switched.snapshot().settings.route, 'normal'); assert.equal(switched.snapshot().settings.zone, '0');
console.log('추가 16개 지역: 공개 요율·지역 선택·심야 시간·중복 규칙·거리별 할증·칠곡 일회 가산·대전 시행일·미확인 조건 차단 검사 통과');
