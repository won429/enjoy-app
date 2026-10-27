(function (root) {
    'use strict';
    const loader = root.document.getElementById('app-loader');
    if (!loader) return;

    // Data readiness controls dismissal directly, without waiting for an animation.
    function hide() {
        loader.dataset.state = 'hidden';
        loader.style.display = 'none';
        loader.setAttribute('aria-busy', 'false');
        loader.setAttribute('aria-hidden', 'true');
    }

    root.enjoyFinishAppLoading = hide;
    root.enjoyCancelAppLoading = hide;
})(window);
