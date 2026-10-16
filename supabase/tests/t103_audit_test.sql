-- ============================================================
-- Samtan TMS — T-103 감사 컬럼·트리거 회귀 테스트 (pgTAP)
--
-- 실행: supabase test db
-- 전체를 트랜잭션으로 감싸고 마지막에 rollback 하므로 로컬 DB 상태를 바꾸지 않습니다.
--
-- 주의: now() 는 트랜잭션 시각이라 한 트랜잭션 안에서는 값이 변하지 않습니다.
--       updated_at 갱신 확인은 삽입 시 과거 시각을 명시해 두고 비교합니다.
-- ============================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- ── 구조 확인 ──────────────────────────────────────────────
select has_column('public', 'vehicles',          'deleted_at', 'vehicles.deleted_at 이 존재한다');
select has_column('public', 'vehicle_positions', 'deleted_at', 'vehicle_positions.deleted_at 이 존재한다');
select has_column('public', 'replacements',      'deleted_at', 'replacements.deleted_at 이 존재한다');
select has_column('public', 'inspections',       'deleted_at', 'inspections.deleted_at 이 존재한다');
select has_column('public', 'vehicles',          'created_at', 'vehicles.created_at 이 존재한다');
select has_column('public', 'replacements', 'updated_by_email', 'replacements.updated_by_email 이 존재한다');
select has_column('public', 'audit_log',         'op',         'audit_log.op 이 존재한다');
select has_index('public', 'inspections', 'idx_insp_active', '유효 레코드 부분 인덱스가 존재한다');
select has_function('public', 'log_audit', '변경 기록 트리거 함수가 존재한다');

-- 백필 기준식 확인 — WIB(UTC+7) 자정은 전날 17:00 UTC 다.
select is(
  (date '2026-04-02'::timestamp at time zone 'Asia/Jakarta'),
  timestamptz '2026-04-01 17:00:00+00',
  'created_at 백필식은 점검일 WIB 자정을 UTC 로 환산한다');

-- ── 픽스처 ────────────────────────────────────────────────
insert into public.vehicles (ch, seq, hm_reset, updated_at)
  values ('T98', 98, false, timestamptz '2000-01-01 00:00:00+00');
insert into public.vehicle_positions (ch, pos, serial, seq)
  values ('T98', 'L1', 'TESTSERIAL0098', 1);
insert into public.inspections (ch, inspection_date, pos, pressure, tread)
  values ('T98', date '2026-01-01', 'L1', 100, 22);
insert into public.replacements (ch, pos, date, new_serial)
  values ('T98', 'L1', date '2026-01-02', 'TESTSERIAL0099');

-- ── updated_at 자동 갱신 ───────────────────────────────────
update public.vehicles set seq = 97 where ch = 'T98';

select is(
  (select updated_at from public.vehicles where ch = 'T98'),
  now(),
  'UPDATE 시 updated_at 이 자동 갱신된다');

-- ── audit_log 기록 ─────────────────────────────────────────
select is(
  (select count(*)::int from public.audit_log
    where table_name = 'vehicles' and op = 'INSERT' and record_pk ->> 'ch' = 'T98'),
  1,
  'INSERT 가 audit_log 에 1건 기록된다');

select is(
  (select new_value ->> 'ch' from public.audit_log
    where table_name = 'vehicles' and op = 'INSERT' and record_pk ->> 'ch' = 'T98'),
  'T98',
  'INSERT 기록의 new_value 에 행 전체가 JSONB 로 담긴다');

select is(
  (select old_value from public.audit_log
    where table_name = 'vehicles' and op = 'INSERT' and record_pk ->> 'ch' = 'T98'),
  null,
  'INSERT 기록의 old_value 는 NULL 이다');

select is(
  (select (old_value ->> 'seq') || '→' || (new_value ->> 'seq') from public.audit_log
    where table_name = 'vehicles' and op = 'UPDATE' and record_pk ->> 'ch' = 'T98'),
  '98→97',
  'UPDATE 가 변경 전후 값을 함께 기록한다');

-- 감사 컬럼만 달라진 UPDATE 는 잡음이므로 기록하지 않는다.
-- (set_updated_at 이 항상 now() 를 쓰므로 트리거를 잠시 꺼서 상황을 재현한다.)
alter table public.vehicles disable trigger trg_vehicles_updated_at;
update public.vehicles set updated_at = timestamptz '2030-01-01 00:00:00+00' where ch = 'T98';
alter table public.vehicles enable trigger trg_vehicles_updated_at;

select is(
  (select count(*)::int from public.audit_log
    where table_name = 'vehicles' and op = 'UPDATE' and record_pk ->> 'ch' = 'T98'),
  1,
  'updated_at 만 달라진 UPDATE 는 기록되지 않는다');

select is(
  (select record_pk from public.audit_log
    where table_name = 'vehicle_positions' and op = 'INSERT'
      and record_pk ->> 'ch' = 'T98'),
  '{"ch": "T98", "pos": "L1"}'::jsonb,
  '복합 PK 는 record_pk 에 두 컬럼 모두 기록된다');

-- ── 하드 삭제 차단 ─────────────────────────────────────────
select throws_ok(
  $$delete from public.inspections where ch = 'T98'$$,
  '23001',
  null,
  'inspections 하드 삭제는 차단된다 (§3.1-3)');

select throws_ok(
  $$delete from public.replacements where ch = 'T98'$$,
  '23001',
  null,
  'replacements 하드 삭제는 차단된다 (§3.1-3)');

-- ── 소프트 삭제 ────────────────────────────────────────────
select lives_ok(
  $$update public.inspections set deleted_at = now()
     where ch = 'T98' and inspection_date = date '2026-01-01'$$,
  '소프트 삭제는 허용된다');

select is(
  (select count(*)::int from public.inspections
    where ch = 'T98' and deleted_at is not null),
  1,
  '소프트 삭제 후에도 레코드는 남고 deleted_at 만 채워진다');

select is(
  (select count(*)::int from public.audit_log a
    join public.inspections i on i.id::text = a.record_pk ->> 'id'
   where a.table_name = 'inspections' and a.op = 'UPDATE'
     and a.old_value ->> 'deleted_at' is null
     and a.new_value ->> 'deleted_at' is not null
     and i.ch = 'T98'),
  1,
  '소프트 삭제도 audit_log 에 UPDATE 로 남는다');

-- ── 소프트 삭제 권한 ───────────────────────────────────────
-- 하드 삭제는 RLS 상 admin 전용이었다. UPDATE 로 바뀌어도 그 경계가 유지되는지 본다.
-- JWT 클레임을 흉내내면 auth.uid() · app_role() 이 실제처럼 동작한다.

insert into public.inspections (ch, inspection_date, pos, pressure)
  values ('T98', date '2026-01-05', 'L1', 100);

do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"i@example.com","app_metadata":{"role":"inspector"}}',
  true); end $$;

select throws_ok(
  $$update public.inspections set deleted_at = now()
     where ch = 'T98' and inspection_date = date '2026-01-05'$$,
  '42501',
  null,
  '점검자(inspector)는 회차를 삭제할 수 없다');

do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"a@example.com","app_metadata":{"role":"admin"}}',
  true); end $$;

select lives_ok(
  $$update public.inspections set deleted_at = now()
     where ch = 'T98' and inspection_date = date '2026-01-05'$$,
  '관리자(admin)는 회차를 삭제할 수 있다');

do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select * from finish();
rollback;
