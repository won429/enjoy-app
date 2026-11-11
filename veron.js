(() => {
    'use strict';
    const API = 'https://enjoy-biseo-ai.sungwon4867.workers.dev/v2';
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const uid = () => crypto.randomUUID();
    const embedded = window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
    document.documentElement.classList.toggle('biseo-embedded', embedded);
    const state = { profile: null, threads: [], loaded: new Map(), active: null, memories: [], settings: { memoryEnabled: true }, attachments: [], runs: new Map(), drafts: new Map(), ready: false, editingMemory: null, rename: null, auth: null };
    const modelVersions = { 'veron-1': '1-26B', 'veron-2': '2-31B' };
    state.model = 'veron-1';
    try { const saved = localStorage.getItem('veron-model'); if (Object.hasOwn(modelVersions, saved)) state.model = saved; } catch { /* Model selection also works without browser preferences. */ }
    const Device = window.VeronDeviceStore;
    const previews = new Map();
    let toastTimer, resizeTimer, fetchSerial = 0, confirmAction = null, booting = null, scrollPending = false;
    let usageController = null, usageTimer = null, usageSerial = 0;

    function parentContext() {
        try {
            if (window.parent === window) return null;
            return window.parent.enjoyVeronContext?.() || (window.parent.enjoyUser ? { uid: window.parent.enjoyUser.uid, name: window.parent.enjoyProfileName || window.parent.enjoyStoreMember?.()?.name || window.parent.enjoyUser.displayName || '멤버', photoURL: window.parent.enjoyUser.photoURL || '' } : null);
        } catch { return null; }
    }
    async function standaloneAuth() {
        if (!state.auth) state.auth = (async () => {
            const version = '11.6.1';
            const [apps, auths] = await Promise.all([import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`), import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`)]);
            const app = apps.getApps().find(a => a.name === 'meetingApp') || apps.initializeApp({ apiKey: 'AIzaSyAVQ_WdMXKuU2CgTgvSHqLKuAVGPeeDuOQ', authDomain: 'enjoy-meeting-account.firebaseapp.com', projectId: 'enjoy-meeting-account', appId: '1:956113498506:web:b520f2b77fdb3295cb9873' }, 'meetingApp');
            const auth = auths.getAuth(app);
            await auth.authStateReady();
            let initial = true;
            auths.onAuthStateChanged(auth, user => {
                if (initial) { initial = false; return; }
                if (state.profile && state.profile.uid !== user?.uid) {
                    for (const run of state.runs.values()) run.controller.abort();
                    state.runs.clear(); state.loaded.clear(); state.drafts.clear(); state.threads = []; state.memories = []; state.profile = null; state.active = null; state.attachments = []; state.ready = false;
                    for (const url of previews.values()) URL.revokeObjectURL(url); previews.clear();
                    $('chat-input').value = ''; renderAttachments(); profile(); renderChat(true); renderHistory(); renderMemories();
                    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
                    if (user && !user.isAnonymous) bootstrap(); else showError('로그인한 뒤 베론을 이용해 주세요.', true, 401);
                }
            });
            return auth;
        })();
        return state.auth;
    }
    async function token(force = false) {
        if (window.parent !== window) {
            try {
                if (typeof window.parent.getEnjoyIdToken === 'function') {
                    const value = await window.parent.getEnjoyIdToken(force);
                    if (value) return value;
                    throw Object.assign(new Error('로그인한 뒤 베론을 이용해 주세요.'), { status: 401 });
                }
            } catch (error) { if (error.status) throw error; }
        }
        const auth = await standaloneAuth();
        if (!auth.currentUser || auth.currentUser.isAnonymous) throw Object.assign(new Error('로그인한 뒤 베론을 이용해 주세요.'), { status: 401 });
        return auth.currentUser.getIdToken(force);
    }
    async function api(path, options = {}, refresh = false) {
        const idToken = await token(refresh);
        if (options.account && (state.profile?.uid !== options.account || parentContext()?.uid && parentContext().uid !== options.account)) throw new DOMException('Account changed', 'AbortError');
        const response = await fetch(API + path, { method: options.method || 'GET', headers: { Authorization: 'Bearer ' + idToken, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined, signal: options.signal, credentials: 'omit' });
        if (response.status === 401 && !refresh) return api(path, options, true);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw Object.assign(new Error(data.error || '연결할 수 없어요. 다시 시도해 주세요.'), { status: response.status });
        }
        return options.stream ? response : response.json();
    }
    function toast(text) {
        $('toast').textContent = text; $('toast').hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
    }
    function showError(text, retry = true, status = 0) {
        $('chat-error').hidden = false;
        $('chat-error').querySelector('span').textContent = text;
        $('retry-button').textContent = status === 401 ? '로그인' : '다시 시도';
        $('retry-button').dataset.login = status === 401 ? 'true' : '';
        $('retry-button').hidden = !retry;
    }
    function clearError() { $('chat-error').hidden = true; }
    function profile() {
        const parent = parentContext();
        const account = state.profile;
        const current = parent && (!account || parent.uid === account.uid) ? { ...parent, ...account, name: parent.profileReady ? parent.name : account?.name && account.name !== '멤버' ? account.name : parent.name, photoURL: account?.photoURL || parent.photoURL || '' } : account;
        const name = String(current?.name || '').trim();
        $('greeting-name').textContent = name ? name + '님,' : '안녕하세요,';
        $('profile-initial').textContent = name ? name[0] : '나';
        $('profile-button').setAttribute('aria-label', (name ? name + '님 ' : '') + '프로필 및 메모리 설정');
        $('sheet-account').textContent = name ? name + '님의 대화' : '내 대화';
        $('memory-account').textContent = name ? name + '님만의 메모리' : '내 메모리';
        const image = $('profile-image');
        if (/^https:\/\//.test(current?.photoURL || '')) {
            if (image.getAttribute('src') !== current.photoURL) image.src = current.photoURL;
            image.hidden = false;
        } else { image.hidden = true; image.removeAttribute('src'); }
    }
    window.veronRefreshProfile = profile;
    $('profile-image').addEventListener('error', () => { $('profile-image').hidden = true; });
    async function readLocalHistory() {
        await Device.ready();
        state.threads = await Device.list(state.profile.uid);
    }
    async function migrateLegacy() {
        const account = state.profile.uid;
        if (await Device.marked(account, 'local-legacy')) return;
        let old = [], cached = [];
        try {
            if (localStorage.getItem('enjoy_chat_account_v1') === account) old = JSON.parse(localStorage.getItem('enjoy-secretary-threads-v2:' + account) || 'null')?.threads || [];
            cached = (JSON.parse(localStorage.getItem('veron-v2:' + account) || 'null')?.loaded || []).map(entry => entry[1]);
        } catch { /* A malformed browser cache is never used as conversation data. */ }
        for (const thread of [...cached, ...old]) {
            if (!thread?.id || !thread.messages?.some(message => message.role === 'user') || await Device.get(account, thread.id)) continue;
            const messages = thread.messages.slice();
            while (messages[0]?.role === 'assistant') messages.shift();
            await Device.save(account, { ...thread, messages });
        }
        await Device.mark(account, 'local-legacy');
    }
    async function migrateCloudHistory() {
        const account = state.profile.uid;
        if (await Device.marked(account, 'cloud-to-device')) return;
        try {
            const previous = await api('/bootstrap', { account });
            let complete = true;
            for (const item of previous.threads || []) {
                const { thread } = await api('/threads/' + encodeURIComponent(item.id), { account });
                const attachments = [], seen = new Set();
                for (const message of thread.messages) for (const file of message.attachments || []) {
                    if (seen.has(file.id)) continue; seen.add(file.id);
                    if (await Device.getFile(account, file.id)) continue;
                    const response = await api('/attachments/' + encodeURIComponent(file.id), { account });
                    const bytes = Uint8Array.from(atob(response.file.data), char => char.charCodeAt(0));
                    attachments.push({ ...file, blob: new Blob([bytes], { type: file.mime }) });
                }
                const local = await Device.get(account, thread.id);
                const merged = new Map(thread.messages.map(message => [message.id, message]));
                for (const message of local?.messages || []) {
                    const equivalent = thread.messages.find(remote => remote.id !== message.id && remote.role === message.role && remote.text === message.text && remote.at === message.at);
                    if (equivalent) continue;
                    const remote = merged.get(message.id);
                    if (!remote || message.at > remote.at || message.at === remote.at && message.text.length >= remote.text.length) merged.set(message.id, message);
                }
                const combined = { ...thread, ...(local && local.updated >= thread.updated ? { title: local.title, updated: local.updated } : {}), messages: [...merged.values()].sort((a, b) => a.at - b.at) };
                await Device.save(account, combined, attachments);
                const verified = await Device.get(account, thread.id);
                if (!verified || thread.messages.some(message => !verified.messages.some(saved => saved.id === message.id))) throw new Error('기기 저장을 확인하지 못했어요.');
                try { await api('/threads/' + encodeURIComponent(thread.id), { method: 'DELETE', account }); }
                catch { complete = false; }
            }
            if (complete) await Device.mark(account, 'cloud-to-device');
        } catch { toast('이전 기록 중 아직 옮기지 못한 항목은 보존했어요. 다음 연결 때 다시 가져올게요.'); }
    }
    async function bootstrap() {
        if (booting) return booting;
        booting = (async () => {
            $('composer-state').textContent = '연결 중'; clearError();
            try {
                const parent = parentContext();
                if (parent?.uid && !state.profile) {
                    state.profile = parent;
                    await readLocalHistory(); profile(); renderHistory();
                }
                const data = await api('/device-bootstrap');
                if (parentContext()?.uid && parentContext().uid !== data.profile.uid) throw new Error('계정을 다시 확인해 주세요.');
                if (state.profile && state.profile.uid !== data.profile.uid) {
                    for (const run of state.runs.values()) run.controller.abort();
                    state.loaded.clear(); state.active = null; state.attachments = []; state.drafts.clear();
                    for (const url of previews.values()) URL.revokeObjectURL(url); previews.clear();
                }
                state.profile = data.profile; state.memories = data.memories; state.settings = data.settings;
                await Device.ready();
                await migrateLegacy();
                await migrateCloudHistory();
                await readLocalHistory();
                state.ready = true;
                profile(); renderHistory(); renderMemories(); updateInput();
                $('history-state').textContent = '';
            } catch (error) {
                state.ready = false;
                showError(error.message || '대화를 연결하지 못했어요.', true, error.status);
                $('history-state').textContent = state.threads.length ? '' : '대화 기록을 불러오지 못했어요. 다시 연결해 주세요.';
            } finally { $('composer-state').textContent = ''; updateInput(); booting = null; }
        })();
        return booting;
    }
    async function chatPayload(thread, replyId, account, model) {
        const source = thread.messages.filter(message => message.id !== replyId).slice(-30);
        const selected = new Set(); let total = 0;
        for (const message of [...source].reverse()) for (const file of message.attachments || []) {
            if (!selected.has(file.id) && total + file.size <= 12 * 1024 * 1024) { selected.add(file.id); total += file.size; }
        }
        const encoded = new Map(), messages = [];
        for (const message of source) {
            const attachments = [], omitted = [];
            for (const item of message.attachments || []) {
                if (!selected.has(item.id)) { omitted.push(item.name); continue; }
                if (!encoded.has(item.id)) {
                    const file = await Device.getFile(account, item.id);
                    if (!file?.blob) throw new Error(item.name + ' 파일을 이 기기에서 찾지 못했어요. 다시 첨부해 주세요.');
                    encoded.set(item.id, { ...item, data: await base64(file.blob) });
                }
                attachments.push(encoded.get(item.id));
            }
            messages.push({ id: message.id, role: message.role, text: message.text + (omitted.length ? '\n[이전 첨부 파일은 이번 요청 크기 제한으로 생략됨: ' + omitted.join(', ') + ']' : ''), attachments, at: message.at, status: message.status });
        }
        return { threadId: thread.id, title: thread.title, messageId: source.at(-1).id, messages, model };
    }
    function inline(text) {
        const code = [];
        let value = esc(text).replace(/`([^`]+)`/g, (_, c) => { code.push('<code>' + c + '</code>'); return '\u0001' + (code.length - 1) + '\u0001'; });
        value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>').replace(/~~([^~]+)~~/g, '<del>$1</del>');
        return value.replace(/\u0001(\d+)\u0001/g, (_, i) => code[Number(i)] || '');
    }
    function markdown(text) {
        const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
        let out = '', paragraph = [], list = null;
        const flush = () => { if (paragraph.length) { out += '<p>' + paragraph.map(inline).join('<br>') + '</p>'; paragraph = []; } if (list) { out += '</' + list + '>'; list = null; } };
        const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*```/.test(line)) {
                flush(); const language = line.replace(/^\s*```/, '').replace(/[^a-zA-Z0-9+#.-]/g, '').slice(0, 20); const code = [];
                while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
                out += `<div class="code-block"><div class="code-heading"><span>${esc(language || '코드')}</span><button type="button" data-action="copy-code">${icon('copy')}복사</button></div><pre><code>${esc(code.join('\n'))}</code></pre></div>`;
            } else if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
                flush(); const head = cells(line); i++; let rows = '';
                while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) { i++; rows += '<tr>' + cells(lines[i]).map(cell => '<td>' + inline(cell) + '</td>').join('') + '</tr>'; }
                out += '<div class="table-scroll"><table><thead><tr>' + head.map(cell => '<th>' + inline(cell) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
            } else if (/^#{1,4}\s/.test(line)) { flush(); const n = line.match(/^#+/)[0].length; out += `<h${n}>${inline(line.replace(/^#+\s*/, ''))}</h${n}>`; }
            else if (/^\s*([-*+] |\d+[.)] )/.test(line)) {
                if (paragraph.length) { out += '<p>' + paragraph.map(inline).join('<br>') + '</p>'; paragraph = []; }
                const kind = /^\s*\d/.test(line) ? 'ol' : 'ul';
                if (list !== kind) { if (list) out += '</' + list + '>'; out += '<' + kind + '>'; list = kind; }
                out += '<li>' + inline(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')) + '</li>';
            } else if (/^>\s?/.test(line)) { flush(); out += '<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>'; }
            else if (!line.trim()) flush();
            else { if (list) { out += '</' + list + '>'; list = null; } paragraph.push(line); }
        }
        flush(); return out;
    }
    function currentThread() { return state.active ? state.loaded.get(state.active) : null; }
    function nearBottom() { const el = $('chat-main'); return el.scrollHeight - el.scrollTop - el.clientHeight < 100; }
    function scrollBottom(force = false) {
        if (!force && !nearBottom() || scrollPending) return;
        scrollPending = true;
        requestAnimationFrame(() => { $('chat-main').scrollTop = $('chat-main').scrollHeight; scrollPending = false; });
    }
    function attachmentHTML(file, pending = false) {
        const preview = previews.get(file.id);
        const visual = file.mime?.startsWith('image/') && preview ? `<img src="${esc(preview)}" alt="${esc(file.name)}">` : icon(file.mime?.startsWith('image/') ? 'image' : 'file');
        const status = file.error ? '다시 첨부해 주세요' : file.uploading ? '첨부 중' : formatSize(file.size);
        const content = `${visual}<span><strong>${esc(file.name)}</strong><small>${status}</small></span>`;
        return pending ? `<div class="attachment-chip">${content}<button type="button" class="remove-attachment" data-remove="${esc(file.id)}" aria-label="${esc(file.name)} 첨부 취소">${icon('x')}</button></div>` : `<button type="button" class="attachment-chip" data-file="${esc(file.id)}" aria-label="${esc(file.name)} 열기">${content}</button>`;
    }
    function groundingHTML(value) {
        if (!value) return '';
        const sources = (value.sources || []).filter(source => {
            try { const url = new URL(source.url); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
        }).slice(0, 30);
        const links = sources.map((source, i) => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${i + 1}. ${esc(source.title)}</a>`).join('');
        const suggestions = value.searchEntryPoint ? `<iframe class="search-suggestions" title="Google 검색 제안" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="${esc('<meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https: data:; base-uri \'none\'; form-action \'none\'"><base target="_blank">' + value.searchEntryPoint)}"></iframe>` : '';
        return `<div class="answer-grounding"><div class="grounding-status">${value.searched ? '웹 검색을 참고한 답변' : '웹 검색 없이 작성한 답변'}</div>${sources.length ? `<details class="answer-sources"><summary>출처 ${sources.length}개</summary><div>${links}</div></details>` : ''}${suggestions}</div>`;
    }
    function renderChat(force = false) {
        const thread = currentThread();
        const messages = thread?.messages || [];
        const keepBottom = force || nearBottom();
        const hasMessages = messages.length > 0;
        document.body.classList.toggle('has-conversation', hasMessages);
        if (embedded) window.parent.postMessage({ type: 'veron:appearance', conversation: hasMessages }, location.origin === 'null' ? '*' : location.origin);
        $('welcome').hidden = hasMessages; $('messages').hidden = !hasMessages;
        $('active-thread-title').textContent = thread?.title || '';
        $('messages').innerHTML = messages.map((message, i) => {
            const files = message.attachments?.length ? '<div class="message-attachments">' + message.attachments.map(f => attachmentHTML(f)).join('') + '</div>' : '';
            if (message.role === 'user') return `<article class="message user" data-message="${esc(message.id)}">${files}${esc(message.text)}</article>`;
            const run = state.runs.get(thread.id);
            const pending = run?.replyId === message.id;
            const content = message.text ? markdown(message.text) : pending ? '<div class="typing" aria-label="베론이 생각하는 중"><span></span><span></span><span></span></div>' : '';
            const last = i === messages.length - 1;
            return `<article class="message assistant" data-message="${esc(message.id)}"><div class="assistant-label"><span>베론</span></div><div class="message-body">${content}</div>${groundingHTML(message.grounding)}${!pending && message.text ? `<div class="message-actions"><button type="button" class="icon-button" data-copy="${esc(message.id)}" aria-label="답변 복사">${icon('copy')}</button>${last ? `<button type="button" class="icon-button" data-action="regenerate" aria-label="다시 답변하기">${icon('retry')}</button>` : ''}<button type="button" class="icon-button" data-remember="${esc(message.id)}" aria-label="답변에서 메모리 추가">${icon('memory')}</button></div>` : ''}${message.status === 'stopped' ? '<div class="message-status">답변을 중지했어요.</div>' : message.status === 'error' ? '<div class="message-status">답변이 중단됐어요. 다시 시도할 수 있어요.</div>' : ''}</article>`;
        }).join('');
        if (keepBottom) scrollBottom(true);
        updateInput(); renderHistory(); hydrateImages();
    }
    function renderAttachments() {
        $('attachment-list').hidden = !state.attachments.length;
        $('attachment-list').innerHTML = state.attachments.map(file => attachmentHTML(file, true)).join('');
        updateInput();
    }
    function updateInput() {
        const input = $('chat-input');
        const activeRun = state.runs.get(state.active);
        input.style.height = '26px'; input.style.height = Math.min(146, input.scrollHeight) + 'px'; input.style.overflowY = input.scrollHeight > 146 ? 'auto' : 'hidden';
        $('send-button').disabled = !activeRun && (!state.ready || !input.value.trim() && !state.attachments.length || state.attachments.some(f => f.uploading || f.error));
        $('send-button').setAttribute('aria-label', activeRun ? '답변 중지' : '보내기');
        $('send-button').innerHTML = icon(activeRun ? 'stop' : 'send');
        $('attach-button').disabled = !state.ready || !!activeRun;
        if (activeRun) $('composer-state').textContent = '답변 중'; else if ($('composer-state').textContent === '답변 중') $('composer-state').textContent = '';
    }
    function summary(thread) {
        const last = thread.messages?.at(-1);
        const value = { id: thread.id, title: thread.title, created: thread.created, updated: thread.updated, preview: last?.text?.slice(0, 100) || '' };
        state.threads = [value, ...state.threads.filter(t => t.id !== value.id)].sort((a, b) => b.updated - a.updated);
    }
    function saveDraft() {
        const key = state.active || 'new';
        state.drafts.set(key, { text: $('chat-input').value, attachments: state.attachments });
        if (state.profile) try { localStorage.setItem('veron-draft:' + state.profile.uid + ':' + key, $('chat-input').value); } catch { /* optional local draft */ }
    }
    function restoreDraft() {
        const key = state.active || 'new';
        const draft = state.drafts.get(key);
        let text = draft?.text || '';
        if (!draft && state.profile) try { text = localStorage.getItem('veron-draft:' + state.profile.uid + ':' + key) || ''; } catch { /* optional local draft */ }
        $('chat-input').value = text; state.attachments = draft?.attachments || []; renderAttachments();
    }
    function newChat() {
        ++fetchSerial;
        saveDraft(); state.active = null; clearError(); close('thread-drawer'); restoreDraft(); renderChat(true); profile();
    }
    async function openThread(id) {
        const serial = ++fetchSerial;
        const account = state.profile.uid;
        saveDraft(); close('thread-drawer'); clearError();
        if (state.loaded.has(id)) { state.active = id; restoreDraft(); renderChat(true); }
        else $('composer-state').textContent = '불러오는 중';
        try {
            const thread = await Device.get(account, id);
            if (!thread) throw new Error('이 기기에 저장된 대화를 찾지 못했어요.');
            if (serial !== fetchSerial || state.profile?.uid !== account) return;
            state.loaded.set(id, thread);
            state.active = id; restoreDraft(); renderChat(true);
        } catch (error) { showError(error.message, true, error.status); }
        finally { if ($('composer-state').textContent === '불러오는 중') $('composer-state').textContent = ''; }
    }
    async function submit(regenerate = false) {
        if (state.runs.has(state.active)) return stop();
        if (!state.ready) return;
        const account = state.profile.uid;
        const model = state.model;
        let thread = currentThread();
        let message;
        if (regenerate) {
            message = thread?.messages.filter(m => m.role === 'user').at(-1);
            if (!message) return;
            thread.messages = thread.messages.slice(0, thread.messages.findIndex(m => m.id === message.id) + 1);
        } else {
            const text = $('chat-input').value.trim();
            if ((!text && !state.attachments.length) || state.attachments.some(f => f.uploading || f.error)) return;
            if (state.attachments.reduce((sum, f) => sum + f.size, 0) > 12 * 1024 * 1024) return toast('첨부 파일의 합계는 12MB까지 가능해요.');
            if (!thread) { thread = { id: uid(), title: (text || state.attachments[0].name).slice(0, 40), created: Date.now(), updated: Date.now(), messages: [] }; state.active = thread.id; state.loaded.set(thread.id, thread); state.drafts.delete('new'); if (state.profile) try { localStorage.removeItem('veron-draft:' + state.profile.uid + ':new'); } catch {} }
            message = { id: uid(), role: 'user', text, attachments: state.attachments.map(({ id, name, mime, size }) => ({ id, name, mime, size })), at: Date.now(), status: 'complete' };
            thread.messages.push(message); $('chat-input').value = ''; state.attachments = []; saveDraft(); renderAttachments();
        }
        clearError();
        const replyId = 'reply-' + message.id;
        const assistant = { id: replyId, role: 'assistant', text: '', at: Date.now(), attachments: [], status: 'complete' };
        thread.messages.push(assistant); thread.updated = Date.now(); summary(thread);
        const run = { controller: new AbortController(), replyId, messageId: message.id, stopping: false, done: false };
        state.runs.set(thread.id, run); renderChat(true);
        const timer = setTimeout(() => run.controller.abort('timeout'), 100000);
        let scheduled = false;
        const paint = () => {
            if (scheduled) return; scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                if (state.active !== thread.id || state.profile?.uid !== account) return;
                const target = $('messages').querySelector('[data-message="' + replyId + '"] .message-body');
                if (!target) return renderChat();
                const stick = nearBottom(); target.innerHTML = markdown(assistant.text);
                if (Date.now() - (run.savedAt || 0) > 750) { run.savedAt = Date.now(); Device.save(account, thread).catch(error => showError(error.message)); }
                if (stick) scrollBottom(true);
            });
        };
        try {
            await Device.save(account, thread);
            const payload = await chatPayload(thread, replyId, account, model);
            const response = await api('/device-chat', { method: 'POST', body: payload, signal: run.controller.signal, stream: true, account });
            const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
            for (;;) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                buffer = buffer.replace(/\r\n/g, '\n');
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                    const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
                    const event = block.match(/^event:\s*(.+)$/m)?.[1];
                    const raw = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
                    if (!raw) continue;
                    const data = JSON.parse(raw);
                    if (event === 'meta') {
                        thread.title = data.thread.title;
                        if (state.profile?.uid === account) summary(thread);
                        if (data.memorySaved && state.profile?.uid === account) { state.memories = [data.memorySaved, ...state.memories]; renderMemories(); toast('메모리에 저장했어요.'); }
                    } else if (event === 'delta') { assistant.text += data.text || ''; paint(); }
                    else if (event === 'grounding') { assistant.grounding = data; }
                    else if (event === 'error') { assistant.status = 'error'; if (state.active === thread.id) showError(data.error); }
                    else if (event === 'done') {
                        run.done = true;
                        if (data.thread) { state.loaded.set(thread.id, data.thread); summary(data.thread); }
                    }
                }
                if (done) break;
            }
            if (!run.done) throw new Error('답변 연결이 중단됐어요. 다시 시도할 수 있어요.');
        } catch (error) {
            if (!run.stopping) { assistant.status = 'error'; if (state.active === thread.id) showError(error.name === 'AbortError' ? '응답이 오래 걸리고 있어요. 다시 시도해 주세요.' : error.message, true, error.status); }
        } finally {
            clearTimeout(timer);
            if (!run.stopping) state.runs.delete(thread.id);
            thread.updated = Date.now();
            try { await Device.save(account, thread); } catch (error) { if (state.profile?.uid === account) showError(error.message); }
            if (state.profile?.uid === account) { summary(thread); if (state.active === thread.id) renderChat(); renderHistory(); }
        }
    }
    async function stop() {
        const id = state.active, run = state.runs.get(id), account = state.profile?.uid;
        if (!run || run.stopping) return;
        run.stopping = true; run.controller.abort();
        const thread = state.loaded.get(id), last = thread?.messages.find(message => message.id === run.replyId);
        if (last) last.status = 'stopped';
        try { if (thread) await Device.save(account, thread); }
        catch (error) { showError(error.message); }
        finally { state.runs.delete(id); if (state.active === id) renderChat(); }
    }
    function formatSize(bytes) { return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB'; }
    async function photo(file) {
        if (!file.type.startsWith('image/')) return file;
        const url = URL.createObjectURL(file);
        try {
            const image = new Image(); image.src = url; await image.decode();
            const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
            if (!blob) throw new Error('사진을 읽을 수 없어요.');
            return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
        } finally { URL.revokeObjectURL(url); }
    }
    function base64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('파일을 읽을 수 없어요.')); reader.readAsDataURL(file); }); }
    async function addFiles(files) {
        if (!state.ready) return toast('먼저 베론에 연결해 주세요.');
        const account = state.profile.uid;
        closeAttach();
        for (const original of [...files]) {
            if (state.attachments.length >= 4) { toast('파일은 한 번에 4개까지 첨부할 수 있어요.'); break; }
            const draftKey = state.active || 'new';
            const placeholder = { id: 'upload-' + uid(), name: original.name, mime: original.type, size: original.size, uploading: true };
            state.attachments.push(placeholder); renderAttachments();
            try {
                if (original.size > 20 * 1024 * 1024) throw new Error('원본 파일은 20MB 이하로 선택해 주세요.');
                const file = await photo(original);
                if (state.profile?.uid !== account) break;
                if (file.size > 6 * 1024 * 1024) throw new Error('파일당 6MB까지 첨부할 수 있어요.');
                if (!file.type.startsWith('image/') && !/^text\//.test(file.type) && !/\.(pdf|docx|xlsx|pptx|txt|md|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|swift|java|c|cpp|h|sql|log|yaml|yml|r|rtf)$/i.test(file.name)) throw new Error('사진, PDF, Office 문서 또는 텍스트 파일을 선택해 주세요.');
                const saved = { id: uid(), name: file.name, mime: file.type || 'text/plain', size: file.size };
                await Device.putFile(account, { ...saved, blob: file });
                // A user may remove the chip or change conversations while an upload is in flight.
                const target = (state.active || 'new') === draftKey ? state.attachments : state.drafts.get(draftKey)?.attachments;
                const index = target?.findIndex(item => item.id === placeholder.id) ?? -1;
                if (index < 0 || state.profile?.uid !== account) { Device.removeFile(account, saved.id).catch(() => {}); continue; }
                target[index] = saved;
                if (saved.mime.startsWith('image/')) previews.set(saved.id, URL.createObjectURL(file));
                if ((state.active || 'new') === draftKey) renderAttachments();
            } catch (error) {
                const target = (state.active || 'new') === draftKey ? state.attachments : state.drafts.get(draftKey)?.attachments;
                const index = target?.findIndex(item => item.id === placeholder.id) ?? -1;
                if (index >= 0) target.splice(index, 1);
                toast(error.message || '파일을 첨부하지 못했어요.'); renderAttachments();
            }
        }
        saveDraft();
    }
    async function removeAttachment(id) {
        const file = state.attachments.find(item => item.id === id);
        state.attachments = state.attachments.filter(item => item.id !== id); renderAttachments(); saveDraft();
        const url = previews.get(id); if (url) { URL.revokeObjectURL(url); previews.delete(id); }
        if (file && !file.uploading) try { await Device.removeFile(state.profile.uid, id); } catch (error) { toast(error.message); }
    }
    async function loadFile(id) {
        const file = await Device.getFile(state.profile.uid, id);
        if (!file?.blob) throw new Error('이 기기에서 첨부 파일을 찾을 수 없어요.');
        return { file, blob: file.blob };
    }
    const loadingImages = new Set();
    async function hydrateImages() {
        const files = currentThread()?.messages.flatMap(m => m.attachments || []) || [];
        for (const file of files) {
            if (!file.mime.startsWith('image/') || previews.has(file.id) || loadingImages.has(file.id)) continue;
            loadingImages.add(file.id);
            try { const { blob } = await loadFile(file.id); previews.set(file.id, URL.createObjectURL(blob)); if (currentThread()?.messages.some(m => m.attachments?.some(f => f.id === file.id))) renderChat(); } catch { /* A failed thumbnail does not hide the downloadable attachment. */ }
            finally { loadingImages.delete(file.id); }
        }
    }
    async function downloadFile(id) {
        try {
            const { file, blob } = await loadFile(id); const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (error) { toast(error.message); }
    }
    function renderHistory() {
        const query = $('history-search').value.trim().toLowerCase();
        const items = state.threads.filter(t => !query || (t.title + ' ' + (t.preview || '')).toLowerCase().includes(query));
        if (!items.length) { $('thread-list').innerHTML = '<p class="empty-state">' + (query ? '검색한 대화가 없어요.' : '아직 저장된 대화가 없어요.<br>베론에게 첫 질문을 해보세요.') + '</p>'; return; }
        let group = '';
        $('thread-list').innerHTML = items.map(thread => {
            const d = new Date(thread.updated); const today = new Date(); const days = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
            const label = days === 0 ? '오늘' : days === 1 ? '어제' : days < 7 ? '최근 7일' : '이전 대화';
            const heading = label !== group ? `<div class="history-group">${label}</div>` : ''; group = label;
            return heading + `<div class="thread-row${thread.id === state.active ? ' current' : ''}"><button type="button" class="thread-open" data-thread="${esc(thread.id)}"><strong>${esc(thread.title)}</strong><small>${esc(thread.preview || '대화 이어가기')}</small></button><button type="button" class="icon-button" data-options="${esc(thread.id)}" aria-label="${esc(thread.title)} 대화 관리">${icon('more')}</button><div class="thread-options" data-options-for="${esc(thread.id)}" hidden><button type="button" data-rename="${esc(thread.id)}">이름 변경</button><button type="button" class="delete-thread" data-delete="${esc(thread.id)}">삭제</button></div></div>`;
        }).join('');
    }
    function renderMemories() {
        $('memory-enabled').checked = state.settings.memoryEnabled;
        $('memory-list').innerHTML = state.memories.length ? state.memories.map(memory => `<div class="memory-item"><p>${esc(memory.text)}</p><div><button type="button" data-edit-memory="${esc(memory.id)}">수정</button><button type="button" data-delete-memory="${esc(memory.id)}">삭제</button></div></div>`).join('') : '<p class="empty-state">아직 저장한 메모리가 없어요.</p>';
        $('memory-clear').hidden = !state.memories.length;
        $('memory-shortcut').setAttribute('aria-label', '메모리 설정, ' + (state.settings.memoryEnabled ? '사용 중' : '꺼짐'));
    }
    function renderModel() {
        $('model-version').textContent = modelVersions[state.model];
        $('model-button').setAttribute('aria-label', '모델 선택, VERON ' + modelVersions[state.model]);
        for (const button of $('model-menu').querySelectorAll('[data-model]')) button.setAttribute('aria-checked', String(button.dataset.model === state.model));
    }
    function closeModelMenu() { $('model-menu').hidden = true; $('model-button').setAttribute('aria-expanded', 'false'); }
    function renderUsage(data) {
        const number = value => Number.isFinite(value) && value >= 0 ? value.toLocaleString('ko-KR') : '—';
        const time = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(value)) : '';
        $('usage-status').textContent = data.message || '';
        $('usage-charts').innerHTML = (data.models || []).map(model => {
            const rows = model.metrics.map(metric => {
                const known = Number.isFinite(metric.used) && Number.isFinite(metric.limit);
                const remaining = known ? Math.max(0, metric.limit - metric.used) : null;
                const percent = known && metric.limit > 0 ? Math.max(0, Math.min(100, remaining / metric.limit * 100)) : null;
                const title = metric.key === 'rpd' ? '일일 요청 한도' : metric.key === 'rpm' ? '분당 요청 한도' : '분당 입력 토큰 한도';
                let reset = '1분 단위 집계입니다';
                if (metric.key === 'rpd') {
                    const minutes = Math.ceil((Date.parse(data.resetAt) - Date.now()) / 60000);
                    if (!Number.isFinite(minutes)) reset = '초기화 시간을 확인 중입니다';
                    else if (minutes <= 0) reset = '초기화 후 집계 중입니다';
                    else {
                        const hours = Math.floor(minutes / 60), rest = minutes % 60;
                        reset = (hours ? hours + '시간' + (rest ? ' ' : '') : '') + (rest ? rest + '분' : '') + ' 후 초기화됩니다';
                    }
                }
                if (data.status === 'paused') reset = '연결 후 확인할 수 있어요';
                const status = percent !== null ? Math.round(percent) + '% 남음' : known && metric.limit === 0 ? '사용 불가' : '집계 대기';
                const label = title + ': ' + (known ? number(metric.used) + ' / ' + number(metric.limit) + metric.unit + ', ' + status : '집계 대기');
                return `<div class="usage-metric"><div class="usage-metric-heading"><h4>${esc(title)}</h4><span class="usage-count">${number(metric.used)} / ${number(metric.limit)} ${esc(metric.unit)}</span></div><div class="usage-metric-caption"><span>${esc(reset)}</span><strong>${status}</strong></div><div class="usage-track${known ? '' : ' is-unknown'}" role="img" aria-label="${esc(label)}"><span style="width:${percent === null ? 0 : percent}%"></span></div></div>`;
            }).join('');
            return `<section class="usage-model" aria-label="${esc(model.name)} 사용량"><h3>${esc(model.name)}</h3><div class="usage-limit-card">${rows}</div></section>`;
        }).join('');
        $('usage-charts').setAttribute('aria-busy', 'false');
        $('usage-note').textContent = data.status === 'paused' ? '실제 사용량과 한도는 연결 후 표시됩니다.' : 'Google 집계 기준이며, 실제 사용 후 반영까지 몇 분 정도 걸릴 수 있어요.';
        $('usage-reset').textContent = data.status !== 'paused' && data.resetAt ? '일일 한도 초기화: ' + time(data.resetAt) + ' (한국 시간)' : '';
        $('usage-updated').textContent = data.observedAt ? time(data.observedAt) + ' 집계' : '';
    }
    async function loadUsage() {
        const serial = ++usageSerial;
        usageController?.abort(); usageController = new AbortController();
        $('usage-refresh').disabled = true; $('usage-status').textContent = '사용량을 불러오는 중이에요.';
        $('usage-charts').setAttribute('aria-busy', 'true');
        try {
            const data = await api('/usage', { account: state.profile?.uid, signal: usageController.signal });
            if (serial === usageSerial && $('usage-dialog').open) renderUsage(data);
        } catch (error) {
            if (serial === usageSerial && $('usage-dialog').open && error.name !== 'AbortError') {
                $('usage-status').textContent = '사용량을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.';
                $('usage-charts').innerHTML = '';
                $('usage-reset').textContent = '';
                $('usage-updated').textContent = '';
            }
        } finally {
            if (serial === usageSerial) { $('usage-refresh').disabled = false; $('usage-charts').setAttribute('aria-busy', 'false'); }
        }
    }
    function open(id) { closeAttach(); closeModelMenu(); if (!$(id).open) $(id).showModal(); }
    function close(id) { if ($(id).open) $(id).close(); }
    function memoryDialog() { close('thread-drawer'); profile(); renderMemories(); open('memory-dialog'); }
    function confirmDelete(description, action) { $('confirm-description').textContent = description; confirmAction = action; open('confirm-dialog'); }
    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); toast('복사했어요.'); }
        catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); toast('복사했어요.'); }
    }
    function closeAttach() { $('attach-menu').hidden = true; $('attach-button').setAttribute('aria-expanded', 'false'); }
    function returnHome() {
        saveDraft();
        if (window.parent !== window) window.parent.postMessage({ type: 'enjoy:navigate-home' }, location.origin);
        else location.href = 'index.html';
    }
    function viewport() {
        const vv = window.visualViewport;
        document.documentElement.style.setProperty('--visual-height', Math.round(vv?.height || innerHeight) + 'px');
        document.documentElement.style.setProperty('--visual-top', Math.round(vv?.offsetTop || 0) + 'px');
        if (nearBottom()) scrollBottom(true);
    }
    $('chat-form').addEventListener('submit', event => { event.preventDefault(); submit(); });
    $('usage-button').addEventListener('click', () => {
        open('usage-dialog'); loadUsage();
        clearInterval(usageTimer);
        usageTimer = setInterval(() => { if (!document.hidden && $('usage-dialog').open && !$('usage-refresh').disabled) loadUsage(); }, 60000);
    });
    $('usage-refresh').addEventListener('click', loadUsage);
    $('usage-dialog').addEventListener('close', () => { clearInterval(usageTimer); usageTimer = null; ++usageSerial; usageController?.abort(); usageController = null; });
    $('model-button').addEventListener('click', () => {
        const show = $('model-menu').hidden;
        closeAttach(); $('model-menu').hidden = !show; $('model-button').setAttribute('aria-expanded', String(show));
        if (show) $('model-menu').querySelector('[aria-checked="true"]').focus();
    });
    $('model-menu').addEventListener('click', event => {
        const button = event.target.closest('[data-model]'); if (!button) return;
        closeModelMenu();
        if (button.dataset.model === 'veron-2.1') return open('model-release-dialog');
        state.model = button.dataset.model;
        try { localStorage.setItem('veron-model', state.model); } catch { /* Optional browser preference. */ }
        renderModel(); $('model-button').focus();
    });
    $('model-button').addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if ($('model-menu').hidden) $('model-button').click(); }
    });
    $('model-menu').addEventListener('keydown', event => {
        const buttons = [...$('model-menu').querySelectorAll('[data-model]')];
        const index = buttons.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
        } else if (event.key === 'Escape') { event.preventDefault(); closeModelMenu(); $('model-button').focus(); }
        else if (event.key === 'Tab') closeModelMenu();
    });
    $('chat-input').addEventListener('input', () => { updateInput(); saveDraft(); });
    $('chat-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !matchMedia('(pointer: coarse)').matches) { event.preventDefault(); submit(); } });
    $('chat-input').addEventListener('paste', event => { if (event.clipboardData?.files.length) { event.preventDefault(); addFiles(event.clipboardData.files); } });
    $('chat-main').addEventListener('scroll', () => { $('jump-bottom').hidden = nearBottom() || !currentThread()?.messages.length; }, { passive: true });
    $('jump-bottom').addEventListener('click', () => scrollBottom(true));
    $('new-chat-button').addEventListener('click', newChat); $('sheet-new-chat-button').addEventListener('click', newChat);
    $('thread-list-button').addEventListener('click', () => { renderHistory(); open('thread-drawer'); if (!state.ready) bootstrap(); });
    $('history-search').addEventListener('input', renderHistory);
    $('profile-button').addEventListener('click', memoryDialog); $('memory-shortcut').addEventListener('click', memoryDialog); $('history-memory-button').addEventListener('click', memoryDialog);
    $('home-button').addEventListener('click', returnHome);
    $('attach-button').addEventListener('click', () => { const show = $('attach-menu').hidden; $('attach-menu').hidden = !show; $('attach-button').setAttribute('aria-expanded', String(show)); });
    $('pick-photo').addEventListener('click', () => { closeAttach(); $('photo-input').click(); }); $('pick-file').addEventListener('click', () => { closeAttach(); $('file-input').click(); });
    for (const id of ['photo-input', 'file-input']) $(id).addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
    $('attachment-list').addEventListener('click', event => { const target = event.target.closest('[data-remove]'); if (target) removeAttachment(target.dataset.remove); });
    document.addEventListener('click', event => { if (!event.target.closest('.attach-anchor')) closeAttach(); if (!event.target.closest('.model-picker')) closeModelMenu(); const control = event.target.closest('[data-close]'); if (control) close(control.dataset.close); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeAttach(); closeModelMenu(); } });
    document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
    document.addEventListener('drop', event => { if (event.dataTransfer?.files.length) { event.preventDefault(); addFiles(event.dataTransfer.files); } });
    $('messages').addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button) return;
        if (button.dataset.copy) copyText(currentThread()?.messages.find(m => m.id === button.dataset.copy)?.text || '');
        else if (button.dataset.file) downloadFile(button.dataset.file);
        else if (button.dataset.remember) { const message = currentThread()?.messages.find(m => m.id === button.dataset.remember); state.editingMemory = null; $('memory-text').value = (message?.text || '').slice(0, 500); $('memory-save').textContent = '추가하기'; $('memory-cancel').hidden = true; memoryDialog(); }
        else if (button.dataset.action === 'regenerate') submit(true);
        else if (button.dataset.action === 'copy-code') copyText(button.closest('.code-block').querySelector('code').textContent);
    });
    $('thread-list').addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button) return;
        if (button.dataset.thread) openThread(button.dataset.thread);
        else if (button.dataset.options) { const box = button.closest('.thread-row').querySelector('.thread-options'); const show = box.hidden; $('thread-list').querySelectorAll('.thread-options').forEach(el => { el.hidden = true; }); box.hidden = !show; }
        else if (button.dataset.rename) { state.rename = button.dataset.rename; $('rename-input').value = state.threads.find(t => t.id === state.rename)?.title || ''; open('rename-dialog'); }
        else if (button.dataset.delete) { const id = button.dataset.delete; confirmDelete('이 대화와 첨부 파일을 삭제합니다. 저장한 메모리는 유지돼요.', async () => { if (state.runs.has(id)) throw new Error('답변을 중지한 뒤 삭제해 주세요.'); await Device.remove(state.profile.uid, id); state.threads = await Device.list(state.profile.uid); state.loaded.delete(id); state.drafts.delete(id); if (state.active === id) { state.active = null; restoreDraft(); renderChat(true); } renderHistory(); toast('대화를 삭제했어요.'); }); }
    });
    $('rename-form').addEventListener('submit', async event => { event.preventDefault(); try { const title = $('rename-input').value.trim(); if (!title) return; const thread = await Device.get(state.profile.uid, state.rename); if (!thread) throw new Error('이 기기에 저장된 대화를 찾지 못했어요.'); thread.title = title; thread.updated = Date.now(); await Device.save(state.profile.uid, thread); state.threads = await Device.list(state.profile.uid); if (state.loaded.has(state.rename)) state.loaded.get(state.rename).title = title; close('rename-dialog'); renderHistory(); renderChat(); } catch (error) { toast(error.message); } });
    $('confirm-cancel').addEventListener('click', () => { confirmAction = null; close('confirm-dialog'); });
    $('confirm-delete').addEventListener('click', async () => { const action = confirmAction; confirmAction = null; close('confirm-dialog'); if (action) try { await action(); } catch (error) { toast(error.message); } });
    $('memory-form').addEventListener('submit', async event => {
        event.preventDefault(); const text = $('memory-text').value.trim(); if (!text) return;
        $('memory-save').disabled = true;
        try { const data = await api('/memory', { method: 'POST', body: { action: 'save', id: state.editingMemory, text } }); state.memories = data.memories; state.editingMemory = null; $('memory-text').value = ''; $('memory-save').textContent = '추가하기'; $('memory-cancel').hidden = true; renderMemories(); toast('메모리를 저장했어요.'); } catch (error) { toast(error.message); } finally { $('memory-save').disabled = false; }
    });
    $('memory-cancel').addEventListener('click', () => { state.editingMemory = null; $('memory-text').value = ''; $('memory-save').textContent = '추가하기'; $('memory-cancel').hidden = true; });
    $('memory-enabled').addEventListener('change', async event => { const enabled = event.target.checked; event.target.disabled = true; try { const data = await api('/settings', { method: 'PATCH', body: { memoryEnabled: enabled } }); state.settings = data.settings; } catch (error) { toast(error.message); } finally { event.target.disabled = false; renderMemories(); } });
    $('memory-list').addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button) return;
        if (button.dataset.editMemory) { const memory = state.memories.find(m => m.id === button.dataset.editMemory); if (!memory) return; state.editingMemory = memory.id; $('memory-text').value = memory.text; $('memory-save').textContent = '수정하기'; $('memory-cancel').hidden = false; $('memory-text').focus(); }
        else if (button.dataset.deleteMemory) confirmDelete('이 메모리를 삭제하면 다음 답변부터 참고하지 않아요.', async () => { const data = await api('/memory', { method: 'POST', body: { action: 'delete', id: button.dataset.deleteMemory } }); state.memories = data.memories; renderMemories(); });
    });
    $('memory-clear').addEventListener('click', () => confirmDelete('저장한 메모리를 모두 삭제합니다. 대화 기록은 유지돼요.', async () => { const data = await api('/memory', { method: 'POST', body: { action: 'clear' } }); state.memories = data.memories; renderMemories(); }));
    $('retry-button').addEventListener('click', () => { if ($('retry-button').dataset.login) { if (window.parent !== window) window.parent.location.href = 'login.html'; else location.href = 'login.html'; } else if (!state.ready) bootstrap(); else if (currentThread()?.messages.some(m => m.role === 'user')) submit(true); else bootstrap(); });
    for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    window.visualViewport?.addEventListener('resize', () => { viewport(); clearTimeout(resizeTimer); resizeTimer = setTimeout(viewport, 180); }, { passive: true });
    window.visualViewport?.addEventListener('scroll', viewport, { passive: true });
    window.addEventListener('resize', viewport, { passive: true });
    window.addEventListener('pagehide', saveDraft);
    window.addEventListener('online', () => { if (!state.ready) bootstrap(); });
    renderModel(); profile(); viewport(); renderChat(); renderHistory(); bootstrap().then(restoreDraft);
})();
