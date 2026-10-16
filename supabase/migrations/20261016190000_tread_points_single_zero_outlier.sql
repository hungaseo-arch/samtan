-- ============================================================
-- 점검보고서 CHK-TMS-2026-10-16-WEB R-2 · WEAR-01 — 4점 중 0 하나는 OUTLIER
--
-- 근거: CH 834 L1 2026-08-23 은 0 / 9.43 / 10.10 / 5.60 이다. 빈칸이 0 으로 저장돼
-- 평균 6.28 mm 인데 최소 0.0 mm · CV 73.8% · S/C 1.570 으로 과대 산출됐다.
-- 화면 판정(src/lib/treadRules.ts effectiveTread)은 이미 이 0 을 빼지만, 마모 분석의
-- 평균·CV·S/C 는 DB 뷰(v_tread_series · v_wear_pattern) 값이라 그대로 남는다.
--
-- 규칙 (사용자 결정 2026-10-16 «이상점 제외 후 판정», decisions.md W-1):
--   P1 4점이 모두 있고, 0 이 정확히 하나이며, 나머지 셋이 모두 tread_critical 이상
--   → 그 0 점의 flag 를 'OUTLIER' 로 바꾼다. depth_mm 는 고치지 않는다(행 보존).
--   recalc_inspection_tread_stats 트리거가 inspections.tread* 를 다시 계산한다.
--   20260827200000 의 «임의 OUTLIER 지정 금지» 는 이 결정으로 이 패턴에 한해 풀린다.
--
-- 대상 (2026-10-16 프로덕션 읽기 조회): 7행 — 834 L1 08-23 · 835 R1 09-27 ·
--   839 L1 06-14 · 839 R1 08-09 · 849 R1 08-23 · 849 R1 09-05 · 849 L3 In 09-27
--   (docs/트레드0-현장확인-20261016.md 분류 A). 중앙 2점 0(분류 B, M-6)은 대상 아님.
--
-- 멱등: flag = 'OK' 인 점만 바꾼다. 재실행해도 추가 변경 없음.
-- ============================================================

with c as (
  select coalesce((select tread_critical from public.tire_config where id = 1), 3) as v
),
p as (
  select t.inspection_id
    from public.tread_points t
    join public.inspections i on i.id = t.inspection_id
   where t.deleted_at is null and i.deleted_at is null and t.circ_pos = 'P1'
   group by t.inspection_id
  having count(*) = 4
     and count(*) filter (where t.depth_mm = 0) = 1
     and bool_and(t.depth_mm = 0 or t.depth_mm >= (select v from c))
)
update public.tread_points t
   set flag       = 'OUTLIER',
       flag_note  = '4점 중 0 하나 — 측정 누락으로 보고 통계 제외 (CHK-TMS-2026-10-16-WEB W-1, 사용자 결정 2026-10-16)',
       updated_at = now()
  from p
 where t.inspection_id = p.inspection_id
   and t.circ_pos = 'P1'
   and t.depth_mm = 0
   and t.deleted_at is null
   and t.flag = 'OK';

-- ROLLBACK:
--   update public.tread_points set flag = 'OK', flag_note = null, updated_at = now()
--    where flag = 'OUTLIER' and flag_note like '%CHK-TMS-2026-10-16-WEB W-1%';
