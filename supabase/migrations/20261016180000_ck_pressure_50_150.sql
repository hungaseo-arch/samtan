-- ============================================================
-- 점검보고서 CHK-TMS-2026-10-16-WEB R-4 · 공기압 입력 범위 50 ~ 150 psi
--
-- 사용자 결정 2026-10-16 (docs/decisions.md W-3): 50 ~ 150 psi 밖은 저장 차단,
-- 권장값 ±15% 밖은 확인 후 저장(화면·일괄 업로드 공통, src/lib/roundValidate.ts).
-- 기존 ck_pressure(60 ~ 200, 20260803090000)를 같은 범위로 맞춘다 — 그대로 두면
-- 50 ~ 59 psi 입력이 화면 검증을 통과하고도 DB 에서 거부된다.
--
-- 적용 전 확인 (2026-10-16 prod 읽기 전용): 소프트 삭제 제외 pressure 최소 75.0 · 최대 132 →
-- 새 범위 위반 0건 (소프트 삭제 행 포함 0건). 적용 직전에 한 번 더 확인할 것:
--   select count(*) from inspections where pressure is not null and pressure not between 50 and 150;
--
-- 멱등: drop constraint if exists → add constraint.
-- ============================================================

alter table public.inspections drop constraint if exists ck_pressure;
alter table public.inspections
  add constraint ck_pressure
  check (pressure is null or pressure between 50 and 150);

comment on constraint ck_pressure on public.inspections is
  '공기압 입력 범위 50 ~ 150 psi (사용자 결정 2026-10-16, CHK-TMS-2026-10-16-WEB W-3). NULL = 미측정';
