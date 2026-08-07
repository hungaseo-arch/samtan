-- ============================================================
-- Samtan TMS — T-104 멱등 UPSERT 회귀 테스트 (pgTAP)
--
-- 실행: supabase test db
-- 전체를 트랜잭션으로 감싸고 마지막에 rollback 하므로 로컬 DB 상태를 바꾸지 않습니다.
--
-- 검증 대상은 완료 조건 두 가지입니다.
--   (a) 동일 데이터를 2회 실행해도 레코드 수가 변하지 않고 updated_at 만 갱신된다
--   (b) 회차 함수 1회 호출이 60행 중 10행(차량 1대)을 대신한다
--
-- 주의: now() 는 트랜잭션 시각이라 한 트랜잭션 안에서 값이 변하지 않습니다.
--       updated_at 갱신은 트리거를 잠시 끄고 과거 시각을 심어 둔 뒤 비교합니다.
-- ============================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ── 구조 확인 ──────────────────────────────────────────────
select has_function('public', 'upsert_inspection',       '단건 UPSERT 함수가 존재한다');
select has_function('public', 'upsert_inspection_round', '회차 UPSERT 함수가 존재한다');

-- ── 픽스처 ────────────────────────────────────────────────
-- inspections 는 (ch, pos) → vehicle_positions 로 FK 가 걸려 있어(T-102)
-- 포지션 10개를 먼저 만들어야 합니다.
insert into public.vehicles (ch, seq, hm_reset) values ('T97', 97, false);

insert into public.vehicle_positions (ch, pos, serial, seq)
select 'T97', p.pos, 'T97SERIAL' || lpad(p.seq::text, 2, '0'), p.seq
  from (values
    ('L1', 1), ('R1', 2), ('L2 Out', 3), ('L2 In', 4), ('R2 In', 5),
    ('R2 Out', 6), ('L3 Out', 7), ('L3 In', 8), ('R3 In', 9), ('R3 Out', 10)
  ) as p(pos, seq);

-- ── (a) 단건 멱등성 ────────────────────────────────────────
select lives_ok(
  $$ select public.upsert_inspection('T97', date '2026-08-05', 'L1', 100, 17.5, 5188.4, 24310.5, 'T97SERIAL01', 'Budi') $$,
  '단건 UPSERT 최초 호출이 성공한다');

select is(
  (select count(*)::int from public.inspections where ch = 'T97'),
  1,
  '최초 호출로 1행이 생긴다');

select is(
  (select tread from public.inspections where ch = 'T97' and pos = 'L1'),
  17.5::numeric,
  '넘긴 값이 그대로 저장된다');

-- updated_at 을 과거로 심어 둔다. 자동 갱신 트리거를 끄고 UPDATE 해야
-- 심은 값이 즉시 now() 로 덮이지 않습니다.
alter table public.inspections disable trigger trg_inspections_updated_at;
update public.inspections
   set updated_at = timestamptz '2000-01-01 00:00:00+00'
 where ch = 'T97';
alter table public.inspections enable trigger trg_inspections_updated_at;

-- 완전히 같은 인자로 재실행. 함수 반환값이 TAP 출력에 섞이지 않도록 DO 로 감쌉니다.
do $do$ begin
  perform public.upsert_inspection('T97', date '2026-08-05', 'L1', 100, 17.5, 5188.4, 24310.5, 'T97SERIAL01', 'Budi');
end $do$;

select is(
  (select count(*)::int from public.inspections where ch = 'T97'),
  1,
  '동일 데이터 2회 실행 후에도 레코드 수가 1로 불변이다');

select is(
  (select updated_at from public.inspections where ch = 'T97' and pos = 'L1'),
  now(),
  '재실행 시 updated_at 이 갱신된다');

select is(
  (select tread from public.inspections where ch = 'T97' and pos = 'L1'),
  17.5::numeric,
  '재실행이 값을 바꾸지 않는다');

-- 재실행은 실제 변경이 아니므로 변경 이력에 남지 않아야 합니다 (T-103 log_audit).
select is(
  (select count(*)::int
     from public.audit_log
    where table_name = 'inspections'
      and op = 'UPDATE'
      and new_value ->> 'ch' = 'T97'),
  0,
  '동일 데이터 재실행은 변경 이력을 남기지 않는다');

-- 값이 실제로 달라지면 갱신되고 이력도 남습니다.
do $do$ begin
  perform public.upsert_inspection('T97', date '2026-08-05', 'L1', 100, 16.0, 5188.4, 24310.5, 'T97SERIAL01', 'Budi');
end $do$;

select is(
  (select tread from public.inspections where ch = 'T97' and pos = 'L1'),
  16.0::numeric,
  '값이 달라지면 갱신된다');

select is(
  (select count(*)::int
     from public.audit_log
    where table_name = 'inspections'
      and op = 'UPDATE'
      and new_value ->> 'ch' = 'T97'),
  1,
  '실제 변경은 변경 이력 1건을 남긴다');

-- ── 소프트 삭제 복원 ───────────────────────────────────────
-- 지운 회차에 다시 점검을 입력하면 그 행은 되살아나야 합니다 (T-103 §14.3).
update public.inspections set deleted_at = now() where ch = 'T97';
do $do$ begin
  perform public.upsert_inspection('T97', date '2026-08-05', 'L1', 100, 16.0, 5188.4, 24310.5, 'T97SERIAL01', 'Budi');
end $do$;

select is(
  (select deleted_at from public.inspections where ch = 'T97' and pos = 'L1'),
  null::timestamptz,
  '소프트 삭제된 회차를 재입력하면 복원된다');

-- ── (b) 회차 멱등성 ────────────────────────────────────────
select is(
  public.upsert_inspection_round('T97', date '2026-08-06', 5200.0, 24400.0, 'Budi', $j$[
    {"pos": "L1",     "pressure": 100, "tread": 17.4},
    {"pos": "R1",     "pressure": 100, "tread": 17.1},
    {"pos": "L2 Out", "pressure": 116, "tread": 15.8},
    {"pos": "L2 In",  "pressure": null, "tread": 15.5},
    {"pos": "R2 In",  "pressure": null, "tread": 15.2},
    {"pos": "R2 Out", "pressure": 116, "tread": 15.9},
    {"pos": "L3 Out", "pressure": 116, "tread": 12.3},
    {"pos": "L3 In",  "pressure": null, "tread": 12.0},
    {"pos": "R3 In",  "pressure": null, "tread": 11.8},
    {"pos": "R3 Out", "pressure": 116, "tread": 12.1}
  ]$j$::jsonb),
  10,
  '회차 UPSERT 1회 호출이 10행을 저장한다');

-- 같은 배열을 그대로 다시 넣는다.
do $do$ begin
  perform public.upsert_inspection_round('T97', date '2026-08-06', 5200.0, 24400.0, 'Budi', $j$[
    {"pos": "L1",     "pressure": 100, "tread": 17.4},
    {"pos": "R1",     "pressure": 100, "tread": 17.1},
    {"pos": "L2 Out", "pressure": 116, "tread": 15.8},
    {"pos": "L2 In",  "pressure": null, "tread": 15.5},
    {"pos": "R2 In",  "pressure": null, "tread": 15.2},
    {"pos": "R2 Out", "pressure": 116, "tread": 15.9},
    {"pos": "L3 Out", "pressure": 116, "tread": 12.3},
    {"pos": "L3 In",  "pressure": null, "tread": 12.0},
    {"pos": "R3 In",  "pressure": null, "tread": 11.8},
    {"pos": "R3 Out", "pressure": 116, "tread": 12.1}
  ]$j$::jsonb);
end $do$;

select is(
  (select count(*)::int from public.inspections
    where ch = 'T97' and inspection_date = date '2026-08-06'),
  10,
  '동일 회차 2회 실행 후에도 레코드 수가 10으로 불변이다');

select is(
  (select count(*)::int from public.inspections
    where ch = 'T97' and inspection_date = date '2026-08-06'
      and hm = 5200.0 and km = 24400.0 and driver = 'Budi'),
  10,
  '회차 메타(HM · KM · 운전자)가 10행 모두에 채워진다');

-- ── 잘못된 입력 ────────────────────────────────────────────
select throws_ok(
  $$ select public.upsert_inspection_round('T97', date '2026-08-06', 1, 1, 'Budi', '{"pos":"L1"}'::jsonb) $$,
  '22023', null,
  'p_rows 가 배열이 아니면 거부한다');

select throws_ok(
  $$ select public.upsert_inspection_round('T97', date '2026-08-06', 1, 1, 'Budi', '[{"tread":10}]'::jsonb) $$,
  '22023', null,
  '원소에 pos 가 없으면 거부한다');

select finish();
rollback;
