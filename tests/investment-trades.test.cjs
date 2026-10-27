const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.join(__dirname, '../cloudflare-worker/investment-trades.js')));
const time = Date.parse('2026-10-27T03:15:00Z');
const quote = { price: 100, revision: 12, asOf: time - 900000, nextUpdateAt: time + 900000, stale: false, enabled: true };
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const order = (n, extra = {}) => ({ requestId: id(n), symbol: 'en-joy', side: 'buy', quantity: 2,
  expectedRevision: quote.revision, expectedPrice: quote.price, expiresAt: time + 60000, ...extra });
function database(points = 1000) {
  const docs = new Map(), base = 'projects/test/databases/(default)/documents/';
  let version = 0, commits = 0, uncertain = false;
  const seed = (p, data) => docs.set(p, { name: base + p, data: structuredClone(data), updateTime: String(++version) });
  seed('members/a', { name: '성원제', points, profileValue: 'preserve' });
  seed('members/b', { name: '홍박사', points: 999999 });
  seed('members/guest', { name: '외부계정', points: 999999 });
  return {
    docs, seed, get: async p => docs.has(p) ? structuredClone(docs.get(p)) : null,
    query: async p => [...docs.entries()].filter(([k]) => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(([, v]) => structuredClone(v)),
    async list(p, options = {}) { const rows = await this.query(p); if (options.field) rows.sort((a, b) => options.descending ? b.data[options.field] - a.data[options.field] : a.data[options.field] - b.data[options.field]); return rows.slice(0, options.limit || rows.length); },
    write: (p, data, previous, fields) => ({ p, data, previous, fields }),
    async commit(writes) {
      for (const w of writes) {
        const old = docs.get(w.p);
        if (w.previous ? old?.updateTime !== w.previous.updateTime : !!old) throw Object.assign(new Error('Conflict'), { code: 412 });
      }
      for (const w of writes) seed(w.p, w.fields ? { ...docs.get(w.p).data, ...w.data } : w.data);
      commits++;
      if (uncertain) { uncertain = false; throw Object.assign(new Error('Response lost after commit'), { code: 503 }); }
    },
    uncertain() { uncertain = true; }, count: () => commits
  };
}
test('buy debits only the authenticated member and atomically persists holdings and the receipt', async () => {
  const { executeOrder, readAccount, ACCOUNTS } = await load(), db = database();
  const result = await executeOrder(db, 'a', order(1), quote, () => time);
  assert.equal(result.order.total, 200);
  assert.equal(db.docs.get('members/a').data.points, 800);
  assert.equal(db.docs.get('members/a').data.profileValue, 'preserve');
  assert.equal(db.docs.get('members/b').data.points, 999999);
  assert.equal(db.docs.get(ACCOUNTS + '/a').data.quantity, 2);
  const restored = await readAccount(db, 'a', { ...quote, price: 125 });
  assert.equal(restored.marketValue, 250); assert.equal(restored.profit, 50); assert.equal(restored.returnPercent, 25);
  assert.equal(restored.orders.length, 1); assert.equal(restored.orders[0].requestId, id(1));
});
test('the same order after a lost response is returned once, including after the market closes or changes', async () => {
  const { executeOrder } = await load(), db = database(); db.uncertain();
  await assert.rejects(executeOrder(db, 'a', order(1), quote, () => time));
  const retry = await executeOrder(db, 'a', order(1), { ...quote, enabled: false, price: 900, revision: 15 }, () => time + 600000);
  assert.equal(retry.duplicate, true); assert.equal(db.count(), 1); assert.equal(db.docs.get('members/a').data.points, 800);
  await assert.rejects(executeOrder(db, 'a', order(1, { quantity: 3 }), quote, () => time), e => e.code === 'request-conflict');
});
test('simultaneous devices cannot overspend points or oversell a holding', async () => {
  const { executeOrder, ACCOUNTS } = await load(), db = database(300);
  const purchases = await Promise.allSettled([executeOrder(db, 'a', order(1), quote, () => time), executeOrder(db, 'a', order(2), quote, () => time)]);
  assert.equal(purchases.filter(p => p.status === 'fulfilled').length, 1);
  assert.equal(db.docs.get('members/a').data.points, 100); assert.equal(db.docs.get(ACCOUNTS + '/a').data.quantity, 2);
  const sales = await Promise.allSettled([executeOrder(db, 'a', order(3, { side: 'sell' }), quote, () => time), executeOrder(db, 'a', order(4, { side: 'sell' }), quote, () => time)]);
  assert.equal(sales.filter(p => p.status === 'fulfilled').length, 1);
  assert.equal(db.docs.get('members/a').data.points, 300); assert.equal(db.docs.get(ACCOUNTS + '/a').data.quantity, 0);
});
test('selling uses the saved average cost, realizes profit and clears all cost on the final sale', async () => {
  const { executeOrder, ACCOUNTS } = await load(), db = database(10000);
  await executeOrder(db, 'a', order(1, { quantity: 3 }), quote, () => time);
  const second = { ...quote, price: 101, revision: 13 };
  await executeOrder(db, 'a', order(2, { quantity: 2, expectedPrice: 101, expectedRevision: 13 }), second, () => time);
  const sold = { ...quote, price: 110, revision: 14 };
  await executeOrder(db, 'a', order(3, { quantity: 2, side: 'sell', expectedPrice: 110, expectedRevision: 14 }), sold, () => time);
  assert.equal(db.docs.get(ACCOUNTS + '/a').data.costBasis, 302);
  await executeOrder(db, 'a', order(4, { quantity: 3, side: 'sell', expectedPrice: 110, expectedRevision: 14 }), sold, () => time);
  const a = db.docs.get(ACCOUNTS + '/a').data;
  assert.equal(a.quantity, 0); assert.equal(a.costBasis, 0); assert.equal(a.realizedProfit, 48);
  assert.equal(db.docs.get('members/a').data.points, 10048);
});
test('invalid quantities, indexes, insufficient points, closed/stale/changed prices and outsiders never write', async () => {
  const { executeOrder } = await load();
  const cases = [
    [order(1, { quantity: 0 }), quote, 'a', time], [order(1, { quantity: 1.1 }), quote, 'a', time],
    [order(1, { symbol: 'enjoy' }), quote, 'a', time], [order(1, { quantity: 100 }), quote, 'a', time],
    [order(1, { expectedPrice: 1 }), quote, 'a', time], [order(1), { ...quote, stale: true }, 'a', time],
    [order(1), { ...quote, enabled: false }, 'a', time], [order(1), quote, 'guest', time],
    [order(1, { expiresAt: time - 1 }), quote, 'a', time],
    [order(1), quote, 'a', Date.parse('2026-10-27T14:30:00Z')]
  ];
  for (const [input, market, uid, at] of cases) {
    const db = database(); await assert.rejects(executeOrder(db, uid, input, market, () => at));
    assert.equal(db.count(), 0); assert.equal(db.docs.get('members/a').data.points, 1000);
  }
});
test('ranking uses each UID actual invested cost and shared price, ties ranks, and excludes uninvested wallet points', async () => {
  const { executeOrder, readRanking } = await load(), db = database();
  await executeOrder(db, 'a', order(1), quote, () => time);
  let ranked = await readRanking(db, 'a', { ...quote, price: 120 });
  assert.deepEqual(ranked.rows.map(r => [r.uid, r.rank, r.investedPoints]), [['a', 1, 200], ['b', 2, 0]]);
  assert.equal(ranked.rows[0].marketValue, 240); assert.equal(ranked.rows[0].returnPercent, 20);
  await executeOrder(db, 'b', order(2), quote, () => time);
  ranked = await readRanking(db, 'a', quote);
  assert.deepEqual(ranked.rows.map(r => r.rank), [1, 1]);
  await assert.rejects(readRanking(db, 'guest', quote), e => e.status === 403);
});
test('an existing negative point balance remains readable and sales repay it without allowing purchases', async () => {
  const { executeOrder, readAccount, ACCOUNTS } = await load(), db = database(-500);
  db.seed(ACCOUNTS + '/a', { quantity: 2, costBasis: 150, realizedProfit: 0, revision: 1 });
  assert.equal((await readAccount(db, 'a', quote)).points, -500);
  await assert.rejects(executeOrder(db, 'a', order(1), quote, () => time), e => e.code === 'insufficient-points');
  await executeOrder(db, 'a', order(2, { side: 'sell' }), quote, () => time);
  assert.equal(db.docs.get('members/a').data.points, -300);
});
