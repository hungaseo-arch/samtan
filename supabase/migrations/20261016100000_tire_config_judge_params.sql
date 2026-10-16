-- ============================================================
-- 판정 기준 DB 설정화 확장 (지시서 2026-10-16 §A-5 · A-3 · A-9)
--
-- 트레드 경계(tread_caution/order/critical)와 권장 공기압(rec_psi_steer/drive)은
-- 2026-08-01 에 이미 이관됐다. 지시서의 tread_warn·tread_danger·psi_steer·psi_drive 는
-- 그 컬럼과 같은 값이라 새로 만들지 않는다 (사용자 결정 2026-10-16 — CLAUDE.md 유지).
--
-- 여기서 추가하는 것:
--   · 공기압 판정 비율 3개 — 코드에 0.85 / 0.15 로 박혀 있던 값 + ±5% 정상 구간
--   · 점검 보고 주기(일) — 점검 지연 경보(A-3)
--   · 목표 수명 km — 경제성 목표 대비(B-4)
--   · vehicles 의 HM/KM 리셋 보정값 — 리셋 이후 회차를 연속 시계열로 잇는다(A-9)
--
-- 공기압 판정 (사용자 결정 2026-10-16 — 과압 +15% 초과는 위험):
--   정상  |편차| ≤ psi_dev_warn
--   주의  psi_dev_warn < |편차| ≤ psi_dev_danger
--   위험  실측 < 권장 × psi_low_ratio  또는  과압 편차 > psi_dev_danger
--
-- 멱등: add column if not exists + NULL 인 값만 채운다. 운영자가 조정한 값을 되돌리지 않는다.
-- ============================================================

alter table public.tire_config
  add column if not exists psi_low_ratio            numeric,
  add column if not exists psi_dev_warn             numeric,
  add column if not exists psi_dev_danger           numeric,
  add column if not exists inspection_interval_days integer,
  add column if not exists target_life_km           numeric;

comment on column public.tire_config.psi_low_ratio is
  '저압 위험 경계 — 실측이 권장 × 이 값 미만이면 적색. 0.85 = 권장의 85%';
comment on column public.tire_config.psi_dev_warn is
  '공기압 정상 허용 편차(비율). |실측−권장|/권장 이 이 값을 넘으면 황색. 0.05 = ±5%';
comment on column public.tire_config.psi_dev_danger is
  '공기압 위험 편차(비율). 과압 편차가 이 값을 넘으면 적색. 0.15 = +15%';
comment on column public.tire_config.inspection_interval_days is
  '점검 보고 주기(일). 최근 점검 경과일이 이 값의 1.5배를 넘으면 점검 지연';
comment on column public.tire_config.target_life_km is
  '타이어 목표 수명(km). 경제성 탭의 목표 대비 CPK 산출 기준';

update public.tire_config
   set psi_low_ratio            = coalesce(psi_low_ratio,            0.85),
       psi_dev_warn             = coalesce(psi_dev_warn,             0.05),
       psi_dev_danger           = coalesce(psi_dev_danger,           0.15),
       inspection_interval_days = coalesce(inspection_interval_days, 14),
       target_life_km           = coalesce(target_life_km,           75000)
 where id = 1;

-- 경계가 뒤집히면 신호등이 무의미해진다. NULL 은 허용(프런트 폴백).
alter table public.tire_config
  drop constraint if exists tire_config_psi_judge_check;
alter table public.tire_config
  add constraint tire_config_psi_judge_check check (
    (psi_low_ratio  is null or (psi_low_ratio  > 0 and psi_low_ratio  < 1))
    and (psi_dev_warn   is null or (psi_dev_warn   >= 0 and psi_dev_warn   < 1))
    and (psi_dev_danger is null or (psi_dev_danger >  0 and psi_dev_danger < 1))
    and (psi_dev_warn is null or psi_dev_danger is null or psi_dev_warn < psi_dev_danger)
  );

alter table public.tire_config
  drop constraint if exists tire_config_interval_check;
alter table public.tire_config
  add constraint tire_config_interval_check check (
    (inspection_interval_days is null or inspection_interval_days between 1 and 365)
    and (target_life_km is null or target_life_km > 0)
  );

-- ── vehicles: HM/KM 리셋 보정 (A-9) ─────────────────────────
-- reset_date 이후 회차의 HM·KM 에 offset 을 더해 리셋 전 누적값과 잇는다.
-- 원시값(inspections.hm·km)은 건드리지 않는다 — 보정은 화면 계산에서만 한다.
alter table public.vehicles
  add column if not exists reset_date date,
  add column if not exists hm_offset  numeric,
  add column if not exists km_offset  numeric;

comment on column public.vehicles.reset_date is
  'HM/KM 계기 리셋일. 이 날짜 이후(포함) 회차에 hm_offset·km_offset 을 더한다';
comment on column public.vehicles.hm_offset is '리셋 직전 누적 HM. NULL 이면 HM 보정 안 함';
comment on column public.vehicles.km_offset is '리셋 직전 누적 KM. NULL 이면 KM 보정 안 함';

alter table public.vehicles
  drop constraint if exists vehicles_reset_offset_check;
alter table public.vehicles
  add constraint vehicles_reset_offset_check check (
    (hm_offset is null or hm_offset >= 0) and (km_offset is null or km_offset >= 0)
  );

-- ============================================================
-- ROLLBACK:
--   -- 컬럼은 남긴다 (프로젝트 규약: DROP COLUMN 금지).
--   alter table public.tire_config drop constraint if exists tire_config_psi_judge_check;
--   alter table public.tire_config drop constraint if exists tire_config_interval_check;
--   alter table public.vehicles    drop constraint if exists vehicles_reset_offset_check;
-- ============================================================
