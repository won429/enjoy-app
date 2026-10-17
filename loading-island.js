(function () {
    'use strict';
    const loader = document.getElementById('app-loader');
    if (!loader) return;
    const canvas = loader.querySelector('canvas');
    const context = canvas.getContext('2d');
    const label = loader.querySelector('.loading-island-label');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scan = new Image();
    const done = new Image();
    scan.src = 'assets/loading-island/scan.webp';
    done.src = 'assets/loading-island/done.webp';
    let frame = 0;
    let started = 0;
    let completionStarted = 0;
    let closeStarted = 0;
    let finishRequested = false;
    let lastDraw = '';

    function draw(image, index) {
        if (!context || !image.complete || !image.naturalWidth) return;
        const key = (image === scan ? 'scan' : 'done') + index;
        if (lastDraw === key) return;
        context.clearRect(0, 0, 256, 256);
        context.drawImage(image, (index % 8) * 256, Math.floor(index / 8) * 256, 256, 256, 0, 0, 256, 256);
        lastDraw = key;
    }

    function hide() {
        cancelAnimationFrame(frame);
        frame = 0;
        loader.dataset.state = 'hidden';
        loader.style.display = 'none';
        loader.setAttribute('aria-hidden', 'true');
    }

    function tick(now) {
        const elapsed = now - started;
        const reduced = reducedMotion.matches;
        const state = loader.dataset.state;
        if (state === 'hidden') return;
        if (state === 'closing') {
            if (now - closeStarted >= (reduced ? 0 : 540)) { hide(); return; }
        } else if (state === 'completing') {
            const progress = now - completionStarted;
            draw(done, reduced ? 66 : Math.min(66, Math.floor(progress * 60 / 1000)));
            if (progress >= (reduced ? 550 : 1250)) {
                loader.dataset.state = 'closing';
                closeStarted = now;
            }
        } else {
            // Reveal the original first-video scan, then keep its rotation moving while Firebase waits.
            const scanFrame = Math.max(0, Math.floor((elapsed - 480) * 60 / 1000));
            const loop = Math.max(0, scanFrame - 27) % 34;
            draw(scan, reduced ? 18 : scanFrame < 27 ? scanFrame : 9 + (loop < 18 ? loop : 34 - loop));
            if (state === 'opening' && elapsed >= (reduced ? 0 : 780)) loader.dataset.state = 'scanning';
            // Even cached data keeps the small-dot entrance and a short scan visible.
            if (finishRequested && elapsed >= (reduced ? 0 : 1400)) {
                loader.dataset.state = 'completing';
                label.textContent = '데이터 동기화 완료';
                completionStarted = now;
                draw(done, reduced ? 66 : 0);
            }
        }
        frame = requestAnimationFrame(tick);
    }

    window.enjoyStartLoadingIsland = function () {
        if (frame) return;
        finishRequested = false;
        lastDraw = '';
        loader.style.display = 'block';
        loader.style.opacity = '1';
        loader.dataset.state = 'opening';
        loader.removeAttribute('aria-hidden');
        label.textContent = '데이터 동기화 중';
        started = performance.now();
        window.enjoyPositionLoadingIsland();
        frame = requestAnimationFrame(tick);
    };
    window.enjoyFinishLoadingIsland = function () {
        if (loader.dataset.state !== 'hidden') finishRequested = true;
    };
    // Connection errors and the login form never show a false success check.
    window.enjoyCancelLoadingIsland = hide;

    window.enjoyPositionLoadingIsland = function (anchor) {
        if (!anchor) {
            const size = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const width = Math.min(innerWidth, 28 * size);
            const left = (innerWidth - width) / 2;
            const gapLeft = left + 8.1875 * size + 8;
            const gapRight = left + width - 3.625 * size - 2 * size - 8;
            const islandWidth = Math.min(8 * size, gapRight - gapLeft);
            anchor = { left: Math.max(gapLeft, Math.min(left + (width - islandWidth) / 2, gapRight - islandWidth)), top: .25 * size, width: islandWidth };
        }
        loader.style.setProperty('--loading-island-left', anchor.left + 'px');
        loader.style.setProperty('--loading-island-top', anchor.top + 'px');
        loader.style.setProperty('--loading-island-width', anchor.width + 'px');
    };
    window.enjoyStartLoadingIsland();
})();
