(function (root) {
    'use strict';

    function stepsFor(local, owner) {
        const steps = [
            {
                target: '#story-tray',
                title: '멤버 프로필 보기',
                text: local ? '프로필을 눌러 내 정보를 확인하세요. 여기서 사진과 글을 남기기 시작할 수 있어요.'
                    : '멤버 프로필을 누르면 활동 상태와 시간표 등을 확인할 수 있어요. 초록색 점은 활동 중이라는 뜻이에요.'
            },
            {
                target: '.drop-add-item',
                title: '사진과 이야기 남기기',
                text: '＋ 버튼을 눌러 사진 찍기, 갤러리에서 선택, 글쓰기를 고르세요. 사진은 선택하면 바로 올라가요.'
            },
            {
                target: '.drop-add-item',
                title: '일정 함께 올리기',
                text: '글쓰기에서 일정 포함을 체크하고 지역과 날짜를 넣으세요. “10:00~ 집결”처럼 한 줄에 한 일정을 적으면 시간별로 정리돼요.' +
                    (owner ? ' 작성자는 성원제 또는 비서실장 AI로 선택할 수 있어요.' : '')
            },
            {
                target: '#drop-feed .drop-feed-author, #drop-feed-section',
                title: '전체 글과 댓글 보기',
                text: '게시물이나 … 더보기를 누르면 전체 내용이 열려요. 아래로 스크롤해 댓글을 보고, 하단 입력창에서 답을 남기세요. 하트로 좋아요도 보낼 수 있어요.' +
                    (local ? ' 내가 남긴 글과 사진은 이 기기에 저장돼요.' : ' 일반 글과 사진은 24시간 동안, 일정은 계속 볼 수 있어요.')
            }
        ];
        if (!local) {
            steps.push({
                target: '#drop-feed .drop-prediction-card, #drop-feed-section',
                title: '야구 예측 참여하기',
                text: '공개된 예측에서 이길 팀을 누르세요. 마감 전까지 선택을 바꿀 수 있고, 남은 시간과 성공·실패 포인트를 확인할 수 있어요. 무승부나 취소는 포인트가 변하지 않아요.'
            });
        }
        steps.push({
            target: '.drop-entry-actions',
            title: '게임과 사용법 다시 보기',
            text: '드롭 게임과 퀴즈는 여기서 시작하세요. 이 안내가 다시 필요하면 옆의 사용법을 누르면 돼요.'
        });
        return steps;
    }

    if (typeof module === 'object' && module.exports) module.exports = { stepsFor };
    if (!root?.document) return;

    const document = root.document;
    const button = document.getElementById('drop-tutorial-button');
    const home = document.getElementById('home-screen');
    const panel = document.getElementById('apple-tv-banner');
    const feed = document.getElementById('drop-feed');
    if (!button || !home || !panel || !feed) return;

    const dialog = document.createElement('dialog');
    dialog.id = 'drop-tutorial';
    dialog.className = 'drop-tutorial';
    dialog.setAttribute('aria-labelledby', 'drop-tutorial-label');
    dialog.innerHTML = `<div class="drop-tutorial-spotlight" aria-hidden="true">
        <div class="drop-tutorial-shade drop-tutorial-top"></div>
        <div class="drop-tutorial-shade drop-tutorial-left"></div>
        <div class="drop-tutorial-shade drop-tutorial-right"></div>
        <div class="drop-tutorial-shade drop-tutorial-bottom"></div>
        <div class="drop-tutorial-ring"></div>
    </div>
    <div class="drop-tutorial-card">
        <header><h2 id="drop-tutorial-label">드롭 사용법</h2>
            <button type="button" data-tour-close aria-label="사용법 닫기"><i class="ph ph-x" aria-hidden="true"></i></button>
        </header>
        <div class="drop-tutorial-progress"><progress aria-label="튜토리얼 진행 단계"></progress><span aria-hidden="true"></span></div>
        <h3 id="drop-tutorial-heading" tabindex="-1"></h3>
        <p id="drop-tutorial-text"></p>
        <footer><button type="button" data-tour-close id="drop-tutorial-skip">건너뛰기</button>
            <button type="button" id="drop-tutorial-previous" hidden>이전</button>
            <button type="button" id="drop-tutorial-next">다음</button>
        </footer>
    </div>`;
    document.body.appendChild(dialog);

    const card = dialog.querySelector('.drop-tutorial-card');
    const heading = dialog.querySelector('h3');
    const description = dialog.querySelector('#drop-tutorial-text');
    const progress = dialog.querySelector('progress');
    const count = dialog.querySelector('.drop-tutorial-progress span');
    const previous = dialog.querySelector('#drop-tutorial-previous');
    const next = dialog.querySelector('#drop-tutorial-next');
    const skip = dialog.querySelector('#drop-tutorial-skip');
    const seen = new Set();
    let account = '';
    let step = 0;
    let steps = [];
    let target = null;
    let opener = null;
    let scrollTop = 0;
    let positionFrame = 0;
    let checkFrame = 0;
    let rememberOnClose = true;

    const identity = () => root.enjoyDataUser?.()?.uid || '';
    const storageKey = uid => 'enjoy-drop-tutorial-v1:' + uid;
    const visible = element => !!element?.getClientRects().length && root.getComputedStyle(element).visibility !== 'hidden';

    function conflict() {
        return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'))
            .some(element => element !== dialog && visible(element));
    }

    function position() {
        positionFrame = 0;
        if (!dialog.open || !target) return;
        if (!target.isConnected || !visible(target)) {
            target = panel;
        }
        const bounds = target.getBoundingClientRect();
        const viewport = dialog.getBoundingClientRect();
        const margin = 12;
        const left = Math.max(0, bounds.left - 5);
        const top = Math.max(0, Math.min(bounds.top - 5, viewport.height - 96));
        const right = Math.min(viewport.width, bounds.right + 5);
        const bottom = Math.max(top, Math.min(viewport.height, bounds.bottom + 5, top + 130));
        dialog.style.setProperty('--spot-x', left + 'px');
        dialog.style.setProperty('--spot-y', top + 'px');
        dialog.style.setProperty('--spot-width', Math.max(0, right - left) + 'px');
        dialog.style.setProperty('--spot-height', bottom - top + 'px');

        const above = top - margin - 12;
        const below = viewport.height - bottom - margin - 12;
        const room = Math.max(0, Math.max(above, below));
        card.style.maxHeight = Math.max(180, room) + 'px';
        const cardX = Math.max(margin, Math.min((left + right - card.offsetWidth) / 2, viewport.width - card.offsetWidth - margin));
        const belowTarget = below >= above;
        const cardY = belowTarget ? bottom + 12 : top - 12 - card.offsetHeight;
        card.style.left = cardX + 'px';
        card.style.top = Math.max(margin, Math.min(cardY, viewport.height - card.offsetHeight - margin)) + 'px';
    }

    function requestPosition() {
        if (dialog.open && !positionFrame) positionFrame = root.requestAnimationFrame(position);
    }

    function render(index) {
        step = index;
        const current = steps[step];
        target = Array.from(document.querySelectorAll(current.target)).find(visible) || panel;
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        heading.textContent = current.title;
        description.textContent = current.text;
        progress.max = steps.length;
        progress.value = step + 1;
        count.textContent = (step + 1) + ' / ' + steps.length;
        previous.hidden = step === 0;
        skip.hidden = step !== 0;
        next.textContent = step === steps.length - 1 ? '시작하기' : '다음';
        position();
        heading.focus({ preventScroll: true });
    }

    function open() {
        if (dialog.open || !identity() || conflict() || !visible(button) || root.homeActiveTab !== 'home') return;
        account = identity();
        const local = !!root.enjoyIsLocalGuest?.();
        steps = stepsFor(local, !local && account === 'tdC9Bzxz7JRjpEceOLzpDCMKeBE2');
        opener = document.activeElement;
        scrollTop = home.scrollTop;
        rememberOnClose = true;
        dialog.showModal();
        render(0);
    }

    function close(remember = true) {
        if (!dialog.open) return;
        rememberOnClose = remember;
        dialog.close();
    }

    function maybeOpen() {
        checkFrame = 0;
        const uid = identity();
        if (dialog.open) {
            if (uid !== account || !visible(button) || root.homeActiveTab !== 'home') close(false);
            else requestPosition();
            return;
        }
        if (!uid || seen.has(uid) || !visible(button) || root.homeActiveTab !== 'home' || document.hidden) return;
        const loading = root.enjoyAppLoading?.snapshot();
        if (!loading?.completed || feed.getAttribute('aria-busy') === 'true' || conflict() || root._communityView === 'write') return;
        if (document.getElementById('community-post-title')?.value.trim() || document.getElementById('community-post-days')?.value.trim()) return;
        try { if (root.localStorage.getItem(storageKey(uid))) return; } catch { /* Keep the in-memory completion state. */ }
        open();
    }

    function scheduleCheck() {
        if (!checkFrame) checkFrame = root.requestAnimationFrame(maybeOpen);
    }

    dialog.addEventListener('close', () => {
        if (rememberOnClose && account && account === identity()) {
            seen.add(account);
            try { root.localStorage.setItem(storageKey(account), '1'); } catch { /* The in-memory state still prevents repeat prompts. */ }
        }
        home.scrollTop = scrollTop;
        if (opener?.isConnected && visible(opener)) opener.focus({ preventScroll: true });
        else if (visible(button)) button.focus({ preventScroll: true });
        target = null;
        account = '';
    });
    dialog.querySelectorAll('[data-tour-close]').forEach(control => control.addEventListener('click', () => close()));
    previous.addEventListener('click', () => { if (step > 0) render(step - 1); });
    next.addEventListener('click', () => {
        if (step === steps.length - 1) close();
        else render(step + 1);
    });
    button.addEventListener('click', open);
    root.openDropTutorial = open;
    root.enjoyAppLoading?.subscribe(scheduleCheck);
    root.addEventListener('enjoy-auth-ready', scheduleCheck);
    root.addEventListener('enjoy-guest-entered', scheduleCheck);
    root.addEventListener('resize', requestPosition);
    root.visualViewport?.addEventListener('resize', requestPosition);
    document.addEventListener('visibilitychange', scheduleCheck);
    home.addEventListener('scroll', requestPosition, { passive: true });
    if (root.MutationObserver) {
        const observer = new root.MutationObserver(scheduleCheck);
        observer.observe(home, { attributes: true, attributeFilter: ['class', 'style'] });
        observer.observe(panel, { attributes: true, attributeFilter: ['class', 'style'] });
        observer.observe(feed, { childList: true, attributes: true, attributeFilter: ['aria-busy'] });
        observer.observe(document.getElementById('story-tray'), { childList: true });
    }
    if (root.ResizeObserver) new root.ResizeObserver(requestPosition).observe(card);
    scheduleCheck();
})(typeof window === 'object' ? window : null);
