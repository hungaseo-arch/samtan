-- ============================================================
-- Samtan TMS — 시리얼 오타 수정
-- CH834 R2 In 교체 타이어 'DA1211H03162D' → 'DA12511H03162D' (12511에서 '5' 누락)
-- 이 타이어(No.12)는 839 L3 Out에서 탈거 후 834 R2 In에 재장착된 로테이션 타이어.
-- 수정으로 배치도(serial2)·교체이력(repl)·수명DB(lifetimes)가 동일 시리얼을 가리킴.
-- ============================================================

update public.vehicle_positions
   set serial2 = 'DA12511H03162D'
 where ch = '834' and pos = 'R2 In' and serial2 = 'DA1211H03162D';

update public.replacements
   set new_serial = 'DA12511H03162D'
 where ch = '834' and pos = 'R2 In' and new_serial = 'DA1211H03162D';
