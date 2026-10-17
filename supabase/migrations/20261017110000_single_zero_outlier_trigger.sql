-- ============================================================
-- M-9 · W-1 단일 0 OUTLIER 규칙 상시화 (사용자 결정 2026-10-17)
--
-- 20261016190000 은 일회성 백필이라 새 회차는 자동 표시되지 않았다. 그러면 마모 분석
-- (DB 뷰 — inspections.tread* 캐시)과 배치도(src/lib/treadRules.ts effectiveTread,
-- 원시 4점에서 매번 계산)가 새 회차에서 갈린다.
--
-- 규칙 (W-1, 20261016190000 과 동일):
--   P1 4점이 모두 있고, 0 이 정확히 하나이며, 나머지 셋이 모두 tread_critical 이상
--   → 그 0 점 flag = 'OUTLIER'. depth_mm 는 고치지 않는다.
--   규칙이 더 이상 성립하지 않으면(점 수정·삭제) **자동 지정분만** 'OK' 로 되돌린다 —
--   flag_note 의 표식 'CHK-TMS-2026-10-16-WEB W-1' 로 구분. 사람이 단 OUTLIER 는 안 건드린다.
--
-- 호출 지점: recalc_inspection_tread_stats() 맨 앞. 안의 update 가 같은 트리거를 다시
-- 부르지만(pg_trigger_depth 2) 그 안에서는 규칙 적용을 건너뛰고 통계만 다시 쓴다 →
-- 재귀 1단으로 끝난다. 바깥 호출도 이어서 통계를 쓰므로 결과는 같다.
--
-- 멱등: 함수 재정의만. 기존 7행은 이미 OUTLIER 라 재실행해도 변경 없음.
-- ============================================================

create or replace function public.apply_single_zero_outlier(p_inspection_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_crit  numeric := coalesce((select tread_critical from public.tire_config where id = 1), 3);
  v_match boolean;
  v_note  constant text :=
    '4점 중 0 하나 — 측정 누락으로 보고 통계 제외 (CHK-TMS-2026-10-16-WEB W-1, 자동 지정)';
begin
  select count(*) = 4
     and count(*) filter (where depth_mm = 0) = 1
     and bool_and(depth_mm = 0 or depth_mm >= v_crit)
    into v_match
    from public.tread_points
   where inspection_id = p_inspection_id and circ_pos = 'P1' and deleted_at is null;

  if coalesce(v_match, false) then
    update public.tread_points
       set flag = 'OUTLIER', flag_note = v_note, updated_at = now()
     where inspection_id = p_inspection_id and circ_pos = 'P1' and deleted_at is null
       and depth_mm = 0 and flag = 'OK';
  else
    update public.tread_points
       set flag = 'OK', flag_note = null, updated_at = now()
     where inspection_id = p_inspection_id and circ_pos = 'P1' and deleted_at is null
       and flag = 'OUTLIER' and flag_note like '%CHK-TMS-2026-10-16-WEB W-1%';
  end if;
end $$;

comment on function public.apply_single_zero_outlier(uuid) is
  'W-1: P1 4점 중 0 하나(나머지 ≥ tread_critical)를 OUTLIER 로 자동 표시, 규칙 해제 시 자동분만 복원. recalc 트리거가 호출.';

create or replace function public.recalc_inspection_tread_stats()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  v_id := coalesce(new.inspection_id, old.inspection_id);

  -- W-1 자동 표시. 안쪽 update 가 이 트리거를 다시 부르면(depth 2) 건너뛴다.
  if pg_trigger_depth() <= 1 then
    perform public.apply_single_zero_outlier(v_id);
  end if;

  update public.inspections i set
    tread        = s.min_v,
    tread_avg    = s.avg_v,
    tread_max    = s.max_v,
    tread_range  = round(s.max_v - s.min_v, 2),
    tread_sd     = s.sd_v,
    tread_cv     = case when s.avg_v > 0 and s.sd_v is not null
                        then round(s.sd_v / s.avg_v * 100, 1) end,
    shoulder_avg = s.sh_v,
    center_avg   = s.ce_v,
    outboard_avg = s.ob_v,
    inboard_avg  = s.ib_v,
    point_count  = s.n
  from (
    select count(*)::int                                                   as n,
           round(avg(depth_mm), 2)                                         as avg_v,
           min(depth_mm)                                                   as min_v,
           max(depth_mm)                                                   as max_v,
           round(stddev_samp(depth_mm), 3)                                 as sd_v,
           round(avg(depth_mm) filter (where width_pos in ('L','R')),  2)  as sh_v,
           round(avg(depth_mm) filter (where width_pos in ('C1','C2')), 2) as ce_v,
           round(avg(depth_mm) filter (where width_pos = 'L'), 2)          as ob_v,
           round(avg(depth_mm) filter (where width_pos = 'R'), 2)          as ib_v
      from public.tread_points
     where inspection_id = v_id
       and deleted_at is null
       and flag <> 'OUTLIER'
  ) s
  where i.id = v_id and s.n > 0;   -- 유효 점이 0이면 기존 값을 건드리지 않는다

  return null;
end $$;

-- 트리거 자체는 20260826151000 의 trg_tread_points_recalc 그대로 (함수 본문만 바뀜).

-- ROLLBACK:
--   20260826151000_inspections_tread_stats.sql 의 recalc_inspection_tread_stats() 재실행;
--   drop function if exists public.apply_single_zero_outlier(uuid);
