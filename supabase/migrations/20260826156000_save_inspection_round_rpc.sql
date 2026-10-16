-- ============================================================
-- E-1 보강. save_inspection_with_points 확장 + 회차 단위 원자 저장
--
-- 20260826155000 의 1차 정의는 지시서 v3 §E-1 원문 그대로였으나 실제 화면을
-- 붙이면서 두 가지가 빠져 있음이 드러났다.
--   ① driver — 기존 저장 경로(saveInspectionRound)가 채우던 회차 메타.
--      RPC 로 갈아타면 신규 행의 driver 가 통째로 NULL 이 된다.
--   ② tread_status — §E-1 규칙 6(트레드 0 확인 모달)의 결과를 받을 자리.
--      not_measured 를 고르면 tread_points 행을 만들지 않아야 한다.
-- 인자 추가는 오버로드 모호성을 낳으므로 기존 시그니처를 버리고 다시 만든다
-- (아직 호출부가 없어 안전하다. DROP FUNCTION 은 프로젝트 금지 목록 밖).
--
-- 그리고 화면은 10개 포지션을 한 번에 저장한다. 포지션마다 RPC 를 따로 부르면
-- 중간 실패 시 일부 포지션만 남는다 — 기존 단일 upsert 가 보장하던 회차 원자성이
-- 깨진다. save_inspection_round_with_points 가 한 트랜잭션으로 감싼다.
-- ============================================================

drop function if exists public.save_inspection_with_points(
  text, text, date, text, numeric, numeric, numeric, jsonb, text, text, text);

create or replace function public.save_inspection_with_points(
  p_ch text, p_pos text, p_date date, p_serial text,
  p_pressure numeric, p_hm numeric, p_km numeric,
  p_points jsonb,          -- [{"circ":"P1","width":"L","depth":12.4}, ...]
  p_flag text default 'OK', p_flag_note text default null,
  p_remark text default null,
  p_driver text default null,
  p_tread_status text default 'measured'
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
  v_n  int;
begin
  v_n := coalesce(jsonb_array_length(p_points), 0);

  -- 규칙 1: 폭 4점 전부 또는 원주 확장 16점. 0점(트레드 미측정)도 허용하되
  -- 3점 같은 부분 입력은 막는다.
  if v_n not in (0, 4, 16) then
    raise exception 'tread_points 는 0·4·16점만 허용합니다 (전달: %점)', v_n;
  end if;
  -- 0점인데 measured 로 들어오면 트레드를 조용히 잃는다. 상태를 명시하게 강제한다.
  if v_n = 0 and p_tread_status = 'measured' then
    raise exception '트레드 미입력 행은 tread_status 를 not_measured 등으로 지정해야 합니다';
  end if;
  if p_flag = 'OUTLIER' and (p_flag_note is null or btrim(p_flag_note) = '') then
    raise exception 'OUTLIER Flag 는 flag_note(제외 사유) 필수입니다 (설계서 §15)';
  end if;

  insert into public.inspections
    (ch, pos, inspection_date, serial, pressure, hm, km, remark, driver, tread_status)
  values
    (p_ch, p_pos, p_date, p_serial, p_pressure, p_hm, p_km, p_remark, p_driver,
     coalesce(p_tread_status, 'measured'))
  on conflict (ch, inspection_date, pos) do update
    set serial       = excluded.serial,
        pressure     = excluded.pressure,
        hm           = excluded.hm,
        km           = excluded.km,
        remark       = excluded.remark,
        driver       = excluded.driver,
        tread_status = excluded.tread_status,
        deleted_at   = null
  returning id into v_id;

  if v_n > 0 then
    insert into public.tread_points
      (inspection_id, circ_pos, width_pos, depth_mm, flag, flag_note)
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
  end if;

  -- 이번에 안 들어온 측정점은 소프트 삭제한다.
  -- 16점 → 4점으로 줄여 재저장할 때 남은 P2~P4 가 통계를 오염시키는 것을 막는다.
  update public.tread_points t
     set deleted_at = now()
   where t.inspection_id = v_id
     and t.deleted_at is null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) e
        where coalesce(e->>'circ', 'P1') = t.circ_pos
          and e->>'width' = t.width_pos
     );

  -- 유효 측정점이 0이면 recalc 트리거는 기존 값을 보존한다(n>0 조건).
  -- 미측정으로 되돌린 행은 통계 캐시를 직접 비워야 한다.
  if v_n = 0 then
    update public.inspections set
      tread = null, tread_avg = null, tread_max = null, tread_range = null,
      tread_sd = null, tread_cv = null, shoulder_avg = null, center_avg = null,
      outboard_avg = null, inboard_avg = null, point_count = 0
    where id = v_id;
  end if;

  return v_id;
end $$;

grant execute on function public.save_inspection_with_points(
  text, text, date, text, numeric, numeric, numeric, jsonb, text, text, text, text, text)
  to authenticated;

comment on function public.save_inspection_with_points is
  '점검 1행 + 트레드 원시 측정점(0·4·16)을 원자 저장. 재저장은 upsert 갱신, 빠진 측정점은 소프트 삭제. 통계 캐시는 trg_tread_points_recalc 가 자동 산출.';

-- ── 회차(포지션 10개) 단위 원자 저장 ─────────────────────────
create or replace function public.save_inspection_round_with_points(
  p_ch text, p_date date, p_hm numeric, p_km numeric, p_driver text,
  p_rows jsonb   -- [{"pos":"L1 Out","serial":"…","pressure":117,
                 --   "tread_status":"measured","flag":"OK","flag_note":null,
                 --   "remark":null,"points":[{"circ":"P1","width":"L","depth":12.4}, …]}, …]
) returns int
language plpgsql security invoker set search_path = public
as $$
declare r jsonb; n int := 0;
begin
  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    raise exception '저장할 포지션이 없습니다';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    perform public.save_inspection_with_points(
      p_ch,
      r->>'pos',
      p_date,
      nullif(btrim(coalesce(r->>'serial', '')), ''),
      nullif(r->>'pressure', '')::numeric,
      p_hm, p_km,
      coalesce(r->'points', '[]'::jsonb),
      coalesce(r->>'flag', 'OK'),
      nullif(btrim(coalesce(r->>'flag_note', '')), ''),
      nullif(btrim(coalesce(r->>'remark', '')), ''),
      nullif(btrim(coalesce(p_driver, '')), ''),
      coalesce(r->>'tread_status', 'measured'));
    n := n + 1;
  end loop;

  return n;
end $$;

grant execute on function public.save_inspection_round_with_points(
  text, date, numeric, numeric, text, jsonb) to authenticated;

comment on function public.save_inspection_round_with_points is
  '한 회차(차량·점검일) 전 포지션을 한 트랜잭션으로 저장. 한 포지션이라도 실패하면 전부 롤백 — 부분 저장이 남지 않는다 (v3 §E-1 규칙 7).';

-- ROLLBACK:
--   drop function if exists public.save_inspection_round_with_points(
--     text, date, numeric, numeric, text, jsonb);
--   drop function if exists public.save_inspection_with_points(
--     text, text, date, text, numeric, numeric, numeric, jsonb, text, text, text, text, text);
--   -- 20260826155000_save_inspection_rpc.sql 의 11인자 정의로 되돌린다.
