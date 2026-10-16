# CHANGELOG

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 를 따르고 날짜는 WIB 기준입니다.
버전 태그는 아직 쓰지 않으므로 배포 단위 대신 **작업 묶음(Phase · Task)** 으로 나눕니다.

## [Unreleased] — 2026-10-16 · 마모율 단위 규칙

### Changed
- 마모율 표시 소수 3자리 → **2자리** (`fmtWearRate`, 수명 DB·전 차량 비교 엑셀 포함). DB·계산·색 판정·km/mm 환산은 원값 유지.
- CLAUDE.md §마모율 단위 신설 — 기록·분석 mm/1,000 km, 보고·수명 예측 km/mm, 시간 기준 mm/100 hr (사용자 결정, decisions U-1).

## [Unreleased] — 2026-10-16 · 마모속도 km/mm 표기

### Added
- 마모 분석 마모속도 KPI(단일·평균) 본값을 km/mm 로 표시, mm/1,000 km 는 보조 줄 (사용자 결정). 평균은 mm/1,000 km 평균의 역수, 차트·표·색 판정은 mm/1,000 km 유지 (`kmPerMmOf()` in `src/lib/format.ts`).
- 수명 DB 엑셀에 `km/mm` 열 (마모율 옆, 정수).

## [Unreleased] — 2026-10-16 · WO-TMS-2026-10-LIFE 수명·주행거리 보정

### Fixed
- `v_tire_ledger` 구간 km 과대평가 — 장착일 이전 회차 km 대신 교체 KM → 같은 날 회차 → 앞뒤 회차 날짜 비례 보간 →
  앞 회차(`APPROX`) 순으로 경계 km 산출. `km_method` · `km_start_src_date` · `km_end_src_date` 등 근거 열 추가.
  `v_tire_ledger_total.cumulative_km` 은 OK + APPROX 합, `approx_segments` 추가 (`20261016150000_v_tire_ledger_interpolate.sql`).
  prod 기준 시리얼 29본 중 27본 값 변동, 평균 25,191.8 → 23,114.0 km.

### Added
- `v_odometer_anomaly` 뷰 — KM_DECREASE · KM_DAILY · SPEED · HM_DAILY. 임계값 `tire_config.odo_daily_km_max`(800) ·
  `odo_speed_kmh_max`(60) · `odo_daily_hm_max`(24), 관리자 › 판정 기준 «주행계 이상» 에서 조정 (`20261016140000_v_odometer_anomaly.sql`).
- 점검 입력 주행계 경고 — KM 감소는 리셋 사유 필수, 그 외는 확인 체크 필수. 저장 시 비고에 `[ODO-WARN]` 접두어 (`src/lib/odometerCheck.ts`).
- 마모 분석 «결과 요약» 카드 — 정상 / 주의 / 데이터 확인 필요 배지와 수명·예측·패턴·데이터 4줄 (`ResultSummaryCard.tsx`, `src/lib/resultSummary.ts`).
- 수명 DB 주행 KM `(하한값)` 표시(툴팁 «장착일 이전 주행 미상»), 평균 행 주행 KM 을 하한값 제외 평균으로 대체(사용자 결정), Excel `km_flag` · `km_method` 열.
- `docs/backfill_removal_code_20261016.sql` — removal_code 백필 초안 (ROLLBACK 으로 끝남, **미실행**).

### Changed
- 교체 등록 모달 — KM/HM 을 교체일 아래로 올리고 직전 회차 값을 placeholder 로 표시. KM 미입력 저장 시 확인 창.
  탈착 사유(`removal_code`) 필수.

## [Unreleased] — 2026-09-06 · 사이트 최적화

### Added
- 차량 메뉴에 **하중 검토** 탭(`/review`) 추가 — 사내 참고자료 「차량 하중 용어 정의 및 Road Train 타이어 하중 검토」(2026-09-12)를
  `src/docs/load-review.html` 로 두고 `LoadReviewTab` 이 iframe(srcdoc)으로 표시. 탭 라벨 ko · id · en.

### Security
- 익명(anon) 읽기 차단. 모든 select 정책을 `authenticated` 전용으로 바꾸고 anon 의 테이블·뷰·시퀀스·함수 권한과
  기본 권한을 회수 (`20260906100000_rls_authenticated_only.sql`). 클라이언트는 로그인 후에만 `loadData()` 를 호출한다.
- SECURITY DEFINER 트리거 함수의 EXECUTE 를 전부 회수, RPC 는 `authenticated` 에만 부여. `v_data_quality` 를 `security_invoker` 로.
- Lovable 라우팅 브리지(origin 검사 없는 `postMessage` 수신) 삭제.
- Cloudflare Pages 용 `public/_headers` — `X-Frame-Options: DENY` · `nosniff` · `Referrer-Policy` · `frame-ancestors 'none'`.
- `robots.txt` 를 `Disallow: /` 로, `index.html` 에 `noindex`.

### Changed
- 하중 탭 정격 근거 정리 (`src/data/loadData.ts` · `LoadTab.tsx`).
  - 트레일러·돌리 규격을 등가 표기 `12.00R24` 대신 실규격 `325/95R24 22PR` 로. 12.00R24 20PR 은 LI 160/157(4,500/4,125 kg)로
    LI 가 달라 다른 브랜드가 섞이면 정격을 잘못 적용할 수 있다.
  - Head 구동축(8본·듀얼)에 단독 정격 6,000 kg 을 그대로 쓰던 것을 트레일러와 같은 듀얼 규칙(단독 LI −2단계)으로
    LI 168 = 5,600 kg 적용. 부하율 78% → 84%. Techking 은 단독 LI 만 공표하므로 제조사 확인 전까지 잠정치.
  - `LoadUnit` 에 `liSingle` · `liDual` 추가. 배너·근거 문단의 숫자를 하드코딩 대신 `LOAD_UNITS` 에서 파생.
  - 하중 탭 안내 문구 전체를 개조체 목록으로 정리(ko · id · en). 배치도 탭 범례·사용설명서의 규격 표기도 함께 갱신.
  - Head 조향/구동 분배율 20% / 80% 의 근거를 현장 차량 Western Star 6900XD 의 축 정격 비율(전축 28,000 lb : 후축 탠덤
    110,000 lb ≈ 20.3% : 79.7%, 정수 반올림)로 명시. 정확 비율 대신 반올림값을 써서 고객 하중분배 시트의 축하중(조향 9,400 /
    구동 37,600 kg · 타이어당 4,700 kg)과 일치시킴 (사용자 결정 2026-09-12). 차량명·축 정격을 화면 근거와 사용설명서에 표기.
  - 하중 탭 표 열 순서를 공차중량·적재중량·축하중 → 하중 분배율·타이어당 하중·최대하중·부하율·판정 으로 재배치하고 중량 3열을
    색상(primary 틴트)으로 묶음. 용어를 표준 용어로 통일 — 공차중량·적재중량·축하중·최대하중·단륜/복륜·판정·연결차량 총중량(GCW).
  - 하중 탭 표 제목셀을 두 줄(명칭 / 단위 kg)로 정리하고 단어 단위로만 줄바꿈. 제목 행에 secondary 배경 추가. 소계 행은 secondary 배경, 합계 행은 primary 배경 +
    흰 글자로 데이터 행과 구분.
  - 하중 탭의 퍼센트(분배율·부하율·근거 문단)를 전부 정수로 표시 (`fmtPercentInt`, 사용자 결정 2026-09-12). 하중 검토 문서의
    퍼센트도 정수로 통일. 다른 화면의 퍼센트는 CLAUDE.md §숫자 표기(1자리) 그대로.
  - '교체이력' 표기를 '교체이력' 으로 통일 (UI 문구 · 주석 · 문서). 작업지시서 원문은 손대지 않음.

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
- 로컬 스키마 검증 경로를 프로덕션 덤프 기준으로 고침. `supabase db reset` 은 `20260827201000` 데이터 백필에서 멈춘다는 사실을 기록.

### Schema (로컬 재생)
- `20260826035500` 빈 `lifetimes` 에서 `setval(…, 0, true)` 범위 오류 → `max+1 · is_called=false`.
- `20260826134000` 뷰가 참조하는 `inspections.center_avg` · `point_count` 를 `add column if not exists` 로 선행 생성.
  프로덕션은 이미 적용된 파일이라 `db push` 대상이 아니며 결과 스키마는 같다.

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
- `v_current_tire` 기반 조회로 전환, 교체이력 자동 동기화 트리거(M3), 타이어 조회 뷰 5종·정합성 RPC(M2·M4), `lifetimes` 무결성·감사 규약(M1).

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
