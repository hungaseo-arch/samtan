-- ============================================================
-- v_inspections_wide — 점검 1행 + 폭 4점을 한 행에 펼친 읽기 전용 뷰
--
-- 화면(수명 히스토리 모달·점검 상세)이 회차마다 4점을 보여주려면 원시값이
-- 필요하다. tread_points 를 그대로 내려보내면 548행이 2,192행이 되므로
-- 행 수를 늘리지 않고 열 4개만 붙인다.
--
-- inspections.tread_g1..g4 를 쓰지 않는 이유: 그 컬럼은 v2 하위호환 잔재이고
-- 지금 전 548행이 NULL 이다(트리거가 채우지 않는다). 정본은 tread_points 다.
--
-- ⚠ `i.*` 는 뷰 생성 시점의 열 목록으로 고정된다. inspections 에 열을 더하면
--    이 뷰를 create or replace 로 다시 만들어야 화면에 나온다.
--
-- circ_pos = 'P1' 만 본다. 지금 측정은 원주 1개소 × 폭 4점이고, 원주를 P2..P4
-- 로 늘리면 '폭 프로파일' 의 정의부터 정해야 한다(평균인지 최소인지).
-- 그 결정 전까지 P1 을 명시적으로 고정해 조용히 섞이지 않게 한다.
-- ============================================================

create or replace view public.v_inspections_wide as
select i.*,
       p.tread_l, p.tread_c1, p.tread_c2, p.tread_r
  from public.inspections i
  left join lateral (
    select max(t.depth_mm) filter (where t.width_pos = 'L')  as tread_l,
           max(t.depth_mm) filter (where t.width_pos = 'C1') as tread_c1,
           max(t.depth_mm) filter (where t.width_pos = 'C2') as tread_c2,
           max(t.depth_mm) filter (where t.width_pos = 'R')  as tread_r
      from public.tread_points t
     where t.inspection_id = i.id
       and t.deleted_at is null
       and t.circ_pos = 'P1'
  ) p on true;

alter view public.v_inspections_wide set (security_invoker = on);
grant select on public.v_inspections_wide to anon, authenticated;

comment on view public.v_inspections_wide is
  '점검 행 + 폭 4점(L·C1·C2·R, circ_pos=P1). 화면 적재용 읽기 전용. 쓰기는 save_inspection_with_points() 로만.';

-- ROLLBACK:
--   drop view if exists public.v_inspections_wide;
-- ============================================================
