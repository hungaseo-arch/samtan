-- ============================================================
-- 타이어 원가·재생·연료 계수 (지시서 2026-10-16 §B-1 · §B-3, 지시서상 이름 0014_tire_cost)
--
-- 기존 구조 재사용 (사용자 결정 2026-10-16):
--   · 본당 기본 단가는 tire_config.default_price 를 새로 만들지 않고 cost_params.unit_price
--     (이력형, 장착일 기준 적용 — v_tco_unit 과 같은 규칙)를 그대로 쓴다.
--   · lifetimes.purchase_price 는 «이 타이어를 실제로 산 값» 개별 입력이다. NULL 이면
--     cost_params.unit_price 로 폴백한다. 둘 다 NULL 이면 CPK 는 NULL — 0 으로 채우지 않는다.
--
-- 값은 하나도 넣지 않는다. 단가·환율·연비·유가·손실 계수는 쎄오님 확정 전이라
-- (CLAUDE.md 절대금지 6) 모든 신규 컬럼이 NULL 로 시작하고 화면은 «설정 필요» 를 띄운다.
-- 재생 계획도 미확정이라 retreads 는 스키마만 둔다 (cost_params.retread_allowed = false 와 일치).
--
-- 멱등: add column if not exists · create table if not exists · create or replace ·
--       제약/정책은 drop if exists 후 재생성.
-- ============================================================

-- ── 1. lifetimes: 구매가 · 재생 집계 ─────────────────────────
alter table public.lifetimes
  add column if not exists purchase_price numeric,
  add column if not exists currency       text,
  add column if not exists retread_count  integer not null default 0,
  add column if not exists retread_cost   numeric not null default 0;

-- generated column 은 add column if not exists 로도 멱등하다
alter table public.lifetimes
  add column if not exists is_retread boolean generated always as (retread_count > 0) stored;

alter table public.lifetimes drop constraint if exists lifetimes_cost_check;
alter table public.lifetimes
  add constraint lifetimes_cost_check check (
    (purchase_price is null or purchase_price >= 0)
    and retread_count >= 0 and retread_cost >= 0
  );

comment on column public.lifetimes.purchase_price is
  '이 타이어의 실제 구매가. NULL = cost_params.unit_price(장착일 기준)로 폴백. 둘 다 NULL 이면 CPK 미산출';
comment on column public.lifetimes.currency is
  'purchase_price 통화. NULL = cost_params.currency';
comment on column public.lifetimes.retread_count is 'retreads 트리거가 집계 — 직접 고치지 말 것';
comment on column public.lifetimes.retread_cost  is 'retreads 트리거가 집계 — 직접 고치지 말 것';

-- ── 2. retreads: 재생 1회 = 1행 (스키마만) ───────────────────
create table if not exists public.retreads (
  id                uuid primary key default gen_random_uuid(),
  serial            text not null,
  seq               integer not null,
  date              date not null,
  cost              numeric,
  vendor            text,
  tread_after       numeric,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  created_by_email  text,
  updated_by_email  text,
  deleted_at        timestamptz
);

alter table public.retreads drop constraint if exists retreads_values_check;
alter table public.retreads
  add constraint retreads_values_check check (
    seq >= 1
    and (cost is null or cost >= 0)
    and (tread_after is null or tread_after >= 0)
  );

create unique index if not exists retreads_serial_seq_uniq
  on public.retreads (serial, seq) where deleted_at is null;

comment on table public.retreads is
  '재생(retread) 이력. 재생 1회 = 1행. lifetimes.retread_count/retread_cost 는 트리거 집계. 소프트 삭제만 허용';

-- 집계 트리거 — 소프트 삭제된 행은 빠진다. serial 이 바뀐 update 는 양쪽을 다시 센다.
create or replace function public.sync_retread_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare s text;
begin
  foreach s in array array_remove(array[
    case when tg_op <> 'INSERT' then old.serial end,
    case when tg_op <> 'DELETE' then new.serial end
  ], null)
  loop
    update public.lifetimes l
       set retread_count = coalesce(a.n, 0),
           retread_cost  = coalesce(a.c, 0)
      from (select count(*) as n, sum(cost) as c
              from public.retreads
             where serial = s and deleted_at is null) a
     where l.serial = s;
  end loop;
  return null;
end $$;

drop trigger if exists trg_retreads_audit        on public.retreads;
drop trigger if exists trg_retreads_updated_at   on public.retreads;
drop trigger if exists trg_retreads_log          on public.retreads;
drop trigger if exists trg_retreads_no_delete    on public.retreads;
drop trigger if exists trg_retreads_guard_delete on public.retreads;
drop trigger if exists trg_retreads_totals       on public.retreads;
create trigger trg_retreads_audit
  before insert or update on public.retreads
  for each row execute function public.set_audit_fields();
create trigger trg_retreads_updated_at
  before update on public.retreads
  for each row execute function public.set_updated_at();
create trigger trg_retreads_log
  after insert or delete or update on public.retreads
  for each row execute function public.log_audit('id');
create trigger trg_retreads_no_delete
  before delete on public.retreads
  for each row execute function public.forbid_hard_delete();
create trigger trg_retreads_guard_delete
  before update on public.retreads
  for each row execute function public.guard_soft_delete();
create trigger trg_retreads_totals
  after insert or update or delete on public.retreads
  for each row execute function public.sync_retread_totals();

-- 트리거 함수는 직접 호출 금지 (20260906100000 규약)
revoke execute on function public.sync_retread_totals() from public, anon, authenticated;

-- RLS — tire_events 와 같은 폭 (현장 기록: inspector·admin 쓰기)
alter table public.retreads enable row level security;
drop policy if exists "retreads authenticated select" on public.retreads;
drop policy if exists "retreads write insert"         on public.retreads;
drop policy if exists "retreads write update"         on public.retreads;
drop policy if exists "retreads write delete"         on public.retreads;
create policy "retreads authenticated select" on public.retreads
  for select to authenticated using (true);
create policy "retreads write insert" on public.retreads
  for insert to authenticated
  with check (public.app_role() in ('inspector','admin'));
create policy "retreads write update" on public.retreads
  for update to authenticated
  using (public.app_role() in ('inspector','admin'))
  with check (public.app_role() in ('inspector','admin'));
create policy "retreads write delete" on public.retreads
  for delete to authenticated using (public.app_role() = 'admin');

revoke all on public.retreads from anon;
grant select, insert, update on public.retreads to authenticated;

-- ── 3. tire_config: 환율 · 연료 · 손실 계수 (B-3) — 전부 NULL 로 시작 ──
alter table public.tire_config
  add column if not exists fx_usd_idr          numeric,
  add column if not exists fuel_base_l_per_km  numeric,
  add column if not exists fuel_price          numeric,
  add column if not exists fuel_currency       text default 'IDR',
  add column if not exists fuel_sens_per_10pct numeric,
  add column if not exists life_sens_per_10pct numeric;

alter table public.tire_config drop constraint if exists tire_config_economics_check;
alter table public.tire_config
  add constraint tire_config_economics_check check (
    (fx_usd_idr is null or fx_usd_idr > 0)
    and (fuel_base_l_per_km is null or fuel_base_l_per_km >= 0)
    and (fuel_price is null or fuel_price >= 0)
    and (fuel_sens_per_10pct is null or fuel_sens_per_10pct >= 0)
    and (life_sens_per_10pct is null or life_sens_per_10pct >= 0)
  );

comment on column public.tire_config.fx_usd_idr is
  '보고서 환산용 USD→IDR 환율. NULL = 환산 병기 안 함 (환율 임의 가정 금지)';
comment on column public.tire_config.fuel_base_l_per_km is
  'Road Train 기준 연비(L/km). NULL = 연료 손실 «설정 필요»';
comment on column public.tire_config.fuel_price is
  '현장 경유 단가 (fuel_currency/L). NULL = 연료 손실 «설정 필요»';
comment on column public.tire_config.fuel_sens_per_10pct is
  '저압 10% 당 연료 증가율(%). 지시서 제안 기본값 1.2 — 확정 전 NULL';
comment on column public.tire_config.life_sens_per_10pct is
  '저압 10% 당 수명 감소율(%). 지시서 제안 기본값 8 — 확정 전 NULL';

-- ============================================================
-- ROLLBACK (CLAUDE.md 절대금지 4 — drop column/table 금지):
--   값만 비운다.
--   update public.lifetimes set purchase_price = null, currency = null;
--   update public.retreads set deleted_at = now() where deleted_at is null;
--   update public.tire_config set fx_usd_idr = null, fuel_base_l_per_km = null, fuel_price = null,
--          fuel_sens_per_10pct = null, life_sens_per_10pct = null;
-- ============================================================
