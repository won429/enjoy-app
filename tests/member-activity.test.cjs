const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function setup(user) {
    const status = { classes: {}, attributes: {},
        classList: { toggle(name, value) { status.classes[name] = value; } },
        setAttribute(name, value) { this.attributes[name] = value; } };
    const time = {};
    const members = [{ name: '전시기', lastActive: Date.now() - 3600000 }];
    const context = vm.createContext({
        window: { enjoyUser: user },
        document: { getElementById: id => id === 'profile-activity-status' ? status : time },
        ACTIVE_MS: 90000, Date, lastMembers: members, memberIsInClass: () => false
    });
    for (const [start, end] of [
        ['        function memberActivityText(', '        function memberIsInClass('],
        ['        function updateProfileActivityStatus(', '        window.openMemberProfileMenu = function (']
    ]) {
        const offset = html.indexOf(start);
        vm.runInContext(html.slice(offset, html.indexOf(end, offset)), context);
    }
    return { context, status, time, members };
}

test('inactive activity labels conceal times for every viewer except the owner', () => {
    const now = Date.now();
    for (const user of [null, { uid: 'other', displayName: '성원제' }, { uid: 'other' }]) {
        const { context } = setup(user);
        for (const lastActive of [0, now - 90000, now - 3600000, now - 86400000]) {
            assert.equal(context.memberActivityText(lastActive, now), '활동 전');
        }
        assert.equal(context.memberActivityText(now - 1000, now), '활동 중');
    }
});

test('the owner keeps the existing activity time and date display', () => {
    const { context } = setup({ uid: 'tdC9Bzxz7JRjpEceOLzpDCMKeBE2' });
    const now = Date.now();
    assert.equal(context.memberActivityText(now - 600000, now), '10분 전');
    assert.equal(context.memberActivityText(now - 3600000, now), '1시간 전');
    assert.match(context.memberActivityText(now - 86400000, now), /^\d{2}\.\d{2}\.\d{2}$/);
    assert.equal(context.memberActivityText(0, now), '활동 기록 없음');
});

test('visible and accessible profile labels update when the viewing account changes', () => {
    const { context, status, time, members } = setup({ uid: 'tdC9Bzxz7JRjpEceOLzpDCMKeBE2' });
    context.updateProfileActivityStatus('전시기');
    assert.equal(time.textContent, '1시간 전');
    context.window.enjoyUser = { uid: 'other' };
    context.updateProfileActivityStatus('전시기');
    assert.equal(time.textContent, '활동 전');
    assert.equal(status.attributes['aria-label'], '전시기 활동 상태: 활동 전');
    members[0].lastActive = Date.now();
    context.updateProfileActivityStatus('전시기');
    assert.equal(time.textContent, '활동 중');
    assert.equal(status.classes['is-active'], true);
    context.memberIsInClass = () => true;
    context.updateProfileActivityStatus('전시기');
    assert.equal(time.textContent, '수업 중');
});
