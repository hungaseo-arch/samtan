-- ============================================================
-- Samtan TMS — RLS 강화: 읽기는 anon 허용 / 쓰기는 인증 사용자만
--
-- 배경: publishable(anon) 키가 클라이언트(공개 저장소 포함)에 노출되어
--       기존 "for all using(true)" 정책에서는 누구나 DB를 변경·삭제할 수 있었음.
-- 변경: SELECT 는 anon 포함 모두 허용, INSERT/UPDATE/DELETE 는 authenticated 만 허용.
--
-- ⚠️ 영향: 현재 점검 입력(InspectionTab) 저장·삭제는 anon 키로 동작하므로,
--          이 마이그레이션 적용 후에는 로그인(Supabase Auth)으로 발급된
--          authenticated 세션이 있어야 저장·삭제가 됩니다. (조회는 그대로 동작)
-- ============================================================

-- ── 측정 데이터: inspections ──
alter table public.inspections enable row level security;

-- 기존(전체 허용) 정책 제거
drop policy if exists "inspections anon select" on public.inspections;
drop policy if exists "inspections anon insert" on public.inspections;
drop policy if exists "inspections anon update" on public.inspections;
drop policy if exists "inspections anon delete" on public.inspections;
-- 재적용 시 멱등성을 위해 새 정책명도 미리 제거
drop policy if exists "inspections public select" on public.inspections;
drop policy if exists "inspections auth insert" on public.inspections;
drop policy if exists "inspections auth update" on public.inspections;
drop policy if exists "inspections auth delete" on public.inspections;

-- 읽기: 누구나(anon 포함)
create policy "inspections public select" on public.inspections
  for select using (true);
-- 쓰기: 인증 사용자만
create policy "inspections auth insert" on public.inspections
  for insert to authenticated with check (true);
create policy "inspections auth update" on public.inspections
  for update to authenticated using (true) with check (true);
create policy "inspections auth delete" on public.inspections
  for delete to authenticated using (true);

-- 권한: anon 은 SELECT 만, authenticated 는 전체
revoke all on public.inspections from anon;
grant select on public.inspections to anon;
grant all on public.inspections to authenticated, service_role;

-- ── 참조 데이터(6개 테이블): 동일 정책 적용 ──
do $$
declare t text;
begin
  foreach t in array array['tire_config','vehicles','vehicle_positions','replacements','lifetimes','damage_codes']
  loop
    execute format('alter table public.%I enable row level security', t);

    -- 기존(전체 허용) 정책 제거
    execute format('drop policy if exists "%s anon all" on public.%I', t, t);
    -- 새 정책 멱등 제거
    execute format('drop policy if exists "%s public select" on public.%I', t, t);
    execute format('drop policy if exists "%s auth insert" on public.%I', t, t);
    execute format('drop policy if exists "%s auth update" on public.%I', t, t);
    execute format('drop policy if exists "%s auth delete" on public.%I', t, t);

    -- 읽기: 누구나 / 쓰기: 인증 사용자만
    execute format('create policy "%s public select" on public.%I for select using (true)', t, t);
    execute format('create policy "%s auth insert" on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy "%s auth update" on public.%I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy "%s auth delete" on public.%I for delete to authenticated using (true)', t, t);

    -- 권한: anon 은 SELECT 만, authenticated 는 전체
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant all on public.%I to authenticated, service_role', t);
  end loop;
end $$;
