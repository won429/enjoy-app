(() => {
    'use strict';
    const screen = document.getElementById('biseo-screen');
    const frame = document.getElementById('biseo-frame');
    const nav = document.getElementById('bottom-nav');
    let account = null;
    let fullHeight = window.innerHeight;

    window.enjoyVeronContext = () => {
        const user = window.enjoyUser;
        if (!user) return null;
        const profileName = window.enjoyProfileName || window.enjoyStoreMember?.()?.name;
        return { uid: user.uid, name: profileName || user.displayName || '멤버', profileReady: Boolean(profileName), photoURL: user.photoURL || '' };
    };

    function resize() {
        if (screen.classList.contains('hidden')) return;
        const viewport = window.visualViewport;
        const height = viewport ? viewport.height : window.innerHeight;
        const top = viewport ? viewport.offsetTop : 0;
        const input = frame.contentDocument?.activeElement;
        const typing = input && /^(TEXTAREA|INPUT)$/.test(input.tagName);
        if (!typing) fullHeight = window.innerHeight;
        const keyboardOpen = typing && fullHeight - height > 120;
        document.body.classList.toggle('biseo-keyboard-open', !!keyboardOpen);
        const bottom = keyboardOpen ? top + height : Math.min(top + height, nav.getBoundingClientRect().top - 8);
        frame.style.marginTop = top + 'px';
        screen.style.setProperty('--biseo-frame-height', Math.max(0, bottom - top) + 'px');
    }

    // Keep the frame mounted between tabs so drafts and in-flight replies survive.
    // Reload on account changes so another member's conversation never stays visible.
    window.prepareEnjoyBiseo = () => {
        const user = window.enjoyUser;
        if (!user) return;
        if (account !== user.uid) {
            account = user.uid;
            frame.contentWindow.location.replace('biseo.html?embedded=1&v=20261112-model-labels-1');
        }
        frame.contentWindow.veronRefreshProfile?.();
        resize();
        requestAnimationFrame(resize);
    };
    window.leaveEnjoyBiseo = () => {
        frame.contentDocument?.activeElement?.blur();
        document.body.classList.remove('biseo-keyboard-open');
    };
    frame.addEventListener('load', () => {
        frame.contentDocument?.addEventListener('focusin', resize);
        frame.contentDocument?.addEventListener('focusout', () => requestAnimationFrame(resize));
        resize();
    });
    window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === 'enjoy:navigate-home') window.goHome();
        if (event.data?.type === 'veron:appearance' && typeof event.data.conversation === 'boolean') screen.classList.toggle('has-conversation', event.data.conversation);
    });
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', () => {
        fullHeight = window.innerHeight;
        requestAnimationFrame(resize);
    }, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize, { passive: true });
        window.visualViewport.addEventListener('scroll', resize, { passive: true });
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(nav);
    window.addEventListener('enjoy-auth-ready', () => {
        if (account === (window.enjoyUser?.uid || null)) return;
        window.leaveEnjoyBiseo();
        account = null;
        frame.contentWindow.location.replace('about:blank');
        if (!screen.classList.contains('hidden')) {
            if (window.enjoyUser) window.prepareEnjoyBiseo();
            else window.goHome();
        }
    });
})();
