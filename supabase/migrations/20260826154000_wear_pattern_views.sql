-- ============================================================
-- D-2·D-3·D-4. 마모 균일성·편마모·타이어 비교 뷰 (작업지시서 v3)
--
-- D-2 v_cv_benchmark  — 점검일별 CV 중앙값·P90. 합격 기준은 미설정 상태를
--     유지한다(설계서 §10 — 데이터 축적 후 내부 기준 구축). 화면은 플릿
--     중앙값 대비 위치만 참고 표시한다.
-- D-3 v_wear_pattern  — 편마모. 깊이가 아니라 **마모량의 비**다 (설계서 §11).
--     S/C = Shoulder/Center, O/I = 외측(L=Kiri)/내측(R=Kanan).
--     기준점(Initial)은 세그먼트의 첫 측정 회차.
-- D-4 v_tire_comparison — 4개 평가축(마모성능·균일성·편마모·내구성) 분리 표시.
--     단일 종합점수 금지 (설계서 §16).
--
-- 임계값 1.150 / 0.870 / 0.5 mm 는 하드코딩하지 않고 tire_config 에 둔다
-- (v3 §D-3 주석 + CLAUDE.md 임계치 규칙). 0.870 = 1 ÷ 1.150 대칭.
-- ============================================================

alter table public.tire_config
  add column if not exists sc_ratio_upper numeric not null default 1.150,
  add column if not exists sc_ratio_lower numeric not null default 0.870,
  add column if not exists wear_min_mm    numeric not null default 0.5;

comment on column public.tire_config.sc_ratio_upper is
  '편마모 판정 상한. S/C·O/I 비율이 이상이면 shoulder/outboard 편마모. 초기값 1.150 (잠정 — 데이터 축적 후 재설정).';
comment on column public.tire_config.sc_ratio_lower is
  '편마모 판정 하한 (= 1 ÷ 상한, 대칭). 이하이면 center/inboard 편마모. 초기값 0.870.';
comment on column public.tire_config.wear_min_mm is
  '편마모 판정 최소 마모량(분모 가드). 미만이면 판정 보류(insufficient). 초기값 0.5 mm = 측정오차 한계.';

-- ── D-2. CV 벤치마크 ──────────────────────────────────────────
create or replace view public.v_cv_benchmark as
select
  inspection_date,
  count(*)::int                                                            as n,
  round((percentile_cont(0.5) within group (order by tread_cv))::numeric, 1) as cv_median,
  round((percentile_cont(0.9) within group (order by tread_cv))::numeric, 1) as cv_p90
from public.v_tread_series
where tread_cv is not null and tread_status = 'measured'
group by inspection_date;

-- ── D-3. 편마모 (S/C · O/I) ──────────────────────────────────
create or replace view public.v_wear_pattern as
with b as (
  select s.*,
         first_value(shoulder_avg) over w as base_sh,
         first_value(center_avg)   over w as base_ce,
         first_value(outboard_avg) over w as base_ob,
         first_value(inboard_avg)  over w as base_ib,
         first_value(tread_avg)    over w as base_avg,
         first_value(km)           over w as base_km
    from public.v_tread_series s
   where tread_status = 'measured' and shoulder_avg is not null
  window w as (partition by ch, pos, seg_no order by inspection_date
               rows between unbounded preceding and unbounded following)
)
select
  ch, pos, serial, seg_no, inspection_date,
  tread_avg, tread_cv,
  -- 폭 방향: Shoulder vs Center
  round(base_sh - shoulder_avg, 2)  as shoulder_wear,
  round(base_ce - center_avg, 2)    as center_wear,
  case when (base_ce - center_avg) >= cfg.wear_min_mm
       then round((base_sh - shoulder_avg) / (base_ce - center_avg), 3) end as sc_ratio,
  case
    when (base_ce - center_avg) < cfg.wear_min_mm then 'insufficient'
    when (base_sh - shoulder_avg) / (base_ce - center_avg) >= cfg.sc_ratio_upper then 'shoulder'
    when (base_sh - shoulder_avg) / (base_ce - center_avg) <= cfg.sc_ratio_lower then 'center'
    else 'even'
  end as wear_pattern,
  -- 횡 방향: 외측(L=Kiri) vs 내측(R=Kanan)
  round(base_ob - outboard_avg, 2)  as outboard_wear,
  round(base_ib - inboard_avg, 2)   as inboard_wear,
  case when (base_ib - inboard_avg) >= cfg.wear_min_mm
       then round((base_ob - outboard_avg) / (base_ib - inboard_avg), 3) end as oi_ratio,
  case
    when (base_ib - inboard_avg) < cfg.wear_min_mm then 'insufficient'
    when (base_ob - outboard_avg) / (base_ib - inboard_avg) >= cfg.sc_ratio_upper then 'outboard'
    when (base_ob - outboard_avg) / (base_ib - inboard_avg) <= cfg.sc_ratio_lower then 'inboard'
    else 'even'
  end as lateral_pattern
from b
-- tire_config 미설정 시에도 뷰가 죽지 않도록 폴백 (초기값 = 컬럼 default 와 동일)
cross join (
  select
    coalesce((select sc_ratio_upper from public.tire_config order by id limit 1), 1.150) as sc_ratio_upper,
    coalesce((select sc_ratio_lower from public.tire_config order by id limit 1), 0.870) as sc_ratio_lower,
    coalesce((select wear_min_mm    from public.tire_config order by id limit 1), 0.5)   as wear_min_mm
) cfg;

-- ── D-4. 타이어 간 비교 ──────────────────────────────────────
create or replace view public.v_tire_comparison as
select
  w.serial, w.ch, w.pos, w.seg_no,
  w.from_date, w.to_date, w.test_distance_km, w.n_points,
  w.initial_avg,
  w.wear_rate_km_ols                       as wear_rate,   -- 낮을수록 우수
  w.r2,
  w.cv_avg                                 as cv,          -- 낮을수록 균일
  p.sc_ratio,                                              -- 1.000 에 가까울수록 균일
  p.wear_pattern,
  p.oi_ratio,
  p.lateral_pattern,
  l.damage                                 as damage_code, -- NULL 이면 무고장
  l.scrap                                  as scrap_date
from public.v_wear_rate_segment w
left join lateral (
  select sc_ratio, wear_pattern, oi_ratio, lateral_pattern
    from public.v_wear_pattern p2
   where p2.ch = w.ch and p2.pos = w.pos and p2.seg_no = w.seg_no
   order by p2.inspection_date desc limit 1
) p on true
left join public.lifetimes l on l.serial = w.serial;

alter view public.v_cv_benchmark    set (security_invoker = on);
alter view public.v_wear_pattern    set (security_invoker = on);
alter view public.v_tire_comparison set (security_invoker = on);
grant select on public.v_cv_benchmark, public.v_wear_pattern, public.v_tire_comparison
  to anon, authenticated;

comment on view public.v_cv_benchmark is
  '점검일별 CV 중앙값·P90. 합격 임계 미설정 — 플릿 중앙값 대비 참고 표시 전용 (설계서 §10).';
comment on view public.v_wear_pattern is
  '편마모 판정 — 마모량의 비. S/C(숄더/중앙)·O/I(외측 Kiri/내측 Kanan). 임계값은 tire_config 정본.';
comment on view public.v_tire_comparison is
  '타이어 세그먼트 비교 — 4개 평가축 분리(마모성능·균일성·편마모·내구성). 단일 종합점수 금지 (설계서 §16).';

-- ROLLBACK:
--   drop view if exists public.v_tire_comparison;
--   drop view if exists public.v_wear_pattern;
--   drop view if exists public.v_cv_benchmark;
--   -- tire_config 신규 컬럼은 CLAUDE.md 절대금지 #4(DROP COLUMN 금지)에 따라 유지한다.
