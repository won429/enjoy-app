(function () {
    'use strict';

    const dialog = document.getElementById('lions-championship');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const canvas = dialog.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const logo = dialog.querySelector('img');
    const closeButton = dialog.querySelector('button');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Reference: blue/silver radial fireworks, falling glitter and a logo on each rising shell.
    const colors = ['#1766dc', '#287cf0', '#6ab4ff', '#b9cfe8', '#e6edf7', '#ffffff'];
    let shown = false, running = false, frame = 0, lastTime = 0, nextLaunch = 0;
    let width = 0, height = 0, launches = 0, previousFocus = null, overflow = '';
    let rockets = [], particles = [], flashes = [];
    let unsubscribe = null;
    const random = (min, max) => min + Math.random() * (max - min);

    function resize() {
        width = dialog.clientWidth;
        height = dialog.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function launch() {
        const startX = random(width * .12, width * .88);
        const targetX = random(width * .09, width * .91);
        const targetY = random(height * .12, height * .62);
        rockets.push({ x: startX, y: height + 28, startX, targetX, targetY,
            startY: height + 28, age: 0, duration: random(.8, 1.2), trail: [] });
    }

    function burst(x, y) {
        const small = motion.matches;
        const count = small ? 32 : width < 600 ? 106 : 140;
        const speed = Math.min(width, height, 550) * random(.008, .012);
        const colorOffset = Math.floor(random(0, colors.length));
        for (let i = 0; i < count; i++) {
            const angle = i / count * Math.PI * 2 + random(-.024, .024);
            const outer = i % 4 !== 0;
            const velocity = speed * (outer ? random(.7, 1.15) : random(.25, .58));
            particles.push({ x, y, vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity * .92, age: 0, life: random(1.35, 2.55),
                color: colors[(i + colorOffset) % colors.length],
                trail: [], glitter: false, seed: random(0, Math.PI * 2) });
        }
        if (!small) flashes.push({ x, y, age: 0 });
        // Keep a fixed upper bound even during long visits on mobile.
        const limit = width < 600 ? 1000 : 1600;
        if (particles.length > limit) particles.splice(0, particles.length - limit);
    }

    function drawRocket(rocket, delta) {
        rocket.age += delta;
        const t = Math.min(rocket.age / rocket.duration, 1);
        const eased = 1 - Math.pow(1 - t, 1.65);
        rocket.trail.push({ x: rocket.x, y: rocket.y });
        if (rocket.trail.length > 12) rocket.trail.shift();
        rocket.x = rocket.startX + (rocket.targetX - rocket.startX) * eased;
        rocket.y = rocket.startY + (rocket.targetY - rocket.startY) * eased;
        ctx.lineWidth = 1.1;
        for (let i = 1; i < rocket.trail.length; i++) {
            ctx.globalAlpha = (i / rocket.trail.length) * .8;
            ctx.strokeStyle = i % 3 === 0 ? '#dce7f5' : '#4385df';
            ctx.beginPath();
            ctx.moveTo(rocket.trail[i - 1].x, rocket.trail[i - 1].y);
            ctx.lineTo(rocket.trail[i].x, rocket.trail[i].y);
            ctx.stroke();
        }
        ctx.globalAlpha = .95;
        if (logo.complete && logo.naturalWidth) {
            ctx.drawImage(logo, rocket.x - 15, rocket.y - 15, 30, 30);
        }
        if (t === 1) burst(rocket.x, rocket.y);
        return t < 1;
    }

    function drawParticle(particle, delta, step) {
        particle.age += delta;
        if (particle.age >= particle.life) return false;
        particle.trail.push({ x: particle.x, y: particle.y });
        if (particle.trail.length > (particle.glitter ? 2 : 11)) particle.trail.shift();
        const drag = Math.pow(particle.glitter ? .965 : .981, step);
        particle.vx *= drag;
        particle.vy = particle.vy * drag + (particle.glitter ? .025 : .036) * step;
        particle.x += particle.vx * step;
        particle.y += particle.vy * step;
        const fade = Math.pow(1 - particle.age / particle.life, .55);
        const twinkle = particle.age < .6 ? 1 : .55 + .45 * Math.sin(particle.age * 19 + particle.seed) ** 2;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = particle.glitter ? .85 : 1.3;
        ctx.globalAlpha = fade * twinkle * .88;
        if (particle.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(particle.trail[0].x, particle.trail[0].y);
            for (let i = 1; i < particle.trail.length; i++) {
                ctx.lineTo(particle.trail[i].x, particle.trail[i].y);
            }
            ctx.lineTo(particle.x, particle.y);
            ctx.stroke();
        }
        ctx.globalAlpha = fade * twinkle;
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.glitter ? 1 : 1.4, particle.glitter ? 1 : 1.4);
        return true;
    }

    function tick(time) {
        if (!running) return;
        const delta = Math.min((time - (lastTime || time)) / 1000, .04);
        lastTime = time;
        ctx.clearRect(0, 0, width, height);
        if (time >= nextLaunch) {
            launch();
            launches++;
            if (!motion.matches && launches % 3 === 0) launch();
            nextLaunch = time + (motion.matches ? 2200 : launches < 3 ? 340 : random(550, 950));
        }
        rockets = rockets.filter(rocket => drawRocket(rocket, delta));
        // Emit fine, short-lived silver embers behind the longer blue rays.
        const glitter = [];
        if (!motion.matches) {
            for (const particle of particles) {
                if (!particle.glitter && particle.age > .35 && Math.random() < delta * 6) {
                    glitter.push({ x: particle.x, y: particle.y, vx: particle.vx * .18,
                        vy: particle.vy * .18, age: 0, life: random(.25, .65), color: '#dce8fa',
                        trail: [], glitter: true, seed: particle.seed });
                }
            }
        }
        particles = particles.filter(particle => drawParticle(particle, delta, delta * 60));
        const limit = width < 600 ? 1000 : 1600;
        particles.push(...glitter.slice(0, Math.max(0, limit - particles.length)));
        flashes = flashes.filter(flash => {
            flash.age += delta;
            if (flash.age > .22) return false;
            const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, 38);
            glow.addColorStop(0, 'rgba(180,215,255,' + (.22 * (1 - flash.age / .22)) + ')');
            glow.addColorStop(1, 'rgba(100,160,255,0)');
            ctx.globalAlpha = 1;
            ctx.fillStyle = glow;
            ctx.fillRect(flash.x - 38, flash.y - 38, 76, 76);
            return true;
        });
        ctx.globalAlpha = 1;
        frame = window.requestAnimationFrame(tick);
    }

    function pause() {
        running = false;
        window.cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
    }

    function resume() {
        if (!dialog.open || running || document.hidden || !ctx) return;
        running = true;
        nextLaunch = 0;
        frame = window.requestAnimationFrame(tick);
    }

    function cleanup() {
        pause();
        rockets = []; particles = []; flashes = [];
        ctx?.clearRect(0, 0, width, height);
        dialog.classList.remove('is-revealing');
        document.body.style.overflow = overflow;
        window.removeEventListener('resize', resize);
        const focusTarget = previousFocus?.isConnected && previousFocus !== document.body
            ? previousFocus : document.querySelector('#home-tabs [data-home-tab="home"]');
        focusTarget?.focus({ preventScroll: true });
    }

    function tryOpen() {
        if (shown || document.hidden) return;
        const home = document.getElementById('home-screen');
        const loader = document.getElementById('app-loader');
        if (!home || home.classList.contains('hidden') || window.homeActiveTab !== 'home') return;
        if (loader && !loader.hidden && getComputedStyle(loader).display !== 'none') return;
        shown = true;
        readyObserver.disconnect();
        unsubscribe?.();
        previousFocus = document.activeElement;
        overflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        resize();
        dialog.classList.add('is-revealing');
        closeButton.focus({ preventScroll: true });
        window.addEventListener('resize', resize);
        resume();
    }

    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
    dialog.addEventListener('close', cleanup);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause();
        else if (dialog.open) resume();
        else tryOpen();
    });
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', resume);
    const readyObserver = new MutationObserver(tryOpen);
    for (const id of ['app-loader', 'home-screen', 'apple-tv-banner']) {
        const element = document.getElementById(id);
        if (element) readyObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    if (window.enjoyAppLoading?.subscribe) {
        unsubscribe = window.enjoyAppLoading.subscribe(() => window.queueMicrotask(tryOpen));
    }
    tryOpen();
})();
