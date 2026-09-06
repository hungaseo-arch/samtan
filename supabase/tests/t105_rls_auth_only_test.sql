-- t105 · 익명 읽기 차단 (20260906100000_rls_authenticated_only)
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ── anon 에게 열린 SELECT 정책이 하나도 없다 ───────────────────────────────
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and cmd = 'SELECT'
      and (roles @> array['anon'::name] or roles @> array['public'::name])),
  0, 'anon/public 대상 SELECT 정책 없음');

-- ── RLS 테이블마다 authenticated select 정책 존재 ─────────────────────────
select ok(exists(select 1 from pg_policies where tablename = 'inspections'
  and policyname = 'inspections authenticated select' and roles = array['authenticated'::name]),
  'inspections authenticated select 정책');
select ok(exists(select 1 from pg_policies where tablename = 'replacements'
  and policyname = 'replacements authenticated select' and roles = array['authenticated'::name]),
  'replacements authenticated select 정책');
select ok(exists(select 1 from pg_policies where tablename = 'cost_params'
  and policyname = 'cost_params authenticated select' and roles = array['authenticated'::name]),
  'cost_params authenticated select 정책');

-- ── anon 권한 ──────────────────────────────────────────────────────────────
select ok(not has_table_privilege('anon', 'public.inspections', 'SELECT'), 'anon: inspections SELECT 없음');
select ok(not has_table_privilege('anon', 'public.v_inspections_wide', 'SELECT'), 'anon: v_inspections_wide SELECT 없음');
select ok(not has_table_privilege('anon', 'public.cost_params', 'TRUNCATE'), 'anon: cost_params TRUNCATE 없음');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anon: public 함수 EXECUTE 전부 없음');

-- ── authenticated 는 여전히 읽고 RPC 를 부른다 ────────────────────────────
select ok(has_table_privilege('authenticated', 'public.inspections', 'SELECT'), 'authenticated: inspections SELECT');
select ok(has_table_privilege('authenticated', 'public.v_inspections_wide', 'SELECT'), 'authenticated: v_inspections_wide SELECT');
select ok(has_function_privilege('authenticated', 'public.app_role()', 'EXECUTE'), 'authenticated: app_role EXECUTE');

-- ── 트리거 함수는 아무도 직접 못 부른다 (트리거 발화는 EXECUTE 검사 없음) ───
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  0, '트리거 함수 EXECUTE: anon/authenticated 없음');

-- 트리거가 실제로 도는지 — 픽스처는 postgres 로 넣고 점검만 authenticated 로 넣는다
insert into public.vehicles (ch, seq, hm_reset) values ('T96', 96, false);
insert into public.vehicle_positions (ch, pos, serial, seq) values ('T96', 'L1', 'TESTSERIAL0096', 1);
-- 트리거가 실제로 도는지: authenticated 로 insert 하면 SECURITY DEFINER 트리거(log_audit 등) 가 실행된다
do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"a@example.com","app_metadata":{"role":"admin"}}',
  true); end $$;
set local role authenticated;
select lives_ok(
  $$insert into public.inspections (ch, inspection_date, pos, pressure)
      values ('T96', date '2026-01-06', 'L1', 100)$$,
  'authenticated 로 insert — 트리거 함수 EXECUTE 없이도 트리거가 돈다');
reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

-- ── 뷰·인덱스 ─────────────────────────────────────────────────────────────
select ok((select coalesce(reloptions::text, '') like '%security_invoker=on%'
             from pg_class where oid = 'public.v_data_quality'::regclass),
  'v_data_quality security_invoker=on');
select has_index('public', 'replacements', 'replacements_removal_code_idx', 'replacements(removal_code) 인덱스');

select * from finish();
rollback;
