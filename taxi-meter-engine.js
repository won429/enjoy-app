(function (root) {
    'use strict';
    const defaults = Object.freeze({ base: 4800, baseDistance: 1600, distanceUnit: 131, timeUnit: 30, unitFare: 100, slowSpeed: 15.72 });
    function rates(settings) {
        const config = settings.preset === 'custom' ? settings.custom : defaults;
        const multiplier = 1 + settings.surcharge / 100;
        // 서울 심야 기본요금은 단순 백분율 계산과 달리 고시된 금액을 쓴다.
        const base = settings.preset === 'seoul' ? ({ 0: 4800, 20: 5800, 40: 6700 })[settings.surcharge] : Math.round(config.base * multiplier / 10) * 10;
        return { ...config, base, unitFare: config.unitFare * multiplier };
    }
    function fare(trip, rate) {
        const units = Math.max(0, trip.distance - rate.baseDistance) / rate.distanceUnit + trip.slowSeconds / rate.timeUnit;
        return Math.round((rate.base + Math.floor(units + 1e-9) * rate.unitFare) / 10) * 10;
    }
    function distance(a, b) {
        const rad = Math.PI / 180;
        const dLat = (b.latitude - a.latitude) * rad;
        const dLon = (b.longitude - a.longitude) * rad;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    }
    const api = Object.freeze({ defaults, rates, fare, distance });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EnjoyTaxiMeter = api;
})(typeof window !== 'undefined' ? window : globalThis);
