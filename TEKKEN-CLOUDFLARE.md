# 드롭 철권

엔조이의 별도 가로 전용 격투 게임. 홈에서는 철권 iframe의 캐시 버전만 갱신한다. 다른 게임, 계정 데이터 구조, 홈 화면 동작은 변경하지 않는다.

## Motion v2 · 2026-10-15

- 태오(복싱), 서린(태권도), 무진(파워), 유라(기교) 4명. 이동 속도, 펀치 파워, 킥 리치, 필살기 타격 수와 타이밍이 다르다. 60초 라운드 / 2선승.
- 내장 OpenAI `image_gen`으로 새로 만든 13개 이미지: 캐릭터별 기본 24셀과 공격 24셀, 공용 점프 / 착지 24셀, 띄우기 24셀, 가드 / 피격 / 필살기 준비 24셀, 타격 효과 24셀, 선택 초상화 4개. 기본 시트의 대기·걷기 12셀을 사용하고 펀치·킥은 각각 전용 12셀로 재생한다. 모든 원본 PNG와 실제 프롬프트는 `assets/tekken/v2/` 및 `generation-prompts.json`에 저장했다. 기존 사찰 경기장 이미지는 계속 사용한다.
- Canvas 렌더링은 rAF 시간 기준. 논리는 고정 60Hz, 로컬 이전/현재 위치 보간, 가속 / 감속, 점프 중력, 착지, 대시 재사용 대기, 180ms 공격 입력 버퍼, 3단 펀치와 띄우기 / 공중 연계, 콤보 피해 보정. 타격 순간 정지는 의도된 18–55ms의 hitstop이다.
- `tekken-motion.js`가 이미지 셀의 알파 경계와 골반 중심, 발 위치를 읽어 프레임을 정렬한다. 같은 동작의 인접 셀을 짧게 겹치되 몸통의 불투명도를 유지한다. 킥 / 필살기 접촉 셀은 서버의 타격 타이밍에 맞춘다. 잔상, 입자, 생성된 6단계 타격 효과, 짧은 카메라 반동, 피해 / 콤보 표시, 필살기 배너, WebAudio 효과음. 감소된 동작 설정에서는 화면 흔들림과 잔상을 생략한다.
- 혼자 대전은 네 캐릭터 중 다른 캐릭터 AI와 진행. 연습장은 체력·필살기 게이지를 계속 회복하며 상대 대기 / 가드, 위치 초기화를 제공한다.
- 친구 대전은 기존 Firebase `meetingApp` 엔조이 멤버 계정과 `enjoy-tekken` Worker / SQLite `TekkenRoom` Durable Object를 계속 사용한다. 서버의 30Hz 콜백 안에서 60Hz 이하 세부 스텝으로 판정을 계산하고 약 30Hz로 동기화한다. 원격 위치 65ms 보간, 최대 65ms 예측, 내 캐릭터의 입력 반영과 렌더링 보정. 서버가 HP·게이지·승패의 유일한 권한이다.
- 인증 / 연결 유지: Firebase RS256 토큰 검증과 멤버 프로필 1회 확인, 익명 / 비멤버 차단. 토큰은 WebSocket 첫 메시지에만 보내며 URL / 파일 / 저장소에 저장하지 않는다. 게임 진행 중 Firestore 읽기 / 쓰기 없음. 계정당 방 연결 1개, 순번 / 대전 ID 검증, 500ms 입력 만료, 재접속 최대 4회, 연결 끊김 15초 유예, 5초 체크포인트, 1시간 미사용 방 정리. v1 체크포인트는 위치·체력·점수를 보존하며 v2 필드로 승격한다. 스냅샷 `protocol:2`가 맞지 않으면 새로고침을 안내한다.
- 전체 이미지 준비 후 시작 버튼 활성화. 세로 화면에서는 회전 안내. fullscreen / orientation lock은 사용자 버튼에서만 요청. 혼자 대전 / 연습장은 화면 숨김 시 일시 정지.

## 조작

A / D 또는 ← → 이동, W / ↑ 점프, Shift 대시, J 펀치, K 킥, U 띄우기, L / Space 가드, I 필살기. 모바일은 이동 / 가드 버튼을 길게 누르고 기술 버튼을 누른다. Escape는 로컬 대전 일시 정지 / 재개. 친구 모드에서는 화면 닫기.

## 검증

```sh
node --test tests/tekken.test.cjs tests/tekken-motion.test.cjs tests/tekken-server.test.cjs
cloudflare-worker/node_modules/.bin/wrangler deploy --config cloudflare-worker/wrangler-tekken.toml --dry-run
```

엔진 / 보간 검사는 4명 특성, AI 대전, 입력 버퍼와 hitstop, 가속 / 착지 / 대시, 공중 반응, 라운드, 변조 입력, 30 / 60 / 120Hz 화면 주기에서 동일한 논리 결과, v1 복원, 서버 판정과 접촉 애니메이션 일치를 포함한다. 서버 검사는 서명된 모의 멤버 두 명을 사용하는 실제 로컬 Cloudflare 런타임에서 새 캐릭터 2 / 3, 인증 거부, 2인 방, 권한, 피해 동기화, 중복 입력 무시, 재접속, 나가기와 방장 이전을 검사한다. 실제 두 멤버 계정과 두 휴대폰의 지연 / 네트워크 상태 검증은 별도 실기가 필요하다.

브라우저 QA: 1100×620, 844×390, 667×280 가로 화면 및 세로 회전 안내. 선택, 대전, 새 동작, 연습장, 키보드 / 터치 버튼, 일시 정지와 조작법. DOM의 `data-fps` / `data-render-ms`는 최근 1초 실제 rAF와 평균 프레임 작업 시간이며 기기 성능 보장은 아니다.

## 배포

```sh
cloudflare-worker/node_modules/.bin/wrangler deploy --config cloudflare-worker/wrangler-tekken.toml
cloudflare-worker/node_modules/.bin/wrangler pages deploy PATH_TO_CLEAN_STATIC_EXPORT --project-name enjoy-app --branch main --commit-dirty=true
```

Pages 배포에는 Git 추적 파일만 내보내고 `cloudflare-worker`, `tests`, 문서, `.git`, `node_modules`, 검증 산출물을 제외한다.

서버: https://enjoy-tekken.sungwon4867.workers.dev
프론트엔드: https://enjoy-app.pages.dev/tekken

구현 참고: [Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [MDN rAF timestamp](https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope/requestAnimationFrame).
