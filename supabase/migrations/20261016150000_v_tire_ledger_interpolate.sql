-- ============================================================
-- WO-TMS-2026-10-LIFE T-1 · v_tire_ledger km_start·km_end 보정 (D-1)
--
-- 종전(20260828093000): km_start = 장착일 **이하 마지막 회차** km.
-- 점검 주기가 2주라 장착일이 회차 사이면 그 회차부터 장착일까지(최대 1회차, 약 6,000 km)
-- 달리지 않은 거리가 구간에 더해졌다. 예) CH 839 09-05(486,258.1) → 09-27(493,072.9)
-- 사이 09-25 장착분이 6,815 km 로 잡혔다. 실제는 2일분, 약 600 km.
--
-- 규칙 (우선순위 순, 시작·끝 각각):
--   1. replacements.km_at 이 있으면 그 값                      → REPLACEMENT
--   2. 경계일과 같은 날 점검 회차가 있으면 그 값                   → INSPECTION
--   3. 앞(<= 경계일 마지막)·뒤(> 경계일 첫) 회차가 다 있으면 날짜 비례 선형 보간 → INTERPOLATED
--   4. 뒤 회차가 없으면 앞 회차 값 (종전 규칙), km_flag = APPROX   → PREV_ROUND
--   끝 경계가 오늘(현재 장착 중)이면 마지막 회차 값                 → LAST_ROUND
--   앞 회차가 없거나 장착일 미상(최초 장착분)은 NULL              → km_flag = NO_KM
--
-- km_flag: OK · APPROX(한쪽 끝 보간 불가, 종전 규칙값) · NO_KM · KM_DECREASE
--
-- 원칙 (지시서 §1-1): 기존 수치를 덮어쓰지 않고 비교 가능하게 — 종전 규칙 값을
-- km_start_prev_round · km_end_prev_round 로 함께 남긴다.
--
-- create or replace view 는 기존 컬럼 순서·형을 유지하고 뒤에만 붙인다.
-- v_tco_unit 이 이 뷰의 serial·ch·pos·is_current·mounted_at 을 직접 읽는다.
--
-- HM 도 같은 규칙으로 hm_start·hm_end 를 낸다 (replacements.hm_at → 회차 보간).
-- lifeCalc 의 주행 HR 이 KM 과 같은 구간을 재도록 하기 위해서다.
-- ============================================================

create or replace view public.v_tire_ledger as
with seg as (
  select m.serial, m.ch, m.pos, m.seq_no, m.mounted_at,
         coalesce(m.removed_at, current_date) as removed_at,
         m.is_current
    from public.v_tire_mount_history m
   where m.serial is not null
),
rnd as (
  -- 같은 날 여러 행의 값이 다르면 최대값. 점검은 주행 후 기록이 보통이다.
  select ch, inspection_date,
         max(km) filter (where km is not null and km > 0) as km,
         max(hm) filter (where hm is not null and hm > 0) as hm
    from public.inspections
   where deleted_at is null
   group by ch, inspection_date
),
-- 교체 기록의 계기값. 같은 (ch,pos,date) 에 여러 건이면 최신 입력.
rep as (
  select distinct on (ch, pos, date) ch, pos, date, km_at, hm_at
    from public.replacements
   where deleted_at is null and (km_at is not null or hm_at is not null)
   order by ch, pos, date, created_at desc
),
b as (
  select s.*,
         rs.km_at as rs_km, rs.hm_at as rs_hm,
         re.km_at as re_km, re.hm_at as re_hm,
         ps.inspection_date as ps_date, ps.km as ps_km,
         ns.inspection_date as ns_date, ns.km as ns_km,
         pe.inspection_date as pe_date, pe.km as pe_km,
         ne.inspection_date as ne_date, ne.km as ne_km,
         phs.inspection_date as phs_date, phs.hm as phs_hm,
         nhs.inspection_date as nhs_date, nhs.hm as nhs_hm,
         phe.inspection_date as phe_date, phe.hm as phe_hm,
         nhe.inspection_date as nhe_date, nhe.hm as nhe_hm
    from seg s
    -- 장착 교체건: 이 시리얼을 단 기록. 탈착 교체건: 같은 포지션의 다음 장착 기록.
    left join rep rs on rs.ch = s.ch and rs.pos = s.pos and rs.date = s.mounted_at
    left join rep re on re.ch = s.ch and re.pos = s.pos and re.date = s.removed_at
                    and not s.is_current
    left join lateral (select k.inspection_date, k.km from rnd k
                        where k.ch = s.ch and k.km is not null and k.inspection_date <= s.mounted_at
                        order by k.inspection_date desc limit 1) ps on true
    left join lateral (select k.inspection_date, k.km from rnd k
                        where k.ch = s.ch and k.km is not null and k.inspection_date >  s.mounted_at
                        order by k.inspection_date asc  limit 1) ns on true
    left join lateral (select k.inspection_date, k.km from rnd k
                        where k.ch = s.ch and k.km is not null and k.inspection_date <= s.removed_at
                        order by k.inspection_date desc limit 1) pe on true
    left join lateral (select k.inspection_date, k.km from rnd k
                        where k.ch = s.ch and k.km is not null and k.inspection_date >  s.removed_at
                        order by k.inspection_date asc  limit 1) ne on true
    left join lateral (select k.inspection_date, k.hm from rnd k
                        where k.ch = s.ch and k.hm is not null and k.inspection_date <= s.mounted_at
                        order by k.inspection_date desc limit 1) phs on true
    left join lateral (select k.inspection_date, k.hm from rnd k
                        where k.ch = s.ch and k.hm is not null and k.inspection_date >  s.mounted_at
                        order by k.inspection_date asc  limit 1) nhs on true
    left join lateral (select k.inspection_date, k.hm from rnd k
                        where k.ch = s.ch and k.hm is not null and k.inspection_date <= s.removed_at
                        order by k.inspection_date desc limit 1) phe on true
    left join lateral (select k.inspection_date, k.hm from rnd k
                        where k.ch = s.ch and k.hm is not null and k.inspection_date >  s.removed_at
                        order by k.inspection_date asc  limit 1) nhe on true
),
m as (
  select b.*,
    -- ── 시작 ──
    case
      when b.mounted_at is null                then null
      when b.rs_km is not null                 then 'REPLACEMENT'
      when b.ps_km is null                     then null
      when b.ps_date = b.mounted_at            then 'INSPECTION'
      when b.ns_km is not null                 then 'INTERPOLATED'
      else 'PREV_ROUND'
    end as start_method,
    -- ── 끝 ──
    case
      when b.is_current and b.pe_km is not null then 'LAST_ROUND'
      when b.is_current                         then null
      when b.re_km is not null                  then 'REPLACEMENT'
      when b.pe_km is null                      then null
      when b.pe_date = b.removed_at             then 'INSPECTION'
      when b.ne_km is not null                  then 'INTERPOLATED'
      else 'PREV_ROUND'
    end as end_method
  from b
),
v as (
  select m.*,
    case m.start_method
      when 'REPLACEMENT'  then m.rs_km
      when 'INSPECTION'   then m.ps_km
      when 'PREV_ROUND'   then m.ps_km
      when 'INTERPOLATED' then round(m.ps_km + (m.ns_km - m.ps_km)
                                 * (m.mounted_at - m.ps_date)::numeric / (m.ns_date - m.ps_date), 1)
    end as km_start_v,
    case m.end_method
      when 'REPLACEMENT'  then m.re_km
      when 'LAST_ROUND'   then m.pe_km
      when 'INSPECTION'   then m.pe_km
      when 'PREV_ROUND'   then m.pe_km
      when 'INTERPOLATED' then round(m.pe_km + (m.ne_km - m.pe_km)
                                 * (m.removed_at - m.pe_date)::numeric / (m.ne_date - m.pe_date), 1)
    end as km_end_v,
    case m.start_method when 'REPLACEMENT' then null
                        when 'INTERPOLATED' then m.ns_date else m.ps_date end as km_start_src_date_v,
    case m.end_method   when 'REPLACEMENT' then null
                        when 'INTERPOLATED' then m.ne_date else m.pe_date end as km_end_src_date_v,
    -- HM — 같은 규칙. 보간 상대가 없으면 앞 회차 값.
    case
      when m.mounted_at is null then null
      when m.rs_hm is not null  then m.rs_hm
      when m.phs_hm is null     then null
      when m.phs_date = m.mounted_at or m.nhs_hm is null then m.phs_hm
      else round(m.phs_hm + (m.nhs_hm - m.phs_hm)
                 * (m.mounted_at - m.phs_date)::numeric / (m.nhs_date - m.phs_date), 1)
    end as hm_start_v,
    case
      when m.is_current         then m.phe_hm
      when m.re_hm is not null  then m.re_hm
      when m.phe_hm is null     then null
      when m.phe_date = m.removed_at or m.nhe_hm is null then m.phe_hm
      else round(m.phe_hm + (m.nhe_hm - m.phe_hm)
                 * (m.removed_at - m.phe_date)::numeric / (m.nhe_date - m.phe_date), 1)
    end as hm_end_v
  from m
)
select serial, ch, pos, seq_no, mounted_at, removed_at, is_current,
       km_start_v as km_start,
       km_end_v   as km_end,
       case
         when km_start_v is null or km_end_v is null then null
         when km_end_v < km_start_v then null   -- 리셋·이상치 — 0 으로 채우지 않는다
         else km_end_v - km_start_v
       end as segment_km,
       case
         when km_start_v is null or km_end_v is null then 'NO_KM'
         when km_end_v < km_start_v then 'KM_DECREASE'
         when start_method = 'PREV_ROUND' or end_method = 'PREV_ROUND' then 'APPROX'
         else 'OK'
       end as km_flag,
       -- ── 이하 20261016150000 추가 ──
       start_method        as km_method,
       km_start_src_date_v as km_start_src_date,
       km_end_src_date_v   as km_end_src_date,
       end_method          as km_end_method,
       ps_km               as km_start_prev_round,  -- 종전 규칙 값 (보정 전후 비교용)
       pe_km               as km_end_prev_round,
       hm_start_v          as hm_start,
       hm_end_v            as hm_end
  from v;

alter view public.v_tire_ledger set (security_invoker = on);
grant select on public.v_tire_ledger to anon, authenticated;

comment on view public.v_tire_ledger is
  '개체 단위 장착 구간별 주행거리. km_start·km_end 는 교체 km_at → 같은 날 회차 → 앞뒤 회차 날짜 보간 → '
  '앞 회차(APPROX) 순. segment_km NULL 은 산출 불가(km_flag 참조)이지 0 이 아니다.';
comment on column public.v_tire_ledger.km_method is
  'km_start 산출 방식: REPLACEMENT · INSPECTION · INTERPOLATED · PREV_ROUND. NULL = 산출 불가';
comment on column public.v_tire_ledger.km_end_method is
  'km_end 산출 방식: REPLACEMENT · INSPECTION · INTERPOLATED · PREV_ROUND · LAST_ROUND(장착 중)';
comment on column public.v_tire_ledger.km_start_src_date is
  'km_start 에 쓴 회차 일자. INTERPOLATED 면 뒤 회차 일자(앞 회차는 km_start_prev_round 의 일자)';

-- 합계: APPROX 도 거리로 쓴다 (종전 규칙값이라 과대 가능성은 있으나 0 보다 낫다).
-- invalid_segments 는 NO_KM·KM_DECREASE 만 — 이것이 있으면 cumulative_km 은 하한값이다.
create or replace view public.v_tire_ledger_total as
select serial,
       count(*) as mount_count,
       count(distinct ch) as vehicle_count,
       min(mounted_at) as first_mounted_at,
       max(removed_at) as last_date,
       sum(segment_km) filter (where km_flag in ('OK', 'APPROX')) as cumulative_km,
       count(*) filter (where km_flag not in ('OK', 'APPROX')) as invalid_segments,
       bool_or(is_current) as in_service,
       count(*) filter (where km_flag = 'APPROX') as approx_segments
  from public.v_tire_ledger
 group by serial;

alter view public.v_tire_ledger_total set (security_invoker = on);
grant select on public.v_tire_ledger_total to anon, authenticated;

comment on view public.v_tire_ledger_total is
  '시리얼 단위 합산. cumulative_km 은 km_flag OK·APPROX 구간 — invalid_segments>0 이면 하한값이다.';

-- ============================================================
-- ROLLBACK: 20260828093000_v_tire_ledger.sql 본문 재실행은 불가하다
--   (create or replace view 는 컬럼을 줄일 수 없다). 되돌릴 때는
--   drop view ... cascade 후 20260828093000 · 20260828094000 · 20260828095000 재실행.
-- ============================================================
