const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const env = { SERPER_API_KEY: 'fixture-serper-private', GEMINI_API_KEY: 'fixture-google-must-not-leave', EXAONE_API_KEY: 'fixture-exaone-must-not-leave' };
const request = async signal => (await import('../cloudflare-worker/veron-serper.js')).serperSearch('공개 검색어', env, signal || new AbortController().signal);
test('Serper gets only its own secret and public query through its fixed endpoint', async () => {
    let calls = 0;
    global.fetch = async (url, options) => {
        calls++; assert.equal(url, 'https://google.serper.dev/search'); assert.equal(options.redirect, 'manual');
        assert.equal(options.headers['X-API-KEY'], env.SERPER_API_KEY);
        assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers['x-goog-api-key'], undefined);
        assert.doesNotMatch(options.body, /fixture-|API_KEY/);
        return Response.json({ organic: [{ title: '<b>공식</b>', link: 'https://example.org/official', snippet: '<i>검색 내용</i>' }, { title: 'duplicate', link: 'https://example.org/official' }, { link: 'javascript:alert(1)' }, { link: 'https://localhost/private' }, { link: 'https://127.0.0.1/private' }, { link: 'https://name:password@example.org/private' }] });
    };
    const result = await request(); assert.equal(calls, 1); assert.equal(result.grounding.sources.length, 1);
    assert.match(result.text, /검색 내용/); assert.doesNotMatch(result.text, /<b>|javascript|password|127.0.0.1/);
    assert.deepEqual(result.metadata.webSearchQueries, ['공개 검색어']);
});
test('Serper missing/empty/unsafe source results never become a searched answer', async () => {
    for (const body of [{}, { organic: [] }, { organic: [{ link: 'http://example.org' }] }]) {
        global.fetch = async () => Response.json(body);
        await assert.rejects(request(), error => ['exaone_search_invalid_response', 'exaone_search_empty'].includes(error.code));
    }
});
test('Serper credit exhaustion is reported without retrying, provider fallback or secret disclosure', async () => {
    let calls = 0;
    global.fetch = async () => { calls++; return Response.json({ message: 'Not enough credits PRIVATE_UPSTREAM_DETAILS' }, { status: 403 }); };
    await assert.rejects(request(), error => error.code === 'exaone_search_rate_limited' && !/PRIVATE|fixture/.test(error.message));
    assert.equal(calls, 1);
});
test('cancelling Serper search stops its HTTP request without retrying', async () => {
    const controller = new AbortController(); let calls = 0;
    global.fetch = async (url, options) => {
        calls++; controller.abort(new DOMException('Aborted', 'AbortError')); options.signal.throwIfAborted();
    };
    await assert.rejects(request(controller.signal), { name: 'AbortError' }); assert.equal(calls, 1);
});
test('a stalled Serper request exposes a bounded timeout and never invokes another provider', async t => {
    const keepAlive = setInterval(() => {}, 1000); t.after(() => clearInterval(keepAlive));
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    t.mock.method(AbortSignal, 'timeout', ms => timeout(ms === 18000 ? 20 : ms));
    let calls = 0;
    global.fetch = async (url, options) => { calls++; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })); };
    await assert.rejects(request(), { code: 'exaone_search_timeout' }); assert.equal(calls, 1);
});

test('Serper redirects are rejected without forwarding the secret to another host', async () => {
    let calls = 0;
    global.fetch = async (url, options) => {
        calls++; assert.equal(url, 'https://google.serper.dev/search'); assert.equal(options.redirect, 'manual');
        return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/search' } });
    };
    await assert.rejects(request(), { code: 'exaone_search_unavailable' }); assert.equal(calls, 1);
});
