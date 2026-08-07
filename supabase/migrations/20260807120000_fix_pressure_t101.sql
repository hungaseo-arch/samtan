-- ============================================================
-- Samtan TMS — T-101 공기압 정정 2칸을 원본값으로 복원 (U-6)
--
-- `20260801100000_t101_correct_outliers.sql` 은 이 두 칸을 앞자리가 누락된
-- 오타로 보고 자리수를 복원했습니다. 진단은 맞았지만 복원한 숫자가 원본과
-- 다릅니다.
--
--   대상                          원본           T-101      이번 복원
--   834 / 2026-05-10 / R3 Out     120 (2파일 동일)  10 → 110   → 120
--   835 / 2026-07-05 / R3 Out     113 (고객사 수정)  13 → 120   → 113
--
-- 835 쪽은 고객사가 20260721 파일의 13 을 20260806 파일에서 113 으로 직접
-- 고쳤습니다. 두 파일이 겹치는 340칸 중 소급 수정된 유일한 칸입니다.
--
-- 사용자 승인 2026-08-07. 두 값 모두 ck_pressure (60 ~ 200) 범위 안입니다.
-- 이미 복원된 행은 `is distinct from` 으로 걸러지므로 재실행해도 안전합니다.
-- ============================================================

update public.inspections i
   set pressure = v.pressure
  from (values
    ('834', date '2026-05-10', 'R3 Out', 120.0::numeric),  -- 이전 110.0
    ('835', date '2026-07-05', 'R3 Out', 113.0::numeric)   -- 이전 120.0
  ) as v(ch, inspection_date, pos, pressure)
 where i.ch = v.ch
   and i.inspection_date = v.inspection_date
   and i.pos = v.pos
   and i.pressure is distinct from v.pressure;
