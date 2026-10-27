const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Miniflare, convertV4MiniflareOptions } = require('../cloudflare-worker/node_modules/miniflare');
const esbuild = require('../cloudflare-worker/node_modules/esbuild');
test('authenticated investment API crosses the private RPC binding and commits points, holdings and receipts together', { timeout: 90000 }, async () => {
  const origin = 'https://enjoy-app.pages.dev', project = 'enjoy-meeting-account', now = Date.parse('2026-10-27T03:15:00Z');
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'ledger-test', alg: 'RS256', use: 'sig' };
  const secret = { project_id: project, client_email: 'test@example.test', private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const base = `projects/${project}/databases/(default)/documents/`, docs = new Map(); let version = 0, commits = 0;
  const enc = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { integerValue: String(v) } :
    typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, n]) => [k, enc(n)])) } };
  const seed = (p, fields) => docs.set(p, { name: base + p, fields, updateTime: new Date(now + ++version).toISOString() });
  seed('members/a', enc({ name: '성원제', points: 1000 }).mapValue.fields);
  seed('members/b', enc({ name: '홍박사', points: 9000 }).mapValue.fields);
  const outboundService = async request => {
    const url = new URL(request.url);
    if (url.hostname === 'www.googleapis.com') return Response.json({ keys: [jwk] });
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'server-access', expires_in: 3600 });
    assert.equal(url.hostname, 'firestore.googleapis.com');
    assert.equal(request.headers.get('Authorization'), 'Bearer server-access', 'Firestore uses only the existing server credential');
    const p = decodeURIComponent(url.pathname).split('/documents')[1] || '';
    if (p.split('/').some(segment => /^__.*__$/.test(segment))) return Response.json({ error: { status: 'INVALID_ARGUMENT' } }, { status: 400 });
    if (p === ':commit') {
      const body = await request.json();
      for (const write of body.writes) {
        const key = write.update.name.slice(base.length), old = docs.get(key);
        if (write.currentDocument?.exists === false && old || write.currentDocument?.updateTime && old?.updateTime !== write.currentDocument.updateTime) {
          return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
        }
      }
      for (const write of body.writes) {
        const key = write.update.name.slice(base.length), old = docs.get(key);
        seed(key, write.updateMask ? { ...old.fields, ...write.update.fields } : write.update.fields);
      }
      commits++; return Response.json({ commitTime: new Date(now).toISOString() });
    }
    if (p.endsWith(':runQuery')) {
      const body = await request.json(), query = body.structuredQuery;
      const collection = p.slice(0, -9).replace(/^\//, '') + (p === ':runQuery' ? '' : '/') + query.from[0].collectionId;
      let rows = [...docs.entries()].filter(([k]) => k.startsWith(collection + '/') && k.split('/').length === collection.split('/').length + 1).map(([, v]) => v);
      if (query.orderBy) rows.sort((a, b) => Number(b.fields[query.orderBy[0].field.fieldPath].integerValue) - Number(a.fields[query.orderBy[0].field.fieldPath].integerValue));
      if (query.limit) rows = rows.slice(0, query.limit);
      return Response.json(rows.map(document => ({ document })));
    }
    const doc = docs.get(p.replace(/^\//, ''));
    return doc ? Response.json(doc) : Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
  };
  const dir = path.resolve(__dirname, '../cloudflare-worker');
  const bundle = await esbuild.build({ stdin: { contents: `export { default, InvestmentMarket } from ${JSON.stringify(path.join(dir, 'investment-worker.js'))}; export { InvestmentLedger } from ${JSON.stringify(path.join(dir, 'investment-ledger.js'))};`, resolveDir: dir },
    bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-ledger-test-'));
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'investment', modules: true, script: `Date.now=()=>${now};\n` + bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-19', resourcePersistencePath: persist,
    durableObjects: { INVESTMENT_MARKET: { className: 'InvestmentMarket', useSQLite: true } },
    serviceBindings: { INVESTMENT_LEDGER: { name: 'investment', entrypoint: 'InvestmentLedger' } },
    bindings: { ALLOWED_ORIGINS: origin, FIREBASE_PROJECT_ID: project, FIREBASE_SERVICE_ACCOUNT: JSON.stringify(secret), TRADING_ENABLED: 'true' }, outboundService }));
  const token = (uid = 'a') => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ aud: project, iss: 'https://securetoken.google.com/' + project, sub: uid,
      iat: now / 1000 - 10, auth_time: now / 1000 - 10, exp: now / 1000 + 3600, firebase: { sign_in_provider: 'google.com' } })).toString('base64url');
    return header + '.' + payload + '.' + crypto.sign('RSA-SHA256', Buffer.from(header + '.' + payload), pair.privateKey).toString('base64url');
  };
  const get = (p, init = {}) => mf.dispatchFetch('https://investment.test' + p, { ...init, headers: { Origin: origin, Authorization: 'Bearer ' + token(), ...init.headers } });
  try {
    assert.equal((await (await get('/health?check=ledger')).json()).ledgerReady, true);
    assert.equal((await get('/account', { headers: { Authorization: '' } })).status, 401);
    assert.equal((await get('/ranking', { headers: { Authorization: 'Bearer not-a-token' } })).status, 401);
    assert.equal((await get('/account', { headers: { Origin: 'https://evil.test' } })).status, 403);
    let a = await (await get('/account')).json(); assert.equal(a.uid, 'a'); assert.equal(a.points, 1000); assert.equal(a.quantity, 0);
    const market = await (await get('/market')).json(); assert.equal(market.tradingEnabled, true);
    const input = { requestId: crypto.randomUUID(), uid: 'b', symbol: 'en-joy', side: 'buy', quantity: 2,
      expectedPrice: market.quotes[1].price, expectedRevision: market.revision, expiresAt: now + 60000 };
    const post = body => get('/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let result = await post(input); assert.equal(result.status, 200); result = await result.json(); assert.equal(result.order.uid, 'a', 'caller cannot impersonate body UID');
    assert.equal((await (await post(input)).json()).duplicate, true); assert.equal(commits, 1);
    a = await (await get('/account')).json(); assert.equal(a.points, 800); assert.equal(a.quantity, 2); assert.equal(a.orders.length, 1);
    assert.equal(docs.get('members/b').fields.points.integerValue, '9000');
    const rank = await (await get('/ranking')).json(); assert.deepEqual(rank.rows.map(r => [r.uid, r.rank, r.investedPoints]), [['a', 1, 200], ['b', 2, 0]]);
    assert.equal((await post({ ...input, requestId: crypto.randomUUID(), expectedPrice: 1 })).status, 409); assert.equal(commits, 1);
    assert.equal((await get('/orders', { method: 'POST', headers: { Origin: '' }, body: '{}' })).status, 403);
  } finally { await mf.dispose(); fs.rmSync(persist, { recursive: true, force: true }); }
});
