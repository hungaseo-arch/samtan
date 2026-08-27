-- T-5 · v_tire_ledger / v_tire_ledger_total — 개체(시리얼) 단위 누적 주행거리
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-5
--
-- 마모율 0.446 mm/1,000km 는 '차량' 주행거리 기준이다. 그런데 2026-08 교체
-- 8건 중 6건이 중고 재배치이고 04814D 는 4개 차량째다. 개체의 실제 누적
-- 주행거리는 어느 한 차량의 km 에도 잡히지 않는다 — CPK 분모가 이 뷰다.
--
-- 원칙: 모르는 값은 NULL 로 두고 km_flag 로 드러낸다. 0 으로 채우면
-- '주행 안 함' 과 '기록 없음' 이 섞여 CPK 가 실제보다 커 보인다.
--   NO_KM       — 장착·탈착 시점의 차량 km 를 찾지 못함 (CH 849 km 미입력,
--                 mounted_at 미상인 초기 장착 등)
--   KM_DECREASE — 구간 km 가 역행 (km 리셋·이상치). km_reset 차량 포함 —
--                 경고 대상은 아니지만 거리로도 쓰지 않는다.

create or replace view public.v_tire_ledger as
with seg as (
  select m.serial, m.ch, m.pos, m.seq_no, m.mounted_at,
         coalesce(m.removed_at, current_date) as removed_at,
         m.is_current
    from public.v_tire_mount_history m
   where m.serial is not null
),
km as (
  -- 같은 날 여러 행의 km 가 다르면 최대값. 점검은 주행 후 기록이 보통이다.
  select ch, inspection_date, max(km) as km
    from public.inspections
   where deleted_at is null and km is not null and km > 0
   group by ch, inspection_date
),
bounds as (
  select s.*,
    (select k.km from km k
      where k.ch = s.ch and k.inspection_date <= s.mounted_at
      order by k.inspection_date desc limit 1) as km_start,
    (select k.km from km k
      where k.ch = s.ch and k.inspection_date <= s.removed_at
      order by k.inspection_date desc limit 1) as km_end
    from seg s
)
select serial, ch, pos, seq_no, mounted_at, removed_at, is_current,
       km_start, km_end,
       case
         when km_start is null or km_end is null then null
         when km_end < km_start then null   -- 리셋·이상치 — 0 으로 채우지 않는다
         else km_end - km_start
       end as segment_km,
       case
         when km_start is null or km_end is null then 'NO_KM'
         when km_end < km_start then 'KM_DECREASE'
         else 'OK'
       end as km_flag
  from bounds;

alter view public.v_tire_ledger set (security_invoker = on);
grant select on public.v_tire_ledger to anon, authenticated;

comment on view public.v_tire_ledger is
  '개체 단위 장착 구간별 주행거리. segment_km NULL 은 산출 불가(km_flag 참조)이지 0 이 아니다.';

create or replace view public.v_tire_ledger_total as
select serial,
       count(*) as mount_count,
       count(distinct ch) as vehicle_count,
       min(mounted_at) as first_mounted_at,
       max(removed_at) as last_date,
       sum(segment_km) filter (where km_flag = 'OK') as cumulative_km,
       count(*) filter (where km_flag <> 'OK') as invalid_segments,
       bool_or(is_current) as in_service
  from public.v_tire_ledger
 group by serial;

alter view public.v_tire_ledger_total set (security_invoker = on);
grant select on public.v_tire_ledger_total to anon, authenticated;

comment on view public.v_tire_ledger_total is
  '시리얼 단위 합산. cumulative_km 은 km_flag=OK 구간만 — invalid_segments>0 이면 하한값이다.';
