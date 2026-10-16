-- v_data_quality — detail 을 로케일별로 조립할 수 있게 params(jsonb) 를 붙인다
--
-- 지금까지 detail 은 뷰가 만든 **한국어 고정 문자열**이었다. 화면은 ko·id·en
-- 3개 로케일인데 배지 펼침 목록만 한국어로 남는다. 문구를 언어별로 만들려면
-- 뷰가 값을, 클라이언트가 문장을 담당해야 한다 (src/lib/dqDetail.ts).
--
-- detail 은 **지우지 않는다**. 컬럼 타입·순서를 바꾸면 create or replace view 가
-- 거부되고, 아직 마이그레이션 전인 환경에서 목록이 통째로 비기 때문이다.
-- 클라이언트는 params 가 없으면 detail 을 그대로 쓴다.
-- params 는 규칙마다 키가 다르므로 컬럼이 아니라 jsonb 하나로 둔다.
--
-- 규칙 본문(where 절·severity·임계치)은 20260828096000 과 한 글자도 다르지 않다.
-- 여기서 바뀌는 것은 맨 뒤에 붙는 params 컬럼 하나뿐이다.

create or replace view public.v_data_quality as
 select 'zero_tread_unverified'::text as check_key, i.ch, i.pos, i.inspection_date,
        format('tread=0 인데 center_avg=%s · status=%s', i.center_avg, i.tread_status) as detail,
        'ERROR'::text as severity,
        jsonb_build_object('center_avg', i.center_avg, 'status', i.tread_status) as params
   from public.inspections i
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
  'detail 은 한국어 고정 문장(하위호환용), params 는 로케일별 조립용 원값.';

-- ============================================================
-- ROLLBACK: 20260828096000_data_quality_rules.sql 의 뷰 정의를 다시 실행.
-- ============================================================
