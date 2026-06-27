# 가계부 + 자산관리 통합 앱

Node.js + Express + Supabase 기반 가계부 웹 앱 (PWA 지원)

## 스택

- **백엔드**: Node.js + Express
- **DB/인증**: Supabase (Auth + PostgreSQL + RLS)
- **프론트엔드**: Vanilla JS + Chart.js (예정)
- **배포**: Railway
- **PWA**: 홈 화면 추가, 전체화면 실행

---

## 1. Supabase 설정

### 1-1. 프로젝트 생성

1. [supabase.com](https://supabase.com) 접속 → 새 프로젝트 생성
2. **Settings → API** 에서 아래 값 복사:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` 키 → `SUPABASE_ANON_KEY`
   - `service_role secret` 키 → `SUPABASE_SERVICE_ROLE_KEY`

### 1-2. DB 스키마 적용

Supabase 대시보드 → **SQL Editor** → `supabase/schema.sql` 내용 전체 붙여넣기 후 실행

### 1-3. 인증 설정

- **Authentication → Providers → Email** : Enable 확인
- **Authentication → Settings** : "Confirm email" 옵션은 프로덕션 전에 활성화 권장
  (개발 중에는 비활성화 가능)

---

## 2. 로컬 개발

```bash
# 저장소 클론
git clone <repo-url>
cd budget-app

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일을 열어 Supabase 값 입력

# 개발 서버 실행
npm run dev
# → http://localhost:3000
```

---

## 3. Railway 배포

### 3-1. Railway 프로젝트 생성

1. [railway.app](https://railway.app) 접속 → New Project
2. **Deploy from GitHub repo** 선택 → 저장소 연결

### 3-2. 환경변수 등록

Railway 대시보드 → 프로젝트 → **Variables** 탭에서 아래 추가:

| 변수명 | 값 |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 |
| `PORT` | `3000` (Railway가 자동 주입하므로 생략 가능) |

### 3-3. 배포 확인

- Railway가 `package.json`의 `"start": "node server.js"` 를 자동 실행
- 배포 완료 후 제공되는 URL 접속 → 앱 동작 확인

---

## 4. 기능 현황

### STEP 1 (현재)
- [x] 이메일/비밀번호 회원가입 · 로그인
- [x] JWT 기반 API 인증
- [x] 모든 테이블 RLS 적용
- [x] 월별 캘린더 (날짜별 수입/지출 표시)
- [x] 월 이동 버튼 (← 2026.06 →)
- [x] 월 요약 (수입 / 지출 / 잔액)
- [x] 날짜 클릭 → 상세 내역 + 합계
- [x] 내역 추가 / 수정 / 삭제
- [x] 카테고리 (대분류 + 소분류)
- [x] 지출수단 선택
- [x] 저축/투자 카테고리 집계 제외
- [x] CSV 내보내기
- [x] PWA (홈 화면 추가, 오프라인 캐시)

### STEP 2 (예정)
- [ ] 고정지출 관리
- [ ] 자산관리 (예금/대출/투자)

### STEP 3 (예정)
- [ ] 주간리포트
- [ ] 통계 차트 (Chart.js)
- [ ] 검색 기능

---

## 5. 프로젝트 구조

```
budget-app/
├── server.js           # Express 서버 + API
├── package.json
├── .env.example        # 환경변수 템플릿
├── .gitignore
├── public/
│   ├── index.html      # 단일 페이지 앱 (SPA)
│   ├── manifest.json   # PWA 매니페스트
│   └── sw.js           # 서비스워커
└── supabase/
    └── schema.sql      # DB 스키마 + RLS 정책
```
