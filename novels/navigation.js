(function () {
  'use strict';
  const back = document.getElementById('novel-back');
  if (!back) return;
  back.addEventListener('click', function (event) {
    if (window.parent === window || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
    window.parent.postMessage({ type: 'enjoy:navigate-home' }, targetOrigin);
  });
})();
