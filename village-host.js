(() => {
    'use strict';
    const screen = document.getElementById('village-game-screen');
    const frame = document.getElementById('village-game-frame');
    const button = document.getElementById('drop-village-button');
    if (!screen || !frame || !button) return;
    let allowedUid = '', revision = 0, historyId = '', previousFocus, overflow = '', loaded = false;

    // Match the existing private game's verified Firestore member check.
    // Never use a display name, local guest profile, or localStorage for access.
    async function refreshAccess() {
        const current = ++revision;
        allowedUid = '';
        button.hidden = true;
        button.style.display = 'none';
        hide();
        if (loaded) { frame.removeAttribute('src'); loaded = false; }
        const uid = window.enjoyUser?.uid;
        if (!uid || window.enjoyUser?.isAnonymous) return;
        try {
            const token = await window.getEnjoyIdToken?.(true);
            if (!token || current !== revision) return;
            const response = await fetch('https://firestore.googleapis.com/v1/projects/enjoy-meeting-account/databases/(default)/documents/members/' + encodeURIComponent(uid), {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!response.ok) return;
            const profile = await response.json();
            if (current !== revision || window.enjoyUser?.uid !== uid || profile.fields?.name?.stringValue?.trim() !== '성원제') return;
            allowedUid = uid;
            button.style.display = '';
            button.hidden = false;
        } catch (_) { /* Keep unfinished content hidden when verification fails. */ }
    }

    window.hasDropVillageAccess = () => !!allowedUid && allowedUid === window.enjoyUser?.uid;
    function hide() {
        if (screen.hidden) return;
        frame.contentWindow?.pauseVillageGame?.();
        screen.hidden = true;
        document.body.style.overflow = overflow;
        previousFocus?.focus({ preventScroll: true });
    }
    window.openDropVillage = () => {
        if (!window.hasDropVillageAccess() || !screen.hidden) return;
        previousFocus = document.activeElement;
        overflow = document.body.style.overflow;
        screen.hidden = false;
        document.body.style.overflow = 'hidden';
        historyId = 'village-' + Date.now();
        history.pushState({ ...history.state, modal: 'village', villageViewId: historyId }, '', location.href);
        if (!loaded) { loaded = true; frame.src = 'village.html?v=20261103-6'; }
        else frame.contentWindow?.resumeVillageGame?.();
        frame.focus();
    };
    window.closeDropVillage = () => {
        if (screen.hidden) return;
        const back = history.state?.villageViewId === historyId;
        hide();
        if (back) history.back();
    };
    window.addEventListener('popstate', () => {
        if (!screen.hidden && history.state?.villageViewId !== historyId) hide();
    });
    window.addEventListener('enjoy-auth-ready', refreshAccess);
    screen.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.closeDropVillage();
    });
    if (window.enjoyAuthResolved) refreshAccess();
})();
