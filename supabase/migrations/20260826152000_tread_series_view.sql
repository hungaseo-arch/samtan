-- ============================================================
-- D-0. v_tread_series — 계열 기반 뷰 (작업지시서 v3 §D-0)
--
-- inspections 를 (ch, pos) 시계열로 펼치고 시리얼 변경 지점마다 seg_no 를
-- 증가시킨다. 마모 KPI 는 반드시 (ch, pos, seg_no) 세그먼트 단위로 계산한다
-- (v2 Phase A 원칙 — 교체 전후 타이어를 한 선으로 잇지 않는다).
--
-- 지시서 원문의 SUM(CASE … LAG() OVER w …) OVER (…) 는 윈도 함수 중첩이라
-- PostgreSQL 에서 허용되지 않아 CTE 2단(변경 플래그 → 누적합)으로 푼다.
-- ============================================================

create or replace view public.v_tread_series as
with flagged as (
  select
    i.id as inspection_id, i.ch, i.pos, i.serial, i.inspection_date,
    i.km, i.hm,
    i.tread as tread_min, i.tread_avg, i.tread_sd, i.tread_cv,
    i.tread_range, i.shoulder_avg, i.center_avg,
    i.outboard_avg, i.inboard_avg, i.point_count,
    i.tread_status,
    case when i.serial is distinct from
              lag(i.serial) over (partition by i.ch, i.pos order by i.inspection_date)
         then 1 else 0 end as seg_start
  from public.inspections i
  where i.deleted_at is null
)
select
  inspection_id, ch, pos, serial, inspection_date,
  km, hm,
  tread_min, tread_avg, tread_sd, tread_cv,
  tread_range, shoulder_avg, center_avg,
  outboard_avg, inboard_avg, point_count,
  tread_status,
  sum(seg_start) over (partition by ch, pos order by inspection_date
                       rows unbounded preceding) as seg_no
from flagged;

alter view public.v_tread_series set (security_invoker = on);
grant select on public.v_tread_series to anon, authenticated;

comment on view public.v_tread_series is
  '점검 시계열 + 시리얼 세그먼트 번호(seg_no). 마모 KPI 산출의 공통 기반 (v3 §D-0). 첫 세그먼트 seg_no=1.';

-- ROLLBACK:
--   drop view if exists public.v_tread_series;
