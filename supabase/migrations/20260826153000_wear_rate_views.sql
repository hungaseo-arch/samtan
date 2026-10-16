-- ============================================================
-- D-1. Wear Rate 뷰 2종 (작업지시서 v3 §D-1 · 설계서 §9)
--
-- Wear Rate = (Initial − Current) ÷ Distance × 1,000  [mm/1,000 km]
-- 기준은 **평균(tread_avg)** 이다. 최소값 기준은 마모속도를 과대계산한다 (v3 §0.3).
--   v_wear_interval     — 인접 회차 구간차. 회차별 추이·이상 감지용.
--   v_wear_rate_segment — 세그먼트 OLS 회귀 기울기. 보고서 대표값 (R² 병기).
--
-- ⚠ regr_slope(Y, X) 인자 순서는 (종속, 독립) = (tread_avg, km). 뒤집기 금지.
-- ⚠ wear_rate_km 은 Δkm ≥ 3,000 인 구간만 산출 (설계서 §9 최소요건).
--   CH 849 는 km 가 전 회차 0이라 자동 제외되고 wear_rate_day 만 나온다 — 정상.
-- 과거 410행은 tread_avg 가 없어 두 뷰 모두 0행 — 원시값 축적 후 채워진다.
-- ============================================================

-- (1) 구간별 마모
create or replace view public.v_wear_interval as
with s as (
  select * from public.v_tread_series
   where tread_status = 'measured' and tread_avg is not null
),
d as (
  select s.*,
         lag(tread_avg)       over w as prev_avg,
         lag(tread_min)       over w as prev_min,
         lag(km)              over w as prev_km,
         lag(inspection_date) over w as prev_date
    from s
  window w as (partition by ch, pos, seg_no order by inspection_date)
)
select
  ch, pos, serial, seg_no, inspection_date,
  round(prev_avg - tread_avg, 2)              as wear_avg_mm,
  round(prev_min - tread_min, 2)              as wear_min_mm,
  round(km - prev_km, 1)                      as delta_km,
  (inspection_date - prev_date)               as delta_days,
  case when (km - prev_km) >= 3000 and (prev_avg - tread_avg) > 0
       then round((prev_avg - tread_avg) / (km - prev_km) * 1000, 3) end as wear_rate_km,
  case when (inspection_date - prev_date) > 0 and (prev_avg - tread_avg) > 0
       then round((prev_avg - tread_avg) / (inspection_date - prev_date), 3) end as wear_rate_day,
  case
    when (prev_avg - tread_avg) < -0.5 then 'negative_wear'
    when (km - prev_km) < 3000         then 'insufficient_km'
    when (prev_avg - tread_avg) <= 0   then 'no_wear'
    else 'ok'
  end                                         as calc_status
from d
where prev_avg is not null;

-- (2) 세그먼트 대표값 (OLS 회귀)
create or replace view public.v_wear_rate_segment as
select
  ch, pos, serial, seg_no,
  count(*)::int                                   as n_points,
  min(inspection_date)                            as from_date,
  max(inspection_date)                            as to_date,
  round(max(km) - min(km), 1)                     as test_distance_km,
  round(max(tread_avg) filter (where inspection_date = min_date), 2) as initial_avg,
  round((-regr_slope(tread_avg, km) * 1000)::numeric, 3) as wear_rate_km_ols,
  round(regr_r2(tread_avg, km)::numeric, 3)       as r2,
  round(avg(tread_cv), 1)                         as cv_avg
from (
  select s.*, min(inspection_date) over (partition by ch, pos, seg_no) as min_date
    from public.v_tread_series s
   where tread_status = 'measured' and tread_avg is not null and km > 0
) x
group by ch, pos, serial, seg_no
having count(*) >= 3;

alter view public.v_wear_interval     set (security_invoker = on);
alter view public.v_wear_rate_segment set (security_invoker = on);
grant select on public.v_wear_interval, public.v_wear_rate_segment to anon, authenticated;

comment on view public.v_wear_interval is
  '인접 회차 구간 마모(평균 기준). Δkm ≥ 3,000 구간만 wear_rate_km 산출. 이상 구간은 calc_status 로 표시.';
comment on view public.v_wear_rate_segment is
  '세그먼트 단위 Wear Rate 대표값 — OLS 기울기 × (−1,000). 측정점 ≥ 3 필수, R² 병기 (권장 신뢰 기준 R² ≥ 0.80).';

-- ROLLBACK:
--   drop view if exists public.v_wear_rate_segment;
--   drop view if exists public.v_wear_interval;
