-- ============================================================
-- Samtan TMS — T-104. 멱등 UPSERT 전환
--
-- 근거: 작업지시서 §4 T-104.
-- 표준 삽입 함수를 만들어 "같은 데이터를 두 번 넣어도 레코드가 늘지 않는다"를
-- 호출부마다 재구현하지 않게 한다.
--
-- 두 개를 만든다.
--   · upsert_inspection()       — 1행. 충돌 키는 (ch, inspection_date, pos)
--   · upsert_inspection_round() — 1회차(포지션 여러 개)를 JSONB 배열로 한 번에
--
-- 충돌 판정은 유니크 인덱스 inspections_ch_date_pos_uniq (0001) 를 그대로 쓴다.
--
-- security invoker (기본값): 함수가 호출자 권한으로 실행되므로 RLS 정책이 그대로
-- 적용된다. definer 로 두면 viewer 도 점검을 쓸 수 있게 되므로 절대 바꾸지 말 것.
--
-- 멱등성: create or replace function
-- ============================================================

-- ── 1행 UPSERT ─────────────────────────────────────────────
-- NULL 은 "지우지 않음"이 아니라 "미측정"이라는 값이다. 내측 듀얼 타이어의 공기압처럼
-- 실제로 값이 없는 경우가 있으므로, 넘어온 NULL 로 기존 값을 덮어쓴다.
-- 일부 컬럼만 고치고 싶으면 기존 값을 함께 넘겨야 한다.
--
-- deleted_at 은 항상 NULL 로 되돌린다. 지웠던 날짜에 점검을 다시 입력하는 것은
-- 정상 흐름이고, 그 회차는 되살아나야 한다 (T-103 §14.3).

create or replace function public.upsert_inspection(
  p_ch              text,
  p_inspection_date date,
  p_pos             text,
  p_pressure        numeric default null,
  p_tread           numeric default null,
  p_hm              numeric default null,
  p_km              numeric default null,
  p_serial          text    default null,
  p_driver          text    default null,
  p_remark          text    default null
) returns uuid
language sql
security invoker
set search_path to ''
as $$
  insert into public.inspections
    (ch, inspection_date, pos, pressure, tread, hm, km, serial, driver, remark, deleted_at)
  values
    (p_ch, p_inspection_date, p_pos, p_pressure, p_tread, p_hm, p_km,
     p_serial, p_driver, p_remark, null)
  on conflict (ch, inspection_date, pos) do update
     set pressure   = excluded.pressure,
         tread      = excluded.tread,
         hm         = excluded.hm,
         km         = excluded.km,
         serial     = excluded.serial,
         driver     = excluded.driver,
         remark     = excluded.remark,
         deleted_at = null
  returning id;
$$;

comment on function public.upsert_inspection(text, date, text, numeric, numeric, numeric, numeric, text, text, text) is
  '점검 1행 멱등 저장. (ch, inspection_date, pos) 충돌 시 갱신. 재실행해도 행이 늘지 않는다';

-- ── 회차 UPSERT ────────────────────────────────────────────
-- hm · km · driver 는 회차 메타라 포지션마다 같은 값이 들어간다. 배열 원소마다
-- 반복해 적지 않도록 인자로 뺀다.
--
-- p_rows 예시:
--   [{"pos":"L1","pressure":100,"tread":17.5,"serial":"DA1BFANH07451D"},
--    {"pos":"L2 In","pressure":null,"tread":16.2}]
--
-- 없는 키는 NULL 로 읽힌다 (`->>` 의 동작). remark·serial 을 생략해도 된다.

create or replace function public.upsert_inspection_round(
  p_ch              text,
  p_inspection_date date,
  p_hm              numeric,
  p_km              numeric,
  p_driver          text,
  p_rows            jsonb
) returns integer
language plpgsql
security invoker
set search_path to ''
as $$
declare
  r jsonb;
  n integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows 는 JSON 배열이어야 합니다 (받은 값: %)', jsonb_typeof(p_rows)
      using errcode = 'invalid_parameter_value';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    if r ->> 'pos' is null then
      raise exception '배열 %번째 원소에 pos 가 없습니다: %', n + 1, r
        using errcode = 'invalid_parameter_value';
    end if;

    perform public.upsert_inspection(
      p_ch,
      p_inspection_date,
      r ->> 'pos',
      (r ->> 'pressure')::numeric,
      (r ->> 'tread')::numeric,
      p_hm,
      p_km,
      r ->> 'serial',
      p_driver,
      r ->> 'remark');
    n := n + 1;
  end loop;

  return n;
end $$;

comment on function public.upsert_inspection_round(text, date, numeric, numeric, text, jsonb) is
  '점검 1회차를 JSONB 배열로 멱등 저장. 저장한 행 수를 반환한다';
