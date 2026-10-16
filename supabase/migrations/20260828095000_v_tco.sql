-- T-7 · v_tco_unit / v_tco_fleet — CPK 3종
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-7
--
-- CPK-G  단가 ÷ 누적km
-- CPK-T  (단가 + 운송 + 공임 + 수리 + 공기압점검 + 다운타임 − 회수액) ÷ 누적km
-- CPK-L  (단가 + 재생비 − 스크랩) ÷ (누적km + 재생후수명)   재생 가능분만
--
-- **단가가 NULL 이면 CPK 3종 모두 NULL 이다.** COALESCE 로 0 을 채워 넣으면
-- CPK 가 IDR 0 으로 표시되어 심각한 오독이 된다 (§T-7 경고). SQL 의 NULL
-- 전파를 그대로 쓰되, 무엇이 비어 CPK 가 안 나오는지를 params_missing 으로
-- 드러낸다. 화면은 이 배열을 읽어 '단가 미확정' 을 띄운다.
--
-- 두 가지 판단을 지시서 스케치에서 바꿨다.
--  1) cost_params 적용 시점을 탈착일이 아니라 **장착일**로 한다. unit_price 는
--     구매 단가이므로 그 타이어를 산 시점의 값이라야 한다. 탈착일을 쓰면
--     4개월 뒤 단가로 과거 구매분을 계산하게 된다. 장착일 미상이면 탈착일.
--  2) 수리비는 tire_events 실비가 있으면 실비를, 없으면 cost_params.repair_avg
--     를 쓴다. 둘을 더하면 같은 수리가 두 번 잡힌다.
--
-- 브랜드는 NONTK- 플레이스홀더 시리얼로만 구분된다. 정식 brand 컬럼이
-- 생기면 이 규칙을 그것으로 교체한다.

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
       ], null) as params_missing
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

alter view public.v_tco_unit set (security_invoker = on);
grant select on public.v_tco_unit to anon, authenticated;

comment on view public.v_tco_unit is
  '개체 단위 CPK 3종. unit_price 가 NULL 이면 세 값 모두 NULL — 0 으로 채우지 않는다. params_missing 이 사유다.';

-- 롤업. n < 4 는 통계 비교 불가라 화면이 배지를 띄울 수 있게 sample_size 를 낸다.
--
-- scope 를 반드시 낸다. grouping set 은 '집계해서 NULL' 과 '값이 NULL' 을
-- 같은 모양으로 내놓는다. 현재 장착 위치가 없는 타이어는 ch·axle_group 이
-- 실제로 NULL 이라, scope 가 없으면 (TECHKING, null, null) 행이 세 벌 나와
-- 어느 것이 브랜드 합계인지 알 수 없다.
-- 열이 앞에 추가되므로 create or replace 로는 못 바꾼다(42P16). 뷰라
-- drop 이 안전하다 — 데이터가 없고 아래에서 즉시 다시 만든다.
drop view if exists public.v_tco_fleet;
create view public.v_tco_fleet as
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
       count(*) filter (where invalid_segments > 0) as km_incomplete_count
  from public.v_tco_unit
 group by grouping sets ((brand), (brand, ch), (brand, axle_group), ());

alter view public.v_tco_fleet set (security_invoker = on);
grant select on public.v_tco_fleet to anon, authenticated;

comment on view public.v_tco_fleet is
  'CPK 롤업(브랜드·차량·축군·전체). sample_size < 4 면 참고 관찰이지 통계 비교가 아니다 — 화면이 배지로 알린다.';
