# 로딩 UI 유지 안내

- 첫 진입은 `app-loading.css`, `app-loading.js`, `home-entry.js`와 `index.html`의 스켈레톤을 사용합니다. 전역 완료 조건은 로그인 확인·서버에서 확인한 본인 프로필·홈 렌더링입니다. 일반 멤버를 비회원이나 로컬 모드로 잘못 전환해 로딩을 끝내지 않습니다.
- 멤버 목록과 사진·글·예측 피드는 `home-loading.js`가 각 구역의 스켈레톤과 오류·다시 연결 버튼을 관리합니다. 아직 서버 확인을 받지 않은 캐시나 빈 목록을 완료 화면으로 표시하지 않습니다.
- 사진·글·예측은 같은 피드에서 시간순으로 섞입니다. 최초에는 세 소스가 모두 확인될 때까지 피드 구역만 스켈레톤을 유지합니다. 이후 기존 카드 순서로 한 번에 표시하여 예측이 뒤늦게 끼어드는 것을 방지합니다. 첫 확인 후 갱신 오류는 기존 콘텐츠를 유지하며 해당 구역에 재시도를 표시합니다.
- `enjoyInitialSnapshot(source, reference, apply, onError)`는 서버 메타데이터(`fromCache === false`, `hasPendingWrites !== true`)를 확인합니다. 일시적 구독 오류는 해당 소스만 1초·2초 후 두 번 재시도합니다. 권한·인증·잘못된 쿼리 오류는 무한 반복하지 않습니다. 수동 재연결 및 네트워크 복귀 시에도 현재 계정의 해당 구독만 갱신합니다.
- 예측 GET 조회도 두 번 자동 재시도합니다. 수동 재시도와 계정 변경은 이전 GET을 취소하고, 늦은 응답을 버립니다. 승인·구매·참여 같은 POST 요청은 자동 재전송하지 않습니다.
- 12초 인증 확인 지연과 20초 최초 응답 지연은 실패가 아닌 느린 연결로 안내합니다. 실제 필수 정보 오류는 항목명을 표시합니다. 프로필 읽기 오류는 기존 로그인 세션을 유지하며 서버 확인을 재시도합니다.
- `enjoyAppLoading.retry(source)`, `registerRetry(source, callback)`, `subscribe(callback)`, `snapshot()`으로 구역별 상태를 연결합니다. `snapshot()`에는 현재 세대, 필수 항목, 소스별 상태, 서버 확인 항목, 오류 메시지가 포함됩니다. 계정 전환 시 구독·예약된 재시도를 정리합니다.
- 다시 연결은 페이지 전체를 새로고침하지 않습니다. Firebase 초기화 실패는 해당 초기화를 다시 실행합니다. SDK 모듈 자체를 내려받지 못해 초기화 함수가 없는 경우에만 전체 새로고침을 최후 수단으로 사용합니다.
- 지갑은 기존 `wallet-skeleton.js`를 유지하며 오류 난 모임통장·일정을 구역에서 다시 연결할 수 있습니다. 투자와 면제권 승인 흐름은 그대로 유지합니다.
- 사용자 요청(2026-10-27): **로딩 아일랜드는 다른 곳에서 사용할 수 있으므로 삭제하지 않고 보존합니다.** 첫 진입에 다시 연결하지 않습니다. 상담 예약도 `done.webp`, `orbit.webp`를 사용합니다.

## 로딩 아일랜드 재사용

현재 원본은 `#app-loader`를 찾으며 스크립트를 불러오면 자동 시작한다. 별도 페이지에서 아래 마크업을 사용하거나, 같은 페이지에서 쓰려면 원본을 복사한 뒤 대상 ID와 CSS 선택자를 별도로 분리한다. 첫 진입 스켈레톤과 같은 ID를 중복해서 만들지 않는다.

```html
<link rel="stylesheet" href="loading-island.css?v=20261024-2">
<div id="app-loader" class="loading-island-overlay" data-state="opening" role="status" aria-live="polite" aria-atomic="true">
    <div class="loading-island-anchor" aria-hidden="true">
        <div class="loading-island-card"><canvas width="256" height="256"></canvas></div>
    </div>
    <span class="loading-island-label">데이터 동기화 중</span>
</div>
<script src="loading-island.js?v=20261025-loading-restore-1"></script>
```

- `enjoyStartLoadingIsland()`: 시작 또는 재시작
- `enjoyFinishLoadingIsland()`: 완료 애니메이션 후 숨김
- `enjoyCancelLoadingIsland()`: 즉시 숨김

이미지는 사이트 루트 기준 `assets/loading-island/`에서 로드하므로 하위 경로의 페이지에서 재사용할 때 상대 경로도 맞춘다.


## 검증

```sh
node --test tests/app-loading.test.cjs tests/home-loading.test.cjs tests/drop-prediction-loading.test.cjs tests/drop-prediction-card.test.cjs tests/public-entry.test.cjs tests/guest-local.test.cjs tests/meeting-exemptions.test.cjs tests/investment-portfolio.test.cjs tests/investment-motion.test.cjs
```

101개 테스트 통과. 실제 Firebase 시작 코드와 피드 렌더 함수를 실행해 필수 정보 확인, 느린 응답, 소스별 자동·수동 복구, 캐시, 빈 피드, 기존 카드 유지, 계정 전환과 이전 응답 취소를 검증합니다. `.local-preview/resilient-loading.html`은 실제 멤버 데이터에 접근하지 않는 수동 확인용 화면입니다. 이번 실행에서는 Work 설정에서 로컬 브라우저 사용이 비활성화되어 브라우저 직접 조작 검증은 수행하지 못했습니다.
