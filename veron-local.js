(() => {
    'use strict';
    let database;
    const error = () => new Error('이 기기에 기록을 저장하지 못했어요. 브라우저의 사이트 저장 공간과 저장 권한을 확인해 주세요.');
    const key = (account, id) => {
        if (!account || !id) throw new Error('저장할 계정을 확인해 주세요.');
        return JSON.stringify([account, id]);
    };
    function open() {
        if (!database) database = new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(error());
            const request = indexedDB.open('enjoy-veron-device-v1', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                for (const name of ['threads', 'files', 'meta']) {
                    const store = db.createObjectStore(name, { keyPath: 'key' });
                    store.createIndex('account', 'account', { unique: false });
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); database = null; };
                resolve(db);
            };
            request.onerror = () => { database = null; reject(error()); };
            request.onblocked = () => { database = null; reject(error()); };
        });
        return database;
    }
    async function transact(names, mode, execute) {
        const db = await open();
        return new Promise((resolve, reject) => {
            let result;
            const tx = db.transaction(names, mode);
            const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(error());
            tx.onerror = () => { /* onabort reports the transaction failure. */ };
            try { execute(stores, value => { result = value; }); }
            catch (cause) { try { tx.abort(); } catch {} reject(cause); }
        });
    }
    function normalize(thread) {
        return {
            id: thread.id, title: String(thread.title || '새 대화').slice(0, 80),
            created: Number(thread.created || thread.createdAt) || Date.now(), updated: Number(thread.updated || thread.updatedAt) || Date.now(),
            messages: (thread.messages || []).map(message => ({
                id: message.id || crypto.randomUUID(), role: message.role === 'user' ? 'user' : 'assistant', text: String(message.text || ''),
                attachments: (message.attachments || []).map(({ id, name, mime, size }) => ({ id, name, mime, size })), at: Number(message.at) || Date.now(), status: message.status || 'complete',
                ...(message.grounding ? { grounding: message.grounding } : {}),
            })),
        };
    }
    const Store = {
        ready: open,
        async list(account) {
            return transact(['threads'], 'readonly', ({ threads }, done) => {
                const request = threads.index('account').getAll(account);
                request.onsuccess = () => done(request.result.map(row => {
                    const thread = row.value;
                    return { id: thread.id, title: thread.title, created: thread.created, updated: thread.updated, preview: thread.messages.at(-1)?.text.slice(0, 100) || '' };
                }).sort((a, b) => b.updated - a.updated));
            });
        },
        async get(account, id) {
            return transact(['threads'], 'readonly', ({ threads }, done) => {
                const request = threads.get(key(account, id));
                request.onsuccess = () => done(request.result?.value || null);
            });
        },
        async save(account, thread, attachments = []) {
            const value = normalize(thread);
            return transact(['threads', 'files'], 'readwrite', ({ threads, files }, done) => {
                for (const file of attachments) files.put({ ...file, key: key(account, file.id), account });
                threads.put({ key: key(account, value.id), account, value });
                done(value);
            });
        },
        async remove(account, id) {
            return transact(['threads', 'files'], 'readwrite', ({ threads, files }) => {
                const request = threads.get(key(account, id));
                request.onsuccess = () => {
                    for (const message of request.result?.value.messages || []) for (const file of message.attachments || []) files.delete(key(account, file.id));
                    threads.delete(key(account, id));
                };
            });
        },
        async putFile(account, file) {
            if (!(file.blob instanceof Blob)) throw new Error('첨부 파일을 읽을 수 없어요.');
            return transact(['files'], 'readwrite', ({ files }) => { files.put({ ...file, key: key(account, file.id), account }); });
        },
        async getFile(account, id) {
            return transact(['files'], 'readonly', ({ files }, done) => {
                const request = files.get(key(account, id));
                request.onsuccess = () => done(request.result || null);
            });
        },
        async removeFile(account, id) {
            return transact(['files'], 'readwrite', ({ files }) => { files.delete(key(account, id)); });
        },
        async marked(account, name) {
            return transact(['meta'], 'readonly', ({ meta }, done) => {
                const request = meta.get(key(account, name)); request.onsuccess = () => done(Boolean(request.result?.value));
            });
        },
        async mark(account, name) {
            return transact(['meta'], 'readwrite', ({ meta }) => { meta.put({ key: key(account, name), account, value: true }); });
        },
    };
    window.VeronDeviceStore = Store;
})();
