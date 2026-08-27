-- ============================================================
-- B-5 · 데이터 품질 점검 뷰
--
-- 6개 검사를 UNION ALL 로 묶어 한 화면에서 본다.
-- 2026-08-27 v3 반영 후 기대값 (Phase A·B 적재 완료 기준):
--   zero_tread_unverified   0   (§C-4-1 — 아래 참조)
--   km_missing             80   (CH 849 전량 — 계기 미기록)
--   km_jump                 1   (CH 847 07-12 → 07-26)
--   hm_jump                 9   (§C-4-3 신설 — CH 832 5건 · CH 835 4건)
--   groove_missing          0   (§C-4-4 — point_count 기준으로 교체)
--   serial_break_unlogged   0   (시리얼 변경 전부 replacements 에 있음)
--
-- 작업지시서 v3 §C-4 반영 3건:
--   ① zero_tread_unverified 를 `tread = 0 AND center_avg > 0` 으로 좁힌다.
--      v3 §0.3 이 밝혔듯 4점 원본에서 어깨는 5~8 mm 인데 중앙 그루브만 0 인
--      행들이다. 미측정이 아니라 **실측**이며 Techking 이 주장한 중심부 급진
--      마모의 직접 증거다. 경고 대상이 아니다. center_avg = 0 (중앙까지 소진)
--      인 행도 마찬가지로 실측이므로 뺀다. 남는 것은 "4점 중 중앙은 남았는데
--      최소값만 0" 이라는 물리적으로 설명되지 않는 조합뿐이다 → 기대값 0.
--   ② km_jump 임계는 1,000 km/일 유지. CH 834 를 km_corrected 로 적재했으므로
--      남는 건은 CH 847 07-26 1건뿐이다.
--   ③ hm_jump 신설. 일 HM 증가 > 24 h/일 은 물리적으로 불가능하다 (v3 §0.6(b)).
--      정상 차량은 18~21 h/일이다. 계기 교체·리셋 또는 오기.
--   ④ (추가 판단) groove_missing 을 tread_g1..g4 에서 point_count 로 옮긴다.
--      적재 RPC(save_inspection_with_points)는 tread_points 에만 쓰고 g1..g4 는
--      채우지 않는다. g1..g4 기준으로 두면 이 검사는 영구히 0 을 반환하는
--      죽은 검사가 된다. 정본인 point_count 로 판정해야 실제로 동작한다.
--
-- 어느 항목도 저장을 막지 않는다. 경고 목록일 뿐이다 (작업지시서 v2 §3).
-- ============================================================

create or replace view public.v_data_quality as

-- ① tread = 0 인데 4점 원본으로 설명되지 않는 행 (v3 §C-4-1)
--    중앙 그루브가 살아 있는데(center_avg > 0) 최소값만 0 인 조합은 물리적으로
--    설명되지 않는다 — 입력 오류를 의심해야 한다.
--    중앙까지 소진된 행(center_avg = 0)은 실측이므로 여기서 제외한다.
select
  'zero_tread_unverified'                                as check_key,
  i.ch                                                   as ch,
  i.pos                                                  as pos,
  i.inspection_date                                      as inspection_date,
  format('tread=0 인데 center_avg=%s · status=%s',
         i.center_avg, i.tread_status)                   as detail
from public.inspections i
where i.deleted_at is null
  and i.tread = 0
  and i.tread_status = 'measured'
  and i.center_avg > 0

union all

-- ② 주행거리 미기록
select
  'km_missing', i.ch, i.pos, i.inspection_date,
  case when i.km is null then 'km NULL' else 'km 0' end
from public.inspections i
where i.deleted_at is null
  and (i.km is null or i.km = 0)

union all

-- ③ 주행거리 급증/감소 — 차량·일자 단위로 판정한다
select
  'km_jump', j.ch, null::text, j.inspection_date,
  format('%s → %s (%s → %s, %s일, %s km/일)',
         j.pd, j.inspection_date, j.pk, j.km,
         (j.inspection_date - j.pd),
         round((j.km - j.pk) / (j.inspection_date - j.pd), 1))
from (
  select ch, inspection_date, km,
         lag(km)              over w as pk,
         lag(inspection_date) over w as pd
  from (
    select ch, inspection_date, max(km) as km
    from public.inspections
    where deleted_at is null
    group by ch, inspection_date
  ) v
  window w as (partition by ch order by inspection_date)
) j
join public.vehicles vh on vh.ch = j.ch and vh.deleted_at is null
where j.pk is not null
  and j.inspection_date > j.pd
  and (
        -- 감소: 계기 리셋이 등록된 차량은 정상으로 본다
        (j.km < j.pk and vh.km_reset = false)
        -- 급증: 하루 1,000 km 초과
     or ((j.km - j.pk) / (j.inspection_date - j.pd) > 1000)
      )

union all

-- ④ 그루브 4점 미입력 (v3 §C-4-4 — point_count 기준)
--    v3 §B 백필로 전 회차가 4점을 갖게 됐다. DEPRECATED 인 tread_g1..g4 대신
--    정본인 tread_points 집계(point_count)로 판정한다. 적재 RPC 는 g1..g4 를
--    채우지 않으므로 옛 기준으로 두면 영구히 0 인 죽은 검사가 된다.
select
  'groove_missing', i.ch, i.pos, i.inspection_date,
  format('측정점 %s개 (4 또는 16 이어야 함)', i.point_count)
from public.inspections i
where i.deleted_at is null
  and i.tread_status = 'measured'
  and i.point_count not in (4, 16)

union all

-- ⑤ 가동시간 급증 — 하루 24시간을 넘을 수 없다 (v3 §C-4-3 신설)
--    정상 차량은 18~21 h/일. 초과는 계기 교체·리셋 또는 오기다.
--    감소는 hm_reset 이 등록된 차량이면 정상으로 본다.
select
  'hm_jump', j.ch, null::text, j.inspection_date,
  format('%s → %s (%s → %s, %s일, %s h/일)',
         j.pd, j.inspection_date, j.ph, j.hm,
         (j.inspection_date - j.pd),
         round((j.hm - j.ph) / (j.inspection_date - j.pd), 1))
from (
  select ch, inspection_date, hm,
         lag(hm)              over w as ph,
         lag(inspection_date) over w as pd
  from (
    select ch, inspection_date, max(hm) as hm
    from public.inspections
    where deleted_at is null and hm is not null
    group by ch, inspection_date
  ) v
  window w as (partition by ch order by inspection_date)
) j
join public.vehicles vh on vh.ch = j.ch and vh.deleted_at is null
where j.ph is not null
  and j.inspection_date > j.pd
  and (
        (j.hm < j.ph and vh.hm_reset = false)
     or ((j.hm - j.ph) / (j.inspection_date - j.pd) > 24)
      )

union all

-- ⑥ 시리얼이 바뀌었는데 교체 원장에 없음
--    트레드 상승은 근거로 쓰지 않는다. serial 비교만이 유일한 근거다.
select
  'serial_break_unlogged', b.ch, b.pos, b.inspection_date,
  format('%s → %s (replacements 미등록)', b.prev_serial, b.serial)
from (
  select ch, pos, serial, inspection_date,
         lag(serial) over w as prev_serial
  from public.inspections
  where deleted_at is null
  window w as (partition by ch, pos order by inspection_date)
) b
where b.prev_serial is not null
  and nullif(btrim(coalesce(b.serial, '')), '')
      is distinct from nullif(btrim(coalesce(b.prev_serial, '')), '')
  and not exists (
    select 1 from public.replacements r
    where r.deleted_at is null
      and r.ch = b.ch and r.pos = b.pos
      and r.new_serial = b.serial
  );

alter view public.v_data_quality set (security_invoker = on);
comment on view public.v_data_quality is
  '데이터 품질 경고 목록. 어느 항목도 저장을 막지 않는다. check_key 별 건수는 docs/data-model.md 참조.';

grant select on public.v_data_quality to anon, authenticated;

-- ============================================================
-- ROLLBACK:
--   drop view if exists public.v_data_quality;
-- ============================================================
