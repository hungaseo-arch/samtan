# 작업지시서 · Samtan TMS TCO 확장 (Phase 2)

| 항목 | 내용 |
|---|---|
| 문서번호 | WO-TMS-2026-09-TCO |
| 작성일 | 2026-08-27 |
| 발주 | PT ASCENDO INTERNASIONAL · SEO Jonghwan |
| 수행 | Claude Code (VSCode) |
| 대상 | `hungaseo-arch/samtan` · Supabase project `vndbzanhoumhhuneufni` |
| 근거 | TECHKING 14.00R24 실차보고서(개정 2차, 2026-08-27) 10.3 「Phase 2 TCO 보고」 |

---

## 0. 목적과 범위

현재 TMS는 **마모 분석까지만 완결**되어 있다. 비용 축은 `단가 ÷ 수명` 형태의 CPK 1종뿐이며, 운송·장착·수리·다운타임·회수가치가 전혀 반영되지 않는다. 이 작업의 목적은 TMS를 **마모 모니터링 시스템에서 TCO 분석 시스템으로 확장**하는 것이다.

### 범위에 포함
- 비용 파라미터 마스터 및 이벤트 원장 신설
- 탈착 사유의 TCO 귀속 분류
- 타이어 개체(시리얼) 단위 누적 주행거리 원장
- CPK 3종(Gross / TCO / Lifecycle) 산출 뷰
- TCO 탭 신설 및 교체 입력 화면 확장
- 데이터 품질 가드 강화

### 범위에서 제외 (데이터 미확보 · 스키마만 준비)
- **CPH(시간당 비용)** — `inspections.hm`에 물리적 불가능치가 존재한다(CH 832·835, 일 96.9~150.8시간). 컬럼과 뷰는 만들되 **화면 노출 금지**.
- **Cost/ton, Cost/ton-km, TKPH** — 하중 기준이 10,500 kg / 6,000 kg 중 미확정. 스키마만 준비.

---

## 1. 작업 원칙 (필수 준수)

1. **기존 데이터 규약을 깨지 않는다.**
   - `tread_points`가 정본이고 `inspections.tread*`는 트리거가 유지하는 파생 캐시다. 직접 UPDATE 금지.
   - 소프트 삭제 원칙: 측정·교체 레코드는 하드 DELETE 하지 않는다. `deleted_at` 세팅 + 신규 행 추가.
   - **사용 금지 컬럼**: `tread_g1`~`g4`, `serial2`, `outboard_avg`, `inboard_avg`. 모두 DEPRECATED다. 각각 `tread_points`, `v_current_tire.serial`, S/C Ratio로 대체한다.
2. **DDL은 `apply_migration`이 아니라 `supabase/migrations/` 파일로 커밋한다.** 기존 파일의 마지막 번호를 확인하고 이어서 채번한다.
3. **모든 신규 테이블에 RLS를 활성화한다.** 기존 테이블(`inspections`, `replacements` 등)의 정책을 그대로 복제한다. RLS 없이 배포하지 않는다.
4. **감사 컬럼을 동일 패턴으로 넣는다.** `created_at / updated_at / created_by / updated_by / created_by_email / updated_by_email / deleted_at`. `audit_log` 트리거도 기존 테이블과 동일하게 연결한다.
5. **미확정 파라미터에 임의 기본값을 넣지 않는다.** 본당 단가(IDR 6,000,000)는 **역산 추정치이며 미확인 상태**다. `cost_params.unit_price`는 NULL 허용으로 두고, NULL이면 화면에 금액 대신 `단가 미확정`을 표시한다. 추정치를 하드코딩하면 그 숫자가 대외 제안서로 흘러간다.
6. **작업 후 검사**: `npm run lint` + `npx tsc --noEmit -p tsconfig.app.json`. 둘 다 통과해야 완료로 본다.
7. **`docs/사용설명서.md`를 함께 갱신한다.** 신규 탭·필드·지표 정의 포함.
8. 신규 UI 문자열은 **한국어·인도네시아어 모두** `src/i18n/index.tsx`에 등록한다. 한쪽만 넣지 않는다.

---

## 2. 작업 목록

### T-1 · `damage_codes` 확장 — TCO 귀속 분류

**목적** 기존 손상 코드 14종을 TCO 원인 귀속에 재사용한다. 신규 코드 체계를 만들지 말 것.

`damage_codes`에 컬럼 2개를 추가한다.

```sql
alter table damage_codes
  add column tco_category text
    check (tco_category in ('PRODUCT','SURFACE','OPERATION','MAINTENANCE','MANUFACTURE')),
  add column description_id text;   -- Bahasa Indonesia 설명
```

기존 14종의 귀속 매핑(초기값):

| code | description | tco_category | 의미 |
|---|---|---|---|
| WO | Worn Out | PRODUCT | 정상 마모 — **수명 통계의 유일한 유효 모수** |
| IW | Irregular Wear | MAINTENANCE | 정렬·공기압 |
| SWB | Spot Wear Brake | OPERATION | 제동 습관 |
| CD | Crown Damage | SURFACE | 노면 |
| SHC | Shoulder Cut | SURFACE | 노면 |
| SC | Sidewall Cut | SURFACE | 노면 |
| SCF | Sidewall Scuffing | OPERATION | 접촉·주행 |
| BC | Bead Cut | MAINTENANCE | 장착 불량 |
| BB | Bead Bulge | MANUFACTURE | 구조 |
| ILB | Inner Liner Bulge | MANUFACTURE | 구조 |
| RF | Run Flat | MAINTENANCE | 공기압 |
| ORF | Over Run Flat | MAINTENANCE | 공기압 |
| BO | Burn Out | OPERATION | 열부하 |
| OTH | Other | NULL | 미분류 |

> **이 매핑이 이번 작업의 핵심 산출물이다.** 이것이 있어야 "우리 타이어가 짧게 갔다"가 아니라 "PRODUCT 귀속분 수명은 목표 대비 몇 %이고, 나머지는 SURFACE·MAINTENANCE 요인이었다"로 설명된다.

**DoD** `select tco_category, count(*) from damage_codes group by 1`이 정상 반환. `OTH`만 NULL.

---

### T-2 · `replacements` 확장 — 탈착 시점 정보

**목적** 현재 `replacements` 27건에는 `new_serial`과 날짜만 있고 **왜 뺐는지, 뺀 타이어가 어떻게 됐는지가 없다.** TCO 산출이 불가능한 근본 원인이다.

```sql
alter table replacements
  add column old_serial text,                    -- 탈거된 타이어 (v_current_tire 로 역산 가능하나 명시 기록)
  add column removal_code text references damage_codes(code),
  add column removal_tread_min numeric check (removal_tread_min is null or (removal_tread_min >= 0 and removal_tread_min <= 60)),
  add column casing_grade text check (casing_grade is null or casing_grade in ('A','B','C','REJECT')),
  add column retreadable boolean,
  add column downtime_minutes integer check (downtime_minutes is null or downtime_minutes >= 0),
  add column removal_note text;
```

**소급 입력 지시**: 최근 8건(2026-08 교체분)은 현장 확인이 가능하므로 우선 입력 대상으로 표시한다. 화면에 `사유 미입력` 배지를 띄운다.

**DoD** 교체 입력 화면(T-9)에서 신규 필드가 저장·조회된다. 기존 27건은 NULL 허용으로 무결성 오류 없음.

---

### T-3 · `cost_params` 신설 — 비용 파라미터 마스터

**목적** 비용 단가를 코드에 박지 않고 이력형 테이블로 관리한다. 단가가 바뀌어도 과거 CPK가 소급 변경되지 않아야 한다.

```sql
create table cost_params (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  brand text,                      -- NULL = 전체 적용
  size text,
  unit_price numeric,              -- 본당 단가 IDR. NULL = 미확정 (화면에 '단가 미확정' 표시)
  freight_per_tire numeric,        -- 본당 운송 배분액
  mount_cost numeric,              -- 장착 + 탈착 공임
  repair_avg numeric,              -- 건당 수리 평균
  pressure_check_cost numeric,     -- 회차당 공기압 점검 배분액
  downtime_rate_hour numeric,      -- 고객사 시간당 기회손실
  casing_value numeric,            -- 재생 가능 케이싱 회수액
  scrap_value numeric,             -- 스크랩 매각액
  retread_cost numeric,            -- 재생 비용
  retread_life_km numeric,         -- 재생 후 기대 수명
  currency text not null default 'IDR',
  note text
  -- + 감사 컬럼 7종
);
create index on cost_params (effective_from desc);
```

**적용 규칙**: 점검일/탈착일 이하 중 `effective_from`이 가장 최근인 행을 적용한다. `pressure_targets`와 동일한 이력 조회 패턴을 쓴다.

**초기 데이터**: 전 항목 NULL로 1행만 넣는다(`effective_from = '2026-04-01'`, `note = '단가 확인 대기 — 보고서 9장 ⑦'`). **추정치를 넣지 말 것.**

---

### T-4 · `tire_events` 신설 — 운용 이벤트 원장

```sql
create table tire_events (
  id uuid primary key default gen_random_uuid(),
  serial text not null,
  ch text, pos text,
  event_date date not null,
  event_type text not null
    check (event_type in ('REPAIR','ROTATION','STOP','INFLATE','INSPECT_EXTRA')),
  cost numeric,
  downtime_minutes integer,
  damage_code text references damage_codes(code),
  note text
  -- + 감사 컬럼 7종
);
create index on tire_events (serial, event_date);
```

---

### T-5 · `v_tire_ledger` — 개체 단위 누적 주행거리

**이것이 이번 작업에서 기술적으로 가장 중요하다.**

현재 마모율 0.446 mm/1,000 km는 **차량** 주행거리 기준 회귀다. 그런데 2026-08 교체 8건 중 6건이 중고 재배치이고, 시리얼 `04814D`는 **4개 차량째 순회 중**이다. 이 타이어의 실제 누적 주행거리는 어느 차량의 km에도 잡히지 않는다. 개체 원장 없이는 CPK의 분모가 성립하지 않는다.

다행히 `v_tire_mount_history`가 이미 `serial · ch · pos · mounted_at · removed_at · is_current`를 반환한다. 여기에 차량 km를 결합하면 된다.

```sql
create or replace view v_tire_ledger as
with seg as (
  select m.serial, m.ch, m.pos, m.seq_no, m.mounted_at,
         coalesce(m.removed_at, current_date) as removed_at,
         m.is_current
  from v_tire_mount_history m
  where m.serial is not null
),
km as (
  select ch, inspection_date, max(km) as km
  from inspections
  where deleted_at is null and km is not null and km > 0
  group by ch, inspection_date
),
bounds as (
  select s.*,
    (select k.km from km k
      where k.ch = s.ch and k.inspection_date <= s.mounted_at
      order by k.inspection_date desc limit 1) as km_start,
    (select k.km from km k
      where k.ch = s.ch and k.inspection_date <= s.removed_at
      order by k.inspection_date desc limit 1) as km_end
  from seg s
)
select serial, ch, pos, seq_no, mounted_at, removed_at, is_current,
       km_start, km_end,
       case
         when km_start is null or km_end is null then null
         when km_end < km_start then null          -- km 리셋·이상치 → NULL, 0 으로 채우지 말 것
         else km_end - km_start
       end as segment_km,
       case
         when km_start is null or km_end is null then 'NO_KM'
         when km_end < km_start then 'KM_DECREASE'
         else 'OK'
       end as km_flag
from bounds;
```

그리고 시리얼 단위 합산 뷰:

```sql
create or replace view v_tire_ledger_total as
select serial,
       count(*) as mount_count,
       count(distinct ch) as vehicle_count,
       min(mounted_at) as first_mounted_at,
       max(removed_at) as last_date,
       sum(segment_km) filter (where km_flag = 'OK') as cumulative_km,
       count(*) filter (where km_flag <> 'OK') as invalid_segments,
       bool_or(is_current) as in_service
from v_tire_ledger
group by serial;
```

**주의사항**
- `vehicles.km_reset = true`인 차량은 km 감소가 정상이다. 경고 대상에서 제외하되 `segment_km`은 NULL로 둔다.
- CH 849는 km 전량 미입력이므로 `km_flag = 'NO_KM'`으로 떨어진다. 이것이 정상 동작이다. 0으로 대체하지 말 것.
- CH 847은 2026-07-12 km 이상치가 미해결이다. 해당 구간은 별도 플래그로 노출한다.

**DoD (검증 쿼리)**
```sql
select * from v_tire_ledger where serial = '04814D' order by seq_no;
-- 기대: 4개 차량 구간이 seq_no 순으로 나오고, 각 구간 segment_km 합이 cumulative_km 와 일치
select serial, mount_count, vehicle_count, cumulative_km, invalid_segments
from v_tire_ledger_total where vehicle_count > 1 order by vehicle_count desc;
```

---

### T-6 · `v_removal_analysis` — 사유별 수명 분포

```sql
create or replace view v_removal_analysis as
select r.id, r.ch, r.pos, r.date as removal_date,
       r.old_serial as serial,
       r.removal_code, d.description, d.tco_category,
       r.removal_tread_min, r.casing_grade, r.retreadable,
       r.downtime_minutes,
       t.cumulative_km,
       t.vehicle_count,
       c.new_tread,
       case when t.cumulative_km > 0 and c.new_tread is not null
              and r.removal_tread_min is not null
            then (c.new_tread - r.removal_tread_min) / t.cumulative_km * 1000
       end as realized_wear_rate   -- mm / 1,000 km
from replacements r
left join damage_codes d on d.code = r.removal_code
left join v_tire_ledger_total t on t.serial = r.old_serial
cross join (select new_tread from tire_config where id = 1) c
where r.deleted_at is null;
```

**용도** `tco_category = 'PRODUCT'`인 행만으로 산출한 평균 수명이 대외 벤치마크의 유일한 정당한 근거다. 화면에 이 필터를 기본값으로 건다.

---

### T-7 · `v_tco_unit` / `v_tco_fleet` — CPK 3종

**정의**

| 지표 | 산식 |
|---|---|
| CPK-G (Gross) | `unit_price ÷ cumulative_km` |
| CPK-T (TCO) | `(unit_price + freight + mount + repair + pressure_check + downtime_cost − recovery) ÷ cumulative_km` |
| CPK-L (Lifecycle) | `(unit_price + retread_cost − scrap_value) ÷ (cumulative_km + retread_life_km)` — `retreadable = true`인 경우만 |

여기서
- `downtime_cost = (교체 downtime_minutes + 이벤트 downtime_minutes) ÷ 60 × downtime_rate_hour`
- `recovery = retreadable ? casing_value : scrap_value`

```sql
create or replace view v_tco_unit as
with p as (   -- 적용 비용 파라미터 (탈착일 기준 최신)
  select r.id as repl_id, cp.*
  from replacements r
  left join lateral (
    select * from cost_params
    where effective_from <= r.date
    order by effective_from desc limit 1
  ) cp on true
  where r.deleted_at is null
),
ev as (
  select serial,
         coalesce(sum(cost),0) as event_cost,
         coalesce(sum(downtime_minutes),0) as event_downtime
  from tire_events where deleted_at is null group by serial
)
select ...   -- 위 정의대로 조립
```

> 조립 세부는 Claude Code가 실제 컬럼으로 완성한다. **`unit_price`가 NULL이면 CPK 3종 모두 NULL을 반환해야 한다.** COALESCE로 0을 채워 넣으면 CPK가 IDR 0으로 표시되어 심각한 오독을 낳는다.

`v_tco_fleet`은 브랜드·차량·축군별 롤업. **ETCRANE vs NONTK 비교의 기준 뷰**가 된다. 단 NONTK는 2본·단일 차량 표본이므로, 뷰에 `sample_size` 컬럼을 포함하고 화면에서 `n < 4`이면 `참고 관찰 · 통계 비교 불가` 배지를 강제 표시한다.

---

### T-8 · 데이터 품질 가드 강화

`v_data_quality`에 아래 규칙을 추가한다.

| 규칙 | 조건 | 심각도 |
|---|---|---|
| HM 물리 불가 | 직전 점검 대비 HM 증가량 ÷ 경과일수 > 24 | ERROR |
| km 급증 | 일 환산 주행거리 > 1,500 km | WARN |
| km 감소 | `km < 직전 km` and `vehicles.km_reset = false` | ERROR |
| km 미입력 | `km is null` 연속 2회 이상 | WARN |
| 트레드 0 관행 | `tread = 0` and `tread_status = 'measured'` | ERROR |
| 최소·평균 모순 | `tread = 0` and `tread_avg > 5.0` | ERROR |
| 내측 미측정 | 복륜 내측 포지션 압력 NULL | WARN |
| 교체 사유 미입력 | `removal_code is null` | WARN |

**입력 차단 규칙 (프론트엔드)**: 트레드 0 입력 시 `worn_out` / `not_measured` / `scrapped` 선택 모달을 **취소 불가**로 만든다. 현재 모달이 존재하나 현장에서 회피되고 있어 0 기록이 20 → 27본으로 늘었다. `tread_status = 'measured'`인 상태로 0을 저장하는 경로를 코드에서 제거한다.

---

### T-9 · 프론트엔드 — TCO 탭 신설

`src/pages/home/Index.tsx`의 `TABS` 배열에 9번째 탭 `TCO`를 추가하고, `src/components/TcoTab.tsx`를 만든다.

**구성 (상단 → 하단)**

1. **CPK 3종 카드** — CPK-G / CPK-T / CPK-L 를 나란히. 각 카드에 산출 조건(탈착 기준 mm, 기준 기간, 표본 수)을 부제로 표시. 단가 미확정 시 금액 대신 `단가 미확정` + 확인 요청 안내.
2. **비용 구성 스택바** — 구매가 / 부대비용 / 다운타임 / 회수가치(음수) 를 Recharts 누적 막대로. 구매가가 총비용의 몇 %인지가 이 화면의 메시지다.
3. **사유별 수명 분포** — `v_removal_analysis`의 `tco_category`별 본수·평균 수명. 기본 필터 `PRODUCT`.
4. **개체 원장 테이블** — `v_tire_ledger_total`. 시리얼별 누적 km·순회 차량 수·유효성 플래그. `vehicle_count > 1`인 행 강조.
5. **재생 시나리오 비교** — 탈착 기준(3.0 / 5.0 mm)과 재생 여부를 토글하면 CPK가 재계산되는 패널. `cost_params`의 `retread_cost`·`retread_life_km`·`casing_value`가 NULL이면 패널 전체를 `파라미터 대기` 상태로 비활성화.

**디자인** 기존 shadcn·Tailwind 토큰을 따르되, 색상은 사내 가이드에 맞춘다.
`--grey #F0F0F0` (배경) / `--blue #E3F2FD` (헤더·카드 상단) / `--sage #E8F5E9` (결과값 강조) / `--bluegrey #ECEFF1` (보조 음영) / `--ink #546E7A` (본문·경계선).

**숫자 표기** 천 단위 콤마, 소수점 마침표. 퍼센트 소수점 첫째 자리, CPK 소수점 둘째 자리, 마모율 ~~셋째~~ **둘째** 자리 (사용자 결정 2026-10-16 — CLAUDE.md §마모율 단위). 금액은 `IDR` 선행 표기. 대금액은 전체 자리수 + 괄호 단위 병기 — 예: `IDR 6,000,000 (6.00 juta)`.

---

### T-10 · 프론트엔드 — 교체 입력 화면 확장

기존 「타이어 교체이력」 탭 입력 폼에 T-2의 신규 필드를 추가한다.

- 탈거 시리얼 (기본값: `v_current_tire`에서 자동 채움, 수정 가능)
- 탈착 사유 (`damage_codes` 드롭다운 — 코드 + 한/인니 설명 병기)
- 탈착 시 최소 트레드 (mm)
- 케이싱 등급 (A / B / C / REJECT)
- 재생 가능 여부 (체크박스)
- 정지 시간 (분)
- 비고

**사유 미입력 상태로 저장은 허용하되**, 목록에 `사유 미입력` 배지를 띄우고 상단에 미입력 건수를 표시한다. 기존 27건 소급 입력을 유도하는 장치다.

---

### T-11 · i18n · 문서

- `src/i18n/index.tsx`에 TCO 탭 전체 문자열을 한국어·인도네시아어로 등록. 용어 기준: 총소유비용 = `Biaya Kepemilikan Total`, 탈착 사유 = `Alasan pelepasan`, 케이싱 = `Casing`, 재생 = `Vulkanisir`, 다운타임 = `Waktu henti`.
- `docs/사용설명서.md`에 9번째 탭 설명, 신규 입력 필드, CPK 3종 정의와 용도 구분을 추가.

---

## 3. 작업 순서

```
T-1 → T-2 → T-3 → T-4          (DB 스키마)
  ↓
T-5 → T-6 → T-7                (뷰 · 검증 쿼리 통과 필수)
  ↓
T-8 → T-9 → T-10 → T-11        (프론트엔드 · 문서)
```

T-5(`v_tire_ledger`) 검증이 통과하기 전에 T-7(CPK 뷰)로 넘어가지 말 것. 분모가 틀린 채로 화면을 만들면 잘못된 숫자가 보고서로 나간다.

---

## 4. 완료 판정

- [ ] `npm run lint` 통과
- [ ] `npx tsc --noEmit -p tsconfig.app.json` 통과
- [ ] `npm run build` 성공
- [ ] 신규 테이블 3종에 RLS 정책 적용 확인
- [ ] `v_tire_ledger` 검증 쿼리에서 `04814D`의 4개 차량 구간이 정상 반환
- [ ] `cost_params.unit_price = NULL` 상태에서 TCO 탭이 오류 없이 `단가 미확정`을 표시
- [ ] 트레드 0 입력 시 `tread_status = 'measured'`로 저장되는 경로가 존재하지 않음
- [ ] 한국어·인도네시아어 전환 시 TCO 탭에 미번역 문자열 없음
- [ ] `docs/사용설명서.md` 갱신

---

## 5. 후속 (본 작업 범위 외 · 데이터 확보 후)

| 선행 조건 | 해제되는 기능 |
|---|---|
| 본당 단가 확정 (보고서 9장 ⑦) | CPK 3종 실제 금액 산출 |
| HM 입력 오류 정정 (⑪) | CPH 지표 |
| 하중 기준 확정 (⑥) | Cost/ton · Cost/ton-km · TKPH 사용률 |
| 재생비·재생 수명 실측 | CPK-L 및 재생 시나리오 패널 |
| 폭 방향 규약 확정 (Bpk. Irawan) | `outboard_avg` / `inboard_avg` 복원 |

> 재생 시나리오는 상업적으로 가장 중요한 미해결 변수다. 개략 계산상 5.0 mm 탈착 후 재생 1회를 반영하면 통합 CPK가 IDR 118.91/km 수준으로, Techking 제시치 IDR 118.37/km와 사실상 동등해진다. 현재 남아 있는 15.9% 성능 간극이 제품 문제가 아니라 **재생 정책 미반영**일 가능성이 있으므로, 파라미터 확보를 우선한다.

---

**PT ASCENDO INTERNASIONAL**
