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
    const orbit = new Image();
    scan.src = 'assets/loading-island/scan.webp?v=20261018-4';
    done.src = 'assets/loading-island/done.webp';
    orbit.src = 'assets/loading-island/orbit.webp?v=20261019-10';
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
    const ORBIT_MS = 1250;
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

    function orbitMotion(elapsed) {
        // Both volumetric rings were rendered from continuous 3D rotations.
        // Each ring has its own continuous axis, direction and speed. Advance
        // its 60fps frames continuously, without braking or reversing.
        const turns = Math.max(0, elapsed - 350) / ORBIT_MS;
        return {angle: turns * Math.PI * 2, position: turns * 90, cycle: Math.floor(turns)};
    }

    function drawOrbit(motion) {
        if (!context) return false;
        if (!orbit.complete || !orbit.naturalWidth) return draw(done, 30);
        const key = 'orbit:' + motion.position;
        if (lastDraw === key) return true;
        context.clearRect(0, 0, 256, 256);
        context.save();
        context.globalCompositeOperation = 'lighter';
        // Unlike a squeezed bitmap, these frames keep tube thickness, depth,
        // soft volume and a wrapped motion-blur shutter even at edge-on poses.
        // Interpolate adjacent frames at display refresh rate, including 179→0.
        const index = Math.floor(motion.position);
        const fraction = motion.position - index;
        function sample(frame, weight) {
            const tile = frame % 180;
            context.globalAlpha = weight;
            context.drawImage(orbit, (tile % 8) * 128, Math.floor(tile / 8) * 128, 128, 128, 0, 0, 256, 256);
        }
        sample(index, 1 - fraction);
        sample(index + 1, fraction);
        context.restore();
        lastDraw = key;
        return true;
    }

    function crossedExit(motion) {
        return previousMotion && motion.cycle > previousMotion.cycle;
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
                // Let the orbit keep moving while the recorded face takes over.
                if (progress < 90) {
                    drawOrbit(orbitMotion(elapsed));
                    context.globalAlpha = smooth(progress / 90);
                    context.drawImage(scan, (index % 8) * 256, Math.floor(index / 8) * 256, 256, 256, 0, 0, 256, 256);
                    context.globalAlpha = 1;
                } else draw(scan, index);
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
            const motion = orbitMotion(elapsed);
            if (reduced) draw(done, 30);
            else drawOrbit(motion);
            if (state === 'opening' && elapsed >= (reduced ? 0 : 780)) loader.dataset.state = 'scanning';
            // Finish at the next turn boundary so readiness never resets the orbit mid-turn.
            if (finishRequested && (reduced || (elapsed >= 900 && crossedExit(motion))) &&
                scan.complete && scan.naturalWidth && done.complete && done.naturalWidth) {
                loader.dataset.state = 'completing';
                label.textContent = '데이터 동기화 완료';
                completionStarted = now;
                if (reduced) draw(scan, FACE_END);
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
