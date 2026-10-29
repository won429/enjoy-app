const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../investment-portfolio.js'), 'utf8');
const ticketSource = fs.readFileSync(path.join(__dirname, '../investment-ticket.js'), 'utf8');
const at = Date.parse('2026-10-27T03:15:00Z');
const market = { serverTime: at, nextUpdateAt: at + 900000, asOf: at - 900000, revision: 12, tradingEnabled: true, stale: false, quotes: [{ id: 'en-joy', price: 100 }] };
const account = uid => ({ uid, name: uid === 'a' ? '성원제' : '홍박사', points: 1000, quantity: 0, costBasis: 0, marketValue: 0, profit: 0, realizedProfit: 0, returnPercent: 0, orders: [], revision: 0 });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
function setup(fetcher, storage = new Map()) {
  const elements = new Map(), events = {}, listeners = {}, timers = new Map(); let timerId = 0, confirms = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, hidden: false, disabled: false, value: '1', dataset: {}, attributes: {}, textContent: '', innerHTML: '',
      addEventListener(type, fn) { (listeners[id + ':' + type] ||= []).push(fn); }, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; }, style: { setProperty() {} },
      querySelector() { return element('summary-small'); }, querySelectorAll() { return []; }, focus() {}, showModal() { this.open = true; }, close() { this.open = false; } });
    return elements.get(id);
  };
  const document = { hidden: false, getElementById: element, addEventListener(type, fn) { (events[type] ||= []).push(fn); } };
  const window = { enjoyUser: { uid: 'a' }, isGuest: false,
    getEnjoyIdToken: async () => 'token-' + window.enjoyUser?.uid,
    enjoyConfirm: async () => { confirms++; return true; },
    addEventListener(type, fn) { (events[type] ||= []).push(fn); } };
  vm.runInNewContext(ticketSource + '\n' + source, { window, document, fetch: fetcher, crypto: require('node:crypto').webcrypto, AbortController,
    Date: class extends Date { static now() { return at; } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } });
  const controller = window.enjoyInvestmentPortfolio;
  controller.mount(); controller.render({ selected: 'en-joy', tab: 'holdings', active: true }); controller.updateMarket(market);
  return { controller, window, element, storage, timers, confirms: () => confirms,
    async action(action) { const button = element(action === 'retry' ? 'investment-order-retry' : 'investment-' + action); button.dataset.investmentAction = action;
      for (const fn of listeners['wallet-panel-investment:click'] || []) fn({ target: { closest: () => button } }); await flush(); },
    ticket: window.enjoyInvestmentTicket,
    async ticketAction(action, extra = {}) {
      const button = { dataset: { ticketAction: action, ...extra } };
      for (const fn of listeners['wallet-panel-investment:click'] || []) fn({ target: { closest: () => button } }); await flush();
    },
    input(id, value) { const target = element(id); target.value = value; for (const fn of listeners['wallet-panel-investment:input'] || []) fn({ target }); },
    openOrder(key) { const button = { dataset: { investmentOrder: key } }; for (const fn of listeners['wallet-panel-investment:click'] || []) fn({ target: { closest: () => button } }); },
    escapeReceipt() { let stopped = false; for (const fn of listeners['wallet-panel-investment:keydown'] || []) fn({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } }); return stopped; },
    filter(value) { const button = { dataset: { investmentFilter: value } }; for (const fn of listeners['wallet-panel-investment:click'] || []) fn({ target: { closest: () => button } }); },
    auth(user) { window.enjoyUser = user; for (const fn of events['enjoy-auth-ready'] || []) fn(); }, flush };
}
function server() {
  const accounts = new Map([['a', account('a')], ['b', account('b')]]), receipts = new Map(), calls = [];
  let loseNextResponse = false, orders = 0;
  return { accounts, receipts, calls, count: () => orders, lose() { loseNextResponse = true; },
    async fetch(url, options) {
      const route = new URL(url).pathname;
      if (route === '/orderbook') return {ok:true,json:async()=>({symbol:'en-joy',asOf:market.asOf,price:100,previous:110,asks:[{price:101,quantity:0}],bids:[{price:99,quantity:0}],totalAsk:0,totalBid:0})};
      const uid = options.headers.Authorization.slice(13);
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
  assert.equal(ui.element('investment-buy').disabled, false); assert.equal(ui.element('investment-sell').disabled, false);
  ui.controller.render({ currency: 'KRW' }); assert.match(ui.element('investment-ranking').innerHTML, />2원</);
  assert.equal(s.calls.filter(c => c.route === '/orders').length, 0);
});
test('buy asks with the exact shared quote and refreshes balances, holdings and receipts after server completion', async () => {
  const s = server(), ui = setup(s.fetch); await flush();
  await ui.action('buy');
  assert.equal(ui.confirms(), 0); assert.equal(s.count(), 0);
  assert.equal(ui.element('investment-trade-ticket').open, true);
  ui.input('investment-ticket-quantity', '3');
  await ui.ticketAction('submit');
  assert.equal(ui.confirms(), 1); assert.equal(s.count(), 1);
  const sent = JSON.parse(s.calls.find(c => c.route === '/orders').options.body);
  assert.equal(sent.quantity, 3); assert.equal(sent.expectedPrice, 100); assert.equal(sent.expectedRevision, 12);
  assert.equal(ui.controller.snapshot().points, 700); assert.equal(ui.controller.snapshot().quantity, 3);
  assert.match(ui.element('investment-holdings-panel').innerHTML, /3토큰/);
  assert.match(ui.element('investment-trade-note').textContent, /완료/); assert.equal(ui.storage.size, 0);
});
test('a response lost after execution persists the same request ID across reload and retries without another deduction', async () => {
  const s = server(), storage = new Map(), ui = setup(s.fetch, storage); await flush(); s.lose();
  await ui.action('buy'); ui.input('investment-ticket-quantity', '1'); await ui.ticketAction('submit'); assert.equal(s.count(), 1); assert.equal(storage.size, 1); assert.equal(ui.element('investment-buy').disabled, true);
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
  assert.equal(ui.element('investment-buy').disabled, false);
});
test('server-offline and closed or stale quotes preserve previews without manufacturing zero portfolios', async () => {
  const offline = setup(async () => { throw Error('offline'); }); await flush();
  assert.equal(offline.controller.snapshot(), null); assert.equal(offline.element('investment-total').textContent, '—');
  assert.equal(offline.element('investment-buy').disabled, false);
  const s = server(), ui = setup(s.fetch); await flush(); ui.controller.updateMarket({ ...market, stale: true });
  assert.equal(ui.element('investment-buy').disabled, false);
  ui.controller.updateMarket({ ...market, serverTime: Date.parse('2026-10-27T14:30:00Z') });
  assert.equal(ui.element('investment-buy').disabled, false); assert.match(ui.element('investment-trade-note').textContent, /운영시간/);
});
test('the unopened service preserves account and ranking reads while blocking both purchase and sale', async () => {
  const s = server(); s.accounts.get('a').quantity = 2;
  const ui = setup(s.fetch); await flush();
  ui.controller.updateMarket({ ...market, tradingEnabled: false }); await flush();
  assert.equal(ui.controller.snapshot().quantity, 2);
  assert.match(ui.element('investment-ranking').innerHTML, /200 P/);
  assert.equal(ui.element('investment-buy').disabled, false);
  assert.equal(ui.element('investment-sell').disabled, false);
  await ui.action('buy'); await ui.ticketAction('submit');
  assert.equal(ui.element('investment-ticket-notice').open, true);
  assert.match(ui.element('investment-ticket-notice-title').textContent,/잠겨/);
  await ui.ticketAction('notice-close'); await ui.ticketAction('close');
  await ui.action('sell'); await ui.ticketAction('submit');
  assert.equal(s.count(), 0); assert.equal(ui.confirms(), 0);
});
test('a free token grant is labelled as a grant with the historical per-token price rather than a sale', async () => {
  const s = server(), a = s.accounts.get('a');
  a.quantity = 2; a.costBasis = 246; a.marketValue = 246;
  a.orders = [{ side: 'grant', quantity: 2, total: 246, executedAt: at }];
  const ui = setup(s.fetch); await flush();
  const html = ui.element('investment-holdings-panel').innerHTML;
  assert.match(html, /지급 2토큰/); assert.match(html, /토큰당 123 P/); assert.doesNotMatch(html, /판매 2토큰/);
});


test('home holdings show server quantity, valuation and signed return, convert currency and switch to current price', async () => {
  const s = server(), a = s.accounts.get('a');
  Object.assign(a, {quantity:14,costBasis:1400,marketValue:1120,profit:-280,returnPercent:-20});
  const ui = setup(s.fetch); await flush();
  let html = ui.element('investment-portfolio-list').innerHTML;
  assert.match(html, /data-stock="en-joy"/);
  assert.match(html, /엔조이스튜디오/);
  assert.match(html, /14토큰/);
  assert.match(html, /1,120 P/);
  assert.match(html, /iv-down">-280 P \(-20.00%\)/);
  ui.controller.render({currency:'KRW'});
  html = ui.element('investment-portfolio-list').innerHTML;
  assert.match(html, /11.2원/); assert.match(html, /-2.8원/);
  ui.controller.render({holdingView:'price'});
  html = ui.element('investment-portfolio-list').innerHTML;
  assert.match(html, /<strong>1원<\/strong>/);
  assert.match(html, /14토큰/);
  ui.auth(null);
  html = ui.element('investment-portfolio-list').innerHTML;
  assert.match(html, /로그인/); assert.doesNotMatch(html, /14토큰|11.2원|data-stock/);
});

test('home holdings distinguish no tokens from an unavailable portfolio', async () => {
  const s = server(), ui = setup(s.fetch); await flush();
  assert.match(ui.element('investment-portfolio-list').innerHTML, /보유한 토큰이 없어요/);
  assert.doesNotMatch(ui.element('investment-portfolio-list').innerHTML, /data-stock/);
  const offline = setup(async () => {throw Error('offline');}); await flush();
  assert.match(offline.element('investment-portfolio-list').innerHTML, /offline/);
  assert.doesNotMatch(offline.element('investment-portfolio-list').innerHTML, /보유한 토큰이 없어요/);
});


test('holdings average, principal and total reflect the ledger; calculator simulates without submitting an order', async () => {
  const s = server(), a = s.accounts.get('a');
  Object.assign(a, { quantity: 2, costBasis: 730, marketValue: 508, profit: -222, returnPercent: -30.41 });
  const ui = setup(s.fetch); await flush();
  let html = ui.element('investment-holdings-panel').innerHTML;
  assert.match(html, /1토큰 평균/); assert.match(html, /365 P/); assert.match(html, /3.65원/);
  assert.match(html, /총 금액/); assert.match(html, /508 P/); assert.match(html, /-222 P \(-30.41%\)/);
  assert.match(html, /투자 원금/); assert.match(html, /730 P/);
  assert.doesNotMatch(html, /조건 주문|주식 모으기|수수료|누적 실현수익|최근 내역/);
  await ui.action('calculator');
  ui.input('investment-calculator-price', '254'); ui.input('investment-calculator-quantity', '2');
  assert.match(ui.element('investment-calculator-result').innerHTML, /309.5 P/);
  assert.match(ui.element('investment-calculator-result').innerHTML, /4토큰/);
  assert.equal(s.count(), 0); assert.equal(ui.controller.snapshot().costBasis, 730);
  ui.controller.render({currency: 'KRW'});
  assert.match(ui.element('investment-calculator-result').innerHTML, /3.1원/);
  ui.input('investment-calculator-quantity', '-1');
  assert.match(ui.element('investment-calculator-result').innerHTML, /입력해 주세요/);
  ui.auth(null); assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML, /365|730|508/);
});

test('order filters separate purchases, sales and grants and include cancelled orders only when selected', async () => {
  const s = server();
  s.accounts.get('a').orders = [
    {side: 'buy', quantity: 3, total: 300, executedAt: at},
    {side: 'sell', quantity: 1, total: 100, executedAt: at},
    {side: 'grant', quantity: 2, total: 200, executedAt: at},
    {side: 'buy', quantity: 7, total: 700, executedAt: at, status: 'cancelled'}
  ];
  const ui = setup(s.fetch); await flush();
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML, /구매 7토큰/);
  ui.filter('buy');
  let html = ui.element('investment-holdings-panel').innerHTML;
  assert.match(html, /구매 3토큰/); assert.doesNotMatch(html, /판매 1토큰|지급 2토큰/);
  await ui.action('cancelled');
  assert.match(ui.element('investment-holdings-panel').innerHTML, /구매 7토큰<small>취소<\/small>/);
  ui.filter('sell');
  assert.match(ui.element('investment-holdings-panel').innerHTML, /판매 1토큰/);
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML, /구매 3토큰/);
  ui.filter('all'); assert.match(ui.element('investment-holdings-panel').innerHTML, /토큰당 100 P/);
});

test('no holdings has no invalid average and an opened order can be dismissed without a submission', async () => {
  const s = server(), ui = setup(s.fetch); await flush();
  const html = ui.element('investment-holdings-panel').innerHTML;
  assert.doesNotMatch(html, /NaN|Infinity/); assert.match(html, /아직 보유한 드롭이 없어요/);
  await ui.action('buy'); assert.equal(ui.element('investment-trade-ticket').open, true);
  assert.equal(ui.element('investment-order-controls').hidden, true);
  await ui.ticketAction('close'); assert.equal(ui.element('investment-trade-ticket').open, false);
  assert.equal(ui.confirms(), 0); assert.equal(s.count(), 0);
});


test('receipt lists group by Korean calendar year and display historical unit price, not total or current quote', async () => {
  const s = server(); s.accounts.get('a').orders = [
    {requestId:'old',side:'buy',quantity:3,price:365,total:1095,executedAt:Date.parse('2025-01-02T12:36:00Z')},
    {requestId:'new',side:'grant',quantity:2,total:730,executedAt:Date.parse('2025-12-31T16:00:00Z')}
  ];
  const ui=setup(s.fetch); await flush();
  let html=ui.element('investment-holdings-panel').innerHTML;
  assert.match(html,/2026년/); assert.match(html,/2025년/); assert.ok(html.indexOf('2026년')<html.indexOf('2025년'));
  assert.match(html,/>1.1<\/time>/); assert.match(html,/>1.2<\/time>/);
  assert.match(html,/토큰당 365 P/); assert.doesNotMatch(html,/기준금액|토큰당 1,095|토큰당 100 P/);
  ui.openOrder('old');
  const dialog=ui.element('investment-order-detail'); assert.equal(dialog.open,true); assert.equal(dialog.hidden,false);
  assert.match(dialog.innerHTML,/엔조이스튜디오 구매/); assert.match(dialog.innerHTML,/2025.1.2 21:36/);
  assert.match(dialog.innerHTML,/1토큰당 가격/); assert.match(dialog.innerHTML,/365 P/); assert.match(dialog.innerHTML,/3.65원/);
  assert.match(dialog.innerHTML,/총 구매 금액/); assert.match(dialog.innerHTML,/1,095 P/); assert.match(dialog.innerHTML,/3토큰/);
  assert.doesNotMatch(dialog.innerHTML,/조건 주문|수수료|목표 수익률/);
  ui.controller.updateMarket({...market,quotes:[{id:'en-joy',price:200,change:100,percent:100}]}); await flush();
  assert.match(dialog.innerHTML,/365 P/); assert.match(dialog.innerHTML,/1,095 P/);
  ui.controller.render({currency:'KRW'}); assert.match(dialog.innerHTML,/10.95원/);
  assert.equal(ui.escapeReceipt(),true); assert.equal(dialog.hidden,true); assert.equal(dialog.open,false);
  assert.equal(s.count(),0);
});

test('receipt accordion, grant/sale/cancellation labels and logout respect the actual selected record', async () => {
  const s=server(); s.accounts.get('a').orders=[
    {requestId:'grant',side:'grant',quantity:2,price:365,total:730,executedAt:at},
    {requestId:'sell',side:'sell',quantity:1,price:400,total:400,executedAt:at},
    {requestId:'cancelled',side:'buy',quantity:1,price:500,total:500,executedAt:at,status:'cancelled'}
  ];
  const ui=setup(s.fetch); await flush(); ui.openOrder('grant');
  let dialog=ui.element('investment-order-detail');
  assert.match(dialog.innerHTML,/지급 완료/); assert.match(dialog.innerHTML,/토큰 반영/); assert.doesNotMatch(dialog.innerHTML,/>출금</);
  assert.match(dialog.innerHTML,/지급접수 내역/); assert.match(dialog.innerHTML,/id="investment-receipt-acceptance" hidden/);
  await ui.action('receipt-expand'); assert.doesNotMatch(dialog.innerHTML,/id="investment-receipt-acceptance" hidden/);
  assert.match(dialog.innerHTML,/주문 번호/); await ui.action('receipt-close'); assert.equal(dialog.hidden,true);
  ui.openOrder('sell'); assert.match(dialog.innerHTML,/판매 완료/); assert.match(dialog.innerHTML,/>입금</);
  await ui.action('receipt-close'); await ui.action('cancelled'); ui.openOrder('cancelled');
  assert.match(dialog.innerHTML,/구매 취소/); assert.match(dialog.innerHTML,/미처리/);
  ui.auth(null); assert.equal(dialog.hidden,true); assert.equal(dialog.innerHTML,''); assert.equal(dialog.open,false);
});

test('account and ranking skeletons settle independently and never turn a pending portfolio into empty holdings', async () => {
  const s=server(), replies=new Map();
  Object.assign(s.accounts.get('a'), {quantity:2,costBasis:730,marketValue:508,profit:-222,returnPercent:-30.41});
  const ui=setup((url,options)=>new Promise(resolve=>replies.set(new URL(url).pathname,()=>resolve(s.fetch(url,options)))));
  await flush();
  assert.match(ui.element('investment-total').innerHTML,/iv-skeleton-balance/);
  assert.match(ui.element('investment-account-points').innerHTML,/iv-skeleton-amount/);
  assert.equal(ui.element('investment-account-status').textContent,'불러오는 중');
  assert.match(ui.element('investment-portfolio-list').innerHTML,/iv-loading-stock/);
  assert.match(ui.element('investment-holdings-panel').innerHTML,/iv-loading-order/);
  assert.match(ui.element('investment-ranking').innerHTML,/iv-loading-ranking/);
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML,/아직 주문내역이 없어요|0토큰/);
  assert.equal(ui.element('investment-buy').disabled,false);
  replies.get('/account')(); await flush();
  assert.equal(ui.controller.snapshot().quantity,2);
  assert.equal(ui.element('investment-total').textContent,'508 P');
  assert.equal(ui.element('investment-account-points').textContent,'1,000 P');
  assert.equal(ui.element('investment-account-status').textContent,'연결됨');
  assert.equal(ui.element('investment-holdings-panel').attributes['aria-busy'],'false');
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  assert.equal(ui.element('investment-ranking').attributes['aria-busy'],'true');
  replies.get('/ranking')(); await flush();
  assert.equal(ui.element('investment-ranking').attributes['aria-busy'],'false');
  assert.doesNotMatch(ui.element('investment-ranking').innerHTML,/iv-account-skeleton/);
});

test('ranking failure cannot block a loaded account or trading; account failure does not hide available ranks', async () => {
  const s=server();
  const ui=setup((url,options)=>url.endsWith('/ranking')?Promise.reject(Error('ranking offline')):s.fetch(url,options)); await flush();
  assert.equal(ui.controller.snapshot().uid,'a'); assert.equal(ui.element('investment-buy').disabled,false);
  assert.match(ui.element('investment-ranking').innerHTML,/ranking offline/);
  assert.doesNotMatch(ui.element('investment-ranking').innerHTML,/iv-account-skeleton/);
  const other=setup((url,options)=>url.endsWith('/account')?Promise.reject(Error('account offline')):s.fetch(url,options)); await flush();
  assert.equal(other.controller.snapshot(),null); assert.equal(other.element('investment-buy').disabled,false);
  assert.match(other.element('investment-holdings-panel').innerHTML,/account offline/);
  assert.doesNotMatch(other.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  assert.match(other.element('investment-ranking').innerHTML,/200 P/);
});

test('retry restores initial skeletons, but background refresh keeps known account and rank data visible', async () => {
  const s=server(); let fail=true, release, hold=false;
  const ui=setup((url,options)=>{
    if(fail)return Promise.reject(Error('offline'));
    if(hold&&url.endsWith('/account'))return new Promise(resolve=>{release=()=>resolve(s.fetch(url,options));});
    return s.fetch(url,options);
  }); await flush();
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  fail=false; hold=true; await ui.action('reload');
  assert.match(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  release(); await flush(); assert.equal(ui.controller.snapshot().uid,'a');
  const pending=ui.controller.reload(); await flush();
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  assert.doesNotMatch(ui.element('investment-ranking').innerHTML,/iv-account-skeleton/);
  assert.equal(ui.element('investment-account-points').textContent,'1,000 P');
  release(); await pending;
});

test('unresolved authentication uses skeletons and a confirmed guest uses the login state', async () => {
  const s=server(),ui=setup(s.fetch); await flush();
  ui.window.enjoyAuthResolved=false; ui.auth(null);
  assert.match(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  assert.match(ui.element('investment-ranking').innerHTML,/iv-account-skeleton/);
  ui.window.enjoyAuthResolved=true; ui.auth(null);
  assert.match(ui.element('investment-holdings-panel').innerHTML,/로그인/);
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
});

test('request deadlines stop skeletons and expose retry instead of leaving a perpetual loader',async()=>{
  const ui=setup((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})))));
  await flush();assert.match(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  [...ui.timers.values()].filter(timer=>timer.ms===20000).forEach(timer=>timer.fn());await flush();
  assert.equal(ui.element('investment-holdings-panel').attributes['aria-busy'],'false');
  assert.equal(ui.element('investment-ranking').attributes['aria-busy'],'false');
  assert.doesNotMatch(ui.element('investment-holdings-panel').innerHTML,/iv-account-skeleton/);
  assert.match(ui.element('investment-holdings-panel').innerHTML,/연결이 지연/);
  assert.match(ui.element('investment-holdings-panel').innerHTML,/다시 불러오기/);
  assert.equal(ui.element('investment-buy').disabled,false);
});

test('full-screen order preview starts empty, calculates totals and percentages without changing the account', async () => {
  const s = server(), ui = setup(s.fetch); await flush();
  ui.controller.render({tab:'chart'}); await ui.action('buy');
  assert.equal(ui.element('investment-trade-ticket').open, true);
  assert.equal(ui.element('investment-order-controls').hidden, true);
  assert.equal(ui.ticket.snapshot().quantity, 0);
  assert.equal(ui.element('investment-ticket-total').textContent, '0 P');
  ui.input('investment-ticket-quantity','3');
  assert.equal(ui.element('investment-ticket-total').textContent, '300 P');
  assert.equal(ui.element('investment-ticket-after-average').textContent, '100 P');
  await ui.ticketAction(null,{ticketPercent:'100'});
  assert.equal(ui.ticket.snapshot().quantity, 10);
  assert.equal(ui.element('investment-ticket-total').textContent, '1,000 P');
  assert.equal(s.count(),0); assert.equal(ui.controller.snapshot().points,1000);
  await ui.ticketAction('close'); await ui.action('buy');
  assert.equal(ui.ticket.snapshot().quantity,0,'reopening starts a new blank preview');
});

test('locked final purchase and sale show a notice even with an empty quantity and never confirm or submit',async()=>{
  const s=server(),ui=setup(s.fetch);await flush();ui.controller.updateMarket({...market,tradingEnabled:false});
  for(const side of ['buy','sell']){
    await ui.action(side);assert.equal(ui.element('investment-trade-ticket').open,true);
    await ui.ticketAction('submit');
    assert.equal(ui.element('investment-ticket-notice').open,true);
    assert.match(ui.element('investment-ticket-notice-title').textContent,/거래가 잠겨/);
    await ui.ticketAction('notice-close');await ui.ticketAction('close');
  }
  assert.equal(s.count(),0);assert.equal(ui.confirms(),0);assert.equal(ui.storage.size,0);
});

test('order preview clears on account changes and a hidden investment screen',async()=>{
  const s=server(),ui=setup(s.fetch);await flush();await ui.action('buy');ui.input('investment-ticket-quantity','4');
  ui.auth({uid:'b'});await flush();assert.equal(ui.element('investment-trade-ticket').open,false);assert.equal(ui.ticket.snapshot().side,null);
  await ui.action('buy');ui.controller.setActive(false);
  assert.equal(ui.element('investment-trade-ticket').open,false);assert.equal(s.count(),0);
});

test('preview converts won price input to integer points and refuses unavailable limit execution',async()=>{
  const s=server(),ui=setup(s.fetch);await flush();ui.controller.render({currency:'KRW'});await ui.action('buy');
  ui.input('investment-ticket-price','1.23');ui.input('investment-ticket-quantity','2');
  assert.equal(ui.ticket.snapshot().price,123);assert.equal(ui.element('investment-ticket-total').textContent,'2.46원');
  await ui.ticketAction('submit');assert.match(ui.element('investment-ticket-notice-title').textContent,/현재가/);assert.equal(s.count(),0);
});

test('relocking while the confirmation is open cannot send an order or save a pending receipt',async()=>{
  const s=server(),ui=setup(s.fetch);await flush();let confirm;
  ui.window.enjoyConfirm=()=>new Promise(resolve=>{confirm=resolve;});
  await ui.action('buy');ui.input('investment-ticket-quantity','1');await ui.ticketAction('submit');
  ui.controller.updateMarket({...market,tradingEnabled:false});confirm(true);await flush();
  assert.equal(s.count(),0);assert.equal(ui.storage.size,0);
});

test('lost order responses keep the same receipt retry visible inside the full-screen form',async()=>{
  const s=server(),ui=setup(s.fetch);await flush();s.lose();
  await ui.action('buy');ui.input('investment-ticket-quantity','1');await ui.ticketAction('submit');
  assert.equal(ui.element('investment-trade-ticket').open,true);
  assert.equal(ui.element('investment-ticket-retry').hidden,false);
  assert.match(ui.element('investment-ticket-status').textContent,/같은 주문/);
  await ui.ticketAction('retry');assert.equal(s.count(),1);assert.equal(ui.storage.size,0);
  assert.equal(ui.element('investment-trade-ticket').open,false);
});

test('closed hours and expired or stale markets keep final preview submission locked',async()=>{
  for(const update of [{stale:true},{serverTime:Date.parse('2026-10-27T14:30:00Z')},{nextUpdateAt:at-1}]){
    const s=server(),ui=setup(s.fetch);await flush();ui.controller.updateMarket({...market,...update});
    await ui.action('buy');ui.input('investment-ticket-quantity','1');await ui.ticketAction('submit');
    assert.match(ui.element('investment-ticket-notice-title').textContent,/잠겨/);assert.equal(s.count(),0);assert.equal(ui.confirms(),0);
  }
});
