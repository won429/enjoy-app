const MAX_REQUEST_BYTES = 4096;
const MAX_UPSTREAM_BYTES = 300000;
const EVERYTIME_HOST = 'everytime.kr';
const EVERYTIME_TIMETABLE_API = 'https://api.everytime.kr/find/timetable/table/friend';
const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'enjoy-everytime-timetable' }, origin, env);
    }

    if (url.pathname !== '/import' || request.method !== 'POST') {
      return json({ error: 'Not found' }, origin, env, 404);
    }

    if (!isAllowedOrigin(origin, env)) {
      return json({ error: 'Origin not allowed' }, '', env, 403);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return json({ error: 'Request too large' }, origin, env, 413);
    }

    const idToken = readBearerToken(request.headers.get('Authorization'));
    if (!idToken || !(await verifyFirebaseUser(idToken, env))) {
      return json({ error: 'Authentication required' }, origin, env, 401);
    }

    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
        return json({ error: 'Request too large' }, origin, env, 413);
      }
      body = JSON.parse(raw);
    } catch (error) {
      return json({ error: 'Invalid JSON' }, origin, env, 400);
    }

    let sourceUrl;
    try {
      sourceUrl = normalizeEverytimeUrl(body && body.url);
    } catch (error) {
      return json({ error: error.message }, origin, env, 400);
    }

    const identifier = new URL(sourceUrl).pathname.slice(2);
    let response;
    try {
      response = await fetch(EVERYTIME_TIMETABLE_API, {
        method: 'POST',
        headers: {
          Accept: 'application/xml,text/xml,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://everytime.kr',
          Referer: sourceUrl,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        },
        body: new URLSearchParams({ identifier, friendInfo: 'true' }).toString(),
      });
    } catch (error) {
      return json({ error: 'Everytime connection failed' }, origin, env, 502);
    }

    if (!response.ok) {
      return json({ error: 'Everytime page unavailable', upstreamStatus: response.status }, origin, env, 502);
    }

    const xml = await response.text();
    if (new TextEncoder().encode(xml).byteLength > MAX_UPSTREAM_BYTES) {
      return json({ error: 'Everytime page too large' }, origin, env, 502);
    }

    try {
      const timetable = parseEverytimeTimetable(xml, sourceUrl);
      return json({ timetable }, origin, env);
    } catch (error) {
      console.warn('Everytime timetable parse failed:', error && error.message);
      return json({ error: 'Timetable format unavailable' }, origin, env, 422);
    }
  },
};

export function normalizeEverytimeUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) throw new Error('Everytime share URL is required');

  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error('Invalid Everytime share URL');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== EVERYTIME_HOST) {
    throw new Error('Only everytime.kr share URLs are allowed');
  }

  const match = parsed.pathname.match(/^\/@([A-Za-z0-9_-]{8,80})\/?$/);
  if (!match) throw new Error('Invalid Everytime timetable share URL');
  return `https://${EVERYTIME_HOST}/@${match[1]}`;
}

export function parseEverytimeTimetable(xml, sourceUrl) {
  const source = String(xml || '');
  const tableMatch = source.match(/<table\b([^>]*)>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Timetable data was not found');

  const tableAttributes = tableMatch[1];
  const tableStatus = attributeValue(tableAttributes, 'status');
  if (tableStatus === '-1') throw new Error('Timetable does not exist');
  if (tableStatus === '-2') throw new Error('Timetable is private');

  const year = attributeValue(tableAttributes, 'year');
  const semesterNumber = attributeValue(tableAttributes, 'semester');
  const userMatch = source.match(/<user\b([^>]*)\/?\s*>/i);
  const ownerName = userMatch ? decodeHtml(attributeValue(userMatch[1], 'name')) : '';
  const classes = [];
  const subjectPattern = /<subject\b([^>]*)>([\s\S]*?)<\/subject>/gi;
  let subjectIndex = 0;

  for (const subjectMatch of tableMatch[2].matchAll(subjectPattern)) {
    const subjectAttributes = subjectMatch[1];
    const subjectXml = subjectMatch[2];
    const subjectId = attributeValue(subjectAttributes, 'id') || String(subjectIndex);
    const name = tagValue(subjectXml, 'name');
    const professor = tagValue(subjectXml, 'professor');
    if (!name) continue;

    const timePattern = /<data\b([^>]*)\/?\s*>/gi;
    for (const timeMatch of subjectXml.matchAll(timePattern)) {
      const timeAttributes = timeMatch[1];
      const day = Number(attributeValue(timeAttributes, 'day'));
      const startUnit = Number(attributeValue(timeAttributes, 'starttime'));
      const endUnit = Number(attributeValue(timeAttributes, 'endtime'));
      if (!Number.isInteger(day) || day < 0 || day > 6 || !Number.isFinite(startUnit) || !Number.isFinite(endUnit) || endUnit <= startUnit) continue;

      const startMinutes = clamp(Math.round(startUnit * 5), 0, 1439);
      const endMinutes = clamp(Math.round(endUnit * 5), startMinutes + 1, 1440);
      classes.push({
        id: `${subjectId}-${day}-${startUnit}-${endUnit}`,
        day,
        dayLabel: ['월', '화', '수', '목', '금', '토', '일'][day],
        name,
        professor,
        location: decodeHtml(attributeValue(timeAttributes, 'place')),
        startMinutes,
        endMinutes,
        startTime: formatMinutes(startMinutes),
        endTime: formatMinutes(endMinutes),
        color: (subjectIndex % 12) + 1,
      });
    }
    subjectIndex += 1;
  }

  classes.sort((a, b) => a.day - b.day || a.startMinutes - b.startMinutes || a.name.localeCompare(b.name, 'ko'));
  return {
    version: 1,
    sourceUrl,
    ownerName,
    semester: year && semesterNumber ? `${year}년 ${semesterNumber}학기` : '',
    classes,
  };
}

function attributeValue(attributes, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const match = String(attributes || '').match(pattern);
  return match ? match[2] : '';
}

function tagValue(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)\\/?\\s*>`, 'i');
  const match = String(xml || '').match(pattern);
  return match ? decodeHtml(attributeValue(match[1], 'value')) : '';
}

function decodeHtml(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const hex = code[1].toLowerCase() === 'x';
      const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }
    return Object.prototype.hasOwnProperty.call(named, code.toLowerCase()) ? named[code.toLowerCase()] : entity;
  });
}

function formatMinutes(minutes) {
  const safe = clamp(Number(minutes) || 0, 0, 1440);
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readBearerToken(header) {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function verifyFirebaseUser(idToken, env) {
  if (!env.FIREBASE_WEB_API_KEY) return false;
  try {
    const response = await fetch(`${FIREBASE_LOOKUP_URL}?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data && Array.isArray(data.users) && data.users[0] && data.users[0].localId);
  } catch (error) {
    return false;
  }
}

function isAllowedOrigin(origin, env) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return Boolean(origin) && allowed.includes(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, origin, env, status = 200) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (isAllowedOrigin(origin, env)) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(data), { status, headers });
}
