(() => {
  const screen = document.getElementById('cube-game-screen'), frame = document.getElementById('cube-game-frame');
  let historyId = '', previousFocus = null, overflow = '', loaded = false;
  function hide() { if (screen.hidden) return; frame.contentWindow?.pauseCubeGame?.(); screen.hidden = true; document.body.style.overflow = overflow; previousFocus?.focus({ preventScroll:true }); }
  window.openDropCube = () => {
    if (!screen.hidden) return;
    previousFocus = document.activeElement; overflow = document.body.style.overflow; screen.hidden = false; document.body.style.overflow = 'hidden';
    historyId = 'cube-page-'+Date.now(); history.pushState({ ...history.state,modal:'cube',cubeViewId:historyId },'',location.href);
    if (!loaded) { loaded = true; frame.contentWindow.location.replace('cube.html?v=20261012-play3'); } else frame.contentWindow?.openDropCube?.(); frame.focus();
  };
  window.closeDropCube = () => { const undo = history.state?.cubeViewId===historyId; hide(); if (undo) history.back(); };
  window.addEventListener('popstate', () => { if (!screen.hidden && history.state?.cubeViewId!==historyId) hide(); });
  screen.addEventListener('keydown',e=>{ if(e.key==='Escape') window.closeDropCube(); });
})();
