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
        if (!validTime(input.startTime) || !validTime(input.endTime)) throw new Error('전화 가능한 시작 시간과 종료 시간을 선택해 주세요.');
        if (input.startTime >= input.endTime) throw new Error('종료 시간은 시작 시간보다 늦게 선택해 주세요.');
        if (Date.parse(date + 'T' + input.startTime + ':00+09:00') <= Number(now)) throw new Error('이미 지난 시간이에요. 앞으로 전화 가능한 시간을 선택해 주세요.');
        const purpose = String(input.purpose || '').trim();
        if (purpose.length > 1000) throw new Error('상담 목적은 1,000자 이내로 적어 주세요.');
        return { date, weekdays, startTime: input.startTime, endTime: input.endTime, purpose, timezone: 'Asia/Seoul' };
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
                email: String(user.email || ''), status: 'pending', schemaVersion: 1,
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
    let saving = false, requestId = '', previousFocus = null;
    const newId = () => root.crypto.randomUUID();
    root.openEnjoyConsultation = function () {
        if (dialog.open) return;
        previousFocus = root.document.activeElement;
        form.reset(); form.hidden = false; success.hidden = true; error.textContent = '';
        requestId = newId(); fields.disabled = false; date.min = koreaNow().slice(0, 10);
        dialog.showModal();
        dialog.querySelector('[data-booking-title]').focus();
    };
    const close = () => { if (!saving) dialog.close(); };
    dialog.querySelectorAll('[data-booking-close]').forEach(button => button.addEventListener('click', close));
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => previousFocus?.focus?.({ preventScroll: true }));
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (saving || !form.reportValidity()) return;
        error.textContent = '';
        const input = { date: date.value, weekdays: Array.from(form.querySelectorAll('[name="weekday"]:checked'), checkbox => Number(checkbox.value)),
            startTime: form.elements.namedItem('startTime').value, endTime: form.elements.namedItem('endTime').value,
            purpose: form.elements.namedItem('purpose').value };
        try {
            validate(input);
            saving = true; fields.disabled = true; submit.textContent = '예약 접수 중…';
            dialog.setAttribute('aria-busy', 'true');
            const reservation = await save(input, requestId);
            const weekday = new Date(reservation.date + 'T12:00:00+09:00').getUTCDay();
            success.querySelector('[data-booking-summary]').textContent = reservation.date.replaceAll('-', '.') + ' (' + WEEKDAYS[weekday] + ') · ' + reservation.startTime + '–' + reservation.endTime;
            form.hidden = true; success.hidden = false;
            success.querySelector('h3').focus();
        } catch (failure) {
            error.textContent = failure.code === 'permission-denied' || failure.code === 'firestore/permission-denied'
                ? '예약 접수 권한을 확인하지 못했어요. 로그인 상태를 확인하거나 관리자에게 문의해 주세요.'
                : failure.code ? '서버에 저장하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.' : failure.message;
        } finally {
            saving = false; fields.disabled = false; submit.textContent = '상담 예약하기'; dialog.removeAttribute('aria-busy');
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
