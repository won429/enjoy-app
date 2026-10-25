(function () {
  'use strict';
  const catalog = document.getElementById('home-webnovel-panel');
  if (!catalog) return;
  let active = null;

  function pageKey(value) {
    const url = new URL(value, window.location.href);
    // Cloudflare Pages redirects /work/index.html to /work/ and /001.html to /001.
    const pathname = url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '');
    return url.origin + pathname + url.search;
  }

  function stopWatching(request) {
    window.clearTimeout(request.pollTimer);
    window.clearTimeout(request.deadlineTimer);
    request.frame.removeEventListener('load', request.onLoad);
  }

  function clearPreview() {
    if (!active) return;
    const request = active;
    const { screen, skeleton, timer } = request;
    active = null;
    screenObserver.disconnect();
    window.clearTimeout(timer);
    stopWatching(request);
    screen.classList.remove('is-novel-preview', 'is-novel-ready');
    screen.removeAttribute('aria-busy');
    skeleton.remove();
  }

  const screenObserver = new MutationObserver(function () {
    if (active && active.screen.classList.contains('hidden')) clearPreview();
  });

  function createSkeleton() {
    const skeleton = document.createElement('div');
    skeleton.className = 'novel-entry-skeleton';
    skeleton.setAttribute('role', 'status');
    skeleton.setAttribute('aria-label', '작품 정보를 불러오는 중');
    skeleton.innerHTML = `
      <div class="novel-entry-toolbar">
        <button type="button" class="novel-entry-back" aria-label="웹소설 목록으로 돌아가기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14.5 5-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>웹소설</span>
        </button>
      </div>
      <div class="novel-entry-content" aria-hidden="true">
        <div class="novel-entry-hero">
          <span class="novel-entry-block novel-entry-cover"></span>
          <div class="novel-entry-summary">
            <span class="novel-entry-block novel-entry-title"></span>
            <span class="novel-entry-block novel-entry-subtitle"></span>
            <div class="novel-entry-tags"><span class="novel-entry-block"></span><span class="novel-entry-block"></span><span class="novel-entry-block"></span><span class="novel-entry-block"></span></div>
            <span class="novel-entry-block novel-entry-count"></span>
          </div>
        </div>
        <div class="novel-entry-quote"><span class="novel-entry-block"></span><span class="novel-entry-block"></span></div>
        <div class="novel-entry-fold"><span class="novel-entry-block"></span></div>
        <div class="novel-entry-fold"><span class="novel-entry-block"></span></div>
      </div>`;
    skeleton.querySelector('button').addEventListener('click', function () {
      if (window.history.state && window.history.state.modal === 'browser') window.history.back();
      else if (window.closeBrowser) window.closeBrowser();
    });
    return skeleton;
  }

  function openPreview(link, pushHistory = true) {
    const screen = document.getElementById('browser-screen');
    const frame = document.getElementById('internal-browser-frame');
    const loader = document.getElementById('browser-loader');
    if (!screen || !frame || !loader) return false;
    const wasOpen = !screen.classList.contains('hidden');
    clearPreview();
    const home = document.getElementById('home-screen');
    const finishTransition = !wasOpen && window.beginEnjoyMenuTransition
      ? window.beginEnjoyMenuTransition(home, screen, 101)
      : function () {};
    const skeleton = createSkeleton();
    const request = { screen, frame, skeleton, ready: false, failed: false, entered: false, timer: null, pollTimer: null, deadlineTimer: null, onLoad: null };
    const showContent = function () {
      if (active !== request || !request.ready || !request.entered || screen.classList.contains('hidden')) return;
      screen.classList.add('is-novel-ready');
      screen.setAttribute('aria-busy', 'false');
      skeleton.hidden = true;
    };
    const checkContent = function () {
      if (active !== request || request.failed) return false;
      if (request.ready) return true;
      try {
        if (pageKey(frame.contentWindow.location.href) !== pageKey(link.href)) return false;
        const doc = frame.contentDocument;
        const title = doc && doc.querySelector('body.novel-page main article h1');
        if (!doc || doc.readyState === 'loading' || !title || !title.textContent.trim()) return false;
        const stylesheet = doc.querySelector('link[rel="stylesheet"][href*="novels.css"]');
        if (stylesheet && !stylesheet.sheet) return false;
        // The text and its styles are enough; ads and cover downloads can finish separately.
        request.ready = true;
        stopWatching(request);
        showContent();
        return true;
      } catch (_) { return false; }
    };
    const pollContent = function () {
      if (active !== request || request.failed || checkContent()) return;
      request.pollTimer = window.setTimeout(pollContent, 100);
    };
    const showFailure = function () {
      if (active !== request || request.ready || checkContent()) return;
      request.failed = true;
      stopWatching(request);
      screen.setAttribute('aria-busy', 'false');
      skeleton.setAttribute('role', 'alert');
      skeleton.setAttribute('aria-label', '작품 정보를 불러오지 못했어요');
      const content = skeleton.querySelector('.novel-entry-content');
      content.removeAttribute('aria-hidden');
      content.innerHTML = '<div class="novel-entry-error"><p>작품 정보를 불러오지 못했어요.</p><p>다시 시도하거나 목록으로 돌아가 주세요.</p><button type="button" data-novel-retry>다시 시도</button></div>';
      content.querySelector('[data-novel-retry]').addEventListener('click', function () { openPreview(link, false); });
    };
    request.onLoad = checkContent;
    active = request;
    screenObserver.observe(screen, { attributes: true, attributeFilter: ['class'] });
    try {
      screen.classList.add('is-novel-preview');
      screen.setAttribute('aria-busy', 'true');
      screen.appendChild(skeleton);
      loader.style.display = 'none';
      frame.addEventListener('load', request.onLoad);
      frame.src = link.href;
      screen.classList.remove('hidden');
      screen.classList.add('flex');
      // Back can dismiss the page while it is still loading.
      if (pushHistory) window.history.pushState({ modal: 'browser' }, '', '');
      window.haptic && window.haptic();
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Keep the placeholder in place through the existing 280ms menu entrance.
      request.timer = window.setTimeout(function () {
        request.entered = true;
        showContent();
      }, reduceMotion ? 0 : 280);
      request.deadlineTimer = window.setTimeout(showFailure, 10000);
      request.pollTimer = window.setTimeout(pollContent, 100);
    } finally { finishTransition(); }
    return true;
  }

  catalog.addEventListener('click', function (event) {
    const link = event.target.closest('a.novel-card');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (openPreview(link)) event.preventDefault();
  });
})();
