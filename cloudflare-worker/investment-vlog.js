export const INFLUENCE_WEIGHTS = Object.freeze({ index: 0.2, clicks: 0.3, uploads: 0.5 });
export const FULL_CLICK_CHANGE = 20;
export const validVideoId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);

export function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      id = url.searchParams.get('v') || (/^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1]);
    }
    return validVideoId(id) ? id : '';
  } catch (_) { return ''; }
}

// Read the public site's vlog definition as text. Never execute fetched JavaScript.
function definitionBlock(html) {
  const match = /window\.ENJOY_VLOG_PROGRAMS\s*=\s*\{/.exec(html);
  if (!match) throw new Error('Vlog catalog missing');
  const start = match.index + match[0].length - 1;
  let depth = 0, quote = '', lineComment = false, blockComment = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i], next = html[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('Vlog catalog incomplete');
}
function withoutComments(text) {
  let result = '', quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quote) {
      result += c;
      if (c === '\\') result += text[++i] || '';
      else if (c === quote) quote = '';
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      result += '\n';
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; result += ' ';
    } else { if (c === '"' || c === "'" || c === '`') quote = c; result += c; }
  }
  return result;
}
export function extractVlogCatalog(html) {
  if (typeof html !== 'string' || html.length > 3_000_000) throw new Error('Invalid catalog size');
  const block = withoutComments(definitionBlock(html));
  const bannerStart = html.search(/id=["']home-vlog-panel["']/);
  const bannerEnd = bannerStart < 0 ? -1 : html.indexOf('id="home-vlog-catalog"', bannerStart);
  const banner = bannerStart >= 0 && bannerEnd > bannerStart ? html.slice(bannerStart, bannerEnd).replace(/<!--[\s\S]*?-->/g, '') : '';
  const ids = new Set();
  for (const match of (block + '\n' + banner).matchAll(/https:\/\/(?:youtu\.be|(?:www\.|m\.)?youtube\.com)\/[^\s"'<>\\)]+/g)) {
    const id = youtubeVideoId(match[0].replaceAll('&amp;', '&'));
    if (id) ids.add(id);
  }
  if (!ids.size || ids.size > 500) throw new Error('Invalid video count');
  return [...ids].sort();
}
export function stockInfluence({ indexPrice, indexBaseline, clicks = 0, previousClicks = 0, uploads = 0, maxBps, randomBps = 0 }) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const indexBps = clamp((indexPrice - indexBaseline) / indexBaseline * 10000, -maxBps, maxBps);
  const clickScore = clamp((clicks - previousClicks) / FULL_CLICK_CHANGE, -1, 1);
  const uploadScore = uploads > 0 ? 1 : 0;
  const components = { index: indexBps * INFLUENCE_WEIGHTS.index,
    clicks: clickScore * maxBps * INFLUENCE_WEIGHTS.clicks,
    uploads: uploadScore * maxBps * INFLUENCE_WEIGHTS.uploads,
    random: clamp(randomBps, -maxBps, maxBps) };
  return { bps: clamp(components.index + components.clicks + components.uploads + components.random, -maxBps, maxBps),
    components, clicks, previousClicks, uploads };
}
