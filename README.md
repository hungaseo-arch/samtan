# SAMTAN TMS — 광산 덤프트럭 타이어 관리 시스템

PT ASCENDO INTERNATIONAL 이 고객사 SAMTAN 의 덤프트럭(CH 824 / 832 / 834 / 835 / 839 / 847 / 849)
타이어를 관리하기 위한 웹 애플리케이션입니다. 차량당 10개 포지션의 **공기압 · 트레드(폭 4점) · HM · KM**
을 회차 단위로 점검하고, 타이어 생애주기(장착 → 교체 → 폐기)와 **시간당 · km 당 원가(TCO)** 를 한 화면에서
봅니다.

> 화면 사용법은 [docs/사용설명서.md](docs/사용설명서.md), 운영 절차는 [docs/runbook.md](docs/runbook.md),
> 코드 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 기여 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md) 를 보십시오.
> 요구사항의 정본은 [docs/SAMTAN_TMS_작업지시서.md](docs/SAMTAN_TMS_작업지시서.md) 입니다.

## 기능

| 그룹 | 탭 | 내용 |
|---|---|---|
| 홈 | 대시보드 | 차량별 신호등(정상·주의·발주·위험) 요약, 알림 목록 |
| 차량 | 배치도 · 하중계산 · 하중 검토 | 포지션별 현재 타이어·상태, 축하중/타이어당 하중, 하중 용어·검토 참고자료 |
| 타이어 | 교체이력 · 수명 DB | 탈착 사유·손상 코드, 시리얼 단위 수명·이동 이력, Excel 내려받기 |
| 점검·측정 | 점검 입력 · 추이 · 마모 분석 · 공기압 | 회차 입력(RPC upsert), 트레드/공기압 시계열, 마모속도·편마모·CV, 권장 공기압 판정 |
| 원가 | TCO | CPK 3종, 비용 구성, 사유별 수명 분포, 개체 원장, 재생타이어 시나리오 |
| 관리자 | Admin | 사용자·역할 관리(Edge Function), 활동 로그 |

- **로그인 필수.** 모든 데이터 읽기·쓰기는 Supabase Auth 세션이 있어야 하며 역할은 `admin` / `inspector` / `viewer` 입니다.
- **3개 로케일** `ko` / `id` / `en` (기본값 `id`, 현장 점검자 화면 기준).
- **임계치는 DB(`tire_config`)가 정본**입니다. 코드에 상수로 박지 않습니다.

## 기술 스택

Vite 5 · React 19 · TypeScript · Tailwind CSS 4 · TanStack Query 5 · Recharts 3 · Supabase
(Postgres 17 · Auth · RLS · Edge Functions) · pgTAP. 호스팅은 GitHub Pages(현재) 또는 Cloudflare Pages(지시서 기준).

## 시작하기

```bash
npm install
cp .env.example .env        # VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                 # http://localhost:8080
```

| 명령 | 역할 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`dist/`) |
| `npm run typecheck` | `tsc -p tsconfig.app.json --noEmit` |
| `npm run lint` | ESLint |
| `npm run deploy` | GitHub Pages 배포 (`VITE_BASE=/samtan/`) |
| `supabase start` / `supabase db reset` / `supabase test db` | 로컬 DB 기동 · 마이그레이션 재현 · pgTAP |
| `supabase db push` | 프로덕션 스키마 적용 (사용자 승인 후에만) |

`.env` 에는 **publishable 키**만 둡니다. `SUPABASE_SERVICE_ROLE_KEY` 는 Edge Function 시크릿으로만 존재하며
클라이언트·저장소·로그 어디에도 두지 않습니다.

## 디렉터리

```
src/
  pages/home/Index.tsx   공통 골격(헤더·탭·푸터) · 로그인 게이트 · 데이터 로드 트리거
  components/            탭 컴포넌트(지연 로드) · 모달 · 공용 위젯,  components/ui/ 는 shadcn 잔여 2개
  data/                  tmsData.ts(타입·TMS_DATA) · loadData.ts(Supabase → TMS_DATA) · tmsUtils.ts
  api/                   테이블·뷰·RPC 별 조회/저장 함수
  auth/                  AuthProvider · LoginCard · SetPasswordCard
  i18n/                  사전(index.tsx) · Provider
  lib/                   supabase 클라이언트(fetchAll) · format · chartColors · treadStats
supabase/
  migrations/            스키마·데이터 마이그레이션 (0001~ · 20260829~ 타임스탬프)
  tests/                 pgTAP 회귀 테스트 (t102~t105)
  functions/admin-users  사용자·역할 관리 Edge Function
docs/                    지시서 · 사용설명서 · runbook · schema · data-model · decisions
```

## 문서

- [CHANGELOG.md](CHANGELOG.md) — 변경 이력
- [docs/schema.md](docs/schema.md) · [docs/data-model.md](docs/data-model.md) — 테이블·뷰·트리거 규약
- [docs/decisions.md](docs/decisions.md) — 사용자 결정 기록 (임계치·단가·범위)
- [CLAUDE.md](CLAUDE.md) — 절대 금지 사항과 숫자 표기 규칙 (사람에게도 그대로 적용)
