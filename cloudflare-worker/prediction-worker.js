import { verifyToken } from './tekken-auth.js';
import { createDatabase, decode, retryConflict } from './prediction-firestore.js';
import { ADMIN_UID, MEMBERS, TEAMS, fail, normalizeGame, gameKey, sameGame, startMillis, outcome,
  validatePrediction, pointDelta, publicPrediction, parseHistory } from './prediction-domain.js';

const COLLECTION = 'drop_predictions';
const validId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function originAllowed(origin, env) { return (env.ALLOWED_ORIGINS || '').split(',').includes(origin); }
async function baseballDocument(path, env) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${env.BASEBALL_PROJECT_ID}/databases/(default)/documents/${path}?key=${encodeURIComponent(env.BASEBALL_API_KEY)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('야구 Firebase 연결을 확인해 주세요.');
  return decode({ mapValue: { fields: (await response.json()).fields || {} } });
}
export function loader(env) {
  const cache = new Map();
  const once = (key, work) => { if (!cache.has(key)) cache.set(key, work()); return cache.get(key); };
  return async function games(date, withHistory = false, target = null) {
    const results = await Promise.allSettled([`schedule/${date.slice(0, 7)}`, `games/${date}`, 'live/today']
      .map(path => once(path, () => baseballDocument(path, env))));
    const merged = new Map();
    // The more specific/live documents override the monthly schedule.
    results.forEach(result => { if (result.status === 'fulfilled') (result.value?.games || []).forEach(raw => {
      const g = normalizeGame(raw);
      if (g.date === date && TEAMS.includes(g.team1) && TEAMS.includes(g.team2)) {
        const previous = Array.from(merged.entries()).find(([, saved]) => sameGame(saved, g));
        if (previous) merged.delete(previous[0]);
        merged.set(gameKey(g), { ...g, source: 'firebase' });
      }
    }); });
    if (withHistory && (!target || !Array.from(merged.values()).some(g => sameGame(g, target)))) {
      const year = date.slice(0, 4), month = Number(date.slice(5, 7));
      const file = `kbo_history_${year}${month >= 8 ? '_' + String(month).padStart(2, '0') : ''}.js`;
      const history = await once(file, async () => {
        const url = new URL(file, env.HISTORY_BASE_URL.endsWith('/') ? env.HISTORY_BASE_URL : env.HISTORY_BASE_URL + '/');
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('야구 JS 결과 데이터를 불러오지 못했어요.');
        return parseHistory(await response.text());
      });
      (history?.gamesByDate?.[date] || []).forEach(raw => {
        const g = normalizeGame(raw);
        if (!Array.from(merged.values()).some(live => sameGame(live, g))) merged.set(gameKey(g), { ...g, source: 'javascript' });
      });
    }
    if (!merged.size && results.every(r => r.status === 'rejected')) fail('야구 일정 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', 503);
    return Array.from(merged.values());
  };
}
export async function submitPrediction(db, id, uid, choice, games, now = Date.now) {
  if (!validId(id)) fail('예측 정보를 확인해 주세요.');
  return retryConflict(async () => {
    const pdoc = await db.get(`${COLLECTION}/${id}`);
    if (!pdoc) fail('예측을 찾을 수 없어요.', 404);
    const p = pdoc.data;
    const [profile, previous, fixtures] = await Promise.all([db.get('members/' + uid), db.get(`${COLLECTION}/${id}/answers/${uid}`), games(p.game.date)]);
    if (!MEMBERS.includes(profile?.data.name)) fail('등록된 엔조이 멤버만 참여할 수 있어요.', 403);
    const game = fixtures.find(g => sameGame(g, p.game));
    const time = now();
    if (p.status !== 'pending' || time < p.startsAt || time >= p.closesAt || time < p.publishStart || time >= p.publishEnd ||
        time >= startMillis(p.game) || !game || outcome(game) || /경기중|진행|live|playing/i.test(String(game.gameStatus || game.status || ''))) {
      fail('예측 참여 기간이 아니거나 경기가 이미 시작되었어요.');
    }
    const answer = { uid, name: profile.data.name, choice, submittedAt: time };
    if (![p.game.team1, p.game.team2].includes(choice)) fail('승리할 팀을 선택해 주세요.');
    await db.commit([db.verify(pdoc), db.verify(profile), db.write(`${COLLECTION}/${id}/answers/${uid}`, answer, previous)]);
    return answer;
  });
}
export async function settleOne(db, id, games, now = Date.now) {
  // Freeze a terminal result exactly once. Missing/unfinished fixtures remain pending, even after the post expires.
  await retryConflict(async () => {
    const doc = await db.get(`${COLLECTION}/${id}`);
    if (!doc || doc.data.status !== 'pending' || now() < doc.data.revealAt) return;
    const game = (await games(doc.data.game.date, true, doc.data.game)).find(g => sameGame(g, doc.data.game));
    const result = outcome(game);
    if (!result) return;
    await db.commit([db.write(`${COLLECTION}/${id}`, { status: 'settling', result: { ...result, source: game.source }, resolvedAt: now() }, doc,
      ['status', 'result', 'resolvedAt'])]);
  });
  const pdoc = await db.get(`${COLLECTION}/${id}`);
  if (!pdoc || pdoc.data.status !== 'settling') return;
  const answers = await db.answers(id);
  for (const entry of answers) {
    const uid = entry.name.split('/').pop();
    await retryConflict(async () => {
      const [answer, profile] = await Promise.all([db.get(`${COLLECTION}/${id}/answers/${uid}`), db.get('members/' + uid)]);
      if (!answer || answer.data.settledAt) return;
      if (!profile) throw new Error('예측 참여자의 멤버 문서가 없어 정산을 재시도합니다.');
      const delta = pointDelta(pdoc.data, answer.data), balance = Number(profile.data.points || 0);
      if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(balance + delta)) throw new Error('Invalid point balance');
      // Both writes succeed together. updateTime prevents duplicate credits and lost concurrent purchases/rewards.
      await db.commit([
        db.write('members/' + uid, { points: balance + delta }, profile, ['points']),
        db.write(`${COLLECTION}/${id}/answers/${uid}`, { delta, settledAt: now() }, answer, ['delta', 'settledAt'])
      ]);
    });
  }
  await retryConflict(async () => {
    const doc = await db.get(`${COLLECTION}/${id}`);
    if (doc?.data.status === 'settling') await db.commit([db.write(`${COLLECTION}/${id}`, { status: 'settled', settledAt: now() }, doc, ['status', 'settledAt'])]);
  });
}
export async function settleAll(env, database = createDatabase(env), games = loader(env)) {
  // Query by status, never by visibility: an expired card may still await an archived result.
  const rows = (await Promise.all(['pending', 'settling'].map(s => database.query(COLLECTION, 'status', 'EQUAL', s)))).flat();
  const errors = [];
  for (const row of rows) {
    try { await settleOne(database, row.name.split('/').pop(), games); }
    catch (error) { errors.push(row.name.split('/').pop()); console.error('Prediction settlement failed', row.name, error.message); }
  }
  if (errors.length) throw new Error('Prediction settlement needs retry: ' + errors.join(','));
}
async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ ok: true, configured: !!env.FIREBASE_SERVICE_ACCOUNT });
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  const claims = await verifyToken(bearer, env);
  if (!claims || !validId(claims.sub)) fail('멤버 로그인이 필요해요.', 401);
  const db = createDatabase(env), profile = await db.get('members/' + claims.sub);
  if (!MEMBERS.includes(profile?.data.name)) fail('등록된 엔조이 멤버만 이용할 수 있어요.', 403);
  const games = loader(env), now = Date.now();
  if (request.method === 'GET' && url.pathname === '/games') {
    if (claims.sub !== ADMIN_UID) fail('성원제 계정에서만 예측을 추가할 수 있어요.', 403);
    const date = url.searchParams.get('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail('경기 날짜를 선택해 주세요.');
    const fixtures = await games(date);
    return json({ games: fixtures.filter(g => Number.isFinite(startMillis(g)) && startMillis(g) > now && !outcome(g)), serverNow: now });
  }
  if (request.method === 'GET' && url.pathname === '/feed') {
    const docs = await db.query(COLLECTION, 'publishEnd', 'GREATER_THAN', now);
    const posts = await Promise.all(docs.filter(d => d.data.publishStart <= now).map(async doc => {
      const id = doc.name.split('/').pop(), answer = await db.get(`${COLLECTION}/${id}/answers/${claims.sub}`);
      return { ...publicPrediction(doc.data, answer?.data, now), _id: id, postType: 'prediction', createdAt: doc.data.publishStart };
    }));
    return json({ posts, admin: claims.sub === ADMIN_UID, serverNow: now });
  }
  if (request.method !== 'POST') fail('요청을 찾을 수 없어요.', 404);
  if (Number(request.headers.get('Content-Length')) > 8192) fail('입력 내용이 너무 길어요.', 413);
  const raw = await request.text();
  if (raw.length > 8192) fail('입력 내용이 너무 길어요.', 413);
  let input; try { input = JSON.parse(raw); } catch (_) { fail('입력 내용을 확인해 주세요.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('입력 내용을 확인해 주세요.');
  if (url.pathname === '/create') {
    if (claims.sub !== ADMIN_UID) fail('성원제 계정에서만 예측을 추가할 수 있어요.', 403);
    if (!validId(input.requestId)) fail('등록 요청을 다시 열어 주세요.');
    const previous = await db.get(`${COLLECTION}/${input.requestId}`);
    if (previous) return json({ id: input.requestId });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) fail('경기 날짜를 선택해 주세요.');
    const fixture = (await games(input.date)).find(g => gameKey(g) === input.gameKey);
    if (!fixture) fail('경기 일정을 다시 불러와 주세요.');
    const data = { ...validatePrediction(input, fixture, Date.now()), authorUid: claims.sub, authorName: '성원제', createdAt: now, status: 'pending' };
    const id = input.requestId;
    await retryConflict(async () => {
      if (!await db.get(`${COLLECTION}/${id}`)) await db.commit([db.write(`${COLLECTION}/${id}`, data, null)]);
    });
    return json({ id });
  }
  if (url.pathname === '/submit') return json({ answer: await submitPrediction(db, input.id, claims.sub, input.choice, games) });
  fail('요청을 찾을 수 없어요.', 404);
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin && !originAllowed(origin, env)) return json({ error: '허용되지 않은 주소예요.' }, 403);
    const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type', Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    let response;
    try { response = await route(request, env); }
    catch (error) { console.error('Prediction API', error.message); response = json({ error: error.status ? error.message : '예측 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }, error.status || 503); }
    return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...headers } });
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(settleAll(env)); }
};
