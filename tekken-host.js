(() => {
  const screen = document.getElementById('tekken-game-screen'), frame = document.getElementById('tekken-game-frame');
  let historyId = '', previousFocus = null, overflow = '', loaded = false;
  function hide() { if (screen.hidden) return; frame.contentWindow?.pauseTekkenGame?.(); screen.hidden = true; document.body.style.overflow = overflow; previousFocus?.focus({ preventScroll:true }); }
  window.openDropTekken = () => {
    if (!screen.hidden) return;
    previousFocus = document.activeElement; overflow = document.body.style.overflow; screen.hidden = false; document.body.style.overflow = 'hidden';
    historyId = 'tekken-page-'+Date.now(); history.pushState({ ...history.state,modal:'tekken',tekkenViewId:historyId },'',location.href);
    if (!loaded) { loaded = true; frame.contentWindow.location.replace('tekken.html?v=20261015-motion3'); } else { frame.contentWindow?.refreshTekkenProfile?.(); frame.contentWindow?.openDropTekken?.(); } frame.focus();
  };
  window.closeDropTekken = () => { const undo = history.state?.tekkenViewId===historyId; hide(); if (undo) history.back(); };
  window.addEventListener('popstate', () => { if (!screen.hidden && history.state?.tekkenViewId!==historyId) hide(); });
  screen.addEventListener('keydown',e=>{ if(e.key==='Escape') window.closeDropTekken(); });
})();
