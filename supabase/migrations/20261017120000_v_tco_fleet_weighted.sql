-- ============================================================
-- M-10 · CPK 플릿 대표값 = 가중평균 (사용자 결정 2026-10-17)
--
-- 기존 cpk_*_avg 는 본당 단순 평균이라 주행거리가 짧은 본(분모 작음 → CPK 큼)이
-- 대표값을 끌어올렸다 (prod 2026-10-16: 단순 2,628.16 vs 가중 562.43 IDR/km).
-- 가중평균 = Σ비용 ÷ Σ주행거리 = Σ(cpk × km) ÷ Σkm — 플릿이 1 km 달리는 데 든 실제 원가.
--   · cpk_gross_wavg · cpk_tco_wavg : 가중치 cumulative_km
--   · cpk_lifecycle_wavg            : 가중치 lifecycle_km (= cumulative_km + retread_life_km)
-- 분모는 해당 cpk 가 산출된 본만 합한다. 단순 평균 열은 참고용으로 남긴다(열 삭제 없음).
-- 두 뷰 모두 **끝에 열만 추가** → create or replace 가능(42P16 아님). 데이터 변경 없음.
-- ============================================================

create or replace view public.v_tco_unit as
with base as (
  select t.serial,
         case when t.serial like 'NONTK-%' then 'NONTK' else 'TECHKING' end as brand,
         t.cumulative_km, t.invalid_segments, t.mount_count, t.vehicle_count,
         t.first_mounted_at, t.in_service
    from public.v_tire_ledger_total t
),
cur as (   -- 현재 장착 위치와 축군
  select distinct on (serial) serial, ch, pos,
         case when pos in ('L1','R1') then 'STEER' else 'DRIVE' end as axle_group
    from public.v_tire_ledger
   where is_current
   order by serial, mounted_at desc nulls last
),
rem as (   -- 시리얼당 최신 탈착 기록
  select distinct on (old_serial)
         old_serial as serial, date as removal_date, removal_code,
         removal_tread_min, casing_grade, retreadable, downtime_minutes
    from public.replacements
   where deleted_at is null and old_serial is not null
   order by old_serial, date desc
),
ev as (
  select serial,
         coalesce(sum(cost), 0)             as event_cost,
         coalesce(sum(downtime_minutes), 0) as event_downtime,
         count(*)                           as event_count
    from public.tire_events
   where deleted_at is null
   group by serial
),
insp as (  -- 공기압 점검 배분액의 곱수
  select serial, count(*) as inspect_rounds
    from public.inspections
   where deleted_at is null and serial is not null
   group by serial
)
select b.serial, b.brand, c.ch, c.pos, c.axle_group,
       b.cumulative_km, b.invalid_segments, b.mount_count, b.vehicle_count,
       b.first_mounted_at, b.in_service,
       r.removal_date, r.removal_code, r.retreadable,
       p.effective_from as cost_effective_from, p.currency,
       p.unit_price,
       -- 부대비용 항목 — 각각 NULL 이면 CPK-T 가 NULL 이 된다(의도된 것)
       p.freight_per_tire,
       p.mount_cost,
       case when e.serial is not null then e.event_cost else p.repair_avg end as repair_cost,
       p.pressure_check_cost * coalesce(i.inspect_rounds, 0) as pressure_cost,
       (coalesce(r.downtime_minutes, 0) + coalesce(e.event_downtime, 0)) / 60.0
         * p.downtime_rate_hour as downtime_cost,
       case when r.retreadable is true then p.casing_value else p.scrap_value end as recovery,
       -- CPK-G
       p.unit_price / nullif(b.cumulative_km, 0) as cpk_gross,
       -- CPK-T
       (p.unit_price
        + p.freight_per_tire
        + p.mount_cost
        + case when e.serial is not null then e.event_cost else p.repair_avg end
        + p.pressure_check_cost * coalesce(i.inspect_rounds, 0)
        + (coalesce(r.downtime_minutes, 0) + coalesce(e.event_downtime, 0)) / 60.0
          * p.downtime_rate_hour
        - case when r.retreadable is true then p.casing_value else p.scrap_value end
       ) / nullif(b.cumulative_km, 0) as cpk_tco,
       -- CPK-L — 재생 가능분만
       case when r.retreadable is true
            then (p.unit_price + p.retread_cost - p.scrap_value)
                 / nullif(b.cumulative_km + p.retread_life_km, 0)
       end as cpk_lifecycle,
       -- 왜 값이 안 나오는지. 화면이 이 배열을 읽어 안내한다.
       array_remove(array[
         case when p.id is null                then 'cost_params'         end,
         case when p.unit_price is null        then 'unit_price'          end,
         case when p.freight_per_tire is null  then 'freight_per_tire'    end,
         case when p.mount_cost is null        then 'mount_cost'          end,
         case when p.pressure_check_cost is null then 'pressure_check_cost' end,
         case when p.downtime_rate_hour is null then 'downtime_rate_hour' end,
         case when b.cumulative_km is null or b.cumulative_km = 0 then 'cumulative_km' end
       ], null) as params_missing,
       -- CPK-L 의 분모(누적 + 재생 수명). 플릿 가중평균의 가중치로 쓴다 (M-10)
       case when r.retreadable is true then b.cumulative_km + p.retread_life_km end as lifecycle_km
  from base b
  left join cur  c on c.serial = b.serial
  left join rem  r on r.serial = b.serial
  left join ev   e on e.serial = b.serial
  left join insp i on i.serial = b.serial
  left join lateral (
    select * from public.cost_params
     where deleted_at is null
       and effective_from <= coalesce(b.first_mounted_at, r.removal_date, current_date)
       and (brand is null or brand = case when b.serial like 'NONTK-%' then 'NONTK' else 'TECHKING' end)
     order by effective_from desc
     limit 1
  ) p on true;


create or replace view public.v_tco_fleet as
select case
         when grouping(brand) = 1      then 'ALL'
         when grouping(ch) = 0         then 'BRAND_CH'
         when grouping(axle_group) = 0 then 'BRAND_AXLE'
         else 'BRAND'
       end as scope,
       brand, ch, axle_group,
       count(*)                                   as sample_size,
       count(cpk_gross)                           as costed_count,
       sum(cumulative_km)                         as total_km,
       avg(cpk_gross)                             as cpk_gross_avg,
       avg(cpk_tco)                               as cpk_tco_avg,
       avg(cpk_lifecycle)                         as cpk_lifecycle_avg,
       count(*) filter (where invalid_segments > 0) as km_incomplete_count,
       -- 가중평균 (M-10) — Σ(cpk × 가중치) ÷ Σ가중치, 해당 cpk 가 있는 본만
       sum(cpk_gross * cumulative_km)
         / nullif(sum(cumulative_km) filter (where cpk_gross is not null), 0)     as cpk_gross_wavg,
       sum(cpk_tco * cumulative_km)
         / nullif(sum(cumulative_km) filter (where cpk_tco is not null), 0)       as cpk_tco_wavg,
       sum(cpk_lifecycle * lifecycle_km)
         / nullif(sum(lifecycle_km) filter (where cpk_lifecycle is not null), 0)  as cpk_lifecycle_wavg
  from public.v_tco_unit
 group by grouping sets ((brand), (brand, ch), (brand, axle_group), ());

alter view public.v_tco_unit  set (security_invoker = on);
alter view public.v_tco_fleet set (security_invoker = on);
grant select on public.v_tco_unit, public.v_tco_fleet to anon, authenticated;

comment on view public.v_tco_fleet is
  'CPK 롤업(브랜드·차량·축군·전체). 대표값은 cpk_*_wavg(가중평균 = Σ비용 ÷ Σ주행거리, 2026-10-17 M-10); '
  'cpk_*_avg 는 본당 단순 평균(참고). sample_size < 4 면 참고 관찰이지 통계 비교가 아니다.';

-- ROLLBACK: 20260828095000_v_tco.sql 의 두 뷰 정의를 다시 실행 (열 제거는 drop view 후 재생성 필요).
