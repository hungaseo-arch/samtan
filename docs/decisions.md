# 결정 기록 (Decisions)

작업지시서 `docs/SAMTAN_TMS_작업지시서.md` §0의 결정 필요 사항에 대한 확정값입니다.
확정값을 변경할 때는 이 문서를 갱신하고, 영향 범위에 해당하는 Task를 재검토하십시오.

---

## §0 결정 사항

| ID | 결정 항목 | 확정값 | 확정일 | 결정자 |
|---|---|---|---|---|
| **D-1** | 서비스 범위 | **고객사 제공** | 2026-08-01 | 사용자 |
| **D-2** | 타이어 구매원가 DB 저장 | **저장함** (`finance` 스키마로 격리) | 2026-08-01 | 사용자 |
| **D-3** | 현장 점검 데이터 입력 주체 | **본사 취합(Excel) + 현장 입력 병행** | 2026-08-01 | 사용자 |

세 항목 모두 지시서 §0 표의 기본값과 동일합니다.

### D-1. 서비스 범위 = 고객사 제공

고객사(SAMTAN) 담당자에게 열람 계정을 발급합니다.

**영향**
- `customer_viewer` 역할과 `vehicles.customer_code` 기반 RLS가 필수 범위에 포함됩니다 (T-301 · T-302).
- T-404 고객사 포털이 개발 범위에 포함됩니다.
- 원가·단가·마진이 고객사 화면·API 응답·네트워크 응답 어디에도 나타나지 않아야 합니다 (T-404 완료 조건).

### D-2. 구매원가 저장 = 저장함 / `finance` 스키마 격리

**영향**
- `finance.tire_cost` 테이블을 생성하고 `anon`·`authenticated`에서 스키마 권한을 REVOKE 합니다 (부록 B).
- `v_tire_cph`(시간당 원가) 뷰를 `finance` 스키마에 생성합니다 (T-203).
- `customer_viewer` / `inspector`가 `finance` 스키마 조회 시 권한 오류가 발생해야 합니다 (T-302 완료 조건).
- 매입 단가는 사용자가 제공한 실제 값만 사용합니다. 임의 가정 금지 (§3.1-6).

### D-3. 입력 주체 = Excel 취합 + 현장 입력 병행

**영향**
- T-204 Excel 임포터와 T-403 현장 입력 화면(PWA · 오프라인 큐)을 **모두** 개발합니다.
- 두 경로가 같은 레코드를 만들 수 있으므로 T-104의 멱등 UPSERT가 양쪽의 공통 진입점이 되어야 합니다.
- 중복 동기화 시 레코드가 증가하지 않아야 합니다 (T-403 완료 조건).

---

## 부가 결정 (작업 진행 중 확정)

| ID | 항목 | 확정값 | 확정일 | 사유 |
|---|---|---|---|---|
| **X-1** | 로컬 검증 환경 | **Docker Desktop + `supabase start`** | 2026-08-01 | 무료이며 §3.1-1이 전제한 방식. Supabase 개발 브랜치는 유료(브랜치당 약 USD 0.32/일)로 부록 D의 Spend Cap 방침과 상충 |
| **X-2** | T-001의 "저장소 생성" 해석 | **기존 저장소에 대한 정합화**로 수행 | 2026-08-01 | 지시서 §2.2는 신규 생성을 전제하나 실제 저장소에는 동작 중인 앱과 마이그레이션 `0001`~`0010`이 존재. 재생성 시 운영 자산이 파괴됨 |
| **X-3** | `00000000000000_baseline.sql` 덤프 | **생성하지 않음.** 대신 `docs/schema-parity.sql`로 동일성을 증명 | 2026-08-01 | 기존 `0001`~`0010`이 프로덕션 스키마를 이미 정확히 재현함을 검증 완료. baseline을 추가하면 동일 DDL이 이중 적용되어 `db reset`이 깨짐 |
| **X-4** | T-002 적출 11건의 처리 | **공기압 2건 정정(110 · 120) / 트레드 3건 → 값 보존 + 검토 표기 / 나머지 6건 → 대상 아님** | 2026-08-01 | 사용자 건별 확인. 상세는 아래 X-4 참조 |
| **X-6** | 트레드 임계치 체계 | **4단계 신호등 — 녹색 ≥10 / 황색 5~10 / 주황 3~5 / 적색 <3 mm. 5 mm = 폐기가 아닌 발주 트리거. 수명 계산은 0 mm 기준** | 2026-08-01 | 사용자 결정. 아래 X-6 참조 |
| **X-7** | 임계치·권장 공기압의 정본 위치 | **DB `tire_config`.** 코드 상수는 폴백으로만 잔존 | 2026-08-01 | 사용자 지시. 코드 상수는 변경 시 재배포가 필요해 현장 기준 조정을 막음 |
| **X-8** | 부록 A 제약 중 3건 생략 | **`uq_inspection` · `idx_insp_ch_date` · `fk_vp_vehicle` 을 만들지 않음** | 2026-08-03 | 각각 `inspections_ch_date_pos_uniq` · `inspections_ch_date_idx` · `vehicle_positions_ch_fkey` 로 이미 존재. 추가하면 동일 인덱스가 2벌이 되어 쓰기 비용만 늘어남 |
| **X-9** | `ck_meter` 의 NULL 처리 | **`(hm is null or hm >= 0) and (km is null or km >= 0)`** | 2026-08-03 | 부록 A 의 `hm >= 0 AND km >= 0` 은 한쪽이 NULL 이면 결과가 NULL 이라 CHECK 상 통과. 의도는 같으나 판정을 명시적으로 씀 |
| **X-5** | `audit_log` 최초 생성 시점 | **T-103이 아닌 T-101 마이그레이션에서 생성** | 2026-08-01 | T-101 완료 조건이 "정정 전/후 값이 `audit_log`에 기록됨"인데 테이블은 T-103 산출물이라 순환 의존. T-101에서 최소 형태로 만들고 T-103이 트리거·타 테이블로 확장 |
| **X-10** | 감사 컬럼 적용 범위 | **§1.2의 4개 테이블만.** `lifetimes`·`tire_config`·`damage_codes` 제외 | 2026-08-03 | 지시서 T-103이 명시한 범위. 나머지 3개는 §1.2 미기재 참조 테이블이며 변경 빈도가 사실상 0 |
| **X-11** | 하드 삭제 차단 방식 | **DB 트리거로 무조건 차단** (`forbid_hard_delete()`) | 2026-08-03 | §3.1-3은 규칙 문서로만 존재했고 DB는 막지 않았다. 실제로 `deleteInspectionRound()`가 하드 `DELETE`를 실행 중이었음. 아래 X-11 참조 |
| **X-12** | 소프트 삭제 권한 경계 | **삭제(NULL→값)는 `admin`만. 복원(값→NULL)은 `inspector`도 가능** | 2026-08-03 | 삭제를 `UPDATE`로 바꾸면 `UPDATE` 정책(`inspector`·`admin`)을 타 권한이 넓어짐. 컬럼 단위 판정은 RLS로 표현 불가하여 트리거로 원래 경계 복원. 아래 X-12 참조 |
| **X-13** | `replacements.created_at` 추가 방식 | **NULL로 추가 → 교체일로 백필 → `NOT NULL DEFAULT now()`** (3단계) | 2026-08-03 | `not null default now()`로 한 번에 넣으면 기존 17행이 마이그레이션 실행 시각으로 굳어져 이후 되돌릴 행을 특정할 수 없음 |

### X-2 상세 — 지시서 전제와 실제 저장소의 차이

| 지시서 | 실제 상태 |
|---|---|
| §1.2 스키마 = 4개 테이블 | `tire_config`, `lifetimes` 추가 존재. `inspections`에 `id`(uuid PK), `driver` 존재 |
| P-5 감사 추적 불가 | `inspections`에 한해 해결됨 — `0009_inspections_audit.sql` |
| P-6 권한 분리 없음 | 부분 해결 — `0006`·`0007`·`0010`이 `admin`/`inspector`/`viewer` RLS 운영 중 |
| P-7 마이그레이션 이력 없음 | 해결됨 — `0001`~`0010` 존재 |
| §2.2 `src/features/*` | 실제는 `src/components/*` · `src/api/*` · `src/data/*` |

**미해결 충돌**: T-301은 `user_profiles` 테이블 + 4개 역할(`super_admin`/`ops_manager`/`inspector`/`customer_viewer`)을 규정하나,
현재는 `auth.users.app_metadata.role` 기반 3개 역할(`admin`/`inspector`/`viewer`)이 운영 중입니다.
Phase 3 착수 시 이관안을 별도로 제시하고 승인을 받습니다.

### X-3 상세 — baseline 대신 동일성 증명을 채택한 근거

2026-08-01, Docker 설치 후 `supabase db reset`으로 `0001`~`0010`을 처음부터 재적용한 로컬 DB와
프로덕션의 스키마를 6개 항목으로 대조한 결과 **전부 일치**했습니다.

| 항목 | 해시 | 일치 |
|---|---|:--:|
| `columns` | `c30eb5bda4297870c0139c330f2c2998` | ✅ |
| `constraints` | `3c0de79dcceec70e74f515dd17fc1c1b` | ✅ |
| `indexes` | `b1643380519f1d802868209b2cc750d5` | ✅ |
| `policies` | `da33f3cece9894d82f84961fa24cb091` | ✅ |
| `tables_rls` | `c3a9b2522541b056d0b62824ff994e1b` | ✅ |
| `functions` | `4c51f0ad94fb0e3452eb60f759be12c5` | ✅ |

검증 쿼리는 `docs/schema-parity.sql`에 있으며 언제든 재실행할 수 있습니다.
`supabase db diff --linked`가 보고한 유일한 차이는 `app_role()`·`set_audit_fields()` 본문의
**한국어 주석 유무**였습니다. 프로덕션에는 주석이 제거된 상태로 적용된 이력이 있어 발생한 차이이며,
주석과 연속 공백을 제거한 정규화 해시는 양쪽이 동일합니다. 기능 차이는 없습니다.

### X-4 상세 — T-002 적출 11건의 건별 처리 결과

마이그레이션: `supabase/migrations/20260801100000_t101_correct_outliers.sql` (로컬 검증 후 **2026-08-01 프로덕션 적용 완료** — U-2 참조)

| 항목 | 건수 | 처리 | 근거 |
|---|---:|---|---|
| 공기압 이상치 | 2 | CH 834 → **110 psi** · CH 835 → **120 psi** | 사용자 확인값 |
| 트레드 22.00 mm — CH 835 04-26 · 05-10 · 05-23 | 3회차 (30행) | **값 보존.** `remark`에 `[DATA REVIEW REQUIRED]` 추가 | 참값 판단 불가. §4 T-101 규정 |
| 트레드 22.00 mm — 나머지 6회차 | 6 | **처리 없음** | `tire_config.new_tread` = 22.00 mm 이고 각 차량의 첫 회차 = 신품 장착 직후 정상값 |

정정한 공기압 2건의 회차 맥락 (후륜 동일 회차 비교):

| 차량 | 점검일 | 포지션 | 원값 | 정정값 | 같은 회차 후륜 |
|---|---|---|---:|---:|---|
| CH 834 | 2026-05-10 | R3 Out | 10 psi | **110 psi** | L2 Out 115 · L3 Out 115 · R2 Out 114 |
| CH 835 | 2026-07-05 | R3 Out | 13 psi | **120 psi** | L2 Out 106 · L3 Out 126 · R2 Out 128 |

CH 834는 최초 확인값이 120이었으나, 동일 회차 후륜이 114~115 psi인 점을 근거로 사용자가 **110**으로
수정 지시했습니다 (앞자리 `1` 누락 → `110`이 `10`으로 입력). CH 835는 후륜이 106~128 psi로 120이 그 범위 안입니다.

트레드 3회차를 정정하지 않은 이유: CH 835는 04-21(신품 장착 추정) 이후 04-26 · 05-10 · 05-23 세 회차
연속으로 전 포지션이 22.00 mm입니다. 약 한 달간 마모 0은 실측 누락으로 의심되나 **참값을 복원할 근거가
없습니다.** 값을 추정해 넣으면 마모율 계산이 조용히 왜곡되므로 표기만 남겼습니다.

---

## 해소된 미결 사항

### U-1. 마이그레이션 이력 분기 — **해소 완료 (2026-08-01)**

> **정정**: 최초 진단에서 "로컬 `0001`~`0010`이 원격 이력에 한 건도 없다"고 기록했으나 **사실이 아닙니다.**
> `supabase_migrations.schema_migrations`를 직접 조회한 결과 `0001`~`0010`은 모두 등록되어 있었습니다.
> 따라서 `db push`가 10개를 재실행할 위험(= `0003`·`0004`의 일괄 UPDATE 되돌림)은 존재하지 않았습니다.

실제 분기는 **원격에만 있던 중복 4건**뿐이었습니다. 각각 로컬 `0007`~`0010`과 같은 SQL이 다른 버전명으로
한 번 더 등록된 것으로, `db push`가 "Remote migration versions not found in local" 오류로 중단되는 원인이었습니다.

| 원격 버전 | 이름 | 대응 로컬 파일 | 본문 md5 |
|---|---|---|---|
| `20260714131600` | `0007_rls_role_based` | `0007_rls_role_based.sql` | `d7d6bd2908b9304aecf41b043ea61444` |
| `20260717131834` | `inspection_driver` | `0008_inspection_driver.sql` | `794906e0b57d966ebfa17fc19be216df` |
| `20260722032712` | `inspections_audit` | `0009_inspections_audit.sql` | `2a0e9956937ee15e89d52342707d9ab4` |
| `20260722062632` | `rename_roles` | `0010_rename_roles.sql` | `2125dbcce21b43f69686cde047e13ff2` |

**조치** (사용자 승인 2026-08-01):

```bash
supabase migration repair --status reverted 20260714131600 20260717131834 20260722032712 20260722062632
```

`schema_migrations` 메타데이터에서 중복 4행만 제거합니다. 업무 테이블에 DDL/DML을 실행하지 않으며,
이 4건의 스키마 변경 자체는 이미 적용된 상태로 `0007`~`0010`이 이력을 대표합니다.
조치 후 `db push --dry-run`이 `20260801100000` 하나만 대상으로 보고했습니다.

### U-2. T-101 마이그레이션 프로덕션 적용 — **적용 완료 (2026-08-01)**

사용자 승인 후 `supabase db push`로 `20260801100000_t101_correct_outliers.sql` 1건만 적용했습니다.

| 확인 항목 | 적용 후 |
|---|---|
| 공기압 범위 이탈 (60 미만 · 200 초과) | **0건** (적용 전 2건) |
| CH 834 / 2026-05-10 / R3 Out | **110 psi** |
| CH 835 / 2026-07-05 / R3 Out | **120 psi** |
| `[DATA REVIEW REQUIRED]` 표기 행 | **30행** |
| CH 835 3회차 `tread` 값 종류 | `22` 단일 — **불변** |
| `inspections` 총 행수 | **330** — 증감 없음 |
| `audit_log` | **32행** (`pressure` 2 · `remark` 30) |

`docs/audit-report.md`는 적용 후 anon 키로 재실행해 갱신했습니다 (공기압 이상치 0건).
적용 전 원본 리포트는 커밋 `0d7c517`에 있습니다. 리포트 §4의 9건은 값 보존이 결정 사항이므로
재실행 후에도 그대로 남으며, 그중 3건에 검토 표기가 추가된 상태입니다.

---

### X-6 상세 — 4단계 신호등과 "5 mm = 발주 트리거"

지시서·CLAUDE.md의 기존 임계치는 3단계(위험 ≤3 / 주의 ≤5 / 정상 >5)였고, 5 mm의 의미가
"주의"인지 "폐기"인지 불명확했습니다. 사용자 결정으로 다음과 같이 확정했습니다.

| 신호 | 트레드 | 컬럼 | 의미 |
|---|---|---|---|
| 녹색 | 10 mm 이상 | — | 정상 |
| 황색 | 5 ~ 10 mm | `tread_caution` = 10 | 주의. 교체 예정 목록 등재 |
| 주황 | 3 ~ 5 mm | `tread_order` = 5 | **교체 타이어 발주 트리거** |
| 적색 | 3 mm 미만 | `tread_critical` = 3 | 즉시 교체 |

- 판정은 **미만(`<`)** 기준입니다. 정확히 5.00 mm 는 주황이 아니라 황색 — 5 mm 를 **밑도는** 순간
  발주 단계로 넘어갑니다.
- **5 mm 는 폐기 기준이 아닙니다.** 발주에서 입고까지의 리드타임을 확보하기 위한 시점이며,
  타이어는 계속 사용합니다.
- 따라서 **수명(잔여시간) 계산의 한계값은 0 mm** 입니다 (`lifeCalc(serial, limit = 0)`).
  5 mm 를 한계로 잡으면 실제 사용 가능 수명이 과소 산정됩니다.
- 신품 22 mm (`NEW_TREAD`).

### X-7 상세 — 임계치·권장 공기압을 `tire_config` 로 이관

이관 전에는 `TREAD_WARN` · `TREAD_DANGER` · 권장 공기압 100/116 psi 가 `src/data/tmsData.ts` 에
상수로 박혀 있었습니다. 현장 기준이 바뀔 때마다 코드 수정과 재배포가 필요해, 운영자가 스스로
조정할 수 없는 구조였습니다.

마이그레이션 `20260801120000_tire_config_thresholds.sql` 이 `tire_config` 에 5개 컬럼
(`tread_caution` · `tread_order` · `tread_critical` · `rec_psi_steer` · `rec_psi_drive`)과
CHECK 제약 2개를 추가합니다. 상세는 `docs/schema.md` §6.

프론트엔드는 상수를 직접 읽지 않고 접근자를 경유합니다.

| 접근자 (`src/data/tmsData.ts`) | 역할 |
|---|---|
| `treadThresholds()` | 현재 적용 중인 경계값 3개 반환 |
| `treadLevel(mm)` | `"ok" \| "warn" \| "order" \| "danger"` 판정 |
| `recPsi(pos)` | 포지션별 권장 공기압. 조향축 = 포지션 1·2 |

DB 컬럼이 NULL 이거나 마이그레이션 미적용 환경에서는 동일한 폴백값(10/5/3/100/116)으로
동작하므로, 마이그레이션 적용 전에도 화면은 깨지지 않습니다.

**남은 한계:** 값을 조정할 관리자 화면은 아직 없습니다. 현재는 DB 직접 수정이 필요합니다.
RLS 상 `tire_config` 의 UPDATE 는 `inspector` · `admin` 에 열려 있으므로 화면 추가는 가능합니다.

---

### U-3. `20260801120000_tire_config_thresholds.sql` — **적용 완료 (2026-08-02)**

사용자 승인 후 `supabase db push` 로 적용했습니다. `--dry-run` 결과 대상은 이 파일 1건뿐이었습니다.

적용 후 anon 키로 확인한 프로덕션 `tire_config` (id = 1):

| `new_tread` | `tread_caution` | `tread_order` | `tread_critical` | `rec_psi_steer` | `rec_psi_drive` |
|---|---|---|---|---|---|
| 22 | 10 | 5 | 3 | 100 | 116 |

기존 컬럼(`brand` 등)은 변경되지 않았고, 측정 데이터에는 손대지 않았습니다.

---

### X-8 · X-9 상세 — T-102 적용 전 데이터 검증

제약을 붙이기 전에 프로덕션 데이터 전수를 확인했습니다 (2026-08-03, anon 키, `inspections` 330행).

| 검사 | 결과 |
|---|---|
| `pressure` NOT NULL 인데 60 ~ 200 밖 | 0건 (실측 범위 **76.5 ~ 132** psi) |
| `tread` NOT NULL 인데 0 ~ 60 밖 | 0건 (실측 범위 **0 ~ 22** mm) |
| `hm` 또는 `km` 음수 | 0건 |
| `inspections (ch, pos)` 가 `vehicle_positions` 에 없음 | 0건 |
| `replacements (ch, pos)` 가 `vehicle_positions` 에 없음 | 0건 |
| `(ch, inspection_date, pos)` 중복 | 0건 |

`pressure` 하한 60 psi 는 부록 A 값을 그대로 썼습니다. 실측 최저가 76.5 psi 이므로 현재
데이터와는 충돌하지 않으나, **현장에서 실제로 나올 수 있는 최저 공기압은 사용자 확인이 필요**합니다
(지시서 §5 보고 예시에도 같은 항목이 "확인 필요"로 적혀 있습니다).

---

### U-4. `20260803090000_t102_constraints_indexes.sql` — **적용 완료 (2026-08-03)**

사용자 승인 후 `supabase db push`. `--dry-run` 대상은 이 파일 1건이었습니다.
기존 330행은 사전 검증대로 제약 위반 없이 통과했습니다 (적용 중 오류 없음).

적용 후 프로덕션 확인 — 7개 객체 모두 존재:

| 객체 | 정의 |
|---|---|
| `ck_pressure` | `CHECK (pressure IS NULL OR (pressure >= 60 AND pressure <= 200))` |
| `ck_tread` | `CHECK (tread IS NULL OR (tread >= 0 AND tread <= 60))` |
| `ck_meter` | `CHECK ((hm IS NULL OR hm >= 0) AND (km IS NULL OR km >= 0))` |
| `fk_insp_position` | `FOREIGN KEY (ch, pos) REFERENCES vehicle_positions(ch, pos)` |
| `fk_repl_position` | `FOREIGN KEY (ch, pos) REFERENCES vehicle_positions(ch, pos)` |
| `idx_insp_serial` | `btree (serial)` |
| `idx_insp_date` | `btree (inspection_date DESC)` |

---

### X-11 상세 — 하드 삭제가 실제로 실행되고 있었다

§3.1-3(`inspections`·`replacements` DELETE 금지, 소프트 삭제만 사용)은 규칙 문서로만 존재했고
DB에는 아무 방어막이 없었습니다. T-103 착수 시점에 확인한 실제 상태:

| 항목 | 적용 전 |
|---|---|
| `deleted_at` 컬럼 | **어느 테이블에도 없음** |
| `src/api/inspections.ts:deleteInspectionRound()` | `supabase.from("inspections").delete()` — **하드 삭제** |
| 호출 경로 | `src/components/InspectionTab.tsx` 회차 삭제 버튼 (`canDelete` 게이팅) |
| RLS `DELETE` 정책 | `admin`만 허용 (`0010`) |

즉 관리자가 회차 삭제 버튼을 누르면 점검 레코드 최대 10행이 복구 불가능하게 사라지는
상태였습니다. T-103에서 컬럼·트리거·클라이언트를 함께 고쳤습니다.

`forbid_hard_delete()`는 `BEFORE DELETE`에서 무조건 예외를 던집니다(`23001`). 조건부로 두지 않은
이유는, 예외를 열어두는 순간 그 경로가 정상 경로로 쓰이기 때문입니다. 정말로 물리 삭제가
필요해지면 그때 마이그레이션으로 트리거를 잠시 내리고 근거를 남기는 편이 안전합니다.

### X-12 상세 — 소프트 삭제 전환이 권한을 넓히는 문제

정책 구성상 `DELETE`는 `admin`, `UPDATE`는 `inspector`·`admin`입니다(`0010`).
삭제를 `deleted_at`을 채우는 `UPDATE`로 바꾸면 **삭제 권한이 조용히 `inspector`까지 넓어집니다.**

RLS 정책의 `WITH CHECK`는 새 행만 보므로 "`deleted_at`이 NULL에서 값으로 바뀌는 경우"를
표현할 수 없습니다. `BEFORE UPDATE` 트리거 `guard_soft_delete()`가 대신 판정합니다.

| 방향 | 허용 대상 | 근거 |
|---|---|---|
| NULL → 값 (삭제) | `admin` | 하드 삭제 시절 경계 유지 |
| 값 → NULL (복원) | `inspector`·`admin` | 삭제된 날짜에 점검을 다시 입력하는 정상 흐름. UPSERT가 `deleted_at`을 NULL로 되돌림 |

복원을 점검자에게 허용하면 관리자의 삭제를 점검자가 되돌릴 수 있습니다. 그 대신
복원 행위도 `audit_log`에 `UPDATE`로 남으므로 추적은 가능합니다. 재입력 흐름을 막는 쪽이
현장에서 더 큰 비용이라고 판단했습니다.

`auth.uid()`가 NULL인 세션(마이그레이션·`service_role`)은 판정을 통과시킵니다 —
그러지 않으면 마이그레이션 자신이 자기 트리거에 막힙니다.

---

### U-5. `20260803110000_t103_audit_columns_triggers.sql` — **적용 완료 (2026-08-03)**

사용자 승인 후 `supabase db push`. `--dry-run` 대상은 이 파일 1건이었습니다.

적용 후 프로덕션 확인:

| 항목 | 결과 |
|---|---|
| 감사 컬럼 | `vehicles` · `vehicle_positions` · `inspections` · `replacements` 각 7개 |
| 트리거 | `inspections` 5 · `replacements` 5 · `vehicles` 3 · `vehicle_positions` 3 |
| `inspections.created_at` 백필 | 330 / 330행이 점검일 WIB 자정과 일치 |
| `replacements.created_at` 백필 | 17 / 17행이 교체일 WIB 자정과 일치 |
| 함수 | `log_audit` · `forbid_hard_delete` · `guard_soft_delete` · `set_updated_at` · `set_audit_fields` |
| `audit_log.op` | 존재 |

**적용 순서를 잘못 잡아 앱이 일시적으로 멈췄습니다.** 클라이언트에 `deleted_at IS NULL` 필터를
넣은 커밋(`48d5dc5`)을 마이그레이션 적용 전에 만들어서, 없는 컬럼을 필터하는 요청이 에러를 내고
`loadData()`가 throw → "데이터를 불러오지 못했습니다" 화면이 떴습니다.

**교훈: 컬럼을 전제하는 클라이언트 변경은 마이그레이션 적용 전에 커밋하지 않습니다.**
승인 대기 기간이 있는 이상 두 변경은 같은 시점에 나가야 하며, 순서를 바꿀 수 없다면
클라이언트 쪽을 나중에 커밋합니다.

---

## 미결 사항 (사용자 승인 대기)

_현재 없음._

---

`pressure` 하한 60 psi 는 부록 A 값 그대로이며, 실운용 최저 공기압은 여전히 사용자 확인 대상입니다
(승인을 막는 항목은 아니어서 미결로 두지 않고 여기에 남깁니다).
