(function (root) {
    'use strict';

    // Keep readiness independent of the animation library and of cached values.
    function sourceState(snapshot, sources) {
        if (!snapshot || snapshot.mode !== 'member') return { ready: true, failed: [], slow: [] };
        const confirmed = snapshot.confirmed || [];
        return {
            ready: sources.every(source => confirmed.includes(source)),
            failed: sources.filter(source => snapshot.states[source] === 'error'),
            slow: sources.filter(source => snapshot.states[source] === 'slow')
        };
    }
    function sampleRects(shape, width, height) {
        if (shape === 'control') return [{ x: 16, y: Math.max(0, (height - 14) / 2), width: Math.max(24, width - 32), height: 14, radius: '6px' }];
        const w = Math.max(160, width), pad = Math.min(24, w * .06), gap = 14;
        const rects = [];
        const box = (x, y, bw, bh, radius = '6px') => rects.push({ x, y, width: bw, height: bh, radius });
        if (shape === 'map' || shape === 'game') {
            box(pad, pad, w * .3, 24);
            const mapHeight = Math.max(100, height - pad * 2 - 112);
            box(pad, pad + 56, w - pad * 2, mapHeight, '16px');
            for (let n = 0; n < 3; n++) box(pad + n * ((w - pad * 2) / 3 + 3), pad + 72 + mapHeight, (w - pad * 2) / 3 - 8, 40, '14px');
        } else if (shape === 'calendar') {
            box(pad, pad, w * .46, 24);
            const cell = (w - pad * 2 - 36) / 7;
            for (let n = 0; n < 35; n++) box(pad + n % 7 * (cell + 6), 78 + Math.floor(n / 7) * 48, cell, 36, '8px');
        } else if (shape === 'reader') {
            box(pad, 28, w * .32, 16); box(pad, 90, w * .72, 28);
            for (let n = 0; n < 13; n++) box(pad, 166 + n * 30, (w - pad * 2) * (n % 4 === 3 ? .65 : 1), 13);
        } else if (shape === 'cards' || shape === 'novel') {
            box(pad, 26, w * .38, 24);
            box(pad, 86, w * .3, 162, '12px');
            for (let n = 0; n < 4; n++) box(w * .4, 94 + n * 34, w * (n === 3 ? .24 : .5), n ? 12 : 20);
            for (let n = 0; n < 4; n++) box(pad, 286 + n * 28, (w - pad * 2) * (n === 3 ? .7 : 1), 12);
        } else {
            box(pad, 24, w * .46, 22);
            const rows = Math.max(2, Math.min(7, Math.floor((height - 82) / 72)));
            for (let n = 0; n < rows; n++) {
                const y = 82 + n * 72;
                box(pad, y, 36, 36, '50%');
                box(pad + 36 + gap, y + 2, (w - pad * 2 - 50) * .72, 14);
                box(pad + 36 + gap, y + 26, (w - pad * 2 - 50) * .92, 10);
            }
        }
        return rects;
    }
    function samePage(actual, expected, base) {
        try {
            const key = value => { const url = new URL(value, base); return url.origin + url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '') + url.search; };
            return key(actual) === key(expected);
        } catch (_) { return false; }
    }
    if (typeof module === 'object' && module.exports) module.exports = { sourceState, sampleRects, samePage };
    if (!root?.document) return;
    const doc = root.document, script = doc.currentScript;
    const base = new URL('.', script.src), page = script.dataset.skeletonPage || 'page';
    const records = new Map(), memories = new Map(), frames = new Map(), imageRecords = new Map();
    const enhanced = new Set();
    let skullet = null, scanFrame = 0, booted = false, subscribed = false, pageFinished = false, earlyRecord = null;
    const motion = root.matchMedia('(prefers-reduced-motion: reduce)');
    const legacy = '.app-sk-block,.home-sk-block,.kbo-skeleton-block,.bds-block,.wallet-skeleton-block,.iv-skeleton,.iv-loading-block,.novel-entry-block,.taxi-skeleton-bar,.taxi-skeleton-digits i,.taxi-skeleton-metrics i,.taxi-skeleton-buttons i,.travel-sk-bar,.travel-sk-dot';
    const names = { members: '멤버 목록', meeting: '모임통장', schedule: '일정', community: '글·일정' };
    const library = import(new URL('vendor/skullet-0.0.3/index.mjs', base).href).then(value => {
        skullet = value;
        records.forEach(record => draw(record));
        imageRecords.forEach(record => skullet.shimmer(record.layer));
        scheduleScan();
        return value;
    }).catch(error => { root.console?.warn('Skeleton animation unavailable; using the local fallback.', error); });

    function visible(element) {
        if (!element.isConnected || element.closest('[hidden],.hidden,.render-hidden')) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.top < root.innerHeight + 200;
    }
    function measure(element, drawing) {
        if (!skullet || !element.isConnected) return [];
        try { return skullet.measureSkeleton(element, drawing).filter(rect => rect.y < root.innerHeight * 2).slice(0, 400); }
        catch (_) { return []; }
    }
    function draw(record) {
        if (!record.layer.isConnected) return;
        if (skullet) {
            record.drawing.replaceChildren();
            record.drawing.shadowRoot?.replaceChildren();
            skullet.drawSkeleton(record.drawing, record.rects);
            record.layer.classList.add('is-native');
        } else {
            record.drawing.replaceChildren(...record.rects.map(rect => {
                const bone = doc.createElement('span'); bone.className = 'enjoy-skeleton-fallback';
                Object.assign(bone.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: rect.radius });
                return bone;
            }));
        }
    }
    function cleanup(record) {
        root.clearTimeout(record.timer); root.clearTimeout(record.slowTimer);
        record.resize?.disconnect();
        record.layer.remove(); record.notice?.remove(); record.status?.remove();
        if (records.get(record.target) !== record) return;
        record.target.removeAttribute('data-enjoy-pending');
        record.target.style.removeProperty('--enjoy-skeleton-height');
        if (record.relative) record.target.classList.remove('enjoy-skeleton-relative');
        if (record.target.getAttribute('aria-busy') === 'true') {
            if (record.busy === null) record.target.removeAttribute('aria-busy');
            else record.target.setAttribute('aria-busy', record.busy);
        }
        records.delete(record.target);
    }
    function begin(target, options = {}) {
        if (!target) return null;
        const old = records.get(target);
        if (old && !old.ended && old.layer.isConnected) return old;
        if (old) cleanup(old);
        const key = options.key || target.id;
        const bounds = target.getBoundingClientRect(), width = options.page ? Math.min(root.innerWidth, 448) : bounds.width;
        const height = options.height || (options.page ? root.innerHeight : Math.max(bounds.height, 240));
        const layer = doc.createElement('div'), drawing = doc.createElement('div');
        layer.className = 'enjoy-skeleton-layer' + (options.page ? ' is-page' : '');
        layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('skullet-ignore', '');
        drawing.className = 'enjoy-skeleton-drawing'; layer.append(drawing);
        const status = doc.createElement('span'); status.className = 'enjoy-skeleton-label enjoy-skeleton-status';
        status.setAttribute('role', 'status'); status.setAttribute('skullet-ignore', ''); status.textContent = options.label || '화면 정보를 불러오는 중';
        const record = { target, layer, drawing, status, key, options, width, height, ended: false, busy: target.getAttribute('aria-busy'), relative: !options.page && getComputedStyle(target).position === 'static' };
        if (record.relative) target.classList.add('enjoy-skeleton-relative');
        target.append(layer, status);
        const memory = memories.get(key);
        const actual = options.measure ? measure(target, drawing) : [];
        record.rects = actual.length ? actual : memory && Math.abs(memory.width - width) < 2 ? memory.rects : sampleRects(options.shape || page, width || 360, height);
        records.set(target, record);
        target.style.setProperty('--enjoy-skeleton-height', options.page ? '0px' : height + 'px');
        target.setAttribute('data-enjoy-pending', ''); target.setAttribute('aria-busy', 'true');
        draw(record);
        if (options.immediate) layer.classList.add('is-visible');
        else record.timer = root.setTimeout(() => { if (!record.ended) layer.classList.add('is-visible'); }, 150);
        if (root.ResizeObserver) {
            record.resize = new ResizeObserver(() => {
                const next = options.page ? Math.min(root.innerWidth, 448) : target.getBoundingClientRect().width;
                if (Math.abs(next - record.width) < 1) return;
                const ratio = next / (record.width || next);
                record.rects = record.rects.map(rect => ({ ...rect, x: rect.x * ratio, width: rect.width * ratio }));
                record.width = next; draw(record);
            });
            record.resize.observe(target);
        }
        return record;
    }
    function end(target, { cancel = false } = {}) {
        const record = records.get(target);
        if (!record || record.ended) return;
        record.ended = true;
        target.removeAttribute('data-enjoy-pending');
        // A caller may have already marked this region as ready.
        if (target.getAttribute('aria-busy') === 'true') target.setAttribute('aria-busy', 'false');
        root.clearTimeout(record.timer); root.clearTimeout(record.slowTimer); record.notice?.remove(); record.status?.remove();
        if (!cancel && record.key && !record.options.page) {
            const rects = measure(target, record.drawing);
            if (rects.length) memories.set(record.key, { width: record.width, rects });
            if (memories.size > 60) memories.delete(memories.keys().next().value);
        }
        if (cancel || motion.matches || !record.layer.classList.contains('is-visible')) cleanup(record);
        else { record.layer.classList.add('is-leaving'); record.timer = root.setTimeout(() => cleanup(record), 180); }
    }
    function notice(record, message, retry) {
        if (!record.notice) {
            record.notice = doc.createElement('div'); record.notice.className = 'enjoy-skeleton-notice';
            record.notice.setAttribute('role', 'status'); record.target.append(record.notice);
        }
        if (record.notice.dataset.message === message) return;
        record.notice.dataset.message = message;
        const text = doc.createElement('p'); text.textContent = message;
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = '다시 연결';
        button.addEventListener('click', retry); record.notice.replaceChildren(text, button);
    }
    function markup(shape = 'rows', label = '정보를 불러오는 중') {
        const safe = String(label).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        return '<div class="enjoy-loading-sample" role="status"><span class="enjoy-skeleton-label">' + safe + '</span><div aria-hidden="true">' +
            Array.from({ length: shape === 'comments' ? 3 : 5 }, () => '<div class="enjoy-loading-row" style="margin-bottom:20px"><span class="enjoy-loading-bone enjoy-loading-avatar"></span><div class="enjoy-loading-copy"><span class="enjoy-loading-bone" style="width:64%"></span><span class="enjoy-loading-bone" style="width:90%;height:10px"></span></div></div>').join('') + '</div></div>';
    }
    function bindSources() {
        if (subscribed || !root.enjoyAppLoading?.subscribe) return;
        subscribed = true;
        root.enjoyAppLoading.subscribe(() => scheduleScan());
    }
    function sources() {
        const snapshot = root.enjoyAppLoading?.snapshot();
        if (!snapshot) return;
        doc.querySelectorAll('[data-enjoy-sources]').forEach(target => {
            const deps = target.dataset.enjoySources.split(' '), state = sourceState(snapshot, deps);
            if (state.ready || !visible(target)) { end(target, { cancel: !visible(target) }); return; }
            const record = begin(target, { shape: target.dataset.skeletonShape || 'rows' });
            const busy = String(!state.failed.length);
            if (target.getAttribute('aria-busy') !== busy) target.setAttribute('aria-busy', busy);
            const waiting = state.failed.length ? state.failed : state.slow;
            if (waiting.length) notice(record, waiting.map(source => names[source] || source).join(', ') + (state.failed.length ? ' 정보를 불러오지 못했어요.' : ' 연결을 기다리고 있어요.'), () => waiting.forEach(source => root.enjoyAppLoading.retry(source)));
            else { record.notice?.remove(); record.notice = null; }
        });
    }
    function enhanceBars() {
        doc.querySelectorAll(legacy + ',.enjoy-loading-bone').forEach(bone => {
            if (!skullet || !visible(bone)) return;
            if (enhanced.has(bone)) return;
            bone.setAttribute('data-enjoy-skullet-bar', ''); enhanced.add(bone);
            skullet.shimmer(bone);
        });
        enhanced.forEach(bone => {
            if (bone.isConnected && visible(bone)) return;
            bone.getAnimations?.().forEach(animation => animation.cancel());
            enhanced.delete(bone); bone.removeAttribute('data-enjoy-skullet-bar');
        });
    }
    function spinnerPlaceholders() {
        doc.querySelectorAll('i.fa-spin,i.ph-circle-notch').forEach(icon => {
            if (!visible(icon) || icon.closest('button,[role="button"],.enjoy-skeleton-layer')) return;
            const target = icon.parentElement;
            if (!/불러오|준비하고|연결하고/.test(target.textContent) || /못했|실패/.test(target.textContent)) return;
            target.classList.add('enjoy-loading-placeholder');
            const record = begin(target, { shape: 'rows', height: 240 });
            record.spinner = icon;
        });
        records.forEach(record => {
            if (record.spinner && (!record.spinner.isConnected || !record.spinner.matches('.fa-spin,.ph-circle-notch') || /못했|실패/.test(record.target.textContent))) end(record.target, { cancel: true });
        });
    }
    function existingOverlays() {
        const loginButton = doc.getElementById('login-google-btn');
        if (loginButton) {
            const text = doc.getElementById('login-status')?.textContent || '';
            if (loginButton.disabled && /준비/.test(text) && !/못|오류|실패/.test(text)) begin(loginButton, { shape: 'control', height: loginButton.getBoundingClientRect().height, label: '로그인 화면을 준비하는 중' });
            else end(loginButton);
        }
        const browser = doc.getElementById('browser-screen');
        const browserLoader = doc.getElementById('browser-loader');
        if (browserLoader) {
            const busy = browser?.getAttribute('aria-busy') === 'true' && !browser.matches('.is-travel-browser,.is-novel-preview') && visible(browserLoader);
            if (busy) {
                const url = doc.getElementById('internal-browser-frame')?.getAttribute('src') || '';
                begin(browserLoader, { shape: /jiha|study|travel/.test(url) ? 'map' : /novels/.test(url) ? 'reader' : 'rows', height: browser.clientHeight });
            } else end(browserLoader, { cancel: !visible(browserLoader) });
        }
        for (const id of ['notion-info-loader', 'member-delivery-map-fallback', 'village-status']) {
            const target = doc.getElementById(id);
            if (!target) continue;
            const busy = visible(target) && (id === 'notion-info-loader' || /불러오는 중|준비하고/.test(target.textContent)) && !/못했|실패/.test(target.textContent);
            if (busy) begin(target, { shape: id === 'village-status' ? 'game' : id === 'member-delivery-map-fallback' ? 'map' : 'rows' });
            else end(target, { cancel: true });
        }
    }
    function watchFrame(frame, explicit = false) {
        if (frames.has(frame)) return;
        // These already wait for verified data or have a purpose-built placeholder.
        if (['baseball-game-frame', 'internal-browser-frame', 'notion-info-frame'].includes(frame.id)) return;
        if (!explicit && !frame.id.endsWith('-game-frame') && !frame.hasAttribute('data-enjoy-frame')) return;
        const parent = frame.parentElement;
        if (!parent || frame.closest('.enjoy-skeleton-layer')) return;
        const state = { src: '', record: null, generation: 0, explicit: '' };
        frames.set(frame, state);
        frame.addEventListener('load', () => {
            if (!state.src) return;
            try {
                if (frame.contentDocument?.documentElement.dataset.enjoyPageReady === 'false') return;
                if (!samePage(frame.contentWindow.location.href, state.src, root.location.href)) return;
            } catch (_) { /* A cross-origin frame is ready when its load event arrives. */ }
            end(parent); state.record = null;
        });
        frame.addEventListener('error', () => {
            if (state.record) notice(state.record, '화면을 불러오지 못했어요.', () => { frame.src = state.src; });
        });
    }
    function frameLoading(frame, url) {
        if (!frame) return;
        watchFrame(frame, true);
        const state = frames.get(frame);
        if (state) { state.explicit = url; state.src = ''; scheduleScan(); }
    }
    function scanFrames() {
        doc.querySelectorAll('iframe').forEach(frame => watchFrame(frame));
        frames.forEach((state, frame) => {
            if (!frame.isConnected) { end(frame.parentElement, { cancel: true }); frames.delete(frame); return; }
            const src = state.explicit || frame.getAttribute('src') || '';
            if (!src || src === 'about:blank' || !visible(frame)) { if (state.record) end(frame.parentElement, { cancel: true }); state.record = null; state.src = ''; return; }
            if (src === state.src) return;
            state.src = src; state.generation++;
            try { if (samePage(frame.contentWindow.location.href, src, root.location.href) && frame.contentDocument?.documentElement.dataset.enjoyPageReady === 'true') return; } catch (_) {}
            state.record = begin(frame.parentElement, { shape: /travel|jiha|study/.test(src) ? 'map' : /novels/.test(src) ? 'reader' : 'game', height: frame.clientHeight || root.innerHeight });
            const generation = state.generation;
            state.record.slowTimer = root.setTimeout(() => {
                if (generation === state.generation && state.record && !state.record.ended) notice(state.record, '화면 연결이 평소보다 오래 걸리고 있어요.', () => { state.src = ''; frame.src = src; scheduleScan(); });
            }, 20000);
        });
    }
    function imageSkeletons() {
        doc.querySelectorAll('img').forEach(image => {
            const current = imageRecords.get(image);
            if (current && current.src !== image.getAttribute('src')) current.done();
            if (imageRecords.has(image) || image.complete || !visible(image) || image.closest('[data-enjoy-pending],.enjoy-skeleton-layer')) return;
            const rect = image.getBoundingClientRect();
            if (rect.width < 24 || rect.height < 24) return;
            const parent = image.parentElement;
            if (!parent || parent.matches('picture') || parent.classList.contains('enjoy-skeleton-relative') || !parent.getBoundingClientRect().width || getComputedStyle(parent).position === 'static') return;
            const layer = doc.createElement('span'); layer.className = 'enjoy-skeleton-layer is-visible';
            layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('skullet-ignore', '');
            const p = parent.getBoundingClientRect(), relative = getComputedStyle(parent).position === 'static';
            if (relative) parent.classList.add('enjoy-skeleton-relative');
            Object.assign(layer.style, { inset: 'auto', left: rect.left - p.left + parent.scrollLeft + 'px', top: rect.top - p.top + parent.scrollTop + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: getComputedStyle(image).borderRadius, backgroundColor: 'var(--skullet-base)' });
            parent.append(layer); if (skullet) skullet.shimmer(layer);
            const record = { parent, layer, relative, src: image.getAttribute('src') };
            const done = () => {
                if (imageRecords.get(image) !== record) return;
                layer.remove(); if (relative && !parent.querySelector('.enjoy-skeleton-layer')) parent.classList.remove('enjoy-skeleton-relative');
                imageRecords.delete(image); image.removeEventListener('load', loaded); image.removeEventListener('error', done);
            };
            const loaded = () => {
                if (typeof image.decode !== 'function') { done(); return; }
                image.decode().catch(() => {}).then(done);
            };
            record.done = done; imageRecords.set(image, record);
            image.addEventListener('load', loaded, { once: true }); image.addEventListener('error', done, { once: true });
            if (image.complete) loaded();
        });
        imageRecords.forEach((record, image) => { if (!image.isConnected || !visible(image)) record.done(); });
    }
    function scan() {
        scanFrame = 0;
        bindSources(); sources(); spinnerPlaceholders(); existingOverlays(); scanFrames(); enhanceBars(); imageSkeletons();
        records.forEach(record => { if (!record.target.isConnected) cleanup(record); });
    }
    function scheduleScan() { if (!scanFrame) scanFrame = root.requestAnimationFrame(scan); }
    function pageReady() {
        if (pageFinished) return;
        pageFinished = true;
        doc.documentElement.dataset.enjoyPageReady = 'true';
        if (!['app', 'baseball', 'taxi'].includes(page)) end(doc.body);
        if (root.parent !== root) root.parent.postMessage({ type: 'enjoy:page-ready', href: root.location.href }, root.location.origin);
        scheduleScan();
    }
    function pageError(message) {
        const record = records.get(doc.body);
        if (!record) { pageReady(); return; }
        notice(record, message || '화면을 불러오지 못했어요. 연결을 확인해 주세요.', () => root.location.reload());
        doc.body.setAttribute('aria-busy', 'false');
        if (root.parent !== root) root.parent.postMessage({ type: 'enjoy:page-error', href: root.location.href }, root.location.origin);
    }
    root.enjoySkeletons = { begin, end, markup, frameLoading, pageReady, pageError, refresh: scheduleScan, library };
    doc.documentElement.dataset.enjoyPageReady = 'false';
    function boot() {
        if (booted || !doc.body) return;
        booted = true;
        const immediate = earlyRecord?.layer.classList.contains('is-visible');
        if (earlyRecord) { cleanup(earlyRecord); earlyRecord = null; }
        if (!['app', 'baseball', 'taxi'].includes(page)) {
            const record = begin(doc.body, { page: true, shape: page, immediate });
            record.slowTimer = root.setTimeout(() => { if (!pageFinished) notice(record, '화면을 준비하는 데 시간이 걸리고 있어요.', () => root.location.reload()); }, 20000);
        }
    }
    const observer = new MutationObserver(mutations => {
        boot();
        if (mutations.some(change => !change.target.closest?.('.enjoy-skeleton-layer,.enjoy-skeleton-notice') && !change.target.hasAttribute?.('data-enjoy-skullet-bar'))) scheduleScan();
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'disabled', 'src', 'style', 'aria-busy', 'data-state', 'data-mode'] });
    // Show a placeholder even while a standalone page is still fetching its head scripts.
    // This node is moved out of the way as soon as the parser creates the real body.
    if (!doc.body) earlyRecord = begin(doc.documentElement, { page: true, shape: page });
    boot();
    doc.addEventListener('DOMContentLoaded', () => {
        boot(); scheduleScan();
        if (page !== 'game-auth') root.requestAnimationFrame(pageReady);
    }, { once: true });
    if (doc.readyState !== 'loading') { boot(); scheduleScan(); if (page !== 'game-auth') root.requestAnimationFrame(pageReady); }
    root.addEventListener('message', event => {
        if (event.origin !== root.location.origin || !['enjoy:page-ready', 'enjoy:page-error'].includes(event.data?.type)) return;
        frames.forEach((state, frame) => { if (event.source === frame.contentWindow && state.record && samePage(event.data.href, state.src, root.location.href)) { end(frame.parentElement); state.record = null; } });
    });
    root.addEventListener('resize', scheduleScan, { passive: true });
    doc.addEventListener('scroll', scheduleScan, { passive: true, capture: true });
    doc.addEventListener('load', scheduleScan, true);
    motion.addEventListener?.('change', () => { enhanced.forEach(bone => skullet?.shimmer(bone)); records.forEach(draw); });
    root.addEventListener('enjoy-auth-ready', () => { memories.clear(); skullet?.forgetShapes(); scheduleScan(); });
})(typeof window === 'object' ? window : null);
