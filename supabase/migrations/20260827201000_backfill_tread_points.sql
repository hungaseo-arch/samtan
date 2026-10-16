-- ============================================================
-- Phase B · 트레드 4점 전 회차 소급 백필 (410행 · 1,640점)
--   작업지시서 v3 §B · 원장 samtan_ledger_20260823.json
--
-- ⚠ 이 마이그레이션은 **측정점만 추가한다**. 기존 410행의
--    tread / serial / pressure / hm / remark / driver / tread_status 는
--    한 값도 바뀌어서는 안 된다 (v3 절대금지 #2).
--
-- 적재 경로인 save_inspection_with_points() 는 upsert 라 넘긴 값으로
-- 덮어쓴다. 그래서 원장 값이 아니라 **DB 가 지금 들고 있는 값을 그대로
-- 되돌려 준다**. 이렇게 하면 "안 바뀐다" 가 규칙이 아니라 구조가 된다.
--
-- 유일한 예외: CH 834 2026-07-26 의 km.
--   계기 리셋 카운터를 누적값에 더해 기록해 748,965.9 로 남아 있다.
--   올바른 값은 736,453.0 + 10,599.7 = 747,052.7 이다 (사용자 승인 Q3).
--   원장의 km_corrected 가 이 행에만 들어 있어 그 값을 쓴다.
--
-- tread 는 트리거(recalc_inspection_tread_stats)가 4점 최소값으로 다시 쓴다.
-- 그래서 각 행을 쓰기 **직전에** 4점 최소값이 DB 의 기존 tread 와 같은지 본다.
-- 하나라도 어긋나면 예외를 던져 그 블록 전체를 되돌린다.
--
-- 회차(차량 1대 × 날짜 1개 = 10행) 단위로 블록을 쪼갰다. 이유는 둘이다.
--   1) 임시 표를 쓰지 않기 위해서. 임시 표는 세션 수명이라 러너가 문장을
--      각각 다른 연결로 보내면 사라진다.
--   2) 큰 블록은 커넥션 풀러가 중간에 끊는다. 실제로 80행·40행·20행 블록이
--      소켓 종료와 타임아웃으로 죽었고 10행에서 안정적으로 통과했다.
-- 각 DO 블록은 그 자체로 완결이고, 순서와 무관하며, 몇 번을 다시 돌려도 같다
-- (tread_points 는 (inspection_id, circ_pos, width_pos) upsert).
-- 실패해도 그 회차만 되돌아간다 — DO 블록 하나가 트랜잭션 하나다.
-- ============================================================

-- ── CH 824 · 2026-07-05 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('824', '2026-07-05'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('824', '2026-07-05'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 824 2026-07-05: %행', n;
end $$;

-- ── CH 824 · 2026-07-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('824', '2026-07-26'::date, 'L1', array[21.19,19.99,20.64,21.06]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'L2 In', array[17.72,15.11,15.08,16.67]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'L2 Out', array[18.42,16.4,17.05,18]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'L3 In', array[17.73,13.57,14.94,16.9]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'L3 Out', array[19.06,15.48,16.01,18.45]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'R1', array[19.84,19.32,20.12,20.29]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'R2 In', array[18.35,14.83,15.85,17.94]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'R2 Out', array[17.13,14.93,16.58,19.49]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'R3 In', array[17.53,14.8,16.27,18.25]::numeric[], null::numeric),
    ('824', '2026-07-26'::date, 'R3 Out', array[18.76,15.03,15.5,19.39]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 824 2026-07-26: %행', n;
end $$;

-- ── CH 832 · 2026-04-08 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-04-08'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('832', '2026-04-08'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-04-08: %행', n;
end $$;

-- ── CH 832 · 2026-04-12 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-04-12'::date, 'L1', array[22,21.67,21.98,22]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'L2 In', array[21.45,20.65,20.2,20.72]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'L2 Out', array[21.14,21.26,19.46,21.74]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'L3 In', array[20.83,19.75,20.48,20.5]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'L3 Out', array[21.25,21.99,20.83,21.56]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'R1', array[21.68,21.54,21.9,22]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'R2 In', array[21.65,20.6,20.28,21.21]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'R2 Out', array[21.56,20.53,19.73,21.78]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'R3 In', array[21.32,21.05,20.02,21.42]::numeric[], null::numeric),
    ('832', '2026-04-12'::date, 'R3 Out', array[21.41,20.38,19.93,21.71]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-04-12: %행', n;
end $$;

-- ── CH 832 · 2026-04-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-04-26'::date, 'L1', array[22,21.67,21.98,22]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'L2 In', array[21.45,20.65,20.2,20.72]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'L2 Out', array[21.14,21.26,19.46,21.74]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'L3 In', array[20.83,19.75,20.48,20.5]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'L3 Out', array[21.25,21.99,20.83,21.56]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'R1', array[21.68,21.54,21.9,22]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'R2 In', array[21.65,20.6,20.28,21.21]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'R2 Out', array[21.56,20.53,19.73,21.78]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'R3 In', array[21.32,21.05,20.02,21.42]::numeric[], null::numeric),
    ('832', '2026-04-26'::date, 'R3 Out', array[21.41,20.38,19.93,21.71]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-04-26: %행', n;
end $$;

-- ── CH 832 · 2026-05-10 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-05-10'::date, 'L1', array[22,21.67,21.98,22]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'L2 In', array[21.45,20.65,20.2,20.72]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'L2 Out', array[21.14,21.26,19.46,21.74]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'L3 In', array[20.83,19.75,20.48,20.5]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'L3 Out', array[21.25,21.99,20.83,21.56]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'R1', array[21.68,21.54,21.9,22]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'R2 In', array[21.65,20.6,20.28,21.21]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'R2 Out', array[21.56,20.53,19.73,21.78]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'R3 In', array[21.32,21.05,20.02,21.42]::numeric[], null::numeric),
    ('832', '2026-05-10'::date, 'R3 Out', array[21.41,20.38,19.93,21.71]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-05-10: %행', n;
end $$;

-- ── CH 832 · 2026-05-23 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-05-23'::date, 'L1', array[20.25,20.12,20.03,21.11]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'L2 In', array[18.38,14.52,14.98,16.46]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'L2 Out', array[16.46,12.94,15.88,18.38]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'L3 In', array[17.01,11.18,13.55,14.79]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'L3 Out', array[17.15,16.87,17.86,18.67]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'R1', array[21.19,20.42,20.88,21.05]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'R2 In', array[16.45,14.87,15.99,17.17]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'R2 Out', array[17.56,15.47,16.45,19]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'R3 In', array[17.56,14.48,16.12,17.38]::numeric[], null::numeric),
    ('832', '2026-05-23'::date, 'R3 Out', array[17.96,15.47,15.53,18.73]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-05-23: %행', n;
end $$;

-- ── CH 832 · 2026-06-14 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-06-14'::date, 'L1', array[21,18.96,20.22,19.91]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'L2 In', array[13.94,9.79,9.84,12.67]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'L2 Out', array[13.58,8.93,10.88,14.6]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'L3 In', array[15.03,10.62,10.05,12.5]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'L3 Out', array[16.19,13.15,14.3,15.88]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'R1', array[19.33,19.23,20.38,20.68]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'R2 In', array[15.53,11.95,12.29,15.9]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'R2 Out', array[14.04,10.76,9.77,13.55]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'R3 In', array[15.14,12.36,14.22,15.71]::numeric[], null::numeric),
    ('832', '2026-06-14'::date, 'R3 Out', array[15.22,10.78,9.99,13.53]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-06-14: %행', n;
end $$;

-- ── CH 832 · 2026-07-05 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-07-05'::date, 'L1', array[18.85,17.32,18.02,17.14]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'L2 In', array[10.05,4.97,4.86,8.19]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'L2 Out', array[8.5,3.35,6.08,11.2]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'L3 In', array[11.38,6.47,6.83,10.53]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'L3 Out', array[9.59,6.28,5.99,9.32]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'R1', array[17.4,17.12,18.1,18.06]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'R2 In', array[9.72,5.33,5.07,10.89]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'R2 Out', array[11.68,7.08,7.18,12.73]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'R3 In', array[11.06,7.33,7.16,10.28]::numeric[], null::numeric),
    ('832', '2026-07-05'::date, 'R3 Out', array[12.63,7.44,7.72,12.91]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-07-05: %행', n;
end $$;

-- ── CH 832 · 2026-07-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('832', '2026-07-26'::date, 'L1', array[17.86,17.18,17.04,17.22]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'L2 In', array[7.16,0,0,5.25]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'L2 Out', array[9.04,3.55,3.19,6.57]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'L3 In', array[8.25,2.82,0,5.56]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'L3 Out', array[9.04,3.55,3.19,6.57]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'R1', array[12.09,14.77,16.12,15.15]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'R2 In', array[7.8,3.76,4.02,10.76]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'R2 Out', array[9.08,4.6,3.77,9.66]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'R3 In', array[8.57,3.96,4.73,10.03]::numeric[], null::numeric),
    ('832', '2026-07-26'::date, 'R3 Out', array[8.08,2.16,3.22,8.85]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 832 2026-07-26: %행', n;
end $$;

-- ── CH 834 · 2026-04-02 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-04-02'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('834', '2026-04-02'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-04-02: %행', n;
end $$;

-- ── CH 834 · 2026-04-12 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-04-12'::date, 'L1', array[21.13,20.51,20.84,20.44]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'L2 In', array[19.9,17.94,17.26,19.03]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'L2 Out', array[20.16,18.29,16.99,20.15]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'L3 In', array[18.89,17.33,17.88,18.79]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'L3 Out', array[19.96,17.38,17.67,18.87]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'R1', array[20.55,20.43,20.06,20.27]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'R2 In', array[19.98,18.08,17.69,19.06]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'R2 Out', array[20.06,17.89,17.12,20.21]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'R3 In', array[18.42,18.59,17.56,19.47]::numeric[], null::numeric),
    ('834', '2026-04-12'::date, 'R3 Out', array[18.67,16.66,17.59,19.09]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-04-12: %행', n;
end $$;

-- ── CH 834 · 2026-04-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-04-26'::date, 'L1', array[19.73,18.57,20.09,20.29]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'L2 In', array[16.51,13.3,14.6,17.59]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'L2 Out', array[16.7,11.35,13.62,16.79]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'L3 In', array[16.01,12.18,13.82,14.94]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'L3 Out', array[17.41,13.8,15.4,16.96]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'R1', array[20.66,19.06,19.43,20.35]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'R2 In', array[16.6,13.31,13.94,17.01]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'R2 Out', array[17.55,13,14.08,17.69]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'R3 In', array[17.29,13.1,13.58,16.22]::numeric[], null::numeric),
    ('834', '2026-04-26'::date, 'R3 Out', array[17.15,12.44,11.84,15.34]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-04-26: %행', n;
end $$;

-- ── CH 834 · 2026-05-10 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-05-10'::date, 'L1', array[18.77,17.49,18.94,19.39]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'L2 In', array[14.93,10.7,11.04,13.55]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'L2 Out', array[14,8.61,9.84,14.32]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'L3 In', array[12.77,9.11,9.88,11.58]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'L3 Out', array[14.01,8.93,9.18,12.74]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'R1', array[18.95,18.81,19.05,19.13]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'R2 In', array[18.58,15.33,16.29,19.27]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'R2 Out', array[15.25,11.09,10.54,15.46]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'R3 In', array[14.49,9.93,11.12,13.76]::numeric[], null::numeric),
    ('834', '2026-05-10'::date, 'R3 Out', array[14.43,10.52,9.68,14.23]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-05-10: %행', n;
end $$;

-- ── CH 834 · 2026-05-24 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-05-24'::date, 'L1', array[17.43,17,18.13,17.85]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'L2 In', array[10.64,6.2,5.13,8.88]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'L2 Out', array[12.64,8.04,8.92,12.55]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'L3 In', array[21.06,18.96,19.83,20.93]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'L3 Out', array[12.1,8.77,8.58,12.36]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'R1', array[16.8,16.95,18.2,18.78]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'R2 In', array[14.98,10.86,11.46,14.88]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'R2 Out', array[14.05,8.8,7.71,11.97]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'R3 In', array[12.42,9.33,9.34,13.54]::numeric[], null::numeric),
    ('834', '2026-05-24'::date, 'R3 Out', array[12.89,6.87,5.65,11.89]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-05-24: %행', n;
end $$;

-- ── CH 834 · 2026-06-14 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-06-14'::date, 'L1', array[16.99,16.34,17.38,16.5]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'L2 In', array[11.92,6.87,7.52,11.45]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'L2 Out', array[10.03,5,6.65,11.51]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'L3 In', array[17.39,13.49,13.19,15.81]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'L3 Out', array[10.22,4.94,6.08,11.21]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'R1', array[21.92,21.59,20.69,22]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'R2 In', array[11.49,8.89,9.28,13.17]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'R2 Out', array[11.97,6.58,6.52,11.49]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'R3 In', array[9.97,6.63,7.1,11.68]::numeric[], null::numeric),
    ('834', '2026-06-14'::date, 'R3 Out', array[10.5,4.9,5.63,10.36]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-06-14: %행', n;
end $$;

-- ── CH 834 · 2026-07-05 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-07-05'::date, 'L1', array[12.2,11.97,14.57,12.76]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'L2 In', array[6.97,2.08,0,6.12]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'L2 Out', array[10.1,3.82,4.75,9.44]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'L3 In', array[13.72,8.65,8.05,10.96]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'L3 Out', array[18.66,13.98,14.44,16.44]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'R1', array[20.41,18.58,19.84,20.8]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'R2 In', array[8.87,5.58,4.76,10.54]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'R2 Out', array[9.38,4.17,3.44,9.78]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'R3 In', array[7.66,3.29,3.67,8.78]::numeric[], null::numeric),
    ('834', '2026-07-05'::date, 'R3 Out', array[8.3,3.1,3.64,8.94]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-07-05: %행', n;
end $$;

-- ── CH 834 · 2026-07-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('834', '2026-07-26'::date, 'L1', array[11.18,10.34,14.57,13.34]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'L2 In', array[6.02,0,0,7.87]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'L2 Out', array[4.92,0,0,5.71]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'L3 In', array[10.89,5.26,3.73,8.9]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'L3 Out', array[13.32,8.01,8.53,12.71]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'R1', array[20.36,18.92,18.27,19.04]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'R2 In', array[4.8,0,0,8.28]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'R2 Out', array[7.97,0,0,8.3]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'R3 In', array[7.97,2.55,2.26,7.62]::numeric[], 747052.7::numeric),
    ('834', '2026-07-26'::date, 'R3 Out', array[7.43,0,0,6.79]::numeric[], 747052.7::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 834 2026-07-26: %행', n;
end $$;

-- ── CH 835 · 2026-04-21 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('835', '2026-04-21'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-21'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 835 2026-04-21: %행', n;
end $$;

-- ── CH 835 · 2026-04-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('835', '2026-04-26'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-04-26'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 835 2026-04-26: %행', n;
end $$;

-- ── CH 835 · 2026-05-10 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('835', '2026-05-10'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-10'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 835 2026-05-10: %행', n;
end $$;

-- ── CH 835 · 2026-05-23 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('835', '2026-05-23'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('835', '2026-05-23'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 835 2026-05-23: %행', n;
end $$;

-- ── CH 835 · 2026-06-14 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('835', '2026-06-14'::date, 'L1', array[20.35,18.88,19.32,19.73]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'L2 In', array[17.88,15.13,14.88,16.7]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'L2 Out', array[18.13,15.55,15.4,18.08]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'L3 In', array[17.93,15.61,15.91,16.22]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'L3 Out', array[18.85,15.65,16.89,17.91]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'R1', array[20.87,20.57,21.21,21.79]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'R2 In', array[18.24,16.68,17.48,18.14]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'R2 Out', array[20.41,16.14,16.07,18.17]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'R3 In', array[18.02,16.88,17.69,19.16]::numeric[], null::numeric),
    ('835', '2026-06-14'::date, 'R3 Out', array[18.44,17.03,16.56,18.49]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 835 2026-06-14: %행', n;
end $$;

-- ── CH 835 · 2026-07-05 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('835', '2026-07-05'::date, 'L1', array[19.88,18.85,19.7,19.55]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'L2 In', array[9.25,4.27,3.24,8.04]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'L2 Out', array[6.29,2.38,1.11,0]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'L3 In', array[15.52,10.79,12.21,14.27]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'L3 Out', array[17.48,13.96,13.8,17.34]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'R1', array[17.56,18.07,18.34,19.09]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'R2 In', array[14.11,10.07,11.58,15.06]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'R2 Out', array[14.22,10.25,10,13.94]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'R3 In', array[15.21,11.5,13.39,16.02]::numeric[], null::numeric),
    ('835', '2026-07-05'::date, 'R3 Out', array[14.14,10.93,10.96,13.15]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 835 2026-07-05: %행', n;
end $$;

-- ── CH 835 · 2026-07-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('835', '2026-07-26'::date, 'L1', array[19.18,17.55,18.99,18.94]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'L2 In', array[3.62,0,0,5.08]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'L2 Out', array[5.26,0,0,0]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'L3 In', array[13.49,8.94,9.11,12.67]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'L3 Out', array[12.82,9.4,9.91,12.77]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'R1', array[14.06,15.69,17.25,16.29]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'R2 In', array[13.4,8.35,9.89,14.19]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'R2 Out', array[12.18,7.4,6.86,12.01]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'R3 In', array[10.82,6.61,8.38,11.82]::numeric[], null::numeric),
    ('835', '2026-07-26'::date, 'R3 Out', array[13.62,9.77,8.41,11.93]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 835 2026-07-26: %행', n;
end $$;

-- ── CH 839 · 2026-04-06 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-04-06'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('839', '2026-04-06'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-04-06: %행', n;
end $$;

-- ── CH 839 · 2026-04-12 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-04-12'::date, 'L1', array[20.17,20.37,19.75,21.13]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'L2 In', array[20.81,18.47,18.62,19.86]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'L2 Out', array[20.72,18.68,19.23,19.37]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'L3 In', array[20.15,18.28,19.47,19.8]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'L3 Out', array[20.64,19.02,18.99,20.58]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'R1', array[21.43,20.63,20.19,20.85]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'R2 In', array[19.25,18.86,19.22,19.69]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'R2 Out', array[20.91,18.28,19.45,20.01]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'R3 In', array[19.95,18.64,18.88,20.04]::numeric[], null::numeric),
    ('839', '2026-04-12'::date, 'R3 Out', array[20.05,19.09,19.73,20.3]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-04-12: %행', n;
end $$;

-- ── CH 839 · 2026-04-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-04-26'::date, 'L1', array[16.1,16.31,18.37,17.65]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'L2 In', array[18.79,15.04,14.95,16.52]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'L2 Out', array[18.14,14.2,15.14,16.97]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'L3 In', array[18.63,13.97,14.44,16.18]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'L3 Out', array[20.89,17.3,18.99,20.26]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'R1', array[20.66,18.78,19.44,18.92]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'R2 In', array[16.74,13.99,15.73,17.37]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'R2 Out', array[18.24,14.47,15.64,17.95]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'R3 In', array[17.03,14.07,15.34,17.79]::numeric[], null::numeric),
    ('839', '2026-04-26'::date, 'R3 Out', array[17.62,15.62,16.82,18.04]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-04-26: %행', n;
end $$;

-- ── CH 839 · 2026-05-10 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-05-10'::date, 'L1', array[11.99,13.36,15.57,14.13]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'L2 In', array[15.84,11.79,11.28,13.7]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'L2 Out', array[17.21,11.62,11.72,16.37]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'L3 In', array[22,22,21.83,22]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'L3 Out', array[17.57,13.82,15.37,18.25]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'R1', array[19.19,18.03,19.29,18.52]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'R2 In', array[16.68,12.53,13.84,15.57]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'R2 Out', array[16.27,11.76,11.44,14.15]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'R3 In', array[15.89,11.72,12.52,14.95]::numeric[], null::numeric),
    ('839', '2026-05-10'::date, 'R3 Out', array[15.39,12.17,11.34,14.58]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-05-10: %행', n;
end $$;

-- ── CH 839 · 2026-05-23 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-05-23'::date, 'L1', array[7.83,10.22,13.46,12.81]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'L2 In', array[13.7,8.94,7.51,11.95]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'L2 Out', array[15.21,9.94,9.68,14.45]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'L3 In', array[19.54,16.33,16.63,17.31]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'L3 Out', array[15.37,10.17,11.9,15]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'R1', array[19.02,17.46,17.87,17.04]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'R2 In', array[11.71,9.39,9.88,14]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'R2 Out', array[15.19,10.47,9.76,14.2]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'R3 In', array[12.75,8.9,10.47,14.49]::numeric[], null::numeric),
    ('839', '2026-05-23'::date, 'R3 Out', array[13.93,11.44,11.09,14.25]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-05-23: %행', n;
end $$;

-- ── CH 839 · 2026-06-14 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-06-14'::date, 'L1', array[0,5.7,9.19,9.22]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'L2 In', array[11.58,6.01,4.37,8.88]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'L2 Out', array[12.14,7.97,7.92,12.59]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'L3 In', array[15.65,12.53,11.84,14.73]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'L3 Out', array[13.46,9.23,11.03,14.13]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'R1', array[17.68,15.94,16.49,15.16]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'R2 In', array[9.72,5.44,6.13,10.81]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'R2 Out', array[11.8,6.35,7.4,11.91]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'R3 In', array[10.54,7.37,6.3,12.08]::numeric[], null::numeric),
    ('839', '2026-06-14'::date, 'R3 Out', array[10.6,7.47,7.3,11.81]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-06-14: %행', n;
end $$;

-- ── CH 839 · 2026-07-05 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-07-05'::date, 'L1', array[20.43,17.68,18.13,17.19]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'L2 In', array[10.98,8.57,9.56,11.8]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'L2 Out', array[8.44,2.76,2.38,7.36]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'L3 In', array[12.54,8.49,8.05,11.4]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'L3 Out', array[9.35,4.59,6.37,10.75]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'R1', array[12.68,11.79,12.81,10.52]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'R2 In', array[8.51,3.86,4.15,9.39]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'R2 Out', array[9.2,3.52,3.03,8.51]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'R3 In', array[19.23,16.6,17.54,18.68]::numeric[], null::numeric),
    ('839', '2026-07-05'::date, 'R3 Out', array[17.97,15.97,17.32,19.07]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-07-05: %행', n;
end $$;

-- ── CH 839 · 2026-07-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('839', '2026-07-26'::date, 'L1', array[18.08,14.55,15.92,12.02]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'L2 In', array[7.38,3.03,4.22,7.92]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'L2 Out', array[6.06,0,0,5.71]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'L3 In', array[9.68,3.58,2.44,6.37]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'L3 Out', array[8.92,2.09,3.52,8.61]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'R1', array[6.89,8.25,10.04,6.94]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'R2 In', array[4.53,0,0,7.08]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'R2 Out', array[7.5,0,0,8.14]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'R3 In', array[14.19,10.91,12.15,15.13]::numeric[], null::numeric),
    ('839', '2026-07-26'::date, 'R3 Out', array[15.78,11.23,12.05,16.34]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 839 2026-07-26: %행', n;
end $$;

-- ── CH 847 · 2026-07-12 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('847', '2026-07-12'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('847', '2026-07-12'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 847 2026-07-12: %행', n;
end $$;

-- ── CH 847 · 2026-07-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('847', '2026-07-26'::date, 'L1', array[21.44,20.51,20.29,20.66]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'L2 In', array[19.29,16.51,17.54,18.72]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'L2 Out', array[19.09,15.54,16.51,18.29]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'L3 In', array[18.24,14.85,15.8,17.55]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'L3 Out', array[19.76,17.61,19.41,19.32]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'R1', array[20.62,20.03,20.67,20.84]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'R2 In', array[18.16,15.13,16.73,18.83]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'R2 Out', array[20.17,17.18,18.67,20.76]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'R3 In', array[18.92,16.37,17.77,19.07]::numeric[], null::numeric),
    ('847', '2026-07-26'::date, 'R3 Out', array[19.96,17.12,17.76,19.62]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 847 2026-07-26: %행', n;
end $$;

-- ── CH 849 · 2026-05-03 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('849', '2026-05-03'::date, 'L1', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'L2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'L2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'L3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'L3 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'R1', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'R2 In', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'R2 Out', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'R3 In', array[22,22,22,22]::numeric[], null::numeric),
    ('849', '2026-05-03'::date, 'R3 Out', array[22,22,22,22]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 849 2026-05-03: %행', n;
end $$;

-- ── CH 849 · 2026-05-10 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('849', '2026-05-10'::date, 'L1', array[20.91,21.77,20.88,21.5]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'L2 In', array[21.16,19.4,19.25,20.67]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'L2 Out', array[21.43,19.84,20.55,21.4]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'L3 In', array[20.95,19.37,20.08,20.84]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'L3 Out', array[21.14,19.86,20.31,20.83]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'R1', array[21.62,21.32,21.61,22]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'R2 In', array[21.06,18.96,19.83,20.93]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'R2 Out', array[20.93,19.64,18.84,21.38]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'R3 In', array[21.12,19.83,20.35,21.64]::numeric[], null::numeric),
    ('849', '2026-05-10'::date, 'R3 Out', array[21.27,18.9,19.53,20.95]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 849 2026-05-10: %행', n;
end $$;

-- ── CH 849 · 2026-05-23 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('849', '2026-05-23'::date, 'L1', array[19.35,20.69,20.71,20.5]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'L2 In', array[19.03,15.63,16.38,17.3]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'L2 Out', array[18.89,16.12,17.17,18.12]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'L3 In', array[18.26,15.18,16.31,17.5]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'L3 Out', array[18.74,16.29,17.15,18.21]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'R1', array[20.4,19.22,20.32,21.01]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'R2 In', array[17.26,14.95,15.36,17.33]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'R2 Out', array[13.32,10.42,11.56,14.44]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'R3 In', array[17.83,15.12,15.74,17.87]::numeric[], null::numeric),
    ('849', '2026-05-23'::date, 'R3 Out', array[19.34,16.55,17.24,19.2]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 849 2026-05-23: %행', n;
end $$;

-- ── CH 849 · 2026-06-14 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('849', '2026-06-14'::date, 'L1', array[21.54,20.16,19.87,19.07]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'L2 In', array[16.86,12.78,12.28,15.65]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'L2 Out', array[15.63,12.81,13.53,16.85]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'L3 In', array[15.71,12.43,12.92,14.9]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'L3 Out', array[17.1,13.37,13.71,17.45]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'R1', array[18.76,18.95,20.03,19.84]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'R2 In', array[14.69,11.63,12.46,14.96]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'R2 Out', array[11.78,7.67,9.51,12.72]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'R3 In', array[14.39,12.46,13.23,16.11]::numeric[], null::numeric),
    ('849', '2026-06-14'::date, 'R3 Out', array[16.01,13.22,13.57,16.85]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 849 2026-06-14: %행', n;
end $$;

-- ── CH 849 · 2026-07-05 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('849', '2026-07-05'::date, 'L1', array[20.29,18.61,18.27,18.56]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'L2 In', array[13.25,8.59,7.46,10.58]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'L2 Out', array[13.58,9.85,10.48,13.09]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'L3 In', array[12.9,7.05,6.96,10.6]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'L3 Out', array[13.28,8.8,9.24,13.46]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'R1', array[15.04,16.11,17.81,17.46]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'R2 In', array[10.05,6.09,7.18,11.03]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'R2 Out', array[18.07,14.66,15.65,17.37]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'R3 In', array[19.02,16.5,17.34,19.47]::numeric[], null::numeric),
    ('849', '2026-07-05'::date, 'R3 Out', array[12.52,8.4,8.27,13.13]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 849 2026-07-05: %행', n;
end $$;

-- ── CH 849 · 2026-07-26 · 10행 ──────────────────────
do $$
declare p record; i public.inspections%rowtype; n int := 0; v_min numeric; pts jsonb;
begin
  for p in select * from (values
    ('849', '2026-07-26'::date, 'L1', array[20.96,18.14,17.76,14.72]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'L2 In', array[11.87,6.32,5.82,9.35]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'L2 Out', array[11.98,8.04,8.3,12.15]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'L3 In', array[9.93,5.26,4.38,8.19]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'L3 Out', array[11.24,5.59,7.16,11.72]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'R1', array[8.96,11.78,15.21,14.71]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'R2 In', array[8.05,4.33,4.94,10.03]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'R2 Out', array[14.25,9.85,10.21,13.55]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'R3 In', array[16.27,12.24,13.01,15.45]::numeric[], null::numeric),
    ('849', '2026-07-26'::date, 'R3 Out', array[11.16,7.18,7.1,10.83]::numeric[], null::numeric)
  ) as t(ch, d, pos, dep, km_fix) order by pos loop

    select * into i from public.inspections
     where ch = p.ch and inspection_date = p.d and pos = p.pos and deleted_at is null;
    if not found then
      raise exception 'Phase B: DB 에 없는 원장 행 % % %', p.ch, p.d, p.pos;
    end if;

    -- 트리거가 tread 를 4점 최소값으로 다시 쓴다. 쓰기 전에 같은 값인지 본다.
    v_min := (select min(x) from unnest(p.dep) x);
    if i.tread is distinct from v_min then
      raise exception 'Phase B: 4점 최소값 불일치 % % % — db=% 원장=%',
        p.ch, p.d, p.pos, i.tread, v_min;
    end if;

    pts := jsonb_build_array(
      jsonb_build_object('circ','P1','width','L',  'depth', p.dep[1]),
      jsonb_build_object('circ','P1','width','C1', 'depth', p.dep[2]),
      jsonb_build_object('circ','P1','width','C2', 'depth', p.dep[3]),
      jsonb_build_object('circ','P1','width','R',  'depth', p.dep[4]));

    -- 원장 값이 아니라 DB 의 현재 값을 그대로 돌려준다 (§B 규칙 2).
    perform public.save_inspection_with_points(
      p.ch, p.pos, p.d,
      i.serial, i.pressure, i.hm,
      coalesce(p.km_fix, i.km),
      pts, 'OK', null, i.remark, i.driver,
      coalesce(i.tread_status, 'measured'));
    n := n + 1;
  end loop;
  raise notice 'Phase B · CH 849 2026-07-26: %행', n;
end $$;

-- ── 사후 검증 ────────────────────────────────────────────────
do $$
declare v_p4 int; v_p0 int; v_pts int; v_bad int;
begin
  select count(*) filter (where point_count = 4),
         count(*) filter (where point_count = 0)
    into v_p4, v_p0
    from public.inspections where deleted_at is null;

  select count(*) into v_pts from public.tread_points where deleted_at is null;

  select count(*) into v_bad
    from public.inspections i
   where i.deleted_at is null and i.point_count > 0
     and i.tread is distinct from (
       select min(t.depth_mm) from public.tread_points t
        where t.inspection_id = i.id and t.deleted_at is null and t.flag <> 'OUTLIER');

  raise notice 'point_count=4: % · point_count=0: % · tread_points: % · tread≠min: %',
               v_p4, v_p0, v_pts, v_bad;
  if v_p0 > 0 or v_bad > 0 then
    raise exception 'Phase B 검증 실패 — 원시값 없는 행 %건 / tread 불일치 %건', v_p0, v_bad;
  end if;
end $$;

-- ============================================================
-- ROLLBACK:
--   -- 측정점만 소프트 삭제한다. inspections 행은 건드리지 않는다.
--   update public.tread_points t set deleted_at = now()
--     from public.inspections i
--    where i.id = t.inspection_id and i.inspection_date < '2026-08-09'
--      and t.deleted_at is null;
--   -- 통계 캐시는 트리거가 n=0 이면 손대지 않으므로 직접 비운다:
--   --   update public.inspections set point_count = 0, tread_avg = null, ...
--   -- CH 834 2026-07-26 km 은 748965.9 로 되돌린다.
-- ============================================================
