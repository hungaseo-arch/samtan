-- ============================================================
-- E-1. save_inspection_with_points — 점검 + 원시 4점 원자 저장 RPC
-- (작업지시서 v3 §E-1 규칙 7: inspections 1행 + tread_points N행을
--  하나의 트랜잭션으로. 부분 저장이 남으면 안 된다.)
--
-- 지시서 원문과의 차이 (리포 적응):
--  · inspections 는 (ch, inspection_date, pos) 유니크이므로 평문 INSERT 대신
--    upsert — 같은 회차 재저장은 기존 화면(saveInspectionRound)과 동일하게 갱신.
--  · tread_points 도 (inspection_id, circ_pos, width_pos) 유니크 + 소프트삭제
--    행이 키를 점유하므로 upsert 로 갱신·부활. 이전 값은 trg_tread_points_log
--    감사 로그에 남는다 (원시값 이력 보존).
--  · SECURITY INVOKER — RLS(staff/admin 쓰기)가 그대로 적용된다.
-- ============================================================

create or replace function public.save_inspection_with_points(
  p_ch text, p_pos text, p_date date, p_serial text,
  p_pressure numeric, p_hm numeric, p_km numeric,
  p_points jsonb,          -- [{"circ":"P1","width":"L","depth":12.4}, ...]
  p_flag text default 'OK', p_flag_note text default null,
  p_remark text default null
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
  v_n  int;
begin
  v_n := coalesce(jsonb_array_length(p_points), 0);
  -- 규칙 1: 4칸 전부 입력(폭 4점) 또는 16점(원주 확장). 부분 입력 저장 금지.
  if v_n not in (4, 16) then
    raise exception 'tread_points 는 4점 또는 16점이어야 합니다 (전달: %점)', v_n;
  end if;
  if p_flag = 'OUTLIER' and (p_flag_note is null or btrim(p_flag_note) = '') then
    raise exception 'OUTLIER Flag 는 flag_note(제외 사유) 필수입니다 (설계서 §15)';
  end if;

  insert into public.inspections (ch, pos, inspection_date, serial, pressure, hm, km, remark)
  values (p_ch, p_pos, p_date, p_serial, p_pressure, p_hm, p_km, p_remark)
  on conflict (ch, inspection_date, pos) do update
    set serial     = excluded.serial,
        pressure   = excluded.pressure,
        hm         = excluded.hm,
        km         = excluded.km,
        remark     = excluded.remark,
        deleted_at = null
  returning id into v_id;

  insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm, flag, flag_note)
  select v_id,
         coalesce(e->>'circ', 'P1'),
         e->>'width',
         (e->>'depth')::numeric,
         p_flag, p_flag_note
    from jsonb_array_elements(p_points) e
  on conflict (inspection_id, circ_pos, width_pos) do update
    set depth_mm   = excluded.depth_mm,
        flag       = excluded.flag,
        flag_note  = excluded.flag_note,
        deleted_at = null;

  return v_id;
end $$;

grant execute on function public.save_inspection_with_points(
  text, text, date, text, numeric, numeric, numeric, jsonb, text, text, text) to authenticated;

comment on function public.save_inspection_with_points is
  '점검 1회차 + 트레드 원시 측정점(4 또는 16)을 원자 저장. 재저장은 upsert 갱신. 통계 캐시는 trg_tread_points_recalc 가 자동 산출.';

-- ROLLBACK:
--   drop function if exists public.save_inspection_with_points(
--     text, text, date, text, numeric, numeric, numeric, jsonb, text, text, text);
