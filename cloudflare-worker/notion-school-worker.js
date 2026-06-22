const NOTION_VERSION = '2022-06-28';

const DATABASE_ENV_BY_SCHOOL = {
  andong: 'ANDONG_DATABASE_ID',
  woosong: 'WOOSONG_DATABASE_ID',
  gyeongsang: 'GYEONGSANG_DATABASE_ID',
  silla: 'SILLA_DATABASE_ID',
  gwangju: 'GWANGJU_DATABASE_ID',
  yeungnam: 'YEUNGNAM_DATABASE_ID',
};

const SCHOOL_LABELS = {
  andong: '국립경국대(안동캠)',
  woosong: '우송대학교',
  gyeongsang: '경상국립대학교',
  silla: '신라대학교',
  gwangju: '광주대학교',
  yeungnam: '영남대학교',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/health') {
      return json({ ok: true }, request);
    }

    if (url.pathname !== '/notices') {
      return json({ error: 'Not found' }, request, 404);
    }

    if (!env.NOTION_TOKEN) {
      return json({ error: 'NOTION_TOKEN is not configured.' }, request, 500);
    }

    const school = (url.searchParams.get('school') || 'andong').toLowerCase();
    const databaseEnvName = DATABASE_ENV_BY_SCHOOL[school];
    const databaseId = databaseEnvName && env[databaseEnvName];

    if (isMissingConfig(databaseId)) {
      return json({ error: `${SCHOOL_LABELS[school] || school} database is not configured.` }, request, 404);
    }

    const pageSize = clampNumber(Number(url.searchParams.get('limit') || 20), 1, 50);
    const notionResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({
        page_size: pageSize,
        sorts: [
          { timestamp: 'last_edited_time', direction: 'descending' },
        ],
      }),
    });

    const data = await notionResponse.json().catch(() => ({}));

    if (!notionResponse.ok) {
      return json({ error: data.message || 'Notion API request failed.' }, request, notionResponse.status);
    }

    const notices = (data.results || [])
      .map(normalizePage)
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

    return json({
      school,
      label: SCHOOL_LABELS[school] || school,
      notices,
      syncedAt: new Date().toISOString(),
    }, request);
  },
};

function normalizePage(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    title: pickTitle(props) || '제목 없음',
    date: pickDate(props),
    category: pickCategory(props),
    summary: pickSummary(props),
    url: pickUrl(props) || page.url,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

function pickTitle(props) {
  for (const prop of Object.values(props)) {
    if (prop && prop.type === 'title') return richTextPlain(prop.title);
  }
  return '';
}

function pickDate(props) {
  for (const prop of Object.values(props)) {
    if (prop && prop.type === 'date' && prop.date) return prop.date.start || '';
  }
  return '';
}

function pickCategory(props) {
  const preferredNames = ['카테고리', '분류', 'Category', 'Type'];
  const preferred = preferredNames.map((name) => props[name]).find(Boolean);
  const prop = preferred || Object.values(props).find((item) => item && ['select', 'status', 'multi_select'].includes(item.type));
  if (!prop) return '';
  if (prop.type === 'select') return (prop.select && prop.select.name) || '';
  if (prop.type === 'status') return (prop.status && prop.status.name) || '';
  if (prop.type === 'multi_select') return (prop.multi_select || []).map((item) => item.name).join(', ');
  return '';
}

function pickSummary(props) {
  const preferredNames = ['요약', '설명', '내용', 'Summary', 'Description'];
  for (const name of preferredNames) {
    const prop = props[name];
    if (prop && prop.type === 'rich_text') return richTextPlain(prop.rich_text);
  }
  const prop = Object.values(props).find((item) => item && item.type === 'rich_text' && richTextPlain(item.rich_text));
  return prop ? richTextPlain(prop.rich_text) : '';
}

function pickUrl(props) {
  const preferredNames = ['원문URL', '원문 URL', '링크', 'URL', 'url', 'Link'];
  for (const name of preferredNames) {
    const prop = props[name];
    if (!prop) continue;
    if (prop.type === 'url') return prop.url || '';
    if (prop.type === 'rich_text') {
      const text = richTextPlain(prop.rich_text);
      if (/^https?:\/\//.test(text)) return text;
    }
  }
  const prop = Object.values(props).find((item) => item && item.type === 'url' && item.url);
  return prop ? prop.url : '';
}

function richTextPlain(items) {
  return (items || []).map((item) => item.plain_text || '').join('').trim();
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isMissingConfig(value) {
  return !value || /^(YOUR_|PASTE_)/.test(String(value));
}

function json(data, request, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
    },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
