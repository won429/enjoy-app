# 드롭 철권

드롭 큐브 옆에 있는 별도 가로 전용 격투 게임. 엔조이 홈에는 버튼과 iframe, 전용 호스트 스크립트만 추가한다. 우노 CSS의 진입 버튼 선택자에 새 버튼을 추가한다. 기존 게임 로직, 계정, 데이터 저장소는 변경하지 않는다.

- 혼자 대전: 태오 / 서린 선택, AI 상대, 서버 없이 진행. 이동, 펀치, 킥, 가드, 게이지 필살기. 60초 라운드 / 2선승. 시간 종료 시 체력 비교, 동률은 무승부 후 새 라운드.
- 친구 대전: 동일한 `meetingApp` 엔조이 Firebase 멤버 계정을 공유. 방 코드로 2인 입장, 방장 시작 / 재대전. 신규 `enjoy-tekken` Worker와 SQLite `TekkenRoom` Durable Object. 서버가 이동, 사거리, 공격 타이밍, 피해, 게이지, 라운드, 승패를 계산한다. 클라이언트는 입력만 전송한다.
- 인증: 드롭큐브와 같은 Firebase RS256 토큰 검증과 멤버 프로필 확인. 익명 계정 및 등록되지 않은 멤버 차단. 토큰은 WebSocket 첫 메시지에만 사용하며 URL / 파일 / 스토리지에 저장하지 않는다. 플레이 중에는 Firestore를 읽거나 쓰지 않는다.
- 연결: 계정당 방 연결 1개. 새로운 기기 연결 시 이전 연결 종료. 입력 순번과 대전 ID로 중복 / 이전 대전 요청 무시. 500ms 입력 만료, 최대 4회 재접속. 대전 중 연결이 끊기면 15초 유예 후 연결된 상대 승리. 최대 1시간 미사용 방 정리.
- 실행: 대전 중 30Hz 서버 계산 및 동기화, 5초 체크포인트와 결과 저장. 대기가 끝나면 타이머 종료 후 WebSocket hibernation 사용. 실시간 격투는 턴제 큐브보다 서버 사용량이 많다.
- 화면: 세로에서는 회전 안내. 가로 화면 버튼에서만 fullscreen / orientation lock 요청. 미지원 브라우저는 직접 회전. 혼자 모드는 화면이 숨겨지면 일시 정지, 계속하기 버튼으로 재개.
- 생성 이미지: 내장 `image_gen`으로 만든 독자 캐릭터 태오 / 서린, 사찰 경기장, 화염 / 번개 타격 및 필살기 효과. `assets/tekken/`에서 사용. 프롬프트는 같은 폴더 `image-prompts.txt`.

## 조작

이동: ← → 또는 A / D. 펀치 J, 킥 K, 가드 L / Space, 필살기 I. 모바일은 이동 / 가드 버튼을 길게 누르고 공격 버튼을 누른다. Escape는 혼자 대전 일시 정지 / 재개. 친구 모드에서는 화면 닫기.

## 배포

```sh
cloudflare-worker/node_modules/.bin/wrangler deploy --config cloudflare-worker/wrangler-tekken.toml --dry-run
cloudflare-worker/node_modules/.bin/wrangler deploy --config cloudflare-worker/wrangler-tekken.toml
```

서버: https://enjoy-tekken.sungwon4867.workers.dev
프론트엔드: https://enjoy-app.pages.dev/tekken.html

## 검사

```sh
node --test tests/tekken.test.cjs tests/tekken-server.test.cjs
```

인증 / 친구 동기화는 서명된 모의 계정 두 개를 사용하는 로컬 Cloudflare 런타임에서 검사한다. 실제 두 멤버 계정과 실제 휴대폰 두 대의 대전은 별도 실기 검증이 필요하다.

Cloudflare 구현 참고: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
