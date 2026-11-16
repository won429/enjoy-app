const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stepsFor } = require('../drop-tutorial.js');
const source = fs.readFileSync(path.join(__dirname, '../drop-tutorial.js'), 'utf8');

test('member and local tutorials describe only available features', () => {
    const member = stepsFor(false, false);
    const local = stepsFor(true, false);
    assert.equal(member.length, 6);
    assert.equal(local.length, 5);
    assert.ok(member.some(step => step.title.includes('예측')));
    assert.ok(!local.some(step => step.title.includes('예측')));
    assert.match(local.map(step => step.text).join(' '), /이 기기에 저장/);
    assert.match(member.map(step => step.text).join(' '), /24시간/);
    assert.match(member.map(step => step.text).join(' '), /10:00~/);
    assert.ok(!member.some(step => step.text.includes('비서실장 AI')));
    assert.ok(stepsFor(false, true).some(step => step.text.includes('비서실장 AI')));
});

function runtime() {
    const listeners = {};
    const frames = [];
    const storage = new Map();
    const nodes = new Map();
    const visible = { getClientRects: () => [{}], isConnected: true, focus() {}, scrollIntoView() {},
        getBoundingClientRect: () => ({ left: 16, right: 256, top: 100, bottom: 144, width: 240, height: 44 }) };
    function node() {
        return { ...visible, hidden: false, style: { setProperty() {} }, offsetWidth: 280, offsetHeight: 240,
            addEventListener(name, fn) { this.events ||= {}; this.events[name] = fn; } };
    }
    for (const id of ['drop-tutorial-button', 'home-screen', 'apple-tv-banner', 'drop-feed', 'story-tray']) nodes.set(id, node());
    nodes.get('home-screen').scrollTop = 42;
    nodes.get('drop-feed').getAttribute = () => 'false';
    nodes.set('community-post-title', { value: '' });
    nodes.set('community-post-days', { value: '' });
    const controls = new Map();
    const dialog = node();
    dialog.open = false;
    dialog.querySelector = selector => {
        if (!controls.has(selector)) controls.set(selector, node());
        return controls.get(selector);
    };
    const closeControls = [node()];
    dialog.querySelectorAll = () => closeControls;
    dialog.setAttribute = () => {};
    dialog.getBoundingClientRect = () => ({ width: 320, height: 640 });
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.events.close(); };
    let uid = 'member-a';
    let loading = true;
    let conflicting = false;
    const window = {
        document: {
            getElementById: id => nodes.get(id),
            createElement: () => dialog,
            body: { appendChild() {} },
            activeElement: nodes.get('drop-tutorial-button'),
            querySelectorAll: () => conflicting ? [node()] : [nodes.get('story-tray')],
            addEventListener(name, fn) { listeners[name] = fn; }
        },
        homeActiveTab: 'home',
        enjoyDataUser: () => uid ? { uid } : null,
        enjoyIsLocalGuest: () => false,
        getComputedStyle: () => ({ visibility: 'visible' }),
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        enjoyAppLoading: { snapshot: () => ({ completed: !loading }), subscribe(fn) { listeners.loading = fn; } },
        addEventListener(name, fn) { listeners[name] = fn; }
    };
    // Dialog discovery and target lookup have distinct selectors.
    window.document.querySelectorAll = selector => selector.startsWith('[role=')
        ? conflicting ? [node()] : []
        : [nodes.get('story-tray')];
    vm.runInNewContext(source, { window });
    function paint() { for (let i = 0; frames.length && i < 10; i++) frames.splice(0).forEach(fn => fn()); }
    return { window, dialog, nodes, controls, closeControls, storage, paint, listeners,
        ready() { loading = false; listeners.loading(); paint(); },
        switchAccount(next) { uid = next; listeners['enjoy-auth-ready'](); paint(); },
        setConflict(value) { conflicting = value; } };
}

test('first use waits for loading, supports navigation and remembers dismissal per account', () => {
    const app = runtime();
    app.paint();
    assert.equal(app.dialog.open, false);
    app.ready();
    assert.equal(app.dialog.open, true);
    assert.equal(app.controls.get('.drop-tutorial-progress span').textContent, '1 / 6');
    app.controls.get('#drop-tutorial-next').events.click();
    assert.equal(app.controls.get('.drop-tutorial-progress span').textContent, '2 / 6');
    app.controls.get('#drop-tutorial-previous').events.click();
    assert.equal(app.controls.get('.drop-tutorial-progress span').textContent, '1 / 6');
    app.closeControls[0].events.click();
    assert.equal(app.storage.get('enjoy-drop-tutorial-v1:member-a'), '1');
    assert.equal(app.nodes.get('home-screen').scrollTop, 42);
    app.listeners.loading();
    app.paint();
    assert.equal(app.dialog.open, false);
    app.window.openDropTutorial();
    assert.equal(app.dialog.open, true);
    app.switchAccount('member-b');
    assert.equal(app.dialog.open, false);
    assert.equal(app.storage.has('enjoy-drop-tutorial-v1:member-b'), false);
    app.listeners.loading();
    app.paint();
    assert.equal(app.dialog.open, true);
});

test('the tutorial does not interrupt an editor, another dialog, or a different home tab', () => {
    for (const state of ['draft', 'dialog', 'tab']) {
        const app = runtime();
        if (state === 'draft') app.nodes.get('community-post-title').value = '작성 중인 글';
        if (state === 'dialog') app.setConflict(true);
        if (state === 'tab') app.window.homeActiveTab = 'baseball';
        app.ready();
        assert.equal(app.dialog.open, false, state);
    }
});

test('completing the final step saves completion and restores the feed', () => {
    const app = runtime();
    app.ready();
    for (let i = 0; i < 5; i++) app.controls.get('#drop-tutorial-next').events.click();
    assert.equal(app.controls.get('#drop-tutorial-next').textContent, '시작하기');
    app.controls.get('#drop-tutorial-next').events.click();
    assert.equal(app.dialog.open, false);
    assert.equal(app.storage.get('enjoy-drop-tutorial-v1:member-a'), '1');
});
