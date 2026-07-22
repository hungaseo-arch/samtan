-- ============================================================
-- Samtan TMS — 역할 명칭 변경
--   staff → inspector (점검 / Inspektur)
--   user  → viewer    (조회 / Pelihat)
--   admin 은 그대로.
--
-- 순서가 중요하다. 역할은 로그인 시점의 JWT에 담기므로, 이미 로그인해 있는
-- 사용자의 토큰에는 여전히 옛 값('staff')이 들어 있다. 정책을 새 값만 받도록
-- 바꾸면 그 사람들은 재로그인 전까지 쓰기 권한을 잃는다.
-- 그래서 app_role() 이 옛 값을 새 값으로 정규화하도록 만들고, 정책은 새 값만
-- 검사한다. 이러면 옛 토큰·새 토큰 모두 정상 동작한다.
-- ============================================================

-- 1) 역할 조회 함수 — 옛 값을 새 값으로 정규화. 미지정 기본값도 viewer 로 변경.
create or replace function public.app_role() returns text
  language sql stable
  set search_path = ''
as $$
  select case coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'viewer')
           when 'staff' then 'inspector'   -- 구 값 호환
           when 'user'  then 'viewer'      -- 구 값 호환
           else coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'viewer')
         end
$$;

-- 2) 정책 재작성 — 쓰기는 inspector·admin, 삭제는 admin.
drop policy if exists "inspections write insert" on public.inspections;
drop policy if exists "inspections write update" on public.inspections;
drop policy if exists "inspections write delete" on public.inspections;

create policy "inspections write insert" on public.inspections
  for insert to authenticated with check (public.app_role() in ('inspector','admin'));
create policy "inspections write update" on public.inspections
  for update to authenticated using (public.app_role() in ('inspector','admin'))
  with check (public.app_role() in ('inspector','admin'));
create policy "inspections write delete" on public.inspections
  for delete to authenticated using (public.app_role() = 'admin');

do $$
declare t text;
begin
  foreach t in array array['tire_config','vehicles','vehicle_positions','replacements','lifetimes','damage_codes']
  loop
    execute format('drop policy if exists "%s write insert" on public.%I', t, t);
    execute format('drop policy if exists "%s write update" on public.%I', t, t);
    execute format('drop policy if exists "%s write delete" on public.%I', t, t);

    execute format('create policy "%s write insert" on public.%I for insert to authenticated with check (public.app_role() in (''inspector'',''admin''))', t, t);
    execute format('create policy "%s write update" on public.%I for update to authenticated using (public.app_role() in (''inspector'',''admin'')) with check (public.app_role() in (''inspector'',''admin''))', t, t);
    execute format('create policy "%s write delete" on public.%I for delete to authenticated using (public.app_role() = ''admin'')', t, t);
  end loop;
end $$;

-- 3) 기존 계정의 저장값을 새 명칭으로 이관.
update auth.users
   set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{role}', '"inspector"')
 where raw_app_meta_data ->> 'role' = 'staff';

update auth.users
   set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{role}', '"viewer"')
 where raw_app_meta_data ->> 'role' = 'user';
