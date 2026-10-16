-- T-4 · tire_events — 운용 이벤트 원장
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-4
--
-- 수리·로테이션·정지·보충 같은 운용 이벤트는 지금 어디에도 기록되지 않는다.
-- TCO 의 '부대비용' 축이 통째로 비는 원인이라 개체(시리얼) 단위 원장으로 담는다.
-- 현장 기록이므로 쓰기는 inspector·admin — replacements 와 같은 폭이다.

create table if not exists public.tire_events (
  id                uuid primary key default gen_random_uuid(),
  serial            text not null,
  ch                text,
  pos               text,
  event_date        date not null,
  event_type        text not null,
  cost              numeric,
  downtime_minutes  integer,
  damage_code       text,
  note              text,
  -- 감사 컬럼 — 기존 테이블과 동일 패턴
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  created_by_email  text,
  updated_by_email  text,
  deleted_at        timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.tire_events'::regclass
                    and conname  = 'tire_events_event_type_check') then
    alter table public.tire_events
      add constraint tire_events_event_type_check
      check (event_type in ('REPAIR','ROTATION','STOP','INFLATE','INSPECT_EXTRA'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.tire_events'::regclass
                    and conname  = 'tire_events_damage_code_fkey') then
    alter table public.tire_events
      add constraint tire_events_damage_code_fkey
      foreign key (damage_code) references public.damage_codes(code);
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.tire_events'::regclass
                    and conname  = 'tire_events_downtime_minutes_check') then
    alter table public.tire_events
      add constraint tire_events_downtime_minutes_check
      check (downtime_minutes is null or downtime_minutes >= 0);
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.tire_events'::regclass
                    and conname  = 'tire_events_cost_check') then
    alter table public.tire_events
      add constraint tire_events_cost_check
      check (cost is null or cost >= 0);
  end if;
end $$;

create index if not exists tire_events_serial_date_idx
  on public.tire_events (serial, event_date);

comment on table public.tire_events is
  '타이어 개체 단위 운용 이벤트 원장. 수리·로테이션·정지·보충 비용과 정지 시간이 TCO 부대비용 축이 된다.';

-- 감사 트리거 — 원장이므로 소프트 삭제 계열까지 전부 붙인다.
drop trigger if exists trg_tire_events_audit        on public.tire_events;
drop trigger if exists trg_tire_events_updated_at   on public.tire_events;
drop trigger if exists trg_tire_events_log          on public.tire_events;
drop trigger if exists trg_tire_events_no_delete    on public.tire_events;
drop trigger if exists trg_tire_events_guard_delete on public.tire_events;
create trigger trg_tire_events_audit
  before insert or update on public.tire_events
  for each row execute function public.set_audit_fields();
create trigger trg_tire_events_updated_at
  before update on public.tire_events
  for each row execute function public.set_updated_at();
create trigger trg_tire_events_log
  after insert or delete or update on public.tire_events
  for each row execute function public.log_audit('id');
create trigger trg_tire_events_no_delete
  before delete on public.tire_events
  for each row execute function public.forbid_hard_delete();
create trigger trg_tire_events_guard_delete
  before update on public.tire_events
  for each row execute function public.guard_soft_delete();

-- RLS — replacements 와 동일 폭
alter table public.tire_events enable row level security;
drop policy if exists "tire_events public select" on public.tire_events;
drop policy if exists "tire_events write insert"  on public.tire_events;
drop policy if exists "tire_events write update"  on public.tire_events;
drop policy if exists "tire_events write delete"  on public.tire_events;
create policy "tire_events public select" on public.tire_events
  for select using (true);
create policy "tire_events write insert" on public.tire_events
  for insert to authenticated
  with check (public.app_role() in ('inspector','admin'));
create policy "tire_events write update" on public.tire_events
  for update to authenticated
  using (public.app_role() in ('inspector','admin'))
  with check (public.app_role() in ('inspector','admin'));
create policy "tire_events write delete" on public.tire_events
  for delete to authenticated using (public.app_role() = 'admin');
