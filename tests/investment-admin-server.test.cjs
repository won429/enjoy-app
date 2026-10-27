const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const crypto = require('node:crypto');
const { Miniflare, convertV4MiniflareOptions } = require('../cloudflare-worker/node_modules/miniflare');
const esbuild = require('../cloudflare-worker/node_modules/esbuild');

test('any Google login can manage the index; signed identity, atomic writes, audit and hourly stock separation remain enforced', { timeout: 60000 }, async () => {
  const origin = 'https://won429.github.io', project = 'enjoy-meeting-account', email = 'admin@example.test';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  let now = Date.parse('2026-10-22T12:15:00Z'), keyReads = 0;
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-admin-'));
  const entry = path.resolve(__dirname, '../cloudflare-worker/investment-worker.js');
  const bundle = await esbuild.build({ stdin: { contents: `import worker,{InvestmentMarket} from ${JSON.stringify(entry)};
    export class TestMarket extends InvestmentMarket {
      randomSample(){return .5;}
      writeState(state){super.writeState(state);if(state.indexUpdatedAt===Date.now()&&state.quotes[0].price===777&&this.state?.quotes[0].price!==777&&!this.failed){this.failed=true;throw Error('injected admin commit failure');}}
      async fetch(request){if(new URL(request.url).pathname==='/__legacy'){const legacy={...this.state,quotes:this.state.quotes.map(q=>q.id==='enjoy'?{...q,previous:799}:q)};delete legacy.indexMode;this.writeState(legacy);return Response.json({ok:true});}if(new URL(request.url).pathname==='/__old_model'){this.writeState({...this.state,priceModel:'index-vlog-random-v1',lastPricedIndex:this.state.quotes[0].price});return Response.json({ok:true});}return super.fetch(request);}
    }
    export default {...worker,async fetch(request,env,ctx){const p=new URL(request.url).pathname;if(p==='/__tick'){await worker.scheduled({scheduledTime:Date.now()},env,ctx);return Response.json({ok:true});}if(['/__legacy','/__old_model'].includes(p))return env.INVESTMENT_MARKET.get(env.INVESTMENT_MARKET.idFromName('enjoy-market-v1')).fetch('https://market.internal'+p);return worker.fetch(request,env,ctx);}};`, resolveDir: path.dirname(entry) }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const options = () => convertV4MiniflareOptions({ modules: true, script: `Date.now=()=>${now};\n` + bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-19', resourcePersistencePath: persist,
    durableObjects: { INVESTMENT_MARKET: { className: 'TestMarket', useSQLite: true } },
    bindings: { ALLOWED_ORIGINS: origin, FIREBASE_PROJECT_ID: project, MAX_HOURLY_BPS: '300' },
    outboundService: request => {
      if(new URL(request.url).hostname==='raw.githubusercontent.com')return new Response("window.ENJOY_VLOG_PROGRAMS={a:{episodes:[{url:'https://youtu.be/21uUicVMzqg'}]}};");
      assert.equal(new URL(request.url).hostname, 'www.googleapis.com', 'no balances or Firestore calls');
      keyReads++;
      return Response.json({ keys: [jwk] }, { headers: { 'Cache-Control': 'public,max-age=3600' } });
    }
  });
  const token = (overrides = {}, headerOverrides = {}) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, ...headerOverrides })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ aud: project, iss: 'https://securetoken.google.com/' + project, sub: 'admin-uid', email, email_verified: true,
      iat: now / 1000 - 10, exp: now / 1000 + 3600, auth_time: now / 1000 - 60, firebase: { sign_in_provider: 'google.com' }, ...overrides })).toString('base64url');
    return header + '.' + claims + '.' + crypto.sign('RSA-SHA256', Buffer.from(header + '.' + claims), privateKey).toString('base64url');
  };
  let mf = new Miniflare(options());
  const get = (url, opts = {}) => mf.dispatchFetch('https://test.invalid' + url, { ...opts, headers: { Origin: origin, ...opts.headers } });
  const overview = () => get('/admin/overview', { headers: { Authorization: 'Bearer ' + token() } });
  const input = (price, expectedRevision, note = '일일 지수 설정') => ({ price, expectedRevision, note, requestId: crypto.randomUUID() });
  const save = (body, claims = {}) => get('/admin/index', { method: 'POST', headers: { Authorization: 'Bearer ' + token(claims), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await overview()).status, 200);
    assert.equal((await get('/admin/overview')).status, 403);
    for (const account of [{ email: 'member@example.test' }, { email_verified: false }, { email: undefined }]) {
      assert.equal((await get('/admin/overview', { headers: { Authorization: 'Bearer ' + token(account) } })).status, 200);
    }
    for (const bad of [{ aud: 'wrong-project' }, { exp: now / 1000 - 1 }, { firebase: { sign_in_provider: 'anonymous' } }, { auth_time: now / 1000 + 1 }]) {
      assert.equal((await get('/admin/overview', { headers: { Authorization: 'Bearer ' + token(bad) } })).status, 403);
    }
    const genuine = token(), parts = genuine.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    assert.equal((await get('/admin/overview', { headers: { Authorization: 'Bearer ' + parts.join('.') } })).status, 403);
    assert.equal((await get('/admin/overview', { headers: { Authorization: 'Bearer ' + token({}, { alg: 'none' }) } })).status, 403);
    assert.equal((await get('/admin/overview', { headers: { Origin: 'https://evil.invalid', Authorization: 'Bearer ' + token() } })).status, 403);
    const preflight = await get('/admin/index', { method: 'OPTIONS' });
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    const start = await (await overview()).json();
    assert.equal(start.history.length, 0); assert.equal(start.market.indexMode, 'manual');
    const badPrice = await save(input(0, start.market.revision)); assert.equal(badPrice.status, 400);
    assert.equal((await save(input(1.5, start.market.revision))).status, 400);
    assert.equal((await save(input(1000000001, start.market.revision))).status, 400);
    assert.equal((await save(input(125, start.market.revision, 'x'.repeat(201)))).status, 400);
    const firstInput = input(125, start.market.revision, '<img src=x onerror=alert(1)>');
    let response = await save(firstInput); assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    let data = await response.json();
    assert.equal(data.market.quotes[0].price, 125); assert.equal(data.market.quotes[0].percent, 25);
    assert.equal(data.market.quotes[1].price, start.market.quotes[1].price); assert.equal(data.baseline, 100);
    assert.equal(data.history.length, 1); assert.equal(data.history[0].note, firstInput.note);
    const replay = await (await save(firstInput)).json(); assert.equal(replay.duplicate, true); assert.equal(replay.history.length, 1);
    assert.equal((await save({ ...firstInput, price: 999 })).status, 409);
    assert.equal((await save(input(130, start.market.revision))).status, 409);
    data = await (await save(input(130, data.market.revision))).json();
    assert.equal(data.baseline, 100); assert.equal(data.market.quotes[0].percent, 30, 'same-day edits retain the daily baseline');
    const raced = await Promise.all([save(input(131, data.market.revision)), save(input(132, data.market.revision))]);
    assert.deepEqual(raced.map(r => r.status).sort(), [200, 409]);
    data = await (await overview()).json(); const preserved = data.market.quotes[0].price;
    assert.equal(data.history.length, 3);
    const oldReplay = await (await save(firstInput)).json(); assert.equal(oldReplay.market.quotes[0].price, preserved, 'retry does not revert later writes');
    const beforeFailure = data.market.revision, failedInput = input(777, beforeFailure);
    assert.equal((await save(failedInput)).status, 503);
    data = await (await overview()).json(); assert.equal(data.market.revision, beforeFailure); assert.equal(data.history.length, 3);
    data = await (await save(failedInput)).json(); assert.equal(data.market.quotes[0].price, 777); assert.equal(data.history.length, 4);
    const chart = await (await get('/history?symbol=enjoy&period=day')).json(); assert.equal(chart.points.at(-1).close, 777);
    assert.equal((await get('/orders', { method: 'POST', body: '{}' })).status, 423);
    const pub = await (await get('/market')).json(); assert.equal(pub.quotes[0].price, 777); assert.equal(pub.tradingEnabled, false); assert.equal(pub.history, undefined);
    const beforeModelMigration=structuredClone(data);
    await get('/__old_model');await mf.dispose(); mf = new Miniflare(options());
    data = await (await overview()).json(); assert.equal(data.market.quotes[0].price, 777); assert.equal(data.history.length, 4);
    assert.equal(data.market.priceModel,'daily-index-vlog-random-v2');assert.equal(data.market.indexInfluencePeriod,'kst-day');
    assert.equal(data.market.revision,beforeModelMigration.market.revision+1);
    assert.deepEqual(data.market.quotes,beforeModelMigration.market.quotes,'model migration preserves quotes and daily comparison');
    assert.deepEqual(data.history,beforeModelMigration.history,'model migration preserves admin audit');
    assert.deepEqual((await (await get('/history?symbol=enjoy&period=day')).json()).points,chart.points,'model migration preserves chart history');
    now = Date.parse('2026-10-22T13:00:01Z'); await mf.dispose(); mf = new Miniflare(options());
    assert.equal((await save(input(150, data.market.revision))).status, 503, 'stale clock must not write a price into the wrong hour');
    assert.equal((await get('/__tick')).status,200);
    data = await (await overview()).json(); assert.equal(data.market.quotes[0].price, 777); assert.equal(data.market.quotes[0].previous, 100);
    assert.equal(data.vlog.lastDrivers.components.index,60,'manual index changes affect the next hourly stock calculation');
    const afterFirstTick=structuredClone(data);
    await get('/__tick');assert.equal((await (await overview()).json()).market.revision,data.market.revision,'same-hour cron cannot apply the daily influence twice');
    now = Date.parse('2026-10-22T14:00:01Z');await mf.dispose();mf=new Miniflare(options());await get('/__tick');
    data=await (await overview()).json();assert.equal(data.vlog.lastDrivers.components.index,60,'same daily index influences the following hour after a restart');
    assert.ok(data.market.quotes[1].price>=afterFirstTick.market.quotes[1].price);
    now = Date.parse('2026-10-22T15:00:01Z'); await mf.dispose(); mf = new Miniflare(options()); assert.equal((await get('/__tick')).status,200);
    data = await (await overview()).json(); assert.equal(data.market.quotes[0].price, 777); assert.equal(data.market.quotes[0].percent, 0,JSON.stringify(data)); assert.equal(data.baseline, 777);
    assert.equal(data.vlog.lastDrivers.components.index,0,'midnight stock pricing uses the new daily baseline immediately');
    data = await (await save(input(800, data.market.revision))).json();
    assert.equal(data.market.quotes[0].previous, 777); assert.equal(data.baseline, 777);
    const beforeMigration = structuredClone(data);
    await get('/__legacy'); await mf.dispose(); mf = new Miniflare(options());
    data = await (await overview()).json();
    assert.equal(data.market.quotes[0].price,800,'legacy migration preserves the actual price');
    assert.equal(data.market.quotes[0].previous,777,'legacy hourly comparison becomes prior-day comparison');
    assert.deepEqual(data.market.quotes[1],beforeMigration.market.quotes[1]);
    assert.deepEqual(data.history,beforeMigration.history,'migration does not fabricate manual price edits');
    const ordinaryUser = { sub: 'ordinary-member', email: 'ordinary-member@example.test' };
    const ordinarySave = await save(input(790, data.market.revision), ordinaryUser);
    assert.equal(ordinarySave.status,200,'a normal Google account can save without an email allowlist');
    data = await ordinarySave.json(); assert.equal(data.market.quotes[0].price,790);
    assert.equal((await get('/admin/index',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input(900,data.market.revision))})).status,403,'sign-in is still required');
    for(const time of ['2026-10-22T16:00:01Z','2026-10-22T17:00:01Z']){
      now=Date.parse(time);await mf.dispose();mf=new Miniflare(options());await get('/__tick');
      data=await (await overview()).json();
      assert.ok(Math.abs(data.vlog.lastDrivers.components.index-(790-777)/777*10000*.2)<1e-9,'next-day settings use yesterday close throughout the day');
      assert.equal(data.market.quotes[0].price,790);assert.equal(data.market.quotes[0].previous,777);
    }
    assert.ok(keyReads > 0);
  } finally { await mf.dispose(); fs.rmSync(persist, { recursive: true, force: true }); }
});
