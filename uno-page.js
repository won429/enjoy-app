// The embedded page reuses the main app's member session. A direct visit restores
// the same named Firebase Auth app, with no Firestore listener or game writes.
let host = null;
try {
    if (window.parent !== window && window.parent.location.origin === location.origin && window.parent.closeDropGame) host = window.parent;
} catch (_) {}

window.leaveUnoPage = () => {
    if (host) host.closeDropGame();
    else if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) history.back();
    else location.assign('index.html');
};
window.loginForUno = () => { window.leaveUnoPage(); };
function authChanged(user) {
    window.enjoyUser = user && !user.isAnonymous ? { uid: user.uid, displayName: user.displayName || '' } : null;
    window.dispatchEvent(new Event('enjoy-auth-ready'));
}
if (host) {
    window.enjoyUser = host.enjoyUser || null;
    window.getEnjoyIdToken = force => host.getEnjoyIdToken?.(force);
    host.addEventListener('enjoy-auth-ready', () => authChanged(host.enjoyUser));
    window.openDropGame();
} else {
    window.openDropGame();
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
            document.getElementById('uno-status').textContent = '로그인을 확인하지 못했어요. 혼자하기는 그대로 즐길 수 있어요.';
        });
        return authPromise;
    }
    // Solo never starts an Auth connection. It remains usable without a server.
    document.getElementById('uno-screen').addEventListener('click', event => {
        if (event.target.closest('[data-uno-action="mode-friends"]')) restoreAuth();
    });
    if (new URLSearchParams(location.search).get('mode') === 'solo') document.querySelector('[data-uno-action="mode-solo"]').click();
    else restoreAuth();
}
