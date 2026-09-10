# 아시안게임 야구 특별 페이지

실행 파일은 저장소 루트의 `asian-games.html`입니다. Next.js 정적 내보내기이며 기존 앱의 배너에서 열립니다.

## 화면 순서
1. 움직이는 경기장과 `2026 아시안게임 야구, 다시 하나 되다.`
2. 문구 없이 스크롤로 진행하는 투구 → 타격 → 홈런 → 1·2·3루 → 홈 (Three.js)
3. `아시안게임 경기도 엔조이 앱에서.`
4. 24명 선수 캐러셀: 큰 이름, 중앙 이미지, 좌우 작은 이미지, 임시 스펙, 이전/다음 버튼. 650ms 전환.
5. 생성한 야구공이 멀리서 다가온 뒤 축소되며 `다음 승부는 여기에서.`
6. 기존 야구 Firebase `enjoykbooo`의 아시안게임 일정 및 경기정보 연결.

전역 버튼은 왼쪽 위 뒤로가기 하나입니다. 일정/선수 캐러셀 조작 버튼은 해당 섹션 내부에만 있습니다.

## 선수 캐릭터 교체
사용자가 별도로 제공할 예정이므로 선수 이미지는 새로 생성하지 않았습니다. 현재 `public/baseball-assets/players/placeholder.svg` 유니폼을 공통으로 사용합니다.

`src/roster.ts`의 선수별 `image`에 `./baseball-assets/players/kor-01.png`처럼 상대 경로를 넣고, 해당 파일을 `public/baseball-assets/players/`에 넣습니다. 24명은 사용자 제공 순서입니다. 투명 배경 PNG/WebP, 전체 몸이 포함된 세로형 이미지를 권장합니다. `position`, `bats`, `height`, `weight`는 요청에 따라 임의로 채운 임시 값이며 화면에 임시 스펙이라고 표시합니다.

## 수정 및 배포 파일
- `src/App.tsx`: 화면 구성, 뒤로가기, 선수 및 경기 선택
- `src/index.css`: 굵은 글꼴, 캐러셀 반응형 배치
- `src/roster.ts`: 이름/이미지/임시 스펙
- `src/scene/`: 기존 스크롤 3D 동작. 선수 소개에 쓰던 로봇 렌더러는 호출하지 않습니다. 경기 장면은 생성한 투수 8포즈, 타자 8포즈, 포수 이미지와 3D 경기장을 결합한 2.5D 방식입니다. 포즈 간 이미지 혼합으로 동작을 연결하며 완전한 3D 관절 리깅은 아닙니다.
- `src/baseball.ts`, `src/useAsianGames.ts`: 기존 Firebase 읽기 연동

`npm run build` → `npm test` → `node scripts/export.mjs`.
업로드 시 루트 `asian-games.html`, `_next/`, `baseball-assets/asian-stadium-v2.png`, `baseball-assets/asian-baseball-v2.png`, `baseball-assets/players/`, `baseball-assets/flags/`가 필요합니다. 압축파일은 만들지 않습니다. 원격 배포는 수행하지 않았습니다.

## 생성 이미지
내장 image_gen으로 야구공/오프닝 자산과 별도로, 경기용 캐릭터 및 관중석 자산을 생성했습니다. 선수 소개 24명의 개별 캐릭터는 사용자 제공 예정입니다.
- `asian-stadium-v2.png`: 홈플레이트 뒤 심판 높이, 중앙 마운드, 사람/문구 없는 고급 3D 야구장, 오후 빛, 잔디·흙·관중석의 정교한 재질. 첫 화면 환경 이미지로 사용하며 이후 실제 카메라 이동은 기존 3D 경기장으로 전환합니다.
- `asian-baseball-v2.png`: 투명 배경, 가죽의 미세한 질감과 붉은 실밥을 가진 고해상도 단일 야구공. 마지막 스크롤 장면에 사용합니다.

## 경기 장면 교체 (2026-09-09)
- `public/baseball-assets/action/pitcher.png`: 4×2 투수 포즈, 세트·무릎 들기·스트라이드·팔 회전·릴리스·팔로스루·회복. 사용자가 첨부한 캐릭터 이미지를 스타일 참고로 생성.
- `batter.png`: 4×2 타자 포즈, 준비·로딩·스트라이드·스윙·임팩트·팔로스루·홈런 확인·주루 시작. 같은 참고 이미지로 생성.
- `catcher.png`: 같은 스타일의 포수 후면 자세. 투명 배경 생성.
- `grandstand.png`: 지붕, 관중, 유리 스위트, 철골 난간이 있는 3단 관중석. 3:1 정면 파노라마를 생성하여 3D 경기장 내부 곡면에 배치.
- `src/scene/characterSprite.ts`: 투명 동작 아틀라스를 3D 카메라 공간에서 표시하고 포즈 사이를 혼합합니다. 주루는 기존 실제 베이스 좌표를 따라 이동합니다.
- `baseball-assets/action/`도 업로드 대상에 포함합니다.
- 뒤로가기 시각 크기 40px, 화살표 22px.

## 9월 10일 장면 및 좌표 수정
- 오프닝: 10개 구단 로고를 5개씩 두 줄로 표시 → 중앙 회전/빛 효과 → 제공된 Korea 로고 → 확대하며 경기장 진입.
- 투수/타자/주루 각각 16컷(4×4) 투명 PNG. 경기용 타자는 흰색 유니폼, 투수는 남색. 소개용 24명 이미지와 별개입니다.
- `src/scene/actionTimeline.ts`: 릴리스 손 UV와 타격 배트 UV를 3D 공간으로 변환합니다. 공은 이 두 지점을 통과하며 투수 이미지에는 공이 없습니다.
- 낮고 둥근 마운드, 타격 시점 포수 숨김, 관중석 도착까지 타구 유지, 내야 중심의 가까운 주루 시점.
- 주루 후 동일 화면이 흰색으로 페이드되며 `아시안게임 경기도 엔조이 앱에서.`를 스크롤에 맞춰 입력합니다.
- 선수 소개는 고정 구간에서 스크롤에도 크기/기울기/위치가 변합니다.
- 마지막에는 `다음 승부는 여기에서.`가 큰 크기에서 빠르게 축소되어 등장하고, 이어 공이 멀리서 접근해 화면을 지나 사라진 후 일정이 표시됩니다.
- `#pitch`, `#contact`, `#run`으로 주요 장면을 바로 확인할 수 있습니다.
- 추가 업로드: `baseball-assets/clubs/`, `baseball-assets/korea-wordmark.png`, `baseball-assets/action/*16.png` 및 최신 `_next/`, `asian-games.html`.
- 16컷 생성 프롬프트: 동일한 참조 얼굴·머리카락·고급 3D 질감 유지, 4×4 균등 셀, 투명 배경, 공 제외. 투수는 세트부터 릴리스·회복, 타자는 후면에서 투수를 보는 흰 유니폼의 준비부터 임팩트·팔로스루, 주루는 배트 없는 16단계 조깅 사이클로 지정했습니다.

## 9월 10일 추가 보정
- 투구 준비 중 공은 손/글러브 뒤에 가려진 것으로 처리하고 릴리스부터 한 개만 표시합니다.
- 타격 공 중심을 배트 이미지 평면 뒤로 0.14 이동하고 배트의 9·10번 컷에서 셀 경계 밖으로 이어지는 끝부분까지 표시합니다. 투명 픽셀을 제외한 캐릭터에 깊이 쓰기를 적용했습니다.
- 주루 구간은 고정 원경 대신 주자를 따라가는 근접 카메라로 전환하며 주루 캐릭터를 확대했습니다.
- 관중석 위의 분리된 직사각 지붕들을 연속된 타원형 지붕으로 교체했습니다. 기존 생성 관중석 이미지는 유지합니다. 새 외부 3D 모델을 도입한 것은 아닙니다.
- 문구 줄바꿈: `아시안게임 경기도` / `엔조이 앱에서.`. 마지막 문구는 `대한민국의 다음 경기.`.
- 일정은 양쪽 국기/국가명에 동일한 행 높이를 적용하고, 경기정보 버튼과 페이지 이동 버튼을 그리드로 정렬했습니다.


## 최신 전환: 로고 조각 → 금메달 → 선수
현재 화면은 주루를 재생하지 않습니다. `Stage.tsx`에서 홈런 타구까지 재생한 후 금메달 전환으로 이어집니다. 기존 주루 코드/이미지는 보관되어 있지만 화면에서 호출되지 않습니다.
- `Opening.tsx`: 10개 로고 각각 6조각(총60), 소용돌이 궤적과 빛 효과로 중앙 합체.
- `MedalTransition.tsx`: 확대되는 공에서 큰 금메달1개+옅은 후행 금메달23개로 전환. 메달은 웹 네이티브 그라데이션/입체 회전으로 제작했습니다.
- 흰 배경에서 2줄 문구가 입력된 후 개별 글자가 확대·분산·축소하며 사라집니다. 그 뒤 선수 소개가 겹쳐서 등장합니다.
- 마지막 경기 문구는 선택된 선수 배경색에서 짙은 경기 배경으로 서서히 전환됩니다.
- `#medals`로 금메달 장면에 바로 이동할 수 있습니다.

## 금메달 이미지 전환 보정
공을 향해 카메라가 접근한 후 공을 고정한 상태에서 생성 메달 이미지로 크로스페이드합니다. 큰 메달이 360도 회전한 뒤 23개가 중심에서 확산합니다. 배경은 생성한 야구장 이미지이며 실제 구장 사진이 아닙니다. 블러 5→18px와 배경 확대를 적용했습니다. `baseball-assets/gold-medal-v3.png`도 업로드에 포함합니다. 생성 프롬프트는 금속 질감의 원형 금메달, 야구 다이아몬드/공/월계수 부조, 2026, 공식 메달 복제 없이 독창적인 디자인입니다. 생성 이미지의 바깥 체크무늬는 원형 CSS 마스크로 제외합니다.
배트는 10·11번 컷의 왼쪽 침범 영역을 제외하고, 포즈 크로스페이드를 없애 이중 배트와 몸 잔상을 방지합니다.

## 2026-09-10 — leather, threads and flag

Generated using the built-in image_gen tool. Assets are stored in public/baseball-assets and exported to ../baseball-assets.

- baseball-leather-v4.png: premium product photograph of one white pebbled-leather baseball, two red individually stitched seam curves, soft upper-left studio light, no branding.
- baseball-core-v4.png: edit of the same ball, preserving size, lighting and position; remove all red threads and stitch holes and reconstruct white leather.
- taegeukgi-silk-v1.png: frontal cinematic South Korean flag textile photograph, white silk folds, correct taegeuk and four trigrams, no text or pole.

The tool baked checkerboard pixels into the ball backgrounds. Both DOM and Three.js apply an explicit circular mask so these pixels are not displayed. This is a generated billboard for the moving ball; it is not a textured rotating 3D leather mesh. The final threads use a red-channel alpha filter on the same generated photo, so the separated stitches originate from their actual positions. The core crossfades in while both seam strips lift off, separate and leave the viewport. A lightweight shader animates the generated silk flag continuously behind the final transition and schedule. Reduced-motion disables the fabric animation; hidden/off-screen rendering is paused. Firebase schedule queries and navigation are unchanged.
