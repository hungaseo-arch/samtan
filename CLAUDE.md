# CLAUDE.md — SAMTAN TMS

이 파일은 Claude Code가 매 세션 참조하는 상시 규칙입니다.
전체 작업 내용은 `docs/SAMTAN_TMS_작업지시서.md`를 참조하십시오.

## 프로젝트

PT ASCENDO INTERNATIONAL의 광산 덤프트럭 타이어 관리 시스템(TMS).
고객사 SAMTAN의 차량 7대(CH 824 / 832 / 834 / 835 / 839 / 847 / 849), 차량당 10개 포지션의
(CH 847은 2026-07-10 투입된 신규 차량으로 지시서 §1.1의 6대 목록에 없습니다)
공기압·트레드·HM·KM을 주기 점검하고 타이어 생애주기와 시간당 원가를 관리합니다.

## 스택

Vite + React 18 + TypeScript (SPA) / Tailwind CSS / TanStack Query /
Supabase (Postgres · Auth · RLS · Storage · Edge Functions) / Cloudflare Pages / Vitest + pgTAP

## 절대 금지

1. 프로덕션 DB에 직접 DDL/DML 실행 금지. 모든 변경은 `supabase/migrations/` 파일 → 로컬 검증 → 사용자 승인 순서.
2. `SUPABASE_SERVICE_ROLE_KEY`를 클라이언트 코드·저장소·로그에 노출 금지. RLS를 무력화합니다.
3. `inspections` / `replacements` 레코드 DELETE 금지. 소프트 삭제(`deleted_at`)만 사용.
4. `DROP TABLE` / `TRUNCATE` / `DROP COLUMN` 을 마이그레이션에 포함 금지. `vehicle_positions.serial2`도 유지.
5. 원본 Excel 파일은 기본 읽기 전용. 사용자가 그 파일을 고치라고 명시적으로 지시했을 때만 수정하며,
   ① 같은 폴더에 `(수정전 백업 YYYYMMDD)` 사본을 먼저 만들고 ② 스크립트로 셀 값만 고치고(서식·수식 유지)
   ③ 무엇을 왜 고쳤는지 정합성 점검 문서에 남긴다. 지시 없이 고치는 것은 여전히 금지
   (사용자 결정 2026-09-15 — `20260914, MONITORING TIRE TECHKING.xlsx` 시리얼 오타 수정 건에서 확정).
6. 환율·단가·계약 조건 임의 가정 금지. 불명확하면 질문할 것.
7. 색상값 하드코딩 금지. `src/styles/tokens.css`의 CSS 변수만 사용.
8. `toLocaleString()` 직접 호출 금지. `src/lib/format.ts` 헬퍼만 사용.

## 필수 준수

- 마이그레이션은 멱등하게: `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, `CREATE OR REPLACE`
- 마이그레이션 적용은 `supabase db push` 만. MCP `apply_migration`·대시보드 SQL 편집기 금지 —
  자동 타임스탬프로 기록돼 원격 이력과 로컬 파일명이 어긋난다
  (2026-08-29 그렇게 어긋난 30건을 `migration repair` 로 정리했음)
- 타임존: 저장 UTC. 표시·입력은 둘로 갈린다 (X-19, 사용자 결정 2026-09-15)
  - *시각* 표시(감사로그·로그인) = 운영지 자카르타 `Asia/Jakarta` (WIB, UTC+7). 관리자 화면 전용이다
  - *날짜* 판정(점검일 기본값) = 현장 발릭빠빤 `Asia/Makassar` (**WITA**, UTC+8). WIT(UTC+9)가 아니다
  - "오늘"을 `new Date().toISOString().slice(0,10)`(UTC)이나 단말 로컬로 만들지 말 것.
    `src/lib/format.ts` 의 `todayInField()` 만 사용한다
- 로케일: `ko` / `id` / `en` 3개 (`Lang`, `src/i18n/index.tsx`). 기본값은 `id` — 현장 점검자 화면 기준.
  새 UI 문구는 세 로케일을 전부 채울 것. 하나라도 비면 그 화면만 언어가 튄다
- 커밋: Conventional Commits (`feat(schema): ...`). `main` 직접 푸시 금지
- Task 완료 시 완료 조건(DoD)을 항목별로 체크해 보고. 미충족 시 다음 Task 진행 금지

## 숫자 표기 (예외 없음)

**정본은 작업지시서입니다.** 이 절과 지시서가 어긋나면 **최신 지시서를 따르고** 이 절을 갱신할 것.
(사용자 결정 2026-08-26 — 트레드·공기압 자리수는 `docs/SAMTAN_TMS_작업지시서_v1.md` §2-2 기준으로 확정)

- 천 단위 콤마 `,` / 소수점 마침표 `.` — **인도네시아어 화면도 동일**. `1.234,56` 형식 사용 금지
- 퍼센트 소수점 1자리 고정 (`3.0%`), 단가 2자리 (`USD 84.25/EA`), 수량 정수 (`1,200 EA`)
  - 예외: **하중 탭**(분배율·부하율)은 정수 (`78%`, `fmtPercentInt`) — 사용자 결정 2026-09-12
- 트레드 **1자리** (`11.2 mm`), 공기압 **정수** (`117 psi`), HM/KM 1자리 (`5,188.4 HM`)
- 통화 코드는 금액 앞: `IDR 185,000,000`
- **거래처 발송 문서·고객사 PDF**: 전체 자리수 먼저, 단위 괄호 병기 → `IDR 1,250,000,000 (1.25 miliar)`
- 콤마 미사용: 연도, 타이어 규격(`26.5R25`), 차량번호(`CH 824`), 시리얼(`DA1BFANH07451D`), 문서번호, 전화번호
- 표 안 숫자는 우측 정렬, 동일 열 소수점 자리수 통일

## 디자인 토큰

```css
--color-bg:      #F0F0F0;  /* 배경 60% */
--color-primary: #E3F2FD;  /* 주요 요소 30% */
--color-surface: #ECEFF1;  /* 보조 배경·음영 */
--color-accent:  #E8F5E9;  /* 강조 10% */
--color-text:    #546E7A;  /* 텍스트·경계선 */
```

파스텔 색상은 배경(fill) 전용. 텍스트는 `--color-text`로 WCAG AA(4.5:1) 확보.
경고/위험 색상은 팔레트에 없으므로 별도 토큰을 제안하고 승인받을 것.

### 신호등 4색 (사용자 승인 2026-08-29)

승인된 warn `#B4611F` 과 같은 자리(OKLCH L≈0.52 · C≈0.11)에서 색상만 돌린 값입니다.
흰 카드·`#F0F0F0` 양쪽에서 4.5:1 이상. **정본은 `src/lib/chartColors.ts`** 이며
차트 색상(hex)은 이 모듈에서만 정의합니다 — 컴포넌트에 직접 박지 말 것.

| 단계 | hex | 흰 카드 / #F0F0F0 |
|---|---|---|
| 녹색 정상 `ok` | `#357A47` | 5.22:1 / 4.58:1 |
| 황색 주의 `warn` | `#7C6705` | 5.53:1 / 4.85:1 |
| 주황 발주 `order` | `#B4611F` | 4.50:1 / 3.95:1 |
| 적색 위험 `danger` | `#A04037` | 6.40:1 / 5.61:1 |

계열 구분색 10개(`SERIES`)도 같은 규칙 — L=0.50 · C=0.085, 색상만 36°씩. 포지션
10본을 한 그림에 겹칠 때만 씁니다.

## 임계치 (4단계 신호등)

**정본은 DB `tire_config`입니다.** 코드에 임계치를 상수로 박지 말 것.
판정은 반드시 `treadLevel()` / `treadThresholds()` / `recPsi()` (`src/data/tmsData.ts`)를 경유합니다.
아래 값은 초기값이며 관리자가 DB에서 조정할 수 있습니다.

| 신호 | 트레드 | `tire_config` 컬럼 | 조치 |
|---|---|---|---|
| 적색 위험 | 3.0 mm 미만 | `tread_critical` = 3 | 즉시 교체. 대시보드 최상단 알림 |
| 주황 발주 | 3.0 ~ 5.0 mm | `tread_order` = 5 | **교체 타이어 발주 트리거** |
| 황색 주의 | 5.0 ~ 10.0 mm | `tread_caution` = 10 | 교체 예정 목록 등재 |
| 녹색 정상 | 10.0 mm 이상 | — | — |

- 경계는 **미만(`<`)** 판정. 정확히 5.00 mm는 주황이 아니라 황색입니다.
- **5 mm는 폐기 기준이 아니라 발주 트리거**입니다 (사용자 결정 2026-08-01). 폐기·수명 계산은 **0 mm** 기준.
- 신품 트레드 22 mm (`NEW_TREAD`).

권장 공기압: 조향축(L1·R1) 100 psi (`rec_psi_steer`) / 구동축(그 외 8본) 116 psi (`rec_psi_drive`).
공기압 정상 범위: 60 ~ 200 psi (하한값 사용자 확인 필요)

## 용어 (UI 문구)

점검 Pemeriksaan / 차량 Unit / 포지션 Posisi / 공기압 Tekanan angin /
트레드 Kedalaman alur / 교체 Penggantian / 마모 Aus / 펑크 Bocor / 파열 Pecah /
좌·중·우 Kiri · Tengah · Kanan
