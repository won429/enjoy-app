(function (root) {
    'use strict';
    let publicHomeShown = false;

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
            if (!publicHomeShown && root.homeActiveTab !== 'vlog' && root.selectHomeTab) root.selectHomeTab('vlog');
            publicHomeShown = true;
        }
        updateAccountMenu();
        if (root.enjoyCancelLoadingIsland) root.enjoyCancelLoadingIsland();
    };

    root.addEventListener('enjoy-auth-ready', updateAccountMenu);
    root.addEventListener('enjoy-guest-entered', updateAccountMenu);
    root.enjoyShowPublicHome();
})(window);
