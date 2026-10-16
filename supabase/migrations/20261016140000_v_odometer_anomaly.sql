-- ============================================================
-- WO-TMS-2026-10-LIFE T-3 · 주행계(KM·HM) 회차 간 증분 이상치
--
-- 근거: CH 847 2026-07-12 회차 km 89,100.0 → 07-26 135,397.1. 14일에 46,297 km
-- (일 3,307 km · 환산 176 km/h, HM 증분 263 hr). 이후 회차는 일 300~450 km 로 정상이라
-- 07-12 값의 입력 오류로 추정한다. 이 한 칸 때문에 847 장착 10본의 주행 km·예상수명이
-- 전부 허수가 됐다.
--
-- 원칙 (지시서 §1-2): 데이터 오기는 코드로 고치지 않는다. 여기서는 **감지만** 한다.
-- 정정은 현장 원본 점검표 확인 후 inspections 행 소프트 삭제 + 신규 행으로 한다.
--
-- 임계값은 tire_config 에 둔다 (CLAUDE.md — 임계치 코드 상수 금지).
--   odo_daily_km_max   일평균 주행 상한 (km/일)       초기 800
--   odo_speed_kmh_max  환산 속도 상한 (Δkm/Δhm, km/h)  초기 60
--   odo_daily_hm_max   일평균 가동 상한 (hr/일)        초기 24
-- 초기값은 지시서 제안값이며 현장 운행 조건 적정성은 사용자 확인 대기 (§4-3).
--
-- 멱등: add column if not exists · NULL 인 값만 채움 · create or replace view.
-- ============================================================

alter table public.tire_config
  add column if not exists odo_daily_km_max  numeric,
  add column if not exists odo_speed_kmh_max numeric,
  add column if not exists odo_daily_hm_max  numeric;

comment on column public.tire_config.odo_daily_km_max is
  '점검 회차 간 일평균 주행 상한(km/일). 넘으면 주행계 입력 경고 (WO-TMS-2026-10-LIFE T-3)';
comment on column public.tire_config.odo_speed_kmh_max is
  '점검 회차 간 환산 속도 상한(Δkm/Δhm, km/h). 넘으면 주행계 입력 경고';
comment on column public.tire_config.odo_daily_hm_max is
  '점검 회차 간 일평균 가동 상한(hr/일). 하루는 24시간이라 넘으면 HM 입력 오류';

update public.tire_config
   set odo_daily_km_max  = coalesce(odo_daily_km_max,  800),
       odo_speed_kmh_max = coalesce(odo_speed_kmh_max, 60),
       odo_daily_hm_max  = coalesce(odo_daily_hm_max,  24)
 where id = 1;

alter table public.tire_config
  drop constraint if exists tire_config_odo_check;
alter table public.tire_config
  add constraint tire_config_odo_check check (
    (odo_daily_km_max  is null or odo_daily_km_max  > 0)
    and (odo_speed_kmh_max is null or odo_speed_kmh_max > 0)
    and (odo_daily_hm_max  is null or (odo_daily_hm_max > 0 and odo_daily_hm_max <= 24))
  );

-- ── v_odometer_anomaly ───────────────────────────────────────
-- 차량별 회차(점검일) 단위로 KM·HM 을 모아 직전 회차와 비교한다.
-- 같은 날 여러 행은 최대값 — v_tire_ledger 의 km CTE 와 같은 규칙이다.
-- 계기 리셋 보정(vehicles.reset_date·km_offset·hm_offset)이 있으면 보정값으로 비교한다.
-- 보정값이 없는 리셋은 KM_DECREASE 로 잡히는 게 맞다 — 사유 확인 대상이다.
--
-- 모든 회차 쌍을 반환하고 flags 가 비어 있지 않은 행이 이상치다 (is_anomaly).
-- 화면은 is_anomaly 행만 쓰지만, 정상 쌍도 남겨 두면 일평균 분포를 바로 볼 수 있다.
create or replace view public.v_odometer_anomaly as
with r as (
  select i.ch, i.inspection_date,
         max(i.km) filter (where i.km is not null and i.km > 0) as km_raw,
         max(i.hm) filter (where i.hm is not null and i.hm > 0) as hm_raw
    from public.inspections i
   where i.deleted_at is null
   group by i.ch, i.inspection_date
),
adj as (
  select r.ch, r.inspection_date,
         r.km_raw + case when v.reset_date is not null and r.inspection_date >= v.reset_date
                         then coalesce(v.km_offset, 0) else 0 end as km,
         r.hm_raw + case when v.reset_date is not null and r.inspection_date >= v.reset_date
                         then coalesce(v.hm_offset, 0) else 0 end as hm
    from r
    left join public.vehicles v on v.ch = r.ch
),
pair as (
  select a.ch,
         lag(a.inspection_date) over w as date_prev,
         a.inspection_date              as date_curr,
         lag(a.km) over w               as km_prev,
         a.km                           as km_curr,
         lag(a.hm) over w               as hm_prev,
         a.hm                           as hm_curr
    from adj a
  window w as (partition by a.ch order by a.inspection_date)
),
calc as (
  select p.*,
         (p.date_curr - p.date_prev)                as days,
         p.km_curr - p.km_prev                      as km_delta,
         p.hm_curr - p.hm_prev                      as hm_delta,
         (p.km_curr - p.km_prev) / nullif(p.date_curr - p.date_prev, 0)  as km_per_day,
         (p.hm_curr - p.hm_prev) / nullif(p.date_curr - p.date_prev, 0)  as hm_per_day,
         case when p.hm_curr > p.hm_prev
              then (p.km_curr - p.km_prev) / (p.hm_curr - p.hm_prev) end as km_per_hm
    from pair p
   where p.date_prev is not null
),
judged as (
  select c.*,
         array_remove(array[
           case when c.km_delta < 0                                   then 'KM_DECREASE' end,
           case when c.km_per_day > t.odo_daily_km_max                then 'KM_DAILY'    end,
           case when c.km_delta > 0 and c.km_per_hm > t.odo_speed_kmh_max then 'SPEED'   end,
           case when c.hm_per_day > t.odo_daily_hm_max                then 'HM_DAILY'    end
         ], null) as flags
    from calc c
    cross join (select odo_daily_km_max, odo_speed_kmh_max, odo_daily_hm_max
                  from public.tire_config where id = 1) t
)
select ch, date_prev, date_curr, days,
       km_prev, km_curr, km_delta, km_per_day,
       hm_prev, hm_curr, hm_delta, hm_per_day,
       km_per_hm,
       flags,
       cardinality(flags) > 0 as is_anomaly
  from judged;

alter view public.v_odometer_anomaly set (security_invoker = on);
grant select on public.v_odometer_anomaly to anon, authenticated;

comment on view public.v_odometer_anomaly is
  '차량별 점검 회차 간 KM·HM 증분 판정. flags: KM_DECREASE·KM_DAILY·SPEED·HM_DAILY. '
  '감지 전용 — 원본 정정은 inspections 소프트 삭제 + 신규 행으로 (WO-TMS-2026-10-LIFE §1-2)';

-- ============================================================
-- ROLLBACK:
--   drop view if exists public.v_odometer_anomaly;
--   alter table public.tire_config drop constraint if exists tire_config_odo_check;
--   -- 컬럼은 남긴다 (프로젝트 규약: DROP COLUMN 금지).
-- ============================================================
