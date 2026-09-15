# 타이어 데이터 모델 — 뷰·트리거 규약

최종 갱신: 2026-08-27
근거: `docs/SAMTAN_TMS_작업지시서_v1.md` (데이터 정합성 개선 v1) Phase 1~3
      / `samtan_tms_작업지시서_v3.md` (원시 측정값 보존 + 마모 통계 KPI) Phase C~E
적용 마이그레이션: `20260826035500` · `20260826035542` · `20260826035625` · `20260826035648`
      / `20260826150000` ~ `20260826156000` (§8 트레드 원시값 계층)
      / `20260827200000` (2026-08-09·08-23 회차 적재) · `20260827201000` (4점 소급 백필)

---

## 0. 배경 — 왜 이 구조가 필요했나

2026-08-18 Techking 현장(Bpk. Irawan)에서 "타이어 이력이 조회되지 않는다"는 보고가 들어왔다.
원인은 데이터가 아니라 구조였다.

- `lifetimes` (수명 원장) · `vehicle_positions` (현재 장착) · `replacements` (교체이력) 세 테이블이
  각자의 진실을 들고 있었고, 셋을 맞추는 것은 **사람이 손으로 쓰는 SQL 한 줄**이었다.
- `vehicle_positions` 의 시리얼 칸은 `serial`(최초) · `serial2`(최신 교체분) **2개뿐**이라
  같은 포지션을 3번째로 교체하면 중간 시리얼이 밀려나 사라졌다.
  실증 사례: `CH 835 L3 Out` 의 `DA12511H03159D` (2026-06-28 장착 → 2026-07-12 탈거).

이 문서는 그 수작업을 없앤 뒤의 규약을 기록한다.
**단일 진실원은 `replacements` + `vehicle_positions.serial`(최초 장착)이며,
현재 장착 시리얼은 계산 결과(`v_current_tire`)이지 저장된 값이 아니다.**

---

## 1. 뷰 5종

모두 `security_invoker = on` 으로 만들어져 호출자의 RLS를 그대로 탄다.
`anon` · `authenticated` 에 `SELECT` 권한이 있다.

| 뷰 | 목적 | 사용처 |
|---|---|---|
| `v_current_tire` | (ch, pos) 별 **현재 장착 시리얼**. 최신 교체분이 있으면 그것, 없으면 최초 장착분 | `src/data/loadData.ts` → `TirePosition.serial` / `serialInitial` / `replCount` / `mountedAt` |
| `v_position_history` | 포지션별 **시리얼 이력 전체**. `seq_no` 0 = 최초 장착, 1..n = 교체 회차. 개수 제한 없음 | `src/data/loadData.ts` → `TirePosition.chain` → `src/components/SerialChain.tsx` (A → B → C 체인 렌더) |
| `v_tire_mount_history` | 시리얼 관점의 장착·탈거 구간 (`lead()` 로 `removed_at` · `is_current` 산출) | SQL 분석용. 프론트는 같은 계산을 `tmsUtils.mountSpansOf()` 로 클라이언트에서 수행 |
| `v_tire_detail` | 시리얼 1건 상세. **`lifetimes` 에 행이 없어도 결과가 나온다** — 시리얼 집합을 포지션 이력·`lifetimes`·`inspections` 의 UNION 으로 만들고 `is_registered` 로 등록 여부를 표시 | `src/api/tires.ts::getTireDetail()` → `src/components/TireDetailCard.tsx` |
| `v_data_integrity` | 정합성 점검 5종을 `check_key` / `severity` / `cnt` / `detail(jsonb)` 로 반환 | `check_data_integrity()` RPC 경유 → `src/components/IntegrityBadge.tsx` |

### 1.1 정합성 점검 항목과 severity

| `check_key` | severity | 의미 |
|---|---|---|
| `missing_lifetime` | `error` | 장착 중인데 수명 DB(`lifetimes`)에 행이 없다 |
| `serial2_out_of_sync` | `error` | 캐시 컬럼 `serial2` 가 최신 교체분과 다르다 (트리거 미동작 신호) |
| `install_but_unmounted` | `warning` | 상태가 `Install` 인데 어느 포지션에도 달려 있지 않다 |
| `mounted_but_not_install` | `warning` | 장착 중인데 상태가 `Install` 이 아니다 |
| `position_over_2_serials` | `info` | 교체 2회 이상인 포지션 — 옛 2칸 구조로는 담기지 못했던 대상 |

**배지 색은 `severity = 'error'` 합계로만 정한다.** `warning` · `info` 는 펼침 목록에만 나온다.
`install_but_unmounted` 2건(`no.20 DA1BFANH05095D`, `no.72 DA1BFBPH02426D`)은
Techking 회신 대기 중인 **원장 오류**라, 이것 때문에 배지가 상시 주황으로 물들면 안 되기 때문이다.

---

## 2. 트리거 4종과 실행 순서

`replacements` 에 교체를 한 건 넣으면 아래가 자동으로 돈다. 사람이 손댈 것은 없다.

| 순서 | 트리거 | 시점 | 함수 | 하는 일 |
|---|---|---|---|---|
| 1 | `trg_replacements_a_ensure_lifetime` | AFTER INSERT/UPDATE | `ensure_lifetime_row()` | 새 시리얼의 `lifetimes` 행을 없으면 만든다 (`status='Install'`, `install`=교체일) |
| 2 | `trg_replacements_b_retire_prev` | AFTER INSERT | `retire_previous_tire()` | 탈거된 구 시리얼을 `Install` → `Spare` 로 내린다 |
| 3 | `trg_replacements_c_sync_position` | AFTER INSERT/UPDATE/DELETE | `sync_position_current_serial()` | `vehicle_positions.serial2` 캐시를 최신 교체분으로 덮는다 |
| — | `trg_vehicle_positions_ensure_lifetime` | AFTER INSERT | `ensure_lifetime_row()` | 신규 차량 등록(10 포지션 INSERT) 시에도 `lifetimes` 행 확보 |

### 2.1 `a_` / `b_` / `c_` 접두어 — 바꾸지 말 것

PostgreSQL 은 **같은 시점의 트리거를 이름 알파벳순으로** 실행한다.
접두어는 그 순서를 고정하기 위한 것이며 장식이 아니다.

핵심은 **`b_retire` 가 `c_sync` 보다 먼저** 돌아야 한다는 점이다.
`retire_previous_tire()` 는 `v_current_tire` 를 읽어 "구 타이어가 **다른** 포지션에 장착돼 있는가"를 본다.
로테이션(같은 타이어를 다른 자리로 옮겨 다는 것)으로 아직 현역인 타이어를 `Spare` 로 잘못 내리지 않기 위해서다.
이름을 바꿔 순서가 흐트러지면 이 판단이 깨진다.

### 2.2 함수의 안전 규약

- 세 함수 모두 `SECURITY DEFINER ... SET search_path = public` — RLS 우회 경로가 search_path 조작으로 오염되지 않게 고정한다.
- `sync_position_current_serial()` 은 `is distinct from` 으로 걸러 **값이 같으면 UPDATE 자체를 하지 않는다.**
  불필요한 `audit_log` 잡음과 `updated_at` 갱신을 막는다.
- `retire_previous_tire()` 는 `status = 'Install'` 인 행만 내린다. `Scrap` · `Not Install` 은 덮어쓰지 않는다.
- `ensure_lifetime_row()` 의 `ON CONFLICT (serial) WHERE serial IS NOT NULL` 에서
  `WHERE` 절은 생략할 수 없다 — 대상 인덱스 `lifetimes_serial_uniq` 가 **부분 유니크 인덱스**이고,
  Postgres 는 추론식에 동일한 술어를 함께 써야 매칭한다.

---

## 3. `vehicle_positions.serial2` 는 deprecated 다

`serial2` 는 **더 이상 진실원이 아니다.** `trg_replacements_c_sync_position` 이 유지하는 **캐시 컬럼**이며,
컬럼 주석에도 그렇게 적혀 있다.

- 컬럼은 **삭제하지 않는다** (CLAUDE.md 절대 금지 4). 무중단 전환과 대조 검증을 위해 남긴다.
- **프론트엔드 코드는 `serial2` 를 읽지 않는다.** 현재 장착 시리얼은 `v_current_tire.serial`,
  이력은 `v_position_history` 를 쓴다.
- `serial2` 의 존재 의의는 이제 하나뿐이다 — `serial2_out_of_sync` 점검으로
  **트리거가 실제로 돌고 있는지 감시하는 것**.

`serial`(최초 장착) 컬럼은 여전히 유효한 원본 데이터이며 `v_position_history` 의 `seq_no = 0` 행이 된다.

---

## 4. `lifetimes.install` = 최초 투입일

`install` 은 그 타이어가 **신품으로 처음 투입된 날**이다.

- 로테이션으로 장착 위치가 바뀌어도 **갱신하지 않는다.**
- 위치 이동 이력이 필요하면 `v_position_history` / `v_tire_mount_history` 를 본다.
  프론트에서는 `tmsUtils.tireMovements()` 가 같은 정보를 만든다.
- 타입이 `date` 가 아니라 `text('YYYY-MM-DD')` 라 트리거도 `to_char()` 로 맞춰 넣는다.

---

## 5. 프론트엔드 조회 규약

```
v_current_tire     ─┐
v_position_history ─┼→ loadData()  → TMS_DATA.units[].positions[]  (전 탭이 이 싱글턴을 읽는다)
vehicle_positions  ─┘   (remark 만)
        └ .serial        현재 장착 시리얼
        └ .serialInitial 최초 장착 시리얼
        └ .replCount     교체 횟수 (0 = 최초 타이어 그대로)
        └ .chain[]       시리얼 이력 전체 (SerialChainEntry)

v_tire_detail          → api/tires.getTireDetail()   → TireDetailCard
check_data_integrity() → api/tires.checkDataIntegrity() → IntegrityBadge
```

- **교체 여부 판정**은 `replCount > 0` 으로 한다. 시리얼 두 칸을 비교하지 않는다.
- **시리얼 체인 표시**는 `SerialChain` 컴포넌트가 담당한다. 2개 고정이 아니라 N개이며,
  각 화살표 아래에 그 다음 타이어의 교체일이 붙는다.
- **장착 구간 계산**(`lifeCalc` · `latestTreadOf` · `tireHistory`)은 `tmsUtils.mountSpansOf()` 가 만드는
  `[from, to)` 구간으로 회차를 거른다. 옛 코드처럼 "첫 교체일 이전 / 내 교체일 이후" 로 나누지 않으므로
  **중간 회차 타이어의 측정값도 정확히 분리된다.**
- **미등록 시리얼**(수명 DB에 행이 없는 경우)도 `v_tire_detail` 이 행을 돌려준다.
  `is_registered = false` 면 장착 정보 자리는 `—` 로 비우고 점검 이력으로 대체 표시한다.

---

## 6. 월간 점검 데이터 반영 절차 — 변경점

월간 반영 스크립트(`samtan_update_20260705.sql` 계열)의
**`[3-1] serial2 수동 UPDATE 블록`은 더 이상 실행하지 않는다.**
`trg_replacements_c_sync_position` 이 같은 일을 자동으로 한다.

수동 UPDATE 를 남겨두면 트리거와 이중으로 돌아 `audit_log` 에 잡음이 쌓이고,
`serial2_out_of_sync` 점검이 감시해야 할 신호(트리거 미동작)를 가려버린다.

> 해당 스크립트 파일은 이 저장소에 커밋돼 있지 않다(로컬/SQL 에디터 보관).
> 다음 월간 반영 때 `[3-1]` 블록을 지운 뒤 사용할 것.

같은 이유로 **교체 발생 시 `lifetimes` 에 행을 손으로 추가하는 작업도 필요 없다.**
`replacements` 에 INSERT 하는 것으로 끝난다.

---

## 7. 되돌리기

각 마이그레이션 파일 하단에 `-- ROLLBACK:` 블록으로 역DDL 이 들어 있다.
트리거(M3)를 되돌리면 월간 스크립트의 `serial2` 수동 UPDATE 블록을 **되살려야 한다.**

---

## 8. 트레드 원시값 계층 — `tread_points` 가 정본이다

근거: `samtan_tms_작업지시서_v3.md` Phase C·D / 마이그레이션 `20260826150000` ~ `20260826156000`

### 8.1 왜 바꿨나

현장은 타이어 1본당 **폭 방향 4점**(KIRI / TENGAH 1 / TENGAH 2 / KANAN)을 잰다.
그런데 기존 구조는 그중 **최소값 1개만** `inspections.tread` 에 넣고 나머지 3개를 버렸다.
버려진 3개가 없으면 마모 균일성(CV)·편마모(S/C·O/I)·중앙마모를 계산할 방법이 아예 없다.

### 8.2 정본과 파생 캐시

| 계층 | 대상 | 성격 |
|---|---|---|
| 정본 | `tread_points` (long format: 점검 × `circ_pos` × `width_pos` = 1행) | 원시 측정값. 수정·삭제 금지 |
| 파생 캐시 | `inspections.tread` · `tread_avg` · `tread_max` · `tread_range` · `tread_sd` · `tread_cv` · `shoulder_avg` · `center_avg` · `outboard_avg` · `inboard_avg` · `point_count` | 트리거가 채운다. 손으로 쓰지 말 것 |

`inspections.tread*` 에 직접 UPDATE 하면 다음 저장 때 트리거가 덮어쓴다.
값을 고치려면 `tread_points` 를 고쳐야 한다.

원시값을 잘못 넣었을 때는 **행을 지우지 않는다.** `deleted_at` 을 채우고 새 행을 넣거나,
통계에서만 빼려면 `flag = 'OUTLIER'` + `flag_note`(사유) 를 기록한다 (설계서 §15).
`OUTLIER` 행은 보존되지만 통계 집계에서 제외된다.

**2026-08-27 소급 백필 완료 — 이제 전 548행이 4점을 갖는다.**
2026-08-09 이전 410행은 오랫동안 최소값 1개만 남아 있었으나, 원장 엑셀에 4점 원시값이
그대로 보존되어 있는 것이 확인되어 `tread_points` 로 전량 복원했다
(마이그레이션 `20260827201000_backfill_tread_points.sql` · 410행 · 1,640점).

백필은 **점을 추가했을 뿐 기존 값을 하나도 바꾸지 않았다.** 적재 경로인
`save_inspection_with_points()` 는 upsert 라 넘긴 값으로 덮어쓰므로, 원장 값이 아니라
**DB 가 그때 들고 있던 `serial`·`pressure`·`hm`·`remark`·`driver` 를 그대로 되돌려 주는**
방식을 썼다. 그래서 "안 바뀐다" 가 규칙이 아니라 구조다. 유일한 예외는 CH 834 의
2026-07-26 `km` 이며 근거는 §8.10 이다.

각 행마다 **원장 4점의 최소값이 DB 의 기존 `tread` 와 같은지 먼저 확인**하고, 다르면
그 차량 블록 전체를 예외로 중단시켰다. 트리거가 `tread` 를 4점 최소값으로 다시 쓰기
때문에, 이 확인이 없으면 백필이 조용히 판정값을 바꿀 수 있었다.
회차별 `(ch, date, count, sum(tread), md5(pos:serial))` 41행이 지시서 §B-2 기준표와
전량 일치함을 백필 후 재확인했다.

소급 **추정** 입력은 여전히 금지다. 여기서 넣은 값은 추정이 아니라 원장 실측이다.

### 8.3 최소값 = 운용 판정 / 평균 = 성능 비교 (이원 기준)

| 기준 | 값 | 쓰는 곳 |
|---|---|---|
| **최소값** `inspections.tread` | 4점 중 가장 얕은 곳 | 신호등 판정 · 발주(5.0 mm) · 교체(3.0 mm) 임계 |
| **평균** `tread_avg` | 4점 평균 | Wear Rate · 타이어 간 성능 비교 |

가장 얕은 그루브가 타이어의 수명을 결정하므로 **운용 판정은 끝까지 최소값 기준이다.**
`inspections.tread` 의 의미를 평균으로 바꾸거나 5.0 / 3.0 mm 임계를 평균 기준으로
전환하면 운용 판정이 전부 어긋난다. 반대로 마모속도를 최소값으로 재면 과대계산된다.

### 8.4 폭 방향 매핑 — 열 순서는 확정, 차량 기준 방향은 **미확정**

| 코드 | 현장 표기 | 차량 기준 방향 | 성격 |
|---|---|---|---|
| `L` | Kiri | **미확정** | Shoulder |
| `C1` | Tengah 1 | 중앙 1 | Center |
| `C2` | Tengah 2 | 중앙 2 | Center |
| `R` | Kanan | **미확정** | Shoulder |

**확정된 것** — 기록지·화면·DB 세 곳의 열 순서(`Kiri → Tengah 1 → Tengah 2 → Kanan`)와
숄더/센터 구분. 이건 뒤집기 금지다.

**미확정인 것** — `Kiri`/`Kanan` 이 차량 기준 **외측(Luar)/내측(Dalam)** 중 어느 쪽인지
(v3 §Q1, 사용자 결정 2026-08-27: **보류**). 현장이 타이어를 바라보는 방향이 좌측 휠과
우측 휠에서 같은지 다른지가 확인되지 않았다. 좌우 휠이 서로 반대라면
`Kiri` 는 좌측 휠에서 외측, 우측 휠에서 내측이 되어 `outboard_avg` 의 의미가 뒤집힌다.

그래서 **`outboard_avg` · `inboard_avg` · `oi_ratio` · `lateral_pattern` 은 화면에 노출하지
않는다.** 컬럼과 뷰는 그대로 두되(값이 남아 있어야 확정 후 재계산이 가능하다) 읽지 않는다.
`shoulder_avg` / `center_avg` / `sc_ratio` 는 좌우 구분과 무관하므로 **영향 없이 그대로 쓴다** —
§0.3 의 중앙 마모 실증도 여기에 기댄다.

**확정되면 고칠 지점** (전부, 빠짐없이):

| 지점 | 내용 |
|---|---|
| 이 절 (§8.4) | 방향 표를 확정값으로 채우고 "미확정" 문구 삭제 |
| `recalc_inspection_tread_stats()` | `outboard_avg`/`inboard_avg` 의 `L`·`R` 할당. 뒤집힌다면 전 548행 재계산 필요 |
| `v_wear_pattern` | `oi_ratio` · `lateral_pattern` 산식 |
| `src/lib/treadStats.ts` | `oiPattern()` 의 인자 순서 |
| `src/components/WearAnalysisTab.tsx` | O/I 카드 주석 해제 (현재 `v3 §Q1` 주석으로 차단) |
| `src/components/InspectionTab.tsx` | O/I 배지 주석 해제 |
| `src/i18n/index.tsx` | `pattern.outboard` · `pattern.inboard` 의 DEPRECATED 주석 해제 |
| `docs/현장기록지_트레드4점_v2.html` | `Kiri (Luar)` · `Kanan (Dalam)` 병기의 정오 확인 |

현행 산식은 `outboard_avg` = `L` · `inboard_avg` = `R` 이지만 **이 할당 자체가 미검증이다**.
`shoulder_avg` = (`L` + `R`) ÷ 2 · `center_avg` = (`C1` + `C2`) ÷ 2 는 좌우 합이라 안전하다.

### 8.5 통계 산식과 반올림 순서

- **표준편차는 표본(n−1)** — `stddev_samp`. 모집단 SD(`stddev_pop`) 금지.
- 반올림 순서를 지켜야 클라이언트 미리보기와 DB 값이 갈리지 않는다:
  `avg = round(mean, 2)` → `sd = round(stddev_samp, 3)` →
  **`cv = round(sd_반올림 / avg_반올림 × 100, 1)`** (원값이 아니라 이미 반올림된 값으로 나눈다)
- 검산표 — 입력 `12.4 / 9.8 / 10.1 / 12.9` → avg `11.30` · min `9.80` · max `12.90` ·
  range `3.10` · sd `1.577` · cv `14.0%` · shoulder `12.65` · center `9.95`.
  `src/lib/treadStats.ts` 가 이 순서를 그대로 복제한다.

### 8.6 마모 KPI 뷰 5종

전부 `security_invoker = on`, `anon`·`authenticated` SELECT 허용.

| 뷰 | 내용 |
|---|---|
| `v_tread_series` | 점검 시계열 + **시리얼 세그먼트 번호(`seg_no`)**. 모든 마모 KPI의 공통 기반 |
| `v_wear_interval` | 인접 회차 구간 마모. Δkm ≥ 3,000 구간만 `wear_rate_km` 산출 |
| `v_wear_rate_segment` | 세그먼트 대표값 — **OLS 기울기 × (−1,000)**, R² 병기 |
| `v_cv_benchmark` | 점검일별 CV 중앙값·P90 |
| `v_wear_pattern` | 편마모 S/C · O/I |
| `v_tire_comparison` | 4개 평가축 분리 비교 |

**세그먼트 규칙** — 마모 KPI 는 반드시 `(ch, pos, seg_no)` 단위로 계산한다.
시리얼이 바뀌면 `seg_no` 가 올라간다. 교체 전후 타이어를 한 선으로 이으면
트레드가 올라가는 것처럼 보인다. 차트도 세그먼트마다 선을 끊는다.

**Wear Rate 규칙** — 보고서 대표값은 구간차가 아니라 **세그먼트 OLS 회귀 기울기**이며
**R² 를 반드시 병기한다** (권장 신뢰 기준 R² ≥ 0.80). 측정점 3회차 미만이면 산출하지 않는다.
`regr_slope(tread_avg, km)` 의 인자 순서는 (종속, 독립)이다 — 뒤집기 금지.

**S/C Ratio 규칙** — 깊이의 비가 아니라 **마모량의 비**다 (설계서 §11).

```
S/C = (기준 shoulder_avg − 현재 shoulder_avg) ÷ (기준 center_avg − 현재 center_avg)
```

기준점(Initial)은 세그먼트의 첫 측정 회차다.
**분모(Center Wear)가 `wear_min_mm`(초기값 0.5 mm) 미만이면 판정을 보류(`insufficient`)한다** —
측정오차와 구분이 안 되는 구간에서 비율을 내면 값이 폭주한다. O/I 도 같은 규칙이다.

임계값 `sc_ratio_upper`(1.150) · `sc_ratio_lower`(0.870 = 1 ÷ 1.150) · `wear_min_mm`(0.5)은
**`tire_config` 가 정본**이다. 코드에 상수로 박지 말고 뷰와 `wearPatternThresholds()` 를 경유한다.

### 8.7 아직 정하지 않은 것

- **CV 합격 기준은 미설정 상태다.** 데이터가 쌓인 뒤 내부 기준을 세운다 (설계서 §10).
  현재 화면은 플릿 중앙값 대비 위치만 참고로 보여 주며, 합격/불합격을 표시하지 않는다.
- S/C·O/I 의 1.150 / 0.870 도 잠정값이다.
- **4개 평가축(마모성능·균일성·편마모·내구성)을 가중합한 단일 종합점수는 만들지 않는다** (설계서 §16).

### 8.8 저장 경로

화면은 `inspections` 에 직접 UPSERT 하지 않고 RPC 를 쓴다.

| 함수 | 용도 |
|---|---|
| `save_inspection_with_points(...)` | 포지션 1개 저장. 측정점은 **0·4·16점만** 허용 |
| `save_inspection_round_with_points(...)` | 한 회차(차량·점검일) 전체를 **한 트랜잭션**으로 저장 |

한 포지션이라도 검증에 걸리면 회차 전체가 롤백되어 부분 저장이 남지 않는다.
검증 규칙 3가지: ① 측정점 개수 0·4·16 ② 0점 입력은 `tread_status` 를 `measured` 가 아닌
값으로 지정해야 함 ③ `OUTLIER` Flag 는 `flag_note` 필수.
회차에서 빠진 측정점(16점 → 4점 축소 등)은 하드 삭제가 아니라 `deleted_at` 으로 남는다.

### 8.9 현장 기록지 — 화면·DB 와 같은 순서를 쓴다

기록지 개정 2판: [`현장기록지_트레드4점_v2.html`](현장기록지_트레드4점_v2.html) (A4 가로 인쇄용).
근거는 [`실차보고서_14.00R24_개정_20260826.md`](실차보고서_14.00R24_개정_20260826.md) 부록 A·§7.

| 기록지 열 | 화면 열 | DB |
|---|---|---|
| Kiri (Luar) | Kiri | `tread_points.width_pos = 'L'` |
| Tengah 1 | Tengah 1 | `'C1'` |
| Tengah 2 | Tengah 2 | `'C2'` |
| Kanan (Dalam) | Kanan | `'R'` |

세 곳의 순서가 같아야 전사(轉寫) 오류가 안 난다. 한쪽만 바꾸지 말 것 — §8.4 규약과 함께 고정이다.

기록지 Flag 범례는 현장이 적을 수 있는 6종(`OK` `CHECK` `DAMAGE` `PRESSURE` `LOAD` `OTHER`)만
싣는다. `OUTLIER` 는 관리자 사후 판정이라 현장 범례에서 뺐고(입력 화면도 관리자만 선택 가능),
`POSITION` 은 장착 위치 오기재를 입력 단계에서 잡는 코드라 기록지에는 없다.
`tread_points.flag` 체크 제약은 설계서 §15 대로 8종을 그대로 유지한다.

**4칸 전부 기입 또는 전부 공란** — 기록지 §7-1, 화면 저장 차단, RPC 의 `0·4·16점` 검증이
같은 규칙의 세 겹이다. 측정 불가 시 `0` 을 적지 않는다(0 은 실측 0 mm 를 뜻한다).

### 8.10 CH 834 의 KM — 리셋 카운터를 더해서 쓴다

CH 834 는 2026-06 중 계기판 KM 이 리셋되어 **0 부터 다시 셌다**. 현장 기록지에는
리셋 후 카운터 값이 그대로 적혀 있어, 원장 값을 곧이곧대로 넣으면 주행거리가
70만 km 대에서 1만 km 대로 급락한다. 마모속도(`wear_rate_km`)가 전 구간 무의미해진다.

**규칙 — 리셋 이후 회차의 KM = `736,453.0` + (기록지의 리셋 후 카운터)**

`736,453.0 km` 는 리셋 직전 마지막으로 확인된 누적 주행거리다.

| 회차 | 기록지 원본 | DB 저장값 | 비고 |
|---|---:|---:|---|
| 2026-07-26 | 10,599.7 | **747,052.7** | 소급 UPDATE 적용 (사용자 승인 2026-08-27, v3 §Q3) |
| 2026-08-09 이후 | 리셋 후 카운터 | `736,453.0 +` 카운터 | 적재 시점에 더해서 넣는다 |

`vehicles.km_reset` 이 이 차량의 리셋 사실을 들고 있다. **화면·뷰는 이 플래그를 보고
KM 급락을 이상치로 신고하지 않는다** — `v_data_quality` 의 `km_jump` 가 이것 때문에
상시 경고를 내지 않도록 하는 장치다.

원장 원본은 고치지 않는다(절대 금지 #5). 보정은 적재 시점에서만 한다.

### 8.11 `tread = 0` 은 미측정이 아니라 실측이다

`tread = 0` 인 행이 15건 있다. **이 값을 `not_measured` 로 바꾸지 않는다.**
근거는 4점 원시값이다 (v3 §0.3):

| ch | 회차 | pos | Kiri | Tengah 1 | Tengah 2 | Kanan |
|---|---|---|---:|---:|---:|---:|
| 834 | 07-26 | L2 In | 6.02 | **0** | **0** | 7.87 |
| 835 | 07-26 | L2 Out | 5.26 | **0** | **0** | 0 |

**어깨는 5~8 mm 남아 있는데 중앙 그루브만 0이다.** 측정을 못 한 것이 아니라
중앙부가 먼저 닳아 없어진 상태를 잰 것이며, Techking 이 주장한 "중앙부 급속 마모"의
직접 증거다. 0 mm 를 기록한 타이어가 이후 다른 차량으로 옮겨 계속 운용된 것도
이것으로 설명된다 — 최소값만 0이었을 뿐 어깨는 살아 있었다.

따라서 백필 후에도 이 15행의 `tread_status` 는 `measured` 가 정답이다.
전 548행이 `measured` 다.

화면 규약 (v3 §D-2): `tread = 0` 에 **"검증 필요" 배지를 붙이지 않는다.**
대신 `center_avg = 0 AND shoulder_avg > 0` 인 행에 **중앙 그루브 소진** 배지를 붙인다
(`pattern.center_zero` — `중앙 그루브 소진 / Alur tengah habis / Center groove worn out`).

**측정 불가와 실측 0 을 구분하는 방법**: 측정 불가는 4칸을 **전부 공란**으로 두고
`tread_status` 를 `measured` 가 아닌 값으로 지정한다. `0` 을 적으면 실측 0 mm 가 된다
(§8.9 · RPC 검증 규칙 ②).
