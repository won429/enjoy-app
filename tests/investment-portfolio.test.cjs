const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../investment-portfolio.js'), 'utf8');
const at = Date.parse('2026-10-27T03:15:00Z');
const market = { serverTime: at, nextUpdateAt: at + 900000, asOf: at - 900000, revision: 12, tradingEnabled: true, stale: false, quotes: [{ id: 'en-joy', price: 100 }] };
const account = uid => ({ uid, name: uid === 'a' ? '성원제' : '홍박사', points: 1000, quantity: 0, costBasis: 0, marketValue: 0, profit: 0, realizedProfit: 0, returnPercent: 0, orders: [], revision: 0 });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
function setup(fetcher, storage = new Map()) {
  const elements = new Map(), events = {}, listeners = {}, timers = new Map(); let timerId = 0, confirms = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, hidden: false, disabled: false, value: '1', dataset: {}, attributes: {}, textContent: '', innerHTML: '',
      addEventListener(type, fn) { (listeners[id + ':' + type] ||= []).push(fn); }, setAttribute(k, v) { this.attributes[k] = v; },
      querySelector() { return element('summary-small'); } });
    return elements.get(id);
  };
  const document = { hidden: false, getElementById: element, addEventListener(type, fn) { (events[type] ||= []).push(fn); } };
  const window = { enjoyUser: { uid: 'a' }, isGuest: false,
    getEnjoyIdToken: async () => 'token-' + window.enjoyUser?.uid,
    enjoyConfirm: async () => { confirms++; return true; },
    addEventListener(type, fn) { (events[type] ||= []).push(fn); } };
  vm.runInNewContext(source, { window, document, fetch: fetcher, crypto: require('node:crypto').webcrypto, AbortController,
    Date: class extends Date { static now() { return at; } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } });
  const controller = window.enjoyInvestmentPortfolio;
  controller.mount(); controller.render({ selected: 'en-joy', tab: 'holdings', active: true }); controller.updateMarket(market);
  return { controller, window, element, storage, timers, confirms: () => confirms,
    async action(action) { const button = element(action === 'retry' ? 'investment-order-retry' : 'investment-' + action); button.dataset.investmentAction = action;
      for (const fn of listeners['wallet-panel-investment:click'] || []) fn({ target: { closest: () => button } }); await flush(); },
    auth(user) { window.enjoyUser = user; for (const fn of events['enjoy-auth-ready'] || []) fn(); }, flush };
}
function server() {
  const accounts = new Map([['a', account('a')], ['b', account('b')]]), receipts = new Map(), calls = [];
  let loseNextResponse = false, orders = 0;
  return { accounts, receipts, calls, count: () => orders, lose() { loseNextResponse = true; },
    async fetch(url, options) {
      const route = new URL(url).pathname, uid = options.headers.Authorization.slice(13);
      calls.push({ route, uid, options });
      assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
      if (route === '/account') return { ok: true, json: async () => structuredClone(accounts.get(uid)) };
      if (route === '/ranking') return { ok: true, json: async () => ({ rows: [{ uid: 'b', name: '<img src=x>', rank: 1, investedPoints: 200, marketValue: 240, profit: 40, returnPercent: 20 }, { uid: 'a', name: '성원제', rank: 2, investedPoints: 0, marketValue: 0, profit: 0, returnPercent: 0 }] }) };
      assert.equal(route, '/orders'); const input = JSON.parse(options.body);
      if (!receipts.has(input.requestId)) {
        orders++; const a = accounts.get(uid); a.points -= input.quantity * input.expectedPrice; a.quantity += input.quantity;
        a.costBasis += input.quantity * input.expectedPrice; a.marketValue = a.costBasis;
        const order = { ...input, uid, price: input.expectedPrice, total: input.expectedPrice * input.quantity, executedAt: at };
        a.orders.unshift(order); receipts.set(input.requestId, order);
      }
      if (loseNextResponse) { loseNextResponse = false; throw Error('Lost response'); }
      return { ok: true, json: async () => ({ order: structuredClone(receipts.get(input.requestId)) }) };
    }
  };
}
test('authenticated portfolio and ranking render real amounts, escape member names and preserve currency conversion', async () => {
  const s = server(), ui = setup(s.fetch); await flush();
  assert.equal(ui.controller.snapshot().uid, 'a');
  assert.match(ui.element('investment-ranking').innerHTML, /200 P/);
  assert.match(ui.element('investment-ranking').innerHTML, /&lt;img src=x&gt;/);
  assert.doesNotMatch(ui.element('investment-ranking').innerHTML, /<img/);
  assert.equal(ui.element('investment-buy').disabled, false); assert.equal(ui.element('investment-sell').disabled, true);
  ui.controller.render({ currency: 'KRW' }); assert.match(ui.element('investment-ranking').innerHTML, />2원</);
  assert.equal(s.calls.filter(c => c.route === '/orders').length, 0);
});
test('buy asks with the exact shared quote and refreshes balances, holdings and receipts after server completion', async () => {
  const s = server(), ui = setup(s.fetch); await flush(); ui.element('investment-order-quantity').value = '3';
  await ui.action('buy');
  assert.equal(ui.confirms(), 1); assert.equal(s.count(), 1);
  const sent = JSON.parse(s.calls.find(c => c.route === '/orders').options.body);
  assert.equal(sent.quantity, 3); assert.equal(sent.expectedPrice, 100); assert.equal(sent.expectedRevision, 12);
  assert.equal(ui.controller.snapshot().points, 700); assert.equal(ui.controller.snapshot().quantity, 3);
  assert.match(ui.element('investment-holdings-panel').innerHTML, /3토큰/);
  assert.match(ui.element('investment-trade-note').textContent, /완료/); assert.equal(ui.storage.size, 0);
});
test('a response lost after execution persists the same request ID across reload and retries without another deduction', async () => {
  const s = server(), storage = new Map(), ui = setup(s.fetch, storage); await flush(); s.lose();
  await ui.action('buy'); assert.equal(s.count(), 1); assert.equal(storage.size, 1); assert.equal(ui.element('investment-buy').disabled, true);
  const first = JSON.parse(s.calls.find(c => c.route === '/orders').options.body);
  const reloaded = setup(s.fetch, storage); await flush(); await reloaded.action('retry');
  const posts = s.calls.filter(c => c.route === '/orders').map(c => JSON.parse(c.options.body));
  assert.equal(posts[1].requestId, first.requestId); assert.equal(s.count(), 1); assert.equal(storage.size, 0);
  assert.equal(reloaded.controller.snapshot().points, 900);
});
test('logout clears investment data immediately and late reads from an old UID cannot replace the new account', async () => {
  const s = server(); let release;
  const ui = setup(async (url, options) => {
    if (options.headers.Authorization === 'Bearer token-a' && url.endsWith('/account')) return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => account('a') }); });
    return s.fetch(url, options);
  }); await flush(); ui.auth({ uid: 'b' }); await flush(); assert.equal(ui.controller.snapshot().uid, 'b');
  release(); await flush(); assert.equal(ui.controller.snapshot().uid, 'b');
  ui.auth(null); assert.equal(ui.controller.snapshot(), null); assert.match(ui.element('investment-ranking').innerHTML, /로그인/);
  assert.equal(ui.element('investment-buy').disabled, true);
});
test('server-offline and closed or stale quotes keep trading disabled without manufacturing zero portfolios', async () => {
  const offline = setup(async () => { throw Error('offline'); }); await flush();
  assert.equal(offline.controller.snapshot(), null); assert.equal(offline.element('investment-total').textContent, '—');
  assert.equal(offline.element('investment-buy').disabled, true);
  const s = server(), ui = setup(s.fetch); await flush(); ui.controller.updateMarket({ ...market, stale: true });
  assert.equal(ui.element('investment-buy').disabled, true);
  ui.controller.updateMarket({ ...market, serverTime: Date.parse('2026-10-27T14:30:00Z') });
  assert.equal(ui.element('investment-buy').disabled, true); assert.match(ui.element('investment-trade-note').textContent, /운영시간/);
});
test('the unopened service preserves account and ranking reads while blocking both purchase and sale', async () => {
  const s = server(); s.accounts.get('a').quantity = 2;
  const ui = setup(s.fetch); await flush();
  ui.controller.updateMarket({ ...market, tradingEnabled: false }); await flush();
  assert.equal(ui.controller.snapshot().quantity, 2);
  assert.match(ui.element('investment-ranking').innerHTML, /200 P/);
  assert.equal(ui.element('investment-buy').disabled, true);
  assert.equal(ui.element('investment-sell').disabled, true);
  await ui.action('buy'); await ui.action('sell');
  assert.equal(s.count(), 0); assert.equal(ui.confirms(), 0);
});
test('a free token grant is labelled as a grant and reference amount rather than a sale', async () => {
  const s = server(), a = s.accounts.get('a');
  a.quantity = 2; a.costBasis = 246; a.marketValue = 246;
  a.orders = [{ side: 'grant', quantity: 2, total: 246, executedAt: at }];
  const ui = setup(s.fetch); await flush();
  const html = ui.element('investment-holdings-panel').innerHTML;
  assert.match(html, /지급 2토큰/); assert.match(html, /기준금액 246 P/); assert.doesNotMatch(html, /판매 2토큰/);
});
