(function () {
    'use strict';
    const meter = window.EnjoyTaxiMeter;
    const $ = id => document.getElementById(id);
    const format = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    const storageKey = 'enjoy:taxi-meter:v1';
    const fields = { base: 'taxi-base', baseDistance: 'taxi-base-distance', distanceUnit: 'taxi-distance-unit', timeUnit: 'taxi-time-unit', unitFare: 'taxi-unit-fare', slowSpeed: 'taxi-slow-speed' };
    let settings = { preset: 'seoul', route: 'normal', zone: '0', surcharge: 'auto', outside: false, custom: { ...meter.defaults } };
    let trip = emptyTrip();
    let state = 'idle';
    let watch = null;
    let request = 0;
    let locateTimer = null;
    let clock = null;
    let lastTick = 0;
    let lastTickAt = 0;
    let lastFix = 0;
    let anchor = null;
    let lastSample = null;
    let speed = null;
    let wakeLock = null;
    let lastSaved = 0;
    let locatingFrom = 'idle';
    let pendingSlow = 0;
    let billedAt = 0;

    function emptyTrip() { return { distance: 0, elapsed: 0, slowSeconds: 0, startedAt: 0, lastAt: 0, base: 0, amount: 0, baseDone: false, remaining: 0 }; }
    function validSettings(value) {
        if (!value || !(value.preset === 'custom' || meter.profiles[value.preset]) || !['auto', 0, 20, 30, 40].includes(value.surcharge) || !value.custom || (value.outside !== undefined && typeof value.outside !== 'boolean')) return false;
        const p = meter.profile(value);
        if (!p.routes.some(([id]) => id === (value.route || 'normal')) || !p.zones.some(([id]) => id === (value.zone || (value.outside ? 'outside' : '0')))) return false;
        const limits = { base: [0, 100000], baseDistance: [0, 50000], distanceUnit: [1, 10000], timeUnit: [1, 3600], unitFare: [1, 10000], slowSpeed: [1, 100] };
        return Object.entries(limits).every(([key, [min, max]]) => Number.isFinite(value.custom[key]) && value.custom[key] >= min && value.custom[key] <= max);
    }
    function save() {
        try { localStorage.setItem(storageKey, JSON.stringify({ engineVersion: 3, settings, trip, state })); } catch (_) { /* 저장 불가 환경에서도 측정은 가능하다. */ }
        lastSaved = Date.now();
    }
    function restore() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey));
            if (!saved || !validSettings(saved.settings)) return;
            if (!saved.trip || !['idle', 'locating', 'running', 'paused', 'finished'].includes(saved.state)) return;
            if (!['distance', 'elapsed', 'slowSeconds'].every(key => Number.isFinite(saved.trip[key]) && saved.trip[key] >= 0 && saved.trip[key] < 1e9)) return;
            settings = { ...saved.settings, outside: !!saved.settings.outside, route: saved.settings.route || 'normal', zone: saved.settings.zone || (saved.settings.outside ? 'outside' : '0') };
            if (![2, 3].includes(saved.engineVersion)) {
                // 이전 결과를 새 병산 규칙으로 소급 재계산하거나 이어 측정하지 않는다.
                if (saved.state !== 'idle' && saved.trip.elapsed > 0) {
                    const rate = meter.rates(settings, Date.now());
                    const units = Math.max(0, saved.trip.distance - rate.baseDistance) / rate.distanceUnit + saved.trip.slowSeconds / rate.timeUnit;
                    const amount = Math.round((rate.base + Math.floor(units + 1e-9) * rate.unitFare) / 10) * 10;
                    trip = { ...meter.createTrip(settings, Date.now()), ...saved.trip, base: rate.base, amount, remaining: rate.distanceUnit, baseDone: true };
                    state = 'finished';
                    feedback('이전 계산 방식의 결과예요. 새 규칙을 적용하려면 새로 측정해 주세요.');
                }
                settings.surcharge = 'auto';
                return;
            }
            if (!['startedAt', 'lastAt', 'base', 'amount', 'remaining'].every(key => Number.isFinite(saved.trip[key]) && saved.trip[key] >= 0 && saved.trip[key] < 1e15) || typeof saved.trip.baseDone !== 'boolean') return;
            if (saved.trip.startedAt && !(saved.trip.remaining > 0)) return;
            if (saved.trip.startedAt && (!Array.isArray(saved.trip.outsideEvents) || !saved.trip.outsideEvents.length || saved.trip.outsideEvents.length > 10000 || !saved.trip.outsideEvents.every((event, i, events) => Number.isFinite(event.at) && typeof event.outside === 'boolean' && event.at >= saved.trip.startedAt && (i === 0 || event.at >= events[i - 1].at)))) return;
            if (saved.trip.startedAt && !saved.trip.outsideEvents.every(event => meter.profile(settings, saved.trip.startedAt).zones.some(([id]) => id === (event.zone || (event.outside ? 'outside' : '0'))))) return;
            if (saved.trip.pendingCost !== undefined && (!Number.isFinite(saved.trip.pendingCost) || saved.trip.pendingCost < 0 || saved.trip.pendingCost > 100000)) return;
            trip = saved.trip;
            state = ['running', 'paused', 'locating'].includes(saved.state) ? (trip.startedAt ? 'paused' : 'idle') : saved.state;
            if (state === 'paused') feedback('이전 측정을 불러왔어요. 계속하려면 다시 시작해 주세요.');
        } catch (_) { /* 손상되거나 차단된 저장소는 무시한다. */ }
    }
    function feedback(message) { $('taxi-feedback').textContent = message; }
    function gps(message) { $('taxi-gps').querySelector('span').textContent = message; }
    function syncInputs() {
        $('taxi-preset').value = settings.preset;
        $('taxi-surcharge').value = String(settings.surcharge);
        syncRegion();
        Object.entries(fields).forEach(([key, id]) => { $(id).value = settings.custom[key] / (key === 'baseDistance' ? 1000 : 1); });
    }
    function syncRegion() {
        const p = meter.profile(settings, trip.startedAt || Date.now());
        $('taxi-route').innerHTML = p.routes.map(([id, name]) => '<option value="' + id + '">' + name + '</option>').join('');
        $('taxi-route').value = settings.route || 'normal';
        $('taxi-route-row').hidden = p.routes.length === 1;
        $('taxi-outside').innerHTML = p.zones.map(([id, name]) => '<option value="' + id + '">' + (id === 'outside' && name === '시계외' ? '시계외 · ' + p.outside + '%' : name) + '</option>').join('');
        $('taxi-outside').value = settings.zone || '0';
    }
    function readSettings(report) {
        const custom = { ...settings.custom };
        if ($('taxi-preset').value === 'custom') {
            for (const [key, id] of Object.entries(fields)) {
                if (!$(id).checkValidity()) { if (report) $(id).reportValidity(); return false; }
                custom[key] = Number($(id).value) * (key === 'baseDistance' ? 1000 : 1);
            }
        }
        const next = { preset: $('taxi-preset').value, route: $('taxi-route').value || 'normal', zone: settings.zone, surcharge: $('taxi-surcharge').value === 'auto' ? 'auto' : Number($('taxi-surcharge').value), outside: settings.outside, custom };
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
        const rate = meter.rates(settings, state === 'finished' ? trip.lastAt : Date.now(), trip.distance, trip.startedAt || Date.now());
        const labels = { idle: '출발 전', locating: '위치 확인 중', running: '측정 중', paused: '일시정지', finished: '측정 완료' };
        $('taxi-state').dataset.state = state;
        $('taxi-state').querySelector('b').textContent = labels[state];
        $('taxi-plan').textContent = rate.name + (settings.preset === 'custom' ? '' : ' 중형') + ' · ' + (rate.surcharge ? format(rate.surcharge) + '% 할증' : '일반');
        let shownTrip = trip;
        if (state === 'running' && pendingSlow > 0) {
            shownTrip = { ...trip };
            try { meter.advance(shownTrip, settings, { slowSeconds: pendingSlow, from: billedAt, to: Math.max(billedAt, Date.now()) }); }
            catch (_) { shownTrip = trip; }
        }
        $('taxi-fare').textContent = format(meter.fare(shownTrip, rate, state === 'finished'));
        $('taxi-distance').innerHTML = (trip.distance / 1000).toFixed(2) + ' <small>km</small>';
        $('taxi-duration').textContent = duration(trip.elapsed);
        $('taxi-speed').innerHTML = (state === 'running' && speed !== null ? Math.round(speed) : '—') + ' <small>km/h</small>';
        $('taxi-fare-hint').textContent = state === 'finished' ? '십원 자리에서 반올림한 예상 지불요금이에요' : state === 'paused' ? '일시정지 중에는 요금이 올라가지 않아요' : state === 'idle' ? '출발하면 기본요금부터 시작해요' : !trip.baseDone ? '기본구간도 거리와 저속 시간이 함께 소진돼요' : '이동 거리와 저속 시간을 함께 반영하고 있어요';
        const action = { idle: ['play', '미터기 시작'], locating: ['xmark', '위치 확인 취소'], running: ['pause', '일시정지'], paused: ['play', '이어서 측정'], finished: ['rotate-right', '새로 측정'] }[state];
        $('taxi-start').innerHTML = '<i class="fa-solid fa-' + action[0] + '" aria-hidden="true"></i><span>' + action[1] + '</span>';
        $('taxi-finish').hidden = !['running', 'paused'].includes(state);
        $('taxi-rate-controls').disabled = state !== 'idle';
        $('taxi-settings-hint').textContent = state === 'idle' ? '출발 전에 선택해 주세요' : '이번 탑승에 적용한 기준이에요';
        $('taxi-custom').hidden = settings.preset !== 'custom';
        $('taxi-outside').disabled = state === 'finished' || rate.zones.length === 1;
        $('taxi-night-hint').textContent = settings.surcharge === 'auto' ? '한국 시간 기준 ' + rate.nightSchedule.map(([a, b, n]) => String(a).padStart(2, '0') + '~' + String(b).padStart(2, '0') + '시 ' + n + '%').join(', ') + '를 자동 적용해요.' : '수동 할증으로 측정해요. 실제 시간대에 따라 바꾸려면 출발 전에 자동을 선택해 주세요.';
        $('taxi-region-note').textContent = rate.note;
        $('taxi-outside-hint').textContent = '구간 경계·할증 표지판에서 직접 바꿔 주세요. 면제 구역은 일반으로 두세요. ' + (!rate.supported ? '이 중복 조건은 공식 계산 방식이 확인되지 않아 측정을 시작할 수 없어요.' : '변경 시점 이후 구간에 적용해요.');
        $('taxi-source').href = rate.source || 'https://news.seoul.go.kr/traffic/archives/1659';
        $('taxi-source').textContent = rate.name + ' 요금 기준 보기 ↗';
        $('taxi-future-source').hidden = !rate.futureSource;
        if (rate.futureSource) $('taxi-future-source').href = rate.futureSource;
        $('taxi-rate-base').textContent = format(rate.baseDistance / 1000) + 'km · ' + format(trip.startedAt ? trip.base : rate.base) + '원';
        $('taxi-rate-distance').textContent = format(rate.distanceUnit) + 'm마다 ' + format(rate.unitFare) + '원';
        $('taxi-rate-time').textContent = format(rate.timeUnit) + '초마다 ' + format(rate.timeFare) + '원';
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
        const rate = meter.rates(settings, lastTickAt, trip.distance, trip.startedAt);
        const endAt = Math.max(lastTickAt, Date.now());
        const slowSeconds = speed !== null && speed < rate.slowSpeed ? Math.max(0, dt) : 0;
        pendingSlow += slowSeconds;
        lastTickAt = endAt;
        render();
        if (Date.now() - lastSaved > 5000) save();
    }
    function bill(meters = 0) {
        const to = Math.max(billedAt, Date.now());
        try {
            meter.advance(trip, settings, { meters, slowSeconds: pendingSlow, from: billedAt, to });
            billedAt = to;
            pendingSlow = 0;
            return true;
        } catch (error) {
            if (error.message !== 'UNVERIFIED_COMBINATION') throw error;
            pendingSlow = 0;
            pause('이 구간의 중복 할증 계산 방식은 공식 원문에서 확인되지 않아 측정을 멈췄어요. 확인된 조건으로 새로 측정해 주세요.', false);
            return false;
        }
    }
    function pause(message, accountTime = true) {
        if (accountTime && state === 'running') { tick(); if (state !== 'running' || !bill()) return; }
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
            if (!trip.startedAt) trip = meter.createTrip(settings, Date.now());
            state = 'running';
            clearTimeout(locateTimer);
            lastTick = now;
            lastTickAt = Date.now();
            billedAt = Date.now();
            pendingSlow = 0;
            clock = setInterval(tick, 1000);
            keepAwake();
            feedback('화면을 켜 두면 계속 측정해요. 화면을 나가면 일시정지해요.');
        }
        const point = { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, time: now, at: Date.now() };
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
                if (!bill(meters)) return;
                speed = suppliedSpeed === null ? Math.min(220, meters / seconds * 3.6) : suppliedSpeed;
                anchor = point;
            } else {
                if (suppliedSpeed !== null) speed = suppliedSpeed;
                else if (now - anchor.time > 5000) speed = 0;
                if (stationary) anchor = point;
                if (!bill()) return;
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
        if (!meter.rates(settings, Date.now(), trip.distance, trip.startedAt || Date.now()).supported) { feedback('선택한 중복 할증의 공식 계산 방식이 확인되지 않았어요. 일반 구간을 선택하거나 직접 설정을 이용해 주세요.'); return; }
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
        if (state === 'running') { tick(); if (state === 'running' && !bill()) return; }
        stopSensors(); state = 'finished';
        gps('측정을 마쳤어요'); feedback('마지막 측정 결과는 이 기기에 저장돼요.'); save(); render();
    });
    $('taxi-rate-controls').addEventListener('input', () => {
        if (state !== 'idle') return;
        if ($('taxi-preset').value !== settings.preset) {
            settings.preset = $('taxi-preset').value;
            settings.route = 'normal'; settings.zone = '0'; settings.outside = false;
            syncRegion();
        }
        $('taxi-custom').hidden = $('taxi-preset').value !== 'custom';
        if (readSettings(false)) { feedback(''); save(); render(); }
    });
    $('taxi-outside').addEventListener('input', () => {
        if (state === 'finished') return;
        // 전환 직전까지는 종전 요율로 계산한 뒤, 이후 구간에만 시계외 할증을 더한다.
        if (state === 'running') { tick(); if (state !== 'running' || !bill()) return; }
        settings.zone = $('taxi-outside').value;
        settings.outside = settings.zone.startsWith('outside');
        // GPS 갱신 사이에 바뀐 할증도 해당 시각에서 구간을 나눠 적용한다.
        meter.setOutside(trip, settings.outside, Date.now(), settings.zone);
        if (state === 'running' && !meter.rates(settings, Date.now(), trip.distance, trip.startedAt).supported) { pause('선택한 중복 할증은 공식 계산 방식이 확인되지 않아 일시정지했어요.', false); return; }
        feedback('운행 구간을 변경했어요. 이미 발생한 요금은 유지돼요.');
        save(); render();
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
