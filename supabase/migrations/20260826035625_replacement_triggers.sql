-- ============================================================
-- Samtan TMS — M3. 동기화·자동생성 트리거
--
-- 근거: 데이터 정합성 개선 작업지시서 v1 §Phase 1 / M3 (항목 1·3·4)
--
-- 배경: 지금까지 replacements 에 교체를 넣으면 사람이 SQL 한 줄로
--       vehicle_positions.serial2 를 UPDATE 하고, 원장 엑셀에서 lifetimes 행을
--       손으로 옮겼다. 그 한 줄을 빠뜨린 것이 2026-08-18 "타이어 이력이
--       조회되지 않는다" 사고의 원인이다. 이 마이그레이션이 그 수작업을 없앤다.
--
-- 선행: M1(lifetimes_serial_uniq) · M2(v_current_tire)
-- 멱등성: create or replace function · drop trigger if exists + create trigger
--
-- ⚠ 트리거 실행 순서가 중요하다. retire_previous_tire() 는 v_current_tire 를 읽어
--   "구 타이어가 다른 포지션에 장착돼 있는지"를 판단한다. 이름 앞의 a_/b_/c_ 는
--   그 순서를 고정하기 위한 것이다 (PostgreSQL 은 같은 시점 트리거를 이름
--   알파벳순으로 실행한다). 이름을 바꾸지 말 것 (§4).
-- ============================================================

-- ── (A) 항목 3 : replacements → vehicle_positions.serial2 자동 동기화 ──
-- serial2 는 이제 사람이 쓰는 칸이 아니라 이 함수가 유지하는 캐시다.
-- INSERT/UPDATE/DELETE 어느 쪽이든 (ch,pos) 의 최신 교체분을 다시 계산해 덮는다.
create or replace function public.sync_position_current_serial()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_ch text; v_pos text; v_latest text;
begin
  v_ch  := coalesce(new.ch,  old.ch);
  v_pos := coalesce(new.pos, old.pos);

  select r.new_serial into v_latest
    from public.replacements r
   where r.ch = v_ch and r.pos = v_pos and r.deleted_at is null
   order by r.date desc, r.created_at desc
   limit 1;

  -- is distinct from 으로 걸러 값이 같으면 UPDATE 자체를 하지 않는다.
  -- (불필요한 audit_log 잡음과 updated_at 갱신을 막는다)
  update public.vehicle_positions vp
     set serial2 = v_latest
   where vp.ch = v_ch and vp.pos = v_pos
     and vp.serial2 is distinct from v_latest;

  return null;
end $$;

-- ── (B) 항목 1 : 신규 시리얼의 lifetimes 행 자동 생성 ──────
-- replacements 와 vehicle_positions 양쪽에서 호출된다 (TG_TABLE_NAME 으로 분기).
create or replace function public.ensure_lifetime_row()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_serial text; v_date date;
begin
  if TG_TABLE_NAME = 'replacements' then
    v_serial := new.new_serial;
    v_date   := new.date;
  else  -- vehicle_positions
    v_serial := coalesce(new.serial2, new.serial);
    v_date   := current_date;
  end if;

  if v_serial is null then return null; end if;

  -- lifetimes.install 은 text('YYYY-MM-DD') 컬럼이라 to_char 로 맞춘다.
  -- ON CONFLICT 대상은 M1 의 부분 유니크 인덱스 lifetimes_serial_uniq 다.
  -- 부분 인덱스는 추론식에 동일한 술어(where serial is not null)를 함께 써야
  -- 매칭된다. 위에서 NULL 을 걸러냈으므로 새 행은 항상 이 술어를 만족한다.
  insert into public.lifetimes (serial, install, status, note)
  values (v_serial, to_char(v_date, 'YYYY-MM-DD'), 'Install', null)
  on conflict (serial) where serial is not null do nothing;

  return null;
end $$;

-- ── (C) 항목 4 : 교체로 탈거된 구 시리얼을 Spare 로 전환 ───
create or replace function public.retire_previous_tire()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_prev text;
begin
  -- 직전 시리얼 = 이 교체보다 앞선 최신 교체분, 없으면 최초 장착 시리얼
  select r.new_serial into v_prev
    from public.replacements r
   where r.ch = new.ch and r.pos = new.pos and r.deleted_at is null
     and r.id <> new.id
     and (r.date < new.date or (r.date = new.date and r.created_at < new.created_at))
   order by r.date desc, r.created_at desc
   limit 1;

  if v_prev is null then
    select vp.serial into v_prev
      from public.vehicle_positions vp
     where vp.ch = new.ch and vp.pos = new.pos;
  end if;

  if v_prev is null or v_prev = new.new_serial then return null; end if;

  -- 로테이션 대비: 다른 포지션에 장착돼 있으면 건드리지 않는다.
  -- (이 시점에 새 교체 행은 이미 보이므로, v_prev 가 이 포지션의 현재 타이어로
  --  잡히는 일은 없다. 걸린다면 정말로 다른 포지션에 달려 있다는 뜻이다.)
  if exists (select 1 from public.v_current_tire t where t.serial = v_prev) then
    return null;
  end if;

  update public.lifetimes
     set status = 'Spare'
   where serial = v_prev
     and status = 'Install';   -- Scrap / Not Install 은 덮어쓰지 않는다

  return null;
end $$;

-- ── 트리거 등록 ────────────────────────────────────────────
-- 이름 알파벳 순 = 실행 순서. ensure(a) → retire(b) → sync(c) 순으로 돈다.
drop trigger if exists trg_replacements_a_ensure_lifetime on public.replacements;
drop trigger if exists trg_replacements_b_retire_prev     on public.replacements;
drop trigger if exists trg_replacements_c_sync_position   on public.replacements;

create trigger trg_replacements_a_ensure_lifetime
  after insert or update on public.replacements
  for each row execute function public.ensure_lifetime_row();

create trigger trg_replacements_b_retire_prev
  after insert on public.replacements
  for each row execute function public.retire_previous_tire();

create trigger trg_replacements_c_sync_position
  after insert or update or delete on public.replacements
  for each row execute function public.sync_position_current_serial();

-- 신규 차량 등록(src/api/vehicles.ts → 10 포지션 INSERT) 시에도 lifetimes 확보
drop trigger if exists trg_vehicle_positions_ensure_lifetime on public.vehicle_positions;
create trigger trg_vehicle_positions_ensure_lifetime
  after insert on public.vehicle_positions
  for each row execute function public.ensure_lifetime_row();

comment on column public.vehicle_positions.serial2 is
  'DEPRECATED — trg_replacements_c_sync_position 이 자동 유지하는 캐시 컬럼. 신규 코드는 v_current_tire.serial 을 사용할 것.';

-- ============================================================
-- ROLLBACK:
--   drop trigger if exists trg_vehicle_positions_ensure_lifetime on public.vehicle_positions;
--   drop trigger if exists trg_replacements_c_sync_position   on public.replacements;
--   drop trigger if exists trg_replacements_b_retire_prev     on public.replacements;
--   drop trigger if exists trg_replacements_a_ensure_lifetime on public.replacements;
--   drop function if exists public.retire_previous_tire();
--   drop function if exists public.ensure_lifetime_row();
--   drop function if exists public.sync_position_current_serial();
--   comment on column public.vehicle_positions.serial2 is null;
--   ※ 되돌리면 월간 반영 스크립트의 serial2 수동 UPDATE 블록을 되살려야 한다
--     (samtan_update_20260705.sql [3-1]).
-- ============================================================
