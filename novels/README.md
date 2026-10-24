# 웹소설 파일 관리

작품마다 별도 폴더에 `work.json`(작품 정보)과 `cover.png`(표지 원본)를 둡니다.
현재 작품은 `people-who-smiled-at-my-funeral` 폴더에 있습니다.
인물관계도는 같은 폴더의 `relationships.png`에 두고 `work.json`의 `relationshipMap`에서 파일명과 원본 크기를 지정합니다.
작품 소개와 인물관계도는 각각 기본으로 접혀 있으며 눌러서 펼칠 수 있습니다.

작품 정보를 수정한 뒤 저장소 루트에서 다음 명령을 실행하면 작품 소개 HTML과 홈의 작품 목록을 함께 갱신합니다.

```sh
npm run build:novels
```

생성된 HTML도 함께 GitHub에 올리면 됩니다. 서버나 Firebase는 필요하지 않습니다.
소개글 전체가 HTML에 들어가므로 자바스크립트를 실행하지 않아도 읽을 수 있습니다.
`totalEpisodes`는 작품의 총 부작 수이며, 공개된 회차 수나 완결 여부를 뜻하지 않습니다.
현재는 작품 정보만 등록되어 있으며 회차 본문은 아직 추가하지 않았습니다.
