# 타이어 데이터 모델 — 뷰·트리거 규약

최종 갱신: 2026-08-26
근거: `docs/SAMTAN_TMS_작업지시서_v1.md` (데이터 정합성 개선 v1) Phase 1~3
적용 마이그레이션: `20260826035500` · `20260826035542` · `20260826035625` · `20260826035648`

---

## 0. 배경 — 왜 이 구조가 필요했나

2026-08-18 Techking 현장(Bpk. Irawan)에서 "타이어 이력이 조회되지 않는다"는 보고가 들어왔다.
원인은 데이터가 아니라 구조였다.

- `lifetimes` (수명 원장) · `vehicle_positions` (현재 장착) · `replacements` (교체 이력) 세 테이블이
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
