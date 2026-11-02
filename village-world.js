(function (root) {
    'use strict';
    // Relative layout traced from the two supplied map views, not survey data.
    const buildings = [];
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
            buildings.push(Object.freeze({
                id: 101 + row * 3 + col,
                x: (col - 1) * 34, z: 39 - row * 27,
                width: 26, depth: 7.4, height: 13.5 + ((row + col) % 3) * 1.6,
                color: ['#e8d8b7', '#e7c9b9', '#cfdfcf', '#ddd4e5'][(row + col) % 4]
            }));
        }
    }
    const spawn = Object.freeze({ x: 0, z: 54 });
    const bounds = Object.freeze({ minX: -72, maxX: 72, minZ: -65, maxZ: 75 });
    const landmarks = Object.freeze([
        { x: 5, z: 54, title: '마을 입구', text: '햇살이 잘 드는 우리 동네. 길을 따라 천천히 걸어 보세요.' },
        { x: -37, z: 68, title: '유학로', text: '아파트 단지 앞을 지나는 길이에요. 길 건너 낮은 건물들도 옹기종기 모여 있어요.' },
        { x: 61, z: 26, title: '동중리1길', text: '단지의 오른쪽 가장자리를 따라 이어지는 길이에요. 북쪽으로 걸으면 초록빛 산책로를 만날 수 있어요.' },
        { x: -58, z: -32, title: '북중리3길', text: '낮은 주택과 가게가 모여 있는 골목이에요. 아직은 바깥에서 구경할 수 있어요.' },
        { x: 14, z: -57, title: '초록 산책로', text: '건물 뒤편의 녹지를 따라 바람이 불어요. 잠시 쉬어가도 좋아요.' },
        { x: -16, z: 26, title: '나무 벤치', text: '햇살이 따뜻한 자리예요. 발걸음을 잠시 멈추고 우리 동네를 둘러보세요.' }
    ]);
    function canWalk(x, z, radius = .7) {
        if (x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius) return false;
        return !buildings.some(b => Math.abs(x - b.x) < b.width / 2 + radius && Math.abs(z - b.z) < b.depth / 2 + radius);
    }
    function move(position, dx, dz) {
        // Small substeps prevent tunnelling, with sliding along building walls.
        const result = { x: position.x, z: position.z };
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .35));
        for (let i = 0; i < steps; i++) {
            if (canWalk(result.x + dx / steps, result.z)) result.x += dx / steps;
            if (canWalk(result.x, result.z + dz / steps)) result.z += dz / steps;
        }
        return result;
    }
    const world = Object.freeze({ buildings: Object.freeze(buildings), spawn, bounds, landmarks, canWalk, move });
    if (typeof module === 'object' && module.exports) module.exports = world;
    else root.VillageWorld = world;
})(typeof window === 'object' ? window : globalThis);
