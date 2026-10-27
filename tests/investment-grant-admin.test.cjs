const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../investment-grant-admin.js'), 'utf8');
const at = Date.parse('2026-10-27T03:15:00Z');
const gift = { campaignId: 'member-two-token-gift-v1', status: 'pending', quantityPerMember: 2, price: 123, quoteRevision: 12,
  serverTime: at, recipientKey: 'a'.repeat(64), totalQuantity: 4,
  recipients: [{ uid: 'a', name: '관리자', quantity: 2 }, { uid: 'b', name: '<img src=x>', quantity: 2 }] };
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
function setup({ confirm = true, canGrant = true, fetcher } = {}) {
  const elements = new Map(), listeners = []; let reloads = 0, confirms = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, hidden: false, disabled: false, dataset: {}, innerHTML: '', textContent: '',
      addEventListener(type, fn) { if (type === 'click') listeners.push(fn); } });
    return elements.get(id);
  };
  const calls = [], win = { enjoyUser: { uid: 'a' }, getEnjoyIdToken: async () => 'admin-test-token',
    enjoyConfirm: async () => { confirms++; return confirm; }, enjoyInvestmentPortfolio: { async reload() { reloads++; } } };
  vm.runInNewContext(source, { window: win, document: { getElementById: element }, AbortController,
    Date: class extends Date { static now() { return at; } }, setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher ? fetcher(url, options) : { ok: true, json: async () => options.method === 'GET' ? structuredClone(gift) : { ...structuredClone(gift), status: 'completed', executedAt: at } }; } });
  const controller = win.enjoyInvestmentGrantAdmin;
  controller.mount(); controller.render({ uid: 'a', canGrant });
  return { element, calls, win, confirms: () => confirms, reloads: () => reloads,
    async click(action) { const b = element(action === 'preview' ? 'investment-grant-preview' : 'investment-grant-execute'); b.dataset.investmentGrant = action;
      for (const fn of listeners) fn({ target: { closest: () => b } }); await flush(); },
    render: value => controller.render(value) };
}
test('mounting the feature never grants or fetches; ordinary members cannot invoke the administrator action', async () => {
  const ui = setup({ canGrant: false }); assert.equal(ui.calls.length, 0); assert.equal(ui.element('investment-grant-admin').hidden, true);
  await ui.click('preview'); await ui.click('execute'); assert.equal(ui.calls.length, 0);
});
test('administrator preview is read-only, escapes names and shows the fixed two-token basis before explicit confirmation', async () => {
  const ui = setup({ confirm: false }); await ui.click('preview');
  assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].options.method, 'GET');
  assert.match(ui.element('investment-grant-details').innerHTML, /123 P/);
  assert.match(ui.element('investment-grant-details').innerHTML, /&lt;img src=x&gt;/);
  assert.doesNotMatch(ui.element('investment-grant-details').innerHTML, /<img/);
  await ui.click('execute'); assert.equal(ui.confirms(), 1); assert.equal(ui.calls.length, 1);
});
test('confirmed grant uses the preview price and cohort, then reloads holdings and prevents another issuance', async () => {
  const ui = setup(); await ui.click('preview'); await ui.click('execute');
  const request = ui.calls[1], input = JSON.parse(request.options.body);
  assert.equal(request.options.method, 'POST'); assert.equal(request.options.headers.Authorization, 'Bearer admin-test-token');
  assert.equal(input.expectedPrice, 123); assert.equal(input.expectedRevision, 12); assert.equal(input.recipientKey, gift.recipientKey);
  assert.equal(input.campaignId, gift.campaignId); assert.equal(input.quantity, undefined); assert.equal(ui.reloads(), 1);
  assert.match(ui.element('investment-grant-status').textContent, /지급 완료/);
  await ui.click('execute'); assert.equal(ui.calls.length, 2);
});
test('an uncertain response requires a result lookup; a completed campaign is displayed without another POST', async () => {
  let done = false;
  const ui = setup({ fetcher: async (_, o) => {
    if (o.method === 'POST') { done = true; throw Error('Response lost'); }
    return { ok: true, json: async () => done ? { ...gift, status: 'completed', executedAt: at } : structuredClone(gift) };
  } });
  await ui.click('preview'); await ui.click('execute'); assert.match(ui.element('investment-grant-status').textContent, /다시 확인/);
  await ui.click('preview'); assert.match(ui.element('investment-grant-status').textContent, /지급 완료/);
  await ui.click('execute'); assert.equal(ui.calls.filter(c => c.options.method === 'POST').length, 1);
});
test('a delayed administrator response is discarded after switching to another member', async () => {
  let resolve;
  const ui = setup({ fetcher: async () => new Promise(r => { resolve = r; }) });
  await ui.click('preview'); ui.win.enjoyUser = { uid: 'b' }; ui.render({ uid: 'b', canGrant: false });
  resolve({ ok: true, json: async () => gift }); await flush();
  assert.equal(ui.element('investment-grant-admin').hidden, true);
  assert.equal(ui.calls.filter(c => c.options.method === 'POST').length, 0);
});
