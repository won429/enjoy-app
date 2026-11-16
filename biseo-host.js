(() => {
    'use strict';
    const screen = document.getElementById('biseo-screen');
    const frame = document.getElementById('biseo-frame');
    const nav = document.getElementById('bottom-nav');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let account = null;
    let fullHeight = window.innerHeight;
    let isOpen = false;
    let screenMotion;

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

    function stopScreenMotion() {
        const motion = screenMotion;
        screenMotion = null;
        motion?.cancel();
        screen.classList.remove('biseo-exiting');
    }

    function animateScreen(open, animate = true) {
        const current = screenMotion ? getComputedStyle(screen) : null;
        const rest = { opacity: 1, transform: 'translate(-50%, 0)' };
        const offscreen = { opacity: 0, transform: 'translate(-50%, 16px)' };
        const start = current ? { opacity: current.opacity, transform: current.transform } : open ? offscreen : rest;
        stopScreenMotion();
        screen.inert = !open;
        if (!animate || reduceMotion.matches || document.hidden || typeof screen.animate !== 'function') return;
        if (!open) screen.classList.add('biseo-exiting');
        const motion = screen.animate([start, open ? rest : offscreen], {
            duration: open ? 280 : 210,
            easing: open ? 'cubic-bezier(.2, .75, .25, 1)' : 'cubic-bezier(.4, 0, .8, 1)',
            fill: 'both',
        });
        screenMotion = motion;
        const finish = () => { if (screenMotion === motion) stopScreenMotion(); };
        motion.finished.then(finish, finish);
    }

    // Keep the frame mounted between tabs so drafts and in-flight replies survive.
    // Reload on account changes so another member's conversation never stays visible.
    window.prepareEnjoyBiseo = () => {
        const user = window.enjoyUser;
        if (!user) return;
        if (account !== user.uid) {
            account = user.uid;
            frame.dataset.loading = '';
            frame.contentWindow.location.replace('biseo.html?embedded=1&v=20261116-veron-motion-1');
        }
        if (!isOpen) {
            isOpen = true;
            animateScreen(true);
        }
        frame.contentWindow.veronRefreshProfile?.();
        resize();
        requestAnimationFrame(resize);
    };
    window.leaveEnjoyBiseo = (animate = true) => {
        frame.contentDocument?.activeElement?.blur();
        document.body.classList.remove('biseo-keyboard-open');
        if (isOpen) {
            isOpen = false;
            animateScreen(false, animate);
        } else if (!animate) stopScreenMotion();
    };
    frame.addEventListener('load', () => {
        if (account && frame.contentDocument?.URL !== 'about:blank') delete frame.dataset.loading;
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
    reduceMotion.addEventListener?.('change', stopScreenMotion);
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
        window.leaveEnjoyBiseo(false);
        account = null;
        frame.contentWindow.location.replace('about:blank');
        if (!screen.classList.contains('hidden')) {
            if (window.enjoyUser) window.prepareEnjoyBiseo();
            else window.goHome();
        }
    });
})();
