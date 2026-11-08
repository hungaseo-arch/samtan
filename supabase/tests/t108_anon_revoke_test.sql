-- t108 · M-16 — public 스키마에 anon 권한이 하나도 없다 (재발 방지)
--   20261108100000_revoke_anon_views
--
-- 뷰 6개만 검사하지 않는다. «public 스키마 어디에도 anon 권한이 없음» 을 검사한다:
--   · 관계(테이블·뷰·머티리얼라이즈드 뷰·파티션 테이블·외부 테이블)의 모든 권한
--   · 컬럼 단위 권한
--   · 시퀀스
--   · 함수 EXECUTE 중 anon 에게 명시 부여된 것 (PUBLIC 기본 권한은 별개 — 20260906100000 이 처리)
-- 앞으로 누가 `grant … to anon` 을 다시 쓰면 이 테스트가 오브젝트 이름과 함께 실패한다.
-- 검사가 헐렁하지 않다는 증명: 테스트 안에서 anon 에게 grant 한 뷰를 만들어 잡히는지 확인한다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- 검사 쿼리를 함수로 — 아래에서 «진짜» 와 «프로브 포함» 에 같은 식을 쓴다
create function public.t108_anon_exposure() returns table (kind text, obj text, priv text)
language sql stable as $$
  select 'relation'::text, n.nspname || '.' || c.relname, p.privilege_type
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege_type)
   where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')
     and has_table_privilege('anon', c.oid, p.privilege_type)
  union all
  select 'column', n.nspname || '.' || c.relname || '.' || a.attname, p.privilege_type
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) p(privilege_type)
   where n.nspname = 'public' and c.relkind in ('r','v','m','p','f') and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('anon', c.oid, a.attnum, p.privilege_type)
  union all
  select 'sequence', n.nspname || '.' || c.relname, p.privilege_type
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(array['USAGE','SELECT','UPDATE']) p(privilege_type)
   where n.nspname = 'public' and c.relkind = 'S'
     and has_sequence_privilege('anon', c.oid, p.privilege_type)
  union all
  select 'function', n.nspname || '.' || f.proname, 'EXECUTE'
    from pg_proc f join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public'
     and exists (select 1 from aclexplode(f.proacl) a
                  where a.grantee = (select oid from pg_roles where rolname = 'anon'))
$$;

-- ── 본 검사 ───────────────────────────────────────────────
select is_empty($$select * from public.t108_anon_exposure() where kind = 'relation'$$,
                'public 의 테이블·뷰 어디에도 anon 권한이 없다');
select is_empty($$select * from public.t108_anon_exposure() where kind = 'column'$$,
                'public 의 컬럼 단위 anon 권한이 없다');
select is_empty($$select * from public.t108_anon_exposure() where kind = 'sequence'$$,
                'public 의 시퀀스에 anon 권한이 없다');
select is_empty($$select * from public.t108_anon_exposure() where kind = 'function'$$,
                'public 의 함수에 anon 에게 명시 부여된 EXECUTE 가 없다');

-- M-16 대상 6개 — authenticated 는 계속 읽는다
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname in ('v_tire_ledger','v_tire_ledger_total','v_odometer_anomaly',
                                'v_wear_pattern','v_tco_unit','v_tco_fleet')
              and has_table_privilege('authenticated', c.oid, 'select')),
          6, 'M-16 뷰 6개 모두 authenticated SELECT 유지');
select ok(has_table_privilege('authenticated', 'public.v_tire_ledger', 'select')
          and not has_table_privilege('anon', 'public.v_tire_ledger', 'select'),
          'v_tire_ledger — authenticated 예 · anon 아니오');

-- ── 검사가 실제로 잡는지 (프로브) ─────────────────────────
create view public.t108_probe as select 1 as x;
grant select on public.t108_probe to anon;
select is((select count(*)::int from public.t108_anon_exposure() where obj = 'public.t108_probe'),
          1, '프로브: anon 에게 grant 한 뷰는 검사에 잡힌다 (검사가 헐렁하지 않다)');
revoke all on public.t108_probe from anon;
select is((select count(*)::int from public.t108_anon_exposure() where obj = 'public.t108_probe'),
          0, '프로브: 회수하면 다시 0');

select * from finish();
rollback;
