# 로딩 UI 유지 안내

- 사이트 첫 진입은 `app-loading.css`, `app-loading.js`와 `index.html`의 홈 스켈레톤을 사용한다. 인증과 초기 데이터가 준비되면 `enjoyFinishAppLoading()`, 동기화 실패 시 `enjoyCancelAppLoading()`으로 즉시 숨긴다.
- 사용자 요청(2026-10-27): **로딩 아일랜드는 다른 곳에서 사용할 수 있으므로 삭제하지 않고 보존한다.** 첫 진입에 다시 연결하지 않는다.
- 원본 `loading-island.js`, `loading-island.css`, `assets/loading-island/{scan,done,orbit}.webp`는 그대로 남겨두었다. 상담 예약도 `done.webp`, `orbit.webp`를 사용하므로 함께 보존한다.

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
