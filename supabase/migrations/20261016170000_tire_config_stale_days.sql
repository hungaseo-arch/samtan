-- ============================================================
-- 점검보고서 CHK-TMS-2026-10-16-WEB R-2 · «오래된 값» 기준일
--
-- 근거: 복륜 내측(In) 포지션은 2026-04-02 초기 회차 뒤로 공기압이 측정되지 않았는데,
-- 화면은 마지막 측정값(125 psi)을 «최근 공기압» 으로 계속 판정해 공기압 알림 43건 중
-- 약 20건이 거짓 알림이 됐다 (PRS-01 · LAY-02).
--
-- 규칙 (사용자 결정 2026-10-16): 측정일이 오늘(현장 WITA)로부터 stale_days 일을
-- 넘은 값은 «오래된 값» 이다.
--   · 공기압 — 상태 판정·알림에서 뺀다. 화면에는 회색 배지로 날짜와 함께 남긴다.
--   · 트레드 — 주의·발주·위험은 그대로 둔다 (트레드는 회복되지 않으므로 오래된
--     위험값을 지우면 안전 경고가 사라진다). 정상 판정만 «오래된 값» 으로 낮춘다.
--   · 교체 준비 목록 — 마지막 측정이 이보다 오래된 타이어는 «측정 필요» 로 분리한다.
--
-- 멱등: add column if not exists · NULL 인 값만 채움 · 제약 drop → add.
-- ============================================================

alter table public.tire_config
  add column if not exists stale_days integer;

comment on column public.tire_config.stale_days is
  '측정값이 이 일수를 넘으면 «오래된 값» — 공기압 판정·알림 제외, 교체 준비 목록은 «측정 필요» (CHK-TMS-2026-10-16-WEB R-2)';

update public.tire_config
   set stale_days = coalesce(stale_days, 30)
 where id = 1;

alter table public.tire_config
  drop constraint if exists tire_config_stale_days_check;
alter table public.tire_config
  add constraint tire_config_stale_days_check check (
    stale_days is null or (stale_days > 0 and stale_days <= 365)
  );
