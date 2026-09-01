# Notion Google Calendar 주간 위젯

노션 페이지에 임베드하는 주간 캘린더입니다. 서비스 계정으로 인증하는 서버리스 프록시를 거치기 때문에 캘린더를 공개로 바꾸지 않아도 되고, 자격증명이 브라우저에 노출되지 않습니다.

```
브라우저(위젯)  →  /api/events (Vercel Function)  →  Google Calendar API
   공개          서비스 계정 키는 여기에만 존재        비공개 캘린더
```

- 60초마다 자동 갱신
- 현재 시각 표시선
- 시스템 라이트/다크 모드 자동 전환
- 주 단위 이동 (이전 / 이번 주 / 다음)

---

## 1. Google Cloud 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 새 프로젝트 생성
2. **API 및 서비스 → 라이브러리** → `Google Calendar API` 검색 후 **사용 설정**
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → 서비스 계정**
   - 이름은 자유롭게 (예: `notion-calendar-reader`)
   - 역할은 **부여하지 않아도 됩니다** (캘린더 권한은 다음 단계에서 공유로 처리)
4. 생성된 서비스 계정 → **키 → 키 추가 → 새 키 만들기 → JSON** → 파일 다운로드
5. JSON 안의 `client_email` 값(`...@....iam.gserviceaccount.com`)을 복사

## 2. 캘린더 권한 공유

1. Google Calendar → 대상 캘린더의 **설정 및 공유**
2. **특정 사용자 또는 그룹과 공유** → 위에서 복사한 서비스 계정 이메일 추가
3. 권한은 반드시 **모든 일정 세부정보 보기**(읽기 전용)로 설정
4. 같은 화면의 **캘린더 통합** 섹션에서 **캘린더 ID**를 복사

> 최소 권한 원칙: 변경 권한은 절대 주지 마세요. 위젯은 읽기만 합니다.

## 3. 배포

```bash
# 이 폴더를 GitHub 리포지토리로 올린 뒤
npm install
npx vercel        # 최초 배포
npx vercel --prod # 프로덕션 배포
```

Vercel 프로젝트의 **Settings → Environment Variables**에 두 개를 등록합니다.

| 이름 | 값 |
|---|---|
| `GOOGLE_CALENDAR_ID` | 2단계에서 복사한 캘린더 ID |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 1단계 JSON 파일의 **전체 내용**을 그대로 붙여넣기 |

환경변수를 추가한 뒤에는 반드시 **재배포**해야 반영됩니다.

⚠️ 다운로드한 JSON 키 파일은 **절대 커밋하지 마세요.** `.gitignore`에 `*.json` 키 파일 경로를 추가해 두세요.

## 4. 노션에 임베드

1. 배포 URL(`https://<프로젝트>.vercel.app`)을 복사
2. 노션 페이지에서 `/embed` 입력 → URL 붙여넣기 → **임베드 생성**
3. 블록 아래 모서리를 드래그해 높이 조절 (600px 내외 권장)

`vercel.json`에 `frame-ancestors`로 노션 도메인만 허용해 두었기 때문에, 다른 사이트에서는 이 위젯을 iframe으로 띄울 수 없습니다.

---

## 커스터마이징

| 항목 | 위치 |
|---|---|
| 갱신 주기 | `public/index.html`의 `REFRESH_MS` |
| 기본 표시 시간대 (07–22시) | `render()` 안의 `let from = 7, to = 22` |
| 1시간 높이 | `ROW` 상수와 CSS `--row` (두 값을 함께 수정) |
| 주 시작 요일 | `startOfWeek()`의 `shift` 계산식 |
| 색상 | CSS `:root` 및 `prefers-color-scheme: dark` 블록 |

## 보안 메모

- 프록시가 `id / 제목 / 시작 / 종료`만 내려보냅니다. 설명·참석자·회의 링크·위치는 브라우저에 도달하지 않습니다.
- 조회 기간은 서버에서 40일로 제한되어 있어, URL을 조작해 캘린더 전체를 긁어가는 것을 막습니다.
- 응답은 60초 캐시되어 Calendar API 쿼터를 절약합니다.
- 노션 페이지를 공유하면 그 페이지를 보는 사람에게 일정 제목이 그대로 노출됩니다. 공유 페이지에 붙일 거라면 별도의 캘린더를 만들어 쓰세요.
