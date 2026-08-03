# 스키마 정의 (Schema)

작성 시점: 2026-08-01 · 대상: Supabase 프로젝트 `samtam` (프로덕션, `public` 스키마)
수집 방법: 읽기 전용 조회 (`pg_catalog` / `information_schema`). **쓰기 작업 없음.**

> 이 문서는 T-001 완료 조건의 "현재 테이블의 컬럼·타입·NULL 허용 여부" 기록입니다.
> 스키마 변경 시 해당 마이그레이션과 함께 이 문서를 갱신하십시오.

---

## 0. 요약

작업지시서 §1.2는 4개 테이블을 전제하나, 실제 프로덕션에는 **7개 테이블**이 존재합니다.

| 테이블 | 행 수 | RLS | 역할 |
|---|---:|:--:|---|
| `inspections` | 330 | 활성 | 점검 측정값 (ch · 점검일 · 포지션 단위 1행) |
| `vehicles` | 6 | 활성 | 차량 마스터 |
| `vehicle_positions` | 60 | 활성 | 차량별 포지션 및 장착 시리얼 |
| `replacements` | 17 | 활성 | 타이어 교체 이력 |
| `lifetimes` | 70 | 활성 | 타이어 수명 원장 (§1.2 미기재) |
| `tire_config` | 1 | 활성 | 타이어 스펙 단일 행 (§1.2 미기재) |
| `damage_codes` | 14 | 활성 | 손상 코드 참조 (§1.2 미기재) |

T-101에서 `audit_log`가 추가되어 현재 **8개**입니다 (§8 참조. 2026-08-01 프로덕션 적용 완료).

---

## 1. `public.inspections` — 점검 측정값

PK: `id`

| 컬럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|:--:|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK. §1.2에는 없음 |
| `ch` | `text` | NOT NULL | — | 차량번호 (`824` 등, 접두 `CH` 없이 저장) |
| `inspection_date` | `date` | NOT NULL | — | 점검일 |
| `hm` | `numeric` | NULL | — | 가동시간 (Hour Meter) |
| `km` | `numeric` | NULL | — | 주행거리 |
| `pos` | `text` | NOT NULL | — | 포지션 (`L1`, `L2 In`, …) |
| `serial` | `text` | NULL | — | 타이어 시리얼 |
| `pressure` | `numeric` | NULL | — | 공기압 psi. NULL = N/A·미측정 |
| `tread` | `numeric` | NULL | — | 트레드 mm (4그루브 최소값) |
| `remark` | `text` | NULL | — | 비고 |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | 트리거로 갱신 |
| `driver` | `text` | NULL | — | 점검 회차 운전자 (선택) |
| `created_by` | `uuid` | NULL | — | `auth.users.id`. 트리거가 JWT에서 채움 |
| `updated_by` | `uuid` | NULL | — | 동일 |
| `created_by_email` | `text` | NULL | — | 표시용 이메일 스냅샷 |
| `updated_by_email` | `text` | NULL | — | 동일 |

## 2. `public.vehicles` — 차량

PK: `ch`

| 컬럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|:--:|---|---|
| `ch` | `text` | NOT NULL | — | PK. 차량번호 |
| `seq` | `integer` | NULL | — | 표시 순서 |
| `hm_reset` | `boolean` | NOT NULL | `false` | 계기 리셋 차량 (`832`, `835`) |

## 3. `public.vehicle_positions` — 차량 포지션

PK: `(ch, pos)` · FK: `ch` → `vehicles(ch)` `ON DELETE CASCADE`

| 컬럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|:--:|---|---|
| `ch` | `text` | NOT NULL | — | PK / FK |
| `pos` | `text` | NOT NULL | — | PK |
| `serial` | `text` | NULL | — | 최초 장착 시리얼 |
| `serial2` | `text` | NULL | — | 교체 후 시리얼. **P-4의 원인** (2회 교체까지만 표현 가능) |
| `remark` | `text` | NULL | — | |
| `seq` | `integer` | NULL | — | 표시 순서 |

## 4. `public.replacements` — 교체 이력

PK: `id`

| 컬럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|:--:|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `ch` | `text` | NOT NULL | — | FK 없음 (T-102 대상) |
| `pos` | `text` | NOT NULL | — | FK 없음 (T-102 대상) |
| `date` | `date` | NOT NULL | — | 교체일 |
| `new_serial` | `text` | NULL | — | 신규 장착 시리얼 |

## 5. `public.lifetimes` — 타이어 수명 원장

PK: `no` · **§1.2 미기재 테이블**

| 컬럼 | 타입 | NULL | 기본값 | 비고 |
|---|---|:--:|---|---|
| `no` | `integer` | NOT NULL | — | PK. 원본 Excel Lifetime 시트의 일련번호 |
| `serial` | `text` | NULL | — | 타이어 시리얼. FK 없음 |
| `scrap` | `text` | NULL | — | 폐기일. **`date`가 아닌 `text`** |
| `damage` | `text` | NULL | — | 손상 코드. `damage_codes`로의 FK 없음 |
| `install` | `text` | NULL | — | 최초 장착일. **`date`가 아닌 `text`** (`0003`에서 `'2026-04-01'` 형식 문자열로 입력) |
| `lifetime` | `numeric` | NULL | — | 수명 |
| `status` | `text` | NULL | — | 상태 |
| `note` | `text` | NULL | — | |

## 6. `public.tire_config` — 타이어 스펙 (단일 행)

PK: `id` · CHECK `id = 1` (싱글턴)

| 컬럼 | 타입 | NULL | 기본값 |
|---|---|:--:|---|
| `id` | `integer` | NOT NULL | `1` |
| `brand` | `text` | NULL | — |
| `type` | `text` | NULL | — |
| `size` | `text` | NULL | — |
| `tubetype` | `text` | NULL | — |
| `new_tread` | `numeric` | NULL | — |
| `capacity` | `numeric` | NULL | — |
| `tread_caution` | `numeric` | NULL | — |
| `tread_order` | `numeric` | NULL | — |
| `tread_critical` | `numeric` | NULL | — |
| `rec_psi_steer` | `numeric` | NULL | — |
| `rec_psi_drive` | `numeric` | NULL | — |

아래 5개 컬럼은 마이그레이션 `20260801120000_tire_config_thresholds.sql` 에서 추가되었습니다
(운영 기준값을 코드 상수에서 DB로 이관 — 결정 X-6). 초기값은 `id = 1` 행에 대해
`10 / 5 / 3 / 100 / 116`. NULL 이면 프론트엔드가 동일한 폴백값으로 동작합니다.

| 컬럼 | 의미 |
|---|---|
| `tread_caution` | 이 값 **미만**이면 황색(주의). 초기 10 mm |
| `tread_order` | 이 값 **미만**이면 주황 — **교체 타이어 발주 트리거**. 초기 5 mm |
| `tread_critical` | 이 값 **미만**이면 적색 — 즉시 교체. 초기 3 mm |
| `rec_psi_steer` | 조향축(L1·R1) 권장 공기압. 초기 100 psi |
| `rec_psi_drive` | 구동축(그 외 8본) 권장 공기압. 초기 116 psi |

CHECK 제약 2개가 함께 추가됩니다.

- `tire_config_tread_order_check` — `tread_critical < tread_order < tread_caution` (셋 다 NOT NULL 인 경우).
  경계가 뒤집히면 신호등이 무의미해지므로 순서를 강제합니다.
- `tire_config_psi_range_check` — `rec_psi_steer`·`rec_psi_drive` 각각 60 ~ 200 psi.

RLS: `UPDATE` 는 `inspector`·`admin` 에 허용되어 있으므로 관리자가 화면에서 조정할 수 있습니다.

## 7. `public.damage_codes` — 손상 코드

PK: `code`

| 컬럼 | 타입 | NULL | 기본값 |
|---|---|:--:|---|
| `code` | `text` | NOT NULL | — |
| `description` | `text` | NULL | — |
| `seq` | `integer` | NULL | — |

---

## 8. `public.audit_log` — 데이터 변경 이력

PK: `id` · 추가: `20260801100000_t101_correct_outliers.sql` (T-101) · 프로덕션 적용 2026-08-01

| 컬럼 | 타입 | NULL | 기본값 |
|---|---|:--:|---|
| `id` | `bigint` | NOT NULL | `nextval('audit_log_id_seq')` |
| `table_name` | `text` | NOT NULL | — |
| `record_pk` | `jsonb` | NOT NULL | — |
| `old_value` | `jsonb` | NULL | — |
| `new_value` | `jsonb` | NULL | — |
| `actor` | `uuid` | NULL | — |
| `actor_email` | `text` | NULL | — |
| `source` | `text` | NOT NULL | — |
| `note` | `text` | NULL | — |
| `changed_at` | `timestamptz` | NOT NULL | `now()` |

`old_value`·`new_value`에는 **변경된 컬럼만** 담습니다. `actor`는 마이그레이션으로 수행한 변경에서는 NULL입니다.
`source`는 변경 경로를 남깁니다 (`migration:<version>` · 이후 T-103에서 트리거 경로 추가).

RLS 정책은 다른 테이블과 다릅니다 — **`SELECT`는 `admin`만** 가능하며 클라이언트 쓰기 정책은 없습니다.
전 이력이 고객사 계정에 노출되는 것을 막기 위한 것으로, §11의 `public` 전면 허용 패턴을 의도적으로 따르지 않았습니다.

T-103에서 트리거 기반 자동 기록과 나머지 테이블로의 확장을 수행합니다.

---

## 9. 제약조건 현황

| 테이블 | 제약 | 정의 |
|---|---|---|
| `inspections` | `inspections_pkey` | `PRIMARY KEY (id)` |
| `vehicles` | `vehicles_pkey` | `PRIMARY KEY (ch)` |
| `vehicle_positions` | `vehicle_positions_pkey` | `PRIMARY KEY (ch, pos)` |
| `vehicle_positions` | `vehicle_positions_ch_fkey` | `FOREIGN KEY (ch) REFERENCES vehicles(ch) ON DELETE CASCADE` |
| `replacements` | `replacements_pkey` | `PRIMARY KEY (id)` |
| `lifetimes` | `lifetimes_pkey` | `PRIMARY KEY (no)` |
| `tire_config` | `tire_config_pkey` / `tire_config_singleton` / `tire_config_tread_order_check` / `tire_config_psi_range_check` | `PRIMARY KEY (id)` / `CHECK (id = 1)` / 임계치 순서 / psi 범위 |
| `damage_codes` | `damage_codes_pkey` | `PRIMARY KEY (code)` |

**측정 테이블에는 CHECK 제약이 하나도 없습니다.** `pressure`·`tread`·`hm`·`km` 값 검증 부재 = P-2 (T-102에서 해소).
`tire_config` 의 4개 제약(싱글턴 + 임계치 순서 + psi 범위)이 현재 유일한 CHECK 입니다.

## 10. 인덱스 현황

| 테이블 | 인덱스 | 정의 |
|---|---|---|
| `inspections` | `inspections_ch_date_pos_uniq` | `UNIQUE (ch, inspection_date, pos)` |
| `inspections` | `inspections_ch_date_idx` | `(ch, inspection_date DESC)` |

---

## 11. RLS 정책 현황

모든 7개 테이블에서 RLS가 활성화되어 있으며, 정책 형태는 전 테이블 동일합니다
(`0006_rls_read_anon_write_auth.sql` → `0007_rls_role_based.sql` → `0010_rename_roles.sql`).

| 동작 | 대상 역할 | 조건 |
|---|---|---|
| `SELECT` | `public` | `true` — **무조건 허용** |
| `INSERT` | `authenticated` | `app_role() IN ('inspector','admin')` |
| `UPDATE` | `authenticated` | `app_role() IN ('inspector','admin')` |
| `DELETE` | `authenticated` | `app_role() = 'admin'` |

역할은 `auth.users.app_metadata.role`에 저장되고 `public.app_role()`이 읽습니다.
`app_role()`은 구 값을 정규화합니다: `staff` → `inspector`, `user` → `viewer`, 미지정 → `viewer`.

---

## 12. 작업지시서 §1.3 문제점 대조

| # | 지시서의 문제 진술 | 실제 확인 결과 |
|---|---|---|
| P-1 | `inspections`에 UNIQUE 제약 없음 | **이미 해결됨.** `inspections_ch_date_pos_uniq`가 `(ch, inspection_date, pos)`에 존재 (`0001`). T-102의 `uq_inspection` 추가는 중복이므로 재검토 필요 |
| P-2 | 값 검증 없음 | **유효.** `pressure`·`tread`·`hm`·`km` CHECK 제약 없음 |
| P-3 | 더미 데이터 혼입 | T-002에서 실측 검증 |
| P-4 | 타이어 이력 구조 파탄 | **유효.** `serial`/`serial2` 2열 구조 유지 중 |
| P-5 | 감사 추적 불가 | **부분 해결.** `inspections`만 `created_at/by`·`updated_at/by` 보유. 나머지 6개 테이블은 감사 컬럼 없음 → T-103 범위 |
| P-6 | 권한 분리 없음 | **부분 해결.** 3개 역할(`admin`/`inspector`/`viewer`) 운영 중. 지시서 T-301의 4개 역할·`user_profiles`·`customer_code` 체계와 불일치 |
| P-7 | 마이그레이션 미사용 | **해결됨.** `0001`~`0010` 존재 |

## 13. 확인 필요 사항

1. **`SELECT`가 `public` 역할에 무조건 허용되어 있습니다.** `anon` 키는 클라이언트 번들에 포함되어 공개 배포되므로, 현재 전 데이터가 사실상 공개 상태입니다. D-1(고객사 제공)에서 `customer_viewer`의 "자사 외 차량 0건 반환"(T-302 완료 조건)을 만족하려면 이 정책을 반드시 교체해야 합니다. **`finance` 스키마에는 이 패턴을 적용하지 않습니다.**
2. **`lifetimes.install` / `lifetimes.scrap`이 `date`가 아닌 `text`입니다.** 날짜 연산·정렬이 문자열 기준으로 동작합니다. 타입 변경은 §3.1-4(컬럼 삭제 금지)에 저촉되지 않으므로 Phase 1에서 처리 가능하나, 값 형식이 전 행 `YYYY-MM-DD`인지 T-002에서 확인이 필요합니다.
3. **`replacements`·`inspections`에 `(ch, pos)` FK가 없습니다.** T-102 부록 A 대상이며, T-002에서 고아 레코드를 먼저 확인해야 제약 추가가 실패하지 않습니다.
