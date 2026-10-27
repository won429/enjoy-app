import { retryConflict } from './prediction-firestore.js';

// Reuse the already server-only Firestore namespace. No new client write permission
// or service-account key is needed, and no prediction parent document is created.
export const ACCOUNTS = 'drop_predictions/investment-ledger-v1/accounts';
const MEMBERS = new Set(['전시기', '성원제', '오스틴', '이진누', '류짱', '홍박사', '관리자']);
const fail = (message, status = 400, code = 'invalid-order') => { throw Object.assign(new Error(message), { status, code }); };
const safe = value => Number.isSafeInteger(value) && value >= 0;
const requestId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const pathFor = uid => `${ACCOUNTS}/${uid}`;
function member(profile) {
  if (!profile || !MEMBERS.has(profile.data.name)) fail('등록된 엔조이 멤버만 투자할 수 있어요.', 403, 'not-member');
  if (!Number.isSafeInteger(profile.data.points ?? 0)) fail('포인트 잔액을 확인할 수 없어요.', 503, 'invalid-balance');
  return profile.data;
}
function savedAccount(document) {
  const a = document?.data || { quantity: 0, costBasis: 0, realizedProfit: 0, revision: 0 };
  if (!safe(a.quantity) || !safe(a.costBasis) || !Number.isSafeInteger(a.realizedProfit) || !safe(a.revision)) {
    fail('투자 기록을 확인할 수 없어요.', 503, 'invalid-account');
  }
  return a;
}
export function portfolio(uid, profile, document, quote) {
  const a = savedAccount(document), value = a.quantity * quote.price;
  if (!safe(value)) fail('평가금액 범위를 초과했어요.', 503);
  return { uid, name: profile.name, points: profile.points ?? 0, symbol: 'en-joy', quantity: a.quantity,
    costBasis: a.costBasis, averagePrice: a.quantity ? a.costBasis / a.quantity : 0,
    marketValue: value, profit: value - a.costBasis, realizedProfit: a.realizedProfit,
    returnPercent: a.costBasis ? Number(((value - a.costBasis) / a.costBasis * 100).toFixed(2)) : 0,
    revision: a.revision, price: quote.price, quoteRevision: quote.revision, quoteAt: quote.asOf };
}
export async function readAccount(db, uid, quote) {
  const [profile, account, orders] = await Promise.all([db.get(`members/${uid}`), db.get(pathFor(uid)),
    db.list(`${pathFor(uid)}/orders`, { field: 'executedAt', descending: true, limit: 20 })]);
  return { ...portfolio(uid, member(profile), account, quote), orders: orders.map(o => o.data) };
}
export async function readRanking(db, uid, quote) {
  member(await db.get(`members/${uid}`));
  const [profiles, accounts] = await Promise.all([db.query('members'), db.list(ACCOUNTS)]);
  const byUid = new Map(accounts.map(a => [a.name.split('/').pop(), a]));
  const rows = profiles.filter(p => MEMBERS.has(p.data.name)).map(p => {
    const id = p.name.split('/').pop(), a = portfolio(id, p.data, byUid.get(id), quote);
    return { uid: id, name: a.name, investedPoints: a.costBasis, marketValue: a.marketValue, profit: a.profit, returnPercent: a.returnPercent };
  }).sort((a, b) => b.investedPoints - a.investedPoints || a.name.localeCompare(b.name, 'ko-KR') || a.uid.localeCompare(b.uid));
  let rank = 0;
  rows.forEach((row, i) => { if (!i || row.investedPoints !== rows[i - 1].investedPoints) rank = i + 1; row.rank = rank; });
  return { rows, price: quote.price, quoteRevision: quote.revision, quoteAt: quote.asOf };
}
export async function executeOrder(db, uid, input, quote, now = Date.now) {
  if (!input || !requestId(input.requestId) || input.symbol !== 'en-joy' || !['buy', 'sell'].includes(input.side) ||
      !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1_000_000 ||
      !safe(input.expectedRevision) || !Number.isSafeInteger(input.expectedPrice) || input.expectedPrice < 1 ||
      !Number.isSafeInteger(input.expiresAt)) fail('주문 내용을 다시 확인해 주세요.');
  const orderPath = `${pathFor(uid)}/orders/${input.requestId}`;
  return retryConflict(async () => {
    const [profile, account, previous] = await Promise.all([db.get(`members/${uid}`), db.get(pathFor(uid)), db.get(orderPath)]);
    const user = member(profile);
    if (previous) {
      const old = previous.data;
      if (old.symbol !== input.symbol || old.side !== input.side || old.quantity !== input.quantity || old.price !== input.expectedPrice || old.quoteRevision !== input.expectedRevision) {
        fail('같은 주문 번호로 다른 주문을 보낼 수 없어요.', 409, 'request-conflict');
      }
      return { order: old, duplicate: true };
    }
    if (!quote.enabled) fail('현재 거래를 이용할 수 없어요.', 423, 'trading-closed');
    const time = now(), kst = (time + 9 * 3_600_000) % 86_400_000;
    if (kst >= 23.5 * 3_600_000) fail('운영시간은 00:00~23:30이에요.', 423, 'market-closed');
    if (quote.stale || quote.nextUpdateAt <= time) fail('시세 갱신 중이에요. 잠시 후 다시 주문해 주세요.', 409, 'quote-changed');
    if (input.expiresAt < time || input.expiresAt > time + 120_000) fail('주문 유효시간이 지났어요. 시세를 확인해 주세요.', 409, 'order-expired');
    if (input.expectedRevision !== quote.revision || input.expectedPrice !== quote.price) fail('시세가 변경됐어요. 새 가격을 확인해 주세요.', 409, 'quote-changed');
    const old = savedAccount(account), total = quote.price * input.quantity;
    if (!safe(total) || total < 1) fail('주문 금액이 너무 커요.');
    let points = user.points ?? 0, quantity = old.quantity, costBasis = old.costBasis, realizedProfit = old.realizedProfit;
    if (input.side === 'buy') {
      if (points < total) fail('보유 포인트가 부족해요.', 400, 'insufficient-points');
      points -= total; quantity += input.quantity; costBasis += total;
    } else {
      if (quantity < input.quantity) fail('판매할 드롭이 부족해요.', 400, 'insufficient-holdings');
      const removedCost = input.quantity === quantity ? costBasis : Number(BigInt(costBasis) * BigInt(input.quantity) / BigInt(quantity));
      quantity -= input.quantity; costBasis -= removedCost; points += total; realizedProfit += total - removedCost;
    }
    if (!Number.isSafeInteger(points) || ![quantity, costBasis].every(safe) || !Number.isSafeInteger(realizedProfit) || !safe(old.revision + 1)) fail('거래 가능 범위를 초과했어요.');
    const next = { uid, name: user.name, symbol: 'en-joy', quantity, costBasis, realizedProfit, revision: old.revision + 1, updatedAt: time };
    const order = { requestId: input.requestId, uid, name: user.name, symbol: input.symbol, side: input.side,
      quantity: input.quantity, price: quote.price, total, quoteRevision: quote.revision, quoteAt: quote.asOf,
      executedAt: time, pointsAfter: points, holdingsAfter: quantity, accountRevision: next.revision };
    // Optimistic preconditions cover profile, holdings and the unique receipt together.
    // A concurrent reward, device, or retry either commits all three or retries all three.
    await db.commit([db.write(`members/${uid}`, { points }, profile, ['points']),
      db.write(pathFor(uid), next, account), db.write(orderPath, order, null)]);
    return { order, duplicate: false };
  });
}

