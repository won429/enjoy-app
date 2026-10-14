// The embedded page reuses the main app's member session. A direct visit restores
// the same named Firebase Auth app, with no Firestore listener or game writes.
let host = null;
try {
    if (window.parent !== window && window.parent.location.origin === location.origin && window.parent.closeDropTekken) host = window.parent;
} catch (_) {}

window.leaveTekkenPage = () => {
    if (host) host.closeDropTekken();
    else location.assign(new URL('index.html', location.href).href);
};
window.loginForTekken = () => { window.leaveTekkenPage(); };
let profileGeneration=0;
function authChanged(user) {
    const generation=++profileGeneration;
    window.enjoyUser = user && !user.isAnonymous ? { uid:user.uid, displayName:user.displayName||'', photoURL:user.photoURL||'' } : null;
    const member=window.enjoyUser&&host?.enjoyJoinedMembers?.().find(p=>p.uid===user.uid);
    window.enjoyTekkenProfile=window.enjoyUser?{uid:user.uid,name:member?.name||user.displayName||'나',photoURL:member?.photoURL||host?.enjoyMemberPhoto?.(user.uid)||user.photoURL||''}:null;
    window.dispatchEvent(new Event('enjoy-auth-ready'));
    if(!window.enjoyUser||member)return;
    // A single member-profile read supplies the Enjoy nickname and photo in direct visits too.
    (async()=>{
        const token=await window.getEnjoyIdToken?.();if(!token)return;
        const response=await fetch('https://firestore.googleapis.com/v1/projects/enjoy-meeting-account/databases/(default)/documents/members/'+encodeURIComponent(user.uid),{headers:{Authorization:'Bearer '+token}});
        if(!response.ok)return;const data=await response.json();
        if(generation!==profileGeneration||window.enjoyUser?.uid!==user.uid)return;
        window.enjoyTekkenProfile={uid:user.uid,name:data.fields?.name?.stringValue?.trim()||user.displayName||'나',photoURL:data.fields?.photoURL?.stringValue||user.photoURL||''};
        window.dispatchEvent(new Event('enjoy-auth-ready'));
    })().catch(()=>{});
}

if (host) {
    window.getEnjoyIdToken = force => host.getEnjoyIdToken?.(force);
    window.refreshTekkenProfile=()=>authChanged(host.enjoyUser);
    host.addEventListener('enjoy-auth-ready',window.refreshTekkenProfile);
    window.refreshTekkenProfile();
    window.openDropTekken();
} else {
    window.openDropTekken();
    let authPromise;
    async function restoreAuth() {
        if (authPromise) return authPromise;
        authPromise = (async () => {
            const [{ initializeApp, getApps }, { initializeAuth, browserLocalPersistence, onAuthStateChanged }] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js')
            ]);
            const config = { apiKey: 'AIzaSyAVQ_WdMXKuU2CgTgvSHqLKuAVGPeeDuOQ', authDomain: 'enjoy-meeting-account.firebaseapp.com', projectId: 'enjoy-meeting-account', appId: '1:956113498506:web:b520f2b77fdb3295cb9873' };
            const app = getApps().find(app => app.name === 'meetingApp') || initializeApp(config, 'meetingApp');
            const auth = initializeAuth(app, { persistence: browserLocalPersistence });
            window.getEnjoyIdToken = force => auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.getIdToken(!!force) : Promise.resolve(null);
            onAuthStateChanged(auth, authChanged);
        })().catch(() => {
            authPromise = null;
            document.getElementById('tekken-status').textContent = '로그인을 확인하지 못했어요. 혼자하기는 그대로 즐길 수 있어요.';
        });
        return authPromise;
    }
    // Account restoration enriches portraits after rendering; offline solo still works.
    document.getElementById('tekken-app').addEventListener('click', event => {
        if (event.target.closest('[data-action="friends"]')) restoreAuth();
    });
    if (new URLSearchParams(location.search).get('mode') === 'solo') window.tekkenReady.then(ready=>{if(ready)document.querySelector('[data-action="solo"]').click();});
    restoreAuth();
}
