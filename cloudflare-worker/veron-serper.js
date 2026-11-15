const failure = (code, message = '웹 검색 서비스를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.') => Object.assign(new Error(message), { publicMessage: true, code });

function sourcesOf(data) {
  if (!Array.isArray(data?.organic)) throw failure('exaone_search_invalid_response');
  const sources = [];
  for (const item of data.organic) {
    try {
      const url = new URL(item.link);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /(^localhost$|\.localhost$|\.local$|\.internal$|^[\d.]+$)/i.test(url.hostname) || sources.some(source => source.url === url.href)) continue;
      const clean = (value, limit) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
      sources.push({ url: url.href, title: clean(item.title, 250) || url.hostname, snippet: clean(item.snippet, 3000) });
    } catch { /* Ignore invalid source URLs. */ }
    if (sources.length >= 5) break;
  }
  if (!sources.length) throw failure('exaone_search_empty', '검색에서 확인할 수 있는 출처를 찾지 못했어요. 검색 대상을 조금 더 구체적으로 알려 주세요.');
  return sources;
}

// A fixed search-only endpoint: no intermediary LLM, provider fallback or top-up.
// One request per query also keeps trial-credit consumption predictable.
export async function serperSearch(query, env, signal) {
  if (!env.SERPER_API_KEY) throw failure('search_unconfigured', '웹 검색 연결을 준비 중이에요. 검색 없이 질문하거나 잠시 후 다시 시도해 주세요.');
  signal.throwIfAborted();
  const timed = AbortSignal.any([signal, AbortSignal.timeout(18000)]);
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST', redirect: 'manual', signal: timed,
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': env.SERPER_API_KEY },
      body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num: 5 }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const limited = [402, 429].includes(response.status) || /credit|quota|exhaust|limit|too many/i.test(String(error.message || ''));
      throw failure(limited ? 'exaone_search_rate_limited' : 'exaone_search_unavailable', limited
        ? '웹 검색 한도에 도달했어요. 잠시 후 다시 시도하거나 검색 없이 질문해 주세요.'
        : '웹 검색 연결을 확인해야 해요. 잠시 후 다시 시도해 주세요.');
    }
    const sources = sourcesOf(await response.json());
    return {
      text: sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.snippet}\n${source.url}`).join('\n\n'),
      grounding: { sources: sources.map(({ title, url }) => ({ title, url })) },
      metadata: { groundingChunks: sources.map(source => ({ web: { title: source.title, uri: source.url } })), webSearchQueries: [query] },
    };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error.publicMessage) throw error;
    if (timed.aborted) throw failure('exaone_search_timeout', '웹 검색 응답이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.');
    throw failure('exaone_search_unavailable');
  }
}
