# Enjoy School Notion Worker

`school.html`에서 Notion 공지 데이터를 자동으로 가져오기 위한 Cloudflare Worker입니다.

## 지금 들어간 구성

- Worker 파일: `cloudflare-worker/notion-school-worker.js`
- Cloudflare 설정: `cloudflare-worker/wrangler.toml`
- 사이트 연동 위치: `school.html`의 `SCHOOL_NOTICE_API`
- API 주소 형식: `GET /notices?school=andong`

## Notion 데이터베이스 권장 속성

| 이름 | Notion 타입 | 설명 |
| --- | --- | --- |
| `제목` | Title | 공지 제목 |
| `날짜` | Date | 공지 날짜 |
| `카테고리` | Select | 학사/장학/행사 등 |
| `요약` | Text / Rich text | 카드에 표시할 짧은 설명 |

속성 이름이 조금 달라도 Worker가 Title/Date/Select/Rich text 타입을 자동으로 찾아서 표시합니다.

## 배포 전 원 님이 넣어야 하는 값

### 1. Notion Integration 토큰

Cloudflare Worker secret으로 저장합니다. 터미널에서 `cloudflare-worker` 폴더로 이동 후:

```bash
npx wrangler secret put NOTION_TOKEN --config wrangler.toml
```

붙여넣을 값은 Notion Integration의 `secret_...` 토큰입니다.

### 2. 학교별 Notion Database ID

`wrangler.toml`의 `[vars]`에 넣습니다.

```toml
[vars]
ANDONG_DATABASE_ID = "노션_안동_DB_ID"
# WOOSONG_DATABASE_ID = "노션_우송_DB_ID"
# GYEONGSANG_DATABASE_ID = "노션_경상_DB_ID"
# SILLA_DATABASE_ID = "노션_신라_DB_ID"
# GWANGJU_DATABASE_ID = "노션_광주_DB_ID"
# YEUNGNAM_DATABASE_ID = "노션_영남_DB_ID"
```

처음에는 안동만 있어도 됩니다. 나머지는 나중에 주석을 풀고 DB ID를 넣으면 사이트 탭이 바로 연결됩니다.

## 배포

```bash
cd cloudflare-worker
npx wrangler deploy --config wrangler.toml
```

배포 후 나온 URL을 `school.html`에 넣습니다.

```js
const SCHOOL_NOTICE_API = 'https://enjoy-school-notices.<your-subdomain>.workers.dev';
```

## 테스트

```bash
curl 'https://배포된-worker-url/notices?school=andong'
```

응답 예시:

```json
{
  "school": "andong",
  "label": "국립경국대(안동캠)",
  "notices": [
    {
      "id": "...",
      "title": "공지 제목",
      "date": "2026-06-22",
      "category": "학사",
      "summary": "짧은 설명",
      "url": "https://www.notion.so/..."
    }
  ]
}
```
