-- ============================================================
-- WO-TMS-2026-11-LIFE-KM T-4 · v_data_quality.zero_tread_unverified 심각도 조정
--
-- 쎄오님 결정 (2026-11-04 M-3): 센터 0 mm 는 경고(WARN)만.
-- 엔지니어링 기준 (WO §1-2): 수명 종료 = 숄더 완전 마모 또는 센터 카카스 노출.
-- 센터 홈 깊이 0 mm(숄더 고무 잔존)는 수명 종료가 아니고 주행 중인 회차다.
--
-- 규칙: tread = 0 · measured 회차 중
--   숄더(L·R) 유효 점 최소 > 0 이고 센터(C1·C2) 유효 점 최소 = 0  → WARN
--   그 외 (숄더에도 0 · tread_points 미보유)                     → ERROR (종전)
--   유효 점 = tread_points 소프트 삭제·OUTLIER 제외 (recalc 트리거와 같은 기준).
--
-- 바뀌는 것은 zero_tread_unverified 의 severity 식과 params 의 키 2개(shoulder_min ·
-- center_min) 뿐이다. 다른 규칙 본문은 20260829100000 과 한 글자도 다르지 않다.
-- 컬럼 순서·형 동일(check_key, ch, pos, inspection_date, detail, severity, params).
--
-- create or replace view 는 reloptions 를 지정값으로 바꾼다 — 20260906100000 이 건
-- security_invoker 를 다시 건다(RLS 우회 방지).
-- 멱등: create or replace view · alter view set · comment.
-- ============================================================

create or replace view public.v_data_quality as
 select 'zero_tread_unverified'::text as check_key, i.ch, i.pos, i.inspection_date,
        format('tread=0 인데 center_avg=%s · status=%s', i.center_avg, i.tread_status) as detail,
        -- 20261104120000: 숄더(L·R) 가 모두 0 초과이고 0 이 센터(C1·C2)에만 있으면 WARN
        -- (센터 0 mm 는 수명 종료가 아니다 — 쎄오님 결정 2026-11-04 M-3). 그 외(숄더 0 · 4점 미보유)는 ERROR.
        case when z.sh_min > 0 and z.ce_min = 0 then 'WARN' else 'ERROR' end::text as severity,
        jsonb_build_object('center_avg', i.center_avg, 'status', i.tread_status,
                           'shoulder_min', z.sh_min, 'center_min', z.ce_min) as params
   from public.inspections i
   left join lateral (
     select min(tp.depth_mm) filter (where tp.width_pos in ('L', 'R'))   as sh_min,
            min(tp.depth_mm) filter (where tp.width_pos in ('C1', 'C2')) as ce_min
       from public.tread_points tp
      where tp.inspection_id = i.id and tp.deleted_at is null and tp.flag <> 'OUTLIER'
   ) z on true
  where i.deleted_at is null and i.tread = 0 and i.tread_status = 'measured'
union all
 select 'km_missing', i.ch, i.pos, i.inspection_date,
        case when i.km is null then 'km NULL' else 'km 0' end,
        'WARN',
        jsonb_build_object('kind', case when i.km is null then 'null' else 'zero' end)
   from public.inspections i
  where i.deleted_at is null and (i.km is null or i.km = 0)
union all
 select 'km_jump', j.ch, null::text, j.inspection_date,
        format('%s → %s (%s → %s, %s일, %s km/일)', j.pd, j.inspection_date, j.pk, j.km,
               j.inspection_date - j.pd,
               round((j.km - j.pk) / (j.inspection_date - j.pd)::numeric, 1)),
        -- 감소는 물리적으로 불가(리셋 차량 제외)라 ERROR, 급증은 WARN
        case when j.km < j.pk then 'ERROR' else 'WARN' end,
        jsonb_build_object('from_date', j.pd, 'to_date', j.inspection_date,
                           'from', j.pk, 'to', j.km,
                           'days', j.inspection_date - j.pd,
                           'per_day', round((j.km - j.pk) / (j.inspection_date - j.pd)::numeric, 1))
   from (select v.ch, v.inspection_date, v.km,
                lag(v.km) over w as pk, lag(v.inspection_date) over w as pd
           from (select ch, inspection_date, max(km) as km
                   from public.inspections where deleted_at is null
                  group by ch, inspection_date) v
         window w as (partition by v.ch order by v.inspection_date)) j
   join public.vehicles vh on vh.ch = j.ch and vh.deleted_at is null
  where j.pk is not null and j.inspection_date > j.pd
    and ((j.km < j.pk and vh.km_reset = false)
      or ((j.km - j.pk) / (j.inspection_date - j.pd)::numeric) > 1000)
union all
 select 'groove_missing', i.ch, i.pos, i.inspection_date,
        format('측정점 %s개 (4 또는 16 이어야 함)', i.point_count),
        'WARN',
        jsonb_build_object('points', i.point_count)
   from public.inspections i
  where i.deleted_at is null and i.tread_status = 'measured'
    and i.point_count <> all (array[4, 16])
union all
 select 'hm_jump', j.ch, null::text, j.inspection_date,
        format('%s → %s (%s → %s, %s일, %s h/일)', j.pd, j.inspection_date, j.ph, j.hm,
               j.inspection_date - j.pd,
               round((j.hm - j.ph) / (j.inspection_date - j.pd)::numeric, 1)),
        'ERROR',
        jsonb_build_object('from_date', j.pd, 'to_date', j.inspection_date,
                           'from', j.ph, 'to', j.hm,
                           'days', j.inspection_date - j.pd,
                           'per_day', round((j.hm - j.ph) / (j.inspection_date - j.pd)::numeric, 1))
   from (select v.ch, v.inspection_date, v.hm,
                lag(v.hm) over w as ph, lag(v.inspection_date) over w as pd
           from (select ch, inspection_date, max(hm) as hm
                   from public.inspections where deleted_at is null and hm is not null
                  group by ch, inspection_date) v
         window w as (partition by v.ch order by v.inspection_date)) j
   join public.vehicles vh on vh.ch = j.ch and vh.deleted_at is null
  where j.ph is not null and j.inspection_date > j.pd
    and ((j.hm < j.ph and vh.hm_reset = false)
      or ((j.hm - j.ph) / (j.inspection_date - j.pd)::numeric) > 24)
union all
 select 'serial_break_unlogged', b.ch, b.pos, b.inspection_date,
        format('%s → %s (replacements 미등록)', b.prev_serial, b.serial),
        'ERROR',
        jsonb_build_object('prev', b.prev_serial, 'next', b.serial)
   from (select ch, pos, serial, inspection_date,
                lag(serial) over w as prev_serial
           from public.inspections where deleted_at is null
         window w as (partition by ch, pos order by inspection_date)) b
  where b.prev_serial is not null
    and nullif(btrim(coalesce(b.serial, '')), '')
        is distinct from nullif(btrim(coalesce(b.prev_serial, '')), '')
    and not exists (select 1 from public.replacements r
                     where r.deleted_at is null and r.ch = b.ch and r.pos = b.pos
                       and r.new_serial = b.serial)
union all
 select 'tread_min_avg_conflict', i.ch, i.pos, i.inspection_date,
        format('최소 0.0 인데 4점 평균 %s mm — 입력 오류 의심', round(i.tread_avg, 1)),
        'ERROR',
        jsonb_build_object('avg', round(i.tread_avg, 2))
   from public.inspections i
  where i.deleted_at is null and i.tread = 0 and i.tread_avg > 5.0
union all
 select 'inner_position_unmeasured', i.ch, i.pos, i.inspection_date,
        '복륜 내측 공기압 미입력',
        'WARN',
        '{}'::jsonb
   from public.inspections i
  where i.deleted_at is null and i.pos like '%In' and i.pressure is null
union all
 select 'removal_reason_missing', r.ch, r.pos, r.date,
        format('%s 교체 — 탈착 사유 미입력', coalesce(r.new_serial, '(신규 시리얼 미상)')),
        'WARN',
        jsonb_build_object('serial', r.new_serial)
   from public.replacements r
  where r.deleted_at is null and r.removal_code is null;

comment on view public.v_data_quality is
  '데이터 품질 점검. severity ERROR = 물리적으로 불가하거나 값이 모순, WARN = 결손·확인 필요. '
  'zero_tread_unverified 는 숄더 잔존·센터 0 이면 WARN(20261104120000). '
  'detail 은 한국어 고정 문장(하위호환용), params 는 로케일별 조립용 원값.';

alter view public.v_data_quality set (security_invoker = on);
grant select on public.v_data_quality to authenticated;
-- anon 에는 주지 않는다 (20260906100000 익명 읽기 차단).

-- ============================================================
-- ROLLBACK: 20260829100000_data_quality_detail_params.sql 의 뷰 정의를 다시 실행한 뒤
--   alter view public.v_data_quality set (security_invoker = on);
-- ============================================================
