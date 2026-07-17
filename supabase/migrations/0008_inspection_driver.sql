-- ============================================================
-- Samtan TMS — 점검 회차 운전자 기록
-- inspections 에 driver(차량 운전자) 추가.
-- hm·km 와 동일한 "회차 메타"이므로 같은 (ch, inspection_date) 의
-- 포지션 행들에 같은 값이 중복 저장된다. (조회 시 rows[0] 기준)
-- 기존 행은 null(미기록)로 남으며, 입력은 선택 사항이다.
-- RLS 정책은 테이블 단위이므로 0007 정책이 그대로 적용된다.
-- ============================================================

alter table public.inspections
  add column if not exists driver text;

comment on column public.inspections.driver is '점검 회차 시점의 차량 운전자 (선택 입력)';
