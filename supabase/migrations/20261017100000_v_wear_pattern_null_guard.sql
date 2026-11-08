-- ============================================================
-- M-8 · v_wear_pattern — 분모 NULL 이면 'even' 이 아니라 'insufficient'
--
-- 결함: base/current 평균 중 하나가 NULL(점이 없거나 전부 OUTLIER)이면
--   `(base - cur) < wear_min_mm` 가 NULL 이라 CASE 가 ELSE 'even' 으로 떨어졋다.
--   «판정 불가» 가 «균일» 로 보인다. sc(wear_pattern)·oi(lateral_pattern) 둘 다.
-- 조치: 각 CASE 첫 분기에 NULL 가드. 비율 컬럼(sc_ratio·oi_ratio)은 이미 NULL.
-- 열 추가·순서 변경 없음 → create or replace 가능. v_tire_comparison 은 그대로.
-- 사용자 승인 2026-10-17 (decisions M-8). 데이터 변경 없음.
-- ============================================================

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
    when (base_sh - shoulder_avg) is null or (base_ce - center_avg) is null then 'insufficient'
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
    when (base_ob - outboard_avg) is null or (base_ib - inboard_avg) is null then 'insufficient'
    when (base_ib - inboard_avg) < cfg.wear_min_mm then 'insufficient'
    when (base_ob - outboard_avg) / (base_ib - inboard_avg) >= cfg.sc_ratio_upper then 'outboard'
    when (base_ob - outboard_avg) / (base_ib - inboard_avg) <= cfg.sc_ratio_lower then 'inboard'
    else 'even'
  end as lateral_pattern
from b
cross join (
  select
    coalesce((select sc_ratio_upper from public.tire_config order by id limit 1), 1.150) as sc_ratio_upper,
    coalesce((select sc_ratio_lower from public.tire_config order by id limit 1), 0.870) as sc_ratio_lower,
    coalesce((select wear_min_mm    from public.tire_config order by id limit 1), 0.5)   as wear_min_mm
) cfg;

alter view public.v_wear_pattern set (security_invoker = on);
grant select on public.v_wear_pattern to anon, authenticated;

comment on view public.v_wear_pattern is
  '편마모 판정 — 마모량의 비. S/C(숄더/중앙)·O/I(외측 Kiri/내측 Kanan). 임계값은 tire_config 정본. '
  '분모·분자가 NULL 이면 insufficient (2026-10-17 M-8).';

-- ROLLBACK: 20260826154000_wear_pattern_views.sql 의 v_wear_pattern 정의를 다시 실행.
