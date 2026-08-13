/* 승강장 열차 그림 생성기 — assets/train-near.svg · train-far.svg · train-door-leaf.svg
   색, 창 개수, 문 위치를 여기서 고치고  node assets/train-svg-source.js  로 다시 뽑는다.
   문 x좌표는 jiha.html 의 스크린도어 문 위치(내 쪽 18.667%/59.333% 폭 22%,
   건너편 13%/42%/71% 폭 16%)와 맞춰 두어야 정차했을 때 문이 정확히 맞물린다. */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = __dirname;

/* ── 공통 팔레트 (참고 사진의 크림/카키 도장 + 호박색 조명) ───────── */
const P = {
  bodyTop: '#f2ecd6', bodyHi: '#e6e0c6', bodyMid: '#d8d1b4', bodyLo: '#c1ba9c', bodyEdge: '#a39c80',
  outline: '#6d6752', crease: '#b3ac90',
  winFrame: '#8a8368', glassA: '#fbe6ae', glassB: '#f5cf78', glassC: '#eeb845', glassD: '#df9f2c',
  seatGlow: '#fae4ad',
  doorFrame: '#1d2a30', doorPocket: '#26363d',
  leafA: '#4b656f', leafB: '#374c55', leafC: '#22323a',
  roofBoxTop: '#9ab4c3', roofBox: '#4d6675', roofBoxLo: '#37505e',
  skirtA: '#7d7760', skirtB: '#4a4636', skirtC: '#2b2920',
  lamp: '#fffbe4', lampRim: '#ffd45f',
  gangway: '#3a382f', gangwayRib: '#514e42',
};

const defs = (id, stops, vertical = true) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">` +
  stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
  `</linearGradient>`;

const commonDefs = () => `<defs>
${defs('body', [[0, P.bodyTop], [0.08, P.bodyHi], [0.55, P.bodyMid], [0.86, P.bodyLo], [1, P.bodyEdge]])}
${defs('glass', [[0, P.glassA], [0.24, P.glassB], [0.68, P.glassC], [1, P.glassD]])}
${defs('roofbox', [[0, P.roofBoxTop], [0.28, P.roofBox], [1, P.roofBoxLo]])}
${defs('leaf', [[0, P.leafA], [0.09, P.leafB], [0.86, P.leafB], [1, P.leafC]])}
${defs('skirt', [[0, P.skirtA], [0.28, P.skirtB], [1, P.skirtC]])}
${defs('wall', [[0, '#54626a'], [0.55, '#3a464c'], [1, '#283237']])}
${defs('shadow', [[0, 'rgba(20,14,4,.5)'], [1, 'rgba(20,14,4,0)']])}
</defs>`;

/* 창 하나 — 유리 + 안쪽 좌석 실루엣 */
const windowRect = (x, y, w, h) => {
  const r = Math.min(10, w * 0.16);
  const sx = x + 8, sw = w - 16, sy = y + h * 0.46, sh = h * 0.46;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#glass)" stroke="${P.winFrame}" stroke-width="3"/>` +
    `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="5" fill="${P.seatGlow}" opacity=".8"/>` +
    `<path d="M${x + 3} ${y + h * 0.34} L${x + w - 3} ${y + 4}" stroke="rgba(255,255,255,.42)" stroke-width="6" stroke-linecap="round" fill="none"/>`
  );
};

/* 구간(x0~x1)에 창 n개를 균등 배치 */
const windowsIn = (x0, x1, n, y, h, minGap) => {
  const span = x1 - x0;
  const gap = minGap;
  const w = (span - gap * (n + 1)) / n;
  if (w <= 6) return '';
  let out = '';
  for (let i = 0; i < n; i++) out += windowRect(x0 + gap * (i + 1) + w * i, y, w, h);
  return out;
};

/* 지붕 냉방장치 */
const roofBox = (x, w, y, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h * 0.28}" fill="url(#roofbox)"/>` +
  `<rect x="${x + w * 0.06}" y="${y + h * 0.12}" width="${w * 0.88}" height="${h * 0.26}" rx="${h * 0.13}" fill="rgba(255,255,255,.3)"/>`;

/* 차간 통로(주름막) */
const gangway = (x, w, yTop, yBot) => {
  const ribs = 5;
  let out = `<rect x="${x}" y="${yTop}" width="${w}" height="${yBot - yTop}" fill="${P.gangway}"/>`;
  for (let i = 1; i < ribs; i++) {
    const rx = x + (w / ribs) * i;
    out += `<rect x="${rx - 1.5}" y="${yTop + 4}" width="3" height="${yBot - yTop - 8}" fill="${P.gangwayRib}"/>`;
  }
  out += `<rect x="${x}" y="${yTop}" width="${w}" height="${yBot - yTop}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="3"/>`;
  return out;
};

/* 운전실 끝 — 램프 + 앞유리 + 차체 경계선 */
const cabEnd = (side, edge, inner, y0, y1, scale) => {
  const winW = 46 * scale, lampW = 34 * scale, lampH = 26 * scale;
  const wx = side === 'left' ? edge + 16 * scale : edge - 16 * scale - winW;
  const lx = side === 'left' ? edge + 14 * scale : edge - 14 * scale - lampW;
  const winY = y0 + (y1 - y0) * 0.24, winH = (y1 - y0) * 0.52;
  const lampY = y0 + (y1 - y0) * 0.05;
  return (
    `<rect x="${lx}" y="${lampY}" width="${lampW}" height="${lampH}" rx="${lampH * 0.3}" fill="${P.lamp}" stroke="${P.lampRim}" stroke-width="${3 * scale}"/>` +
    windowRect(wx, winY, winW, winH) +
    `<rect x="${inner - 2 * scale}" y="${y0}" width="${4 * scale}" height="${y1 - y0}" fill="rgba(70,62,40,.4)"/>`
  );
};

/* ── 근거리(내 쪽) 열차 : 1200 x 320, 문 2개는 DOM 오버레이가 덮는다 ── */
function buildNear() {
  const W = 1200, H = 320;
  const bodyTop = 30, bodyBot = 286;
  const winY = 74, winH = 102;
  const d1 = [224, 488], d2 = [712, 976];      // 스크린도어 문 위치와 동일
  const dy = 36, dh = 248;
  const gw = [570, 630];
  const noseL = 70, noseR = 1130;

  const bodyPath =
    `M0 ${bodyTop + 96} C0 ${bodyTop + 34} 26 ${bodyTop} ${noseL + 6} ${bodyTop} ` +
    `L${noseR - 6} ${bodyTop} C${W - 26} ${bodyTop} ${W} ${bodyTop + 34} ${W} ${bodyTop + 96} ` +
    `L${W} ${bodyBot - 12} Q${W} ${bodyBot} ${W - 14} ${bodyBot} ` +
    `L14 ${bodyBot} Q0 ${bodyBot} 0 ${bodyBot - 12} Z`;

  /* 문이 열리면 보이는 객실 — 위에서부터 조명·건너편 창·손잡이봉·좌석·바닥.
     승강장 스크린도어 위로 드러나는 건 위쪽 절반이라 볼거리를 그쪽에 몰아둔다. */
  const interior = (x0, x1) => {
    const w = x1 - x0;
    return (
      `<rect x="${x0}" y="${dy}" width="${w}" height="${dh}" fill="#1c2225"/>` +
      // 천장 조명
      `<rect x="${x0 + 8}" y="${dy + 4}" width="${w - 16}" height="18" rx="6" fill="#ffeec2" opacity=".95"/>` +
      `<rect x="${x0 + 8}" y="${dy + 22}" width="${w - 16}" height="6" fill="rgba(255,220,150,.35)"/>` +
      // 벽 + 건너편 창
      `<rect x="${x0 + 8}" y="${dy + 26}" width="${w - 16}" height="62" fill="url(#wall)"/>` +
      `<rect x="${x0 + 26}" y="${dy + 30}" width="72" height="48" rx="8" fill="url(#glass)" opacity=".72"/>` +
      `<rect x="${x0 + w - 98}" y="${dy + 30}" width="72" height="48" rx="8" fill="url(#glass)" opacity=".72"/>` +
      // 가로 손잡이 봉
      `<rect x="${x0 + 12}" y="${dy + 90}" width="${w - 24}" height="8" rx="4" fill="#c4ccce"/>` +
      // 좌석 — 등받이 + 방석
      `<rect x="${x0 + 18}" y="${dy + 98}" width="${w - 36}" height="34" rx="9" fill="#2f5fa8"/>` +
      `<rect x="${x0 + 18}" y="${dy + 98}" width="${w - 36}" height="11" rx="5" fill="#4d80c8"/>` +
      `<rect x="${x0 + 10}" y="${dy + 130}" width="${w - 20}" height="24" rx="7" fill="#24559a"/>` +
      `<rect x="${x0 + 10}" y="${dy + 150}" width="${w - 20}" height="12" fill="#141a1e"/>` +
      // 바닥
      `<rect x="${x0 + 8}" y="${dy + 160}" width="${w - 16}" height="${dh - 166}" fill="#2b3134"/>` +
      `<rect x="${x0 + 8}" y="${dy + 160}" width="${w - 16}" height="8" fill="rgba(255,232,180,.18)"/>` +
      // 세로 손잡이 봉
      `<rect x="${x0 + 62}" y="${dy + 26}" width="6" height="${dh - 32}" rx="3" fill="#b9c2c4" opacity=".92"/>` +
      `<rect x="${x0 + w - 68}" y="${dy + 26}" width="6" height="${dh - 32}" rx="3" fill="#b9c2c4" opacity=".92"/>` +
      `<rect x="${x0}" y="${dy}" width="${w}" height="${dh}" fill="none" stroke="${P.doorFrame}" stroke-width="10"/>`
    );
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
${commonDefs()}
<!-- 지붕 냉방장치 -->
${roofBox(126, 140, 4, 28)}${roofBox(320, 140, 4, 28)}${roofBox(700, 140, 4, 28)}${roofBox(900, 140, 4, 28)}
<!-- 차체 -->
<path d="${bodyPath}" fill="url(#body)" stroke="${P.outline}" stroke-width="4"/>
<path d="M6 ${bodyTop + 96} C6 ${bodyTop + 38} 30 ${bodyTop + 6} ${noseL + 8} ${bodyTop + 6} L${noseR - 8} ${bodyTop + 6} C${W - 30} ${bodyTop + 6} ${W - 6} ${bodyTop + 38} ${W - 6} ${bodyTop + 96}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="5"/>
<!-- 허리 크리스 라인 -->
<rect x="0" y="${winY + winH + 26}" width="${W}" height="4" fill="${P.crease}" opacity=".7"/>
<!-- 창문 -->
${windowsIn(noseL, d1[0], 2, winY, winH, 10)}
${windowsIn(d1[1], gw[0], 1, winY, winH, 10)}
${windowsIn(gw[1], d2[0], 1, winY, winH, 10)}
${windowsIn(d2[1], noseR, 2, winY, winH, 10)}
<!-- 차간 통로 -->
${gangway(gw[0], gw[1] - gw[0], bodyTop + 8, bodyBot - 4)}
<!-- 출입문 개구부(문짝은 DOM이 덮는다) -->
${interior(d1[0], d1[1])}
${interior(d2[0], d2[1])}
<rect x="${d1[0] - 7}" y="${bodyTop + 4}" width="7" height="${bodyBot - bodyTop - 8}" fill="rgba(60,52,32,.55)"/>
<rect x="${d1[1]}" y="${bodyTop + 4}" width="7" height="${bodyBot - bodyTop - 8}" fill="rgba(60,52,32,.55)"/>
<rect x="${d2[0] - 7}" y="${bodyTop + 4}" width="7" height="${bodyBot - bodyTop - 8}" fill="rgba(60,52,32,.55)"/>
<rect x="${d2[1]}" y="${bodyTop + 4}" width="7" height="${bodyBot - bodyTop - 8}" fill="rgba(60,52,32,.55)"/>
<!-- 운전실 앞/뒤 -->
${cabEnd('left', 0, noseL, winY - 34, winY + winH + 20, 1)}
${cabEnd('right', W, noseR, winY - 34, winY + winH + 20, 1)}
<!-- 하부 스커트 + 대차 그늘 (아래까지 불투명하게 채워 선로가 비치지 않게) -->
<rect x="0" y="${bodyBot - 2}" width="${W}" height="18" fill="url(#skirt)"/>
<rect x="0" y="${bodyBot + 16}" width="${W}" height="${H - bodyBot - 16}" fill="#1d1a12"/>
<rect x="0" y="${bodyBot + 16}" width="${W}" height="5" fill="rgba(0,0,0,.45)"/>
</svg>`;
  return svg;
}

/* ── 원거리(건너편) 열차 : 1200 x 192, 문은 열리지 않으므로 통째로 그린다 ── */
function buildFar() {
  const W = 1200, H = 192;
  const bodyTop = 18, bodyBot = 166;
  const winY = 44, winH = 60;
  const doors = [[156, 348], [504, 696], [852, 1044]];
  const gws = [[386, 414], [786, 814]];
  const noseL = 44, noseR = 1156;

  const bodyPath =
    `M0 ${bodyTop + 58} C0 ${bodyTop + 20} 16 ${bodyTop} ${noseL + 4} ${bodyTop} ` +
    `L${noseR - 4} ${bodyTop} C${W - 16} ${bodyTop} ${W} ${bodyTop + 20} ${W} ${bodyTop + 58} ` +
    `L${W} ${bodyBot - 8} Q${W} ${bodyBot} ${W - 9} ${bodyBot} ` +
    `L9 ${bodyBot} Q0 ${bodyBot} 0 ${bodyBot - 8} Z`;

  // 닫힌 출입문 — 어두운 문틀 + 문짝 2장 + 호박색 유리
  const closedDoor = (x0, x1) => {
    const w = x1 - x0, half = w / 2, dy = 24, dh = bodyBot - 30 - dy + 6;
    const leaf = (lx) =>
      `<rect x="${lx}" y="${dy}" width="${half}" height="${dh}" fill="url(#leaf)"/>` +
      `<rect x="${lx + half * 0.16}" y="${dy + dh * 0.13}" width="${half * 0.68}" height="${dh * 0.42}" rx="7" fill="url(#glass)" stroke="rgba(122,84,14,.35)" stroke-width="2"/>`;
    return (
      `<rect x="${x0}" y="${dy}" width="${w}" height="${dh}" fill="${P.doorPocket}"/>` +
      leaf(x0) + leaf(x0 + half) +
      `<rect x="${x0 + half - 2}" y="${dy}" width="4" height="${dh}" fill="rgba(0,0,0,.5)"/>` +
      `<rect x="${x0 + half - 4}" y="${dy}" width="2" height="${dh}" fill="#8b9598"/>` +
      `<rect x="${x0}" y="${dy}" width="${w}" height="${dh}" fill="none" stroke="${P.doorFrame}" stroke-width="7"/>`
    );
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
${commonDefs()}
${roofBox(90, 96, 2, 17)}${roofBox(230, 96, 2, 17)}${roofBox(470, 96, 2, 17)}${roofBox(610, 96, 2, 17)}${roofBox(860, 96, 2, 17)}${roofBox(1000, 96, 2, 17)}
<path d="${bodyPath}" fill="url(#body)" stroke="${P.outline}" stroke-width="3"/>
<path d="M4 ${bodyTop + 58} C4 ${bodyTop + 23} 18 ${bodyTop + 4} ${noseL + 5} ${bodyTop + 4} L${noseR - 5} ${bodyTop + 4} C${W - 18} ${bodyTop + 4} ${W - 4} ${bodyTop + 23} ${W - 4} ${bodyTop + 58}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3"/>
<rect x="0" y="${winY + winH + 16}" width="${W}" height="3" fill="${P.crease}" opacity=".7"/>
${windowsIn(noseL, doors[0][0], 2, winY, winH, 8)}
${windowsIn(doors[0][1], gws[0][0], 1, winY, winH, 8)}
${windowsIn(gws[0][1], doors[1][0], 1, winY, winH, 8)}
${windowsIn(doors[1][1], gws[1][0], 1, winY, winH, 8)}
${windowsIn(gws[1][1], doors[2][0], 1, winY, winH, 8)}
${windowsIn(doors[2][1], noseR, 2, winY, winH, 8)}
${gws.map(g => gangway(g[0], g[1] - g[0], bodyTop + 5, bodyBot - 3)).join('')}
${doors.map(d => closedDoor(d[0], d[1])).join('')}
${cabEnd('left', 0, noseL, winY - 20, winY + winH + 12, 0.62)}
${cabEnd('right', W, noseR, winY - 20, winY + winH + 12, 0.62)}
<rect x="0" y="${bodyBot - 2}" width="${W}" height="11" fill="url(#skirt)"/>
<rect x="0" y="${bodyBot + 9}" width="${W}" height="${H - bodyBot - 9}" fill="#1d1a12"/>
<rect x="0" y="${bodyBot + 9}" width="${W}" height="3" fill="rgba(0,0,0,.45)"/>
</svg>`;
  return svg;
}

/* ── 근거리 열차 문짝 한 장 : 132 x 248 (오른쪽 문짝은 CSS로 좌우 반전) ── */
function buildLeaf() {
  const W = 132, H = 248;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
${commonDefs()}
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#leaf)"/>
<rect x="0" y="0" width="6" height="${H}" fill="rgba(0,0,0,.42)"/>
<rect x="0" y="0" width="${W}" height="7" fill="rgba(255,255,255,.16)"/>
${windowRect(18, 30, 96, 112)}
<rect x="16" y="${H - 62}" width="100" height="10" rx="5" fill="rgba(255,255,255,.12)"/>
<rect x="${W - 7}" y="0" width="7" height="${H}" fill="#8b9598"/>
<rect x="${W - 11}" y="0" width="4" height="${H}" fill="rgba(0,0,0,.45)"/>
<rect x="0" y="${H - 6}" width="${W}" height="6" fill="rgba(0,0,0,.4)"/>
</svg>`;
}

fs.writeFileSync(path.join(OUT, 'train-near.svg'), buildNear());
fs.writeFileSync(path.join(OUT, 'train-far.svg'), buildFar());
fs.writeFileSync(path.join(OUT, 'train-door-leaf.svg'), buildLeaf());
console.log('written');
