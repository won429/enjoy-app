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
  <link rel="stylesheet" href="../novels.css?v=20261025-compact-2">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3102739634230903" crossorigin="anonymous"></script>
  <script defer src="../navigation.js?v=20261025-1"></script>
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
    </article>
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
      return { directory, slug: entry.name, work };
    });
  const catalog = `\n            <div class="novel-catalog">\n${works.map(({ work, slug }) => renderCard(work, slug)).join('\n')}\n            </div>\n            `;
  for (const { directory, work } of works) fs.writeFileSync(path.join(directory, 'index.html'), renderWork(work));
  fs.writeFileSync(indexPath, index.slice(0, start + catalogStart.length) + catalog + index.slice(end));
  console.log(`웹소설 ${works.length}개 작품 소개와 목록을 생성했습니다.`);
}

if (require.main === module) buildNovels();
module.exports = { validateWork, renderWork, renderCard };
