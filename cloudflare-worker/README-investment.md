# 엔조이 투자 서버

운영 API: https://enjoy-investment.sungwon4867.workers.dev

## 멤버별 투자 연결 (2026-10-27)

- Google/Firebase ID 토큰의 서명과 프로젝트를 확인하고, 토큰의 UID로 기존 멤버 프로필을 조회한다. 요청 본문의 UID나 이름은 거래 대상 선택에 사용하지 않는다.
- 등록 멤버만 계좌·순위를 조회하고 엔조이스튜디오(`en-joy`)를 구매·판매한다. 엔조이(`enjoy`)는 거래하지 않는 대표 지수다.
- 보유 포인트는 기존 `members/{uid}.points`다. 구매 시 포인트를 차감하고 판매 시 지급한다. 마이너스 포인트 기록도 보존하며 잔액이 부족하면 구매를 거절한다.
- 포인트, 보유 수량·취득원가·실현수익, 고유 주문 영수증을 Firestore의 한 commit으로 갱신한다. 프로필/계좌 updateTime과 영수증 exists 조건으로 다른 기기의 동시 거래나 포인트 지급과 충돌하면 전부 재조회·재시도한다.
- 같은 UID와 requestId의 재전송은 기존 영수증을 돌려준다. 동일 requestId에 수량·방향·가격·시세 revision을 바꾸면 거절한다. 응답 유실 때 클라이언트는 UID별 sessionStorage에 보관한 같은 requestId로 결과를 재확인한다.
- 정수 수량 1~1,000,000토큰, 정수 포인트 시세로 거래하며 수수료는 0이다. 부분 판매 시 평균 취득원가를 정수 비율로 배분하고 마지막 판매에서 잔여 원가를 모두 제거한다.
- 거래시간은 한국시간 00:00 이상 23:30 미만이다. 서버가 받은 공통 가격과 expectedPrice/expectedRevision이 일치하고 시세가 최신이며 주문 유효시간이 남아 있어야 한다. 시세 갱신·장 마감·서버 장애 중에는 새 거래를 실행하지 않는다.
- 거래가 활성화되면 기기별 무작위 화면 시세를 멈추고 모든 멤버에게 실제 공통 체결 가격을 표시한다.
- 투자 순위는 현재 보유한 드롭의 취득원가(costBasis) 내림차순이다. 같은 금액은 공동 순위이며 다음 순위는 인원 수를 반영한다. 보유 포인트를 투자금에 포함하지 않는다. 평가금액과 평가수익률은 공통 서버 시세로 계산한다.
- 투자 화면에 진입하거나 시세·계정·포인트가 변경되면 읽고, 열려 있는 동안 30초마다 갱신한다. 화면을 나가거나 백그라운드로 가면 계좌/순위 폴링을 멈춘다. 로그아웃·계정 전환은 이전 계좌를 즉시 지우며 늦게 도착한 응답을 무시한다.
- 참고 호가는 대기 주문이 없는 가격 사다리다. 지정가 주문·주문장 매칭은 구현하지 않는다. 실제 개인 체결 내역은 '내 드롭'에 표시한다. 거래 활성화 뒤 일별 시세 표는 종가와 등락률만 표시하며 거래량을 가짜 0으로 표시하지 않는다.

## 저장소와 서버 간 연결

시세·차트·영상 집계는 기존 `INVESTMENT_MARKET / InvestmentMarket / enjoy-market-v1` SQLite Durable Object를 그대로 사용한다. 기존 가격·revision·차트·영상 기록을 초기화하지 않는다.

멤버별 기록은 기존 보안 규칙에서 클라이언트 접근을 금지한 경로 아래에 저장한다.

- 계좌: `drop_predictions/investment-ledger-v1/accounts/{uid}`
- 영수증: 위 계좌의 `orders/{requestId}`
- 상위 `drop_predictions/investment-ledger-v1` 문서는 만들지 않으므로 예측 목록이나 정산 대상으로 추가되지 않는다.
- 기존 `drop_predictions/{document=**}` 보호 규칙을 그대로 사용한다. 브라우저에 이 경로의 직접 쓰기 권한을 추가하지 않는다.

투자 Worker의 `INVESTMENT_LEDGER` Service binding은 기존 `enjoy-drop-prediction` Worker의 전용 `InvestmentLedger` RPC entrypoint를 호출한다. 이 entrypoint는 공개 HTTP URL을 노출하지 않으며 Firebase 토큰과 등록 멤버를 다시 검증한다. 기존 정산 Worker의 `FIREBASE_SERVICE_ACCOUNT` 암호화 secret을 내부에서 사용하므로 키를 복사하거나 사이트·Git에 저장하지 않는다. 예측 서비스의 HTTP·Cron 동작은 기존 코드를 그대로 재수출한다.

## API

아래 계좌 API는 허용된 사이트 Origin과 Firebase Bearer 토큰이 필요하다. 인증 실패 401, 비멤버 403, 가격/중복 충돌 409, 거래 마감 423, 저장소 연결 실패 503을 반환한다. 개인 데이터 응답은 no-store다.

- `GET /account`: UID별 포인트, 보유량, 취득원가, 평가금액·수익률, 실현수익, 최근 거래 20개.
- `GET /ranking`: 등록 멤버별 실제 투자금액과 평가금액·수익률 및 순위.
- `POST /orders`: `{requestId, symbol:'en-joy', side:'buy'|'sell', quantity, expectedPrice, expectedRevision, expiresAt}`. requestId는 UUID이며 재시도 시 같은 본문을 사용한다. expiresAt는 서버 시각 기준 1분 뒤로 만든다.
- `GET /health`: version 9, tradingEnabled, ledgerReady. `?check=ledger`는 내부 Firebase 읽기 연결도 점검하며 데이터를 쓰지 않는다.

기존 시세 API는 유지한다.

- `GET /market`: 공통 가격·전일 종가 대비 등락, revision, asOf, serverTime, nextUpdateAt, stale, tradingEnabled.
- `GET /history?symbol=en-joy&period=day`: OHLC 차트. period는 day, 1d, 1w, 3m, 1y, 5y, all.
- `GET /ticks?symbol=en-joy&before=...`: 저장된 30분 시세, 최신순 48개.
- `GET /closes?symbol=en-joy&before=...`: 한국시간 23:30 확정 종가, 최신순 30일.
- `GET /orderbook?symbol=en-joy`: 참고 호가 사다리. 잔량은 실제 대기 주문이 없으므로 0이다.
- `GET /admin/overview`, `POST /admin/index`: 기존 지수 관리와 변경 기록.
- `POST /activity/click`, `GET /vlog/status`: 기존 영상 클릭 집계와 영향 상태.

시세는 기존 Cron(`*/30 * * * *`)만 갱신한다. 기준 변동은 ±10%, 지수·클릭·새 영상 영향 비중은 각각 20%·30%·50%다. 지수는 수동 설정을 유지한다. 시간별 차트는 90일, 일별 차트/종가는 약 10년 보관한다.

## 배포 순서

1. `wrangler deploy --config wrangler-prediction.toml`: 기존 정산 Worker에 전용 RPC export 추가. 기존 secret을 유지한다.
2. `wrangler deploy --config wrangler-investment.toml`: 시세 저장소와 namespace를 유지하고 Service binding을 연결한다.
3. `/health?check=ledger`의 version 9, tradingEnabled와 ledgerReady를 확인한다.
4. 사이트의 `investment.js`, `investment-portfolio.js`, `investment.css`와 index.html의 두 스크립트 순서/버전을 함께 반영한다.

일시적으로 신규 거래를 막으려면 `TRADING_ENABLED="false"`로 투자 Worker를 배포한다. 기록 조회와 이미 완료된 주문의 영수증 재확인은 유지된다. 소스에는 실제 비밀키를 넣지 않는다.

## 검증

`node --test tests/investment-trades.test.cjs tests/investment-portfolio.test.cjs`:
멤버별 저장·복원, 실제 순위, 수량/포인트 부족, 평균원가와 최종 전량 판매, 동시 구매/판매, 응답 유실 후 같은 주문 재확인, 계정 전환과 늦은 응답, 연결 지연/장 마감.

`node --test tests/investment-ledger-server.test.cjs`:
Cloudflare 런타임에서 실제 Service binding, Google 서명 확인, 내부 서비스 계정 인증, Firestore REST commit과 조건부 쓰기를 모의 데이터로 통합 검증한다. 실제 멤버 포인트를 변경하지 않는다.

기존 시세 회귀 테스트: `tests/investment*.test.cjs`. 기존 예측 회귀 테스트: `tests/drop-prediction*.test.cjs`.
