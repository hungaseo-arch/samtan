# CHANGELOG

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 를 따르고 날짜는 WIB 기준입니다.
버전 태그는 아직 쓰지 않으므로 배포 단위 대신 **작업 묶음(Phase · Task)** 으로 나눕니다.

## [Unreleased] — 2026-09-06 · 사이트 최적화

### Security
- 익명(anon) 읽기 차단. 모든 select 정책을 `authenticated` 전용으로 바꾸고 anon 의 테이블·뷰·시퀀스·함수 권한과
  기본 권한을 회수 (`20260906100000_rls_authenticated_only.sql`). 클라이언트는 로그인 후에만 `loadData()` 를 호출한다.
- SECURITY DEFINER 트리거 함수의 EXECUTE 를 전부 회수, RPC 는 `authenticated` 에만 부여. `v_data_quality` 를 `security_invoker` 로.
- Lovable 라우팅 브리지(origin 검사 없는 `postMessage` 수신) 삭제.
- Cloudflare Pages 용 `public/_headers` — `X-Frame-Options: DENY` · `nosniff` · `Referrer-Policy` · `frame-ancestors 'none'`.
- `robots.txt` 를 `Disallow: /` 로, `index.html` 에 `noindex`.

### Fixed
- PostgREST `max_rows`(1,000행) 절단. 점검 이력·시계열 뷰·측정점 조회를 `fetchAll()` 로 페이지네이션 (`src/lib/supabase.ts`).

### Performance
- framer-motion 제거 → CSS 애니메이션(`.stagger-in` / `.overlay-in` / `.modal-in`, `prefers-reduced-motion` 존중). 첫 로드 gzip 약 38 kB 감소.
- 웹폰트를 `index.html` `<link>` + `preconnect` 로, 가변 굵기(400..900). Supabase 호스트에도 preconnect.
- `/assets/*` 1년 immutable 캐시 헤더 (Cloudflare Pages 에서만 유효).
- QueryClient 기본값 `staleTime` 5분 · `refetchOnWindowFocus: false`.
- 배치도 배경 사진 JPEG 161 kB → WebP 39 kB, `loading="lazy"`.
- FK 커버링 인덱스 4개 (`inspections(ch,pos)` · `replacements(ch,pos)` · `replacements(removal_code)` · `tire_events(damage_code)`).

### Removed
- Lovable 템플릿 잔재: 프리렌더·사이트맵·postbuild 스크립트, `componentTagger`, CDN 이미지 플러그인, `react-router-dom` 프록시.
- 의존성 `framer-motion` · `lovable-tagger` · `@babel/*` · `happy-dom` · `@vitejs/plugin-react` · `next-themes`.

### Docs
- `README.md` 갱신, `CONTRIBUTING.md` · `CHANGELOG.md` · `ARCHITECTURE.md` 신설.

## 2026-08-26 ~ 08-29 · Phase 2 TCO (WO-TMS-2026-09-TCO) · 트레드 4점

### Added
- TCO 탭: CPK 3종 · 비용 구성 · 사유별 수명 분포 · 개체 원장 · 재생타이어 시나리오 (`cost_params.retread_allowed`).
- DB: `cost_params` · `tire_events` · `tread_points`(폭 4점 원시값) · `pressure_targets`, 뷰 `v_tco_unit` · `v_tco_fleet` · `v_removal_analysis` ·
  `v_tire_ledger` · `v_wear_rate_segment` · `v_wear_pattern` · `v_cv_benchmark` · `v_tire_comparison` · `v_data_quality`.
- 교체 탭 탈착 정보 입력, 손상 코드 CW·SW·AL, `damage_codes` TCO 귀속 분류·인니어 설명.
- 마모 분석 탭(마모속도·균일성·편마모 KPI), 그루브 4점 입력·표시, 데이터 품질 규칙 3종 + severity.
- 트레드 4점 전 회차 소급 백필(410행 · 1,640점), 2026-08-09 · 08-23 회차 및 교체 8건 적재.
- 관리자 화면을 탭으로 분리하고 활동 로그 추가. 화면 상태(탭·선택 차량·시리얼)를 URL 로 이동.

### Changed
- 신호등 4색(`ok` · `warn` · `order` · `danger`)과 계열 10색을 `src/lib/chartColors.ts` 로 모으고 `--level-*` 토큰 도입 (사용자 승인 2026-08-29).
- 트레드·공기압 자리수를 지시서 §2-2 규약으로 통일. 헤더 아이콘 4개를 계정 메뉴 하나로.
- 탭 지연 로드 · 벤더 청크 분리 · 프로덕션 모드 빌드.
- `v_current_tire` 기반 조회로 전환, 교체 이력 자동 동기화 트리거(M3), 타이어 조회 뷰 5종·정합성 RPC(M2·M4), `lifetimes` 무결성·감사 규약(M1).

## 2026-08-01 ~ 08-07 · Phase 1 스키마 강화 (T-001 ~ T-104)

### Added
- 트레드 4단계 신호등과 임계치·권장 공기압을 `tire_config` 로 이관 (5 mm 는 폐기 기준이 아닌 **발주 트리거**, 사용자 결정 2026-08-01).
- T-102 제약조건·인덱스 + pgTAP 회귀 테스트. T-103 감사 컬럼·변경 로그 트리거·소프트 삭제. T-104 멱등 UPSERT 표준 함수.
- 실차보고서 2026-07-26 회차 적재, 데이터 진단(`docs/audit-report.md`)과 이상치 정정(T-101).

## 2026-07 · 인증 · 권한 · 화면 정리

### Added
- Supabase Auth 로그인 필수, 역할 `admin` / `inspector` / `viewer` (`app_metadata.role`, `app_role()`), 관리자 사용자 관리(Edge Function `admin-users`),
  비밀번호 설정·변경·재설정, 업로드 주체 기록(0009), 영어 로케일 추가(3개 국어).
- 2단 내비게이션(4그룹 + 서브탭), 반응형 햄버거 메뉴, 점검 입력 아코디언 폼, 배치도 → 상세 모달, 운전자 필드(0008).

## 2026-06-29 · 최초 공개

- Vite + React 대시보드 8개 탭, Supabase 연동, GitHub Pages(`/samtan/`) 배포, RLS 쓰기 authenticated 전용(0006).
