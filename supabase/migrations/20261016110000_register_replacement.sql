-- ============================================================
-- 교체 등록 RPC (지시서 2026-10-16 §A-1)
--
-- 지금까지 교체는 SQL 로만 넣을 수 있었다. 화면에서 한 번에 등록하도록 RPC 를 둔다.
--
-- 기존 구조를 그대로 쓴다 (사용자 결정 2026-10-16 — 기존 구조 재사용):
--   · 현재 장착 시리얼의 단일 출처는 v_current_tire. current_serial 컬럼을 새로 만들지 않는다
--   · replacements 에는 old_serial·removal_code·removal_tread_min 이 이미 있다 (T-2)
--   · INSERT 뒤의 일은 기존 트리거가 한다
--       trg_replacements_a_ensure_lifetime  신 타이어 lifetimes 행 생성 (Install)
--       trg_replacements_b_retire_prev      구 타이어 Install → Spare
--       trg_replacements_c_sync_position    vehicle_positions.serial2 동기화
--   여기서 더하는 것은 검증과, 트리거가 하지 않는 두 가지
--   (구 타이어 Scrap 처리 · 이미 행이 있던 신 타이어의 Install 전환)뿐이다.
--
-- 추가 컬럼:
--   · replacements.km_at / hm_at  — 교체 시점 차량 계기값
--   · lifetimes.install_date / scrap_date — text 컬럼(install·scrap)에서 파생되는 date.
--     기존 쓰기 경로가 전부 text 를 쓰므로 text 가 원본이고, 트리거가 date 를 맞춘다.
--     "-"·빈값·형식 불일치는 NULL. 구 text 컬럼은 호환용으로 그대로 둔다.
--   · damage_codes 'ROT' (로테이션)
--
-- 멱등: if not exists / create or replace / on conflict.
-- ============================================================

-- ── replacements: 교체 시점 계기값 ──────────────────────────
alter table public.replacements
  add column if not exists km_at numeric,
  add column if not exists hm_at numeric;

comment on column public.replacements.km_at is '교체 시점 차량 KM (계기값)';
comment on column public.replacements.hm_at is '교체 시점 차량 HM (계기값)';

alter table public.replacements drop constraint if exists replacements_meter_at_check;
alter table public.replacements
  add constraint replacements_meter_at_check check (
    (km_at is null or km_at >= 0) and (hm_at is null or hm_at >= 0)
  );

-- ── lifetimes: date 컬럼 ────────────────────────────────────
alter table public.lifetimes
  add column if not exists install_date date,
  add column if not exists scrap_date   date;

comment on column public.lifetimes.install_date is 'install(text)에서 파생. YYYY-MM-DD 가 아니면 NULL';
comment on column public.lifetimes.scrap_date   is 'scrap(text)에서 파생. YYYY-MM-DD 가 아니면 NULL';

-- 형식이 맞아도 2026-02-30 같은 값은 캐스트에서 터진다 — 예외를 NULL 로 삼킨다.
create or replace function public.safe_iso_date(p text)
returns date
language plpgsql
immutable
set search_path = public
as $$
begin
  if p is null or btrim(p) !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return btrim(p)::date;
exception when others then
  return null;
end $$;

create or replace function public.sync_lifetime_dates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.install_date := public.safe_iso_date(new.install);
  new.scrap_date   := public.safe_iso_date(new.scrap);
  return new;
end $$;

drop trigger if exists trg_lifetimes_sync_dates on public.lifetimes;
create trigger trg_lifetimes_sync_dates
  before insert or update of install, scrap on public.lifetimes
  for each row execute function public.sync_lifetime_dates();

-- 백필 — 값이 실제로 달라지는 행만 건드려 감사 로그를 늘리지 않는다.
update public.lifetimes
   set install_date = public.safe_iso_date(install),
       scrap_date   = public.safe_iso_date(scrap)
 where install_date is distinct from public.safe_iso_date(install)
    or scrap_date   is distinct from public.safe_iso_date(scrap);

-- ── damage_codes: 로테이션 ──────────────────────────────────
insert into public.damage_codes (code, description, description_id, tco_category, seq)
values (
  'ROT', '로테이션 (위치 교환)', 'Rotasi (tukar posisi)', null,
  (select coalesce(max(seq), 0) + 1 from public.damage_codes)
)
on conflict (code) do update
  set description    = excluded.description,
      description_id = excluded.description_id;

-- ── RPC ─────────────────────────────────────────────────────
-- security invoker — 호출자의 RLS(쓰기 inspector·admin)가 그대로 적용된다.
-- 오류는 'code:detail' 형식 메시지로 던지고 프런트가 code 로 문구를 고른다.
create or replace function public.register_replacement(
  p_ch          text,
  p_pos         text,
  p_date        date,
  p_new_serial  text,
  p_reason      text    default null,
  p_tread       numeric default null,
  p_km          numeric default null,
  p_hm          numeric default null,
  p_old_status  text    default 'Spare'
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new   text := nullif(btrim(p_new_serial), '');
  v_old   text;
  v_last  date;
  v_where text;
  v_id    uuid;
begin
  if coalesce(public.app_role(), '') not in ('inspector', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_new is null then
    raise exception 'serial_required';
  end if;
  if p_date is null then
    raise exception 'date_required';
  end if;
  if p_old_status not in ('Scrap', 'Spare') then
    raise exception 'bad_old_status:%', p_old_status;
  end if;
  if p_reason = 'ROT' and p_old_status = 'Scrap' then
    raise exception 'rot_cannot_scrap';
  end if;
  if p_reason is not null and not exists (select 1 from public.damage_codes where code = p_reason) then
    raise exception 'bad_reason:%', p_reason;
  end if;

  select t.serial into v_old
    from public.v_current_tire t
   where t.ch = p_ch and t.pos = p_pos;
  if not found then
    raise exception 'position_not_found:% %', p_ch, p_pos;
  end if;
  if v_old = v_new then
    raise exception 'same_serial:%', v_new;
  end if;

  -- 다른 포지션에 장착 중인 시리얼은 거부한다. 로테이션(ROT)은 장착 중인 타이어를
  -- 옮기는 것이 정의라 예외로 둔다 — 상대 포지션도 이어서 등록해야 한다.
  select t.ch || ' ' || t.pos into v_where
    from public.v_current_tire t
   where t.serial = v_new and not (t.ch = p_ch and t.pos = p_pos)
   limit 1;
  if v_where is not null and p_reason is distinct from 'ROT' then
    raise exception 'serial_installed:%', v_where;
  end if;

  if exists (select 1 from public.lifetimes l where l.serial = v_new and l.status = 'Scrap') then
    raise exception 'serial_scrapped:%', v_new;
  end if;

  -- 장착 구간은 날짜순으로 이어진다. 직전 교체보다 앞선 날짜는 구간을 뒤집는다.
  select max(r.date) into v_last
    from public.replacements r
   where r.ch = p_ch and r.pos = p_pos and r.deleted_at is null;
  if v_last is not null and p_date < v_last then
    raise exception 'date_before_last:%', v_last;
  end if;

  insert into public.replacements
    (ch, pos, date, new_serial, old_serial, removal_code, removal_tread_min, km_at, hm_at)
  values
    (p_ch, p_pos, p_date, v_new, v_old, p_reason, p_tread, p_km, p_hm)
  returning id into v_id;

  -- 구 타이어: Spare 는 트리거가 이미 처리했다. Scrap 만 여기서.
  -- 다른 포지션에 장착돼 있으면(로테이션 상대) 건드리지 않는다.
  if v_old is not null and p_old_status = 'Scrap'
     and not exists (select 1 from public.v_current_tire t where t.serial = v_old) then
    insert into public.lifetimes (serial, status)
    values (v_old, 'Scrap')
    on conflict (serial) where serial is not null do nothing;
    update public.lifetimes
       set status = 'Scrap',
           scrap  = to_char(p_date, 'YYYY-MM-DD'),
           damage = coalesce(p_reason, damage)
     where serial = v_old;
  end if;

  -- 신 타이어: 트리거는 행이 없을 때만 만든다. 예비(Spare)에서 올라온 타이어는 여기서 Install 로.
  -- 최초 장착일은 보존한다 — 비어 있을 때만 채운다.
  update public.lifetimes
     set status  = 'Install',
         install = case when public.safe_iso_date(install) is null
                        then to_char(p_date, 'YYYY-MM-DD') else install end
   where serial = v_new
     and (status is distinct from 'Install' or public.safe_iso_date(install) is null);

  return v_id;
end $$;

comment on function public.register_replacement is
  '교체 1건 등록 — replacements insert + 구 타이어 Scrap/Spare + 신 타이어 Install. 호출자 RLS 적용';

revoke all on function public.register_replacement(text, text, date, text, text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.register_replacement(text, text, date, text, text, numeric, numeric, numeric, text) to authenticated;

-- ============================================================
-- ROLLBACK:
--   drop function if exists public.register_replacement(text, text, date, text, text, numeric, numeric, numeric, text);
--   drop trigger  if exists trg_lifetimes_sync_dates on public.lifetimes;
--   drop function if exists public.sync_lifetime_dates();
--   alter table public.replacements drop constraint if exists replacements_meter_at_check;
--   -- 컬럼·ROT 코드는 남긴다 (DROP COLUMN 금지, ROT 를 참조한 교체 행이 있을 수 있음).
-- ============================================================
