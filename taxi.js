(function () {
    'use strict';
    const meter = window.EnjoyTaxiMeter;
    const $ = id => document.getElementById(id);
    const format = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    const storageKey = 'enjoy:taxi-meter:v1';
    const fields = { base: 'taxi-base', baseDistance: 'taxi-base-distance', distanceUnit: 'taxi-distance-unit', timeUnit: 'taxi-time-unit', unitFare: 'taxi-unit-fare', slowSpeed: 'taxi-slow-speed' };
    let settings = { preset: 'seoul', surcharge: 0, custom: { ...meter.defaults } };
    let trip = emptyTrip();
    let state = 'idle';
    let watch = null;
    let request = 0;
    let locateTimer = null;
    let clock = null;
    let lastTick = 0;
    let lastFix = 0;
    let anchor = null;
    let lastSample = null;
    let speed = null;
    let wakeLock = null;
    let lastSaved = 0;
    let locatingFrom = 'idle';

    function emptyTrip() { return { distance: 0, elapsed: 0, slowSeconds: 0 }; }
    function validSettings(value) {
        if (!value || !['seoul', 'custom'].includes(value.preset) || ![0, 20, 40].includes(value.surcharge) || !value.custom) return false;
        const limits = { base: [0, 100000], baseDistance: [0, 50000], distanceUnit: [1, 10000], timeUnit: [1, 3600], unitFare: [1, 10000], slowSpeed: [1, 100] };
        return Object.entries(limits).every(([key, [min, max]]) => Number.isFinite(value.custom[key]) && value.custom[key] >= min && value.custom[key] <= max);
    }
    function save() {
        try { localStorage.setItem(storageKey, JSON.stringify({ settings, trip, state })); } catch (_) { /* 저장 불가 환경에서도 측정은 가능하다. */ }
        lastSaved = Date.now();
    }
    function restore() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey));
            if (!saved || !validSettings(saved.settings)) return;
            settings = saved.settings;
            if (!saved.trip || !['idle', 'locating', 'running', 'paused', 'finished'].includes(saved.state)) return;
            if (!Object.keys(emptyTrip()).every(key => Number.isFinite(saved.trip[key]) && saved.trip[key] >= 0 && saved.trip[key] < 1e9)) return;
            trip = saved.trip;
            state = ['running', 'paused', 'locating'].includes(saved.state) ? (trip.elapsed > 0 ? 'paused' : 'idle') : saved.state;
            if (state === 'paused') feedback('이전 측정을 불러왔어요. 계속하려면 다시 시작해 주세요.');
        } catch (_) { /* 손상되거나 차단된 저장소는 무시한다. */ }
    }
    function feedback(message) { $('taxi-feedback').textContent = message; }
    function gps(message) { $('taxi-gps').querySelector('span').textContent = message; }
    function syncInputs() {
        $('taxi-preset').value = settings.preset;
        $('taxi-surcharge').value = String(settings.surcharge);
        Object.entries(fields).forEach(([key, id]) => { $(id).value = settings.custom[key] / (key === 'baseDistance' ? 1000 : 1); });
    }
    function readSettings(report) {
        const custom = { ...settings.custom };
        if ($('taxi-preset').value === 'custom') {
            for (const [key, id] of Object.entries(fields)) {
                if (!$(id).checkValidity()) { if (report) $(id).reportValidity(); return false; }
                custom[key] = Number($(id).value) * (key === 'baseDistance' ? 1000 : 1);
            }
        }
        const next = { preset: $('taxi-preset').value, surcharge: Number($('taxi-surcharge').value), custom };
        if (!validSettings(next)) return false;
        settings = next;
        return true;
    }
    function duration(seconds) {
        const total = Math.floor(seconds);
        const parts = [Math.floor(total / 60) % 60, total % 60];
        if (total >= 3600) parts.unshift(Math.floor(total / 3600));
        return parts.map(n => String(n).padStart(2, '0')).join(':');
    }
    function render() {
        const rate = meter.rates(settings);
        const labels = { idle: '출발 전', locating: '위치 확인 중', running: '측정 중', paused: '일시정지', finished: '측정 완료' };
        $('taxi-state').dataset.state = state;
        $('taxi-state').querySelector('b').textContent = labels[state];
        $('taxi-plan').textContent = (settings.preset === 'seoul' ? '서울 중형' : '직접 설정') + ' · ' + (settings.surcharge ? settings.surcharge + '% 할증' : '일반');
        $('taxi-fare').textContent = format(meter.fare(trip, rate));
        $('taxi-distance').innerHTML = (trip.distance / 1000).toFixed(2) + ' <small>km</small>';
        $('taxi-duration').textContent = duration(trip.elapsed);
        $('taxi-speed').innerHTML = (state === 'running' && speed !== null ? Math.round(speed) : '—') + ' <small>km/h</small>';
        $('taxi-fare-hint').textContent = state === 'finished' ? '이번 탑승의 예상 요금이에요' : state === 'paused' ? '일시정지 중에는 요금이 올라가지 않아요' : state === 'idle' ? '출발하면 기본요금부터 시작해요' : trip.distance < rate.baseDistance ? '기본거리 ' + format(rate.baseDistance / 1000) + 'km까지 기본요금 적용' : '이동 거리와 저속 시간을 반영하고 있어요';
        const action = { idle: ['play', '미터기 시작'], locating: ['xmark', '위치 확인 취소'], running: ['pause', '일시정지'], paused: ['play', '이어서 측정'], finished: ['rotate-right', '새로 측정'] }[state];
        $('taxi-start').innerHTML = '<i class="fa-solid fa-' + action[0] + '" aria-hidden="true"></i><span>' + action[1] + '</span>';
        $('taxi-finish').hidden = !['running', 'paused'].includes(state);
        $('taxi-rate-controls').disabled = state !== 'idle';
        $('taxi-settings-hint').textContent = state === 'idle' ? '출발 전에 선택해 주세요' : '이번 탑승에 적용한 기준이에요';
        $('taxi-custom').hidden = settings.preset !== 'custom';
        $('taxi-night-hint').textContent = settings.preset === 'seoul' ? '심야 20% 22~23시·02~04시 / 40% 23~02시\n선택한 할증은 이번 탑승 내내 적용돼요.' : '선택한 할증은 기본요금과 단위당 요금에 적용돼요.\n이번 탑승 중에는 바뀌지 않아요.';
        $('taxi-rate-base').textContent = format(rate.baseDistance / 1000) + 'km · ' + format(rate.base) + '원';
        $('taxi-rate-distance').textContent = format(rate.distanceUnit) + 'm마다 ' + format(rate.unitFare) + '원';
        $('taxi-rate-time').textContent = format(rate.timeUnit) + '초마다 ' + format(rate.unitFare) + '원';
    }
    async function keepAwake() {
        try {
            if (!navigator.wakeLock || document.hidden) return;
            const lock = await navigator.wakeLock.request('screen');
            if (state !== 'running') { await lock.release(); return; }
            wakeLock = lock;
        } catch (_) { /* 화면 잠금 방지 미지원 시 일반 측정한다. */ }
    }
    function stopSensors() {
        ++request;
        if (watch !== null) navigator.geolocation.clearWatch(watch);
        watch = null;
        clearTimeout(locateTimer);
        clearInterval(clock);
        locateTimer = clock = null;
        anchor = lastSample = null;
        speed = null;
        if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    }
    function tick() {
        if (state !== 'running') return;
        const now = performance.now();
        const dt = (now - lastTick) / 1000;
        if (dt > 10 || now - lastFix > 30000) {
            pause('GPS 신호가 끊겨 일시정지했어요. 위치가 잘 잡히는 곳에서 다시 시작해 주세요.', false);
            return;
        }
        lastTick = now;
        trip.elapsed += Math.max(0, dt);
        const rate = meter.rates(settings);
        if (trip.distance >= rate.baseDistance && speed !== null && speed < rate.slowSpeed) trip.slowSeconds += Math.max(0, dt);
        render();
        if (Date.now() - lastSaved > 5000) save();
    }
    function pause(message, accountTime = true) {
        if (accountTime && state === 'running') tick();
        state = 'paused';
        stopSensors();
        gps('위치 측정을 멈췄어요');
        if (message) feedback(message);
        save(); render();
    }
    function fail(message) {
        const previous = state === 'locating' ? locatingFrom : 'paused';
        stopSensors();
        state = previous;
        gps('위치 권한과 GPS 상태를 확인해 주세요');
        feedback(message); save(); render();
    }
    function positionReceived(position, token) {
        if (token !== request || !['locating', 'running'].includes(state)) return;
        const c = position.coords;
        const now = performance.now();
        if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || !Number.isFinite(c.accuracy) || c.accuracy > 60 || Math.abs(Date.now() - position.timestamp) > 30000) {
            gps('GPS 오차가 커요. 더 정확한 위치를 기다리고 있어요');
            return;
        }
        if (state === 'running') {
            tick();
            if (state !== 'running') return;
        }
        if (state === 'locating') {
            state = 'running';
            clearTimeout(locateTimer);
            lastTick = now;
            clock = setInterval(tick, 1000);
            keepAwake();
            feedback('화면을 켜 두면 계속 측정해요. 화면을 나가면 일시정지해요.');
        }
        const point = { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, time: now };
        const suppliedSpeed = Number.isFinite(c.speed) && c.speed >= 0 ? c.speed * 3.6 : null;
        if (lastSample) {
            const gap = (now - lastSample.time) / 1000;
            if (gap <= 0 || meter.distance(lastSample, point) / gap * 3.6 > 220) {
                gps('GPS 위치가 튀어 해당 구간은 제외했어요');
                return;
            }
        }
        if (anchor) {
            const meters = meter.distance(anchor, point);
            const seconds = (now - anchor.time) / 1000;
            const threshold = Math.max(5, Math.min(25, (anchor.accuracy + point.accuracy) * .35));
            const stationary = suppliedSpeed !== null && suppliedSpeed < 1.5;
            if (!stationary && meters >= threshold && seconds > 0) {
                trip.distance += meters;
                speed = suppliedSpeed === null ? Math.min(220, meters / seconds * 3.6) : suppliedSpeed;
                anchor = point;
            } else {
                if (suppliedSpeed !== null) speed = suppliedSpeed;
                else if (now - anchor.time > 5000) speed = 0;
                if (stationary) anchor = point;
            }
        } else {
            anchor = point;
            speed = suppliedSpeed;
        }
        lastSample = point;
        lastFix = now;
        gps('GPS 연결됨 · 위치 오차 약 ' + Math.round(c.accuracy) + 'm');
        save(); render();
    }
    function start() {
        if (!readSettings(true)) return;
        if (!window.isSecureContext || !navigator.geolocation) {
            feedback('위치 측정을 지원하는 브라우저에서 HTTPS 주소로 접속해 주세요.');
            return;
        }
        locatingFrom = state;
        state = 'locating';
        const token = ++request;
        gps('GPS 위치를 확인하고 있어요');
        feedback('브라우저가 위치 사용을 물으면 허용해 주세요. 위치가 확인되면 측정을 시작해요.');
        render(); save();
        locateTimer = setTimeout(() => { if (token === request) fail('위치를 확인하지 못했어요. 위치 권한을 켜고 다시 시도해 주세요.'); }, 25000);
        try {
            watch = navigator.geolocation.watchPosition(position => positionReceived(position, token), error => {
                if (token !== request) return;
                fail(error.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저의 사이트 설정에서 위치를 허용한 뒤 다시 시작해 주세요.' : 'GPS 신호를 받지 못했어요. 위치가 잘 잡히는 곳에서 다시 시도해 주세요.');
            }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        } catch (_) { fail('위치 측정을 시작하지 못했어요. 브라우저의 위치 권한을 확인해 주세요.'); }
    }
    $('taxi-start').addEventListener('click', () => {
        if (state === 'running') { pause('다시 시작하면 멈춘 시점부터 이어서 계산해요.'); return; }
        if (state === 'locating') { stopSensors(); state = locatingFrom; gps('위치 확인을 취소했어요'); feedback(''); save(); render(); return; }
        if (state === 'finished') { state = 'idle'; trip = emptyTrip(); feedback('요금 설정을 확인한 뒤 새로 시작해 주세요.'); gps('시작을 누르면 현재 위치를 확인해요'); save(); render(); return; }
        start();
    });
    $('taxi-finish').addEventListener('click', () => {
        if (state === 'running') tick();
        stopSensors(); state = 'finished';
        gps('측정을 마쳤어요'); feedback('마지막 측정 결과는 이 기기에 저장돼요.'); save(); render();
    });
    $('taxi-rate-controls').addEventListener('input', () => {
        if (state !== 'idle') return;
        $('taxi-custom').hidden = $('taxi-preset').value !== 'custom';
        if (readSettings(false)) { feedback(''); save(); render(); }
    });
    function suspend() {
        if (state === 'running') pause('화면을 나가 일시정지했어요. 계속하려면 이어서 측정을 눌러 주세요.');
        else if (state === 'locating') { stopSensors(); state = locatingFrom; feedback('위치 확인을 멈췄어요. 다시 시작해 주세요.'); save(); render(); }
    }
    $('taxi-back').addEventListener('click', () => {
        suspend();
        if (window.parent !== window) window.parent.postMessage({ type: 'enjoy:navigate-home' }, window.location.origin);
        else window.location.assign('index.html');
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
    window.addEventListener('pagehide', suspend);
    restore(); syncInputs(); render();
    if (state === 'paused') gps('이전 측정이 일시정지되어 있어요');
    if (state === 'finished') gps('마지막 측정 결과예요');
})();
