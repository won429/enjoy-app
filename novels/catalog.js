(function () {
  'use strict';
  const catalog = document.getElementById('home-webnovel-panel');
  if (!catalog) return;
  let active = null;

  function clearPreview() {
    if (!active) return;
    const { screen, frame, skeleton, onLoad, timer } = active;
    active = null;
    screenObserver.disconnect();
    window.clearTimeout(timer);
    frame.removeEventListener('load', onLoad);
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

  catalog.addEventListener('click', function (event) {
    const link = event.target.closest('a.novel-card');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const screen = document.getElementById('browser-screen');
    const frame = document.getElementById('internal-browser-frame');
    const loader = document.getElementById('browser-loader');
    if (!screen || !frame || !loader) return;
    event.preventDefault();
    clearPreview();
    const home = document.getElementById('home-screen');
    const finishTransition = window.beginEnjoyMenuTransition
      ? window.beginEnjoyMenuTransition(home, screen, 101)
      : function () {};
    const skeleton = createSkeleton();
    const request = { screen, frame, skeleton, ready: false, entered: false, timer: null, onLoad: null };
    const showContent = function () {
      if (active !== request || !request.ready || !request.entered || screen.classList.contains('hidden')) return;
      screen.classList.add('is-novel-ready');
      screen.setAttribute('aria-busy', 'false');
      skeleton.hidden = true;
      frame.removeEventListener('load', request.onLoad);
    };
    request.onLoad = function () {
      if (active !== request || frame.src !== link.href) return;
      // Ignore a late load from a previously closed page or about:blank.
      try { if (frame.contentWindow.location.href !== link.href) return; } catch (_) { return; }
      request.ready = true;
      showContent();
    };
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
      window.history.pushState({ modal: 'browser' }, '', '');
      window.haptic && window.haptic();
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Keep the placeholder in place through the existing 280ms menu entrance.
      request.timer = window.setTimeout(function () {
        request.entered = true;
        showContent();
      }, reduceMotion ? 0 : 280);
    } finally { finishTransition(); }
  });
})();
