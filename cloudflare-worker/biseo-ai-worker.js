const DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const MAX_REQUEST_BYTES = 65536;

const SYSTEM_INSTRUCTION = `당신은 엔조이 모임의 한국어 AI 비서실장입니다.
사용자에게 친근하고 차분한 존댓말로 답하세요.
일정 정리, 할 일, 모임비 안내문, 학교 공지 요약, 여행 계획, 일상 대화를 잘 도와주세요.
핵심부터 간결하게 답하고, 필요한 경우에만 짧은 목록을 사용하세요.
사용자가 제공하지 않은 개인 일정, 계좌 정보, 모임 데이터, 실시간 날씨나 최신 정보를 알고 있다고 말하지 마세요.
정보가 부족하면 추측하지 말고 꼭 필요한 내용만 한 번에 물어보세요.
민감한 개인정보나 금융정보를 요구하지 마세요.
자신을 Gemma나 Google 모델이라고 소개하지 말고 항상 '엔조이 비서실장'으로 행동하세요.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        configured: Boolean(env.GEMINI_API_KEY),
        model: env.GEMMA_MODEL || DEFAULT_MODEL,
      }, origin, env);
    }

    if (url.pathname !== '/chat' || request.method !== 'POST') {
      return json({ error: 'Not found' }, origin, env, 404);
    }

    if (!isAllowedOrigin(origin, env)) {
      return json({ error: 'Origin not allowed' }, '', env, 403);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: 'AI service is not configured' }, origin, env, 503);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return json({ error: 'Request too large' }, origin, env, 413);
    }

    if (env.BISEO_RATE_LIMITER) {
      const clientKey = request.headers.get('CF-Connecting-IP') || 'unknown';
      const result = await env.BISEO_RATE_LIMITER.limit({ key: clientKey });
      if (!result.success) {
        return json({ error: '잠시 후 다시 시도해 주세요.' }, origin, env, 429);
      }
    }

    let body;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return json({ error: 'Request too large' }, origin, env, 413);
      }
      body = JSON.parse(rawBody);
    } catch (error) {
      return json({ error: 'Invalid JSON' }, origin, env, 400);
    }

    const contents = normalizeMessages(body && body.messages);
    if (!contents.length || contents[contents.length - 1].role !== 'user') {
      return json({ error: 'A user message is required' }, origin, env, 400);
    }

    const model = env.GEMMA_MODEL || DEFAULT_MODEL;
    const gemmaResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1200,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      },
    );

    const data = await gemmaResponse.json().catch(() => ({}));
    if (!gemmaResponse.ok) {
      console.error('Gemma API request failed with status', gemmaResponse.status);
      return json({ error: 'AI response unavailable' }, origin, env, 502);
    }

    const parts = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts || []
      : [];
    const reply = parts
      .filter((part) => part && typeof part.text === 'string' && !part.thought)
      .map((part) => part.text)
      .join('')
      .trim();

    if (!reply) {
      return json({ error: 'AI returned an empty response' }, origin, env, 502);
    }

    return json({ reply: reply.slice(0, 12000) }, origin, env);
  },
};

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

function isAllowedOrigin(origin, env) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return !!origin && allowed.includes(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  if (isAllowedOrigin(origin, env)) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(data), { status, headers });
}
