-- ============================================================
-- Samtan TMS — 참조 데이터 테이블 (tmsData.ts 정적 데이터 이관 대상)
-- 측정값(공기압·트레드)은 0001_inspections.sql 의 inspections 테이블 사용.
-- ============================================================

-- ── 타이어 스펙 (전역 단일 행) ──
create table if not exists public.tire_config (
  id         int  primary key default 1,
  brand      text,
  type       text,
  size       text,
  tubetype   text,
  new_tread  numeric,
  capacity   numeric,
  constraint tire_config_singleton check (id = 1)
);

-- ── 차량 ──
create table if not exists public.vehicles (
  ch   text primary key,
  seq  int
);

-- ── 차량별 포지션(구조·시리얼) ──
create table if not exists public.vehicle_positions (
  ch       text not null references public.vehicles(ch) on delete cascade,
  pos      text not null,
  serial   text,
  serial2  text,
  remark   text,
  seq      int,
  primary key (ch, pos)
);

-- ── 타이어 교체 이력 ──
create table if not exists public.replacements (
  id          uuid primary key default gen_random_uuid(),
  ch          text not null,
  pos         text not null,
  date        date not null,
  new_serial  text
);

-- ── Lifetime DB ──
create table if not exists public.lifetimes (
  no        int  primary key,
  serial    text,
  scrap     text,
  damage    text,
  install   text,
  lifetime  numeric,
  status    text,
  note      text
);

-- ── 손상 코드 ──
create table if not exists public.damage_codes (
  code        text primary key,
  description text,
  seq         int
);

-- ── RLS (내부 현장 도구: publishable/anon 키 읽기·쓰기 허용) ──
do $$
declare t text;
begin
  foreach t in array array['tire_config','vehicles','vehicle_positions','replacements','lifetimes','damage_codes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s anon all" on public.%I', t, t);
    execute format('create policy "%s anon all" on public.%I for all using (true) with check (true)', t, t);
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;
