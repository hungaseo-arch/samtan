-- ============================================================
-- Samtan TMS — 실차 점검 기록 적재 (20260806 MONITORING TIRE TECHKING.xlsx)
--
-- 프로덕션에 없는 회차만 담는다. 이미 적재된 330행은 건드리지 않는다.
--   · CH 847 신규 등록 (차량 1대 + 포지션 10개)
--   · 2026-07-12  CH 847        10행  (신품 장착 직후 첫 점검)
--   · 2026-07-26  차량 7대      70행
--   · 교체이력 2건 (835 L3 Out · 835 R3 In)
--
-- 점검 행은 T-104 `upsert_inspection_round()` 를 경유하므로 재실행해도
-- 행 수가 늘지 않고 변경 이력도 남지 않는다.
-- ============================================================

-- ── 1. 차량 · 포지션 ─────────────────────────────────────
-- CH 847 은 2026-07-10 신품 10본을 달고 투입된 신규 차량이다
-- (Lifetime 시트 Install Date). Pressure 시트에 'HM Reset 0' 보조행이 없으므로
-- 계기 리셋 차량이 아니다.
--
-- 나머지 6대는 프로덕션에 이미 있고 시리얼도 원본과 일치한다(대조 완료).
-- 빈 DB 에서도 아래 점검 회차가 `fk_insp_position` 을 통과해야 하므로 함께 넣되,
-- `do nothing` 으로 기존 행은 건드리지 않는다.
insert into public.vehicles (ch, seq, hm_reset)
values
  ('834', 0, false),
  ('839', 1, false),
  ('832', 2, true),
  ('835', 3, true),
  ('849', 4, false),
  ('824', 5, false),
  ('847', 6, false)
on conflict (ch) do nothing;

insert into public.vehicle_positions (ch, pos, serial, seq)
values
  ('834', 'L1',      'DA1BFANH07618D',  0),
  ('834', 'L2 In',   'DA1BFANH10237D',  1),
  ('834', 'L2 Out',  'DA1BFBPH02687D',  2),
  ('834', 'L3 In',   'DA12511H03160D',  3),
  ('834', 'L3 Out',  'DA1BFANH05051D',  4),
  ('834', 'R1',      'DA12511H03052D',  5),
  ('834', 'R2 In',   'DA1BFANH04814D',  6),
  ('834', 'R2 Out',  'DA12511H03155D',  7),
  ('834', 'R3 In',   'DA1BFANH07452D',  8),
  ('834', 'R3 Out',  'DA12511H02845D',  9),
  ('839', 'L1',      'DA12510H11571D',  0),
  ('839', 'L2 In',   'DA1BFBPH02428D',  1),
  ('839', 'L2 Out',  'DA1BFANH05052D',  2),
  ('839', 'L3 In',   'DA1BFBPH02433D',  3),
  ('839', 'L3 Out',  'DA12511H03162D',  4),
  ('839', 'R1',      'DA12511H03169D',  5),
  ('839', 'R2 In',   'DA1BFANH05091D',  6),
  ('839', 'R2 Out',  'DA12511H02833D',  7),
  ('839', 'R3 In',   'DA1BFANH05089D',  8),
  ('839', 'R3 Out',  'DA1BFANH07686D',  9),
  ('832', 'L1',      'DA1BFANH07451D',  0),
  ('832', 'L2 In',   'DA1BFANH04847D',  1),
  ('832', 'L2 Out',  'DA1BFANH07563D',  2),
  ('832', 'L3 In',   'DA1BFANH05096D',  3),
  ('832', 'L3 Out',  'DA1BFBPH02472D',  4),
  ('832', 'R1',      'DA1BFANH04823D',  5),
  ('832', 'R2 In',   'DA12511H02829D',  6),
  ('832', 'R2 Out',  'DA12511H03170D',  7),
  ('832', 'R3 In',   'DA1BFANH07616D',  8),
  ('832', 'R3 Out',  'DA1BFANH05095D',  9),
  ('835', 'L1',      'DA1BFANH04820D',  0),
  ('835', 'L2 In',   'DA1BFANH05098D',  1),
  ('835', 'L2 Out',  'DA12511H03130D',  2),
  ('835', 'L3 In',   'DA1BFANH04849D',  3),
  ('835', 'L3 Out',  'DA12511H02832D',  4),
  ('835', 'R1',      'DA12510H11573D',  5),
  ('835', 'R2 In',   'DA1BFANH04816D',  6),
  ('835', 'R2 Out',  'DA1BFBPH02474D',  7),
  ('835', 'R3 In',   'DA1BFANH07570D',  8),
  ('835', 'R3 Out',  'DA1BFANH07566D',  9),
  ('849', 'L1',      'DA1BFANH10245D',  0),
  ('849', 'L2 In',   'DA12511H03128D',  1),
  ('849', 'L2 Out',  'DA1BFANH05097D',  2),
  ('849', 'L3 In',   'DA12511H03157D',  3),
  ('849', 'L3 Out',  'DA12511H03029D',  4),
  ('849', 'R1',      'DA1BFBPH02475D',  5),
  ('849', 'R2 In',   'DA1BFBPH02653D',  6),
  ('849', 'R2 Out',  'DA12511H03161D',  7),
  ('849', 'R3 In',   'DA12510H09948D',  8),
  ('849', 'R3 Out',  'DA1BFBPH02435D',  9),
  ('824', 'L1',      'DA1BFBPH02436D',  0),
  ('824', 'L2 In',   'DA1BFANH04824D',  1),
  ('824', 'L2 Out',  'DA1BFANH07617D',  2),
  ('824', 'L3 In',   'DA12511H03026D',  3),
  ('824', 'L3 Out',  'DA12511H02816D',  4),
  ('824', 'R1',      'DA12510H11572D',  5),
  ('824', 'R2 In',   'DA12511H03154D',  6),
  ('824', 'R2 Out',  'DA1BFANH05054D',  7),
  ('824', 'R3 In',   'DA1BFANH04848D',  8),
  ('824', 'R3 Out',  'DA1BFANH04813D',  9),
  ('847', 'L1',      'DA1BFANH10236D',  0),
  ('847', 'L2 In',   'DA1BFANH05092D',  1),
  ('847', 'L2 Out',  'DA12511H02817D',  2),
  ('847', 'L3 In',   'DA12510H09949D',  3),
  ('847', 'L3 Out',  'DA1BFANH04825D',  4),
  ('847', 'R1',      'DA1BFANH05040D',  5),
  ('847', 'R2 In',   'DA12511H03158D',  6),
  ('847', 'R2 Out',  'DA1BFANH07614D',  7),
  ('847', 'R3 In',   'DA12511H03156D',  8),
  ('847', 'R3 Out',  'DA12511H02830D',  9)
on conflict (ch, pos) do nothing;

-- ── 2. 점검 회차 ──────────────────────────────────────────
-- 2026-07-12  CH 847   HM 2,204.5 · KM 89,100.0
select public.upsert_inspection_round(
  '847', date '2026-07-12', 2204.5, 89100.0, null, $j$[
    {"pos": "L1",      "serial": "DA1BFANH10236D",  "pressure": 90.0,   "tread": 22.00},
    {"pos": "L2 In",   "serial": "DA1BFANH05092D",  "pressure": 116.0,  "tread": 22.00},
    {"pos": "L2 Out",  "serial": "DA12511H02817D",  "pressure": 116.0,  "tread": 22.00},
    {"pos": "L3 In",   "serial": "DA12510H09949D",  "pressure": 116.0,  "tread": 22.00},
    {"pos": "L3 Out",  "serial": "DA1BFANH04825D",  "pressure": 116.0,  "tread": 22.00},
    {"pos": "R1",      "serial": "DA1BFANH05040D",  "pressure": 90.0,   "tread": 22.00},
    {"pos": "R2 In",   "serial": "DA12511H03158D",  "pressure": 116.0,  "tread": 22.00},
    {"pos": "R2 Out",  "serial": "DA1BFANH07614D",  "pressure": 116.0,  "tread": 22.00},
    {"pos": "R3 In",   "serial": "DA12511H03156D",  "pressure": 116.0,  "tread": 22.00},
    {"pos": "R3 Out",  "serial": "DA12511H02830D",  "pressure": 116.0,  "tread": 22.00}
  ]$j$::jsonb);

-- 2026-07-26  CH 824   HM 6,282.7 · KM 651,666.5
select public.upsert_inspection_round(
  '824', date '2026-07-26', 6282.7, 651666.5, null, $j$[
    {"pos": "L1",      "serial": "DA1BFBPH02436D",  "pressure": 90.0,   "tread": 19.99},
    {"pos": "L2 In",   "serial": "DA1BFANH04824D",  "pressure": null,   "tread": 15.08},
    {"pos": "L2 Out",  "serial": "DA1BFANH07617D",  "pressure": 117.0,  "tread": 16.40},
    {"pos": "L3 In",   "serial": "DA12511H03026D",  "pressure": null,   "tread": 13.57},
    {"pos": "L3 Out",  "serial": "DA12511H02816D",  "pressure": 118.0,  "tread": 15.48},
    {"pos": "R1",      "serial": "DA12510H11572D",  "pressure": 97.5,   "tread": 19.32},
    {"pos": "R2 In",   "serial": "DA12511H03154D",  "pressure": null,   "tread": 14.83},
    {"pos": "R2 Out",  "serial": "DA1BFANH05054D",  "pressure": 115.0,  "tread": 14.93},
    {"pos": "R3 In",   "serial": "DA1BFANH04848D",  "pressure": null,   "tread": 14.80},
    {"pos": "R3 Out",  "serial": "DA1BFANH04813D",  "pressure": 114.0,  "tread": 15.03}
  ]$j$::jsonb);

-- 2026-07-26  CH 832   HM 6,718.8 · KM 470,071.2
select public.upsert_inspection_round(
  '832', date '2026-07-26', 6718.8, 470071.2, null, $j$[
    {"pos": "L1",      "serial": "DA1BFANH07451D",  "pressure": 94.0,   "tread": 17.04},
    {"pos": "L2 In",   "serial": "DA1BFANH04847D",  "pressure": null,   "tread": 0.00},
    {"pos": "L2 Out",  "serial": "DA1BFANH07563D",  "pressure": 109.0,  "tread": 3.19},
    {"pos": "L3 In",   "serial": "DA1BFANH05096D",  "pressure": null,   "tread": 0.00},
    {"pos": "L3 Out",  "serial": "DA1BFBPH02472D",  "pressure": 108.0,  "tread": 3.19},
    {"pos": "R1",      "serial": "DA1BFANH04823D",  "pressure": 96.5,   "tread": 12.09},
    {"pos": "R2 In",   "serial": "DA12511H02829D",  "pressure": null,   "tread": 3.76},
    {"pos": "R2 Out",  "serial": "DA12511H03170D",  "pressure": 116.0,  "tread": 3.77},
    {"pos": "R3 In",   "serial": "DA1BFANH07616D",  "pressure": null,   "tread": 3.96},
    {"pos": "R3 Out",  "serial": "DA1BFANH04814D",  "pressure": 114.0,  "tread": 2.16}
  ]$j$::jsonb);

-- 2026-07-26  CH 834   HM 3,350.4 · KM 748,965.9
select public.upsert_inspection_round(
  '834', date '2026-07-26', 3350.4, 748965.9, null, $j$[
    {"pos": "L1",      "serial": "DA1BFANH07618D",  "pressure": 83.5,   "tread": 10.34},
    {"pos": "L2 In",   "serial": "DA1BFANH10237D",  "pressure": null,   "tread": 0.00},
    {"pos": "L2 Out",  "serial": "DA1BFBPH02687D",  "pressure": 116.0,  "tread": 0.00},
    {"pos": "L3 In",   "serial": "DA1BFBPH02653D",  "pressure": null,   "tread": 3.73},
    {"pos": "L3 Out",  "serial": "DA12511H03030D",  "pressure": 112.0,  "tread": 8.01},
    {"pos": "R1",      "serial": "DA12511H03129D",  "pressure": 92.5,   "tread": 18.27},
    {"pos": "R2 In",   "serial": "DA12511H03162D",  "pressure": null,   "tread": 0.00},
    {"pos": "R2 Out",  "serial": "DA12511H03155D",  "pressure": 113.0,  "tread": 0.00},
    {"pos": "R3 In",   "serial": "DA1BFANH07452D",  "pressure": null,   "tread": 2.26},
    {"pos": "R3 Out",  "serial": "DA12511H02845D",  "pressure": 114.0,  "tread": 0.00}
  ]$j$::jsonb);

-- 2026-07-26  CH 835   HM 15,468.5 · KM 663,888.1
select public.upsert_inspection_round(
  '835', date '2026-07-26', 15468.5, 663888.1, null, $j$[
    {"pos": "L1",      "serial": "DA1BFANH04820D",  "pressure": 96.5,   "tread": 17.55},
    {"pos": "L2 In",   "serial": "DA1BFANH07686D",  "pressure": null,   "tread": 0.00},
    {"pos": "L2 Out",  "serial": "DA12510H11571D",  "pressure": 109.0,  "tread": 0.00},
    {"pos": "L3 In",   "serial": "DA1BFANH04849D",  "pressure": null,   "tread": 8.94},
    {"pos": "L3 Out",  "serial": "DA1BFANH05098D",  "pressure": 104.0,  "tread": 9.40},
    {"pos": "R1",      "serial": "DA12510H11573D",  "pressure": 99.5,   "tread": 14.06},
    {"pos": "R2 In",   "serial": "DA1BFANH04816D",  "pressure": null,   "tread": 8.35},
    {"pos": "R2 Out",  "serial": "DA1BFBPH02474D",  "pressure": 104.0,  "tread": 6.86},
    {"pos": "R3 In",   "serial": "DA12511H03161D",  "pressure": null,   "tread": 6.61},
    {"pos": "R3 Out",  "serial": "DA1BFANH07566D",  "pressure": 117.0,  "tread": 8.41}
  ]$j$::jsonb);

-- 2026-07-26  CH 839   HM 6,737.2 · KM 468,240.8
select public.upsert_inspection_round(
  '839', date '2026-07-26', 6737.2, 468240.8, null, $j$[
    {"pos": "L1",      "serial": "DA1BFANH04818D",  "pressure": 104.0,  "tread": 12.02},
    {"pos": "L2 In",   "serial": "DA12511H03052D",  "pressure": null,   "tread": 3.03},
    {"pos": "L2 Out",  "serial": "DA1BFANH05052D",  "pressure": 116.0,  "tread": 0.00},
    {"pos": "L3 In",   "serial": "DA1BFBPH02689D",  "pressure": null,   "tread": 2.44},
    {"pos": "L3 Out",  "serial": "DA1BFBPH02574D",  "pressure": 118.0,  "tread": 2.09},
    {"pos": "R1",      "serial": "DA12511H03169D",  "pressure": 75.0,   "tread": 6.89},
    {"pos": "R2 In",   "serial": "DA1BFANH05091D",  "pressure": null,   "tread": 0.00},
    {"pos": "R2 Out",  "serial": "DA12511H02833D",  "pressure": 116.0,  "tread": 0.00},
    {"pos": "R3 In",   "serial": "DA1BFBPH02432D",  "pressure": null,   "tread": 10.91},
    {"pos": "R3 Out",  "serial": "DA12511H03031D",  "pressure": 117.0,  "tread": 11.23}
  ]$j$::jsonb);

-- 2026-07-26  CH 847   HM 2,467.5 · KM 135,397.1
select public.upsert_inspection_round(
  '847', date '2026-07-26', 2467.5, 135397.1, null, $j$[
    {"pos": "L1",      "serial": "DA1BFANH10236D",  "pressure": 94.0,   "tread": 20.29},
    {"pos": "L2 In",   "serial": "DA1BFANH05092D",  "pressure": null,   "tread": 16.51},
    {"pos": "L2 Out",  "serial": "DA12511H02817D",  "pressure": 115.0,  "tread": 15.54},
    {"pos": "L3 In",   "serial": "DA12510H09949D",  "pressure": null,   "tread": 14.85},
    {"pos": "L3 Out",  "serial": "DA1BFANH04825D",  "pressure": 117.0,  "tread": 17.61},
    {"pos": "R1",      "serial": "DA1BFANH05040D",  "pressure": 93.0,   "tread": 20.03},
    {"pos": "R2 In",   "serial": "DA12511H03158D",  "pressure": null,   "tread": 15.13},
    {"pos": "R2 Out",  "serial": "DA1BFANH07614D",  "pressure": 110.0,  "tread": 17.18},
    {"pos": "R3 In",   "serial": "DA12511H03156D",  "pressure": null,   "tread": 16.37},
    {"pos": "R3 Out",  "serial": "DA12511H02830D",  "pressure": 113.0,  "tread": 17.12}
  ]$j$::jsonb);

-- 2026-07-26  CH 849   HM 2,588.1 · KM 0.0
select public.upsert_inspection_round(
  '849', date '2026-07-26', 2588.1, 0.0, null, $j$[
    {"pos": "L1",      "serial": "DA1BFANH10245D",  "pressure": 88.5,   "tread": 14.72},
    {"pos": "L2 In",   "serial": "DA12511H03128D",  "pressure": null,   "tread": 5.82},
    {"pos": "L2 Out",  "serial": "DA1BFANH05097D",  "pressure": 109.0,  "tread": 8.04},
    {"pos": "L3 In",   "serial": "DA12511H03157D",  "pressure": null,   "tread": 4.38},
    {"pos": "L3 Out",  "serial": "DA12511H03029D",  "pressure": 114.0,  "tread": 5.59},
    {"pos": "R1",      "serial": "DA1BFBPH02475D",  "pressure": 86.5,   "tread": 8.96},
    {"pos": "R2 In",   "serial": "DA12511H02913D",  "pressure": null,   "tread": 4.33},
    {"pos": "R2 Out",  "serial": "DA12510H11576D",  "pressure": 106.0,  "tread": 9.85},
    {"pos": "R3 In",   "serial": "DA12510H09948D",  "pressure": null,   "tread": 12.24},
    {"pos": "R3 Out",  "serial": "DA1BFBPH02435D",  "pressure": 98.5,   "tread": 7.10}
  ]$j$::jsonb);

-- ── 3. 교체이력 ──────────────────────────────────────────
-- replacements 에는 (ch, pos, date) 유니크 제약이 없어 존재 여부로 막는다.
insert into public.replacements (ch, pos, date, new_serial)
select '835', 'L3 Out', date '2026-07-12', 'DA1BFANH05098D'
 where not exists (select 1 from public.replacements
                    where ch = '835' and pos = 'L3 Out'
                      and date = date '2026-07-12');

insert into public.replacements (ch, pos, date, new_serial)
select '835', 'R3 In', date '2026-07-14', 'DA12511H03161D'
 where not exists (select 1 from public.replacements
                    where ch = '835' and pos = 'R3 In'
                      and date = date '2026-07-14');

