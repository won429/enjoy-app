(function () {
  'use strict';
  const back = document.getElementById('novel-back');
  if (back) back.addEventListener('click', function (event) {
    if (window.parent === window || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
    window.parent.postMessage({ type: 'enjoy:navigate-home' }, targetOrigin);
  });
  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[data-novel-route]');
    if (!link || window.parent === window || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Keep one parent modal history entry while moving between the work and its episodes.
    window.location.replace(link.href);
  });
})();
