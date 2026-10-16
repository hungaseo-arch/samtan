-- ============================================================
-- Samtan TMS — T-104 완료 조건 (b) 증명 예제
--
-- "60개 삽입문이 새 함수 호출 8줄 이내로 축약 가능함"
--
-- 데이터는 프로덕션의 실제 2026-07-05 회차입니다.
-- 차량 6대 × 포지션 10개 = 삽입 대상 60행 → upsert_inspection_round() 호출 6줄.
--
-- 실행 (로컬 전용):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f docs/t104-upsert-example.sql
--
-- 전체가 begin … rollback 으로 묶여 있어 DB 상태를 바꾸지 않습니다.
-- 프로덕션에서는 실행하지 마십시오 (§3.1-1).
-- ============================================================

begin;

-- ── 사전 조건 ──────────────────────────────────────────────
-- inspections 는 (ch, pos) → vehicle_positions 로 FK 가 걸려 있습니다(T-102).
-- 프로덕션에는 이미 6대 60포지션이 있고, 빈 로컬 DB 에서만 필요한 준비입니다.
insert into public.vehicles (ch, seq, hm_reset)
select v.ch, v.seq, false
  from (values ('824', 1), ('832', 2), ('834', 3), ('835', 4), ('839', 5), ('849', 6)) as v(ch, seq)
on conflict (ch) do nothing;

insert into public.vehicle_positions (ch, pos, seq)
select v.ch, p.pos, p.seq
  from (values ('824'), ('832'), ('834'), ('835'), ('839'), ('849')) as v(ch)
 cross join (values
   ('L1', 1), ('R1', 2), ('L2 Out', 3), ('L2 In', 4), ('R2 In', 5),
   ('R2 Out', 6), ('L3 Out', 7), ('L3 In', 8), ('R3 In', 9), ('R3 Out', 10)
 ) as p(pos, seq)
on conflict (ch, pos) do nothing;

-- ── BEFORE — 종래 방식 (60줄) ──────────────────────────────
-- 아래와 같은 삽입문이 차량 6대 × 포지션 10개 = 60개 필요했습니다.
-- 재실행하면 유니크 위반으로 죽거나, WHERE NOT EXISTS 를 덧붙여야 했습니다.
--
--   insert into public.inspections (ch, inspection_date, pos, pressure, tread, hm, km)
--     values ('824', '2026-07-05', 'L1', 90, 22, 5868.1, 642726);
--   insert into public.inspections (ch, inspection_date, pos, pressure, tread, hm, km)
--     values ('824', '2026-07-05', 'L2 In', 116, 22, 5868.1, 642726);
--   ... (58개 더)

-- ── AFTER — 6줄 ───────────────────────────────────────────
-- 호출 1줄 = 차량 1대 = 10행. 회차 메타(HM · KM · 운전자)는 인자로 한 번만 씁니다.

select public.upsert_inspection_round('824', date '2026-07-05', 5868.1, 642726, null, '[{"pos":"L1","pressure":90,"tread":22},{"pos":"L2 In","pressure":116,"tread":22},{"pos":"L2 Out","pressure":116,"tread":22},{"pos":"L3 In","pressure":116,"tread":22},{"pos":"L3 Out","pressure":116,"tread":22},{"pos":"R1","pressure":90,"tread":22},{"pos":"R2 In","pressure":116,"tread":22},{"pos":"R2 Out","pressure":116,"tread":22},{"pos":"R3 In","pressure":116,"tread":22},{"pos":"R3 Out","pressure":116,"tread":22}]');
select public.upsert_inspection_round('832', date '2026-07-05', 5188.4, 1110.9, null, '[{"pos":"L1","pressure":99.5,"tread":17.14},{"pos":"L2 In","pressure":null,"tread":4.86},{"pos":"L2 Out","pressure":116,"tread":3.35},{"pos":"L3 In","pressure":null,"tread":6.47},{"pos":"L3 Out","pressure":116,"tread":5.99},{"pos":"R1","pressure":99,"tread":17.12},{"pos":"R2 In","pressure":null,"tread":5.07},{"pos":"R2 Out","pressure":120,"tread":7.08},{"pos":"R3 In","pressure":null,"tread":7.16},{"pos":"R3 Out","pressure":120,"tread":7.44}]');
select public.upsert_inspection_round('834', date '2026-07-05', 2943.2, 738366.2, null, '[{"pos":"L1","pressure":87,"tread":11.97},{"pos":"L2 In","pressure":null,"tread":0},{"pos":"L2 Out","pressure":120,"tread":3.82},{"pos":"L3 In","pressure":null,"tread":8.05},{"pos":"L3 Out","pressure":118,"tread":13.98},{"pos":"R1","pressure":96,"tread":18.58},{"pos":"R2 In","pressure":null,"tread":4.76},{"pos":"R2 Out","pressure":115,"tread":3.44},{"pos":"R3 In","pressure":null,"tread":3.29},{"pos":"R3 Out","pressure":117,"tread":3.1}]');
select public.upsert_inspection_round('835', date '2026-07-05', 14398.2, 668, null, '[{"pos":"L1","pressure":99.5,"tread":18.85},{"pos":"L2 In","pressure":null,"tread":3.24},{"pos":"L2 Out","pressure":106,"tread":0},{"pos":"L3 In","pressure":null,"tread":10.79},{"pos":"L3 Out","pressure":126,"tread":13.8},{"pos":"R1","pressure":103,"tread":17.56},{"pos":"R2 In","pressure":null,"tread":10.07},{"pos":"R2 Out","pressure":128,"tread":10},{"pos":"R3 In","pressure":null,"tread":11.5},{"pos":"R3 Out","pressure":120,"tread":10.93}]');
select public.upsert_inspection_round('839', date '2026-07-05', 6343.5, 459364.6, null, '[{"pos":"L1","pressure":122,"tread":17.19},{"pos":"L2 In","pressure":null,"tread":8.57},{"pos":"L2 Out","pressure":124,"tread":2.38},{"pos":"L3 In","pressure":null,"tread":8.05},{"pos":"L3 Out","pressure":128,"tread":4.59},{"pos":"R1","pressure":96,"tread":10.52},{"pos":"R2 In","pressure":null,"tread":3.86},{"pos":"R2 Out","pressure":123,"tread":3.03},{"pos":"R3 In","pressure":null,"tread":16.6},{"pos":"R3 Out","pressure":126,"tread":15.97}]');
select public.upsert_inspection_round('849', date '2026-07-05', 2207.6, 0, null, '[{"pos":"L1","pressure":90,"tread":18.27},{"pos":"L2 In","pressure":null,"tread":7.46},{"pos":"L2 Out","pressure":110,"tread":9.85},{"pos":"L3 In","pressure":null,"tread":6.96},{"pos":"L3 Out","pressure":116,"tread":8.8},{"pos":"R1","pressure":89.5,"tread":15.04},{"pos":"R2 In","pressure":null,"tread":6.09},{"pos":"R2 Out","pressure":113,"tread":14.66},{"pos":"R3 In","pressure":null,"tread":16.5},{"pos":"R3 Out","pressure":102,"tread":8.27}]');

-- ── 1회 실행 결과 ──────────────────────────────────────────
select '1회 실행' as 구분,
       count(*) as 행수,
       count(distinct ch) as 차량수
  from public.inspections
 where inspection_date = date '2026-07-05';

-- 재실행 전 상태를 떠 둡니다. id 와 created_at 이 그대로여야 "레코드 수 불변"이
-- 아니라 "레코드 자체가 그대로"임을 말할 수 있습니다.
create temp table t104_before on commit drop as
select id, ch, pos, created_at from public.inspections
 where inspection_date = date '2026-07-05';

-- ── 완료 조건 (a) — 같은 6줄을 그대로 다시 실행 ────────────
-- updated_at 을 과거로 심어 두고(자동 갱신 트리거를 잠시 꺼야 심어집니다),
-- 재실행 후 행 수는 그대로인지 · updated_at 만 움직였는지 봅니다.
alter table public.inspections disable trigger trg_inspections_updated_at;
update public.inspections
   set updated_at = timestamptz '2000-01-01 00:00:00+00'
 where inspection_date = date '2026-07-05';
alter table public.inspections enable trigger trg_inspections_updated_at;

select public.upsert_inspection_round('824', date '2026-07-05', 5868.1, 642726, null, '[{"pos":"L1","pressure":90,"tread":22},{"pos":"L2 In","pressure":116,"tread":22},{"pos":"L2 Out","pressure":116,"tread":22},{"pos":"L3 In","pressure":116,"tread":22},{"pos":"L3 Out","pressure":116,"tread":22},{"pos":"R1","pressure":90,"tread":22},{"pos":"R2 In","pressure":116,"tread":22},{"pos":"R2 Out","pressure":116,"tread":22},{"pos":"R3 In","pressure":116,"tread":22},{"pos":"R3 Out","pressure":116,"tread":22}]');
select public.upsert_inspection_round('832', date '2026-07-05', 5188.4, 1110.9, null, '[{"pos":"L1","pressure":99.5,"tread":17.14},{"pos":"L2 In","pressure":null,"tread":4.86},{"pos":"L2 Out","pressure":116,"tread":3.35},{"pos":"L3 In","pressure":null,"tread":6.47},{"pos":"L3 Out","pressure":116,"tread":5.99},{"pos":"R1","pressure":99,"tread":17.12},{"pos":"R2 In","pressure":null,"tread":5.07},{"pos":"R2 Out","pressure":120,"tread":7.08},{"pos":"R3 In","pressure":null,"tread":7.16},{"pos":"R3 Out","pressure":120,"tread":7.44}]');
select public.upsert_inspection_round('834', date '2026-07-05', 2943.2, 738366.2, null, '[{"pos":"L1","pressure":87,"tread":11.97},{"pos":"L2 In","pressure":null,"tread":0},{"pos":"L2 Out","pressure":120,"tread":3.82},{"pos":"L3 In","pressure":null,"tread":8.05},{"pos":"L3 Out","pressure":118,"tread":13.98},{"pos":"R1","pressure":96,"tread":18.58},{"pos":"R2 In","pressure":null,"tread":4.76},{"pos":"R2 Out","pressure":115,"tread":3.44},{"pos":"R3 In","pressure":null,"tread":3.29},{"pos":"R3 Out","pressure":117,"tread":3.1}]');
select public.upsert_inspection_round('835', date '2026-07-05', 14398.2, 668, null, '[{"pos":"L1","pressure":99.5,"tread":18.85},{"pos":"L2 In","pressure":null,"tread":3.24},{"pos":"L2 Out","pressure":106,"tread":0},{"pos":"L3 In","pressure":null,"tread":10.79},{"pos":"L3 Out","pressure":126,"tread":13.8},{"pos":"R1","pressure":103,"tread":17.56},{"pos":"R2 In","pressure":null,"tread":10.07},{"pos":"R2 Out","pressure":128,"tread":10},{"pos":"R3 In","pressure":null,"tread":11.5},{"pos":"R3 Out","pressure":120,"tread":10.93}]');
select public.upsert_inspection_round('839', date '2026-07-05', 6343.5, 459364.6, null, '[{"pos":"L1","pressure":122,"tread":17.19},{"pos":"L2 In","pressure":null,"tread":8.57},{"pos":"L2 Out","pressure":124,"tread":2.38},{"pos":"L3 In","pressure":null,"tread":8.05},{"pos":"L3 Out","pressure":128,"tread":4.59},{"pos":"R1","pressure":96,"tread":10.52},{"pos":"R2 In","pressure":null,"tread":3.86},{"pos":"R2 Out","pressure":123,"tread":3.03},{"pos":"R3 In","pressure":null,"tread":16.6},{"pos":"R3 Out","pressure":126,"tread":15.97}]');
select public.upsert_inspection_round('849', date '2026-07-05', 2207.6, 0, null, '[{"pos":"L1","pressure":90,"tread":18.27},{"pos":"L2 In","pressure":null,"tread":7.46},{"pos":"L2 Out","pressure":110,"tread":9.85},{"pos":"L3 In","pressure":null,"tread":6.96},{"pos":"L3 Out","pressure":116,"tread":8.8},{"pos":"R1","pressure":89.5,"tread":15.04},{"pos":"R2 In","pressure":null,"tread":6.09},{"pos":"R2 Out","pressure":113,"tread":14.66},{"pos":"R3 In","pressure":null,"tread":16.5},{"pos":"R3 Out","pressure":102,"tread":8.27}]');

select '2회 실행' as 구분,
       count(*) as 행수,
       count(*) filter (where a.updated_at = now())        as updated_at_갱신,
       count(*) filter (where a.id = b.id)                 as id_동일,
       count(*) filter (where a.created_at = b.created_at) as created_at_동일,
       (select count(*) from public.audit_log
         where table_name = 'inspections' and op = 'UPDATE') as 변경이력_건수
  from public.inspections a
  join t104_before b using (ch, pos)
 where a.inspection_date = date '2026-07-05';

rollback;
