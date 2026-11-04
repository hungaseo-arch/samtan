-- ============================================================
-- WO-TMS-2026-11-LIFE-KM T-3 · 예상 수명 종료 기준 선택 — tire_config.life_end_basis
--
-- 쎄오님 결정 (2026-11-04): 수명 종료 = 트레드 4점 중 4점 모두 0 mm 또는 3점 0 mm 도달.
-- 최초안(숄더 L·R 평균 0 mm)은 폐기. 두 기준 중 기본값은 비교표를 보고 정하므로
-- 화면은 세 기준을 모두 계산하고, 이 컬럼이 고른 하나를 «예상 KM·HM·CPK» 에 쓴다.
--
--   'min'        현행 — 회차별 4점 최소값 점열 → 0 mm 외삽 (기본값, 승인 전까지 유지)
--   'three_zero' 회차별 4점 중 두 번째로 큰 값 점열 (= 3점이 0 이 되는 시점) → 0 mm 외삽
--   'four_zero'  회차별 4점 중 최대값 점열 (= 4점 모두 0) → 0 mm 외삽
--   공통: 4점 측정 회차만, OUTLIER 점 제외 후 순위. 4점 회차 2개 미만이면 예상값 비움.
--   계산은 클라이언트(src/data/tmsUtils.ts lifeCalc) — 이 컬럼은 선택값만 담는다.
--
-- 기본값 'min' 은 화면 수치가 승인 없이 바뀌지 않게 하기 위해서다. 기본값 변경은
-- 결과 보고 비교표를 본 쎄오님 결정 후 관리 › 설정 화면(또는 별도 마이그레이션)으로 한다.
-- 발주 예상일(projectReplacement, tread_order 기준)은 이 컬럼과 무관하다.
--
-- 멱등: add column if not exists · 제약은 drop if exists → add (값 검증만, 데이터 무변경).
-- ============================================================

alter table public.tire_config
  add column if not exists life_end_basis text not null default 'min';

comment on column public.tire_config.life_end_basis is
  '예상 수명(0 mm) 외삽 기준: min(4점 최소값, 현행) · three_zero(4점 중 두 번째 큰 값 = 3점 0 mm) · '
  'four_zero(4점 최대값 = 4점 모두 0 mm). 4점 회차만·OUTLIER 제외. WO-TMS-2026-11-LIFE-KM T-3, 쎄오님 결정 2026-11-04';

alter table public.tire_config
  drop constraint if exists tire_config_life_end_basis_check;
alter table public.tire_config
  add constraint tire_config_life_end_basis_check check (
    life_end_basis in ('min', 'three_zero', 'four_zero')
  );

-- ============================================================
-- ROLLBACK: 컬럼은 남긴다 (DROP COLUMN 금지). 화면은 컬럼이 없거나 값이 이상하면 'min' 으로 폴백.
-- ============================================================
