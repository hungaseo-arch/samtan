-- ============================================================
-- Samtan TMS — 기존 적재분 원본 대조 정정
--
-- 20260806 · 20260721 두 원본 파일을 프로덕션 330행과 대조해 나온 차이를
-- 되돌린다. 회차를 추가하거나 삭제하지 않고 값만 고친다.
--
--   · km     130행 — 832 · 835
--     Pressure 시트에서 이 두 대만 HM 행 바로 아래에 'HM Reset 0' 보조행이
--     있다. 최초 적재가 HM 다음 행을 KM 으로 읽어 리셋 후 가동시간을 km 에
--     넣었다. 실제 KM 행 값으로 바꾼다.
--   · serial 31행
--     회차 시점에 실제로 물려 있던 타이어가 아니라 포지션의 최초 시리얼이
--     들어가 있다. 교체 이후 회차가 이전 타이어를 가리켜 수명 계산이 어긋난다.
--
-- 공기압은 제외했다. `834 / 2026-05-10 / R3 Out` 과 `835 / 2026-07-05 / R3 Out`
-- 두 칸은 T-101 이 추정 정정한 값과 원본이 엇갈려 사용자 확인이 필요하다.
--
-- 멱등하다. 이미 고쳐진 행은 `is distinct from` 조건에서 걸러진다.
-- ============================================================

-- ── 1. km ─────────────────────────────────────────────────
update public.inspections i
   set km = v.km
  from (values
    ('832', date '2026-04-08', 434888.4::numeric),  -- 이전 null
    ('832', date '2026-04-12', 435025.8::numeric),  -- 이전 null
    ('832', date '2026-04-26', 435025.8::numeric),  -- 이전 null
    ('832', date '2026-05-10', 435025.8::numeric),  -- 이전 null
    ('832', date '2026-05-23', 441243.6::numeric),  -- 이전 242.6
    ('832', date '2026-06-14', 450068.0::numeric),  -- 이전 666.0
    ('832', date '2026-07-05', 460633.4::numeric),  -- 이전 1110.9
    ('835', date '2026-04-21', 641536.8::numeric),  -- 이전 null
    ('835', date '2026-04-26', 641538.8::numeric),  -- 이전 null
    ('835', date '2026-05-10', 641538.8::numeric),  -- 이전 null
    ('835', date '2026-05-23', 641538.8::numeric),  -- 이전 null
    ('835', date '2026-06-14', 646136.6::numeric),  -- 이전 238.0
    ('835', date '2026-07-05', 655769.6::numeric)   -- 이전 668.0
  ) as v(ch, inspection_date, km)
 where i.ch = v.ch
   and i.inspection_date = v.inspection_date
   and i.km is distinct from v.km;

-- ── 2. serial ─────────────────────────────────────────────
update public.inspections i
   set serial = v.serial
  from (values
    ('832', date '2026-07-05', 'R3 Out', 'DA1BFANH04814D'),  -- 이전 DA1BFANH05095D
    ('834', date '2026-05-10', 'R2 In', 'DA12511H03162D'),  -- 이전 DA1BFANH04814D
    ('834', date '2026-05-24', 'L3 In', 'DA1BFBPH02653D'),  -- 이전 DA12511H03160D
    ('834', date '2026-05-24', 'R2 In', 'DA12511H03162D'),  -- 이전 DA1BFANH04814D
    ('834', date '2026-06-14', 'L3 In', 'DA1BFBPH02653D'),  -- 이전 DA12511H03160D
    ('834', date '2026-06-14', 'R1', 'DA12511H03129D'),  -- 이전 DA12511H03052D
    ('834', date '2026-06-14', 'R2 In', 'DA12511H03162D'),  -- 이전 DA1BFANH04814D
    ('834', date '2026-07-05', 'L3 In', 'DA1BFBPH02653D'),  -- 이전 DA12511H03160D
    ('834', date '2026-07-05', 'L3 Out', 'DA12511H03030D'),  -- 이전 DA1BFANH05051D
    ('834', date '2026-07-05', 'R1', 'DA12511H03129D'),  -- 이전 DA12511H03052D
    ('834', date '2026-07-05', 'R2 In', 'DA12511H03162D'),  -- 이전 DA1BFANH04814D
    ('835', date '2026-07-05', 'L2 In', 'DA1BFANH07686D'),  -- 이전 DA1BFANH05098D
    ('835', date '2026-07-05', 'L2 Out', 'DA12510H11571D'),  -- 이전 DA12511H03130D
    ('835', date '2026-07-05', 'L3 Out', 'DA12511H03159D'),  -- 이전 DA12511H02832D
    ('839', date '2026-04-26', 'L3 Out', 'DA1BFBPH02574D'),  -- 이전 DA12511H03162D
    ('839', date '2026-05-10', 'L3 In', 'DA1BFBPH02689D'),  -- 이전 DA1BFBPH02433D
    ('839', date '2026-05-10', 'L3 Out', 'DA1BFBPH02574D'),  -- 이전 DA12511H03162D
    ('839', date '2026-05-23', 'L3 In', 'DA1BFBPH02689D'),  -- 이전 DA1BFBPH02433D
    ('839', date '2026-05-23', 'L3 Out', 'DA1BFBPH02574D'),  -- 이전 DA12511H03162D
    ('839', date '2026-06-14', 'L3 In', 'DA1BFBPH02689D'),  -- 이전 DA1BFBPH02433D
    ('839', date '2026-06-14', 'L3 Out', 'DA1BFBPH02574D'),  -- 이전 DA12511H03162D
    ('839', date '2026-07-05', 'L1', 'DA1BFANH04818D'),  -- 이전 DA12510H11571D
    ('839', date '2026-07-05', 'L2 In', 'DA12511H03052D'),  -- 이전 DA1BFBPH02428D
    ('839', date '2026-07-05', 'L3 In', 'DA1BFBPH02689D'),  -- 이전 DA1BFBPH02433D
    ('839', date '2026-07-05', 'L3 Out', 'DA1BFBPH02574D'),  -- 이전 DA12511H03162D
    ('839', date '2026-07-05', 'R3 In', 'DA1BFBPH02432D'),  -- 이전 DA1BFANH05089D
    ('839', date '2026-07-05', 'R3 Out', 'DA12511H03031D'),  -- 이전 DA1BFANH07686D
    ('849', date '2026-05-23', 'R2 In', 'DA1BFANH04814D'),  -- 이전 DA1BFBPH02653D
    ('849', date '2026-06-14', 'R2 In', 'DA1BFANH04814D'),  -- 이전 DA1BFBPH02653D
    ('849', date '2026-07-05', 'R2 In', 'DA12511H02913D'),  -- 이전 DA1BFBPH02653D
    ('849', date '2026-07-05', 'R2 Out', 'DA12510H11576D')  -- 이전 DA12511H03161D
  ) as v(ch, inspection_date, pos, serial)
 where i.ch = v.ch
   and i.inspection_date = v.inspection_date
   and i.pos = v.pos
   and i.serial is distinct from v.serial;

