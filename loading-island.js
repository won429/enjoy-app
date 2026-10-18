(function () {
    'use strict';
    const loader = document.getElementById('app-loader');
    if (!loader) return;
    const canvas = loader.querySelector('canvas');
    const card = loader.querySelector('.loading-island-card');
    const context = canvas.getContext('2d');
    const label = loader.querySelector('.loading-island-label');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scan = new Image();
    const done = new Image();
    scan.src = 'assets/loading-island/scan.webp?v=20261018-3';
    done.src = 'assets/loading-island/done.webp';
    let frame = 0;
    let started = 0;
    let completionStarted = 0;
    let closeStarted = 0;
    let handoffStarted = 0;
    let handoff = null;
    let finishRequested = false;
    let lastDraw = '';
    let settleFrom = null;

    function draw(image, index, nextImage, nextIndex, blend) {
        if (!context || !image.complete || !image.naturalWidth) return;
        const mixing = nextImage && nextImage.complete && nextImage.naturalWidth && blend > 0;
        const key = (image === scan ? 'scan' : 'done') + index + (mixing ? ':' + nextIndex + ':' + blend.toFixed(3) : '');
        if (lastDraw === key) return;
        context.clearRect(0, 0, 256, 256);
        context.globalAlpha = 1;
        context.drawImage(image, (index % 8) * 256, Math.floor(index / 8) * 256, 256, 256, 0, 0, 256, 256);
        if (mixing) {
            context.globalAlpha = blend;
            context.drawImage(nextImage, (nextIndex % 8) * 256, Math.floor(nextIndex / 8) * 256, 256, 256, 0, 0, 256, 256);
            context.globalAlpha = 1;
        }
        lastDraw = key;
    }

    function scanPose(elapsed) {
        const time = Math.max(0, elapsed - 780);
        const initialFrame = Math.max(0, (elapsed - 480) * 60 / 1000);
        const texture = initialFrame < 27 ? Math.min(26, initialFrame) : 9 + ((initialFrame - 27) * .5 % 18);
        return { x: 47 * Math.sin(time * .0021), y: 53 * Math.sin(time * .0017), z: time * .22, texture: texture };
    }

    function orient(pose) {
        canvas.style.transform = 'perspective(8rem) translateY(.125rem) rotateZ(' + pose.z + 'deg) rotateY(' + pose.y + 'deg) rotateX(' + pose.x + 'deg)';
    }

    function hide() {
        cancelAnimationFrame(frame);
        frame = 0;
        if (handoff && handoff.content) handoff.content.remove();
        handoff = null;
        loader.dataset.state = 'hidden';
        delete loader.dataset.phase;
        loader.style.display = 'none';
        loader.setAttribute('aria-hidden', 'true');
        canvas.style.transform = '';
    }

    function prepareHandoff(now) {
        if (!window.enjoyPrepareLoadingBaseballIsland) return false;
        const next = window.enjoyPrepareLoadingBaseballIsland();
        if (!next) return false;
        const rect = card.getBoundingClientRect();
        loader.style.setProperty('--loading-handoff-width', rect.width + 'px');
        loader.style.setProperty('--loading-handoff-height', rect.height + 'px');
        loader.style.setProperty('--loading-handoff-top', card.offsetTop + 'px');
        loader.style.setProperty('--loading-handoff-radius', getComputedStyle(card).borderRadius);
        handoff = next;
        next.content.classList.add('loading-island-baseball');
        card.appendChild(next.content);
        loader.dataset.state = 'handoff';
        handoffStarted = now;
        return true;
    }

    function phase(name) {
        if (loader.dataset.phase !== name) loader.dataset.phase = name;
    }

    function tick(now) {
        const elapsed = now - started;
        const reduced = reducedMotion.matches;
        const state = loader.dataset.state;
        if (state === 'hidden') return;
        if (state === 'handoff') {
            if (now - handoffStarted >= (reduced ? 0 : 480)) {
                // The baseball card is already in its entered state before the loader is removed.
                handoff.commit();
                hide();
                return;
            }
        } else if (state === 'closing') {
            // A game arriving during the beginning of the collapse can still join the same card.
            if (!reduced && now - closeStarted < 180 && prepareHandoff(now)) {
                frame = requestAnimationFrame(tick);
                return;
            }
            if (now - closeStarted >= (reduced ? 0 : 540)) { hide(); return; }
        } else if (state === 'completing') {
            const progress = now - completionStarted;
            if (reduced) {
                orient({x: 0, y: 0, z: 0});
                phase(progress < 360 ? 'face' : 'check');
                draw(progress < 360 ? scan : done, progress < 360 ? 36 : 66);
            } else if (progress < 360) {
                phase('settling');
                const eased = 1 - Math.pow(1 - progress / 360, 3);
                orient({x: settleFrom.x * (1 - eased), y: settleFrom.y * (1 - eased), z: settleFrom.z + (Math.ceil(settleFrom.z / 360) * 360 - settleFrom.z) * eased});
                draw(scan, Math.min(26, Math.floor(settleFrom.texture + (26 - settleFrom.texture) * eased)));
            } else if (progress < 527) {
                phase('face');
                orient({x: 0, y: 0, z: 0});
                draw(scan, Math.min(36, 27 + Math.floor((progress - 360) * 60 / 1000)));
            } else if (progress < 1027) {
                phase('face');
                // Reset every held frame, including after a delayed/background animation tick.
                orient({x: 0, y: 0, z: 0});
                draw(scan, 36);
            } else if (progress < 1167) {
                orient({x: 0, y: 0, z: 0});
                phase('check');
                draw(scan, 36, done, 30, (progress - 1027) / 140);
            } else {
                orient({x: 0, y: 0, z: 0});
                phase('check');
                draw(done, Math.min(66, 30 + Math.floor((progress - 1167) * 60 / 1000)));
            }
            if (progress >= (reduced ? 720 : 2007)) {
                if (!prepareHandoff(now)) {
                    loader.dataset.state = 'closing';
                    closeStarted = now;
                }
            }
        } else {
            // Forward source frames and continuous azimuth, with independent horizontal/vertical tilt.
            // No reversed frame playback: the orbit travels through a full 360 degrees every 1.64 s.
            const pose = scanPose(elapsed);
            if (reduced) {
                orient({x: 0, y: 0, z: 0});
                draw(scan, 18);
            } else {
                orient(pose);
                const index = Math.floor(pose.texture);
                const next = index === 26 ? 9 : index + 1;
                draw(scan, index, scan, next, pose.texture - index);
            }
            if (state === 'opening' && elapsed >= (reduced ? 0 : 780)) loader.dataset.state = 'scanning';
            if (finishRequested && elapsed >= (reduced ? 0 : 1400)) {
                loader.dataset.state = 'completing';
                label.textContent = '데이터 동기화 완료';
                completionStarted = now;
                settleFrom = pose;
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
        delete loader.dataset.phase;
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
