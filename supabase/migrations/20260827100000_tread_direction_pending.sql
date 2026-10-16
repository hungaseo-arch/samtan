-- ============================================================
-- C-1 · KIRI / KANAN 방향 규약 — 미확정 표시 (작업지시서 v3 §C-1)
--
-- 20260826150000_tread_points.sql 은 "L = Kiri = 차량 외측(Luar/outboard),
-- R = Kanan = 차량 내측(Dalam/inboard), 뒤집기 금지" 를 확정 규약으로 못박았다
-- (2026-08-26 임원 확인). 그런데 v3 §Q1 이 그 전제를 흔드는 실측을 제시했다.
--
--   미마모(22.0) 제외 후 KIRI − KANAN 평균
--     L 조향 (L1)      n=45  +0.66
--     R 조향 (R1)      n=45  −1.45     ← 부호 반전
--     L 복륜 내측      n=90  +1.18
--     R 복륜 내측      n=88  −0.74     ← 부호 반전
--
-- 타이어별 외/내측 규약이면 좌우가 같은 부호여야 한다. 부호가 뒤집힌다는 것은
-- KIRI/KANAN 이 **차량 절대 좌/우** 표기일 가능성을 가리킨다. 그렇다면
-- outboard_avg / inboard_avg 는 차량 우측 5본에서 정반대로 산출되고 있다.
--
-- 결정 (사용자 2026-08-27): 현장 확인 전까지 **보류**.
--   · 적재는 현장 표기 그대로 (KIRI→L, KANAN→R). 데이터는 손대지 않는다.
--   · outboard_avg / inboard_avg 는 DEPRECATED 로 표시하고 화면에서 숨긴다.
--   · shoulder_avg / center_avg / S/C Ratio / CV / Wear Rate 는 방향과 무관하므로
--     그대로 신뢰하고 노출한다.
--   · Bpk. Irawan / Trasindo 워크샵 서면 회신 후 재판정한다. 확정이 "차량 절대
--     좌우" 로 나면 recalc_inspection_tread_stats() 를 아래처럼 고치고 전 행을
--     재산출한다 (tread_points 를 건드리면 트리거가 자동 재계산한다):
--       outboard := case when pos like 'L%' then avg(L) else avg(R) end
--       inboard  := 그 반대
--
-- 이 마이그레이션은 COMMENT 만 바꾼다. 데이터·구조 변경 없음.
-- ============================================================

comment on column public.tread_points.width_pos is
  'L=KIRI / C1·C2=TENGAH / R=KANAN — 현장 기록지 표기 그대로. '
  '차량 절대 좌우인지 타이어 외/내측인지 미확정 (2026-08-27, v3 §Q1). '
  'outboard/inboard 해석은 Bpk. Irawan 확인 후 확정. '
  '숄더(L·R) / 센터(C1·C2) 구분은 방향과 무관하므로 유효하다.';

comment on column public.inspections.outboard_avg is
  'DEPRECATED(보류) — width_pos = L 고정 산출. 방향 규약 미확정으로 신뢰하지 말 것 (v3 §Q1). '
  '화면 노출 금지. S/C Ratio 를 대신 사용한다.';

comment on column public.inspections.inboard_avg is
  'DEPRECATED(보류) — width_pos = R 고정 산출. 방향 규약 미확정으로 신뢰하지 말 것 (v3 §Q1). '
  '화면 노출 금지. S/C Ratio 를 대신 사용한다.';

comment on column public.inspections.shoulder_avg is
  '숄더(L=Kiri + R=Kanan) 평균. 좌우 어느 쪽이 외측인지와 무관하게 유효 — S/C Ratio 기준.';
comment on column public.inspections.center_avg is
  '중앙(C1·C2=Tengah) 평균. 방향 규약과 무관하게 유효 — S/C Ratio 기준.';

-- ============================================================
-- ROLLBACK:
--   -- 20260826150000_tread_points.sql · 20260826151000_inspections_tread_stats.sql
--   -- 의 COMMENT 정의로 되돌린다. 구조·데이터 변경이 없으므로 역DDL 은 COMMENT 뿐이다.
-- ============================================================
