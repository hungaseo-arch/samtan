-- 2026-09-06 · 익명(anon) 읽기 차단 — 로그인한 사용자만 데이터를 읽는다
--
-- 배경: 0006 이후 모든 테이블의 select 정책이 `using (true)` 로 anon 에게 열려 있었고
-- anon 역할이 테이블·뷰에 SELECT(일부는 ALL) 권한을 갖고 있었다. 사이트에 박힌
-- publishable 키만 있으면 로그인 없이 점검·교체·원가 데이터 전부를 읽을 수 있던 상태.
--
-- 조치:
--   1) anon/public 대상 select 정책을 전부 지우고 `to authenticated` 정책으로 다시 만든다
--   2) anon 의 테이블·뷰·시퀀스·함수 권한을 전부 회수하고 기본 권한(default privileges)도 막는다
--   3) 트리거 함수(SECURITY DEFINER) 는 SQL 에서 직접 호출할 이유가 없으므로 EXECUTE 를 전부 회수한다
--      (트리거 발화 시에는 EXECUTE 권한을 검사하지 않는다)
--   4) RPC 함수는 authenticated 에게만 EXECUTE 를 준다 (PUBLIC 기본 권한 제거)
--
-- 클라이언트 쪽은 같은 커밋에서 로그인 이후에만 loadData() 를 부르도록 바뀐다.
-- 멱등: 여러 번 실행해도 같은 결과.

-- ── 1. select 정책: anon/public → authenticated ─────────────────────────────
do $$
declare
  p record;
  t text;
begin
  -- anon 또는 public(모든 역할) 에게 열린 SELECT 정책 제거
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and cmd = 'SELECT'
       and (roles @> array['anon'::name] or roles @> array['public'::name])
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;

  -- RLS 가 켜진 테이블마다 "<table> authenticated select" 정책 보장 (audit_log 는 admin 전용 유지)
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and c.relname <> 'audit_log'
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = t || ' authenticated select'
    ) then
      execute format('create policy %I on public.%I for select to authenticated using (true)',
                     t || ' authenticated select', t);
    end if;
  end loop;
end $$;

-- ── 2. anon 권한 회수 ────────────────────────────────────────────────────────
revoke all on all tables    in schema public from anon;   -- 뷰 포함
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- 앞으로 만들 객체에도 anon 권한이 자동으로 붙지 않게 (Supabase 기본값은 anon 에게도 grant)
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- ── 3. 함수 EXECUTE 정리 ────────────────────────────────────────────────────
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    -- PUBLIC 기본 EXECUTE 제거 (anon 은 PUBLIC 을 통해서도 실행할 수 있었다)
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trigger then
      -- 트리거 함수는 직접 호출 금지
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- 새 함수도 PUBLIC 에게 자동으로 열리지 않게
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- ── 4. 뷰: 호출자 권한으로 (advisor security_definer_view) ──────────────────
alter view public.v_data_quality set (security_invoker = on);

-- ── 5. FK 커버링 인덱스 (advisor unindexed_foreign_keys) ─────────────────────
create index if not exists inspections_ch_pos_idx      on public.inspections (ch, pos);
create index if not exists replacements_ch_pos_idx     on public.replacements (ch, pos);
create index if not exists replacements_removal_code_idx on public.replacements (removal_code);
create index if not exists tire_events_damage_code_idx on public.tire_events (damage_code);

comment on policy "inspections authenticated select" on public.inspections is
  '2026-09-06: anon 읽기 차단. 로그인 사용자만 조회 가능';
