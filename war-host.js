(() => {
  const screen=document.getElementById('war-game-screen'),frame=document.getElementById('war-game-frame');
  const button=document.getElementById('drop-war-button');
  let allowedUid='',accessRevision=0;
  async function refreshAccess(){
    const revision=++accessRevision;allowedUid='';button.hidden=true;button.style.display='none';hide();
    const uid=window.enjoyUser?.uid;if(!uid)return;
    try{
      const token=await window.getEnjoyIdToken?.(true);if(!token)return;
      const response=await fetch('https://firestore.googleapis.com/v1/projects/enjoy-meeting-account/databases/(default)/documents/members/'+encodeURIComponent(uid),{headers:{Authorization:'Bearer '+token}});
      if(!response.ok)return;
      const profile=await response.json();
      if(revision!==accessRevision||window.enjoyUser?.uid!==uid||profile.fields?.name?.stringValue?.trim()!=='성원제')return;
      allowedUid=uid;button.hidden=false;button.style.display='';
    }catch(_){}
  }
  let historyId='',previousFocus=null,overflow='',loaded=false;
  function hide(){if(screen.hidden)return;frame.contentWindow?.pauseWarGame?.();screen.hidden=true;document.body.style.overflow=overflow;previousFocus?.focus({preventScroll:true});}
  window.openDropWar=()=>{
    if(!allowedUid||window.enjoyUser?.uid!==allowedUid||!screen.hidden)return;
    previousFocus=document.activeElement;overflow=document.body.style.overflow;screen.hidden=false;document.body.style.overflow='hidden';
    historyId='war-page-'+Date.now();history.pushState({...history.state,modal:'war',warViewId:historyId},'',location.href);
    if(!loaded){loaded=true;frame.contentWindow.location.replace('war.html?v=20261012-4');}else frame.contentWindow?.resumeWarGame?.();frame.focus();
  };
  window.closeDropWar=()=>{const back=history.state?.warViewId===historyId;hide();if(back)history.back();};
  window.addEventListener('popstate',()=>{if(!screen.hidden&&history.state?.warViewId!==historyId)hide();});
  window.addEventListener('enjoy-auth-ready',refreshAccess);
  if(window.enjoyAuthResolved)refreshAccess();
  screen.addEventListener('keydown',event=>{if(event.key==='Escape')window.closeDropWar();});
})();
