import { ACCOUNTS, MEMBERS, portfolio } from './investment-trades.js';
import { retryConflict } from './prediction-firestore.js';

export const WELCOME_GRANT = 'member-two-token-gift-v1';
export const GRANT_PATH = 'drop_predictions/investment-ledger-v1/grants/' + WELCOME_GRANT;
const fail = (message, status = 400, code = 'invalid-grant') => { throw Object.assign(new Error(message), { status, code }); };
// Use the existing app administrator, authenticated by signed Google claims.
export function isGrantAdmin(claims) {
  return !!claims?.sub && claims.email_verified === true && claims.firebase?.sign_in_provider === 'google.com' &&
    String(claims.email || '').trim().toLowerCase() === 'gwanlija180@gmail.com';
}
async function admin(db, claims) {
  if (!isGrantAdmin(claims)) fail('관리자 계정에서만 지급할 수 있어요.', 403, 'admin-required');
  const profile = await db.get('members/' + claims.sub);
  if (!profile || !MEMBERS.has(profile.data.name)) fail('관리자 멤버 등록을 확인해 주세요.', 403, 'admin-required');
  return profile;
}
async function recipients(db) {
  const rows = (await db.query('members')).filter(p => MEMBERS.has(p.data.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length || rows.length > 100) fail('지급 대상 멤버 목록을 확인해 주세요.', 409, 'recipients-changed');
  const ids = rows.map(p => p.name.split('/').pop());
  if (new Set(ids).size !== ids.length) fail('멤버 목록이 중복되어 있어요.', 409);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(ids)));
  return { rows, key: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
}
function validQuote(quote, now) {
  if (!quote || !Number.isSafeInteger(quote.price) || quote.price < 1 || !Number.isSafeInteger(quote.revision) ||
      !Number.isSafeInteger(quote.asOf) || !Number.isSafeInteger(quote.nextUpdateAt) || quote.stale || quote.nextUpdateAt <= now) {
    fail('최신 기준가를 확인한 뒤 다시 시도해 주세요.', 409, 'quote-changed');
  }
}
function summary(cohort, quote, time) {
  return { campaignId: WELCOME_GRANT, status: 'pending', quantityPerMember: 2, price: quote.price,
    quoteRevision: quote.revision, quoteAt: quote.asOf, serverTime: time, recipientKey: cohort.key, totalQuantity: cohort.rows.length * 2,
    recipients: cohort.rows.map(p => ({ uid: p.name.split('/').pop(), name: p.data.name, quantity: 2 })) };
}
export async function previewWelcomeGrant(db, claims, quote, now = Date.now) {
  await admin(db, claims);
  const previous = await db.get(GRANT_PATH);
  if (previous) return { ...previous.data, duplicate: true };
  const time = now(); validQuote(quote, time);
  return summary(await recipients(db), quote, time);
}
export async function grantWelcomeTokens(db, claims, input, quote, now = Date.now) {
  if (!isGrantAdmin(claims)) fail('관리자 계정에서만 지급할 수 있어요.', 403, 'admin-required');
  if (!input || input.campaignId !== WELCOME_GRANT ||
      Object.keys(input).some(k => !['campaignId', 'expectedPrice', 'expectedRevision', 'recipientKey', 'expiresAt'].includes(k)) ||
      !Number.isSafeInteger(input.expectedPrice) || input.expectedPrice < 1 || !Number.isSafeInteger(input.expectedRevision) ||
      typeof input.recipientKey !== 'string' || !/^[a-f0-9]{64}$/.test(input.recipientKey) || !Number.isSafeInteger(input.expiresAt)) {
    fail('지급 대상과 기준가를 먼저 확인해 주세요.');
  }
  return retryConflict(async () => {
    const administrator = await admin(db, claims), previous = await db.get(GRANT_PATH);
    // A fixed campaign receipt prevents repeat grants across retries and devices.
    if (previous) return { ...previous.data, duplicate: true };
    const time = now(); validQuote(quote, time);
    if (input.expectedPrice !== quote.price || input.expectedRevision !== quote.revision || input.expiresAt < time || input.expiresAt > time + 120000) {
      fail('기준가 또는 확인 시간이 변경됐어요. 지급 대상을 다시 확인해 주세요.', 409, 'quote-changed');
    }
    const cohort = await recipients(db);
    if (cohort.key !== input.recipientKey) fail('멤버 목록이 변경됐어요. 지급 대상을 다시 확인해 주세요.', 409, 'recipients-changed');
    const accounts = await Promise.all(cohort.rows.map(p => db.get(ACCOUNTS + '/' + p.name.split('/').pop())));
    const writes = cohort.rows.some(p => p.name === administrator.name) ? [] : [db.verify(administrator)];
    for (let i = 0; i < cohort.rows.length; i++) {
      const profile = cohort.rows[i], uid = profile.name.split('/').pop();
      if (!Number.isSafeInteger(profile.data.points ?? 0)) fail('멤버의 포인트 정보를 확인할 수 없어요.', 409);
      const old = portfolio(uid, profile.data, accounts[i], quote);
      const addedBasis = 2 * quote.price, quantity = old.quantity + 2, costBasis = old.costBasis + addedBasis;
      if (![addedBasis, quantity, costBasis, old.revision + 1].every(Number.isSafeInteger)) fail('보유량 또는 기준금액 범위를 초과했어요.', 409);
      const next = { uid, name: profile.data.name, symbol: 'en-joy', quantity, costBasis,
        realizedProfit: old.realizedProfit, revision: old.revision + 1, updatedAt: time };
      const receipt = { requestId: 'grant-' + WELCOME_GRANT, campaignId: WELCOME_GRANT, uid, name: profile.data.name,
        symbol: 'en-joy', side: 'grant', quantity: 2, price: quote.price, total: addedBasis,
        quoteRevision: quote.revision, quoteAt: quote.asOf, executedAt: time, grantedBy: claims.sub,
        pointsAfter: profile.data.points ?? 0, holdingsAfter: quantity, accountRevision: next.revision };
      // Profiles are verified, never modified. Every account and receipt commits atomically.
      writes.push(db.verify(profile), db.write(ACCOUNTS + '/' + uid, next, accounts[i], Object.keys(next)),
        db.write(ACCOUNTS + '/' + uid + '/orders/grant-' + WELCOME_GRANT, receipt, null));
    }
    const result = { ...summary(cohort, quote, time), status: 'completed', executedAt: time, grantedBy: claims.sub };
    writes.push(db.write(GRANT_PATH, result, null));
    await db.commit(writes);
    return { ...result, duplicate: false };
  });
}
