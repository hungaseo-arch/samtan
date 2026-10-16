-- ============================================================
-- Samtan TMS — 트레드 임계치 · 권장 공기압을 tire_config 로 이관
--
-- 승인: 사용자 결정 2026-08-01
--   · 4단계 신호등 — 녹색 ≥10 mm / 황색 5~10 mm / 주황 3~5 mm / 적색 <3 mm
--   · 5 mm 는 폐기 기준이 아니라 **발주 트리거**로 정의한다.
--   · 권장 공기압 조향축 100 psi / 구동축 116 psi
--
-- 이관 전에는 이 값들이 src/data/tmsData.ts 에 상수로 박혀 있어 운영자가 바꾸려면
-- 코드 수정·재배포가 필요했다. 여기로 옮기면 관리자 화면에서 조정할 수 있다.
--
-- 멱등성: add column if not exists + 값은 현재값이 NULL 인 행에만 채운다.
--         이미 운영자가 조정한 값을 되돌리지 않는다.
-- ============================================================

alter table public.tire_config
  add column if not exists tread_caution  numeric,  -- 녹색 → 황색 경계 (mm)
  add column if not exists tread_order    numeric,  -- 황색 → 주황 경계 (mm). 발주 트리거
  add column if not exists tread_critical numeric,  -- 주황 → 적색 경계 (mm)
  add column if not exists rec_psi_steer  numeric,  -- 조향축(L1·R1) 권장 공기압 (psi)
  add column if not exists rec_psi_drive  numeric;  -- 구동축(그 외 8본) 권장 공기압 (psi)

comment on column public.tire_config.tread_caution  is '트레드 주의 진입 기준 mm. 이 값 미만이면 황색';
comment on column public.tire_config.tread_order    is '트레드 발주 트리거 mm. 이 값 미만이면 주황 — 교체 타이어 발주 시점';
comment on column public.tire_config.tread_critical is '트레드 위험 기준 mm. 이 값 미만이면 적색 — 즉시 교체';
comment on column public.tire_config.rec_psi_steer  is '조향축 권장 공기압 psi';
comment on column public.tire_config.rec_psi_drive  is '구동축 권장 공기압 psi';

-- 기존 코드 상수와 동일한 초기값. NULL 인 컬럼만 채운다.
update public.tire_config
   set tread_caution  = coalesce(tread_caution,  10),
       tread_order    = coalesce(tread_order,     5),
       tread_critical = coalesce(tread_critical,  3),
       rec_psi_steer  = coalesce(rec_psi_steer,  100),
       rec_psi_drive  = coalesce(rec_psi_drive,  116)
 where id = 1;

-- 경계가 뒤집히면 신호등이 무의미해지므로 순서를 강제한다.
-- NULL 은 허용한다 (미설정 시 프론트엔드가 기본값으로 동작).
alter table public.tire_config
  drop constraint if exists tire_config_tread_order_check;
alter table public.tire_config
  add constraint tire_config_tread_order_check check (
    tread_critical is null or tread_order is null or tread_caution is null
    or (tread_critical < tread_order and tread_order < tread_caution)
  );

alter table public.tire_config
  drop constraint if exists tire_config_psi_range_check;
alter table public.tire_config
  add constraint tire_config_psi_range_check check (
    (rec_psi_steer is null or (rec_psi_steer between 60 and 200))
    and (rec_psi_drive is null or (rec_psi_drive between 60 and 200))
  );
