(function (root) {
    'use strict';
    const button = document.getElementById('login-google-btn');
    const status = document.getElementById('login-status');
    const config = {
        apiKey: 'AIzaSyAVQ_WdMXKuU2CgTgvSHqLKuAVGPeeDuOQ',
        authDomain: 'enjoy-meeting-account.firebaseapp.com',
        projectId: 'enjoy-meeting-account',
        storageBucket: 'enjoy-meeting-account.firebasestorage.app',
        messagingSenderId: '956113498506',
        appId: '1:956113498506:web:b520f2b77fdb3295cb9873'
    };
    let auth, sdk, provider, initializing, nativeTimer, busy = false, completed = false;

    function setStatus(message, pending) {
        status.textContent = message;
        button.disabled = !!pending;
        button.setAttribute('aria-busy', String(!!pending));
    }

    function complete(user) {
        if (!user || user.isAnonymous || completed) return;
        completed = true;
        clearTimeout(nativeTimer);
        setStatus('로그인했어요. 홈으로 이동합니다.', true);
        // 홈과 같은 이름의 Firebase 앱/영구 세션을 사용한다.
        root.location.replace('index.html');
    }

    function fail(message) {
        clearTimeout(nativeTimer);
        busy = false;
        setStatus(message, false);
    }

    async function initialize() {
        if (initializing) return initializing;
        initializing = (async () => {
            setStatus('로그인을 준비하고 있어요.', true);
            try {
                const [appSdk, authSdk] = await Promise.all([
                    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
                    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js')
                ]);
                sdk = authSdk;
                const app = appSdk.getApps().find(item => item.name === 'meetingApp') || appSdk.initializeApp(config, 'meetingApp');
                auth = sdk.getAuth(app);
                await sdk.setPersistence(auth, sdk.browserLocalPersistence);
                provider = new sdk.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                sdk.onAuthStateChanged(auth, complete);
                setStatus('', false);
                return true;
            } catch (error) {
                auth = null;
                console.error('Login initialization failed:', error);
                fail('로그인을 준비하지 못했어요. 인터넷 연결과 브라우저의 사이트 저장소 설정을 확인한 뒤 다시 눌러주세요.');
                return false;
            }
        })();
        const ready = await initializing;
        if (!ready) initializing = null;
        return ready;
    }

    root.loginWithNativeGoogle = async function (idToken) {
        clearTimeout(nativeTimer);
        if (!auth || !idToken) {
            fail('구글 로그인 정보를 확인하지 못했어요. 다시 시도해주세요.');
            return;
        }
        try {
            const result = await sdk.signInWithCredential(auth, sdk.GoogleAuthProvider.credential(idToken));
            complete(result.user);
        } catch (error) {
            console.error('Native Google login failed:', error);
            fail('구글 로그인에 실패했어요. 다시 시도해주세요.');
        }
    };
    root.nativeGoogleLoginFailed = function (message) {
        fail(message || '구글 로그인 창을 열지 못했어요. 다시 시도해주세요.');
    };
    root.addEventListener('native-google-login-failed', event => {
        root.nativeGoogleLoginFailed((event.detail || {}).message);
    });

    root.enjoyLogin = async function () {
        if (busy || completed) return;
        if (!auth) {
            if (await initialize()) setStatus('준비됐어요. 로그인 버튼을 다시 눌러주세요.', false);
            return;
        }
        busy = true;
        setStatus('로그인 창을 여는 중…', true);
        if (root.AndroidLogin && typeof root.AndroidLogin.googleLogin === 'function') {
            nativeTimer = setTimeout(() => fail('로그인 창을 열지 못했어요. 다시 시도해주세요.'), 15000);
            try { root.AndroidLogin.googleLogin(); }
            catch (error) { fail('구글 로그인을 시작하지 못했어요. 다시 시도해주세요.'); }
            return;
        }
        try {
            const result = await sdk.signInWithPopup(auth, provider);
            complete(result.user);
        } catch (error) {
            console.error('Google login failed:', error);
            const message = error.code === 'auth/popup-closed-by-user'
                ? '로그인을 취소했어요. 로그인 없이도 홈을 둘러볼 수 있어요.'
                : error.code === 'auth/popup-blocked'
                    ? '로그인 팝업이 차단됐어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.'
                    : '로그인에 실패했어요. 다시 시도해주세요.';
            fail(message);
        }
    };
    button.addEventListener('click', root.enjoyLogin);
    initialize();
})(window);
