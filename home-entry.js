(function (root) {
    'use strict';
    let publicHomeShown = false;
    let selectedMode = null;
    let authFallbackTimer = null;

    function clearAuthFallback() {
        if (authFallbackTimer !== null) root.clearTimeout(authFallbackTimer);
        authFallbackTimer = null;
    }

    function updateAccountMenu() {
        const signedIn = !!root.enjoyUser;
        for (const [id, hidden] of [
            ['home-login', signedIn],
            ['home-logout', !signedIn],
            ['home-withdraw', !signedIn]
        ]) {
            const item = root.document.getElementById(id);
            if (item) item.classList.toggle('hidden', hidden);
        }
    }

    // 인증 요청은 별도 페이지에서만 실행한다. 기존 로그인 진입점도 이 경로를 쓴다.
    root.enjoyLogin = function () {
        root.location.assign('login.html');
    };

    root.enjoyShowPublicHome = function () {
        clearAuthFallback();
        if (!root.enjoyUser) {
            try {
                const name = root.enjoyGuestProfileName ? root.enjoyGuestProfileName() : '';
                const localGuest = root.enjoyIsLocalGuest && root.enjoyIsLocalGuest();
                if (!localGuest && root.enjoyStartLocalGuest) root.enjoyStartLocalGuest(name || '게스트');
            } catch (error) {
                // 저장소를 사용할 수 없어도 공개 콘텐츠는 계속 보여준다.
                console.warn('Guest storage unavailable:', error);
            }
            if (root.enjoyRefreshGuestNavigation) root.enjoyRefreshGuestNavigation();
            if ((!publicHomeShown || selectedMode !== 'guest') && root.homeActiveTab !== 'webnovel' && root.selectHomeTab) root.selectHomeTab('webnovel');
            publicHomeShown = true;
            selectedMode = 'guest';
        }
        updateAccountMenu();
        if (root.enjoyAppLoading) { root.enjoyAppLoading.local(); root.enjoyAppLoading.paint(); }
        if (root.enjoyFinishAppLoading) root.enjoyFinishAppLoading();
    };

    function handleAuthReady() {
        clearAuthFallback();
        if (root.enjoyUser && selectedMode !== 'member') {
            if (root.selectHomeTab) root.selectHomeTab('home');
            selectedMode = 'member';
        }
        updateAccountMenu();
        if (root.enjoyAppLoading) root.enjoyAppLoading.paint();
    }

    root.addEventListener('enjoy-auth-ready', handleAuthReady);
    root.addEventListener('enjoy-guest-entered', updateAccountMenu);
    updateAccountMenu();
    if (root.enjoyUser || root.enjoyAuthResolved === true) {
        handleAuthReady();
        if (!root.enjoyUser) root.enjoyShowPublicHome();
    } else {
        // 인증 확인 전에는 비회원 화면을 완료로 처리하지 않고 연결 오류를 표시한다.
        authFallbackTimer = root.setTimeout(function () {
            authFallbackTimer = null;
            if (!root.enjoyUser && root.enjoyAuthResolved !== true) {
                if (root.enjoyAppLoading) (root.enjoyAppLoading.slow || root.enjoyAppLoading.fail)('auth');
                else root.enjoyShowPublicHome();
            }
        }, 12000);
    }
})(window);
