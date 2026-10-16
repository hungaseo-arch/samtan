-- T-8 · v_data_quality 규칙 보강 + severity
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-8
--
-- severity 는 **맨 뒤에** 붙인다. create or replace view 는 중간 삽입을 막고,
-- 뒤에 추가하는 것만 허용한다. 기존 select * 소비자가 깨지지 않는다.
--
-- 기존 임계치는 낮추지 않는다. 지시서는 km 급증을 1,500 km/일로 적었지만
-- 현재 뷰는 1,000 이다. 더 엄격한 쪽을 유지한다 — 품질 규칙을 명세에 맞춰
-- 느슨하게 바꾸면 지금 잡히던 행이 조용히 사라진다.
--
-- 새 규칙 3종
--   tread_min_avg_conflict  최소 0 인데 4점 평균이 5mm 초과 — 입력 오류 의심
--   inner_position_unmeasured  복륜 내측 공기압 미입력 (손이 안 닿아 건너뛰는 자리)
--     내측 219행 중 191행이 pressure NULL 이고 외측은 0행이다. 관행이 데이터로
--     그대로 드러난다.
--
-- zero_tread_unverified 는 center_avg > 0 조건을 뺐다. 지시서의 «트레드 0 관행»은
-- tread=0 and tread_status='measured' 전건을 말한다. 15건 → 62건.
--   removal_reason_missing  교체 사유 미입력 — TCO 산출의 직접 결손

create or replace view public.v_data_quality as
 select 'zero_tread_unverified'::text as check_key, i.ch, i.pos, i.inspection_date,
        format('tread=0 인데 center_avg=%s · status=%s', i.center_avg, i.tread_status) as detail,
        'ERROR'::text as severity
   from public.inspections i
  where i.deleted_at is null and i.tread = 0 and i.tread_status = 'measured' 
union all
 select 'km_missing', i.ch, i.pos, i.inspection_date,
        case when i.km is null then 'km NULL' else 'km 0' end,
        'WARN'
   from public.inspections i
  where i.deleted_at is null and (i.km is null or i.km = 0)
union all
 select 'km_jump', j.ch, null::text, j.inspection_date,
        format('%s → %s (%s → %s, %s일, %s km/일)', j.pd, j.inspection_date, j.pk, j.km,
               j.inspection_date - j.pd,
               round((j.km - j.pk) / (j.inspection_date - j.pd)::numeric, 1)),
        -- 감소는 물리적으로 불가(리셋 차량 제외)라 ERROR, 급증은 WARN
        case when j.km < j.pk then 'ERROR' else 'WARN' end
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
        'WARN'
   from public.inspections i
  where i.deleted_at is null and i.tread_status = 'measured'
    and i.point_count <> all (array[4, 16])
union all
 select 'hm_jump', j.ch, null::text, j.inspection_date,
        format('%s → %s (%s → %s, %s일, %s h/일)', j.pd, j.inspection_date, j.ph, j.hm,
               j.inspection_date - j.pd,
               round((j.hm - j.ph) / (j.inspection_date - j.pd)::numeric, 1)),
        'ERROR'
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
        'ERROR'
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
-- ── 신규 3종 ─────────────────────────────────────────
union all
 select 'tread_min_avg_conflict', i.ch, i.pos, i.inspection_date,
        format('최소 0.0 인데 4점 평균 %s mm — 입력 오류 의심', round(i.tread_avg, 1)),
        'ERROR'
   from public.inspections i
  where i.deleted_at is null and i.tread = 0 and i.tread_avg > 5.0
union all
 select 'inner_position_unmeasured', i.ch, i.pos, i.inspection_date,
        '복륜 내측 공기압 미입력',
        'WARN'
   from public.inspections i
  where i.deleted_at is null and i.pos like '%In' and i.pressure is null
union all
 select 'removal_reason_missing', r.ch, r.pos, r.date,
        format('%s 교체 — 탈착 사유 미입력', coalesce(r.new_serial, '(신규 시리얼 미상)')),
        'WARN'
   from public.replacements r
  where r.deleted_at is null and r.removal_code is null;

comment on view public.v_data_quality is
  '데이터 품질 점검. severity ERROR = 물리적으로 불가하거나 값이 모순, WARN = 결손·확인 필요.';
