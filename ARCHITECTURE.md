# ARCHITECTURE

SAMTAN TMS 의 구조를 **요청이 흐르는 순서**로 설명합니다. 세부 규약은 각 절 끝의 문서를 보십시오.

```
브라우저 (Vite SPA · React 19)
  │  publishable 키 + 사용자 JWT
  ▼
Supabase
  ├─ Auth            로그인 · app_metadata.role (admin / inspector / viewer)
  ├─ PostgREST       테이블·뷰 SELECT (RLS: authenticated 전용) · RPC 호출
  ├─ Postgres 17     테이블 12 · 뷰 19 · 트리거 · SECURITY DEFINER 함수 · pgTAP
  └─ Edge Function   admin-users (service_role 키는 여기에만 있다)
```

## 1. 프론트엔드

### 1.1 진입과 라우팅

- `src/main.tsx` → `App.tsx` 가 Provider 를 쌓습니다: QueryClient → Language → Auth → Tooltip → Sonner → BrowserRouter.
- 라우트는 `/` (Index) 하나에 `:tab` 자식 세그먼트뿐입니다. 탭 하나가 URL 하나(`/life?serial=...`)이고, Index 는 부모 라우트라
  탭을 오가도 재마운트되지 않습니다. 없는 탭 이름은 `/` 로 되돌립니다.
- `BrowserRouter basename={import.meta.env.BASE_URL}` — GitHub Pages 서브경로(`/samtan/`) 배포를 위해서입니다.

### 1.2 인증 게이트 (`src/pages/home/Index.tsx` · `src/auth/AuthProvider.tsx`)

1. `AuthProvider` 가 `getSession()` + `onAuthStateChange` 로 `user` · `role` 을 들고 있습니다. 역할은 JWT 의
   `app_metadata.role` 을 `admin` / `inspector` / `viewer` 로 정규화하며, DB 의 `app_role()` 도 같은 규칙입니다.
2. `user` 가 없으면 `LoginCard` 만 그립니다. 초대·비밀번호 재설정 링크로 들어오면 `SetPasswordCard` 가 먼저 뜹니다.
3. **데이터 로드는 `user.id` 가 생긴 뒤에만** 시작합니다 (RLS 가 `authenticated` 전용이라 로그인 전 호출은 의미가 없습니다).
   로그아웃·세션 만료 시 상태를 `loading` 으로 되돌려 다음 로그인에서 다시 받습니다.
4. 화면 권한: `canWrite`(admin · inspector) / `canDelete`(admin) / `canDownload`(로그인 전원) / `isAdmin`. 이것은 UI 게이팅이고
   최종 방어선은 RLS 입니다.

### 1.3 데이터 계층 — 두 갈래

| 갈래 | 어디에 | 쓰는 화면 | 갱신 |
|---|---|---|---|
| **전역 스냅샷 `TMS_DATA`** (`src/data/tmsData.ts`) | `loadData()` 가 9개 쿼리를 병렬로 받아 채우는 모듈 전역 | 대시보드 · 배치도 · 하중 · 수명 · 점검 입력 · 추이 · 공기압 | 저장 후 `reloadData()` → `dataVersion` 증가 → 탭이 `key={dataVersion}` 로 재마운트 |
| **TanStack Query** | `src/api/*` 의 조회 함수 + `useQuery` | 마모 분석 · 교체 · TCO · 정합성 배지 | `invalidateQueries` (staleTime 5분, 창 포커스 재조회 없음) |

- `loadData()` 는 `tire_config` · `vehicles` · `vehicle_positions` · `v_current_tire` · `v_position_history` · `replacements` ·
  `lifetimes` · `damage_codes` · `v_inspections_wide` 를 받아 `units` (차량·포지션·회차) 와 **`segments`** (시리얼 단위 측정 구간) 를 만듭니다.
  교체 전후 타이어가 한 줄에 섞이지 않도록 추이·마모율은 반드시 `segments` 를 씁니다 (`docs/data-model.md` §5).
- **페이지네이션.** PostgREST 는 `max_rows = 1000` (`supabase/config.toml`) 을 넘는 행을 오류 없이 자릅니다. 회차마다 늘어나는
  조회(점검 이력 · 측정점 · 시계열 뷰)는 `fetchAll()` (`src/lib/supabase.ts`) 로 `range` 를 끝까지 넘깁니다. 정렬은 유일 키로 끝냅니다.
- **쓰기는 RPC 로만.** `upsert_inspection_round` · `save_inspection_round_with_points` 등 멱등 UPSERT 함수(T-104)를 호출하고,
  트리거가 파생 컬럼 · 감사 로그 · 교체 이력 동기화를 처리합니다. 클라이언트가 `inspections` 를 직접 INSERT 하지 않습니다.

### 1.4 판정과 표기

- 임계치 정본은 DB `tire_config` 입니다. `treadLevel()` / `treadThresholds()` / `recPsi()` 만 경유하고, 4단계
  (`ok` · `warn` · `order` · `danger`, 경계는 미만 `<`) 색은 `src/lib/chartColors.ts` 와 `--level-*` 토큰이 정본입니다.
- 숫자는 `src/lib/format.ts` 헬퍼로만 찍습니다 (트레드 1자리 · 공기압 정수 · HM/KM 1자리 · 콤마는 모든 로케일 동일).
- 로케일 `ko` / `id` / `en` (`src/i18n/index.tsx`), 기본 `id`, 선택값은 `localStorage`. 시각은 UTC 저장 · `Asia/Jakarta` 표시.

### 1.5 스타일과 애니메이션

- Tailwind CSS 4 (`@tailwindcss/vite`). 팔레트·신호등 토큰은 `src/index.css` `:root` 에 있고 파스텔은 배경 전용, 텍스트는 `--color-text`.
- 등장 애니메이션은 CSS 뿐입니다: `.stagger-in` (직계 자식 순차 상승) · `.overlay-in` · `.modal-in`. `prefers-reduced-motion` 이면 꺼집니다.
  닫힘 애니메이션은 두지 않습니다.

### 1.6 빌드

- `vite.config.ts`: `@vitejs/plugin-react-swc` + Tailwind. `manualChunks` 로 `recharts` · `supabase` · `vendor`(react-query · radix · lucide) 를
  갈라 앱 코드만 바뀐 배포에서 벤더 캐시가 살아남게 합니다. `xlsx` 와 각 탭은 동적 import.
- 산출물은 `dist/`. `public/_redirects` (SPA 폴백) 와 `public/_headers` (캐시 · 보안 헤더) 는 **Cloudflare Pages 전용**이며
  GitHub Pages 는 무시합니다. GitHub Pages 는 `dist/404.html` 복사로 폴백합니다 (`npm run deploy`).
- 폰트는 `index.html` 에서 `preconnect` 와 함께 요청합니다 (Inter · Noto Sans KR · JetBrains Mono, 가변 굵기).

## 2. 데이터베이스 (`supabase/`)

### 2.1 객체

| 종류 | 이름 | 비고 |
|---|---|---|
| 기준 | `vehicles` · `vehicle_positions` · `tire_config` · `damage_codes` · `pressure_targets` · `cost_params` | `tire_config` 는 단일 행(id=1) |
| 사실 | `inspections` (회차 × 포지션) · `tread_points` (폭 4점 원시값) · `replacements` · `tire_events` · `lifetimes` | 소프트 삭제 `deleted_at` |
| 감사 | `audit_log` | admin 만 SELECT |
| 뷰 | `v_current_tire` · `v_position_history` · `v_inspections_wide` · `v_tread_series` · `v_wear_*` · `v_cv_benchmark` · `v_tire_*` · `v_tco_*` · `v_removal_analysis` · `v_data_quality` · `v_data_integrity` | 전부 `security_invoker` |
| RPC | `upsert_inspection` · `upsert_inspection_round` · `save_inspection_with_points` · `save_inspection_round_with_points` · `check_data_integrity` · `admin_auth_events` · `app_role` | `authenticated` 만 EXECUTE |
| 트리거 함수 | `set_audit_fields` · `set_updated_at` · `log_audit` · `recalc_inspection_tread_stats` · `sync_tread_min` · `ensure_lifetime_row` · `retire_previous_tire` · `sync_position_current_serial` · `forbid_hard_delete` · `guard_soft_delete` | SECURITY DEFINER, 직접 호출 불가 |

트리거 실행 순서와 `vehicle_positions.serial2` deprecated 사유는 `docs/data-model.md` §2 · §3, 컬럼 정의는 `docs/schema.md`.

### 2.2 권한 모델

```
anon           : 아무 것도 못 읽는다 (2026-09-06). 로그인 화면만 본다.
authenticated  : 모든 테이블·뷰 SELECT (RLS using(true))
  inspector    : inspections · tread_points · replacements … INSERT/UPDATE  (app_role() in ('inspector','admin'))
  admin        : + DELETE(=소프트 삭제) · cost_params 쓰기 · audit_log 읽기 · admin_auth_events
service_role   : Edge Function 전용. 클라이언트에 없다.
```

- 역할은 `auth.users.app_metadata.role` 에만 있고 `app_role()` 이 JWT 에서 읽습니다. 역할을 바꾸면 **재로그인**이 필요합니다.
- 하드 DELETE 는 `forbid_hard_delete` 트리거가 막습니다. 삭제는 `deleted_at` UPDATE 이고 `audit_log` 에 남습니다.
- 새 객체에 anon 권한이 자동으로 붙지 않도록 `alter default privileges` 로 막아 두었습니다. 새 RPC 는 `grant execute ... to authenticated` 를 명시해야 합니다.

### 2.3 변경 절차

마이그레이션 파일 → `supabase db reset` → `supabase test db` (pgTAP `supabase/tests/t102~t105`) → 사용자 승인 → `supabase db push`.
다른 경로(MCP · 대시보드)로 적용하면 원격 이력이 어긋납니다. 자세한 절차는 `docs/runbook.md` §2.

## 3. Edge Function `admin-users`

역할은 `app_metadata` 에 있고 이는 service_role 키로만 바꿀 수 있으므로, 사용자 목록·생성·역할 변경·삭제는
`supabase/functions/admin-users` 가 처리합니다. 호출자 JWT 의 `app_metadata.role === "admin"` 을 검사한 뒤에만 동작하며,
관리자 탭(`src/components/admin/UsersPanel.tsx`) 이 호출합니다.

## 4. 배포

| 항목 | 현재 | 지시서 §2.1 |
|---|---|---|
| 호스팅 | GitHub Pages `https://hungaseo-arch.github.io/samtan` (`npm run deploy`, `VITE_BASE=/samtan/`) | Cloudflare Pages |
| 헤더·캐시 | 없음 (GH Pages 는 `_headers` 미지원) | `public/_headers` 적용 |
| DB | Supabase 프로젝트 `vndbzanhoumhhuneufni` | 동일 |

호스팅 이전은 미결 사항입니다 (`docs/runbook.md` §4).

## 5. 왜 이렇게 되어 있나 (자주 묻는 것)

- **왜 전역 `TMS_DATA` 와 React Query 가 같이 있나.** 초기 화면 7개는 한 스냅샷을 여러 탭이 공유하며 파생 계산(segments)을
  한 번만 하는 편이 단순했습니다. 이후 추가된 분석·원가 화면은 뷰 단위 조회라 Query 가 맞습니다. 통합은 하지 않았습니다.
- **왜 5 mm 가 폐기 기준이 아닌가.** 5 mm 는 발주 트리거이고 폐기·수명 계산은 0 mm 기준입니다 (사용자 결정 2026-08-01, `docs/decisions.md`).
- **왜 `tread_points` 가 정본인가.** `inspections` 의 트레드 통계 컬럼은 트리거가 4점에서 다시 계산한 파생값입니다 (`docs/data-model.md` §8).
- **왜 서브경로 배포인가.** GitHub Pages 프로젝트 사이트라서입니다. Cloudflare 로 옮기면 `VITE_BASE` 없이 루트 배포가 됩니다.
