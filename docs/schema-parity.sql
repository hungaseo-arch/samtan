-- 스키마 동일성 검증 (T-001 완료 조건)
--
-- 목적: `supabase db reset` 으로 재구성한 로컬 DB가 프로덕션 스키마를 그대로
--       재현하는지 확인한다. 로컬과 프로덕션에서 각각 실행해 출력이 같으면 동일하다.
--
-- 실행:
--   로컬      psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -f docs/schema-parity.sql
--   프로덕션  Supabase SQL Editor 에 붙여넣기 (SELECT 뿐이므로 읽기 전용)
--
-- 함수 해시는 `--` 주석과 연속 공백을 제거하고 계산한다. 프로덕션에는 마이그레이션이
-- 주석 없이 적용된 이력이 있어, 주석을 포함하면 의미가 같아도 해시가 달라진다.

with cols as (
  select string_agg(
           table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'-'),
           E'\n' order by table_name, column_name) s
  from information_schema.columns where table_schema = 'public'
),
cons as (
  select string_agg(
           conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid),
           E'\n' order by conrelid::regclass::text, conname) s
  from pg_constraint where connamespace = 'public'::regnamespace
),
idx as (
  select string_agg(indexname||'|'||indexdef, E'\n' order by indexname) s
  from pg_indexes where schemaname = 'public'
),
pol as (
  select string_agg(
           tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||
           coalesce(qual,'-')||'|'||coalesce(with_check,'-'),
           E'\n' order by tablename, policyname) s
  from pg_policies where schemaname = 'public'
),
tbl as (
  select string_agg(c.relname||':'||c.relrowsecurity::text, E'\n' order by c.relname) s
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
fn as (
  select string_agg(
           p.proname||':'||md5(regexp_replace(
             regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
             '\s+', ' ', 'g')),
           E'\n' order by p.proname) s
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select 'columns     = '||md5(cols.s) from cols
union all select 'constraints = '||md5(cons.s) from cons
union all select 'indexes     = '||md5(idx.s)  from idx
union all select 'policies    = '||md5(pol.s)  from pol
union all select 'tables_rls  = '||md5(tbl.s)  from tbl
union all select 'functions   = '||md5(fn.s)   from fn;

-- 2026-08-01 검증 결과 — 로컬(db reset 직후)과 프로덕션이 전 항목 일치:
--   columns     = c30eb5bda4297870c0139c330f2c2998
--   constraints = 3c0de79dcceec70e74f515dd17fc1c1b
--   indexes     = b1643380519f1d802868209b2cc750d5
--   policies    = da33f3cece9894d82f84961fa24cb091
--   tables_rls  = c3a9b2522541b056d0b62824ff994e1b
--   functions   = 4c51f0ad94fb0e3452eb60f759be12c5
