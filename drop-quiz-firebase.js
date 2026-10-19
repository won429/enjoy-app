(function (root) {
    'use strict';
    const ADMIN_EMAIL = 'gwanlija180@gmail.com';
    function serverMillis(value) {
        if (value && typeof value.toMillis === 'function') return value.toMillis();
        if (value && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) return value.seconds * 1000 + value.nanoseconds / 1e6;
        return NaN;
    }
    function latestSubmission(entry, uid, config) {
        return Object.entries(entry?.attempts || {}).map(([id, attempt]) => ({
            id, quizId: attempt?.quizId, uid: attempt?.uid, name: attempt?.name,
            choice: attempt?.choice, submittedAt: serverMillis(attempt?.submittedAt)
        })).filter(attempt => attempt.quizId === config.quizId && attempt.uid === uid &&
            typeof attempt.name === 'string' && config.memberNames.includes(attempt.name) &&
            Number.isInteger(attempt.choice) && attempt.choice >= 1 && attempt.choice <= 5 &&
            Number.isFinite(attempt.submittedAt) && attempt.submittedAt >= config.startsAt && attempt.submittedAt < config.closesAt
        ).sort((a, b) => b.submittedAt - a.submittedAt || b.id.localeCompare(a.id))[0] || null;
    }
    function isAdmin(user) { return !!user?.uid && String(user.email || '').trim().toLowerCase() === ADMIN_EMAIL; }
    function createStore(root, config) {
        let state = empty(), epoch = 0, unsubscribers = [], retryTimer = null, active = false, keyRequest = false;
        let profileReady = false, answerReady = false, profileOnline = false, answerOnline = false;
        let members = [], entries = new Map(), membersReady = false, entriesReady = false, membersOnline = false, entriesOnline = false;
        const notify = () => config.onChange?.(state);
        function empty() {
            return { uid: '', admin: false, member: false, loading: false, connected: false, saving: false,
                submission: null, participants: [], rosterLoading: false, rosterConnected: false, error: '', rosterError: '',
                correctChoice: null, revealing: false, revealError: '' };
        }
        function identity() {
            if (!root.meetingAuthed || root.enjoyIsLocalGuest?.() || root.enjoyUser?.isAnonymous) return null;
            return root.enjoyUser?.uid ? root.enjoyUser : null;
        }
        function ready() {
            return !!(root.meetingDb && root.fsDoc && root.fsCol && root.fsOnSnapshot && root.runTransaction && root.fsServerTimestamp && root.fsGetDocFromServer && root.getEnjoyIdToken);
        }
        function current(uid, generation) { return active && epoch === generation && identity()?.uid === uid; }
        function stopListeners() {
            unsubscribers.forEach(unsubscribe => unsubscribe()); unsubscribers = [];
            clearTimeout(retryTimer); retryTimer = null;
        }
        function updateOwn() {
            state.loading = !profileReady || !answerReady;
            state.connected = profileOnline && answerOnline;
            notify();
        }
        function updateRoster() {
            state.rosterLoading = !membersReady || !entriesReady;
            state.rosterConnected = membersOnline && entriesOnline;
            const all = new Map(members.map(member => [member.uid, member]));
            entries.forEach((entry, uid) => {
                if (!all.has(uid) && latestSubmission(entry, uid, config)) all.set(uid, { uid, name: entry.name });
            });
            state.participants = Array.from(all.values()).map(member => {
                const submission = latestSubmission(entries.get(member.uid), member.uid, config);
                return { uid: member.uid, name: submission?.name || member.name, submission };
            }).sort((a, b) => config.memberNames.indexOf(a.name) - config.memberNames.indexOf(b.name) || a.uid.localeCompare(b.uid));
            notify();
        }
        async function loadAnswerKey() {
            if (!active || !state.uid || !ready() || keyRequest || state.correctChoice !== null || Date.now() < config.closesAt) return;
            const uid = state.uid, generation = epoch;
            keyRequest = true; state.revealing = true; notify();
            try {
                // This document is readable only after the reveal time, enforced by Firestore request.time.
                const snapshot = await root.fsGetDocFromServer(root.fsDoc('drop_quiz_keys', config.quizId));
                if (!current(uid, generation)) return;
                const choice = snapshot.exists() ? snapshot.data().correctChoice : null;
                if (!Number.isInteger(choice) || choice < 1 || choice > 5) throw new Error('정답 공개 정보를 확인하지 못했어요.');
                state.correctChoice = choice; state.revealError = '';
            } catch (_) {
                if (current(uid, generation)) state.revealError = '정답 공개 시각을 서버에서 확인하고 있어요. 잠시 후 자동으로 다시 확인합니다.';
            } finally {
                if (current(uid, generation)) { keyRequest = false; state.revealing = false; notify(); }
            }
        }
        function connect(force = false) {
            if (!active) return;
            const user = identity();
            if (!force && state.uid === (user?.uid || '') && unsubscribers.length) { loadAnswerKey(); return; }
            epoch += 1; const generation = epoch; stopListeners(); keyRequest = false;
            profileReady = answerReady = profileOnline = answerOnline = false;
            members = []; entries = new Map(); membersReady = entriesReady = membersOnline = entriesOnline = false;
            state = { ...empty(), uid: user?.uid || '', admin: isAdmin(user), loading: !!user, rosterLoading: isAdmin(user) };
            notify();
            if (!user) return;
            if (!ready()) { retryTimer = setTimeout(() => connect(true), 1000); return; }
            const uid = user.uid;
            const failed = () => {
                if (!current(uid, generation)) return;
                state.loading = false; state.connected = false;
                state.error = '퀴즈 참여 기록을 불러오지 못했어요. 연결을 다시 확인해 주세요.'; notify();
            };
            const rosterFailed = () => {
                if (!current(uid, generation)) return;
                state.rosterLoading = false; state.rosterConnected = false;
                state.rosterError = '참여 현황을 불러오지 못했어요. 관리자 계정과 연결을 확인해 주세요.'; notify();
            };
            try {
                unsubscribers.push(root.fsOnSnapshot(root.fsDoc('members', uid), { includeMetadataChanges: true }, snapshot => {
                    if (!current(uid, generation)) return;
                    const member = snapshot.exists() ? snapshot.data() : null;
                    profileReady = true; profileOnline = snapshot.metadata?.fromCache !== true && !snapshot.metadata?.hasPendingWrites;
                    state.member = !!member && config.memberNames.includes(member.name);
                    state.error = ''; updateOwn();
                }, failed));
                unsubscribers.push(root.fsOnSnapshot(root.fsDoc('drop_quizzes', config.quizId, 'answers', uid), { includeMetadataChanges: true }, snapshot => {
                    if (!current(uid, generation)) return;
                    answerReady = true; answerOnline = snapshot.metadata?.fromCache !== true && !snapshot.metadata?.hasPendingWrites;
                    if (!snapshot.metadata?.hasPendingWrites) state.submission = latestSubmission(snapshot.exists() ? snapshot.data() : null, uid, config);
                    state.error = ''; updateOwn();
                }, failed));
                if (state.admin) {
                    unsubscribers.push(root.fsOnSnapshot(root.fsCol('members'), { includeMetadataChanges: true }, snapshot => {
                        if (!current(uid, generation) || snapshot.metadata?.hasPendingWrites) return;
                        members = [];
                        snapshot.forEach(doc => { const member = doc.data(); if (config.memberNames.includes(member?.name)) members.push({ uid: doc.id, name: member.name }); });
                        membersReady = true; membersOnline = snapshot.metadata?.fromCache !== true; state.rosterError = ''; updateRoster();
                    }, rosterFailed));
                    unsubscribers.push(root.fsOnSnapshot(root.fsCol('drop_quizzes', config.quizId, 'answers'), { includeMetadataChanges: true }, snapshot => {
                        if (!current(uid, generation) || snapshot.metadata?.hasPendingWrites) return;
                        entries = new Map(); snapshot.forEach(doc => entries.set(doc.id, doc.data()));
                        entriesReady = true; entriesOnline = snapshot.metadata?.fromCache !== true; state.rosterError = ''; updateRoster();
                    }, rosterFailed));
                }
                loadAnswerKey();
            } catch (_) { failed(); }
        }
        async function submit(choice) {
            const user = identity(), uid = user?.uid, generation = epoch;
            if (!active || !uid || uid !== state.uid || !state.member || !state.connected || state.saving || !ready()) throw new Error('멤버 로그인과 연결을 확인해 주세요.');
            if (!Number.isInteger(choice) || choice < 1 || choice > 5) throw new Error('보기 하나를 선택해 주세요.');
            if (Date.now() < config.startsAt || Date.now() >= config.closesAt) throw new Error('퀴즈 참여 기간이 종료되었어요.');
            const attemptId = root.crypto.randomUUID();
            state.saving = true; state.error = ''; notify();
            try {
                if (!await root.getEnjoyIdToken() || !current(uid, generation)) throw new Error('계정이 변경되었어요. 다시 로그인해 주세요.');
                const profileRef = root.fsDoc('members', uid), ref = root.fsDoc('drop_quizzes', config.quizId, 'answers', uid);
                await root.runTransaction(root.meetingDb, async transaction => {
                    const [profile, previous] = await Promise.all([transaction.get(profileRef), transaction.get(ref)]);
                    if (!current(uid, generation)) throw new Error('계정이 변경되었어요. 다시 로그인해 주세요.');
                    const member = profile.exists() ? profile.data() : null;
                    if (!member || !config.memberNames.includes(member.name)) throw new Error('등록된 엔조이 멤버만 참여할 수 있어요.');
                    if (Date.now() < config.startsAt || Date.now() >= config.closesAt) throw new Error('퀴즈 참여 기간이 종료되었어요.');
                    const attempts = previous.exists() ? previous.data().attempts || {} : {};
                    transaction.set(ref, { quizId: config.quizId, uid, name: member.name, latestAttemptId: attemptId,
                        attempts: { ...attempts, [attemptId]: { quizId: config.quizId, uid, name: member.name, choice, submittedAt: root.fsServerTimestamp() } }
                    });
                });
                const snapshot = await root.fsGetDocFromServer(ref);
                if (!current(uid, generation)) return null;
                const attempt = snapshot.data()?.attempts?.[attemptId];
                state.submission = latestSubmission(snapshot.data(), uid, config);
                if (!attempt || !Number.isFinite(serverMillis(attempt.submittedAt))) throw new Error('서버 접수를 확인하지 못했어요. 연결 후 다시 확인해 주세요.');
                if (serverMillis(attempt.submittedAt) >= config.closesAt) throw new Error('참여 마감 이후 접수된 답안이에요.');
                return state.submission;
            } catch (error) {
                if (current(uid, generation)) state.error = error.code === 'permission-denied'
                    ? '참여 기간 또는 계정 권한을 확인해 주세요. 이번 답안은 접수되지 않았어요.'
                    : error.message || '답안을 저장하지 못했어요. 다시 제출해 주세요.';
                throw error;
            } finally {
                if (current(uid, generation)) { state.saving = false; notify(); }
            }
        }
        return { get state() { return state; }, start() { active = true; connect(true); }, refresh(force = false) { connect(force); },
            stop() { active = false; epoch += 1; stopListeners(); state = empty(); }, submit };
    }
    const api = { serverMillis, latestSubmission, isAdmin, createStore };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EnjoyDropQuizFirebase = api;
})(typeof window !== 'undefined' ? window : globalThis);
