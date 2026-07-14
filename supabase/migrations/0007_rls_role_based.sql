-- ============================================================
-- Samtan TMS — 역할(Role) 기반 RLS
--   admin : 모든 권한(입력·수정·삭제·다운로드)
--   staff : 입력·수정(+다운로드)
--   user  : 읽기만 (기본)
-- 역할은 auth.users.app_metadata.role 에 저장(관리자/service_role만 설정 가능, JWT에 포함).
--   조회: JWT의 (auth.jwt() -> 'app_metadata' ->> 'role')
--
-- 정책: SELECT 는 모두 허용(0006 유지). INSERT/UPDATE 는 staff·admin, DELETE 는 admin.
--
-- ⚠️ 역할 미지정 계정은 user(읽기)로 취급되어 쓰기 불가.
--    역할 부여: 대시보드 Authentication → Users → 사용자 → app_metadata 에
--      { "role": "admin" }  또는  { "role": "staff" }  설정.
-- ============================================================

-- 편의: 현재 사용자의 role
create or replace function public.current_role() returns text
  language sql stable
  set search_path = ''
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'user') $$;

-- ── 측정 데이터: inspections ──
drop policy if exists "inspections auth insert" on public.inspections;
drop policy if exists "inspections auth update" on public.inspections;
drop policy if exists "inspections auth delete" on public.inspections;
drop policy if exists "inspections write insert" on public.inspections;
drop policy if exists "inspections write update" on public.inspections;
drop policy if exists "inspections write delete" on public.inspections;

create policy "inspections write insert" on public.inspections
  for insert to authenticated with check (public.current_role() in ('staff','admin'));
create policy "inspections write update" on public.inspections
  for update to authenticated using (public.current_role() in ('staff','admin'))
  with check (public.current_role() in ('staff','admin'));
create policy "inspections write delete" on public.inspections
  for delete to authenticated using (public.current_role() = 'admin');

-- ── 참조 데이터(6개 테이블): 동일 정책 ──
do $$
declare t text;
begin
  foreach t in array array['tire_config','vehicles','vehicle_positions','replacements','lifetimes','damage_codes']
  loop
    execute format('drop policy if exists "%s auth insert" on public.%I', t, t);
    execute format('drop policy if exists "%s auth update" on public.%I', t, t);
    execute format('drop policy if exists "%s auth delete" on public.%I', t, t);
    execute format('drop policy if exists "%s write insert" on public.%I', t, t);
    execute format('drop policy if exists "%s write update" on public.%I', t, t);
    execute format('drop policy if exists "%s write delete" on public.%I', t, t);

    execute format('create policy "%s write insert" on public.%I for insert to authenticated with check (public.current_role() in (''staff'',''admin''))', t, t);
    execute format('create policy "%s write update" on public.%I for update to authenticated using (public.current_role() in (''staff'',''admin'')) with check (public.current_role() in (''staff'',''admin''))', t, t);
    execute format('create policy "%s write delete" on public.%I for delete to authenticated using (public.current_role() = ''admin'')', t, t);
  end loop;
end $$;
