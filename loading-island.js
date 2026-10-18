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
    scan.src = 'assets/loading-island/scan.webp?v=20261018-4';
    done.src = 'assets/loading-island/done.webp';
    let frame = 0;
    let started = 0;
    let previousTick = 0;
    let completionStarted = 0;
    let closeStarted = 0;
    let handoffStarted = 0;
    let handoff = null;
    let finishRequested = false;
    let lastDraw = '';
    let rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let anchorWidth = 8 * rem;
    let shape = null;
    let velocity = null;
    let previousMotion = null;
    const EXIT_FRAME = 21;
    const FACE_START = 30;
    const FACE_END = 60;
    const RECOGNITION_MS = 500;
    const FACE_HOLD_MS = 360;
    const DISSOLVE_MS = 100;
    const CHECK_MS = 600;
    const COMPLETION_MS = RECOGNITION_MS + FACE_HOLD_MS + DISSOLVE_MS + CHECK_MS + 100;

    function smooth(value) {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
    }

    function draw(image, index, nextImage, nextIndex, blend) {
        if (!context || !image.complete || !image.naturalWidth) return false;
        const mixing = nextImage && nextImage.complete && nextImage.naturalWidth && blend > 0;
        const key = (image === scan ? 'scan' : 'done') + index + (mixing ? ':' + (nextImage === scan ? 'scan' : 'done') + nextIndex + ':' + blend.toFixed(3) : '');
        if (lastDraw === key) return true;
        context.clearRect(0, 0, 256, 256);
        context.globalAlpha = 1;
        context.drawImage(image, (index % 8) * 256, Math.floor(index / 8) * 256, 256, 256, 0, 0, 256, 256);
        if (mixing) {
            context.globalAlpha = blend;
            context.drawImage(nextImage, (nextIndex % 8) * 256, Math.floor(nextIndex / 8) * 256, 256, 256, 0, 0, 256, 256);
            context.globalAlpha = 1;
        }
        lastDraw = key;
        return true;
    }

    function nativeMotion(elapsed) {
        // Real iPhone source frames already contain the 3D orbit and motion blur.
        // Never rotate this recording again with CSS or reverse its playback.
        const clock = Math.max(0, (elapsed - 350) * 60 / 1000);
        if (clock < 31) return {position: clock, index: Math.min(30, Math.floor(clock)), cycle: -1, bridge: false};
        const cycle = Math.floor((clock - 31) / 33);
        const offset = (clock - 31) % 33;
        if (offset < 27) return {position: 4 + offset, index: Math.floor(4 + offset), cycle: cycle, bridge: false};
        return {position: 30, index: 30, cycle: cycle, bridge: true, blend: smooth((offset - 27) / 6)};
    }

    function crossedExit(motion) {
        if (!previousMotion) return motion.position >= EXIT_FRAME && !motion.bridge;
        return !motion.bridge && motion.position >= EXIT_FRAME &&
            (previousMotion.cycle !== motion.cycle || previousMotion.position < EXIT_FRAME);
    }

    function shapeTarget(now) {
        const state = loader.dataset.state;
        let width = 6.5 * rem, height = 6.5 * rem, radius = 1.875 * rem, top = 0;
        if (state === 'handoff' || (state === 'closing' && now - closeStarted < 250) ||
            (state === 'opening' && now - started >= 190 && now - started < 330)) {
            width = anchorWidth; height = 2 * rem; radius = rem;
        } else if ((state === 'opening' && now - started < 190) || state === 'closing') {
            width = .5 * rem; height = .5 * rem; radius = .25 * rem; top = .75 * rem;
        }
        return {width: width, height: height, radius: radius, top: top};
    }

    function updateSurface(now) {
        const target = shapeTarget(now);
        const elapsed = Math.max(0, now - previousTick);
        previousTick = now;
        if (reducedMotion.matches || elapsed > 250) {
            Object.keys(target).forEach(key => {shape[key] = target[key]; velocity[key] = 0;});
        } else {
            // A single damped spring keeps its velocity when the target changes (including late baseball data).
            let remaining = Math.min(elapsed, 64) / 1000;
            while (remaining > 0) {
                const dt = Math.min(remaining, 1 / 120);
                Object.keys(target).forEach(key => {
                    velocity[key] += (340 * (target[key] - shape[key]) - 30 * velocity[key]) * dt;
                    shape[key] += velocity[key] * dt;
                });
                remaining -= dt;
            }
        }
        card.style.width = Math.max(1, shape.width) + 'px';
        card.style.height = Math.max(1, shape.height) + 'px';
        card.style.top = shape.top + 'px';
        card.style.borderRadius = Math.max(0, shape.radius) + 'px';
        const state = loader.dataset.state;
        const age = now - started;
        card.style.opacity = String(state === 'closing' ? 1 - smooth((now - closeStarted - 400) / 140) : smooth(age / 80));
        canvas.style.opacity = String(state === 'handoff' ? 1 - smooth((now - handoffStarted) / 140) :
            state === 'closing' ? 1 - smooth((now - closeStarted) / 120) : smooth((age - 330) / 150));
        if (handoff) {
            handoff.content.style.opacity = String(smooth((now - handoffStarted - 210) / 180));
            const mix = smooth((now - handoffStarted) / 400);
            card.style.borderColor = 'rgba(255,255,255,' + (.055 + .105 * mix) + ')';
            card.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,' + (.05 * mix) + '), 0 ' + ((.375 - .25 * mix) * rem) + 'px ' + ((1.25 - .75 * mix) * rem) + 'px rgba(0,0,0,' + (.1333 + .0267 * mix) + ')';
        }
        return Math.max(...Object.keys(target).map(key => Math.abs(shape[key] - target[key])));
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
    }

    function prepareHandoff(now) {
        if (!window.enjoyPrepareLoadingBaseballIsland) return false;
        const next = window.enjoyPrepareLoadingBaseballIsland();
        if (!next) return false;
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
            const error = updateSurface(now);
            if (reduced || ((now - handoffStarted >= 480 && error < .2) || now - handoffStarted >= 700)) {
                // Match the final pill geometry exactly before replacing its contents with the live score.
                const target = shapeTarget(now);
                Object.assign(shape, target);
                Object.keys(velocity).forEach(key => {velocity[key] = 0;});
                updateSurface(now);
                handoff.commit();
                hide();
                return;
            }
        } else if (state === 'closing') {
            if (!reduced && now - closeStarted < 180 && prepareHandoff(now)) {
                updateSurface(now);
                frame = requestAnimationFrame(tick);
                return;
            }
            updateSurface(now);
            if (now - closeStarted >= (reduced ? 0 : 560)) { hide(); return; }
        } else if (state === 'completing') {
            const progress = now - completionStarted;
            if (reduced) {
                phase(progress < 320 ? 'face' : 'check');
                draw(progress < 320 ? scan : done, progress < 320 ? FACE_END : 66);
            } else if (progress < RECOGNITION_MS) {
                phase('recognizing');
                const index = Math.min(FACE_END, FACE_START + Math.floor(progress * 60 / 1000));
                // Join two real recordings at their matching upright-orbit poses, preserving source motion.
                draw(scan, index, done, Math.min(30, EXIT_FRAME + Math.floor(progress * 60 / 1000)), 1 - smooth(progress / 90));
            } else if (progress < RECOGNITION_MS + FACE_HOLD_MS) {
                phase('face');
                draw(scan, FACE_END);
            } else if (progress < RECOGNITION_MS + FACE_HOLD_MS + DISSOLVE_MS) {
                phase('check');
                draw(scan, FACE_END, done, 30, smooth((progress - RECOGNITION_MS - FACE_HOLD_MS) / DISSOLVE_MS));
            } else {
                phase('check');
                draw(done, Math.min(66, 30 + Math.floor((progress - RECOGNITION_MS - FACE_HOLD_MS - DISSOLVE_MS) * 60 / 1000)));
            }
            updateSurface(now);
            if (progress >= (reduced ? 680 : COMPLETION_MS)) {
                if (!prepareHandoff(now)) {
                    loader.dataset.state = 'closing';
                    closeStarted = now;
                }
            }
        } else {
            const motion = nativeMotion(elapsed);
            if (reduced) draw(done, 30);
            else if (motion.bridge) draw(done, 30, done, 4, motion.blend);
            else draw(done, motion.index);
            if (state === 'opening' && elapsed >= (reduced ? 0 : 780)) loader.dataset.state = 'scanning';
            // Data arriving midway through the orbit finishes at its next matching pose, rather than snapping.
            if (finishRequested && (reduced || (elapsed >= 900 && crossedExit(motion))) &&
                scan.complete && scan.naturalWidth && done.complete && done.naturalWidth) {
                loader.dataset.state = 'completing';
                label.textContent = '데이터 동기화 완료';
                completionStarted = now;
                draw(reduced ? scan : done, reduced ? FACE_END : EXIT_FRAME);
            }
            previousMotion = motion;
            updateSurface(now);
        }
        frame = requestAnimationFrame(tick);
    }

    window.enjoyStartLoadingIsland = function () {
        if (frame) return;
        finishRequested = false;
        previousMotion = null;
        lastDraw = '';
        loader.style.display = 'block';
        loader.style.opacity = '1';
        loader.dataset.state = 'opening';
        delete loader.dataset.phase;
        loader.removeAttribute('aria-hidden');
        label.textContent = '데이터 동기화 중';
        started = previousTick = performance.now();
        window.enjoyPositionLoadingIsland();
        shape = {width: .25 * rem, height: .25 * rem, radius: .125 * rem, top: .875 * rem};
        velocity = {width: 0, height: 0, radius: 0, top: 0};
        card.style.borderColor = '';
        card.style.boxShadow = '';
        canvas.style.transform = 'translateY(.125rem)';
        updateSurface(started);
        frame = requestAnimationFrame(tick);
    };
    window.enjoyFinishLoadingIsland = function () {
        if (loader.dataset.state !== 'hidden') finishRequested = true;
    };
    window.enjoyCancelLoadingIsland = hide;

    window.enjoyPositionLoadingIsland = function (anchor) {
        rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        if (!anchor) {
            const width = Math.min(innerWidth, 28 * rem);
            const left = (innerWidth - width) / 2;
            const gapLeft = left + 8.1875 * rem + 8;
            const gapRight = left + width - 3.625 * rem - 2 * rem - 8;
            const islandWidth = Math.min(8 * rem, gapRight - gapLeft);
            anchor = {left: Math.max(gapLeft, Math.min(left + (width - islandWidth) / 2, gapRight - islandWidth)), top: .25 * rem, width: islandWidth};
        }
        anchorWidth = anchor.width;
        loader.style.setProperty('--loading-island-left', anchor.left + 'px');
        loader.style.setProperty('--loading-island-top', anchor.top + 'px');
        loader.style.setProperty('--loading-island-width', anchor.width + 'px');
    };
    window.enjoyStartLoadingIsland();
})();
