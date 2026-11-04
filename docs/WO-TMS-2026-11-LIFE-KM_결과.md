# WO-TMS-2026-11-LIFE-KM 결과 보고 — 수명 DB 주행 KM 과소 산출 수정

- 작성: 2026-11-04 · 코봇(구현) → 집사(총괄)
- 지시서: `docs/WO-TMS-2026-11-LIFE-KM.md` (2026-11-04 쎄오님 결정 반영본)
- 브랜치: `fix/life-km-first-mount` (PR #6 `feat/web-improvements-20261016` 위). **push · 머지 · prod 적용 안 함**

---

## 0. 결론

- T-1 ~ T-5 구현·로컬 커밋 완료. 마이그레이션 3건 **prod 적용 대기** (decisions M-13).
- 정적·로컬 검증: lint 오류 0 · tsc 오류 0 · vitest 18파일 121건 통과 · pgTAP t106 22/22 (로컬 PGlite).
- **막힘: prod 읽기 불가.** `.env` publishable 키는 익명(anon) 역할이라 RLS(20260906100000 익명 차단)로 모든 조회가 거부됨
  (`permission denied for view v_tire_mount_history`, `permission denied for table tire_config`). 로그인 자격증명도 없음.
  → §4 17본 **prod 대조 ±1 km 미실행**, §5 기준 3종 **비교표 미작성**, M-1 **21.5 허용 본수 미산출**. 수치를 지어내지 않았다.

## 1. 커밋

| 해시 | Task | 내용 |
|---|---|---|
| `6044e26` | T-1 | `v_tire_ledger` FIRST_NEW_INSPECTION |
| `fe04931` | T-2 · T-3 | `lifeCalc` 거리·회귀 점열 분리, 수명 종료 기준 3종 산출, 타입·적재, vitest |
| `3576b14` | T-3 | `tire_config.life_end_basis`, 설정 화면, 수명 DB 열 머리·각주·엑셀 비교 열 |
| `e90ab1e` | T-4 | 3 mm «권장 교체» 전 화면, `zero_tread_unverified` WARN |
| `49b4788` | §3 | pgTAP t106 |
| (T-5 커밋) | T-5 | decisions · 사용설명서 · CHANGELOG · 이 보고서 · `scripts/local-pglite-check.mjs` |

## 2. 새 마이그레이션

| 파일 | 내용 | 멱등 |
|---|---|---|
| `20261104100000_v_tire_ledger_first_mount.sql` | seq 0(`mounted_at` NULL) 구간: 같은 ch·pos 첫 측정 회차 `tread_avg >= new_tread` 이면 그 회차 km·hm 을 시작 경계로, `km_method = FIRST_NEW_INSPECTION`. 끝 경계·`km_flag` 식 불변. 컬럼 맨 뒤 `mounted_at_effective` · `start_inferred` 추가. `mounted_at` 원값 유지 | create or replace view · comment |
| `20261104110000_tire_config_life_end_basis.sql` | `life_end_basis text not null default 'min'` + check(`min`·`three_zero`·`four_zero`) | add column if not exists · constraint drop if exists → add |
| `20261104120000_dq_zero_tread_center_warn.sql` | `zero_tread_unverified` severity: 숄더 유효점 최소 > 0 · 센터 최소 = 0 → WARN, 그 외 ERROR. params 에 `shoulder_min`·`center_min`. 다른 규칙 불변 | create or replace view · alter view set |

- DROP TABLE / TRUNCATE / DROP COLUMN / DELETE 없음. 데이터(DML) 변경 없음.
- 뷰 컬럼은 맨 뒤 추가만 (v_tire_ledger 2열, v_data_quality 0열).
- **판단 1 — security_invoker 재설정:** `create or replace view` 는 reloptions 를 지정값으로 바꾼다(로컬에서 확인: 재정의 후 `reloptions` 비어 있음).
  20261104120000 은 `security_invoker = on` 을 다시 건다. 종전 20260829100000 은 20260906100000 이전이라 문제 없었다.
- **판단 2 — grant 대상:** 두 뷰 모두 `authenticated` 에만 grant. 20261016150000 이 `v_tire_ledger` 에 anon grant 를 다시 걸어 둔 것은 그대로(실노출 없음, M-16 질문).

### 로컬 적용 검증 (Docker 대체)

Docker 는 `seo` 가 docker 그룹이 아니어서 사용 불가(sudo 시도 안 함). 대신 **PGlite 0.5.15(WASM PostgreSQL 18.6)** 메모리 DB 에
저장소 마이그레이션 69건을 순서대로 적용했다 (auth·role 최소 스텁, prod 건수 전제 가드 3건은 건너뜀/notice — `scripts/local-pglite-check.mjs` 주석).

- 68/69 적용 (건너뛴 1건 = 데이터 전용 백필 20260827201000). 신규 3건을 **한 번 더** 적용 → 오류 없음(2회 적용 = 멱등).
- 의존 뷰 `v_tco_unit` · `v_tco_fleet` · `v_removal_analysis` · `v_data_quality` 조회 정상.
- pgTAP 1.3.3 SQL 을 로드해 `supabase/tests/t106_life_km_first_mount_test.sql` 실행 → **22/22 ok**.
  기존 t102 19/19 · t104 17/17 ok. t103 #23(점검자 삭제 RLS)·t105 는 PGlite 가 슈퍼유저 단일 사용자라 RLS 를 검증할 수 없음 —
  t103 #23 은 신규 마이그레이션 없이(UNTIL 20261018)도 같은 실패라 이번 변경과 무관.
- 한계: Supabase 실제 Postgres(15)·RLS·역할 환경이 아니다. `supabase test db` 정식 실행은 Docker 확보 후 필요.

## 3. 구현 요약

### T-1 (DB)
- 첫 측정 회차 = 그 시리얼(대문자·공백 제거 정규화 비교)이 같은 ch·pos 에서 처음 나온 `inspections` 행 (소프트 삭제 제외). 같은 날 여러 행이면 `tread_avg` 큰 쪽.
- 그 회차 `tread_avg` 가 NULL 이면 신품으로 보지 않는다(보수적). 그 회차 차량 km 가 없으면(CH 849 형) NO_KM 유지.
- `lifetimes.install_date`(seq 0 전부 2026-04-01 자리채움)는 쓰지 않았다.

### T-2 (Web, `src/data/tmsUtils.ts` `lifeCalc`)
- 거리: km 있는 모든 회차(트레드 무관). 원장 OK 구간이 없을 때의 폴백 끝 = 원장 `km_end`(≥ 마지막 회차 km 일 때), 장착 중이면 마지막 회차.
- 구간 원점: `measurable` 이면 `g.kmStart` 우선 — `mountedAt` 이 null 이어도 사용.
- `kmIsLowerBound` 식은 그대로 → FIRST_NEW_INSPECTION 으로 OK 가 되면 자동 false (vitest ① 확인).
- 회귀 점열: 최소 0 회차 유지, 단조 필터는 4점 평균(`treadAvg`, 없으면 최소값) 기준.
- 발주 예상(`projectReplacement`)은 **종전 점열 그대로**(최소 > 0 · 최소값 단조) — 범위 밖이라 바꾸지 않음.
- **판단 3 — 외삽 총량:** 종전 `주행 KM + 잔여` 는 마지막 측정 회차 이후 탈착까지 달린 거리를 잔여에 다시 더한다.
  `max(주행 KM, 마지막 측정점 누적 + 잔여)` 로 바꿨다. 장착 중 타이어는 (마지막 회차에 측정됐으면) 두 식이 같고, 폐기 타이어(화면에는 예상값 미표시)의 비교값만 과대가 사라진다.

### T-3 (Web + DB)
- `tire_config.life_end_basis` 기본 `min`. 관리 › 판정 기준 › «수명 종료 기준» 선택 (저장 시 확인 창, 기존 판정 기준과 같은 흐름).
- `lifeCalc` 가 세 기준을 모두 계산(`expectedByBasis`), 선택 기준을 `expectedKm`·`expectedHm` 에 → 예상 CPK(`tireCostOf`)·목표 달성 본수도 자동으로 같은 기준.
- 4점 기준: 4점 모두 있는 회차만, W-1 OUTLIER 회차는 0 하나를 빼고 순위. 4점 회차 2개 미만이면 비우고 «4점 측정 부족».
- 열 머리 «예상 KM (최소 0mm / 3점 0mm / 4점 0mm)», 각주에 현재 기준 설명. 엑셀에 «[비교]» 3열(기준 무관).
- `carcass_exposed` 추가 안 함 (M-2).

### T-4
- 3 mm 표시명 교체 위치: 대시보드(KPI 카드·차량별 표 열·알림 모달 제목·각주) · 배치도 범례 · 점검 입력 범례 · 추이 각주 · 상세 모달 ·
  수명 DB 각주 · 관리 판정 기준 · 알림 사유 문구(`getUnitAlerts` treadDanger). ko/id/en 전부. 내부 키 `danger`·임계값 불변.
  코드 주석의 «즉시 교체»(발주 기준선 이하 예측 설명)는 3 mm 명칭이 아니어서 그대로.
- `zero_tread_unverified`: 화면 집계 확인 — `IntegrityBadge` 는 `v_data_quality` 를 severity 와 무관하게 전부 «주의» 로 세고,
  배지 색(오류 건수)은 정합성 RPC 만 본다. **따라서 배지 오류/경고 숫자는 바뀌지 않는다.** severity 를 읽는 다른 화면 없음.
  배지 항목명·상세 문구를 «트레드 최소 0 — 센터 0·숄더 잔존 여부 확인» / 숄더·센터 최소값으로 갱신.

### T-5
- decisions: L-4 전제 대체 표기, **L-5**(FIRST_NEW_INSPECTION) · **L-6**(3 mm = 권장 교체) · **L-7**(수명 종료 정의, carcass 미추가) ·
  **L-8**(life_end_basis) · **L-9**(센터 0 WARN), 미결 **M-13 ~ M-16**.
- `LifeTab` foot9b·kmLowerTip(ko/id/en), 사용설명서 §3.5·§3.6·§3.10·§4, CHANGELOG.

## 4. §4 수용 표 17본 검증

| 시리얼 | 첫 km | 탈착 km_end | 현재 수명 DB (WO 기재) | 수정 후 (WO 기재) | 입력값 재현 (vitest) | prod 대조 |
|---|---:|---:|---:|---:|---:|---|
| DA1BFBPH02687D | 708,667.8 | 764,018.9 | 29,698 | 55,351.1 | 55,351.1 | 미실행 |
| DA12511H02845D | 708,667.8 | 754,285.2 | 29,698 | 45,617.4 | 45,617.4 | 미실행 |
| DA12511H03155D | 708,667.8 | 759,713.7 | 29,698 | 51,045.9 | 51,045.9 | 미실행 |
| DA1BFANH07452D | 708,667.8 | 754,285.2 | 44,489 | 45,617.4 | 45,617.4 | 미실행 |
| DA1BFANH10237D | 708,667.8 | 764,018.9 | 21,922 | 55,351.1 | 55,351.1 | 미실행 |
| DA12511H03162D | 423,771.8 | 428,647.0 | 37,030 | 41,905.0 | 41,905.0 | 미실행 |
| DA1BFANH05091D | 423,771.8 | 492,453.4 | 35,593 | 68,681.6 | 68,681.6 | 미실행 |
| DA12510H11571D | 423,771.8 | 451,255.6 | 36,872 | 64,356.0 | 64,356.0 | 미실행 |
| DA1BFANH04847D | 434,888.4 | 492,049.9 | 25,745 | 57,161.5 | 57,161.5 | 미실행 |
| DA1BFBPH02472D | 434,888.4 | 492,049.9 | 42,169 | 57,161.5 | 57,161.5 | 미실행 |
| DA12511H02833D | 423,771.8 | 492,453.4 | 35,593 | 68,681.6 | 68,681.6 | 미실행 |
| DA12511H03169D | 423,771.8 | 482,090.3 | 50,973 | 58,318.5 | 58,318.5 | 미실행 |
| DA1BFANH07563D | 434,888.4 | 487,912.4 | 35,183 | 53,024.0 | 53,024.0 | 미실행 |
| DA1BFANH07686D | 423,771.8 | 454,594.6 | 35,037 | 65,860.1 | 65,860.1 | 미실행 |
| DA1BFANH05096D | 434,888.4 | 494,256.4 | 25,745 | 59,368.0 | 59,368.0 | 미실행 |
| DA12511H03052D | 708,667.8 | 734,777.7 | 34,024 | 60,133.7 | 60,133.7 | 미실행 |
| DA1BFANH05052D | 423,771.8 | 487,187.4 | 35,593 | 63,415.6 | 63,415.6 | 미실행 |
| **평균** | | | **34,415** | **57,121** | **57,121** | |

- «입력값 재현» = WO 표의 첫 km · km_end 와, «이후 1구간» 5본은 `수정 후 − (km_end − 첫 km)` 로 역산한 이후 구간 km 를 원장 픽스처로 넣고
  `lifeCalc` 합산이 ±1 km 안에 드는지 본 것(`src/data/lifeCalc.firstMount.test.ts`, 17건 + 평균 통과). **합산 규칙의 산술 검증일 뿐 prod 원장 대조가 아니다.**
- 뷰 쪽(첫 신품 회차 판정·km 선택·끝 경계)은 pgTAP 픽스처(신품/중고/회차 없음/km 없음)로만 확인됨.
- **prod 대조 방법 (승인된 읽기 권한으로, 읽기 전용):** 아래 SELECT 는 새 뷰 없이 현재 prod 에서 «수정 후» 를 계산한다.

```sql
-- 읽기 전용. WO §4 «수정 후» = seq 0 첫 신품 회차 km → 원장 km_end + seq ≥ 1 구간 segment_km 합
with fi as (
  select distinct on (ch, pos, upper(regexp_replace(serial, '\s', '', 'g')))
         ch, pos, upper(regexp_replace(serial, '\s', '', 'g')) as sn,
         inspection_date as d, tread_avg
    from public.inspections
   where deleted_at is null and nullif(btrim(coalesce(serial, '')), '') is not null
   order by ch, pos, upper(regexp_replace(serial, '\s', '', 'g')), inspection_date, tread_avg desc nulls last
), rnd as (
  select ch, inspection_date, max(km) filter (where km > 0) as km
    from public.inspections where deleted_at is null group by ch, inspection_date
)
select l.serial, l.ch, l.pos, f.d as first_date, f.tread_avg, r.km as first_km, l.km_end,
       l.km_end - r.km as seq0_km,
       (select coalesce(sum(x.segment_km), 0) from public.v_tire_ledger x
         where x.serial = l.serial and x.seq_no >= 1 and x.km_flag in ('OK', 'APPROX')) as later_km,
       l.km_end - r.km + (select coalesce(sum(x.segment_km), 0) from public.v_tire_ledger x
         where x.serial = l.serial and x.seq_no >= 1 and x.km_flag in ('OK', 'APPROX')) as after_fix
  from public.v_tire_ledger l
  join fi f on f.ch = l.ch and f.pos = l.pos and f.sn = upper(regexp_replace(l.serial, '\s', '', 'g'))
  left join rnd r on r.ch = l.ch and r.inspection_date = f.d
 where l.seq_no = 0 and l.mounted_at is null
   and l.serial in ('DA1BFBPH02687D','DA12511H02845D','DA12511H03155D','DA1BFANH07452D','DA1BFANH10237D',
                    'DA12511H03162D','DA1BFANH05091D','DA12510H11571D','DA1BFANH04847D','DA1BFBPH02472D',
                    'DA12511H02833D','DA12511H03169D','DA1BFANH07563D','DA1BFANH07686D','DA1BFANH05096D',
                    'DA12511H03052D','DA1BFANH05052D')
 order by l.serial;
```

- 제외 3본(WO): 02574D·02689D(seq 0 아님) — 새 규칙은 `mounted_at IS NULL` 구간만 건드리므로 변화 없어야 정상. 03157D(CH 849 km 없음) — NO_KM 유지(pgTAP #13 과 같은 형).

### `resultSummary` L-4 분기
- 판정식(`NO_KM · seq 0 · mountedAt null` 은 배지 미상향)은 그대로라 **기존 테스트 기대값 변화 없음**(resultSummary 테스트 통과).
  FIRST_NEW_INSPECTION 구간은 OK 가 되어 이 분기에 오지 않는다.

## 5. min · three_zero · four_zero 예상 KM 비교 (기본값 결정 자료) — **미작성**

prod 데이터를 읽을 수 없어 17본 + 장착 중 전 본의 표를 만들지 못했다. 픽스처 값은 실데이터가 아니므로 표로 내지 않는다.

**만드는 방법 (어느 쪽이든 읽기만):**
1. 이 브랜치를 로컬에서 `npm run dev` → 로그인 → 수명 DB → **[엑셀 다운로드]**. 맨 뒤 «[비교] 예상 KM 최소 0mm / 3점 0mm / 4점 0mm» 3열이 전 본의 값이다.
   - prod 마이그레이션 전이어도 단일 구간 타이어는 같은 값이 나온다(폴백 거리가 탈착 km_end 까지 가고 원점이 첫 회차라서).
   - 단, «이후 1구간» 4본(03162D · 11571D · 07686D · 03052D — seq 0 NO_KM + 이후 OK 구간)은 db push 전에는 원장 OK 구간만 합산되어 주행 KM 이 작게 나온다 → push 후 값이 정본.
   - 폐기(Scrap) 본은 화면 열에는 예상값이 숨겨지지만 «[비교]» 3열에는 나온다.
2. 또는 읽기 권한을 받아 vitest 와 같은 `lifeCalc` 를 노드에서 돌리는 스크립트 작성(요청 시).

**이미 알 수 있는 성질 (코드·픽스처 기준, 수치 아님):**
- 센터 마모가 주인 구동축(S/C 중앙값 0.75)은 `four_zero ≥ three_zero ≥ min`. 숄더 3~6 mm 남기고 폐기된 본은 four_zero 가 실주행보다 길다.
- **`min` 기준 값도 이번 T-2 로 바뀐다.** 회귀에 최소 0 회차가 들어가 마지막 회차 최소값이 0 이면 잔여 0 → 예상 KM = 주행 KM.
  종전에는 0 회차를 빼고 마지막 양수 회차에서 외삽했다. 장착 중이면서 최근 최소 0 인 타이어(예: M-6 중앙 C1·C2 동시 0 목록)는 «예상 KM (최소 0mm)» 이 내려간다.

## 6. M-1 신품 판정 22.0 vs 21.5 — **미산출**

아래 SELECT 로 셀 수 있다 (읽기 전용).

```sql
with fi as (
  select distinct on (ch, pos, upper(regexp_replace(serial, '\s', '', 'g')))
         ch, pos, upper(regexp_replace(serial, '\s', '', 'g')) as sn, inspection_date as d, tread_avg
    from public.inspections
   where deleted_at is null and nullif(btrim(coalesce(serial, '')), '') is not null
   order by ch, pos, upper(regexp_replace(serial, '\s', '', 'g')), inspection_date, tread_avg desc nulls last
)
select count(*) filter (where f.tread_avg >= 22.0)                       as new_at_22_0,
       count(*) filter (where f.tread_avg >= 21.5)                       as new_at_21_5,
       count(*) filter (where f.tread_avg >= 21.5 and f.tread_avg < 22.0) as diff_only_21_5
  from public.v_tire_mount_history m
  join fi f on f.ch = m.ch and f.pos = m.pos and f.sn = upper(regexp_replace(m.serial, '\s', '', 'g'))
 where m.mounted_at is null and m.serial is not null;
```

## 7. 검출만 한 데이터 이상 (값 수정 안 함)

- CH 832 · 835 04-12 ~ 05-10 회차 KM 동일(옮겨 적기 의심) — 832 타이어 4본(04847D · 02472D · 07563D · 05096D)의 «수정 후» 값은 이 확인 결과에 따라 달라짐. 코드로 고치지 않음.
- CH 832 · 835 HM 이중 누적 의심(M-3) — HM 기반 예상 HM 은 이 두 대를 빼고 볼 것.
- CH 847 07-12 KM 급증(M-1, L-3) — 범위 밖, 변경 없음.

## 8. DoD

| 항목 | 결과 |
|---|---|
| `npm run lint` | ✅ 오류 0 (경고 1 — 기존 `AuthProvider.tsx` react-refresh, 이번 변경 무관) |
| `npx tsc --noEmit -p tsconfig.app.json` | ✅ 오류 0 |
| vitest 전체 | ✅ 18 파일 · 121 건 통과 (신규 `lifeCalc.firstMount.test.ts` 27건) |
| pgTAP 신규 | ⚠ t106 22/22 통과 — **로컬 PGlite 대체 실행**. `supabase test db`(Docker) 미실행 |
| §4 17본 ±1 km | ⚠ 입력값 기반 재현만 통과. **prod 대조 미실행** (RLS) |
| 마이그레이션 새 파일·멱등·DROP/TRUNCATE 없음·뷰 컬럼 맨 뒤 | ✅ (PGlite 2회 적용) |
| 덮어쓰기 없음 (`mounted_at` 원값) | ✅ pgTAP #7 |
| i18n ko/id/en | ✅ |
| 문서 | ✅ decisions · 사용설명서 · CHANGELOG · 결과 보고 |
| prod 적용 | ⏸ 승인 대기 (M-13) |

## 9. 쎄오님 확인 필요

1. **prod 적용 승인 (M-13):** `20261104100000` · `110000` · `120000` (`supabase db push`, M-12 3건 뒤).
2. **17본 prod 대조·비교표용 읽기 수단:** 로그인 세션으로 엑셀 내려받기(§5-1) 또는 §4·§6 SELECT 를 실행할 읽기 권한 중 무엇으로 할지.
3. **수명 종료 기준 기본값 (M-14):** 비교표 확인 후 `min` / `three_zero` / `four_zero` 중 선택.
4. **`min` 기준 값 변동 수용 여부:** T-2(회귀에 최소 0 회차 포함)로 장착 중 최소 0 타이어의 «예상 KM (최소 0mm)» 이 주행 KM 으로 내려간다(§5). 종전 점열을 `min` 에만 남길지.
5. **외삽 총량 식 (판단 3):** `max(주행, 마지막 측정점 + 잔여)` 로 바꾼 것 승인 여부.
6. **첫 회차 tread_avg NULL 처리:** 첫 점검 행에 트레드가 없으면(공기압만) 신품으로 보지 않고 NO_KM 유지 — 다음 회차 22.0 을 시작점으로 허용할지.
7. **M-16:** `v_tire_ledger` 의 anon grant 회수 마이그레이션을 만들지.
8. CH 832 · 835 04-12 ~ 05-10 KM 동일 건 현장 확인 (기존 미결).
