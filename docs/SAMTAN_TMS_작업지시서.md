# SAMTAN TMS 상용화 작업지시서

> **문서 목적**: 본 문서는 VS Code Claude Code가 단독으로 작업을 수행할 수 있도록 작성된 실행 지시서입니다.
> 작업 시작 전 **§0 ~ §4를 전부 읽고**, §3의 금지사항을 반드시 준수하십시오.
>
> | 항목 | 내용 |
> |---|---|
> | 발주 | PT ASCENDO INTERNATIONAL |
> | 시스템 | SAMTAN TMS (Tire Management System / *Sistem Manajemen Ban*) |
> | 문서 버전 | v1.0 |
> | 작성일 | 2026-08-01 |
> | 대상 실행자 | Claude Code (VS Code Extension) |

---

## §0. 시작 전 확인 사항

작업을 시작하기 전, 아래 3개 항목의 결정값을 사용자에게 확인하십시오.
**미확인 상태로 Phase 2 이후를 진행하지 마십시오.**

| ID | 결정 항목 | 기본값 (미응답 시 적용) | 영향 범위 |
|---|---|---|---|
| **D-1** | 서비스 범위: 사내 전용 / 고객사 제공 | **고객사 제공** | RLS 정책, 도메인, 계약 조건 |
| **D-2** | 타이어 구매원가(*harga beli*) DB 저장 여부 | **저장함** (별도 `finance` 스키마로 격리) | CPH 분석 가능 여부, 권한 설계 |
| **D-3** | 현장 점검 데이터 입력 주체: 본사 취합 / 현장 직접 | **본사 취합(Excel) + 현장 입력 병행** | Phase 2·4 개발 범위 |

확인 방법: 작업 개시 시 위 표를 사용자에게 제시하고 응답을 받은 뒤, `docs/decisions.md`에 확정값을 기록하십시오.

---

## §1. 프로젝트 배경

### 1.1 현재 상태

- **DB**: Supabase (Postgres), 프로젝트 별칭 `samtam`
- **데이터 입력**: 현장 Excel(`YYYYMMDD MONITORING TIRE TECHKING.xlsx`) → 사람이 수동으로 SQL 변환 → 콘솔에서 실행
- **모니터링 대상**: 광산용 덤프트럭(*dump truck*), 차량번호 CH 824 / 832 / 834 / 835 / 839 / 849
- **포지션**: 차량당 10개 — `L1`, `L2 In`, `L2 Out`, `L3 In`, `L3 Out`, `R1`, `R2 In`, `R2 Out`, `R3 In`, `R3 Out`
- **측정 항목**: 공기압(pressure / *tekanan*, psi), 트레드 잔량(tread / *kedalaman alur*, mm), 가동시간(HM), 주행거리(KM)

### 1.2 현재 스키마

```
vehicles           (ch PK, seq, hm_reset)
vehicle_positions  (ch, pos, serial, serial2, remark, seq)   -- PK: (ch, pos)
inspections        (ch, inspection_date, hm, km, pos, serial, pressure, tread, remark)
replacements       (ch, pos, date, new_serial)
```

### 1.3 식별된 문제점 (본 작업의 해결 대상)

| # | 문제 | 근거 |
|---|---|---|
| P-1 | `inspections`에 UNIQUE 제약 없음 | 삽입문이 전부 `WHERE NOT EXISTS` 패턴 — 제약조건 부재의 증거 |
| P-2 | 값 검증 없음 | CH 835 / 2026-07-05 / `R3 Out` 공기압 `13` (동일 회차 타 포지션은 106~128) |
| P-3 | 더미 데이터 혼입 | CH 824 / 2026-07-05 전 포지션 `tread=22`, `pressure=116` 동일 — 실측값 아님 |
| P-4 | 타이어 이력 구조 파탄 | `serial` / `serial2` 2열 구조 → 3회차 교체 시 저장 불가, 타이어별 수명 산출 불가 |
| P-5 | 감사 추적 불가 | `created_at` / `created_by` 컬럼 없음 |
| P-6 | 권한 분리 없음 | 단일 관리자 계정, 고객사 열람용 계정 발급 불가 |
| P-7 | 스키마 변경 이력 관리 없음 | 마이그레이션 파일 미사용 |

---

## §2. 기술 스택 및 저장소 구조

### 2.1 스택 (확정)

| 계층 | 선택 | 사유 |
|---|---|---|
| DB / Auth / Storage | **Supabase Pro** | 기존 자산 유지, RLS가 DB 레벨에서 동작 |
| 프론트엔드 | **Vite + React 18 + TypeScript** (SPA) | 서버 런타임 불필요 → 호스팅 비용 0, RLS가 보안 담당 |
| 스타일 | **Tailwind CSS** + CSS 변수 토큰 | §7 디자인 토큰 참조 |
| 상태/데이터 | **TanStack Query** + `@supabase/supabase-js` v2 | |
| 서버 로직 | **Supabase Edge Functions** (Deno) | 알림·리포트·스케줄 작업 |
| 호스팅 | **Cloudflare Pages** | 무료 티어, 자카르타 근접 엣지 |
| 테스트 | **Vitest** (앱) + **pgTAP** (RLS·제약조건) | |
| 마이그레이션 | **Supabase CLI** | |

> Next.js는 사용하지 않습니다. SSR이 필요한 요건이 없으며 호스팅 비용과 배포 복잡도만 증가합니다.

### 2.2 저장소 구조 (이 구조를 그대로 생성할 것)

```
samtan-tms/
├─ CLAUDE.md                     # 본 문서의 요약 + 작업 규칙 (Claude Code 상시 참조)
├─ README.md
├─ .env.example                  # 실제 .env는 절대 커밋 금지
├─ .gitignore
├─ package.json
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                # YYYYMMDDHHMMSS_설명.sql
│  ├─ functions/
│  │  ├─ tread-alert/index.ts
│  │  └─ monthly-report/index.ts
│  └─ tests/                     # pgTAP RLS 테스트
├─ scripts/
│  ├─ import-excel.ts            # Excel → DB 임포터
│  └─ audit-legacy-data.ts       # 기존 데이터 진단
├─ src/
│  ├─ lib/
│  │  ├─ supabase.ts
│  │  ├─ format.ts               # §6 숫자 표기 규칙 구현
│  │  └─ i18n.ts                 # ko / id 2개 로케일
│  ├─ features/
│  │  ├─ vehicles/
│  │  ├─ inspections/
│  │  ├─ tires/
│  │  ├─ reports/
│  │  └─ auth/
│  ├─ components/ui/
│  ├─ routes/
│  └─ styles/tokens.css
├─ docs/
│  ├─ decisions.md               # §0 결정값 기록
│  ├─ schema.md                  # ERD 및 컬럼 정의
│  ├─ glossary.md                # §8 용어집
│  └─ runbook.md                 # 배포·롤백 절차
└─ tests/
```

---

## §3. 작업 규칙 (필수 준수)

### 3.1 절대 금지 (위반 시 즉시 중단하고 사용자에게 보고)

1. **프로덕션 DB에 직접 DDL/DML을 실행하지 말 것.** 모든 스키마 변경은 `supabase/migrations/` 파일로 작성하고, 로컬(`supabase start`) 또는 개발 브랜치에서 검증한 뒤 사용자 승인을 받아 적용합니다.
2. **`SUPABASE_SERVICE_ROLE_KEY`를 클라이언트 코드·저장소·로그에 노출하지 말 것.** 이 키는 RLS를 전면 무력화합니다. Edge Function 환경변수로만 사용합니다.
3. **`inspections` / `replacements` 기존 레코드를 DELETE 하지 말 것.** 정정이 필요하면 `UPDATE` + 감사 로그, 또는 소프트 삭제(`deleted_at`)를 사용합니다.
4. **`DROP TABLE` / `TRUNCATE` / `ALTER TABLE ... DROP COLUMN`을 마이그레이션에 포함하지 말 것.** `serial2` 컬럼도 Phase 2 이관 검증 완료 전까지 유지합니다.
5. **원본 Excel 파일을 수정하지 말 것.** 읽기 전용으로만 처리합니다.
6. **환율·단가·고객사 계약 조건을 임의로 가정하지 말 것.** 불명확하면 사용자에게 질문합니다.

### 3.2 반드시 지킬 것

1. 모든 마이그레이션은 **멱등(idempotent)**하게 작성합니다: `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, `CREATE OR REPLACE`.
2. 각 Task 완료 시 **완료 조건(DoD)을 하나씩 체크**하고 결과를 보고합니다. 미충족 항목이 있으면 다음 Task로 넘어가지 않습니다.
3. 커밋 메시지는 Conventional Commits: `feat(schema): add tire lifecycle tables`
4. 브랜치: `phase-1/schema-hardening` 형식. `main` 직접 푸시 금지.
5. 타임존은 **저장 UTC / 표시 `Asia/Jakarta` (WIB)** 로 통일합니다.
6. 사용자 대면 문자열은 **한국어(ko) / 인도네시아어(id)** 2개 로케일을 모두 작성합니다. 현장 점검자 화면의 기본 로케일은 `id`입니다.
7. 숫자 출력은 예외 없이 **§6 숫자 표기 규칙**을 따릅니다. 직접 `toLocaleString()`을 호출하지 말고 `src/lib/format.ts`의 헬퍼만 사용합니다.

---

## §4. 작업 목록

### Phase 0 — 환경 구성 및 진단 (예상 2일)

#### T-001. 저장소 및 로컬 환경 초기화
- **작업**
  - §2.2 구조로 저장소 생성, `.gitignore`에 `.env`, `.env.local`, `dist/`, `node_modules/` 포함
  - `supabase init` → `supabase link --project-ref <PROJECT_REF>` (ref는 사용자에게 요청, 하드코딩 금지)
  - `supabase db pull` 로 현재 프로덕션 스키마를 `migrations/00000000000000_baseline.sql`로 덤프
  - `supabase start` 로 로컬 Postgres 기동 확인
- **완료 조건**
  - [ ] `supabase db reset` 실행 시 로컬 DB가 baseline 스키마로 재현됨
  - [ ] `docs/schema.md`에 현재 4개 테이블의 컬럼·타입·NULL 허용 여부가 표로 정리됨
  - [ ] `.env.example`에 필요한 키 목록만 기재 (실제 값 없음)

#### T-002. 기존 데이터 정합성 진단
- **작업**: `scripts/audit-legacy-data.ts` 작성. 프로덕션 **읽기 전용** 연결로 아래를 검사하고 `docs/audit-report.md` 생성.
  1. `(ch, inspection_date, pos)` 중복 레코드
  2. `pressure` 이상치: `NULL` 아니면서 60 미만 또는 200 초과
  3. `tread` 이상치: 0 미만 또는 60 초과
  4. 동일 (ch, inspection_date)에서 전 포지션의 `tread`가 동일한 회차 (더미 데이터 의심)
  5. `vehicle_positions`에 없는 `ch`/`pos` 조합을 참조하는 `inspections` 레코드
  6. `replacements`에 있으나 `vehicle_positions.serial2`에 미반영된 건
  7. `hm` 또는 `km`이 직전 회차보다 감소한 레코드 (계기 리셋 제외 확인 필요)
- **완료 조건**
  - [ ] 7개 항목별 건수와 상세 목록이 리포트에 포함됨
  - [ ] 알려진 이상치(P-2: CH 835 R3 Out `13`, P-3: CH 824 전 포지션 `22`/`116`)가 탐지됨
  - [ ] 스크립트가 어떤 쓰기 작업도 수행하지 않음 (코드 리뷰로 확인)

---

### Phase 1 — 스키마 강화 (예상 5일)

#### T-101. 이상치 정정 마이그레이션
- **작업**: T-002 리포트를 사용자에게 제시하고 **건별 정정값을 확인받은 뒤** 마이그레이션 작성.
  - 확인 전 임의 수정 금지. 판단 불가 건은 `remark`에 `[DATA REVIEW REQUIRED]` 표기만 하고 값은 보존.
  - 기존 SQL 파일 §[4]에 주석 처리된 정정(`834 / 2026-05-10 / R3 Out` 압력 `10` → `120`)도 이 Task에 포함해 사용자 확인을 받습니다.
- **완료 조건**
  - [ ] 정정 전/후 값이 `audit_log`에 기록됨
  - [ ] 사용자 승인 없이 변경된 레코드가 0건

#### T-102. 제약조건 및 인덱스 추가
- **작업**: 아래 DDL을 마이그레이션으로 작성 (부록 A 참조). T-101 완료 후 실행해야 제약 위반이 발생하지 않습니다.
- **완료 조건**
  - [ ] 로컬에서 마이그레이션 적용 성공
  - [ ] 중복 삽입 시도가 UNIQUE 제약으로 차단되는 pgTAP 테스트 통과
  - [ ] `pressure = 13` 삽입 시도가 CHECK 제약으로 차단되는 테스트 통과

#### T-103. 감사 컬럼 및 트리거
- **작업**
  - 4개 테이블 전체에 `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz`, `created_by uuid`, `updated_by uuid` 추가
  - `deleted_at timestamptz` (소프트 삭제) 추가
  - `set_updated_at()` 트리거 함수 작성 및 적용
  - `audit_log` 테이블 + 변경 기록 트리거 (테이블명, PK, 이전값 JSONB, 신규값 JSONB, 실행자, 시각)
- **완료 조건**
  - [ ] `UPDATE` 시 `updated_at`이 자동 갱신됨
  - [ ] `audit_log`에 변경 전후 값이 JSONB로 기록됨
  - [ ] 기존 레코드의 `created_at`은 `inspection_date`를 기준으로 백필

#### T-104. 멱등 UPSERT 전환
- **작업**: `WHERE NOT EXISTS` 패턴을 `ON CONFLICT (ch, inspection_date, pos) DO UPDATE`로 전환하는 표준 삽입 함수 `upsert_inspection()` 작성
- **완료 조건**
  - [ ] 동일 데이터 2회 실행 시 레코드 수 불변, `updated_at`만 갱신
  - [ ] 기존 SQL 파일의 60개 삽입문이 새 함수 호출 8줄 이내로 축약 가능함을 예제로 증명

---

### Phase 2 — 타이어 생애주기 관리 (예상 8일)

#### T-201. 타이어 마스터 테이블 신설
- **작업**: 부록 B의 `tires` / `tire_mounts` DDL 적용
- **완료 조건**
  - [ ] 동일 포지션에 `removed_at IS NULL`인 레코드가 2건 이상 존재할 수 없는 제약(부분 UNIQUE 인덱스) 적용
  - [ ] `removed_at`이 `mounted_at`보다 이를 수 없는 CHECK 적용

#### T-202. 레거시 데이터 이관
- **작업**: `serial` / `serial2` / `replacements`를 `tires` + `tire_mounts`로 이관하는 마이그레이션 작성
  - `vehicle_positions.serial` → 최초 장착 (`mounted_at`은 해당 ch/pos의 최초 `inspection_date`)
  - `replacements` 레코드 → 이전 장착의 `removed_at` = 교체일, 신규 장착 레코드 생성
  - `serial2`는 `replacements`에서 파생된 값이므로 별도 이관하지 않고 **정합성 검증용으로만 사용**
- **완료 조건**
  - [ ] 이관 후 각 (ch, pos)의 현재 장착 시리얼이 기존 `COALESCE(serial2, serial)`과 100.0% 일치 (불일치 0건)
  - [ ] 이관 검증 쿼리가 `docs/migration-verification.sql`로 저장됨
  - [ ] `vehicle_positions.serial2`는 삭제하지 않고 유지 (§3.1-4)

#### T-203. 타이어 성능 분석 뷰
- **작업**: 아래 뷰 생성
  - `v_tire_current`: 현재 장착 중인 전 타이어 + 최신 측정값 + 누적 HM/KM
  - `v_tire_lifetime`: 탈착 완료 타이어의 총 사용 HM/KM, 트레드 소모량, mm당 시간
  - `v_tire_cph`: 시간당 원가 (Cost Per Hour / *biaya per jam*) = 구매단가 ÷ 사용 HM — **D-2가 "저장함"인 경우에만 생성**, `finance` 스키마에 배치
  - `v_tread_wear_rate`: 포지션별 mm/1,000HM 마모율 → 교체 예측일 산출 기반
- **완료 조건**
  - [ ] 각 뷰에 대해 최소 1건 이상의 유효 결과가 반환됨
  - [ ] `v_tire_cph`가 `finance` 스키마에 있고 `authenticated` 역할에 기본 권한이 부여되지 않음

#### T-204. Excel 임포터
- **작업**: `scripts/import-excel.ts` — 현장 Excel을 파싱해 검증 후 UPSERT
  - 라이브러리: `xlsx` (SheetJS)
  - 파싱 규칙 (기존 SQL 파일 헤더의 규칙을 그대로 구현):
    - `serial` = 포지션 기본 시리얼
    - `pressure` = 활성 타이어 값, `N/A` → `NULL`
    - `tread` = 활성 타이어 4개 측정치(KIRI / TENGAH / TENGAH / KANAN)의 **최소값**
    - `hm` = HM 행
    - `km` = HM Reset 0 값(리셋 차량) 또는 KM 행(비리셋 차량)
  - **`--dry-run` 모드를 기본값**으로 하고, 검증 리포트 출력 후 `--apply` 플래그가 있을 때만 DB 반영
  - 검증 실패 항목(제약 위반, 이상치, 미등록 차량)은 반영하지 않고 목록으로 출력
- **완료 조건**
  - [ ] `20260721 MONITORING TIRE TECHKING.xlsx` 로 실행 시 기존 SQL 파일과 동일한 60개 레코드가 생성됨 (값 단위 비교)
  - [ ] 신규 차량(예: CH 824) 자동 감지 후 등록 여부를 사용자에게 확인
  - [ ] `--dry-run` 없이 실행해도 DB가 변경되지 않음 (명시적 `--apply` 필수)

---

### Phase 3 — 인증 및 권한 (예상 6일)

#### T-301. 사용자 프로필 및 역할 체계
- **작업**
  - `user_profiles` 테이블: `user_id uuid PK REFERENCES auth.users`, `role`, `customer_code`, `branch`, `display_name`, `is_active`, `deactivated_at`
  - `role` ENUM: `super_admin` / `ops_manager` / `inspector` / `customer_viewer`
  - `vehicles`에 `customer_code text` 추가 (다고객사 확장 대비). 기존 6대는 `SAMTAN`으로 백필
  - `branches` 테이블: 수라바야(*Surabaya*), 스마랑(*Semarang*)
- **완료 조건**
  - [ ] 신규 가입자가 프로필 없이 어떤 데이터에도 접근할 수 없음
  - [ ] 퇴사 처리는 `is_active = false`로만 수행되며 레코드 삭제 불가

#### T-302. RLS 정책 구현
- **작업**: 부록 C의 역할 매트릭스를 전 테이블에 RLS로 구현
- **완료 조건**
  - [ ] 모든 업무 테이블에서 `ENABLE ROW LEVEL SECURITY` 활성화
  - [ ] `customer_viewer`가 자사 외 차량 조회 시 0건 반환
  - [ ] `customer_viewer` / `inspector`가 `finance` 스키마 조회 시 권한 오류
  - [ ] `inspector`가 3일 이전 날짜의 `inspections`를 삽입/수정 시 차단

#### T-303. RLS 테스트 스위트
- **작업**: `supabase/tests/` 에 pgTAP 테스트. 4개 역할 × 4개 테이블 × 4개 동작(SELECT/INSERT/UPDATE/DELETE) = 최소 64개 케이스
- **완료 조건**
  - [ ] `supabase test db` 전체 통과
  - [ ] CI(GitHub Actions)에서 PR마다 자동 실행

#### T-304. 인증 UI
- **작업**: 로그인, 비밀번호 재설정, 초대 수락 화면. `super_admin` / `ops_manager`는 MFA(TOTP) 필수
- **완료 조건**
  - [ ] 관리자 역할이 MFA 미등록 상태로 대시보드에 진입할 수 없음
  - [ ] 세션 만료 시 재인증 유도, 만료 시간은 12시간

---

### Phase 4 — 사용자 인터페이스 (예상 12일)

> UI 구축 전 §7 디자인 토큰을 `src/styles/tokens.css`로 먼저 구현하고, 모든 색상값은 CSS 변수로만 참조하십시오. 하드코딩된 hex 값 금지.

#### T-401. 디자인 토큰 및 공통 컴포넌트
- **완료 조건**
  - [ ] `tokens.css`에 §7의 5개 색상이 CSS 변수로 정의됨
  - [ ] 본문/경계선 색상 대비가 WCAG AA(4.5:1) 이상
  - [ ] 모바일(375px) ~ 데스크톱(1440px) 반응형 동작

#### T-402. 관리자 대시보드
- **화면 구성**
  - 차량별 카드: 최근 점검일, 위험 포지션 수, HM/KM
  - **타이어 상태 신호등**: 트레드 3.0 mm 이하 = 위험, 5.0 mm 이하 = 주의, 그 외 = 정상
  - 트레드 추이 차트 (포지션별 시계열)
  - 교체 예정 타이어 목록 (마모율 기반 예측일 오름차순)
- **완료 조건**
  - [ ] 현재 데이터 기준 위험 항목(CH 834 `L2 In` = 0, CH 835 `L2 Out` = 0)이 최상단에 노출
  - [ ] 초기 로딩 2초 이내

#### T-403. 점검 입력 화면 (현장용)
- **작업**
  - 기본 로케일 **인도네시아어**, 큰 터치 타겟, 숫자 키패드 입력
  - **PWA + 오프라인 큐**: 네트워크 단절 시 IndexedDB에 저장, 복구 시 자동 동기화
  - 입력값이 §6 범위를 벗어나면 저장 전 경고 (강제 차단이 아닌 확인 절차)
  - 타이어 사진 첨부 → Supabase Storage
- **완료 조건**
  - [ ] 오프라인 상태에서 1개 차량 10개 포지션 입력 후, 온라인 복구 시 전량 동기화
  - [ ] 중복 동기화 시 레코드가 증가하지 않음 (T-104 UPSERT 사용)

#### T-404. 고객사 포털
- **완료 조건**
  - [ ] `customer_viewer` 계정으로 자사 차량 현황·이력만 열람 가능
  - [ ] 원가·단가·마진 정보가 화면·API 응답·네트워크 탭 어디에도 노출되지 않음
  - [ ] 월간 리포트 PDF 다운로드 가능

---

### Phase 5 — 자동화 (예상 5일)

#### T-501. 트레드 임계치 경고
- **작업**: Edge Function `tread-alert` + `pg_cron` 일 1회 (WIB 07:00) 실행
  - 트레드 3.0 mm 이하 또는 공기압 정상범위 이탈 시 담당자 알림
- **완료 조건**
  - [ ] 동일 건에 대해 24시간 내 중복 발송되지 않음
  - [ ] 발송 이력이 `notification_log`에 기록됨

#### T-502. WhatsApp 연동
- **작업**: WhatsApp Business API 연동. 템플릿 메시지는 인도네시아어 기준
- **완료 조건**
  - [ ] API 자격증명이 Edge Function 환경변수로만 관리됨
  - [ ] 발송 실패 시 이메일 폴백

#### T-503. 월간 리포트 자동 생성
- **작업**: 월초 자동 생성 → Storage 저장 → 고객사 포털 게시
  - 내용: 차량별 점검 요약, 교체 이력, 타이어 수명 분석, 다음달 교체 예정
- **완료 조건**
  - [ ] PDF 내 모든 숫자가 §6 규칙을 따름
  - [ ] 반올림으로 합계 불일치 시 각주 자동 삽입

---

## §5. 진행 보고 방식

각 Task 완료 시 아래 형식으로 보고하십시오.

```
[T-102] 제약조건 및 인덱스 추가 — 완료

변경 파일
  supabase/migrations/20260801093000_add_constraints.sql
  supabase/tests/constraints_test.sql

완료 조건
  [v] 로컬 마이그레이션 적용 성공
  [v] 중복 삽입 차단 테스트 통과 (3 cases)
  [v] CHECK 제약 테스트 통과 (5 cases)

확인 필요
  - pressure 하한을 60으로 설정했습니다. 실제 운용 최저 공기압 확인 요청.

다음 Task: T-103
```

---

## §6. 숫자 표기 규칙 (필수)

`src/lib/format.ts`에 아래를 구현하고, 모든 숫자 출력은 이 헬퍼를 경유하십시오.

### 6.1 표기 체계
- **모든 언어의 문서·화면에 영미식 표기를 적용합니다.** 천 단위 구분은 콤마(`,`), 소수점은 마침표(`.`)
- 인도네시아어 화면에도 동일 적용. 인도네시아식 표기(`1.234,56`)는 **사용하지 않습니다**

### 6.2 자리수 규칙

| 항목 | 규칙 | 예시 | 헬퍼 |
|---|---|---|---|
| 기본 정수 | 천 단위 콤마 | `1,250,000` | `fmtInt()` |
| 퍼센트 | 소수점 1자리 고정 | `12.5%`, `3.0%` | `fmtPercent()` |
| 구매단가 (FOB/CIF/C&F/EXW) | 소수점 2자리 | `USD 84.25/EA` | `fmtUnitPrice()` |
| 중량 | 소수점 1자리 | `62.5 kg`, `18.3 ton` | `fmtWeight()` |
| 수량 (EA/PCS/SET) | 정수 | `1,200 EA` | `fmtQty()` |
| **트레드** | 소수점 2자리 (DB 원값 유지) | `17.14 mm` | `fmtTread()` |
| **공기압** | 소수점 1자리 | `99.5 psi`, `116.0 psi` | `fmtPressure()` |
| **HM / KM** | 소수점 1자리 | `5,188.4 HM` | `fmtMeter()` |

### 6.3 통화
- 통화 코드를 금액 **앞**에 표기: `USD 12,500` / `IDR 185,000,000` / `KRW 16,300,000`
- IDR 대금액은 `juta` / `miliar` / `triliun` 단위 사용, 소수점 2자리: `IDR 1.25 miliar`
- **거래처 발송 문서**(견적서, 인보이스, 계약서, 정산서, 공문, 대외 이메일, 고객사 포털 PDF)는 **전체 자리수를 먼저 표기하고 단위를 괄호로 병기**: `IDR 1,250,000,000 (1.25 miliar)` — 소수점 오독 방지를 위한 필수 규칙
- 사내 내부 화면·요약은 단위 표기만 사용 가능

### 6.4 예외
- 콤마를 사용하지 **않는** 항목: 연도(`2026년`), 타이어 규격 및 품번(`1200R24`, `26.5R25`), 차량번호(`CH 824`), 문서번호, 전화번호, 시리얼(`DA1BFANH07451D`)
- 표 안의 숫자는 **우측 정렬**, 동일 열은 소수점 자리수 통일
- 반올림으로 합계와 항목 합이 불일치하면 각주로 명시

---

## §7. 디자인 토큰

```css
:root {
  --color-bg:        #F0F0F0;  /* LIGHT GREY — 배경 60% */
  --color-primary:   #E3F2FD;  /* SOFT BLUE — 주요 요소 30% */
  --color-surface:   #ECEFF1;  /* PASTEL BLUE-GREY — 보조 배경·음영 */
  --color-accent:    #E8F5E9;  /* SAGE GREEN — 강조 10% */
  --color-text:      #546E7A;  /* TEXT & LINE */
}
```

**배색 비율 (60-30-10)**

| 비율 | 색상 | 적용 위치 |
|---|---|---|
| 60% | `--color-bg` | 전체 바탕, 대형 카드 배경. 넓은 여백 확보 |
| 30% | `--color-primary`, `--color-surface` | 핵심 메뉴, 전환 버튼(CTA), 상단 헤더 |
| 10% | `--color-accent` | 성공 알림, 진행 완료 상태, 긍정 메시지 |

**주의사항**
- 위 파스텔 색상은 **배경(fill)으로 사용할 때** 가장 효과적입니다. 텍스트에 사용하지 마십시오.
- 텍스트·경계선은 `--color-text`(#546E7A)를 사용해 WCAG 명도 대비를 확보합니다.
- **경고 색상은 위 팔레트에 없습니다.** 트레드 위험/주의 표시는 팔레트와 조화되는 저채도 앰버·테라코타 계열을 별도 토큰(`--color-warn`, `--color-danger`)으로 제안하고 사용자 승인을 받으십시오. 팔레트 색상만으로 위험도를 표현하려 하지 마십시오 — 안전 관련 정보이므로 명확한 시각적 구분이 필요합니다.

---

## §8. 용어집 (UI 문구 작성 기준)

| 한국어 | English | Bahasa Indonesia | DB 컬럼 |
|---|---|---|---|
| 점검 | Inspection | Pemeriksaan / Monitoring | `inspections` |
| 차량 | Vehicle / Unit | Unit / Kendaraan | `vehicles.ch` |
| 포지션 | Position | Posisi | `pos` |
| 공기압 | Tire pressure | Tekanan angin | `pressure` |
| 트레드 잔량 | Tread depth | Kedalaman alur | `tread` |
| 가동시간 | Hour meter | Jam operasi | `hm` |
| 주행거리 | Odometer | Kilometer | `km` |
| 교체 | Replacement | Penggantian | `replacements` |
| 시리얼 번호 | Serial number | Nomor seri | `serial` |
| 마모 | Wear | Aus | — |
| 펑크 | Puncture | Bocor | — |
| 파열 | Burst | Pecah | — |
| 좌측 / 중앙 / 우측 | Left / Center / Right | Kiri / Tengah / Kanan | 트레드 측정 위치 |
| 시간당 원가 | Cost per hour (CPH) | Biaya per jam | `v_tire_cph` |

---

## 부록 A. T-102 제약조건 DDL

```sql
-- 중복 방지 (WHERE NOT EXISTS 패턴 제거의 전제)
ALTER TABLE inspections
  ADD CONSTRAINT uq_inspection UNIQUE (ch, inspection_date, pos);

-- 값 검증
ALTER TABLE inspections
  ADD CONSTRAINT ck_pressure
  CHECK (pressure IS NULL OR pressure BETWEEN 60 AND 200);   -- 하한값 사용자 확인 필요

ALTER TABLE inspections
  ADD CONSTRAINT ck_tread
  CHECK (tread BETWEEN 0 AND 60);

ALTER TABLE inspections
  ADD CONSTRAINT ck_meter
  CHECK (hm >= 0 AND km >= 0);

-- 참조 무결성
ALTER TABLE vehicle_positions
  ADD CONSTRAINT fk_vp_vehicle FOREIGN KEY (ch) REFERENCES vehicles(ch);

ALTER TABLE inspections
  ADD CONSTRAINT fk_insp_position
  FOREIGN KEY (ch, pos) REFERENCES vehicle_positions(ch, pos);

ALTER TABLE replacements
  ADD CONSTRAINT fk_repl_position
  FOREIGN KEY (ch, pos) REFERENCES vehicle_positions(ch, pos);

-- 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_insp_ch_date  ON inspections (ch, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_insp_serial   ON inspections (serial);
CREATE INDEX IF NOT EXISTS idx_insp_date     ON inspections (inspection_date DESC);
```

## 부록 B. T-201 타이어 생애주기 DDL

```sql
CREATE TABLE IF NOT EXISTS tires (
  serial          text PRIMARY KEY,
  brand           text NOT NULL DEFAULT 'TECHKING',
  pattern         text,
  size            text,
  new_tread_mm    numeric(5,2),
  purchase_date   date,
  status          text NOT NULL DEFAULT 'in_service'
                  CHECK (status IN ('stock','in_service','scrapped','retread')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tire_mounts (
  id              bigserial PRIMARY KEY,
  serial          text NOT NULL REFERENCES tires(serial),
  ch              text NOT NULL,
  pos             text NOT NULL,
  mounted_at      date NOT NULL,
  mounted_hm      numeric(10,1),
  removed_at      date,
  removed_hm      numeric(10,1),
  removal_reason  text CHECK (removal_reason IN ('aus','bocor','pecah','rotasi','lain')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_mount_period CHECK (removed_at IS NULL OR removed_at >= mounted_at),
  CONSTRAINT fk_mount_position FOREIGN KEY (ch, pos) REFERENCES vehicle_positions(ch, pos)
);

-- 한 포지션에 현재 장착 타이어는 1본만 존재
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_mount
  ON tire_mounts (ch, pos) WHERE removed_at IS NULL;

-- 한 타이어가 동시에 두 곳에 장착될 수 없음
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_serial
  ON tire_mounts (serial) WHERE removed_at IS NULL;

-- 원가 정보는 별도 스키마로 격리 (D-2 = "저장함"인 경우에만 생성)
CREATE SCHEMA IF NOT EXISTS finance;
CREATE TABLE IF NOT EXISTS finance.tire_cost (
  serial            text PRIMARY KEY REFERENCES public.tires(serial),
  purchase_cost_idr numeric(18,2),
  supplier          text,
  invoice_no        text
);
REVOKE ALL ON SCHEMA finance FROM anon, authenticated;
```

## 부록 C. T-302 역할 매트릭스

| 역할 | 대상 | 조회 범위 | 입력 | 수정 | 삭제 | 원가 |
|---|---|---|:--:|:--:|:--:|:--:|
| `super_admin` | ASCENDO 총괄 | 전체 | O | O | O(소프트) | O |
| `ops_manager` | 지점장 (Surabaya / Semarang) | 담당 지점 | O | O | X | O |
| `inspector` | 현장 점검자 (*teknisi*) | 담당 차량 | O | 최근 3일分 | X | X |
| `customer_viewer` | 고객사 담당자 (SAMTAN) | 자사 차량 | X | X | X | X |

### 참조 RLS 정책

```sql
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- 고객사: 자사 차량만 조회
CREATE POLICY customer_read ON inspections FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM vehicles v
    JOIN user_profiles up ON up.customer_code = v.customer_code
    WHERE v.ch = inspections.ch
      AND up.user_id = auth.uid()
      AND up.role = 'customer_viewer'
      AND up.is_active
  )
);

-- 점검자: 최근 3일分만 입력
CREATE POLICY inspector_insert ON inspections FOR INSERT
WITH CHECK (
  (SELECT role FROM user_profiles WHERE user_id = auth.uid() AND is_active) = 'inspector'
  AND inspection_date >= CURRENT_DATE - INTERVAL '3 days'
  AND inspection_date <= CURRENT_DATE
);
```

---

## 부록 D. 참고 자료

- Supabase 요금: Pro USD 25/월 (8 GB DB, 100 GB 스토리지, 일 백업). Free 티어는 7일 미접속 시 프로젝트 자동 정지되어 상용 부적합. Pro의 Spend Cap(USD 10/월 초과 과금 차단) 설정은 **해제하지 말 것**. — supabase.com/pricing
- Cloudflare Pages 무료 티어: 대역폭 무제한(정적 자산), 월 500회 빌드
- 기존 데이터 원본: `claude/samtan_update_20260705.sql`, `20260721 MONITORING TIRE TECHKING.xlsx`

---

**문서 끝. 작업 개시 전 §0의 D-1 ~ D-3을 사용자에게 확인하십시오.**
