# 삼탄 TMS (Tire Monitoring System)

TECHKING ETCRANE 385/95R24(14.00R24) **Road Train 타이어 모니터링** 웹 대시보드입니다.
PT. Trasindo Murni Perkasa · Kalimantan Field 현장에서 운용하는 차량의 공기압·트레드·교체·수명·하중을 한 화면에서 관리합니다.

> 상세 기능·사용법은 [docs/사용설명서.md](docs/사용설명서.md)를 참고하세요.

## 기술 스택

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Recharts (차트) · Framer Motion (애니메이션)
- Supabase (전체 데이터 저장)

## 주요 기능

- **8개 탭:** 대시보드 · 차량 배치도 · 하중계산 · 타이어 교체 이력 · 타이어 수명 DB · 점검 입력 · 압력·트레드 추이 · 타이어 공기압관리
- **다국어(한국어/인도네시아어):** 헤더의 KO/ID 토글로 전환, 선택 언어는 브라우저에 저장
- **Supabase 연동:** 모든 데이터(차량·포지션·점검·교체·수명·손상코드·스펙)를 DB에서 로드, 점검 입력은 즉시 저장(upsert)

## 실행 방법

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 실행
npm run build      # 프로덕션 빌드
npm run lint       # 린트 검사
npx tsc --noEmit -p tsconfig.app.json   # 타입 검사
```

## 환경 변수

`.env` 파일에 Supabase 연결 정보를 설정합니다. (git 추적 제외 — `.env.example` 참고)

```bash
VITE_SUPABASE_URL=https://<프로젝트>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

> 신규 API 키 체계를 사용하므로 레거시 JWT(anon) 키가 아닌 **publishable 키**를 사용해야 합니다. (브라우저 노출용 공개 키)

## 디렉터리 구조

```
src/
  pages/home/Index.tsx      공통 레이아웃(헤더·탭·푸터) + 탭 전환
  components/               각 탭 컴포넌트 (DashboardTab, LayoutTab, LoadTab, ...)
  data/
    tmsData.ts              타입·상수·런타임 컨테이너(TMS_DATA)
    loadData.ts             Supabase → TMS_DATA 로더 + 하중 데이터(LOAD_UNITS)
    tmsUtils.ts             계산·판정 유틸(lifeCalc, loadPerTire 등)
  i18n/index.tsx            다국어(한/인니) Provider·사전
  api/inspections.ts        점검 입력 CRUD API
  lib/supabase.ts           Supabase 클라이언트
supabase/migrations/        DB 스키마·데이터 마이그레이션(0001~)
docs/사용설명서.md          사용 설명서
```

## 개발 가이드

1. 화면 추가 시 `pages/` 아래 폴더와 진입점 `Index.tsx`를 만들고, 필요하면 `App.tsx`에 라우트를 추가합니다. (탭 추가는 `pages/home/Index.tsx`의 `TABS` 배열)
2. 페이지가 복잡하면 `components/`로 분리해 구현합니다.
3. 백엔드 연동/Supabase 작업은 `src/api`에 API 파일을 추가하고 데이터 타입을 함께 정의합니다. (`src/api/inspections.ts` 참고)
4. 작업 후 `npm run lint`와 `npx tsc --noEmit -p tsconfig.app.json`로 검사하고 문제를 수정합니다.
5. 코드·기능 변경 시 [docs/사용설명서.md](docs/사용설명서.md)도 함께 갱신합니다.
