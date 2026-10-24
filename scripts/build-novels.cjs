const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalogStart = '<!-- NOVEL CATALOG START -->';
const catalogEnd = '<!-- NOVEL CATALOG END -->';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function validateWork(work) {
  for (const key of ['title', 'tagline', 'cover']) {
    if (typeof work[key] !== 'string' || !work[key].trim()) throw new Error(`작품 정보 누락: ${key}`);
  }
  for (const key of ['genres', 'synopsis']) {
    if (!Array.isArray(work[key]) || !work[key].length || work[key].some(text => typeof text !== 'string' || !text.trim())) {
      throw new Error(`작품 정보 누락: ${key}`);
    }
  }
  if (!Number.isInteger(work.totalEpisodes) || work.totalEpisodes < 1) throw new Error('총 부작 수를 확인하세요.');
  if (!/^[\w.-]+\.(png|jpe?g|webp)$/i.test(work.cover)) throw new Error('표지는 작품 폴더 안의 이미지 파일로 지정하세요.');
  if (work.relationshipMap) {
    const map = work.relationshipMap;
    if (typeof map.src !== 'string' || !/^[\w.-]+\.(png|jpe?g|webp)$/i.test(map.src)) throw new Error('인물관계도 이미지 파일을 확인하세요.');
    if (![map.width, map.height].every(size => Number.isInteger(size) && size > 0)) throw new Error('인물관계도 이미지 크기를 확인하세요.');
  }
  if (work.episodes !== undefined) {
    if (!Array.isArray(work.episodes)) throw new Error('회차 목록을 확인하세요.');
    const numbers = new Set();
    const sources = new Set();
    for (const episode of work.episodes) {
      if (!Number.isInteger(episode.number) || episode.number < 1 || episode.number > work.totalEpisodes || numbers.has(episode.number)) throw new Error('회차 번호를 확인하세요.');
      if (typeof episode.title !== 'string' || !episode.title.trim()) throw new Error('회차 제목을 확인하세요.');
      if (typeof episode.source !== 'string' || !/^[a-z0-9-]+\.txt$/.test(episode.source) || sources.has(episode.source)) throw new Error('회차 원고 파일을 확인하세요.');
      numbers.add(episode.number);
      sources.add(episode.source);
    }
  }
}

const episodeFile = episode => episode.source.replace(/\.txt$/, '.html');

function renderEpisodeList(work) {
  if (!work.episodes || !work.episodes.length) return '';
  const episodes = [...work.episodes].sort((a, b) => a.number - b.number);
  return `      <section class="novel-chapters" aria-labelledby="novel-chapters-title">
        <h2 id="novel-chapters-title">회차 목록</h2>
        <ol>
${episodes.map(episode => `          <li><a class="novel-episode-link" data-novel-route href="episodes/${episodeFile(episode)}"><span class="novel-episode-number">${episode.number}화</span><span>${escapeHtml(episode.title)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg></a></li>`).join('\n')}
        </ol>
      </section>
`;
}

function renderEpisode(work, episode, manuscript) {
  validateWork(work);
  const lines = manuscript.replace(/\r\n?/g, '\n').split('\n');
  const episodeTitle = `제${episode.number}화. ${episode.title}`;
  if (lines[1] !== episodeTitle || !lines[0].startsWith(work.title)) throw new Error(`원고의 작품명·회차 제목을 확인하세요: ${episode.source}`);
  const hasIntro = /^(장르:|["“])/.test(lines[2] || '');
  const intro = hasIntro ? `        <p class="${lines[2].startsWith('장르:') ? 'novel-reader-genres' : 'novel-reader-tagline'}">${escapeHtml(lines[2])}</p>\n` : '';
  const body = lines.slice(hasIntro ? 3 : 2).filter(line => line.trim()).map(line => {
    if (/^(프롤로그\s*\||SCENE\s+\d+\s*\|)/.test(line)) return `        <h2>${escapeHtml(line)}</h2>`;
    const ending = /^제\d+화 END$/.test(line) ? ' class="novel-reader-end"' : '';
    return `        <p${ending}>${escapeHtml(line)}</p>`;
  }).join('\n');
  const episodes = [...(work.episodes || [])].sort((a, b) => a.number - b.number);
  const current = episodes.findIndex(item => item.number === episode.number);
  const previous = current > 0 ? episodes[current - 1] : null;
  const next = current >= 0 ? episodes[current + 1] : null;
  const pagination = previous || next ? `        <nav class="novel-reader-pagination" aria-label="회차 이동">
${previous ? `          <a data-novel-route rel="prev" href="${episodeFile(previous)}">이전 화 · 제${previous.number}화</a>\n` : ''}${next ? `          <a data-novel-route rel="next" href="${episodeFile(next)}">다음 화 · 제${next.number}화</a>\n` : ''}        </nav>\n` : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="${escapeHtml(work.title)} ${escapeHtml(episodeTitle)}. ${escapeHtml(work.tagline)}">
  <title>${escapeHtml(episodeTitle)} | ${escapeHtml(work.title)}</title>
  <link rel="icon" href="../../../icon.png">
  <link rel="stylesheet" href="../../novels.css?v=20261025-episode2-7">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3102739634230903" crossorigin="anonymous"></script>
  <script defer src="../../navigation.js?v=20261025-episode-2"></script>
</head>
<body class="novel-page">
  <header class="novel-toolbar">
    <div class="novel-toolbar__inner">
      <a class="novel-back" data-novel-route href="../index.html" aria-label="작품 정보와 회차 목록으로 돌아가기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14.5 5-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>작품 정보</span>
      </a>
    </div>
  </header>
  <main class="novel-main novel-reader">
    <article aria-labelledby="episode-title">
      <header class="novel-reader-header">
        <p class="novel-reader-series">${escapeHtml(lines[0])}</p>
        <h1 id="episode-title">${escapeHtml(lines[1])}</h1>
${intro}      </header>
      <div class="novel-manuscript">
${body}
      </div>
      <footer class="novel-reader-footer">
${pagination}        <a data-novel-route href="../index.html">작품 정보 · 회차 목록</a>
      </footer>
    </article>
  </main>
</body>
</html>
`;
}

function renderWork(work) {
  validateWork(work);
  const title = escapeHtml(work.title);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="${escapeHtml(work.tagline)} ${escapeHtml(work.genres.join(' · '))}, 총 ${work.totalEpisodes}부작. 작품 소개를 만나보세요.">
  <title>${title} | 엔조이 웹소설</title>
  <link rel="icon" href="../../icon.png">
  <link rel="stylesheet" href="../novels.css?v=20261025-episode2-7">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3102739634230903" crossorigin="anonymous"></script>
  <script defer src="../navigation.js?v=20261025-episode-2"></script>
</head>
<body class="novel-page">
  <header class="novel-toolbar">
    <div class="novel-toolbar__inner">
      <a class="novel-back" id="novel-back" href="../../index.html" aria-label="웹소설 목록으로 돌아가기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14.5 5-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>웹소설</span>
      </a>
    </div>
  </header>
  <main class="novel-main">
    <article aria-labelledby="novel-title">
      <header class="novel-hero">
        <img class="novel-cover" src="${escapeHtml(work.cover)}" width="1055" height="1491" alt="${title} 작품 표지" fetchpriority="high">
        <div class="novel-summary">
          <h1 class="novel-title" id="novel-title">${title}</h1>
          <ul class="novel-genres" aria-label="장르">
${work.genres.map(genre => `            <li>${escapeHtml(genre)}</li>`).join('\n')}
          </ul>
          <p class="novel-episodes">총 ${work.totalEpisodes}부작</p>
        </div>
        <blockquote class="novel-tagline">“${escapeHtml(work.tagline)}”</blockquote>
      </header>
      <details class="novel-story">
        <summary>
          <span>작품의 핵심 이야기</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="novel-story__body">
${work.synopsis.map(paragraph => `          <p>${escapeHtml(paragraph)}</p>`).join('\n')}
        </div>
      </details>
${work.relationshipMap ? `      <details class="novel-story">
        <summary>
          <span>인물관계도</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="novel-story__body">
          <a href="${escapeHtml(work.relationshipMap.src)}" target="_blank" rel="noopener" aria-label="인물관계도 원본 크게 보기">
            <img class="novel-relationship-image" src="${escapeHtml(work.relationshipMap.src)}" width="${work.relationshipMap.width}" height="${work.relationshipMap.height}" alt="${title} 등장인물 관계도" loading="lazy">
          </a>
        </div>
      </details>\n` : ''}${renderEpisodeList(work)}    </article>
  </main>
</body>
</html>
`;
}

function renderCard(work, slug) {
  validateWork(work);
  const title = escapeHtml(work.title);
  return `                <a class="novel-card" href="novels/${slug}/index.html">
                    <img class="novel-card__cover" src="novels/${slug}/${escapeHtml(work.cover)}" width="1055" height="1491" alt="${title} 작품 표지" loading="lazy">
                    <div class="novel-card__info">
                        <h3 class="novel-card__title">${title}</h3>
                        <span class="novel-card__genres">${escapeHtml(work.genres.join(' · '))}</span>
                        <span class="novel-card__episodes">총 ${work.totalEpisodes}부작</span>
                        <span class="novel-card__link">작품 소개 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    </div>
                </a>`;
}

function buildNovels() {
  const indexPath = path.join(root, 'index.html');
  const index = fs.readFileSync(indexPath, 'utf8');
  const start = index.indexOf(catalogStart);
  const end = index.indexOf(catalogEnd);
  if (start < 0 || end < start) throw new Error('홈의 웹소설 목록 표시를 찾을 수 없습니다.');
  const novelsPath = path.join(root, 'novels');
  const works = fs.readdirSync(novelsPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(novelsPath, entry.name, 'work.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => {
      if (!/^[a-z0-9-]+$/.test(entry.name)) throw new Error('작품 폴더는 영문 소문자·숫자·하이픈으로 지정하세요.');
      const directory = path.join(novelsPath, entry.name);
      const work = JSON.parse(fs.readFileSync(path.join(directory, 'work.json'), 'utf8'));
      validateWork(work);
      if (!fs.existsSync(path.join(directory, work.cover))) throw new Error(`표지 파일이 없습니다: ${entry.name}`);
      if (work.relationshipMap && !fs.existsSync(path.join(directory, work.relationshipMap.src))) throw new Error(`인물관계도 파일이 없습니다: ${entry.name}`);
      const episodes = (work.episodes || []).map(episode => ({
        output: path.join(directory, 'episodes', episodeFile(episode)),
        html: renderEpisode(work, episode, fs.readFileSync(path.join(directory, 'episodes', episode.source), 'utf8'))
      }));
      return { directory, slug: entry.name, work, episodes };
    });
  const catalog = `\n            <div class="novel-catalog">\n${works.map(({ work, slug }) => renderCard(work, slug)).join('\n')}\n            </div>\n            `;
  for (const { directory, work, episodes } of works) {
    fs.writeFileSync(path.join(directory, 'index.html'), renderWork(work));
    for (const episode of episodes) fs.writeFileSync(episode.output, episode.html);
  }
  fs.writeFileSync(indexPath, index.slice(0, start + catalogStart.length) + catalog + index.slice(end));
  console.log(`웹소설 ${works.length}개 작품 소개와 목록을 생성했습니다.`);
}

if (require.main === module) buildNovels();
module.exports = { validateWork, renderWork, renderCard, renderEpisode };
