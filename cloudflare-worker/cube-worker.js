import { DurableObject } from 'cloudflare:workers';
import { CubeRoom, ROOM_TTL, TURN_MS, fail } from './cube-room.js';

const MAX_BYTES = 16384;
let signingKeys = null, keysUntil = 0;
const encoder = new TextEncoder();
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function allowedOrigin(origin, env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(origin) || /^https:\/\/[a-f0-9]+\.enjoy-app\.pages\.dev$/.test(origin);
}
function decode(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
export async function verifyToken(token, env) {
  try {
    if (typeof token !== 'string' || token.length > 6000) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || !header.kid || claims.aud !== env.FIREBASE_PROJECT_ID ||
        claims.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
        !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > now + 60 || claims.firebase?.sign_in_provider === 'anonymous') return null;
    if (!signingKeys || Date.now() >= keysUntil) {
      const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!response.ok) return null;
      signingKeys = (await response.json()).keys;
      keysUntil = Date.now() + Math.min(Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 300), 3600) * 1000;
    }
    const jwk = signingKeys.find(key => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), encoder.encode(parts[0] + '.' + parts[1]))) return null;
    return claims;
  } catch (_) { return null; }
}
async function member(token, claims, env) {
  // One profile read at connection time; game actions never call Firestore.
  const url = 'https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID + '/databases/(default)/documents/members/' + encodeURIComponent(claims.sub);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) fail('멤버 프로필 등록 후 게임에 참가해주세요.', 'not-member');
  const data = await response.json();
  const name = data.fields?.name?.stringValue?.trim();
  if (!name) fail('멤버 프로필 등록 후 게임에 참가해주세요.', 'not-member');
  return { uid: claims.sub, name: name.slice(0, 40) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'enjoy-cube', version: 6, turnMs: TURN_MS, layoutVersion: 1, hintLimit: 2 });
    const match = url.pathname.match(/^\/rooms\/([A-Z2-9]{6})$/);
    const lobby = url.pathname === '/rooms';
    if ((!match && !lobby) || request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Not found' }, 404);
    if (!allowedOrigin(request.headers.get('Origin') || '', env)) return json({ error: 'Origin not allowed' }, 403);
    if (env.CUBE_CONNECT_LIMITER && !(await env.CUBE_CONNECT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) return json({ error: '잠시 후 다시 연결해주세요.' }, 429);
    return lobby ? env.CUBE_LOBBY.get(env.CUBE_LOBBY.idFromName('members')).fetch(request) : env.CUBE_ROOMS.get(env.CUBE_ROOMS.idFromName(match[1])).fetch(request);
  }
};

export class CubeGameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.model = new CubeRoom();
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => { this.model = new CubeRoom(await ctx.storage.get('game') || null); });
  }
  async fetch(request) {
    this.roomCode = new URL(request.url).pathname.split('/').at(-1);
    for (const ws of this.ctx.getWebSockets()) {
      const session = ws.deserializeAttachment();
      if (!session?.authenticated && Date.now() - session?.createdAt > 30000) ws.close(4001, '다시 연결해주세요.');
    }
    if (this.ctx.getWebSockets().length >= 40) return json({ error: '방의 연결이 너무 많아요. 잠시 후 다시 참가해주세요.' }, 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authenticated: false, createdAt: Date.now(), count: 0, windowAt: Date.now() });
    // No interval, heartbeat or polling timer keeps the room awake.
    return new Response(null, { status: 101, webSocket: client });
  }
  send(ws, data) { try { ws.send(JSON.stringify(data)); } catch (_) { try { ws.close(1011, '연결을 다시 확인해주세요.'); } catch (_) {} } }
  async save() {
    await this.ctx.storage.put('game', this.model.data);
    await this.syncDirectory();
    await this.scheduleAlarm();
  }
  async scheduleAlarm() {
    if (!this.model.room) return;
    const due = [this.model.room.updatedAt + ROOM_TTL];
    if (this.model.data.nextBotAt) due.push(this.model.data.nextBotAt);
    if (this.model.data.turnDeadline) due.push(this.model.data.turnDeadline);
    if (this.model.data.directoryDirty) due.push(Date.now() + 5000);
    if (this.model.room.status === 'closed') due.push(Date.now() + (this.model.data.directoryDirty ? 5000 : 1));
    await this.ctx.storage.setAlarm(Math.min(...due));
  }
  async syncDirectory() {
    const id = this.model.data?.code || this.roomCode;
    if (!id || !this.env.CUBE_LOBBY) return;
    const listing = this.model.listing(id), signature = JSON.stringify(listing && { ...listing, expiresAt: 0 });
    if (!this.model.data.directoryDirty && this.model.data.directorySignature === signature && Date.now() - this.model.data.directoryPublishedAt < ROOM_TTL / 2) return;
    try {
      const response = await this.env.CUBE_LOBBY.get(this.env.CUBE_LOBBY.idFromName('members')).fetch('https://directory/publish', { method: 'POST', body: JSON.stringify({ id, room: listing }) });
      if (!response.ok) throw new Error('Directory unavailable');
      this.model.data.directorySignature = signature;
      this.model.data.directoryPublishedAt = Date.now();
      this.model.data.directoryDirty = false;
    } catch (_) { this.model.data.directoryDirty = true; }
    await this.ctx.storage.put('game', this.model.data);
  }
  view(session) {
    const snapshot = this.model.view(session.uid);
    return snapshot;
  }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const session = ws.deserializeAttachment();
      if (!session?.authenticated) continue;
      if (session.expiresAt <= Date.now()) { ws.close(4001, '로그인을 갱신해주세요.'); continue; }
      this.send(ws, this.view(session));
    }
  }
  webSocketMessage(ws, raw) {
    // Serialize even across async profile validation / storage awaits.
    this.queue = this.queue.then(() => this.handle(ws, raw)).catch(() => this.send(ws, { type: 'error', code: 'server-error', message: '게임 서버에 다시 연결해주세요.' }));
    return this.queue;
  }
  async handle(ws, raw) {
    let packet, session = ws.deserializeAttachment();
    try {
      if (typeof raw !== 'string' || encoder.encode(raw).length > MAX_BYTES) fail('요청 크기가 너무 커요.');
      packet = JSON.parse(raw);
      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) fail('게임 요청을 확인해주세요.');
      const now = Date.now();
      if (!session) fail('다시 연결해주세요.', 'auth-required');
      if (now - session.windowAt > 10000) { session.count = 0; session.windowAt = now; }
      if (++session.count > 40) fail('너무 빠르게 누르고 있어요. 잠시 기다려주세요.', 'rate-limit');
      ws.serializeAttachment(session);
      if (packet.type === 'hello') {
        if (session.authenticated || now - session.createdAt > 30000) fail('다시 연결해주세요.', 'auth-required');
        const claims = await verifyToken(packet.token, this.env);
        if (!claims) fail('멤버 계정으로 다시 로그인해주세요.', 'auth-required');
        if (this.ctx.getWebSockets().filter(socket => socket.deserializeAttachment()?.uid === claims.sub).length >= 4) fail('다른 기기의 게임 연결을 닫고 다시 참가해주세요.', 'too-many-connections');
        const player = await member(packet.token, claims, this.env);
        const previous = structuredClone(this.model.data);
        let changed;
        try {
          changed = this.model.connect(player, packet.create === true);
          this.model.data.code = this.roomCode;
          if (changed) await this.save(); else { await this.syncDirectory(); await this.scheduleAlarm(); }
        }
        catch (error) { this.model = new CubeRoom(previous); throw error; }
        session = { ...session, authenticated: true, uid: player.uid, expiresAt: claims.exp * 1000, orderSelection: packet.orderSelection === true };
        ws.serializeAttachment(session);
        this.send(ws, { type: 'ready' });
        if (changed) this.broadcast(); else this.send(ws, this.view(session));
        return;
      }
      if (!session.authenticated || session.expiresAt <= now) fail('멤버 로그인을 갱신해주세요.', 'auth-required');
      if (packet.type !== 'action') fail('게임 동작을 확인해주세요.');
      // A persisted receipt makes repeated delivery of a successful move harmless.
      const old = structuredClone(this.model.data);
      let changed;
      try { changed = this.model.apply(session.uid, packet); if (changed) await this.save(); }
      catch (error) { this.model = new CubeRoom(old); throw error; }
      // The leaving client must receive its receipt before the removal snapshot
      // closes the connection and clears its pending request.
      if (packet.action?.type === 'leave') this.send(ws, { type: 'ack', id: packet.id });
      if (changed) this.broadcast(); else this.send(ws, this.view(session));
      if (packet.action?.type !== 'leave') this.send(ws, { type: 'ack', id: packet.id });
    } catch (error) {
      this.send(ws, { type: 'error', id: packet?.id, code: error.code || 'invalid-action', message: error instanceof SyntaxError ? '게임 요청을 확인해주세요.' : error.message });
      if (error.code === 'stale-revision') this.send(ws, this.view(session));
      if (packet?.type === 'hello' || error.code === 'auth-required') ws.close(4001, '다시 연결해주세요.');
    }
  }
  webSocketClose(ws, code) { try { ws.close(code, ''); } catch (_) {} }
  webSocketError(ws) { try { ws.close(1011, ''); } catch (_) {} }
  alarm() {
    this.queue = this.queue.then(async () => {
      const now = Date.now(), next = this.model.room?.updatedAt + ROOM_TTL;
      if (Number.isFinite(next) && next > now && this.model.room.status !== 'closed') {
        if (this.model.advanceOrder(now) || this.model.advanceBot(now)) { await this.save(); this.broadcast(); }
        else { await this.syncDirectory(); await this.scheduleAlarm(); }
        return;
      }
      for (const ws of this.ctx.getWebSockets()) { this.send(ws, { type: 'removed', message: '오래 사용하지 않은 방이 종료되었어요.' }); ws.close(1000, '방 종료'); }
      if (this.model.data) {
        this.model.data.room.status = 'closed';
        await this.syncDirectory();
        if (this.model.data.directoryDirty) { await this.scheduleAlarm(); return; }
      }
      await this.ctx.storage.deleteAll(); this.model = new CubeRoom();
    });
    return this.queue;
  }
}

// Only public room summaries live here; cards and member IDs stay in each room.
// The browser listens while viewing the lobby, with no repeating list requests.
export class CubeLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.queue = Promise.resolve();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)');
  }
  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  async entries() {
    return [...this.ctx.storage.sql.exec('SELECT payload FROM rooms WHERE expires > ? ORDER BY code LIMIT 200', Date.now())].map(row => JSON.parse(row.payload)).sort((a, b) => (a.status !== 'waiting') - (b.status !== 'waiting') || b.createdAt - a.createdAt);
  }
  async scheduleAlarm() {
    const row = [...this.ctx.storage.sql.exec('SELECT MIN(expires) AS next FROM rooms')][0];
    if (row?.next) await this.ctx.storage.setAlarm(row.next); else await this.ctx.storage.deleteAlarm();
  }
  send(ws, packet) { try { ws.send(JSON.stringify(packet)); } catch (_) { try { ws.close(1011); } catch (_) {} } }
  async broadcast() {
    const packet = { type: 'rooms', rooms: await this.entries() };
    for (const ws of this.ctx.getWebSockets()) {
      const session = ws.deserializeAttachment();
      if (!session?.uid) continue;
      if (session.expiresAt <= Date.now()) { ws.close(4001, '로그인을 갱신해주세요.'); continue; }
      this.send(ws, packet);
    }
  }
  fetch(request) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/publish') return this.enqueue(async () => {
      // This path has no public Worker route. Only the bound room objects call it.
      const { id, room } = await request.json();
      if (!/^[A-Z2-9]{6}$/.test(id) || room && room.id !== id) return json({ error: 'Invalid room' }, 400);
      if (room) this.ctx.storage.sql.exec('INSERT INTO rooms(code,payload,expires) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload,expires=excluded.expires', id, JSON.stringify(room), room.expiresAt);
      else this.ctx.storage.sql.exec('DELETE FROM rooms WHERE code = ?', id);
      await this.scheduleAlarm(); await this.broadcast(); return json({ ok: true });
    });
    for (const ws of this.ctx.getWebSockets()) {
      const session = ws.deserializeAttachment();
      if (!session?.uid && Date.now() - session?.createdAt > 30000) ws.close(4001, '다시 연결해주세요.');
    }
    if (this.ctx.getWebSockets().length >= 1000) return json({ error: '잠시 후 다시 연결해주세요.' }, 429);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ createdAt: Date.now(), count: 0, windowAt: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, raw) {
    return this.enqueue(async () => {
      try {
        const session = ws.deserializeAttachment(), now = Date.now();
        if (typeof raw !== 'string' || encoder.encode(raw).length > MAX_BYTES || !session) fail('요청을 확인해주세요.');
        const packet = JSON.parse(raw);
        if (now - session.windowAt > 10000) { session.count = 0; session.windowAt = now; }
        if (++session.count > 10) fail('잠시 후 다시 확인해주세요.', 'rate-limit');
        ws.serializeAttachment(session);
        if (packet.type === 'hello') {
          if (session.uid || now - session.createdAt > 30000) fail('다시 연결해주세요.', 'auth-required');
          const claims = await verifyToken(packet.token, this.env);
          if (!claims) fail('멤버 계정으로 로그인해주세요.', 'auth-required');
          await member(packet.token, claims, this.env);
          if (this.ctx.getWebSockets().filter(socket => socket.deserializeAttachment()?.uid === claims.sub).length >= 4) fail('다른 기기의 방 목록을 닫아주세요.');
          ws.serializeAttachment({ ...session, uid: claims.sub, expiresAt: claims.exp * 1000 });
        } else if (packet.type !== 'refresh' || !session.uid || session.expiresAt <= now) fail('멤버 계정으로 다시 연결해주세요.', 'auth-required');
        this.send(ws, { type: 'rooms', rooms: await this.entries() });
      } catch (error) {
        this.send(ws, { type: 'error', code: error.code || 'invalid-action', message: error.message });
        ws.close(4001, '다시 연결해주세요.');
      }
    });
  }
  webSocketClose(ws, code) { try { ws.close(code); } catch (_) {} }
  webSocketError(ws) { try { ws.close(1011); } catch (_) {} }
  alarm() {
    return this.enqueue(async () => {
      this.ctx.storage.sql.exec('DELETE FROM rooms WHERE expires <= ?', Date.now());
      await this.scheduleAlarm(); await this.broadcast();
    });
  }
}
