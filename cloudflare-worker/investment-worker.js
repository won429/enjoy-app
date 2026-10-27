import { DurableObject } from 'cloudflare:workers';
import { HOUR_MS, UPDATE_MS, DAY_MS, SYMBOLS, createMarket, advanceMarket, marketView, historyWindow, dayAt, tickAt, migrateMarketInterval, closedOrderbook, configuredMaxHourlyBps, STOCK_PRICE_MODEL, QUOTE_COMPARISON } from './investment-market.js';
import { verifyInvestmentAdmin } from './investment-auth.js';
import { extractVlogCatalog, validVideoId, INFLUENCE_WEIGHTS } from './investment-vlog.js';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
function originAllowed(origin, env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(origin) || /^https:\/\/[a-f0-9]+\.enjoy-app\.pages\.dev$/.test(origin);
}
async function smallBody(request, maxBytes = 4096) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && !originAllowed(origin, env)) return json({ error: 'Origin not allowed' }, 403);
    let response;
    if (request.method === 'OPTIONS') {
      response = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' } });
    } else if (url.pathname === '/health' && request.method === 'GET') {
      response = json({ ok: true, service: 'enjoy-investment', version: 10, updateIntervalMs: UPDATE_MS, tradingEnabled: env.TRADING_ENABLED === 'true' && !!env.INVESTMENT_LEDGER, ledgerReady: env.INVESTMENT_LEDGER ? await env.INVESTMENT_LEDGER.ready(url.searchParams.get('check') === 'ledger').catch(() => false) : false, indexMode: 'manual', stockInfluenceWeights: INFLUENCE_WEIGHTS, indexInfluencePeriod: 'kst-day', quoteComparison: QUOTE_COMPARISON,
        maxHourlyBps: configuredMaxHourlyBps(env), priceModel: STOCK_PRICE_MODEL, randomRangeBps: configuredMaxHourlyBps(env) });
    } else if (['/account', '/ranking', '/orders', '/admin/grants'].includes(url.pathname)) {
      try {
        if (!origin) response = json({ error: '허용된 사이트에서 이용해 주세요.' }, 403);
        else if (!(url.pathname === '/admin/grants' ? ['GET', 'POST'].includes(request.method) : request.method === (url.pathname === '/orders' ? 'POST' : 'GET'))) response = json({ error: 'Method not allowed' }, 405);
        else if (!env.INVESTMENT_LEDGER || !env.INVESTMENT_MARKET) response = json({ error: '투자 기록 서버를 준비 중이에요.' }, url.pathname === '/orders' ? 423 : 503);
        else {
          const authorization = request.headers.get('Authorization') || '';
          const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
          if (!await verifyInvestmentAdmin(token, env)) response = json({ error: '로그인을 다시 확인해 주세요.', code: 'login-required' }, 401);
          else {
            let input = null;
            if (request.method === 'POST') {
              if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Object.assign(new Error('JSON required'), { status: 415 });
              const raw = await smallBody(request);
              if (raw === null) throw Object.assign(new Error('요청이 너무 커요.'), { status: 413 });
              try { input = JSON.parse(raw); } catch (_) { throw Object.assign(new Error('주문 내용을 확인해 주세요.'), { status: 400 }); }
            }
            const id = env.INVESTMENT_MARKET.idFromName('enjoy-market-v1');
            const marketResponse = await env.INVESTMENT_MARKET.get(id).fetch('https://market.internal/market');
            const market = await marketResponse.json(), price = market.quotes?.find(q => q.id === 'en-joy')?.price;
            if (!marketResponse.ok || !Number.isSafeInteger(price)) throw new Error('Market unavailable');
            const quote = { price, revision: market.revision, asOf: market.asOf, nextUpdateAt: market.nextUpdateAt,
              stale: market.stale, enabled: env.TRADING_ENABLED === 'true' };
            const result = await env.INVESTMENT_LEDGER.request(token,
              url.pathname === '/admin/grants' ? request.method === 'POST' ? 'grant' : 'grant-preview' :
                url.pathname === '/orders' ? 'order' : url.pathname === '/account' ? 'account' : 'ranking', input, quote);
            response = json(result.ok ? result.data : { error: result.error, code: result.code }, result.ok ? 200 : result.status);
          }
        }
      } catch (error) { response = json({ error: error.status ? error.message : '투자 기록 서버 연결이 지연되고 있어요.', code: 'storage-unavailable' }, error.status || 503); }
    } else if (url.pathname === '/activity/click' && request.method === 'POST') {
      try {
        if (!origin) response = json({ error: 'Origin required' }, 403);
        else {
          const auth = request.headers.get('Authorization') || '';
          const member = auth.startsWith('Bearer ') ? await verifyInvestmentAdmin(auth.slice(7), env) : null;
          if (auth && !member) response = json({ error: '로그인을 다시 확인해주세요.' }, 403);
          else {
            const raw = await smallBody(request);
            let input; try { input = raw === null ? null : JSON.parse(raw); } catch (_) {}
            if (!input || !validVideoId(input.videoId) || !['latest', 'episode'].includes(input.source)) response = json({ error: 'Invalid video click' }, 400);
            else {
              const bucket = tickAt(Date.now());
              const identity = member ? 'uid:' + member.uid : 'guest:' + (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + (request.headers.get('User-Agent') || '').slice(0, 512);
              const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bucket + ':' + identity));
              const visitor = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
              const id = env.INVESTMENT_MARKET.idFromName('enjoy-market-v1');
              response = await env.INVESTMENT_MARKET.get(id).fetch('https://market.internal/activity/click', { method: 'POST', body: JSON.stringify({ ...input, visitor, bucket }) });
            }
          }
        }
      } catch (_) { response = json({ error: '영상 클릭 집계가 지연되고 있어요' }, 503); }
    } else if (url.pathname.startsWith('/admin/')) {
      try {
        if (!['/admin/overview', '/admin/index'].includes(url.pathname)) response = json({ error: 'Not found' }, 404);
        else if ((url.pathname === '/admin/overview' && request.method !== 'GET') || (url.pathname === '/admin/index' && request.method !== 'POST')) response = json({ error: 'Method not allowed' }, 405);
        else {
          const auth = request.headers.get('Authorization') || '';
          const admin = await verifyInvestmentAdmin(auth.startsWith('Bearer ') ? auth.slice(7) : null, env);
          if (!admin) response = json({ error: 'Google 계정으로 다시 로그인해주세요.', code: 'login-required' }, 403);
          else if (!env.INVESTMENT_MARKET) response = json({ error: '시세 서버를 준비 중이에요' }, 503);
          else {
            let body;
            if (request.method === 'POST') {
              if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
              const raw = await smallBody(request);
              if (raw === null) return json({ error: '요청이 너무 커요' }, 413);
              try { body = JSON.stringify({ input: JSON.parse(raw), admin }); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
            }
            const id = env.INVESTMENT_MARKET.idFromName('enjoy-market-v1');
            response = await env.INVESTMENT_MARKET.get(id).fetch('https://market.internal' + url.pathname, { method: request.method, body });
          }
        }
      } catch (_) { response = json({ error: '관리자 서버 연결이 지연되고 있어요' }, 503); }
    } else if (request.method !== 'GET') {
      // All other write endpoints remain closed.
      response = json({ error: '현재 거래가 잠겨 있어요', code: 'trading-closed' }, 423);
    } else if (!['/market', '/history', '/closes', '/ticks', '/orderbook', '/vlog/status'].includes(url.pathname)) {
      response = json({ error: 'Not found' }, 404);
    } else if (!env.INVESTMENT_MARKET) {
      response = json({ error: '시세 서버를 준비 중이에요' }, 503);
    } else {
      try {
        const id = env.INVESTMENT_MARKET.idFromName('enjoy-market-v1');
        response = await env.INVESTMENT_MARKET.get(id).fetch('https://market.internal' + url.pathname + url.search);
        if (url.pathname === '/market' && response.ok) {
          const data = await response.json();
          response = json({ ...data, tradingEnabled: env.TRADING_ENABLED === 'true' && !!env.INVESTMENT_LEDGER });
        }
      } catch (error) {
        console.error('Investment market read failed:', error.message);
        response = json({ error: '시세 연결이 지연되고 있어요' }, 503);
      }
    }
    const result = new Response(response.body, response);
    if (origin) result.headers.set('Access-Control-Allow-Origin', origin);
    result.headers.set('Vary', 'Origin');
    result.headers.set('X-Content-Type-Options', 'nosniff');
    return result;
  },
  async scheduled(controller, env) {
    const id = env.INVESTMENT_MARKET.idFromName('enjoy-market-v1');
    const response = await env.INVESTMENT_MARKET.get(id).fetch('https://market.internal/advance', {
      method: 'POST', body: JSON.stringify({ scheduledTime: controller.scheduledTime })
    });
    if (!response.ok) throw new Error('Hourly market update failed');
  }
};

export class InvestmentMarket extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // SQLite transactions serialize the single common market and commit prices/history together.
    ctx.storage.transactionSync(() => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS market_state (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)');
      this.sql.exec(`CREATE TABLE IF NOT EXISTS market_candles (
        symbol TEXT NOT NULL, resolution TEXT NOT NULL, bucket INTEGER NOT NULL,
        open_points INTEGER NOT NULL, high_points INTEGER NOT NULL, low_points INTEGER NOT NULL, close_points INTEGER NOT NULL,
        PRIMARY KEY(symbol, resolution, bucket))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS market_daily_closes (
        symbol TEXT NOT NULL, day INTEGER NOT NULL, close_points INTEGER NOT NULL, previous_points INTEGER NOT NULL,
        PRIMARY KEY(symbol, day))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS index_admin_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT UNIQUE NOT NULL, uid TEXT NOT NULL,
        changed_at INTEGER NOT NULL, before_points INTEGER NOT NULL, after_points INTEGER NOT NULL,
        baseline_points INTEGER NOT NULL, note TEXT NOT NULL, revision INTEGER NOT NULL)`);
      this.sql.exec('CREATE TABLE IF NOT EXISTS vlog_catalog (video_id TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, active INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS vlog_source (id INTEGER PRIMARY KEY CHECK(id=1), initialized INTEGER NOT NULL, checked_at INTEGER NOT NULL, success_at INTEGER, etag TEXT, error TEXT)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS vlog_uploads (video_id TEXT PRIMARY KEY, detected_at INTEGER NOT NULL, eligible_hour INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS vlog_clicks (bucket INTEGER NOT NULL, visitor TEXT NOT NULL, video_id TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY(bucket,visitor,video_id))');
      const saved = this.sql.exec('SELECT payload FROM market_state WHERE id = 1').toArray()[0];
      this.state = saved ? JSON.parse(saved.payload) : createMarket(env);
      if (!saved) { this.writeState(this.state); this.writeCandles(this.state); }
      else if (this.state.indexMode !== 'manual') {
        const today = dayAt(Date.now()), quote = this.state.quotes.find(item => item.id === 'enjoy');
        const baseline = this.sql.exec("SELECT close_points FROM market_candles WHERE symbol='enjoy' AND resolution='day' AND bucket < ? ORDER BY bucket DESC LIMIT 1", today).toArray()[0]?.close_points ?? quote.price;
        this.state = { ...this.state, indexMode: 'manual', revision: this.state.revision + 1,
          indexBaselineDay: today, indexBaseline: baseline,
          quotes: this.state.quotes.map(item => item.id === 'enjoy' ? { ...item, previous: baseline } : item) };
        this.writeState(this.state);
      }
      const maxHourlyBps = configuredMaxHourlyBps(env);
      if (this.state.maxHourlyBps !== maxHourlyBps || this.state.priceModel !== STOCK_PRICE_MODEL) {
        this.state = { ...this.state, maxHourlyBps, priceModel: STOCK_PRICE_MODEL, revision: this.state.revision + 1 };
        this.writeState(this.state);
      }
      if (this.state.quoteComparison !== QUOTE_COMPARISON) {
        // Use the saved quote's date, even while catching up an outage across midnight.
        const quoteDay = dayAt(this.state.hour);
        this.state = { ...this.state, quoteComparison: QUOTE_COMPARISON, revision: this.state.revision + 1,
          quotes: this.state.quotes.map(quote => {
            if (quote.id !== 'en-joy') return quote;
            const prior = this.sql.exec("SELECT close_points FROM market_candles WHERE symbol=? AND resolution='day' AND bucket < ? ORDER BY bucket DESC LIMIT 1", quote.id, quoteDay).toArray()[0];
            const initial = prior ? null : this.sql.exec("SELECT open_points FROM market_candles WHERE symbol=? AND resolution='day' ORDER BY bucket LIMIT 1", quote.id).toArray()[0];
            return { ...quote, previous: prior?.close_points ?? initial?.open_points ?? this.state.baseStudio ?? quote.price };
          }) };
        this.writeState(this.state);
      }
      const migrated = migrateMarketInterval(this.state);
      if (migrated !== this.state) {
        this.sql.exec('UPDATE vlog_uploads SET eligible_hour=? WHERE eligible_hour>? AND eligible_hour<?', migrated.nextTickAt, this.state.hour, migrated.nextTickAt);
        this.state = migrated;
        this.writeState(this.state);
      }
      if (!this.state.dailyClosesVersion) {
        // Restore completed legacy days only. An overdue cron must finish the saved day first.
        const savedDay = dayAt(this.state.hour);
        const before = savedDay + (this.state.hour >= savedDay + DAY_MS - UPDATE_MS ? DAY_MS : 0);
        this.sql.exec(`INSERT INTO market_daily_closes(symbol,day,close_points,previous_points)
          SELECT symbol,bucket,close_points,LAG(close_points,1,open_points) OVER (PARTITION BY symbol ORDER BY bucket)
          FROM market_candles WHERE resolution='day' AND bucket < ?
          ON CONFLICT DO NOTHING`, before);
        this.state = { ...this.state, dailyClosesVersion: 1 };
        this.writeState(this.state);
      }
    });
  }
  randomSample() { return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000; }
  async syncCatalog(force = false) {
    if (this.catalogPending) return this.catalogPending;
    const now = Date.now(), saved = this.sql.exec('SELECT * FROM vlog_source WHERE id=1').toArray()[0];
    if (saved && (force || !saved.initialized ? now - saved.checked_at < 60000 : tickAt(saved.checked_at) === tickAt(now))) return;
    this.catalogPending = (async () => {
      try {
        const headers = saved?.etag ? { 'If-None-Match': saved.etag } : {};
        const response = await fetch(this.env.VLOG_CATALOG_URL || 'https://raw.githubusercontent.com/won429/enjoy-app/main/index.html', { headers, signal: AbortSignal.timeout(8000) });
        if (response.status === 304 && saved?.initialized) {
          this.sql.exec('UPDATE vlog_source SET checked_at=?,success_at=?,error=NULL WHERE id=1', now, now); return;
        }
        if (!response.ok) throw new Error('catalog-http-' + response.status);
        const html = await smallBody(response, 3_000_000);
        const ids = extractVlogCatalog(html);
        this.ctx.storage.transactionSync(() => {
          this.sql.exec('UPDATE vlog_catalog SET active=0');
          for (const id of ids) {
            const known = this.sql.exec('SELECT video_id FROM vlog_catalog WHERE video_id=?', id).toArray()[0];
            this.sql.exec('INSERT INTO vlog_catalog VALUES(?,?,1) ON CONFLICT(video_id) DO UPDATE SET active=1', id, now);
            if (!known && saved?.initialized) this.sql.exec('INSERT INTO vlog_uploads VALUES(?,?,?) ON CONFLICT DO NOTHING', id, now, Math.max(tickAt(now), (this.state.nextTickAt ?? this.state.hour + UPDATE_MS)));
          }
          this.sql.exec('INSERT INTO vlog_source VALUES(1,1,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET initialized=1,checked_at=excluded.checked_at,success_at=excluded.success_at,etag=excluded.etag,error=NULL', now, now, response.headers.get('ETag'));
        });
      } catch (_) {
        this.sql.exec('INSERT INTO vlog_source VALUES(1,0,?,NULL,NULL,?) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at,error=excluded.error', now, '영상 목록 확인 지연');
      }
    })();
    try { await this.catalogPending; } finally { this.catalogPending = null; }
  }
  signalsForHour(hour) {
    const count = bucket => this.sql.exec('SELECT COUNT(*) AS n FROM vlog_clicks WHERE bucket=?', bucket).toArray()[0].n;
    return { clicks: count(hour - UPDATE_MS), previousClicks: count(hour - 2 * UPDATE_MS),
      uploads: this.sql.exec('SELECT COUNT(*) AS n FROM vlog_uploads WHERE eligible_hour=?', hour).toArray()[0].n };
  }
  vlogView() {
    const source = this.sql.exec('SELECT * FROM vlog_source WHERE id=1').toArray()[0];
    const clicks = this.sql.exec('SELECT source,COUNT(*) AS n FROM vlog_clicks WHERE bucket=? GROUP BY source', tickAt(Date.now())).toArray();
    return { initialized: !!source?.initialized, checkedAt: source?.checked_at || null, successAt: source?.success_at || null,
      error: source?.error || null, videoCount: this.sql.exec('SELECT COUNT(*) AS n FROM vlog_catalog WHERE active=1').toArray()[0].n,
      activityIntervalMs: UPDATE_MS, clicksThisPeriod: clicks.reduce((sum, row) => sum + row.n, 0),
      clicksThisHour: clicks.reduce((sum, row) => sum + row.n, 0), latestClicks: clicks.find(row => row.source === 'latest')?.n || 0,
      episodeClicks: clicks.find(row => row.source === 'episode')?.n || 0,
      pendingUploads: this.sql.exec('SELECT COUNT(*) AS n FROM vlog_uploads WHERE eligible_hour> ?', this.state.hour).toArray()[0].n,
      autoDetection: 'site-catalog', weights: INFLUENCE_WEIGHTS, lastDrivers: this.state.lastDrivers || null };
  }
  writeState(state) {
    this.sql.exec('INSERT INTO market_state(id, payload) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload', JSON.stringify(state));
  }
  writeCandles(frame) {
    for (const quote of frame.quotes) {
      // Intraday resolution keeps the legacy name hour; each new bucket is a half-hour snapshot.
      const high = quote.price, low = quote.price;
      this.sql.exec('INSERT INTO market_candles VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
        quote.id, 'hour', frame.hour, quote.price, high, low, quote.price);
      this.sql.exec(`INSERT INTO market_candles VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(symbol, resolution, bucket)
        DO UPDATE SET high_points = MAX(high_points, excluded.high_points), low_points = MIN(low_points, excluded.low_points), close_points = excluded.close_points`,
        quote.id, 'day', dayAt(frame.hour), quote.price, high, low, quote.price);
      if (frame.hour === dayAt(frame.hour) + DAY_MS - UPDATE_MS) {
        const previous = this.sql.exec('SELECT close_points FROM market_daily_closes WHERE symbol=? AND day<? ORDER BY day DESC LIMIT 1', quote.id, dayAt(frame.hour)).toArray()[0]?.close_points ?? quote.previous;
        this.sql.exec('INSERT INTO market_daily_closes VALUES(?,?,?,?) ON CONFLICT DO NOTHING', quote.id, dayAt(frame.hour), quote.price, previous);
      }
    }
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/vlog/status' && request.method === 'GET') {
      await this.syncCatalog(); return json(this.vlogView());
    }
    if (url.pathname === '/activity/click' && request.method === 'POST') {
      const input = await request.json();
      if (!validVideoId(input.videoId) || !['latest', 'episode'].includes(input.source) || !/^[a-f0-9]{64}$/.test(input.visitor) || input.bucket !== tickAt(Date.now())) return json({ error: 'Invalid click' }, 400);
      if (!this.sql.exec('SELECT initialized FROM vlog_source WHERE id=1').toArray()[0]?.initialized) await this.syncCatalog();
      if (!this.sql.exec('SELECT initialized FROM vlog_source WHERE id=1').toArray()[0]?.initialized) return json({ error: '영상 목록 확인 중' }, 503);
      if (!this.sql.exec('SELECT video_id FROM vlog_catalog WHERE video_id=? AND active=1', input.videoId).toArray()[0]) await this.syncCatalog(true);
      if (!this.sql.exec('SELECT video_id FROM vlog_catalog WHERE video_id=? AND active=1', input.videoId).toArray()[0]) return json({ error: '등록되지 않은 영상' }, 400);
      const result = this.sql.exec('INSERT INTO vlog_clicks VALUES(?,?,?,?) ON CONFLICT DO NOTHING RETURNING video_id', input.bucket, input.visitor, input.videoId, input.source).toArray();
      return json({ ok: true, counted: result.length > 0 });
    }
    if (url.pathname === '/admin/overview' && request.method === 'GET') return json(this.adminView());
    if (url.pathname === '/admin/index' && request.method === 'POST') {
      const { input, admin } = await request.json();
      if (!admin?.uid || !input || !Number.isSafeInteger(input.price) || input.price < 1 || input.price > 1_000_000_000 ||
          !Number.isSafeInteger(input.expectedRevision) || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId) ||
          typeof input.note !== 'string' || input.note.trim().length > 200) return json({ error: '지수는 1~1,000,000,000 사이의 정수 포인트로 입력해주세요.' }, 400);
      const duplicate = this.sql.exec('SELECT * FROM index_admin_log WHERE request_id = ?', input.requestId).toArray()[0];
      if (duplicate) {
        if (duplicate.uid !== admin.uid || duplicate.after_points !== input.price || duplicate.note !== input.note.trim()) return json({ error: '같은 요청 번호에 다른 값이 있어요.' }, 409);
        return json({ ...this.adminView(), saved: true, duplicate: true });
      }
      if (input.expectedRevision !== this.state.revision) return json({ error: '시세 또는 설정이 변경됐어요. 새로고침 후 다시 저장해주세요.', code: 'revision-conflict' }, 409);
      if (marketView(this.state).stale || dayAt(this.state.hour) !== dayAt(Date.now())) return json({ error: '30분 시세를 갱신 중이에요. 잠시 후 새로고침해주세요.' }, 503);
      const now = Date.now(), today = dayAt(now), before = this.state.quotes.find(quote => quote.id === 'enjoy');
      const yesterday = this.sql.exec("SELECT close_points FROM market_candles WHERE symbol = 'enjoy' AND resolution = 'day' AND bucket < ? ORDER BY bucket DESC LIMIT 1", today).toArray()[0];
      const baseline = yesterday?.close_points ?? (this.state.indexBaselineDay === today ? this.state.indexBaseline : before.price);
      const state = { ...this.state, revision: this.state.revision + 1, indexUpdatedAt: now, indexBaselineDay: today, indexBaseline: baseline,
        quotes: this.state.quotes.map(quote => quote.id === 'enjoy' ? { ...quote, price: input.price, previous: baseline } : quote) };
      this.ctx.storage.transactionSync(() => {
        this.writeState(state);
        this.sql.exec(`INSERT INTO market_candles VALUES('enjoy', 'hour', ?, ?, ?, ?, ?)
          ON CONFLICT(symbol, resolution, bucket) DO UPDATE SET high_points=MAX(high_points,excluded.high_points), low_points=MIN(low_points,excluded.low_points), close_points=excluded.close_points`, state.hour, input.price, input.price, input.price, input.price);
        this.sql.exec(`INSERT INTO market_candles VALUES('enjoy', 'day', ?, ?, ?, ?, ?)
          ON CONFLICT(symbol, resolution, bucket) DO UPDATE SET high_points=MAX(high_points,excluded.high_points), low_points=MIN(low_points,excluded.low_points), close_points=excluded.close_points`, today, input.price, input.price, input.price, input.price);
        this.sql.exec('INSERT INTO index_admin_log(request_id,uid,changed_at,before_points,after_points,baseline_points,note,revision) VALUES(?,?,?,?,?,?,?,?)',
          input.requestId, admin.uid, now, before.price, input.price, baseline, input.note.trim(), state.revision);
      });
      this.state = state;
      return json({ ...this.adminView(), saved: true });
    }
    if (url.pathname === '/advance' && request.method === 'POST') {
      const { scheduledTime } = await request.json();
      if (!Number.isFinite(scheduledTime) || scheduledTime > Date.now() + UPDATE_MS) return json({ error: 'Invalid scheduled time' }, 400);
      await this.syncCatalog();
      const { state, frames } = advanceMarket(this.state, Math.min(scheduledTime, Date.now()), hour => this.signalsForHour(hour), 72, () => this.randomSample());
      if (frames.length) {
        this.ctx.storage.transactionSync(() => {
          frames.forEach(frame => this.writeCandles(frame));
          this.writeState(state);
          this.sql.exec("DELETE FROM market_candles WHERE resolution = 'hour' AND bucket < ?", state.hour - 90 * DAY_MS);
          this.sql.exec("DELETE FROM market_candles WHERE resolution = 'day' AND bucket < ?", dayAt(state.hour) - 3660 * DAY_MS);
          this.sql.exec('DELETE FROM market_daily_closes WHERE day < ?', dayAt(state.hour) - 3660 * DAY_MS);
          this.sql.exec('DELETE FROM vlog_clicks WHERE bucket < ?', state.hour - 48 * HOUR_MS);
          this.sql.exec('DELETE FROM vlog_uploads WHERE eligible_hour < ?', state.hour - 90 * DAY_MS);
        });
        this.state = state;
      }
      return json({ ok: true, applied: frames.length, asOf: this.state.hour });
    }
    if (request.method !== 'GET') return json({ error: 'Trading closed' }, 423);
    if (url.pathname === '/market') return this.readResponse(marketView(this.state));
    if (url.pathname === '/ticks') {
      const symbol = url.searchParams.get('symbol'), cursor = url.searchParams.get('before');
      const before = cursor === null ? this.state.hour + UPDATE_MS : Number(cursor);
      if (!SYMBOLS.includes(symbol) || (cursor !== null && !/^\d+$/.test(cursor)) || !Number.isSafeInteger(before) || before < 0 || tickAt(before) !== before) return json({ error: 'Invalid symbol or cursor' }, 400);
      // Read exact persisted half-hour records, including the preceding row for page-boundary changes.
      const saved = this.sql.exec("SELECT bucket AS time,close_points AS price FROM market_candles WHERE symbol=? AND resolution='hour' AND bucket<? ORDER BY bucket DESC LIMIT 49", symbol, Math.min(before, this.state.hour + UPDATE_MS)).toArray();
      const rows = saved.slice(0,48).map((row,i) => {
        const previous = saved[i+1]?.price ?? row.price;
        return { ...row, previous, change: row.price - previous, percent: Number(((row.price - previous) / previous * 100).toFixed(2)) };
      });
      return this.readResponse({ symbol, rows, nextBefore: saved.length > 48 ? rows.at(-1).time : null,
        asOf: this.state.hour, revision: this.state.revision, serverTime: Date.now(), updateIntervalMs: UPDATE_MS, timeZone: 'Asia/Seoul' });
    }
    if (url.pathname === '/closes') {
      const symbol = url.searchParams.get('symbol'), cursor = url.searchParams.get('before');
      const before = cursor === null ? dayAt(Date.now()) + DAY_MS : Number(cursor);
      if (!SYMBOLS.includes(symbol) || !Number.isSafeInteger(before) || before < 0 || dayAt(before) !== before) return json({ error: 'Invalid symbol or cursor' }, 400);
      const saved = this.sql.exec('SELECT day,close_points AS close,previous_points AS previous FROM market_daily_closes WHERE symbol=? AND day<? ORDER BY day DESC LIMIT 31', symbol, Math.min(before, dayAt(Date.now()) + DAY_MS)).toArray();
      const rows = saved.slice(0, 30).map(row => ({ ...row,
        change: row.close - row.previous, percent: Number(((row.close - row.previous) / row.previous * 100).toFixed(2)),
        volume: symbol === 'en-joy' ? 0 : null, turnover: symbol === 'en-joy' ? 0 : null }));
      return this.readResponse({ symbol, rows, nextBefore: saved.length > 30 ? rows.at(-1).day : null,
        asOf: this.state.hour, revision: this.state.revision, serverTime: Date.now(), closingTime: '23:30', timeZone: 'Asia/Seoul' });
    }
    if (url.pathname === '/orderbook') {
      const symbol = url.searchParams.get('symbol');
      if (symbol !== 'en-joy') return json({ error: 'Invalid stock' }, 400);
      const today = dayAt(Date.now());
      const row = this.sql.exec(`SELECT close_points FROM market_candles WHERE symbol = ? AND resolution = 'hour' AND bucket >= ? AND bucket < ? ORDER BY bucket LIMIT 1`, symbol, today, today + DAY_MS).toArray()[0];
      const session = this.sql.exec(`SELECT MAX(close_points) AS high, MIN(close_points) AS low FROM market_candles WHERE symbol = ? AND resolution = 'hour' AND bucket >= ? AND bucket < ?`, symbol, today, today + DAY_MS).toArray()[0];
      const year = this.sql.exec(`SELECT MAX(high_points) AS high, MIN(low_points) AS low FROM market_candles WHERE symbol = ? AND resolution = 'day' AND bucket >= ?`, symbol, today - 365 * DAY_MS).toArray()[0];
      const quote = this.state.quotes.find(item => item.id === symbol);
      return this.readResponse({ ...closedOrderbook(quote, { open: row?.close_points ?? null, high: session.high, low: session.low, yearHigh: year.high, yearLow: year.low }, Date.now()), asOf: this.state.hour });
    }
    if (url.pathname !== '/history') return json({ error: 'Not found' }, 404);
    const symbol = url.searchParams.get('symbol'), period = url.searchParams.get('period') || 'day';
    const range = historyWindow(period, Date.now());
    if (!SYMBOLS.includes(symbol) || !range) return json({ error: 'Invalid symbol or period' }, 400);
    const points = this.sql.exec(`WITH buckets AS (
      SELECT CAST(bucket / ? AS INTEGER) * ? AS time, MIN(bucket) AS first_at, MAX(bucket) AS last_at,
        MAX(CASE WHEN resolution = 'hour' THEN close_points ELSE high_points END) AS high,
        MIN(CASE WHEN resolution = 'hour' THEN close_points ELSE low_points END) AS low
      FROM market_candles WHERE symbol = ? AND resolution = ? AND bucket >= ? AND bucket <= ? GROUP BY time
      ) SELECT b.time, b.high, b.low, CASE WHEN first.resolution = 'hour' THEN first.close_points ELSE first.open_points END AS open, last.close_points AS close
      FROM buckets b
      JOIN market_candles first ON first.symbol = ? AND first.resolution = ? AND first.bucket = b.first_at
      JOIN market_candles last ON last.symbol = ? AND last.resolution = ? AND last.bucket = b.last_at
      ORDER BY b.time LIMIT 130`, range.stride, range.stride, symbol, range.resolution, range.start, range.end,
      symbol, range.resolution, symbol, range.resolution).toArray();
    return this.readResponse({ symbol, period, points, axisStart: range.start, axisEnd: range.end, intraday: range.intraday, asOf: this.state.hour, nextUpdateAt: (this.state.nextTickAt ?? this.state.hour + UPDATE_MS), serverTime: Date.now() });
  }
  readResponse(data) {
    const ttl = Math.max(0, Math.min(60, Math.floor(((this.state.nextTickAt ?? this.state.hour + UPDATE_MS) - Date.now()) / 1000)));
    return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=' + ttl } });
  }
  adminView() {
    return {
      market: marketView(this.state), maxHourlyBps: this.state.maxHourlyBps, vlog: this.vlogView(),
      history: this.sql.exec('SELECT id,changed_at AS changedAt,before_points AS beforePoints,after_points AS afterPoints,baseline_points AS baselinePoints,note,revision FROM index_admin_log ORDER BY id DESC LIMIT 30').toArray(),
      baseline: this.sql.exec("SELECT close_points FROM market_candles WHERE symbol = 'enjoy' AND resolution = 'day' AND bucket < ? ORDER BY bucket DESC LIMIT 1", dayAt(Date.now())).toArray()[0]?.close_points ?? (this.state.indexBaselineDay === dayAt(Date.now()) ? this.state.indexBaseline : this.state.quotes.find(quote => quote.id === 'enjoy').price)
    };
  }
}
