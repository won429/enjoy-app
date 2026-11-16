const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const ownerUid = 'tdC9Bzxz7JRjpEceOLzpDCMKeBE2';

function section(start, end) {
    const offset = html.indexOf(start);
    assert.ok(offset >= 0);
    const stop = html.indexOf(end, offset);
    assert.ok(stop > offset);
    return html.slice(offset, stop);
}

function setup({ uid = ownerUid, schedule = true, choice = 'assistant', editing = false } = {}) {
    const fields = Object.fromEntries(Object.entries({
        'community-post-title': '일정 공지',
        'community-post-days': '10:00~ 집결',
        'community-post-region': '',
        'community-post-district': '',
        'community-post-start': '2026-11-20',
        'community-post-end': '2026-11-21',
        'drop-schedule-author': choice
    }).map(([id, value]) => [id, { value }]));
    fields['drop-post-schedule'] = { checked: schedule };
    fields['community-submit-btn'] = { disabled: false, style: {} };
    fields['community-write-status'] = { textContent: '' };
    const user = { uid, photoURL: 'https://example.com/self.png', displayName: '성원제' };
    const writes = [];
    const original = { _id: 'existing', authorUid: uid, authorName: '비서실장 AI', authorPhoto: '' };
    const window = {
        enjoyIsLocalGuest: () => false,
        _communityEditingPostId: editing ? original._id : null,
        _communityPosts: editing ? [original] : [],
        _communitySelectedPlaces: [{ region: '서울특별시', district: '송파구', label: '서울특별시 송파구' }],
        fsCol: name => name,
        fsDoc: (collection, id) => ({ collection, id }),
        fsAddDoc: async (collection, data) => { writes.push({ ...data }); return { id: 'created' }; },
        fsUpdateDoc: async (ref, data) => { writes.push({ ...data }); },
        closeCommunityComposer() {},
        renderDropFeed() {}
    };
    const context = vm.createContext({
        window, document: { getElementById: id => fields[id] },
        communityRequireUser: () => user,
        communityAuthorName: () => user.displayName,
        Date, console
    });
    vm.runInContext(section('        function canChooseScheduleAuthor', '        function communityRelativeTime'), context);
    vm.runInContext(section('        window.submitCommunityPost =', '        window.toggleDropSchedule ='), context);
    return { window, context, user, writes, original };
}

test('only the designated member can set the schedule author', () => {
    const { context, user } = setup();
    assert.equal(context.canChooseScheduleAuthor(user), true);
    assert.equal(context.scheduleAuthorProfile({ ...user, uid: 'another-member' }, true, 'assistant'), null);
    context.window.enjoyIsLocalGuest = () => true;
    assert.equal(context.canChooseScheduleAuthor(user), false);
});

test('AI schedules retain the owner UID and use the basic avatar', async () => {
    const { window, writes } = setup();
    await window.submitCommunityPost();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].authorUid, ownerUid);
    assert.equal(writes[0].authorName, '비서실장 AI');
    assert.equal(writes[0].authorPhoto, '');
    assert.equal(writes[0].body, '10:00~ 집결');
});

test('editing can switch from AI back to the member and ordinary posts use the member', async () => {
    for (const settings of [{ editing: true, choice: 'self' }, { editing: true, schedule: false }]) {
        const { window, writes, original } = setup(settings);
        await window.submitCommunityPost();
        assert.equal(writes.length, 1);
        assert.equal(writes[0].authorName, '성원제');
        assert.equal(writes[0].authorPhoto, 'https://example.com/self.png');
        assert.equal(original.authorUid, ownerUid);
    }
});

test('another member cannot select the AI name through a modified field', async () => {
    const { window, writes } = setup({ uid: 'another-member' });
    await window.submitCommunityPost();
    assert.equal(writes[0].authorUid, 'another-member');
    assert.equal(writes[0].authorName, '성원제');
    assert.equal(writes[0].authorPhoto, 'https://example.com/self.png');
});

test('post dates use the Korean calendar date without a relative time', () => {
    const context = vm.createContext({ Intl, Date });
    vm.runInContext(section('        function dropPostDate', '        function dropFeedTime'), context);
    const parts = context.dropPostDate(Date.parse('2026-11-15T23:30:00Z'));
    assert.equal(parts, '2026. 11. 16.');
});

test('the author selector is visible and enabled only for the owner with schedule checked', () => {
    const fields = {
        'drop-post-schedule': { checked: true, setAttribute() {} },
        'drop-schedule-fields': { classList: { toggle() {} } },
        'drop-schedule-author-field': { hidden: true },
        'drop-schedule-author': { disabled: true },
        'community-post-days': {},
        'drop-write-body-label': {},
        'drop-itinerary-help': {}
    };
    const user = { uid: ownerUid };
    const window = { enjoyIsLocalGuest: () => false };
    const context = vm.createContext({ window, communityUser: () => user, document: { getElementById: id => fields[id] } });
    vm.runInContext(section('        function canChooseScheduleAuthor', '        function communityRelativeTime'), context);
    vm.runInContext(section('        window.toggleDropSchedule =', '        window.openDropComposer ='), context);
    window.toggleDropSchedule();
    assert.equal(fields['drop-schedule-author-field'].hidden, false);
    assert.equal(fields['drop-schedule-author'].disabled, false);
    fields['drop-post-schedule'].checked = false;
    window.toggleDropSchedule();
    assert.equal(fields['drop-schedule-author-field'].hidden, true);
    assert.equal(fields['drop-schedule-author'].disabled, true);
    fields['drop-post-schedule'].checked = true;
    user.uid = 'another-member';
    window.toggleDropSchedule();
    assert.equal(fields['drop-schedule-author-field'].hidden, true);
    assert.equal(fields['drop-schedule-author'].disabled, true);
});

test('the assistant uses the default profile icon', () => {
    const context = vm.createContext({ dropEsc: text => text });
    vm.runInContext(section('        function dropAuthorAvatar', '        function dropActionButtonsHtml'), context);
    const avatar = context.dropAuthorAvatar({ authorName: '비서실장 AI', authorPhoto: '' });
    assert.match(avatar, /ph-user/);
    assert.doesNotMatch(avatar, /<img/);
});
