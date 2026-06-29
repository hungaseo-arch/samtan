-- ============================================================
-- Samtan TMS — 점검 입력 데이터 (tire pressure & tread inspections)
-- 한 행 = (차량 CH · 점검일 · 포지션) 단위의 1건 측정값
-- ============================================================

create table if not exists public.inspections (
  id              uuid primary key default gen_random_uuid(),
  ch              text        not null,                  -- 차량 번호 (834, 839 ...)
  inspection_date date        not null,                  -- 점검일
  hm              numeric,                               -- 가동시간 (Hour Meter)
  km              numeric,                               -- 주행거리
  pos             text        not null,                  -- 포지션 (L1, L2 In, ...)
  serial          text,                                  -- 타이어 시리얼
  pressure        numeric,                               -- 공기압 psi (null = N/A / 미측정)
  tread           numeric,                               -- 트레드 mm (4그루브 최소값)
  remark          text,                                  -- 비고
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 동일 (차량·점검일·포지션) 재입력 시 갱신(upsert)되도록 유니크 제약
create unique index if not exists inspections_ch_date_pos_uniq
  on public.inspections (ch, inspection_date, pos);

create index if not exists inspections_ch_date_idx
  on public.inspections (ch, inspection_date desc);

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_inspections_updated_at on public.inspections;
create trigger trg_inspections_updated_at
  before update on public.inspections
  for each row execute function public.set_updated_at();

-- ── RLS (내부 현장 도구: publishable/anon 키로 읽기·쓰기 허용) ──
alter table public.inspections enable row level security;

drop policy if exists "inspections anon select" on public.inspections;
drop policy if exists "inspections anon insert" on public.inspections;
drop policy if exists "inspections anon update" on public.inspections;
drop policy if exists "inspections anon delete" on public.inspections;

create policy "inspections anon select" on public.inspections for select using (true);
create policy "inspections anon insert" on public.inspections for insert with check (true);
create policy "inspections anon update" on public.inspections for update using (true) with check (true);
create policy "inspections anon delete" on public.inspections for delete using (true);

grant all on public.inspections to anon, authenticated, service_role;
