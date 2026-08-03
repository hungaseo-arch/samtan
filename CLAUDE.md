# CLAUDE.md — SAMTAN TMS

이 파일은 Claude Code가 매 세션 참조하는 상시 규칙입니다.
전체 작업 내용은 `docs/SAMTAN_TMS_작업지시서.md`를 참조하십시오.

## 프로젝트

PT ASCENDO INTERNATIONAL의 광산 덤프트럭 타이어 관리 시스템(TMS).
고객사 SAMTAN의 차량 6대(CH 824 / 832 / 834 / 835 / 839 / 849), 차량당 10개 포지션의
공기압·트레드·HM·KM을 주기 점검하고 타이어 생애주기와 시간당 원가를 관리합니다.

## 스택

Vite + React 18 + TypeScript (SPA) / Tailwind CSS / TanStack Query /
Supabase (Postgres · Auth · RLS · Storage · Edge Functions) / Cloudflare Pages / Vitest + pgTAP

## 절대 금지

1. 프로덕션 DB에 직접 DDL/DML 실행 금지. 모든 변경은 `supabase/migrations/` 파일 → 로컬 검증 → 사용자 승인 순서.
2. `SUPABASE_SERVICE_ROLE_KEY`를 클라이언트 코드·저장소·로그에 노출 금지. RLS를 무력화합니다.
3. `inspections` / `replacements` 레코드 DELETE 금지. 소프트 삭제(`deleted_at`)만 사용.
4. `DROP TABLE` / `TRUNCATE` / `DROP COLUMN` 을 마이그레이션에 포함 금지. `vehicle_positions.serial2`도 유지.
5. 원본 Excel 파일 수정 금지 (읽기 전용).
6. 환율·단가·계약 조건 임의 가정 금지. 불명확하면 질문할 것.
7. 색상값 하드코딩 금지. `src/styles/tokens.css`의 CSS 변수만 사용.
8. `toLocaleString()` 직접 호출 금지. `src/lib/format.ts` 헬퍼만 사용.

## 필수 준수

- 마이그레이션은 멱등하게: `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, `CREATE OR REPLACE`
- 타임존: 저장 UTC / 표시 `Asia/Jakarta` (WIB)
- 로케일: `ko` / `id` 2개. 현장 점검자 화면 기본값은 `id`
- 커밋: Conventional Commits (`feat(schema): ...`). `main` 직접 푸시 금지
- Task 완료 시 완료 조건(DoD)을 항목별로 체크해 보고. 미충족 시 다음 Task 진행 금지

## 숫자 표기 (예외 없음)

- 천 단위 콤마 `,` / 소수점 마침표 `.` — **인도네시아어 화면도 동일**. `1.234,56` 형식 사용 금지
- 퍼센트 소수점 1자리 고정 (`3.0%`), 단가 2자리 (`USD 84.25/EA`), 수량 정수 (`1,200 EA`)
- 트레드 2자리 (`17.14 mm`), 공기압 1자리 (`116.0 psi`), HM/KM 1자리 (`5,188.4 HM`)
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
