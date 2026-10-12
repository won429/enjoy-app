let host=null;
try{if(window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.closeDropWar)host=window.parent;}catch(_){}
window.leaveWarPage=()=>{if(host)host.closeDropWar();else location.assign(new URL('index.html',location.href).href);};
if(host){
  window.enjoyUser=host.enjoyUser||null;
  window.getEnjoyIdToken=force=>host.getEnjoyIdToken?.(force);
  host.addEventListener('enjoy-auth-ready',()=>{window.enjoyUser=host.enjoyUser||null;window.dispatchEvent(new Event('enjoy-auth-ready'));});
  window.ensureWarAuth=async()=>{
    if(!host.enjoyAuthResolved)await new Promise(resolve=>host.addEventListener('enjoy-auth-ready',resolve,{once:true}));
    window.enjoyUser=host.enjoyUser||null;
  };
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
// The Enjoy member profile contains the game name; Google displayName may differ.
let memberPromise=null,memberUid='';
window.addEventListener('enjoy-auth-ready',()=>{memberPromise=null;memberUid='';});
window.getEnjoyWarMember=async()=>{
  await window.ensureWarAuth();
  const user=window.enjoyUser;
  if(!user?.uid)throw Error('엔조이에서 멤버 계정으로 로그인한 뒤 전쟁을 열어주세요.');
  if(memberUid!==user.uid||!memberPromise){
    memberUid=user.uid;
    const pending=(async()=>{
      const token=await window.getEnjoyIdToken?.(true);
      if(!token)throw Error('엔조이에서 멤버 계정으로 다시 로그인해주세요.');
      const url='https://firestore.googleapis.com/v1/projects/enjoy-meeting-account/databases/(default)/documents/members/'+encodeURIComponent(user.uid);
      const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
      if(!response.ok)throw Error(response.status===404?'엔조이에 멤버 프로필을 등록해주세요.':'멤버 정보를 불러오지 못했어요. 다시 확인을 눌러주세요.');
      const data=await response.json(),name=data.fields?.name?.stringValue?.trim();
      const faction=window.WarEngine.factions.find(f=>f.name===name);
      if(name!=='성원제'||!faction)throw Error('현재 드롭 전쟁은 성원제만 사용할 수 있습니다.');
      if(window.enjoyUser?.uid!==user.uid)throw Error('계정이 바뀌었어요. 다시 확인해주세요.');
      return {uid:user.uid,name:faction.name,faction:faction.id,home:faction.home};
    })();
    memberPromise=pending;
    pending.catch(()=>{if(memberPromise===pending){memberPromise=null;memberUid='';}});
  }
  return memberPromise;
};
window.dispatchEvent(new Event('war-auth-available'));
