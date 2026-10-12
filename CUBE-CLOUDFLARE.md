# 드롭 큐브

기존 드롭 우노 바로 옆에서 여는 독립된 루미큐브 방식 게임이다. 기존 index.html은 진입 버튼, iframe과 전용 호스트 스크립트, 버튼 스타일 캐시 버전만 추가했다. uno.css는 진입 버튼 선택자에 #drop-cube-button만 추가했다. 기존 우노 엔진·게임 화면·서버와 다른 화면은 변경하지 않았다.

## 플레이

- 혼자하기: 2~4인, 가상 플레이어, 로그인/서버 없이 진행. 차례당 30초. 뒤로가기는 인원 선택, 브라우저 뒤로가기와 호스트 닫기는 일시 중지.
- 친구와 하기: 기존 Firebase meetingApp 멤버 인증, 실시간 방 목록, 6자리 방 코드, 방장 시작/가상 플레이어 추가·삭제, 최대 4인.
- 106장, 14장 배분, 같은 숫자/다른 색 그룹과 같은 색 연속 숫자, 첫 등록 30점, 조커, 기존 테이블 재배열, 1장 뽑기, 승리/벌점/새 판.
- 별도 새 묶음 버튼이나 양끝 화살표 없이, 패를 테이블의 원하는 곳에 끌어놓는다. 가까운 묶음의 끝이나 사이에 놓으면 이어진다. 놓은 위치는 유지되고, 패가 많아지면 테이블 전체가 함께 축소된다. 받침대에서도 빈칸 이동과 자리 교환이 가능하며 공간이 채워지면 열을 늘리고 패를 축소한다. 첫 등록 후에는 테이블 타일도 옮길 수 있다. 받침대로는 자신의 이번 차례 타일만 되돌릴 수 있다. 되돌리기는 이번 차례 편집 전체 취소.
- 친구 모드 차례는 서버 기준 30초. 초안은 기기에만 있고 차례 완료 때 원자적으로 검증·반영된다. 시간이 끝나면 기존 테이블을 유지하고 1장 뽑는다. 혼자하기는 차례당 30초.
- 시작 순서는 무작위다. 더미가 비고 전원이 연속으로 넘기면 남은 타일 점수가 가장 작은 플레이어가 승리. 힌트와 AI는 받침대의 새 묶음 및 기존 묶음 양끝 추가를 찾으며 모든 재배열 해법을 탐색하는 완전한 솔버는 아니다.
- 숫자와 조커는 HTML의 실제 게임 데이터로 표시하며 이미지에 구워 넣지 않는다. 색 이름 및 서로 다른 작은 기호로 색을 구분하고 키보드로 선택할 수 있다.

기본 규칙 출처: https://rummikub.com/wp-content/uploads/2019/12/2600-English.pdf

## Cloudflare

별도의 enjoy-cube Worker: https://enjoy-cube.sungwon4867.workers.dev

cube-worker.js는 기존 우노의 인증·WebSocket·방 디렉터리·저장·복원 구조를 별도의 바인딩으로 사용한다. CubeGameRoom/CubeLobby는 SQLite Durable Objects이며 기존 우노 저장소에 접근하지 않는다. 인증 토큰을 URL·스토리지·로그에 저장하지 않는다. 멤버 프로필은 연결 시 읽고 타일 동작은 Firestore를 호출하지 않는다. 상대 받침대와 더미는 서버에만 남는다. 상태 revision과 성공 요청 ID로 오래된 동작 및 중복 요청을 막는다. 봇 차례·30초 차례 종료·24시간 방 정리는 alarm으로 처리한다.

```sh
cd cloudflare-worker
npm run check:cube
npm run deploy:cube
```

프론트엔드: index.html, uno.css, cube.html, cube.css, cube.js, cube-layout.js, cube-engine.js, cube-page.js, cube-host.js, assets/cube/table.jpg. 기존 assets/uno/avatars.webp를 그대로 재사용한다.

## 이미지 생성

내장 image_gen 도구로 생성한 테이블 배경:
- 원본: assets/cube/table.png
- 실제 사용: assets/cube/table.jpg
- 프롬프트: assets/cube/image-prompt.txt

## 검증

```sh
node --test tests/cube.test.cjs tests/cube-layout.test.cjs tests/cube-server.test.cjs
node --test tests/uno.test.cjs tests/uno-solo.test.cjs tests/war-host.test.cjs
```

규칙·조커·첫 등록·재배열·타일 보존 및 120판 AI 완주, Cloudflare 로컬 실행 환경의 서명된 모의 계정 2인 동기화/비공개 받침대/중복 요청/재접속/오프라인 차례 종료/방장 이관을 확인했다. 기존 우노와 전쟁 진입 관련 42개 테스트 통과. 실제 서로 다른 두 멤버 계정의 기기 간 한 판 완주는 별도로 진행하지 않았다.

## Reference layout update (2026-10-12)

The game view now follows the supplied landscape reference: full royal-blue playing field, circular profiles and tile counts down the left, two-row ivory tiles on a honey-wood rack at bottom center, sorting and draw controls on the right. Solo back returns to player selection; the duplicate solo exit link is removed. Friend-room leave, pending actions, server rules and authentication retain their previous behavior.

Built-in image_gen generated assets (selected original and consuming asset):
- Blue board: assets/cube/blue-board-v2.png; assets/cube/blue-board-v2.jpg. Prompt: assets/cube/blue-board-v2-prompt.txt.
- Wood rack: assets/cube/wood-rack-v3.png; assets/cube/wood-rack-v3.webp. Prompt: assets/cube/wood-rack-v3-prompt.txt.
- Ivory tile: assets/cube/ivory-tile-v2.png; assets/cube/ivory-tile-v2.webp. Prompt: assets/cube/ivory-tile-v2-prompt.txt.

Visual QA: design-qa.md. Sources and comparisons: artifacts/cube/layout-v2/.

## Landscape interaction update

- Both solo and friend turns last 30 seconds. Expired drafts roll back and draw one tile. The server remains authoritative for friends.
- Pointer Events support mouse and touch dragging: blank board creates a meld, existing melds accept insertion, own draft tiles return to the rack. Click selection and keyboard controls remain available.
- Shared melds shrink together to fit the entire board without horizontal or vertical scrolling, including long runs.
- Portrait shows a rotation gate. Optional fullscreen/orientation lock runs only on the explicit button; unsupported browsers require physically rotating the phone. Landscape reserves safe-area insets plus 48px on both short sides for camera cutouts.
- Supported browsers use navigator.audioSession.type = playback for silent-switch sound. Game mute still stops effects; device media volume and browser restrictions remain in force. Real iPhone/Galaxy hardware was not available for testing.
- Tile movements, draws and sorting animate; the active player's portrait shows seconds and a diminishing ring, with an orange last-ten-second state. Reduced-motion settings disable animation.

## Video interaction update (2026-10-12)

Reference: https://www.youtube.com/watch?v=zHEn8jo5MnU (placement, rack, clock and motion at 0:10 and 9:56).

- Free tabletop coordinates replace the new-meld and append-arrow controls. Nearby drops insert into groups; distant drops retain their location. Insertion only moves colliding neighbours.
- Rack holes persist while drafting. Own draft tiles can return to a chosen slot; occupied slots swap or shift. Drawing fills an empty slot before adding space.
- Logical group coordinates persist through a turn and synchronize through Cube Durable Objects. Invalid coordinates reject the whole action before saving. Older clients without coordinates still receive an automatic arrangement.
- FLIP movement starts at the drag release position, and sorting, dealing, drawing and board zoom glide between their old and new positions. Opponent draws animate a face-down tile.
- The active avatar contains the 30-second countdown and shrinking ring. Editing replaces the draw plus with a round undo control; the check button submits the turn.
- All 17 Cube tests pass, including 120 seeded complete AI games, rack conservation, stable anchors, fit bounds, server layout persistence and two signed mock WebSocket clients. Browser QA covers neighbour insertion, free multi-tile placement, rack return, 80/100 tile tables, 667×280 landscape and the portrait gate. Real iPhone/Galaxy hardware and two real member devices were not available.

## Touch and hint fixes (2026-10-12)

- Tile pointer-down cancels browser defaults and immediately captures the gesture. Tap selection is handled on pointer-up, separately from dragging. Native drag, text selection and long-press copy menus are disabled on tiles, including their child labels. WebKit user-select/user-drag overrides and explicit draggable=false cover Safari's native selection path.
- Raised rack tiles can paint above the rack without clipping. Table selections retain their position to stay inside the fitted board. The board and rack still fit without scrolling.
- Each player has two hint attempts per round in both modes. The button shows the remaining count and disables at zero. Requests without a found placement also consume one attempt. New games reset the allowance; undo, subsequent turns and friend reconnection do not. Friend requests are counted atomically by the Worker with duplicate receipts and deadline enforcement, and never restart the 30-second turn clock.
- Nineteen Cube tests pass, including signed mock WebSocket hint requests, reconnect persistence, duplicate handling, allowance exhaustion, per-player isolation and new-round reset. Browser QA verifies tap selection, selected-tile dragging, an exposed raised top edge and the 2→1→0 hint button. Real iPhone/Galaxy touch hardware was not available.

## Rearrangement, member portraits and table space (2026-10-12)

- Taking tiles out of a run automatically separates the remaining contiguous pieces and retains their original locations. Same-number groups keep their remaining tiles together. This applies to public-tile reuse and returning one's draft tiles to the rack. Existing submission rules still require valid groups and at least one own tile.
- Regular drops snap only when aligned with a group. Holding a tile for 450ms before dragging (or Alt-dragging) bypasses snapping; keyboard arrows do likewise. Collision avoidance searches near the drop before using a fallback position.
- Embedded games use the host's Enjoy member cache for account nicknames and photos. Direct visits restore the same Firebase session and read the member profile once. Anonymous solo remains playable offline. Friend profiles are verified by the Worker at connection and refreshed on reconnection without changing the turn, tiles or draft revision. HTTPS pictures render with no-referrer and fall back to the name initial if absent or unavailable. Bots keep the existing artwork.
- Rack tiles are 18% smaller at the normal size. Landscape bottom spacing drops from a minimum 10px to 6px while retaining the device safe-area inset, moving the rack downward and expanding the shared board.
- All 23 Cube tests pass, including automatic run splitting and a legal reuse submission, free-placement behavior, signed mock-member pictures and profile-refresh persistence. Browser QA covers the split/reuse interaction, keyboard movement, selected-tile clipping, smaller rack dimensions and the embedded account profile. Actual iPhone/Galaxy touch hardware and real two-account play were not available.
