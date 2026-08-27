-- ============================================================
-- C-2. inspections 트레드 통계 파생 컬럼 + 자동 산출 트리거 (작업지시서 v3 §C-2)
--
-- tread_points(원본)가 바뀔 때마다 inspections 의 통계 캐시를 재산출한다.
--   최소값 tread   → 운용 판정(발주 5.0 / 위험 3.0 mm) 기준 — 의미 유지
--   평균 tread_avg → 성능 비교·Wear Rate 기준 (설계서 §7·§9)
--   SD/CV/Range    → 마모 균일성 (§10) · Shoulder/Center·Out/Inboard → 편마모 (§11)
-- OUTLIER Flag·소프트 삭제 행은 통계에서 제외한다.
-- 과거 410행은 원시값이 없어 tread_avg NULL / point_count 0 — 이것이 정상이다 (§2-2).
--
-- ⚠ v2 sync_tread_min() 과의 충돌 처리 (§C-2 경고):
--   BEFORE 트리거 trg_inspections_a_tread_min 이 tread := LEAST(g1..g4) 로 덮어써
--   16점 확장 시 새 트리거가 넣은 전체 최소값을 P1 4점 최소값으로 되돌린다.
--   → point_count > 0 (tread_points 정본 보유) 이면 건드리지 않도록 교체한다.
-- ============================================================

alter table public.inspections
  add column if not exists tread_avg    numeric(5,2),
  add column if not exists tread_max    numeric(5,2),
  add column if not exists tread_range  numeric(5,2),
  add column if not exists tread_sd     numeric(6,3),
  add column if not exists tread_cv     numeric(5,1),
  add column if not exists shoulder_avg numeric(5,2),
  add column if not exists center_avg   numeric(5,2),
  add column if not exists outboard_avg numeric(5,2),
  add column if not exists inboard_avg  numeric(5,2),
  add column if not exists point_count  int not null default 0;

comment on column public.inspections.tread is
  '측정값 최소값. 운용 판정(발주 5.0 / 위험 3.0 mm) 기준. 파생 캐시 — 직접 수정하지 말 것.';
comment on column public.inspections.tread_avg is
  '폭(또는 폭×원주) 측정값 평균. 성능 비교·Wear Rate 산출 기준. tread_points 에서 트리거가 자동 산출.';
comment on column public.inspections.tread_max is '측정값 최대값. 파생 캐시.';
comment on column public.inspections.tread_range is 'max - min. 폭 방향 편차 폭. 파생 캐시.';
comment on column public.inspections.tread_sd is
  '표본표준편차(stddev_samp, n-1). n<2 이면 NULL. 모집단 SD(stddev_pop) 사용 금지 (v3 §4.3).';
comment on column public.inspections.tread_cv is
  'SD / Mean × 100 (%). 마모 균일성. 낮을수록 균일. 합격 기준은 미설정 — 데이터 축적 후 결정 (설계서 §10).';
comment on column public.inspections.shoulder_avg is '숄더(L=Kiri 외측 + R=Kanan 내측) 평균. 편마모 S/C Ratio 기준.';
comment on column public.inspections.center_avg is '중앙(C1·C2=Tengah) 평균. 편마모 S/C Ratio 기준.';
comment on column public.inspections.outboard_avg is
  '외측(L=Kiri) 측정값 평균. 원주 4점 확장 시 P1~P4 의 L 평균.';
comment on column public.inspections.inboard_avg is
  '내측(R=Kanan) 측정값 평균. 내외측 편마모(O/I Ratio) 산출 기준.';
comment on column public.inspections.point_count is
  '통계 산출에 사용된 유효 측정점 수(OUTLIER·소프트삭제 제외). 0 이면 원시값 미보유 행(2026-08 이전).';

create or replace function public.recalc_inspection_tread_stats()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  v_id := coalesce(new.inspection_id, old.inspection_id);

  update public.inspections i set
    tread        = s.min_v,
    tread_avg    = s.avg_v,
    tread_max    = s.max_v,
    tread_range  = round(s.max_v - s.min_v, 2),
    tread_sd     = s.sd_v,
    tread_cv     = case when s.avg_v > 0 and s.sd_v is not null
                        then round(s.sd_v / s.avg_v * 100, 1) end,
    shoulder_avg = s.sh_v,
    center_avg   = s.ce_v,
    outboard_avg = s.ob_v,
    inboard_avg  = s.ib_v,
    point_count  = s.n
  from (
    select count(*)::int                                                   as n,
           round(avg(depth_mm), 2)                                         as avg_v,
           min(depth_mm)                                                   as min_v,
           max(depth_mm)                                                   as max_v,
           round(stddev_samp(depth_mm), 3)                                 as sd_v,
           round(avg(depth_mm) filter (where width_pos in ('L','R')),  2)  as sh_v,
           round(avg(depth_mm) filter (where width_pos in ('C1','C2')), 2) as ce_v,
           round(avg(depth_mm) filter (where width_pos = 'L'), 2)          as ob_v,
           round(avg(depth_mm) filter (where width_pos = 'R'), 2)          as ib_v
      from public.tread_points
     where inspection_id = v_id
       and deleted_at is null
       and flag <> 'OUTLIER'
  ) s
  where i.id = v_id and s.n > 0;   -- 유효 점이 0이면 기존 값을 건드리지 않는다

  return null;
end $$;

drop trigger if exists trg_tread_points_recalc on public.tread_points;
create trigger trg_tread_points_recalc
  after insert or update or delete on public.tread_points
  for each row execute function public.recalc_inspection_tread_stats();

-- ── v2 sync_tread_min() 교체 — tread_points 가 정본인 행은 건드리지 않는다 ──
create or replace function public.sync_tread_min()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- tread_points 가 정본이 된 행: recalc 트리거가 전체 최소값을 이미 넣었다.
  -- g1..g4(P1 4점) 최소값으로 되돌리면 16점 확장 시 값이 어긋난다.
  if coalesce(new.point_count, 0) > 0 then
    return new;
  end if;
  if new.tread_g1 is not null or new.tread_g2 is not null
     or new.tread_g3 is not null or new.tread_g4 is not null then
    new.tread := least(
      coalesce(new.tread_g1, 9999), coalesce(new.tread_g2, 9999),
      coalesce(new.tread_g3, 9999), coalesce(new.tread_g4, 9999));
  end if;
  return new;
end $$;

comment on column public.inspections.tread_g1 is
  'DEPRECATED — tread_points 로 대체. g1=L(Kiri·외측) 매핑. 신규 코드는 tread_points 를 사용할 것.';
comment on column public.inspections.tread_g2 is
  'DEPRECATED — tread_points 로 대체. g2=C1(Tengah 1) 매핑. 신규 코드는 tread_points 를 사용할 것.';
comment on column public.inspections.tread_g3 is
  'DEPRECATED — tread_points 로 대체. g3=C2(Tengah 2) 매핑. 신규 코드는 tread_points 를 사용할 것.';
comment on column public.inspections.tread_g4 is
  'DEPRECATED — tread_points 로 대체. g4=R(Kanan·내측) 매핑. 신규 코드는 tread_points 를 사용할 것.';

-- ROLLBACK:
--   drop trigger if exists trg_tread_points_recalc on public.tread_points;
--   drop function if exists public.recalc_inspection_tread_stats();
--   -- sync_tread_min() 은 20260826130000_inspections_groove_depths.sql 의 정의로 되돌린다.
--   -- 통계 컬럼(tread_avg 등)은 CLAUDE.md 절대금지 #4(DROP COLUMN 금지)에 따라 유지한다.
