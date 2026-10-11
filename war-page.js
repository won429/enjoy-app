let host=null;
try{if(window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.closeDropWar)host=window.parent;}catch(_){}
window.leaveWarPage=()=>{if(host)host.closeDropWar();else location.assign(new URL('index.html',location.href).href);};
if(host){
  window.enjoyUser=host.enjoyUser||null;
  window.getEnjoyIdToken=force=>host.getEnjoyIdToken?.(force);
  host.addEventListener('enjoy-auth-ready',()=>{window.enjoyUser=host.enjoyUser||null;window.dispatchEvent(new Event('enjoy-auth-ready'));});
  window.ensureWarAuth=()=>Promise.resolve();
}else{
  let authPromise;
  window.ensureWarAuth=()=>authPromise||(authPromise=(async()=>{
    const [{initializeApp,getApps},{initializeAuth,browserLocalPersistence,onAuthStateChanged}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js')
    ]);
    const config={apiKey:'AIzaSyAVQ_WdMXKuU2CgTgvSHqLKuAVGPeeDuOQ',authDomain:'enjoy-meeting-account.firebaseapp.com',projectId:'enjoy-meeting-account',appId:'1:956113498506:web:b520f2b77fdb3295cb9873'};
    const app=getApps().find(app=>app.name==='meetingApp')||initializeApp(config,'meetingApp');
    const auth=initializeAuth(app,{persistence:browserLocalPersistence});
    window.getEnjoyIdToken=force=>auth.currentUser&&!auth.currentUser.isAnonymous?auth.currentUser.getIdToken(!!force):Promise.resolve(null);
    await new Promise(resolve=>{let first=true;onAuthStateChanged(auth,user=>{window.enjoyUser=user&&!user.isAnonymous?{uid:user.uid,displayName:user.displayName||''}:null;if(first){first=false;resolve();}else window.dispatchEvent(new Event('enjoy-auth-ready'));});});
  })().catch(error=>{authPromise=null;throw error;}));
}
