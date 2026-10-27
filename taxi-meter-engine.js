(function (root) {
    'use strict';
    const defaults = Object.freeze({ base: 4800, baseDistance: 1600, distanceUnit: 131, timeUnit: 30, unitFare: 100, slowSpeed: 15.72 });
    // 서울시 중형택시 고시 요율과 시간·거리 제한적 동시병산 규칙.
    // https://news.seoul.go.kr/traffic/archives/1659
    // 전기식 택시미터 검정기준: 기본시간 및 5.7.2 시간·거리 구동시험.
    const hourMs = 3600000;
    const profiles = (typeof module !== 'undefined' && module.exports ? require('./taxi-fares.js') : root.EnjoyTaxiFares).profiles;
    function profile(settings, timestamp = Date.now()) {
        if (settings.preset === 'custom') return { ...settings.custom, id: 'custom', name: '직접 설정', night: profiles.seoul.night, outside: 20, combination: 'sum', routes: [['normal', '일반 구간']], zones: [['0', '일반 · 미적용'], ['outside', '시계외 · 20%']], note: '직접 입력한 요율이에요.' };
        const p = profiles[settings.preset] || profiles.seoul;
        return p.future && timestamp >= p.future.at ? { ...p, ...p.future } : p;
    }
    function nightSurcharge(timestamp) {
        const hour = ((Math.floor(timestamp / hourMs) + 9) % 24 + 24) % 24;
        return hour >= 23 || hour < 2 ? 40 : hour >= 22 || hour < 4 ? 20 : 0;
    }
    function rates(settings, timestamp = Date.now(), distance = 0, startedAt = timestamp) {
        const config = profile(settings, startedAt);
        const hour = ((Math.floor(timestamp / hourMs) + 9) % 24 + 24) % 24;
        const night = settings.surcharge === 'auto' ? (config.night.find(([a, b]) => hour >= a && hour < b) || [0, 0, 0])[2] : settings.surcharge;
        const zone = settings.zone || (settings.outside ? 'outside' : '0');
        const outside = zone.startsWith('outside') ? (Number(zone.slice(7)) || config.outside) : 0;
        let local = zone.startsWith('rural') ? Number(zone.slice(5)) : 0;
        const route = settings.route || 'normal';
        for (const [at, percent] of config.tiers?.[route] || []) if (distance >= at) local = percent;
        let surcharge = night + outside;
        let supported = true;
        if (night && outside) {
            if (config.combination === 'max') surcharge = Math.max(night, outside);
            else if (config.combined) surcharge = typeof config.combined === 'number' ? config.combined : config.combined[night];
            else if (config.combination !== 'sum') supported = false;
        }
        // 확인되지 않은 중복 규칙을 추정해서 요금에 넣지 않는다.
        if (local && (night || outside) && config.combination !== 'max') supported = false;
        if (route === 'rural' && config.ruralBase && (night || outside)) supported = false;
        const distanceSurcharge = config.combination === 'max' ? Math.max(surcharge, local) : surcharge + local;
        const timeSurcharge = config.distanceOnly ? surcharge : distanceSurcharge;
        const specialMokpo = config.id === 'mokpo' && route !== 'normal';
        const unitFare = specialMokpo ? 160 * (1 + night / 100) : config.unitFare * (1 + distanceSurcharge / 100);
        // 서울 심야 기본요금은 단순 백분율 계산과 달리 고시된 금액을 쓴다.
        // 시계외 할증은 해당 구간의 거리·시간 단가에만 가산한다.
        const rawBase = (specialMokpo && route === 'namak' ? 5000 : config.base) + (route === 'rural' ? config.ruralBase || 0 : 0);
        const base = settings.preset === 'seoul' ? (({ 0: 4800, 20: 5800, 40: 6700 })[night] ?? Math.round(rawBase * (1 + night / 100) / 10) * 10) : Math.round(rawBase * (1 + night / 100) / 10) * 10;
        return { ...config, base, unitFare, timeFare: specialMokpo ? unitFare : config.unitFare * (1 + timeSurcharge / 100), nightSchedule: config.night, night, surcharge: specialMokpo ? 60 + night : distanceSurcharge, supported, local };
    }
    function createTrip(settings, timestamp) {
        const rate = rates(settings, timestamp);
        return { distance: 0, elapsed: 0, slowSeconds: 0, startedAt: timestamp, lastAt: timestamp,
            base: rate.base, amount: rate.base, baseDone: rate.baseDistance === 0,
            remaining: rate.baseDistance || rate.distanceUnit,
            outsideEvents: [{ at: timestamp, outside: !!settings.outside, zone: settings.zone || (settings.outside ? 'outside' : '0') }] };
    }
    function setOutside(trip, outside, timestamp, zone) {
        if (!trip.startedAt) return;
        const events = trip.outsideEvents;
        const last = events[events.length - 1];
        const at = Math.max(last.at, timestamp);
        zone = zone || (outside ? 'outside' : '0');
        if (last.at === at) { last.outside = outside; last.zone = zone; }
        else if (last.outside !== outside || (last.zone || (last.outside ? 'outside' : '0')) !== zone) events.push({ at, outside, zone });
    }
    function fare(trip, rate, finished = false) {
        const amount = trip.startedAt ? trip.amount : rate.base;
        // 주행 표시는 10원 단위, 지불 시에는 십원 자리에서 반올림(100원 단위).
        return Math.round(amount / (finished ? 100 : 10)) * (finished ? 100 : 10);
    }
    function advance(trip, settings, segment) {
        const { meters = 0, slowSeconds = 0, from, to } = segment;
        if (![meters, slowSeconds, from, to].every(Number.isFinite) || meters < 0 || slowSeconds < 0 || to < from) throw new RangeError('Invalid taxi meter segment');
        if (!(trip.remaining > 0) || !Number.isFinite(trip.amount)) throw new RangeError('Invalid taxi meter state');
        const initialDistance = trip.distance;
        const config = profile(settings, trip.startedAt);
        const boundaries = new Set([0, 1]);
        if (to > from) {
            for (let at = (Math.floor(from / hourMs) + 1) * hourMs; at < to; at += hourMs) boundaries.add((at - from) / (to - from));
            for (const event of trip.outsideEvents || []) if (event.at > from && event.at < to) boundaries.add((event.at - from) / (to - from));
        }
        if (meters > 0) {
            const points = (config.tiers?.[settings.route || 'normal'] || []).map(x => x[0]);
            if (config.adjustment) points.push(config.adjustment.at);
            for (const at of points) if (at > initialDistance && at <= initialDistance + meters) boundaries.add((at - initialDistance) / meters);
        }
        const parts = [...boundaries].sort((a, b) => a - b);
        // 미지원 중복 구간은 상태를 변경하기 전에 검사한다.
        function segmentSettings(at) {
            let zone = settings.zone || (settings.outside ? 'outside' : '0');
            for (const event of trip.outsideEvents || []) {
                if (event.at > at) break;
                zone = event.zone || (event.outside ? 'outside' : '0');
            }
            return { ...settings, zone, outside: zone.startsWith('outside') };
        }
        for (let i = 1; i < parts.length; i++) {
            const a = parts[i - 1];
            if (!rates(segmentSettings(from + (to - from) * a), from + (to - from) * a, initialDistance + meters * a, trip.startedAt).supported) throw new RangeError('UNVERIFIED_COMBINATION');
        }
        // KST 경계 시각마다 분리한다. 이미 발생한 요금에 새 할증률을 곱하지 않는다.
        for (let i = 1; i < parts.length; i++) {
            const a = parts[i - 1], b = parts[i], fraction = b - a;
            const cursor = from + (to - from) * a;
            const rate = rates(segmentSettings(cursor), cursor, initialDistance + meters * a, trip.startedAt);
            // 처음부터 거리와 저속 시간을 같은 구동량으로 누적한다.
            // 정차 시에도 기본시간이 소진되고, 저속 시에는 시간과 거리가 함께 소진된다.
            const timeMeters = slowSeconds * rate.distanceUnit / rate.timeUnit;
            const pulseFare = meters + timeMeters > 0 ? (meters * rate.unitFare + timeMeters * rate.timeFare) / (meters + timeMeters) : rate.unitFare;
            let equivalent = (meters + timeMeters) * fraction;
            const consumed = Math.min(equivalent, trip.remaining);
            if (trip.baseDone) trip.pendingCost = (trip.pendingCost || 0) + consumed / rate.distanceUnit * pulseFare;
            if (equivalent + 1e-8 >= trip.remaining) {
                equivalent = Math.max(0, equivalent - trip.remaining);
                trip.amount += trip.baseDone ? trip.pendingCost : pulseFare;
                trip.pendingCost = 0;
                trip.baseDone = true;
                const pulses = Math.floor((equivalent + 1e-8) / rate.distanceUnit);
                trip.amount += pulses * pulseFare;
                equivalent = Math.max(0, equivalent - pulses * rate.distanceUnit);
                trip.remaining = rate.distanceUnit;
                trip.pendingCost = equivalent / rate.distanceUnit * pulseFare;
            }
            trip.remaining -= equivalent;
            if (config.adjustment && !trip.adjusted && initialDistance < config.adjustment.at && initialDistance + meters * b >= config.adjustment.at) {
                trip.amount *= 1 + config.adjustment.percent / 100;
                trip.adjusted = true;
            }
        }
        trip.distance += meters;
        trip.slowSeconds += slowSeconds;
        trip.lastAt = Math.max(trip.lastAt, to);
        return trip;
    }
    function distance(a, b) {
        const rad = Math.PI / 180;
        const dLat = (b.latitude - a.latitude) * rad;
        const dLon = (b.longitude - a.longitude) * rad;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    }
    const api = Object.freeze({ defaults, profiles, profile, rates, fare, distance, createTrip, advance, nightSurcharge, setOutside });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EnjoyTaxiMeter = api;
})(typeof window !== 'undefined' ? window : globalThis);
