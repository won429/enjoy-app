(function () {
  'use strict';
  const catalog = document.getElementById('home-webnovel-panel');
  if (!catalog) return;
  catalog.addEventListener('click', function (event) {
    const link = event.target.closest('a.novel-card');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const screen = document.getElementById('browser-screen');
    const frame = document.getElementById('internal-browser-frame');
    const loader = document.getElementById('browser-loader');
    if (!screen || !frame || !loader) return;
    event.preventDefault();
    frame.addEventListener('load', function () {
      if (!screen.classList.contains('hidden')) {
        window.history.pushState({ modal: 'browser' }, '', '');
      }
    }, { once: true });
    loader.style.display = 'flex';
    frame.src = link.href;
    screen.classList.remove('hidden');
    screen.classList.add('flex');
  });
})();
