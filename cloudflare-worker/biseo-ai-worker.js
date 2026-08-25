const DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const MAX_REQUEST_BYTES = 65536;
const MAX_TIMETABLE_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_TIMETABLE_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMETABLE_MODEL = 'gemini-3.7-flash';
const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

const SYSTEM_INSTRUCTION = `당신은 엔조이 모임의 한국어 AI 비서실장입니다.
사용자에게 친근하고 차분한 존댓말로 답하세요.
일정 정리, 할 일, 모임비 안내문, 학교 공지 요약, 여행 계획, 일상 대화를 잘 도와주세요.
핵심부터 간결하게 답하고, 필요한 경우에만 짧은 목록을 사용하세요.
사용자가 제공하지 않은 개인 일정, 계좌 정보, 모임 데이터, 실시간 날씨나 최신 정보를 알고 있다고 말하지 마세요.
정보가 부족하면 추측하지 말고 꼭 필요한 내용만 한 번에 물어보세요.
민감한 개인정보나 금융정보를 요구하지 마세요.
자신을 Gemma나 Google 모델이라고 소개하지 말고 항상 '엔조이 비서실장'으로 행동하세요.`;

const TIMETABLE_INSTRUCTION = `당신은 대학교 시간표 이미지를 구조화하는 분석기입니다.
이미지에 실제로 보이는 과목만 추출하고 읽히지 않는 내용은 추측하지 마세요.
같은 과목이 여러 요일이나 시간대에 있으면 수업 블록별로 따로 반환하세요.
day는 월요일 0, 화요일 1, 수요일 2, 목요일 3, 금요일 4, 토요일 5, 일요일 6입니다.
시작과 종료 시간은 24시간 HH:MM 형식으로 반환하세요.
교수명과 강의실은 확실히 보일 때만 넣고, 학기 표시가 없으면 semester는 빈 문자열로 반환하세요.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const isTimetablePath = url.pathname === '/timetable/parse';

    if (request.method === 'OPTIONS') {
      const allowed = isTimetablePath ? isAllowedTimetableOrigin(origin, env) : isAllowedOrigin(origin, env);
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        configured: Boolean(env.GEMINI_API_KEY),
        model: env.GEMMA_MODEL || DEFAULT_MODEL,
        timetableModel: env.TIMETABLE_MODEL || DEFAULT_TIMETABLE_MODEL,
      }, origin, env);
    }

    const isChat = url.pathname === '/chat' && request.method === 'POST';
    const isTimetableParse = url.pathname === '/timetable/parse' && request.method === 'POST';
    if (!isChat && !isTimetableParse) {
      return json({ error: 'Not found' }, origin, env, 404);
    }

    const originAllowed = isTimetableParse ? isAllowedTimetableOrigin(origin, env) : isAllowedOrigin(origin, env);
    if (!originAllowed) {
      return json({ error: 'Origin not allowed' }, '', env, 403);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: 'AI service is not configured' }, origin, env, 503);
    }

    const maxRequestBytes = isTimetableParse ? MAX_TIMETABLE_REQUEST_BYTES : MAX_REQUEST_BYTES;
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > maxRequestBytes) {
      return json({ error: 'Request too large' }, origin, env, 413);
    }

    if (env.BISEO_RATE_LIMITER) {
      const clientKey = request.headers.get('CF-Connecting-IP') || 'unknown';
      const result = await env.BISEO_RATE_LIMITER.limit({ key: clientKey });
      if (!result.success) {
        return json({ error: '잠시 후 다시 시도해 주세요.' }, origin, env, 429);
      }
    }

    if (isTimetableParse) {
      const idToken = readBearerToken(request.headers.get('Authorization'));
      if (!idToken || !(await verifyFirebaseUser(idToken, env))) {
        return json({ error: 'Authentication required' }, origin, env, 401);
      }
    }

    const parsedBody = await readJsonBody(request, maxRequestBytes);
    if (parsedBody.error) return json({ error: parsedBody.error }, origin, env, parsedBody.status);

    return isTimetableParse
      ? handleTimetableParse(parsedBody.body, env, origin)
      : handleChat(parsedBody.body, env, origin);
  },
};

async function handleChat(body, env, origin) {
  const contents = normalizeMessages(body && body.messages);
  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    return json({ error: 'A user message is required' }, origin, env, 400);
  }

  const model = env.GEMMA_MODEL || DEFAULT_MODEL;
  const response = await requestGemini(model, env.GEMINI_API_KEY, {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  });
  if (!response.ok) {
    console.error('Gemma API request failed with status', response.status);
    return json({ error: 'AI response unavailable' }, origin, env, 502);
  }

  const reply = candidateText(response.data);
  if (!reply) return json({ error: 'AI returned an empty response' }, origin, env, 502);
  return json({ reply: reply.slice(0, 12000) }, origin, env);
}

async function handleTimetableParse(body, env, origin) {
  const image = normalizeTimetableImage(body && body.image);
  if (!image) return json({ error: 'A supported timetable image is required' }, origin, env, 400);

  const semesterHint = String(body && body.semesterHint || '').trim().slice(0, 40);
  const model = env.TIMETABLE_MODEL || DEFAULT_TIMETABLE_MODEL;
  const response = await requestGemini(model, env.GEMINI_API_KEY, {
    systemInstruction: { parts: [{ text: TIMETABLE_INSTRUCTION }] },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: image.mimeType, data: image.data } },
        { text: `이 시간표를 분석해 시간표 JSON으로 반환하세요.${semesterHint ? ` 학기 힌트: ${semesterHint}` : ''}` },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 5000,
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          semester: { type: 'STRING' },
          classes: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                day: { type: 'INTEGER' },
                startTime: { type: 'STRING' },
                endTime: { type: 'STRING' },
                professor: { type: 'STRING' },
                location: { type: 'STRING' },
              },
              required: ['name', 'day', 'startTime', 'endTime'],
            },
          },
        },
        required: ['semester', 'classes'],
      },
    },
  });

  if (!response.ok) {
    console.error('Timetable Gemini request failed with status', response.status);
    return json({ error: 'Timetable analysis unavailable' }, origin, env, 502);
  }

  let extracted;
  try {
    extracted = JSON.parse(candidateText(response.data).replace(/^```(?:json)?\s*|\s*```$/gi, ''));
  } catch (error) {
    return json({ error: 'Timetable response was invalid' }, origin, env, 502);
  }
  const timetable = normalizeExtractedTimetable(extracted);
  if (!timetable.classes.length) {
    return json({ error: 'No readable classes found' }, origin, env, 422);
  }
  return json({ timetable, model }, origin, env);
}

async function requestGemini(model, apiKey, payload) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    },
  );
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

async function readJsonBody(request, maxBytes) {
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
      return { error: 'Request too large', status: 413 };
    }
    return { body: JSON.parse(rawBody) };
  } catch (error) {
    return { error: 'Invalid JSON', status: 400 };
  }
}

function candidateText(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
    ? data.candidates[0].content.parts || []
    : [];
  return parts
    .filter((part) => part && typeof part.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim();
}

function normalizeTimetableImage(rawImage) {
  if (!rawImage || typeof rawImage !== 'object') return null;
  const mimeType = String(rawImage.mimeType || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return null;
  const data = String(rawImage.data || '').replace(/\s/g, '');
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const byteLength = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (byteLength <= 0 || byteLength > MAX_TIMETABLE_IMAGE_BYTES) return null;
  return { mimeType, data };
}

function normalizeExtractedTimetable(raw) {
  const classes = Array.isArray(raw && raw.classes) ? raw.classes : [];
  const normalized = [];
  for (const course of classes.slice(0, 80)) {
    const day = Number(course && course.day);
    const name = String(course && course.name || '').trim().slice(0, 50);
    const startTime = normalizeTime(course && course.startTime);
    const endTime = normalizeTime(course && course.endTime);
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (!name || !Number.isInteger(day) || day < 0 || day > 6 || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) continue;
    normalized.push({
      id: `ai-${normalized.length}-${day}-${startMinutes}-${endMinutes}`,
      day,
      dayLabel: ['월', '화', '수', '목', '금', '토', '일'][day],
      name,
      professor: String(course.professor || '').trim().slice(0, 30),
      location: String(course.location || '').trim().slice(0, 30),
      startMinutes,
      endMinutes,
      startTime,
      endTime,
      color: (normalized.length % 12) + 1,
    });
  }
  normalized.sort((a, b) => a.day - b.day || a.startMinutes - b.startMinutes || a.name.localeCompare(b.name, 'ko'));
  return {
    version: 1,
    sourceType: 'ai-image',
    semester: String(raw && raw.semester || '').trim().slice(0, 40),
    classes: normalized,
  };
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return '';
  const hour = Number(match[1]);
  if (hour > 23) return '';
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];

  const selected = [];
  let totalChars = 0;
  const recent = rawMessages.slice(-MAX_MESSAGES).reverse();

  for (const message of recent) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    const text = String(message.text || '').trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text) continue;
    if (totalChars + text.length > MAX_TOTAL_CHARS) continue;
    selected.push({
      role: message.role === 'user' ? 'user' : 'model',
      parts: [{ text }],
    });
    totalChars += text.length;
  }

  selected.reverse();
  while (selected.length && selected[0].role !== 'user') selected.shift();

  return selected.reduce((merged, message) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      previous.parts[0].text += `\n\n${message.parts[0].text}`;
    } else {
      merged.push(message);
    }
    return merged;
  }, []);
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
  return !!origin && allowed.includes(origin);
}

function isAllowedTimetableOrigin(origin, env) {
  if (origin === 'null' && String(env.ALLOW_NULL_TIMETABLE_ORIGIN || '') === 'true') return true;
  return isAllowedOrigin(origin, env);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data, origin, env, status = 200) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (isAllowedOrigin(origin, env) || (origin === 'null' && String(env.ALLOW_NULL_TIMETABLE_ORIGIN || '') === 'true')) {
    Object.assign(headers, corsHeaders(origin));
  }
  return new Response(JSON.stringify(data), { status, headers });
}
