-- ============================================================
-- C-6 · v_center_wear 를 tread_points 기반으로 재정의 (사용자 승인 2026-08-27)
--
-- 기존 정의는 inspections.tread_g1..g4 를 읽는다.
--   where tread_g1 is not null and ... and tread_g4 is not null
-- 그런데 g1..g4 비-NULL 행은 DB 전체에 0건이고, 적재 경로인
-- save_inspection_with_points() 는 tread_points 에만 쓰고 g1..g4 를 채우지 않는다.
-- 따라서 v3 Phase A·B 를 완료해도 이 뷰는 영구히 0행이며, 게이트 A(138행)·
-- §5(548행) 를 구조적으로 통과할 수 없다.
--
-- 컬럼 이름·의미·판정 임계(±2.0 mm)는 그대로 유지하고 **데이터 출처만** 옮긴다.
-- 화면 코드는 현재 이 뷰를 읽지 않으므로 (src 전역 참조 0건) 파급이 없다.
--
-- 매핑 (v3 §2 · tread_points.width_pos):
--   tread_g1 ← L  (KIRI)      tread_g2 ← C1 (TENGAH 1)
--   tread_g3 ← C2 (TENGAH 2)  tread_g4 ← R  (KANAN)
-- 원주 확장(P1~P4) 시에는 폭 위치별 평균을 쓴다 — P1 만 골라 쓰면 16점의
-- 나머지 12점이 조용히 버려진다.
--
-- ⚠ side_diff = g1 − g4 = KIRI − KANAN 은 §Q1 방향 규약 미확정 사안이다.
--   부호의 물리적 의미(외측/내측)를 확정하기 전까지 화면에 노출하지 않는다.
--   center_wear_idx / wear_pattern 은 숄더 대 센터 비교라 방향과 무관하다.
-- ============================================================

create or replace view public.v_center_wear as
select
  i.id,
  i.ch,
  i.pos,
  i.serial,
  i.inspection_date,
  p.g1                                        as tread_g1,
  p.g2                                        as tread_g2,
  p.g3                                        as tread_g3,
  p.g4                                        as tread_g4,
  i.tread                                     as tread_min,
  round((p.g1 + p.g2 + p.g3 + p.g4) / 4.0, 2) as tread_avg,
  round((p.g1 + p.g4) / 2.0 - (p.g2 + p.g3) / 2.0, 2) as center_wear_idx,
  round(p.g1 - p.g4, 2)                       as side_diff,
  case
    when ((p.g1 + p.g4) / 2.0 - (p.g2 + p.g3) / 2.0) >=  2.0 then 'center'
    when ((p.g1 + p.g4) / 2.0 - (p.g2 + p.g3) / 2.0) <= -2.0 then 'shoulder'
    else 'even'
  end                                         as wear_pattern
from public.inspections i
join lateral (
  select
    round(avg(t.depth_mm) filter (where t.width_pos = 'L'),  2) as g1,
    round(avg(t.depth_mm) filter (where t.width_pos = 'C1'), 2) as g2,
    round(avg(t.depth_mm) filter (where t.width_pos = 'C2'), 2) as g3,
    round(avg(t.depth_mm) filter (where t.width_pos = 'R'),  2) as g4
  from public.tread_points t
  where t.inspection_id = i.id
    and t.deleted_at is null
    and t.flag <> 'OUTLIER'
) p on true
where i.deleted_at is null
  and p.g1 is not null and p.g2 is not null
  and p.g3 is not null and p.g4 is not null;

alter view public.v_center_wear set (security_invoker = on);

comment on view public.v_center_wear is
  '중심부 마모 지표. 정본은 tread_points 다 (2026-08-27 이관 — 이전 정의는 '
  'DEPRECATED 컬럼 inspections.tread_g1..g4 를 읽어 영구히 0행이었다). '
  'tread_g1..g4 컬럼명은 하위호환으로 유지하되 값은 폭 위치별 평균이다: '
  'g1=L(KIRI) g2=C1 g3=C2 g4=R. side_diff 는 §Q1 방향 규약 미확정이므로 화면 노출 금지.';

grant select on public.v_center_wear to anon, authenticated;

-- ============================================================
-- ROLLBACK:
--   create or replace view public.v_center_wear as
--   select id, ch, pos, serial, inspection_date,
--          tread_g1, tread_g2, tread_g3, tread_g4,
--          tread as tread_min,
--          round((tread_g1 + tread_g2 + tread_g3 + tread_g4) / 4.0, 2) as tread_avg,
--          round((tread_g1 + tread_g4) / 2.0 - (tread_g2 + tread_g3) / 2.0, 2) as center_wear_idx,
--          round(tread_g1 - tread_g4, 2) as side_diff,
--          case when ((tread_g1 + tread_g4) / 2.0 - (tread_g2 + tread_g3) / 2.0) >= 2.0 then 'center'
--               when ((tread_g1 + tread_g4) / 2.0 - (tread_g2 + tread_g3) / 2.0) <= -2.0 then 'shoulder'
--               else 'even' end as wear_pattern
--     from public.inspections i
--    where deleted_at is null and tread_g1 is not null and tread_g2 is not null
--      and tread_g3 is not null and tread_g4 is not null;
-- ============================================================
