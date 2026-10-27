const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), { pathToFileURL } = require('node:url');
const load = async () => ({ ...await import(pathToFileURL(path.join(__dirname, '../cloudflare-worker/investment-grants.js'))),
  ...await import(pathToFileURL(path.join(__dirname, '../cloudflare-worker/investment-trades.js'))) });
const time = Date.parse('2026-10-27T03:15:00Z');
const quote = { price: 123, revision: 12, asOf: time - 900000, nextUpdateAt: time + 900000, stale: false, enabled: false };
const actor = { sub: 'admin', email: 'gwanlija180@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
function database() {
  const base = 'projects/test/databases/(default)/documents/', docs = new Map(); let version = 0, commits = 0, fault = '', conflict;
  const seed = (p, data) => docs.set(p, { name: base + p, data: structuredClone(data), updateTime: String(++version) });
  seed('members/admin', { name: '관리자', points: 700 }); seed('members/a', { name: '성원제', points: -30 });
  seed('members/b', { name: '홍박사', points: 1000 }); seed('members/outsider', { name: '미등록', points: 500 });
  return { docs, seed, count: () => commits, fault(value) { fault = value; }, conflict(fn) { conflict = fn; },
    get: async p => structuredClone(docs.get(p) || null),
    query: async p => [...docs.entries()].filter(([k]) => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(([, v]) => structuredClone(v)),
    async list(p) { return this.query(p); },
    write: (p, data, previous, fields) => ({ p, data, previous, fields }),
    verify: previous => ({ p: previous.name.slice(base.length), previous, verify: true }),
    async commit(writes) {
      if (conflict) { const fn = conflict; conflict = null; fn(); }
      for (const w of writes) {
        const old = docs.get(w.p);
        if (w.previous ? old?.updateTime !== w.previous.updateTime : !!old) throw Object.assign(Error('Conflict'), { code: 412 });
      }
      if (fault === 'before') { fault = ''; throw Error('Atomic commit failed'); }
      for (const w of writes) if (!w.verify) seed(w.p, w.fields ? { ...docs.get(w.p)?.data, ...w.data } : w.data);
      commits++;
      if (fault === 'after') { fault = ''; throw Error('Response lost'); }
    }
  };
}
const input = p => ({ campaignId: p.campaignId, expectedPrice: p.price, expectedRevision: p.quoteRevision, recipientKey: p.recipientKey, expiresAt: time + 60000 });
test('preview is read-only and the unopened service can grant exactly two tokens at the confirmed shared price without touching points', async () => {
  const { previewWelcomeGrant, grantWelcomeTokens, readAccount, readRanking, ACCOUNTS } = await load(), db = database();
  const preview = await previewWelcomeGrant(db, actor, quote, () => time);
  assert.equal(preview.recipients.length, 3); assert.equal(preview.totalQuantity, 6); assert.equal(db.count(), 0);
  const original = [...db.docs.entries()].filter(([k]) => k.startsWith('members/'));
  const result = await grantWelcomeTokens(db, actor, input(preview), quote, () => time);
  assert.equal(result.status, 'completed'); assert.equal(result.quantityPerMember, 2);
  for (const p of preview.recipients) {
    const a = db.docs.get(ACCOUNTS + '/' + p.uid).data;
    assert.equal(a.quantity, 2); assert.equal(a.costBasis, 246);
    const account = await readAccount(db, p.uid, quote);
    assert.equal(account.orders[0].side, 'grant'); assert.equal(account.profit, 0);
  }
  for (const [key, doc] of original) assert.deepEqual(db.docs.get(key), doc, 'every point/profile document stays unchanged');
  assert.equal(db.docs.has(ACCOUNTS + '/outsider'), false);
  assert.deepEqual((await readRanking(db, 'a', quote)).rows.map(r => [r.rank, r.investedPoints]), [[1, 246], [1, 246], [1, 246]]);
});
test('only the existing administrator verified Google identity may preview or execute, irrespective of member display name', async () => {
  const { previewWelcomeGrant, grantWelcomeTokens } = await load(), db = database();
  const p = await previewWelcomeGrant(db, actor, quote, () => time);
  for (const claims of [{ ...actor, email: 'other@example.test' }, { ...actor, email_verified: false },
    { ...actor, firebase: { sign_in_provider: 'password' } }, { sub: 'admin' }]) {
    await assert.rejects(previewWelcomeGrant(db, claims, quote, () => time), e => e.status === 403);
    await assert.rejects(grantWelcomeTokens(db, claims, input(p), quote, () => time), e => e.status === 403);
  }
  assert.equal(db.count(), 0);
});
test('fixed campaign deduplicates concurrent devices and lost responses even after price/roster changes', async () => {
  const { previewWelcomeGrant, grantWelcomeTokens, ACCOUNTS } = await load(), db = database();
  const p = await previewWelcomeGrant(db, actor, quote, () => time), body = input(p);
  const results = await Promise.all([grantWelcomeTokens(db, actor, body, quote, () => time), grantWelcomeTokens(db, actor, body, quote, () => time)]);
  assert.equal(db.count(), 1); assert.equal(results.filter(r => r.duplicate).length, 1);
  db.seed('members/new', { name: '류짱', points: 10 });
  const retry = await grantWelcomeTokens(db, actor, body, { ...quote, price: 999, stale: true }, () => time + 999999);
  assert.equal(retry.duplicate, true); assert.equal(retry.price, 123); assert.equal(db.docs.has(ACCOUNTS + '/new'), false);
  for (const p of retry.recipients) assert.equal(db.docs.get(ACCOUNTS + '/' + p.uid).data.quantity, 2);
  const lost = database(), first = await previewWelcomeGrant(lost, actor, quote, () => time); lost.fault('after');
  await assert.rejects(grantWelcomeTokens(lost, actor, input(first), quote, () => time));
  assert.equal((await grantWelcomeTokens(lost, actor, input(first), quote, () => time)).duplicate, true); assert.equal(lost.count(), 1);
});
test('all members roll back on failure; conflicts preserve existing holdings and do not overwrite concurrent point rewards', async () => {
  const { previewWelcomeGrant, grantWelcomeTokens, ACCOUNTS, GRANT_PATH } = await load(), db = database();
  db.seed(ACCOUNTS + '/a', { quantity: 5, costBasis: 400, realizedProfit: 20, revision: 2 });
  const p = await previewWelcomeGrant(db, actor, quote, () => time);
  db.fault('before'); await assert.rejects(grantWelcomeTokens(db, actor, input(p), quote, () => time));
  assert.equal(db.docs.has(GRANT_PATH), false); assert.equal(db.docs.has(ACCOUNTS + '/b'), false); assert.equal(db.docs.get(ACCOUNTS + '/a').data.quantity, 5);
  db.conflict(() => { db.seed('members/a', { name: '성원제', points: 42 }); db.seed(ACCOUNTS + '/a', { quantity: 6, costBasis: 500, realizedProfit: 20, revision: 3 }); });
  await grantWelcomeTokens(db, actor, input(p), quote, () => time);
  assert.equal(db.docs.get('members/a').data.points, 42); assert.equal(db.docs.get(ACCOUNTS + '/a').data.quantity, 8);
  assert.equal(db.docs.get(ACCOUNTS + '/a').data.costBasis, 746); assert.equal(db.docs.get(ACCOUNTS + '/a').data.realizedProfit, 20);
});
test('changed price, expiry, roster, arbitrary campaign or quantity cannot cause a partial or extra grant', async () => {
  const { previewWelcomeGrant, grantWelcomeTokens } = await load();
  for (const variant of ['price', 'expiry', 'roster', 'campaign', 'quantity', 'stale']) {
    const db = database(), p = await previewWelcomeGrant(db, actor, quote, () => time), body = input(p); let q = quote;
    if (variant === 'price') body.expectedPrice = 1;
    if (variant === 'expiry') body.expiresAt = time - 1;
    if (variant === 'roster') db.seed('members/new', { name: '류짱', points: 10 });
    if (variant === 'campaign') body.campaignId = 'another-gift';
    if (variant === 'quantity') body.quantity = 3;
    if (variant === 'stale') q = { ...quote, stale: true };
    await assert.rejects(grantWelcomeTokens(db, actor, body, q, () => time)); assert.equal(db.count(), 0);
  }
});
