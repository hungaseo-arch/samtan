-- ============================================================
-- WO-TMS-2026-11-LIFE-KM T-1 · 최초 장착분(seq 0) 시작점 추론 — v_tire_ledger
--
-- 결함 (WO §0 C-1): 최초 장착분은 mounted_at = NULL 이라 km_start 가 없고 구간 전체가
-- NO_KM(거리 0 취급)이었다. 수명 DB 는 측정 점열 폴백으로 떨어져 실제보다 약 40% 짧았다.
--
-- 근거 (WO §0): 폐기된 seq 0 타이어는 전부 첫 측정 4점이 22.0 mm(신품)이다.
-- 첫 점검 시점에 신품이면 그 회차 km 를 장착 km 로 써도 빠지는 주행이 사실상 없다.
-- → decisions L-4(«seq 0 NO_KM 은 구조적 하한값») 는 이 경우에 한해 대체된다 (L-5).
--
-- 규칙 (mounted_at IS NULL 구간에만):
--   그 시리얼이 **같은 ch·pos 에서 처음 측정된 회차**(inspections.serial, 정규화 비교)를 찾는다.
--   그 회차의 tread_avg >= tire_config.new_tread(신품 확인, 쎄오님 결정 2026-11-04 M-1 원안)이면
--     시작 경계일 = 그 회차 일자
--     km_start   = 그 회차 차량 km (rnd 와 같은 규칙: 같은 날 최대값, 0 이하는 미측정)
--     hm_start   = 같은 규칙
--     km_method  = 'FIRST_NEW_INSPECTION'
--   끝 경계·km_flag 판정식은 종전 그대로 (REPLACEMENT → INSPECTION → INTERPOLATED → PREV_ROUND).
--   첫 측정이 신품 미만(중고 장착)이거나 그 회차 km 가 없으면 종전대로 NO_KM (진짜 하한값).
--
-- 덮어쓰기 금지: mounted_at 컬럼 값은 바꾸지 않는다 (v_tco_unit 이 직접 읽는다).
-- 추론 시작일은 맨 뒤에 새로 붙이는 mounted_at_effective · start_inferred 로만 남긴다.
-- lifetimes.install_date(seq 0 전부 2026-04-01 자리채움)는 시작점으로 쓰지 않는다.
--
-- create or replace view: 기존 컬럼 순서·형 그대로, 새 컬럼 2개는 맨 뒤에만.
-- v_tire_ledger_total · v_tco_unit · v_tco_fleet · v_removal_analysis 는 본문 변경 없이
-- 자동 반영된다 (invalid_segments 감소, cumulative_km 증가).
-- 멱등: create or replace view · comment 만. 테이블·데이터 변경 없음.
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
-- ── 20261104100000 추가 ── 시리얼이 (ch,pos) 에서 처음 측정된 회차와 그 4점 평균.
-- 같은 날 여러 행이면 tread_avg 큰 쪽 (신품 판정은 보수적으로 하지 않는다 — 값이 다르면
-- 입력 중복이고, 어느 쪽이든 22.0 이면 신품이다).
fi as (
  select distinct on (i.ch, i.pos, upper(regexp_replace(i.serial, '\s', '', 'g')))
         i.ch, i.pos,
         upper(regexp_replace(i.serial, '\s', '', 'g')) as serial_norm,
         i.inspection_date as first_date,
         i.tread_avg       as first_tread_avg
    from public.inspections i
   where i.deleted_at is null
     and nullif(btrim(coalesce(i.serial, '')), '') is not null
   order by i.ch, i.pos, upper(regexp_replace(i.serial, '\s', '', 'g')),
            i.inspection_date asc, i.tread_avg desc nulls last
),
cfg as (
  select coalesce((select new_tread from public.tire_config where id = 1), 22.0) as new_tread
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
         nhe.inspection_date as nhe_date, nhe.hm as nhe_hm,
         -- 최초 장착분 시작점 추론 (FIRST_NEW_INSPECTION)
         (s.mounted_at is null and f.first_tread_avg is not null
            and f.first_tread_avg >= (select new_tread from cfg)) as fn_ok,
         f.first_date as fn_date,
         fr.km as fn_km,
         fr.hm as fn_hm
    from seg s
    -- 장착 교체건: 이 시리얼을 단 기록. 탈착 교체건: 같은 포지션의 다음 장착 기록.
    left join rep rs on rs.ch = s.ch and rs.pos = s.pos and rs.date = s.mounted_at
    left join rep re on re.ch = s.ch and re.pos = s.pos and re.date = s.removed_at
                    and not s.is_current
    left join fi f on s.mounted_at is null
                  and f.ch = s.ch and f.pos = s.pos
                  and f.serial_norm = upper(regexp_replace(s.serial, '\s', '', 'g'))
    left join rnd fr on fr.ch = s.ch and fr.inspection_date = f.first_date
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
      when b.mounted_at is null then
        case when b.fn_ok and b.fn_km is not null then 'FIRST_NEW_INSPECTION' end
      when b.rs_km is not null                 then 'REPLACEMENT'
      when b.ps_km is null                     then null
      when b.ps_date = b.mounted_at            then 'INSPECTION'
      when b.ns_km is not null                 then 'INTERPOLATED'
      else 'PREV_ROUND'
    end as start_method,
    -- ── 끝 ── (종전과 같다)
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
      when 'FIRST_NEW_INSPECTION' then m.fn_km
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
                        when 'FIRST_NEW_INSPECTION' then m.fn_date
                        when 'INTERPOLATED' then m.ns_date else m.ps_date end as km_start_src_date_v,
    case m.end_method   when 'REPLACEMENT' then null
                        when 'INTERPOLATED' then m.ne_date else m.pe_date end as km_end_src_date_v,
    -- HM — 같은 규칙. 보간 상대가 없으면 앞 회차 값.
    case
      when m.mounted_at is null then case when m.fn_ok then m.fn_hm end
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
       hm_end_v            as hm_end,
       -- ── 이하 20261104100000 추가 (맨 뒤에만) ──
       coalesce(mounted_at, case when fn_ok and fn_km is not null then fn_date end) as mounted_at_effective,
       coalesce(fn_ok and fn_km is not null, false)                               as start_inferred
  from v;

alter view public.v_tire_ledger set (security_invoker = on);
grant select on public.v_tire_ledger to authenticated;
-- anon 에는 주지 않는다 (20260906100000 익명 읽기 차단).

comment on view public.v_tire_ledger is
  '개체 단위 장착 구간별 주행거리. km_start·km_end 는 교체 km_at → 같은 날 회차 → 앞뒤 회차 날짜 보간 → '
  '앞 회차(APPROX) 순. 최초 장착분(mounted_at NULL)은 첫 측정이 신품(tread_avg >= new_tread)이면 '
  '그 회차를 시작점으로 쓴다(FIRST_NEW_INSPECTION). segment_km NULL 은 산출 불가(km_flag 참조)이지 0 이 아니다.';
comment on column public.v_tire_ledger.km_method is
  'km_start 산출 방식: REPLACEMENT · INSPECTION · INTERPOLATED · PREV_ROUND · FIRST_NEW_INSPECTION. NULL = 산출 불가';
comment on column public.v_tire_ledger.km_end_method is
  'km_end 산출 방식: REPLACEMENT · INSPECTION · INTERPOLATED · PREV_ROUND · LAST_ROUND(장착 중)';
comment on column public.v_tire_ledger.km_start_src_date is
  'km_start 에 쓴 회차 일자. INTERPOLATED 면 뒤 회차 일자(앞 회차는 km_start_prev_round 의 일자), '
  'FIRST_NEW_INSPECTION 이면 첫 신품 측정 회차 일자';
comment on column public.v_tire_ledger.mounted_at_effective is
  '구간 시작일. mounted_at 이 있으면 그 값, 최초 장착분이 FIRST_NEW_INSPECTION 으로 추론되면 첫 신품 측정 회차 일자, '
  '그 외 NULL. mounted_at 원값은 바꾸지 않는다 (WO-TMS-2026-11-LIFE-KM T-1)';
comment on column public.v_tire_ledger.start_inferred is
  'true = 시작점이 FIRST_NEW_INSPECTION 추론값: mounted_at 이 NULL 인 최초 장착분(seq 0)이고, 그 시리얼이 같은 ch·pos 에서 '
  '처음 측정된 회차의 tread_avg 가 tire_config.new_tread 이상(신품)이며 그 회차 차량 km 가 있다. '
  'km_start·hm_start = 그 회차 값(같은 날 최대값, 0 이하 미측정). decisions L-5 (L-4 대체)';

-- ============================================================
-- ROLLBACK: 20261016150000_v_tire_ledger_interpolate.sql 본문 재실행은 불가하다
--   (create or replace view 는 컬럼을 줄일 수 없다). 되돌릴 때는 승인 후
--   drop view ... cascade 후 20261016150000 · 20260828094000 · 20260828095000 ·
--   20261017120000 재실행. 화면은 km_method 를 문자열로만 읽으므로 영향 없음.
-- ============================================================
