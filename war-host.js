(() => {
  const screen=document.getElementById('war-game-screen'),frame=document.getElementById('war-game-frame');
  let historyId='',previousFocus=null,overflow='',loaded=false;
  function hide(){if(screen.hidden)return;frame.contentWindow?.pauseWarGame?.();screen.hidden=true;document.body.style.overflow=overflow;previousFocus?.focus({preventScroll:true});}
  window.openDropWar=()=>{
    if(!screen.hidden)return;
    previousFocus=document.activeElement;overflow=document.body.style.overflow;screen.hidden=false;document.body.style.overflow='hidden';
    historyId='war-page-'+Date.now();history.pushState({...history.state,modal:'war',warViewId:historyId},'',location.href);
    if(!loaded){loaded=true;frame.contentWindow.location.replace('war.html?v=20261012-3');}else frame.contentWindow?.resumeWarGame?.();frame.focus();
  };
  window.closeDropWar=()=>{const back=history.state?.warViewId===historyId;hide();if(back)history.back();};
  window.addEventListener('popstate',()=>{if(!screen.hidden&&history.state?.warViewId!==historyId)hide();});
  screen.addEventListener('keydown',event=>{if(event.key==='Escape')window.closeDropWar();});
})();
