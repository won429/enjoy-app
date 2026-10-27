(function (root) {
    'use strict';
    const defaults = Object.freeze({ base: 4800, baseDistance: 1600, distanceUnit: 131, timeUnit: 30, unitFare: 100, slowSpeed: 15.72 });
    // 서울시 중형택시 고시 요율과 시간·거리 제한적 동시병산 규칙.
    // https://news.seoul.go.kr/traffic/archives/1659
    // 전기식 택시미터 검정기준: 기본시간 및 5.7.2 시간·거리 구동시험.
    const hourMs = 3600000;
    function nightSurcharge(timestamp) {
        const hour = ((Math.floor(timestamp / hourMs) + 9) % 24 + 24) % 24;
        return hour >= 23 || hour < 2 ? 40 : hour >= 22 || hour < 4 ? 20 : 0;
    }
    function rates(settings, timestamp = Date.now()) {
        const config = settings.preset === 'custom' ? settings.custom : defaults;
        const night = settings.surcharge === 'auto' ? nightSurcharge(timestamp) : settings.surcharge;
        const surcharge = Math.min(60, night + (settings.outside ? 20 : 0));
        const multiplier = 1 + surcharge / 100;
        // 서울 심야 기본요금은 단순 백분율 계산과 달리 고시된 금액을 쓴다.
        // 시계외 할증은 해당 구간의 거리·시간 단가에만 가산한다.
        const base = settings.preset === 'seoul' ? ({ 0: 4800, 20: 5800, 40: 6700 })[night] : Math.round(config.base * (1 + night / 100) / 10) * 10;
        return { ...config, base, unitFare: config.unitFare * multiplier, night, surcharge };
    }
    function createTrip(settings, timestamp) {
        const rate = rates(settings, timestamp);
        return { distance: 0, elapsed: 0, slowSeconds: 0, startedAt: timestamp, lastAt: timestamp,
            base: rate.base, amount: rate.base, baseDone: rate.baseDistance === 0,
            remaining: rate.baseDistance || rate.distanceUnit,
            outsideEvents: [{ at: timestamp, outside: !!settings.outside }] };
    }
    function setOutside(trip, outside, timestamp) {
        if (!trip.startedAt) return;
        const events = trip.outsideEvents;
        const last = events[events.length - 1];
        const at = Math.max(last.at, timestamp);
        if (last.at === at) last.outside = outside;
        else if (last.outside !== outside) events.push({ at, outside });
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
        trip.distance += meters;
        trip.slowSeconds += slowSeconds;
        trip.lastAt = Math.max(trip.lastAt, to);
        // KST 경계 시각마다 분리한다. 이미 발생한 요금에 새 할증률을 곱하지 않는다.
        let cursor = from;
        do {
            let end = to === from ? to : Math.min(to, (Math.floor(cursor / hourMs) + 1) * hourMs);
            let outside = !!settings.outside;
            for (const event of trip.outsideEvents || []) {
                if (event.at <= cursor) outside = event.outside;
                else { end = Math.min(end, event.at); break; }
            }
            const fraction = to === from ? 1 : (end - cursor) / (to - from);
            const rate = rates({ ...settings, outside }, cursor);
            // 처음부터 거리와 저속 시간을 같은 구동량으로 누적한다.
            // 정차 시에도 기본시간이 소진되고, 저속 시에는 시간과 거리가 함께 소진된다.
            let equivalent = (meters + slowSeconds * rate.distanceUnit / rate.timeUnit) * fraction;
            if (equivalent + 1e-8 >= trip.remaining) {
                equivalent = Math.max(0, equivalent - trip.remaining);
                trip.amount += rate.unitFare;
                trip.baseDone = true;
                const pulses = Math.floor((equivalent + 1e-8) / rate.distanceUnit);
                trip.amount += pulses * rate.unitFare;
                equivalent = Math.max(0, equivalent - pulses * rate.distanceUnit);
                trip.remaining = rate.distanceUnit;
            }
            trip.remaining -= equivalent;
            cursor = end;
        } while (cursor < to);
        return trip;
    }
    function distance(a, b) {
        const rad = Math.PI / 180;
        const dLat = (b.latitude - a.latitude) * rad;
        const dLon = (b.longitude - a.longitude) * rad;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    }
    const api = Object.freeze({ defaults, rates, fare, distance, createTrip, advance, nightSurcharge, setOutside });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EnjoyTaxiMeter = api;
})(typeof window !== 'undefined' ? window : globalThis);
