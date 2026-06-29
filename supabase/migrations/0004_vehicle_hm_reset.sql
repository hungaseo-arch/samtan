-- ============================================================
-- Samtan TMS — 차량 HM Reset 플래그
-- 운용 중 Hour Meter/주행거리가 리셋된 차량 표시 (원본 기준 CH 832 · 835)
-- ============================================================

alter table public.vehicles add column if not exists hm_reset boolean not null default false;

update public.vehicles set hm_reset = true  where ch in ('832', '835');
update public.vehicles set hm_reset = false where ch not in ('832', '835');
