-- ============================================================
-- Samtan TMS — Lifetime DB 최초 장착(입고)일 입력
-- 원본(20260618 MONITORING TIRE TECHKING)의 Lifetime 시트 "Assembly Date" 기준.
-- (원본 "Install Date" 칸은 비어 있어, 입고/조립일을 최초 장착일로 사용)
-- ============================================================

update public.lifetimes set install = '2026-04-01' where no between 1 and 10;
update public.lifetimes set install = '2026-04-04' where no between 11 and 22;
update public.lifetimes set install = '2026-04-06' where no between 23 and 32;
update public.lifetimes set install = '2026-04-18' where no between 33 and 42;
update public.lifetimes set install = '2026-05-03' where no between 43 and 52;
update public.lifetimes set install = '2026-06-01' where no between 53 and 60;
update public.lifetimes set install = '2026-06-02' where no between 61 and 65;
update public.lifetimes set install = '2026-06-07' where no between 66 and 67;
update public.lifetimes set install = '2026-06-12' where no between 68 and 70;
