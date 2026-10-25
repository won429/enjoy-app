export const ADMIN_UID = 'tdC9Bzxz7JRjpEceOLzpDCMKeBE2';
export const MEMBERS = ['전시기', '성원제', '오스틴', '이진누', '류짱', '홍박사'];
export const TEAMS = ['LG', '두산', 'KIA', '삼성', 'SSG', '롯데', '한화', 'KT', 'NC', '키움'];
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function normalizeGame(raw) {
  return { ...raw, id: String(raw.id ?? ''), date: String(raw.date || ''),
    team1: String(raw.awayTeam || raw.team1 || '').trim(), team2: String(raw.homeTeam || raw.team2 || '').trim(),
    time: String(raw.gameTime || raw.time || '') };
}
export function gameKey(raw) {
  const g = normalizeGame(raw);
  return g.id || [g.date, g.team1, g.team2, g.time].join('_');
}
export function sameGame(raw, saved) {
  const a = normalizeGame(raw), b = normalizeGame(saved);
  // Always compare the date and teams too: an ID must never match another fixture.
  return a.date === b.date && a.team1 === b.team1 && a.team2 === b.team2 &&
    (a.id && b.id ? a.id === b.id : !!a.time && a.time === b.time);
}
export function startMillis(raw) {
  const g = normalizeGame(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date) || !/^\d{1,2}:\d{2}$/.test(g.time)) return NaN;
  return Date.parse(g.date + 'T' + g.time.padStart(5, '0') + ':00+09:00');
}
export function outcome(raw) {
  if (!raw) return null;
  const g = normalizeGame(raw), status = [g.gameStatus, g.status, g.inning, g.cancelReason].filter(Boolean).join(' ');
  if (/취소|우취|cancel/i.test(status)) return { kind: 'void', reason: '경기 취소', winner: null };
  if (!/종료|^final$|^finished$/i.test(String(g.gameStatus || g.status || g.inning || '').trim())) return null;
  const score = value => value !== null && value !== undefined && String(value).trim() !== '' && /^\d+$/.test(String(value)) ? Number(value) : NaN;
  const away = score(g.awayScore ?? g.score1), home = score(g.homeScore ?? g.score2);
  if (!Number.isSafeInteger(away) || !Number.isSafeInteger(home)) return null;
  if (away === home) return { kind: 'void', reason: '무승부', winner: null, away, home };
  return { kind: 'final', winner: away > home ? g.team1 : g.team2, away, home };
}
export function validatePrediction(input, game, now) {
  const p = {};
  for (const key of ['publishStart', 'publishEnd', 'startsAt', 'closesAt', 'revealAt']) {
    if (!Number.isSafeInteger(input[key]) || input[key] <= 0) fail('기간을 올바르게 설정해 주세요.');
    p[key] = input[key];
  }
  if (!(p.publishStart <= p.startsAt && p.startsAt < p.closesAt && p.closesAt <= p.revealAt && p.revealAt < p.publishEnd)) {
    fail('게시 시작 ≤ 참여 시작 < 참여 마감 ≤ 결과 공개 < 게시 종료 순서로 설정해 주세요.');
  }
  if (p.closesAt <= now || !Number.isFinite(startMillis(game)) || p.closesAt > startMillis(game) || outcome(game) ||
      /경기중|진행|live|playing/i.test(String(game.gameStatus || game.status || ''))) fail('경기 시작 전까지만 예측을 받을 수 있어요.');
  for (const key of ['reward', 'penalty']) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 1000000) fail('포인트는 0~1,000,000 사이의 정수로 설정해 주세요.');
    p[key] = input[key];
  }
  p.title = String(input.title || '').trim().slice(0, 80) || `${game.team1} vs ${game.team2} 승리 예측`;
  // Persist fixture identity independently of the short-lived baseball database.
  p.game = Object.fromEntries(['id', 'date', 'team1', 'team2', 'time'].map(key => [key, normalizeGame(game)[key]]));
  return p;
}
export function pointDelta(prediction, answer) {
  if (prediction.result?.kind === 'void') return 0;
  if (prediction.result?.kind !== 'final') fail('경기 결과가 아직 확정되지 않았어요.');
  return answer.choice === prediction.result.winner ? prediction.reward : -prediction.penalty;
}
export function publicPrediction(p, answer, now) {
  const { result, ...visible } = p;
  return { ...visible, ...(now >= p.revealAt && result ? { result } : {}),
    answer: answer ? { choice: answer.choice, submittedAt: answer.submittedAt,
      ...(now >= p.revealAt && answer.settledAt ? { delta: answer.delta, settledAt: answer.settledAt } : {}) } : null };
}
// The history files contain one JSON literal. Parse that literal; never execute remote JS.
export function parseHistory(source) {
  const match = /const\s+KBO_HISTORY_\d+(?:_\d+)?\s*=\s*/.exec(source);
  if (!match) throw new Error('야구 JS 데이터 형식을 확인해 주세요.');
  const start = match.index + match[0].length;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(source.slice(start, i + 1));
  }
  throw new Error('야구 JS 데이터가 완전하지 않아요.');
}
