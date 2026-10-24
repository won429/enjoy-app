(function (root) {
    'use strict';
    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
    const COLLECTION = 'consultation_reservations';
    function koreaNow(now = Date.now()) {
        return new Date(Number(now) + 9 * 60 * 60 * 1000).toISOString();
    }
    function validate(input, now = Date.now()) {
        const date = String(input.date || '');
        const parsed = new Date(date + 'T00:00:00+09:00');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || koreaNow(parsed.getTime()).slice(0, 10) !== date) throw new Error('상담을 원하는 날짜를 선택해 주세요.');
        if (date < koreaNow(now).slice(0, 10)) throw new Error('오늘 이후의 날짜를 선택해 주세요.');
        const weekdays = [...new Set(input.weekdays || [])].sort();
        if (!weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('전화 가능한 요일을 하나 이상 선택해 주세요.');
        const weekday = new Date(parsed.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
        if (!weekdays.includes(weekday)) throw new Error('선택한 상담 날짜의 요일도 전화 가능한 요일에 포함해 주세요.');
        const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
        if (!validTime(input.time)) throw new Error('상담을 원하는 시간을 선택해 주세요.');
        if (Date.parse(date + 'T' + input.time + ':00+09:00') <= Number(now)) throw new Error('이미 지난 시간이에요. 앞으로 전화 가능한 시간을 선택해 주세요.');
        const purpose = String(input.purpose || '').trim();
        if (purpose.length > 1000) throw new Error('상담 목적은 1,000자 이내로 적어 주세요.');
        return { date, weekdays, time: input.time, purpose, timezone: 'Asia/Seoul' };
    }
    function identity() {
        return root.meetingAuthed && !root.enjoyIsLocalGuest?.() && !root.enjoyUser?.isAnonymous && root.enjoyUser?.uid ? root.enjoyUser : null;
    }
    async function save(input, id) {
        const schedule = validate(input);
        const user = identity();
        if (!user) throw new Error('상담 예약은 구글 로그인 후 이용해 주세요.');
        if (!root.meetingDb || !root.fsDoc || !root.runTransaction || !root.fsServerTimestamp || !root.getEnjoyIdToken) throw new Error('서버에 연결 중이에요. 잠시 후 다시 시도해 주세요.');
        if (!await root.getEnjoyIdToken() || identity()?.uid !== user.uid) throw new Error('로그인 상태가 변경되었어요. 다시 로그인해 주세요.');
        const ref = root.fsDoc(COLLECTION, id);
        if (ref.localOnly) throw new Error('구글 로그인 후 다시 예약해 주세요.');
        const result = await root.runTransaction(root.meetingDb, async transaction => {
            const previous = await transaction.get(ref);
            if (identity()?.uid !== user.uid) throw new Error('로그인 상태가 변경되었어요. 다시 로그인해 주세요.');
            if (previous.exists()) {
                if (previous.data().uid !== user.uid) throw new Error('예약 정보를 확인하지 못했어요. 창을 다시 열어 주세요.');
                return previous.data();
            }
            const reservation = { ...schedule, uid: user.uid,
                name: String(root.enjoyProfileName || user.displayName || '엔조이 회원').trim(),
                email: String(user.email || ''), status: 'pending', schemaVersion: 2,
                createdAt: root.fsServerTimestamp() };
            transaction.set(ref, reservation);
            return reservation;
        });
        if (identity()?.uid !== user.uid) throw new Error('로그인 상태가 변경되었어요. 예약 접수 여부는 관리자에게 확인해 주세요.');
        return result;
    }
    const api = { validate, save, koreaNow, WEEKDAYS, COLLECTION };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (!root.document) return;
    const dialog = root.document.getElementById('consultation-dialog');
    if (!dialog) return;
    const form = dialog.querySelector('form');
    const fields = form.querySelector('fieldset');
    const error = dialog.querySelector('[data-booking-error]');
    const success = dialog.querySelector('[data-booking-success]');
    const submit = form.querySelector('[type="submit"]');
    const date = form.elements.namedItem('date');
    function updatePickerLabels() {
        ['time', 'date'].forEach(name => {
            const input = form.elements.namedItem(name);
            const display = form.querySelector('[data-booking-display="' + name + '"]');
            if (!display) return;
            display.textContent = input.value ? (name === 'date' ? input.value.replaceAll('-', '.') : input.value) : (name === 'date' ? '날짜 선택' : '시간 선택');
            display.parentElement.classList.toggle('is-empty', !input.value);
        });
    }
    form.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
        input.addEventListener('input', updatePickerLabels);
        input.addEventListener('change', updatePickerLabels);
        input.addEventListener('click', () => {
            // Keep the platform's native picker while rendering a bounded, consistent field.
            if (typeof input.showPicker === 'function') {
                try { input.showPicker(); } catch (_) { /* Older Safari uses its normal input action. */ }
            }
        });
    });
    const header = dialog.querySelector('.booking-header');
    const mark = dialog.querySelector('.booking-status-mark');
    const progress = dialog.querySelector('[data-booking-progress]');
    const canvas = mark.querySelector('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
    const done = new root.Image(), orbit = new root.Image();
    // Use the actual loading-island sprites, including its exact 30→66 check frames.
    done.src = 'assets/loading-island/done.webp';
    orbit.src = 'assets/loading-island/orbit.webp?v=20261019-10';
    const doneReady = done.decode ? done.decode().catch(() => null) : Promise.resolve();
    let saving = false, requestId = '', previousFocus = null, orbitFrame = 0;
    const newId = () => root.crypto.randomUUID();
    const rem = () => parseFloat(root.getComputedStyle(root.document.documentElement).fontSize) || 16;
    function stopOrbit() { root.cancelAnimationFrame(orbitFrame); orbitFrame = 0; }
    function removeSpriteBackground() {
        // The original island sprites include a black matte. Unmatte it so the
        // same animation blends into the reservation window in either theme.
        const frame = context.getImageData(0, 0, 256, 256);
        const pixels = frame.data;
        for (let i = 0; i < pixels.length; i += 4) {
            const peak = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
            if (peak <= 8) { pixels[i + 3] = 0; continue; }
            const scale = 255 / peak;
            pixels[i] *= scale;
            pixels[i + 1] *= scale;
            pixels[i + 2] *= scale;
            pixels[i + 3] *= peak / 255;
        }
        context.putImageData(frame, 0, 0);
    }
    function drawCheck(frame) {
        const available = context && done.complete && done.naturalWidth;
        mark.classList.toggle('is-check-fallback', !available);
        mark.classList.remove('is-orbit-fallback');
        if (!available) return;
        context.clearRect(0, 0, 256, 256);
        context.drawImage(done, (frame % 8) * 256, Math.floor(frame / 8) * 256, 256, 256, 0, 0, 256, 256);
        removeSpriteBackground();
    }
    function startOrbit() {
        stopOrbit();
        const started = root.performance.now();
        mark.classList.remove('is-check-fallback');
        function tick(now) {
            const available = context && orbit.complete && orbit.naturalWidth;
            mark.classList.toggle('is-orbit-fallback', !available);
            if (available) {
                const position = reducedMotion.matches ? 0 : (now - started) * 90 / 1250;
                const index = Math.floor(position), fraction = position - index;
                context.clearRect(0, 0, 256, 256);
                context.save();
                context.globalCompositeOperation = 'lighter';
                [index, index + 1].forEach((frame, side) => {
                    const tile = frame % 180;
                    context.globalAlpha = side ? fraction : 1 - fraction;
                    context.drawImage(orbit, (tile % 8) * 128, Math.floor(tile / 8) * 128, 128, 128, 0, 0, 256, 256);
                });
                context.restore();
                removeSpriteBackground();
            }
            if (!reducedMotion.matches) orbitFrame = root.requestAnimationFrame(tick);
        }
        tick(started);
    }
    async function playCheck() {
        await doneReady;
        stopOrbit();
        dialog.dataset.bookingState = 'checking';
        progress.textContent = '예약이 접수되었습니다.';
        if (reducedMotion.matches) { drawCheck(66); return; }
        await new Promise(resolve => {
            const started = root.performance.now();
            function tick(now) {
                const elapsed = now - started;
                drawCheck(Math.min(66, 30 + Math.floor(elapsed * 60 / 1000)));
                if (elapsed >= 760) resolve();
                else root.requestAnimationFrame(tick);
            }
            root.requestAnimationFrame(tick);
        });
    }
    async function animate(element, frames, options) {
        if (reducedMotion.matches || !element.animate) return;
        await element.animate(frames, options).finished.catch(() => {});
    }
    async function shrinkToIsland() {
        const from = dialog.getBoundingClientRect(), radius = root.getComputedStyle(dialog).borderRadius;
        const size = 6.5 * rem();
        dialog.style.width = size + 'px'; dialog.style.height = size + 'px';
        dialog.dataset.bookingState = 'saving';
        header.hidden = true; form.hidden = true; success.hidden = true; mark.hidden = false;
        dialog.scrollTop = 0;
        progress.textContent = '상담 예약을 접수하고 있어요.';
        startOrbit();
        await animate(dialog, [{width: from.width + 'px', height: from.height + 'px', borderRadius: radius}, {width: size + 'px', height: size + 'px', borderRadius: 1.875 * rem() + 'px'}], {duration: 380, easing: 'cubic-bezier(.22,1,.36,1)'});
    }
    async function expandResult(complete) {
        const from = dialog.getBoundingClientRect();
        dialog.dataset.bookingState = complete ? 'complete' : 'form';
        header.hidden = complete; form.hidden = complete; success.hidden = !complete; mark.hidden = !complete;
        dialog.setAttribute('aria-labelledby', complete ? 'consultation-complete-title' : 'consultation-title');
        if (complete) dialog.removeAttribute('aria-describedby');
        else dialog.setAttribute('aria-describedby', 'consultation-intro');
        dialog.style.width = ''; dialog.style.height = '';
        const target = dialog.getBoundingClientRect(), radius = root.getComputedStyle(dialog).borderRadius;
        const markTop = root.getComputedStyle(mark).top;
        dialog.style.width = target.width + 'px'; dialog.style.height = target.height + 'px';
        dialog.scrollTop = 0;
        await Promise.all([
            animate(dialog, [{width: from.width + 'px', height: from.height + 'px', borderRadius: 1.875 * rem() + 'px'}, {width: target.width + 'px', height: target.height + 'px', borderRadius: radius}], {duration: 460, easing: 'cubic-bezier(.22,1,.36,1)'}),
            complete ? animate(mark, [{top: from.height / 2 + 'px'}, {top: markTop}], {duration: 460, easing: 'cubic-bezier(.22,1,.36,1)'}) : Promise.resolve(),
            animate(dialog.querySelector('.booking-body'), [{opacity: 0}, {opacity: 1}], {duration: 280, delay: 160, fill: 'backwards'})
        ]);
        dialog.style.width = ''; dialog.style.height = '';
    }
    root.openEnjoyConsultation = function () {
        if (dialog.open) return;
        previousFocus = root.document.activeElement;
        stopOrbit();
        dialog.dataset.bookingState = 'form';
        dialog.style.width = ''; dialog.style.height = '';
        dialog.setAttribute('aria-labelledby', 'consultation-title');
        dialog.setAttribute('aria-describedby', 'consultation-intro');
        form.reset(); form.hidden = false; header.hidden = false; success.hidden = true; mark.hidden = true;
        error.textContent = ''; progress.textContent = '';
        requestId = newId(); fields.disabled = false; date.min = koreaNow().slice(0, 10);
        updatePickerLabels();
        dialog.showModal();
        dialog.scrollTop = 0;
        dialog.querySelector('[data-booking-title]').focus({ preventScroll: true });
    };
    const close = () => { if (!saving) dialog.close(); };
    dialog.querySelectorAll('[data-booking-close]').forEach(button => button.addEventListener('click', close));
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => { stopOrbit(); previousFocus?.focus?.({ preventScroll: true }); });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (saving || !form.reportValidity()) return;
        error.textContent = '';
        const input = { date: date.value, weekdays: Array.from(form.querySelectorAll('[name="weekday"]:checked'), checkbox => Number(checkbox.value)),
            time: form.elements.namedItem('time').value, purpose: form.elements.namedItem('purpose').value };
        let shrunk = false;
        try {
            validate(input);
            if (!identity()) throw new Error('상담 예약은 구글 로그인 후 이용해 주세요.');
            saving = true; fields.disabled = true; submit.textContent = '예약 접수 중…';
            dialog.setAttribute('aria-busy', 'true');
            // Observe rejection immediately while the window shrinks, so fast failures never look like success.
            const outcome = save(input, requestId).then(value => ({value}), failure => ({failure}));
            shrunk = true;
            await shrinkToIsland();
            const result = await outcome;
            if (result.failure) throw result.failure;
            const reservation = result.value;
            const weekday = new Date(reservation.date + 'T12:00:00+09:00').getUTCDay();
            success.querySelector('[data-booking-summary]').textContent = reservation.date.replaceAll('-', '.') + ' (' + WEEKDAYS[weekday] + ') · ' + (reservation.time || reservation.startTime);
            await playCheck();
            await expandResult(true);
            // The same canvas stays on frame 66 as it moves into the completed window.
            success.querySelector('h3').focus({ preventScroll: true });
        } catch (failure) {
            stopOrbit();
            error.textContent = failure.code === 'permission-denied' || failure.code === 'firestore/permission-denied'
                ? '예약 접수 권한을 확인하지 못했어요. 로그인 상태를 확인하거나 관리자에게 문의해 주세요.'
                : failure.code ? '서버에 저장하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.' : failure.message;
            progress.textContent = '';
            if (shrunk) await expandResult(false);
        } finally {
            saving = false; fields.disabled = false; submit.textContent = '상담 예약하기'; dialog.removeAttribute('aria-busy');
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
