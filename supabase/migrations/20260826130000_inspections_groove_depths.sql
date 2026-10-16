-- ============================================================
-- B-1 · inspections 그루브 4점 측정 컬럼 + 마모 패턴 뷰
--
-- 실차 점검표(UJI COBA TIRE TECHKING)는 한 포지션의 트레드를 폭 방향 4점으로
-- 측정한다. 순서는 KIRI · TENGAH · TENGAH · KANAN 이다.
--   tread_g1 = KIRI   (한쪽 숄더)
--   tread_g2 = TENGAH (중앙 1)
--   tread_g3 = TENGAH (중앙 2)
--   tread_g4 = KANAN  (반대쪽 숄더)
--
-- ⚠ KIRI/KANAN 이 차량 안쪽인지 바깥쪽인지는 현장 회신 대기 중이다.
--   그러나 g1·g4 는 **어느 쪽이든 둘 다 숄더**이므로 center_wear_idx
--   (숄더평균 − 중앙평균) 는 방향 확인 없이 성립한다. 방향에 의존하는
--   편마모 *방향* 해석(side_diff 의 부호)만 회신 후 문서화한다.
--
-- inspections.tread 는 이 4점의 **최솟값**이다. 기존 410행이 실제로 그렇게
-- 들어가 있음을 실측 대조로 확인했다 (CH 834 L1 8회차 전건 일치).
-- 따라서 tread 의 의미는 바뀌지 않으며 과거 행은 건드리지 않는다.
--
-- 과거 410행에 그루브를 역산해 채우지 않는다 (작업지시서 v2 §3).
-- ============================================================

-- ── 1. 컬럼 ────────────────────────────────────────────────
alter table public.inspections add column if not exists tread_g1 numeric;
alter table public.inspections add column if not exists tread_g2 numeric;
alter table public.inspections add column if not exists tread_g3 numeric;
alter table public.inspections add column if not exists tread_g4 numeric;

comment on column public.inspections.tread_g1 is 'KIRI — 숄더 측정점 1 (mm). 신품 22mm';
comment on column public.inspections.tread_g2 is 'TENGAH — 중앙 측정점 1 (mm)';
comment on column public.inspections.tread_g3 is 'TENGAH — 중앙 측정점 2 (mm)';
comment on column public.inspections.tread_g4 is 'KANAN — 숄더 측정점 2 (mm)';
comment on column public.inspections.tread is
  '4개 측정점의 최솟값 (mm). 폐기·신호등 판정의 정본. 그루브 입력 시 트리거가 자동 계산하므로 직접 수정하지 말 것. 마모율·원가 통계에는 v_center_wear.tread_avg 를 쓴다.';

-- ── 2. 값 범위 (NULL 허용) ─────────────────────────────────
do $$
declare c text;
begin
  foreach c in array array['tread_g1','tread_g2','tread_g3','tread_g4'] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.inspections'::regclass
        and conname = 'inspections_' || c || '_range'
    ) then
      execute format(
        'alter table public.inspections add constraint %I check (%I is null or (%I >= 0 and %I <= 60))',
        'inspections_' || c || '_range', c, c, c);
    end if;
  end loop;
end $$;

-- ── 3. tread = LEAST(4점) 동기화 ───────────────────────────
create or replace function public.sync_tread_min()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 4점 중 하나라도 입력됐을 때만 덮어쓴다. 그루브 없이 tread 만 넣던
  -- 기존 입력 경로(과거 410행 · 엑셀 적재)는 그대로 살려 둔다.
  if new.tread_g1 is not null or new.tread_g2 is not null
     or new.tread_g3 is not null or new.tread_g4 is not null then
    new.tread := least(
      coalesce(new.tread_g1, 9999),
      coalesce(new.tread_g2, 9999),
      coalesce(new.tread_g3, 9999),
      coalesce(new.tread_g4, 9999)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_inspections_a_tread_min on public.inspections;
create trigger trg_inspections_a_tread_min
  before insert or update on public.inspections
  for each row execute function public.sync_tread_min();

-- ── 4. 마모 패턴 뷰 ────────────────────────────────────────
-- 4점이 모두 있는 행만 나온다. B-1 적용 직후에는 0행이며, 그것이 정상이다.
create or replace view public.v_center_wear as
select
  i.id,
  i.ch,
  i.pos,
  i.serial,
  i.inspection_date,
  i.tread_g1, i.tread_g2, i.tread_g3, i.tread_g4,
  i.tread                                                             as tread_min,
  round((i.tread_g1 + i.tread_g2 + i.tread_g3 + i.tread_g4) / 4.0, 2) as tread_avg,
  -- 숄더평균 − 중앙평균. 양수 = 중앙이 더 닳음(중앙 마모)
  round(((i.tread_g1 + i.tread_g4) / 2.0) - ((i.tread_g2 + i.tread_g3) / 2.0), 2) as center_wear_idx,
  -- 좌우 숄더 차이. 크기는 편마모 정도, 부호 해석은 KIRI/KANAN 방향 확정 후
  round(i.tread_g1 - i.tread_g4, 2)                                   as side_diff,
  case
    when ((i.tread_g1 + i.tread_g4) / 2.0) - ((i.tread_g2 + i.tread_g3) / 2.0) >=  2.0 then 'center'
    when ((i.tread_g1 + i.tread_g4) / 2.0) - ((i.tread_g2 + i.tread_g3) / 2.0) <= -2.0 then 'shoulder'
    else 'even'
  end as wear_pattern
from public.inspections i
where i.deleted_at is null
  and i.tread_g1 is not null and i.tread_g2 is not null
  and i.tread_g3 is not null and i.tread_g4 is not null;

alter view public.v_center_wear set (security_invoker = on);
comment on view public.v_center_wear is
  '그루브 4점이 모두 입력된 점검 행의 마모 패턴. center_wear_idx = 숄더평균 − 중앙평균 (양수 = 중앙 마모). tread_avg 는 마모율·원가 통계용 대표값이며, 폐기 판정에는 tread_min 을 쓴다.';

grant select on public.v_center_wear to anon, authenticated;

-- ============================================================
-- ROLLBACK:
--   drop view if exists public.v_center_wear;
--   drop trigger if exists trg_inspections_a_tread_min on public.inspections;
--   drop function if exists public.sync_tread_min();
--   alter table public.inspections drop constraint if exists inspections_tread_g1_range;
--   alter table public.inspections drop constraint if exists inspections_tread_g2_range;
--   alter table public.inspections drop constraint if exists inspections_tread_g3_range;
--   alter table public.inspections drop constraint if exists inspections_tread_g4_range;
--   -- 컬럼은 남긴다 (프로젝트 규약: DROP COLUMN 금지).
--   -- 값을 비우려면: update public.inspections
--   --   set tread_g1=null, tread_g2=null, tread_g3=null, tread_g4=null;
-- ============================================================
