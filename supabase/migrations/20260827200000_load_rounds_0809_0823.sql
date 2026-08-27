-- ============================================================
-- Phase A · 2026-08-09 / 2026-08-23 점검 회차 적재 + 교체 8건
--   작업지시서 v3 §A · 원장 samtan_ledger_20260823.json (2026-08-23 마감)
--
-- 순서: 교체 원장 먼저 → 점검 회차. 교체가 먼저 들어가야
-- sync_position_current_serial 이 vehicle_positions.serial 을 갱신하고
-- serial_break_unlogged 경고가 뜨지 않는다.
--
-- 적재 규칙 (v3 §A · 사용자 결정 2026-08-27):
--   · inspections / tread_points 직접 INSERT 금지 — RPC 만 사용
--   · CH 834 KM 은 계기 리셋 보정값(km_corrected)으로 적재
--   · CH 849 KM 은 원장 그대로 0 (계기 미기록) — km_missing 경고로 남긴다
--   · pressure N/A 는 NULL
--   · tread = 0 은 실측이다. 전부 tread_status='measured' (v3 §0.3)
--   · remark 는 (차량·포지션)의 최신 회차에만 붙인다 — 원장 파서가
--     포지션별 비고를 전 회차에 복제해 놨기 때문이다
--   · Flag 는 전부 'OK'. 임의 OUTLIER 지정 금지
--
-- 멱등: RPC 가 (ch, inspection_date, pos) upsert 이고 교체는 NOT EXISTS 가드다.
-- 재실행해도 행이 늘지 않는다.
-- ============================================================

-- ── 교체 원장 8건 (v3 §A-3) ─────────────────────────────────
--   'BRIDGESTONE' 은 시리얼이 아니라 제조사명이다. 그대로 넣으면
--   lifetimes 에 존재하지 않는 타이어가 생긴다. 플레이스홀더 시리얼로
--   등록하고 lifetimes.note 에 사유를 남긴다 (사용자 결정 Q2).
--   CH 849 R3 Out 은 08-06·08-07 이틀 연속 교체다. 원장 기재 그대로
--   2건 모두 등록하고 확인 대기임을 note 에 남긴다.
insert into public.replacements (ch, pos, date, new_serial)
select '824', 'R3 Out', '2026-07-28'::date, 'DA12511H03130D'
 where not exists (select 1 from public.replacements x
        where x.ch = '824' and x.pos = 'R3 Out'
          and x.date = '2026-07-28'::date and x.new_serial = 'DA12511H03130D');
insert into public.replacements (ch, pos, date, new_serial)
select '849', 'R2 Out', '2026-08-04'::date, 'DA12511H02832D'
 where not exists (select 1 from public.replacements x
        where x.ch = '849' and x.pos = 'R2 Out'
          and x.date = '2026-08-04'::date and x.new_serial = 'DA12511H02832D');
insert into public.replacements (ch, pos, date, new_serial)
select '834', 'L3 In', '2026-08-05'::date, 'DA1BFANH05089D'
 where not exists (select 1 from public.replacements x
        where x.ch = '834' and x.pos = 'L3 In'
          and x.date = '2026-08-05'::date and x.new_serial = 'DA1BFANH05089D');
insert into public.replacements (ch, pos, date, new_serial)
select '824', 'R2 In', '2026-08-06'::date, 'DA1BFANH04813D'
 where not exists (select 1 from public.replacements x
        where x.ch = '824' and x.pos = 'R2 In'
          and x.date = '2026-08-06'::date and x.new_serial = 'DA1BFANH04813D');
insert into public.replacements (ch, pos, date, new_serial)
select '849', 'R3 Out', '2026-08-06'::date, 'DA1BFANH04814D'
 where not exists (select 1 from public.replacements x
        where x.ch = '849' and x.pos = 'R3 Out'
          and x.date = '2026-08-06'::date and x.new_serial = 'DA1BFANH04814D');
insert into public.replacements (ch, pos, date, new_serial)
select '849', 'R3 Out', '2026-08-07'::date, 'DA12511H03160D'
 where not exists (select 1 from public.replacements x
        where x.ch = '849' and x.pos = 'R3 Out'
          and x.date = '2026-08-07'::date and x.new_serial = 'DA12511H03160D');
insert into public.replacements (ch, pos, date, new_serial)
select '834', 'R3 In', '2026-08-12'::date, 'NONTK-834-R3IN-20260812'
 where not exists (select 1 from public.replacements x
        where x.ch = '834' and x.pos = 'R3 In'
          and x.date = '2026-08-12'::date and x.new_serial = 'NONTK-834-R3IN-20260812');
insert into public.replacements (ch, pos, date, new_serial)
select '834', 'R3 Out', '2026-08-12'::date, 'NONTK-834-R3OUT-20260812'
 where not exists (select 1 from public.replacements x
        where x.ch = '834' and x.pos = 'R3 Out'
          and x.date = '2026-08-12'::date and x.new_serial = 'NONTK-834-R3OUT-20260812');

-- ensure_lifetime_row() 가 note 없이 lifetimes 행을 만든다. 사유를 덧쓴다.
update public.lifetimes
   set note = 'Bridgestone (di luar uji coba) — 원장에 제조사명만 기재. 실제 시리얼 확인 대기'
 where serial in ('NONTK-834-R3IN-20260812', 'NONTK-834-R3OUT-20260812')
   and note is null;

update public.lifetimes
   set note = coalesce(note, '') || '2026-08-06·08-07 연속 교체 기재 — 원장 확인 대기'
 where serial in ('DA1BFANH04814D', 'DA12511H03160D')
   and coalesce(note, '') not like '%연속 교체%';

-- ── 점검 회차 14건 (138행) ──────────────────────────────────
-- CH 834 · 2026-08-09 · 10 포지션
select public.save_inspection_round_with_points(
  '834', '2026-08-09'::date, 3607.2, 753156.9, null,
  '[
  {"pos":"L1","serial":"DA1BFANH07618D","pressure":82,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":11.82},{"circ":"P1","width":"C1","depth":12.04},{"circ":"P1","width":"C2","depth":14.97},{"circ":"P1","width":"R","depth":11.93}]},
  {"pos":"L2 In","serial":"DA1BFANH10237D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":5.26},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":3.46}]},
  {"pos":"L2 Out","serial":"DA1BFBPH02687D","pressure":114,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":4.62},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.83}]},
  {"pos":"L3 In","serial":"DA1BFANH05089D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":9.92},{"circ":"P1","width":"C1","depth":5.04},{"circ":"P1","width":"C2","depth":4.12},{"circ":"P1","width":"R","depth":8.33}]},
  {"pos":"L3 Out","serial":"DA12511H03030D","pressure":110,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":11.78},{"circ":"P1","width":"C1","depth":6.36},{"circ":"P1","width":"C2","depth":5.72},{"circ":"P1","width":"R","depth":9.41}]},
  {"pos":"R1","serial":"DA12511H03129D","pressure":90.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":17.36},{"circ":"P1","width":"C1","depth":18.12},{"circ":"P1","width":"C2","depth":18.52},{"circ":"P1","width":"R","depth":19.56}]},
  {"pos":"R2 In","serial":"DA12511H03162D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":5.19},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.96}]},
  {"pos":"R2 Out","serial":"DA12511H03155D","pressure":110,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.24},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.65}]},
  {"pos":"R3 In","serial":"DA1BFANH07452D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | GUNDUL | TINDAK LANJUT: | SCRAP","points":[{"circ":"P1","width":"L","depth":5.94},{"circ":"P1","width":"C1","depth":1.39},{"circ":"P1","width":"C2","depth":1.95},{"circ":"P1","width":"R","depth":6.33}]},
  {"pos":"R3 Out","serial":"DA12511H02845D","pressure":111,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | GUNDUL | TINDAK LANJUT: | SCRAP","points":[{"circ":"P1","width":"L","depth":5.59},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.95}]}
]'::jsonb);
-- CH 834 · 2026-08-23 · 8 포지션
select public.save_inspection_round_with_points(
  '834', '2026-08-23'::date, 3860.2, 758422.2, null,
  '[
  {"pos":"L1","serial":"DA1BFANH07618D","pressure":82.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN KIRI MULAI GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":0},{"circ":"P1","width":"C1","depth":9.43},{"circ":"P1","width":"C2","depth":10.1},{"circ":"P1","width":"R","depth":5.6}]},
  {"pos":"L2 In","serial":"DA1BFANH10237D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH DAN KANAN SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":3.47},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":0}]},
  {"pos":"L2 Out","serial":"DA1BFBPH02687D","pressure":116,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":4.5},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":3.2}]},
  {"pos":"L3 In","serial":"DA1BFANH05089D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.64},{"circ":"P1","width":"C1","depth":2.98},{"circ":"P1","width":"C2","depth":2.32},{"circ":"P1","width":"R","depth":6.47}]},
  {"pos":"L3 Out","serial":"DA12511H03030D","pressure":111,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.89},{"circ":"P1","width":"C1","depth":2.28},{"circ":"P1","width":"C2","depth":2.49},{"circ":"P1","width":"R","depth":7.44}]},
  {"pos":"R1","serial":"DA12511H03129D","pressure":91,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.46},{"circ":"P1","width":"C1","depth":16.25},{"circ":"P1","width":"C2","depth":17.82},{"circ":"P1","width":"R","depth":17.99}]},
  {"pos":"R2 In","serial":"DA12511H03162D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":3.41},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.27}]},
  {"pos":"R2 Out","serial":"DA12511H03155D","pressure":110,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":6.82},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.23}]}
]'::jsonb);
-- CH 839 · 2026-08-09 · 10 포지션
select public.save_inspection_round_with_points(
  '839', '2026-08-09'::date, 7021.7, 474745.2, null,
  '[
  {"pos":"L1","serial":"DA1BFANH04818D","pressure":99.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":13.7},{"circ":"P1","width":"C1","depth":10.13},{"circ":"P1","width":"C2","depth":9.91},{"circ":"P1","width":"R","depth":6.96}]},
  {"pos":"L2 In","serial":"DA12511H03052D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":5.76},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":1.18},{"circ":"P1","width":"R","depth":6}]},
  {"pos":"L2 Out","serial":"DA1BFANH05052D","pressure":113,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":4.55},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.16}]},
  {"pos":"L3 In","serial":"DA1BFBPH02689D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.39},{"circ":"P1","width":"C1","depth":1.78},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.65}]},
  {"pos":"L3 Out","serial":"DA1BFBPH02574D","pressure":114,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.15},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":1.99},{"circ":"P1","width":"R","depth":7.91}]},
  {"pos":"R1","serial":"DA12511H03169D","pressure":99,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":0},{"circ":"P1","width":"C1","depth":4.13},{"circ":"P1","width":"C2","depth":8.27},{"circ":"P1","width":"R","depth":3.37}]},
  {"pos":"R2 In","serial":"DA1BFANH05091D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":3.43},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.39}]},
  {"pos":"R2 Out","serial":"DA12511H02833D","pressure":116,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":5.57},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":6.78}]},
  {"pos":"R3 In","serial":"DA1BFBPH02432D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.49},{"circ":"P1","width":"C1","depth":8.8},{"circ":"P1","width":"C2","depth":9.69},{"circ":"P1","width":"R","depth":13.34}]},
  {"pos":"R3 Out","serial":"DA12511H03031D","pressure":116,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.72},{"circ":"P1","width":"C1","depth":7.7},{"circ":"P1","width":"C2","depth":8.23},{"circ":"P1","width":"R","depth":12.53}]}
]'::jsonb);
-- CH 839 · 2026-08-23 · 10 포지션
select public.save_inspection_round_with_points(
  '839', '2026-08-23'::date, 7309.6, 480840, null,
  '[
  {"pos":"L1","serial":"DA1BFANH04818D","pressure":97.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.38},{"circ":"P1","width":"C1","depth":11.43},{"circ":"P1","width":"C2","depth":10.46},{"circ":"P1","width":"R","depth":5.76}]},
  {"pos":"L2 In","serial":"DA12511H03052D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":2.4},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":3.63}]},
  {"pos":"L2 Out","serial":"DA1BFANH05052D","pressure":112,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":3.07},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.07}]},
  {"pos":"L3 In","serial":"DA1BFBPH02689D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":6.53},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":6.89}]},
  {"pos":"L3 Out","serial":"DA1BFBPH02574D","pressure":114,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":5.21},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.94}]},
  {"pos":"R1","serial":"DA12511H03169D","pressure":95.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN KIRI SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":0},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":3.06},{"circ":"P1","width":"R","depth":4.25}]},
  {"pos":"R2 In","serial":"DA1BFANH05091D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":4.74},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.26}]},
  {"pos":"R2 Out","serial":"DA12511H02833D","pressure":113,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":2.79},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":3.46}]},
  {"pos":"R3 In","serial":"DA1BFBPH02432D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":10.26},{"circ":"P1","width":"C1","depth":6.14},{"circ":"P1","width":"C2","depth":6.97},{"circ":"P1","width":"R","depth":11.76}]},
  {"pos":"R3 Out","serial":"DA12511H03031D","pressure":113,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":11.24},{"circ":"P1","width":"C1","depth":5.33},{"circ":"P1","width":"C2","depth":6.64},{"circ":"P1","width":"R","depth":11.41}]}
]'::jsonb);
-- CH 832 · 2026-08-09 · 10 포지션
select public.save_inspection_round_with_points(
  '832', '2026-08-09'::date, 8534.1, 477057.6, null,
  '[
  {"pos":"L1","serial":"DA1BFANH07451D","pressure":97,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.44},{"circ":"P1","width":"C1","depth":15.1},{"circ":"P1","width":"C2","depth":17.52},{"circ":"P1","width":"R","depth":13.75}]},
  {"pos":"L2 In","serial":"DA1BFANH04847D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":5.94},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":3.09}]},
  {"pos":"L2 Out","serial":"DA1BFANH07563D","pressure":107,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":5.24},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":7.05}]},
  {"pos":"L3 In","serial":"DA1BFANH05096D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.28},{"circ":"P1","width":"C1","depth":2.6},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.1}]},
  {"pos":"L3 Out","serial":"DA1BFBPH02472D","pressure":106,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":6.98},{"circ":"P1","width":"C1","depth":1.91},{"circ":"P1","width":"C2","depth":1.42},{"circ":"P1","width":"R","depth":5.57}]},
  {"pos":"R1","serial":"DA1BFANH04823D","pressure":98,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":11.07},{"circ":"P1","width":"C1","depth":13.33},{"circ":"P1","width":"C2","depth":15.01},{"circ":"P1","width":"R","depth":15.71}]},
  {"pos":"R2 In","serial":"DA12511H02829D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.24},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":7.86}]},
  {"pos":"R2 Out","serial":"DA12511H03170D","pressure":113,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.54},{"circ":"P1","width":"C1","depth":2.81},{"circ":"P1","width":"C2","depth":2.67},{"circ":"P1","width":"R","depth":9.07}]},
  {"pos":"R3 In","serial":"DA1BFANH07616D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":5.92},{"circ":"P1","width":"C1","depth":2.75},{"circ":"P1","width":"C2","depth":2.17},{"circ":"P1","width":"R","depth":7.24}]},
  {"pos":"R3 Out","serial":"DA1BFANH04814D","pressure":121,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.41},{"circ":"P1","width":"C1","depth":2.3},{"circ":"P1","width":"C2","depth":3.26},{"circ":"P1","width":"R","depth":8.9}]}
]'::jsonb);
-- CH 832 · 2026-08-23 · 10 포지션
select public.save_inspection_round_with_points(
  '832', '2026-08-23'::date, 10644.8, 483577.1, null,
  '[
  {"pos":"L1","serial":"DA1BFANH07451D","pressure":85.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.1},{"circ":"P1","width":"C1","depth":13.72},{"circ":"P1","width":"C2","depth":15.14},{"circ":"P1","width":"R","depth":11.26}]},
  {"pos":"L2 In","serial":"DA1BFANH04847D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":3.84},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":2.64}]},
  {"pos":"L2 Out","serial":"DA1BFANH07563D","pressure":108,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":2.96},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.09}]},
  {"pos":"L3 In","serial":"DA1BFANH05096D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":6.37},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":2.82}]},
  {"pos":"L3 Out","serial":"DA1BFBPH02472D","pressure":107,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":6.17},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.07}]},
  {"pos":"R1","serial":"DA1BFANH04823D","pressure":87,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":3.46},{"circ":"P1","width":"C1","depth":10.43},{"circ":"P1","width":"C2","depth":11.75},{"circ":"P1","width":"R","depth":9.54}]},
  {"pos":"R2 In","serial":"DA12511H02829D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":6.32},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":7.39}]},
  {"pos":"R2 Out","serial":"DA12511H03170D","pressure":113,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":4.31},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.47}]},
  {"pos":"R3 In","serial":"DA1BFANH07616D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":3.94},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":5.91}]},
  {"pos":"R3 Out","serial":"DA1BFANH04814D","pressure":111,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":5.8},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":6.94}]}
]'::jsonb);
-- CH 835 · 2026-08-09 · 10 포지션
select public.save_inspection_round_with_points(
  '835', '2026-08-09'::date, 16825.2, 670380.4, null,
  '[
  {"pos":"L1","serial":"DA1BFANH04820D","pressure":93,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":17.53},{"circ":"P1","width":"C1","depth":16.43},{"circ":"P1","width":"C2","depth":17.6},{"circ":"P1","width":"R","depth":16.22}]},
  {"pos":"L2 In","serial":"DA1BFANH07686D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":4.53},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.48}]},
  {"pos":"L2 Out","serial":"DA12510H11571D","pressure":99.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":3.24},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":0}]},
  {"pos":"L3 In","serial":"DA1BFANH04849D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":10.97},{"circ":"P1","width":"C1","depth":5.2},{"circ":"P1","width":"C2","depth":6.51},{"circ":"P1","width":"R","depth":9.98}]},
  {"pos":"L3 Out","serial":"DA1BFANH05098D","pressure":114,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":10.22},{"circ":"P1","width":"C1","depth":6.38},{"circ":"P1","width":"C2","depth":7.03},{"circ":"P1","width":"R","depth":10.29}]},
  {"pos":"R1","serial":"DA12510H11573D","pressure":95.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.47},{"circ":"P1","width":"C1","depth":13.32},{"circ":"P1","width":"C2","depth":15},{"circ":"P1","width":"R","depth":14.47}]},
  {"pos":"R2 In","serial":"DA1BFANH04816D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.13},{"circ":"P1","width":"C1","depth":7.15},{"circ":"P1","width":"C2","depth":7.89},{"circ":"P1","width":"R","depth":11.4}]},
  {"pos":"R2 Out","serial":"DA1BFBPH02474D","pressure":118,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":10.41},{"circ":"P1","width":"C1","depth":5.24},{"circ":"P1","width":"C2","depth":4.37},{"circ":"P1","width":"R","depth":9.82}]},
  {"pos":"R3 In","serial":"DA12511H03161D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.77},{"circ":"P1","width":"C1","depth":5.64},{"circ":"P1","width":"C2","depth":7.24},{"circ":"P1","width":"R","depth":10.5}]},
  {"pos":"R3 Out","serial":"DA1BFANH07566D","pressure":103,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.98},{"circ":"P1","width":"C1","depth":7.83},{"circ":"P1","width":"C2","depth":7.06},{"circ":"P1","width":"R","depth":11.44}]}
]'::jsonb);
-- CH 835 · 2026-08-23 · 10 포지션
select public.save_inspection_round_with_points(
  '835', '2026-08-23'::date, 18478.3, 676474.8, null,
  '[
  {"pos":"L1","serial":"DA1BFANH04820D","pressure":93,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":13.57},{"circ":"P1","width":"C1","depth":14.07},{"circ":"P1","width":"C2","depth":16.62},{"circ":"P1","width":"R","depth":15.31}]},
  {"pos":"L2 In","serial":"DA1BFANH07686D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN KIRI DAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":0},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":2.92}]},
  {"pos":"L2 Out","serial":"DA12510H11571D","pressure":100,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN KANAN DAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":2.25},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":0}]},
  {"pos":"L3 In","serial":"DA1BFANH04849D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.96},{"circ":"P1","width":"C1","depth":3.75},{"circ":"P1","width":"C2","depth":3.94},{"circ":"P1","width":"R","depth":8.68}]},
  {"pos":"L3 Out","serial":"DA1BFANH05098D","pressure":109,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.5},{"circ":"P1","width":"C1","depth":3.86},{"circ":"P1","width":"C2","depth":4.72},{"circ":"P1","width":"R","depth":9.29}]},
  {"pos":"R1","serial":"DA12510H11573D","pressure":95,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.12},{"circ":"P1","width":"C1","depth":10.03},{"circ":"P1","width":"C2","depth":14.14},{"circ":"P1","width":"R","depth":12.75}]},
  {"pos":"R2 In","serial":"DA1BFANH04816D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.38},{"circ":"P1","width":"C1","depth":3.39},{"circ":"P1","width":"C2","depth":3.85},{"circ":"P1","width":"R","depth":8.74}]},
  {"pos":"R2 Out","serial":"DA1BFBPH02474D","pressure":117,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":10.26},{"circ":"P1","width":"C1","depth":4.58},{"circ":"P1","width":"C2","depth":3.47},{"circ":"P1","width":"R","depth":8.82}]},
  {"pos":"R3 In","serial":"DA12511H03161D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.38},{"circ":"P1","width":"C1","depth":3.92},{"circ":"P1","width":"C2","depth":4.4},{"circ":"P1","width":"R","depth":9.32}]},
  {"pos":"R3 Out","serial":"DA1BFANH07566D","pressure":102,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":8.97},{"circ":"P1","width":"C1","depth":5.22},{"circ":"P1","width":"C2","depth":4.09},{"circ":"P1","width":"R","depth":7.63}]}
]'::jsonb);
-- CH 849 · 2026-08-09 · 10 포지션
select public.save_inspection_round_with_points(
  '849', '2026-08-09'::date, 2876.4, 0, null,
  '[
  {"pos":"L1","serial":"DA1BFANH10245D","pressure":85.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":18.32},{"circ":"P1","width":"C1","depth":17.65},{"circ":"P1","width":"C2","depth":16.46},{"circ":"P1","width":"R","depth":12.78}]},
  {"pos":"L2 In","serial":"DA12511H03128D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.32},{"circ":"P1","width":"C1","depth":1.7},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":4.67}]},
  {"pos":"L2 Out","serial":"DA1BFANH05097D","pressure":103,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":10.27},{"circ":"P1","width":"C1","depth":6.23},{"circ":"P1","width":"C2","depth":5.55},{"circ":"P1","width":"R","depth":10.02}]},
  {"pos":"L3 In","serial":"DA12511H03157D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":9.2},{"circ":"P1","width":"C1","depth":3.58},{"circ":"P1","width":"C2","depth":2.91},{"circ":"P1","width":"R","depth":7.5}]},
  {"pos":"L3 Out","serial":"DA12511H03029D","pressure":114,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.21},{"circ":"P1","width":"C1","depth":2.58},{"circ":"P1","width":"C2","depth":2.94},{"circ":"P1","width":"R","depth":8.51}]},
  {"pos":"R1","serial":"DA1BFBPH02475D","pressure":86,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":3.81},{"circ":"P1","width":"C1","depth":8.16},{"circ":"P1","width":"C2","depth":12.5},{"circ":"P1","width":"R","depth":12.93}]},
  {"pos":"R2 In","serial":"DA12511H02913D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":6.08},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":2.85},{"circ":"P1","width":"R","depth":7.74}]},
  {"pos":"R2 Out","serial":"DA12511H02832D","pressure":108,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":11.13},{"circ":"P1","width":"C1","depth":5.7},{"circ":"P1","width":"C2","depth":5.84},{"circ":"P1","width":"R","depth":10.87}]},
  {"pos":"R3 In","serial":"DA12510H09948D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.11},{"circ":"P1","width":"C1","depth":10.29},{"circ":"P1","width":"C2","depth":10.65},{"circ":"P1","width":"R","depth":14.37}]},
  {"pos":"R3 Out","serial":"DA12511H03160D","pressure":107,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.98},{"circ":"P1","width":"C1","depth":7.83},{"circ":"P1","width":"C2","depth":7.06},{"circ":"P1","width":"R","depth":11.44}]}
]'::jsonb);
-- CH 849 · 2026-08-23 · 10 포지션
select public.save_inspection_round_with_points(
  '849', '2026-08-23'::date, 3172.5, 0, null,
  '[
  {"pos":"L1","serial":"DA1BFANH10245D","pressure":84.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":17.51},{"circ":"P1","width":"C1","depth":16.33},{"circ":"P1","width":"C2","depth":16.58},{"circ":"P1","width":"R","depth":13.89}]},
  {"pos":"L2 In","serial":"DA12511H03128D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH MULAI GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":6.92},{"circ":"P1","width":"C1","depth":1.88},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":6.95}]},
  {"pos":"L2 Out","serial":"DA1BFANH05097D","pressure":102,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":6.7},{"circ":"P1","width":"C1","depth":1.84},{"circ":"P1","width":"C2","depth":2.46},{"circ":"P1","width":"R","depth":8}]},
  {"pos":"L3 In","serial":"DA12511H03157D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":7.2},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":6.32}]},
  {"pos":"L3 Out","serial":"DA12511H03029D","pressure":112,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":4.79},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":6.66}]},
  {"pos":"R1","serial":"DA1BFBPH02475D","pressure":83.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN KIRI MULAI GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":0},{"circ":"P1","width":"C1","depth":3.19},{"circ":"P1","width":"C2","depth":8.85},{"circ":"P1","width":"R","depth":7.61}]},
  {"pos":"R2 In","serial":"DA12511H02913D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":"TEMUAN: | PADA TELAPAK BAGIAN TENGAH SUDAH GUNDUL | TINDAK LANJUT: | -","points":[{"circ":"P1","width":"L","depth":3.75},{"circ":"P1","width":"C1","depth":0},{"circ":"P1","width":"C2","depth":0},{"circ":"P1","width":"R","depth":7.09}]},
  {"pos":"R2 Out","serial":"DA12511H02832D","pressure":103,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":9.62},{"circ":"P1","width":"C1","depth":3.85},{"circ":"P1","width":"C2","depth":2.83},{"circ":"P1","width":"R","depth":8.2}]},
  {"pos":"R3 In","serial":"DA12510H09948D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":9.52},{"circ":"P1","width":"C1","depth":6.23},{"circ":"P1","width":"C2","depth":6.76},{"circ":"P1","width":"R","depth":10.86}]},
  {"pos":"R3 Out","serial":"DA12511H03160D","pressure":103,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":7.61},{"circ":"P1","width":"C1","depth":3.1},{"circ":"P1","width":"C2","depth":3.02},{"circ":"P1","width":"R","depth":7.18}]}
]'::jsonb);
-- CH 824 · 2026-08-09 · 10 포지션
select public.save_inspection_round_with_points(
  '824', '2026-08-09'::date, 6562.1, 658258.1, null,
  '[
  {"pos":"L1","serial":"DA1BFBPH02436D","pressure":87,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":21.37},{"circ":"P1","width":"C1","depth":19.38},{"circ":"P1","width":"C2","depth":20.4},{"circ":"P1","width":"R","depth":20.19}]},
  {"pos":"L2 In","serial":"DA1BFANH04824D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.23},{"circ":"P1","width":"C1","depth":11.84},{"circ":"P1","width":"C2","depth":12.43},{"circ":"P1","width":"R","depth":14.34}]},
  {"pos":"L2 Out","serial":"DA1BFANH07617D","pressure":113,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.71},{"circ":"P1","width":"C1","depth":11.71},{"circ":"P1","width":"C2","depth":12.33},{"circ":"P1","width":"R","depth":15.73}]},
  {"pos":"L3 In","serial":"DA12511H03026D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.56},{"circ":"P1","width":"C1","depth":10.07},{"circ":"P1","width":"C2","depth":11.19},{"circ":"P1","width":"R","depth":13.47}]},
  {"pos":"L3 Out","serial":"DA12511H02816D","pressure":114,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.4},{"circ":"P1","width":"C1","depth":12.1},{"circ":"P1","width":"C2","depth":13.21},{"circ":"P1","width":"R","depth":15.93}]},
  {"pos":"R1","serial":"DA12510H11572D","pressure":95.5,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":19.06},{"circ":"P1","width":"C1","depth":18.86},{"circ":"P1","width":"C2","depth":19.88},{"circ":"P1","width":"R","depth":19.63}]},
  {"pos":"R2 In","serial":"DA1BFANH04813D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.33},{"circ":"P1","width":"C1","depth":13.08},{"circ":"P1","width":"C2","depth":13.7},{"circ":"P1","width":"R","depth":18.14}]},
  {"pos":"R2 Out","serial":"DA1BFANH05054D","pressure":102,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.73},{"circ":"P1","width":"C1","depth":12.32},{"circ":"P1","width":"C2","depth":12.87},{"circ":"P1","width":"R","depth":15.36}]},
  {"pos":"R3 In","serial":"DA1BFANH04848D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.52},{"circ":"P1","width":"C1","depth":11.34},{"circ":"P1","width":"C2","depth":13.28},{"circ":"P1","width":"R","depth":15.84}]},
  {"pos":"R3 Out","serial":"DA12511H03130D","pressure":117,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.94},{"circ":"P1","width":"C1","depth":9.97},{"circ":"P1","width":"C2","depth":10.57},{"circ":"P1","width":"R","depth":14.6}]}
]'::jsonb);
-- CH 824 · 2026-08-23 · 10 포지션
select public.save_inspection_round_with_points(
  '824', '2026-08-23'::date, 6834.6, 664317.3, null,
  '[
  {"pos":"L1","serial":"DA1BFBPH02436D","pressure":88,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.83},{"circ":"P1","width":"C1","depth":16.71},{"circ":"P1","width":"C2","depth":17.11},{"circ":"P1","width":"R","depth":16.44}]},
  {"pos":"L2 In","serial":"DA1BFANH04824D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":13.55},{"circ":"P1","width":"C1","depth":8.39},{"circ":"P1","width":"C2","depth":8.32},{"circ":"P1","width":"R","depth":11.59}]},
  {"pos":"L2 Out","serial":"DA1BFANH07617D","pressure":115,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.93},{"circ":"P1","width":"C1","depth":9.84},{"circ":"P1","width":"C2","depth":9.99},{"circ":"P1","width":"R","depth":12.98}]},
  {"pos":"L3 In","serial":"DA12511H03026D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.69},{"circ":"P1","width":"C1","depth":7.61},{"circ":"P1","width":"C2","depth":7.44},{"circ":"P1","width":"R","depth":11.16}]},
  {"pos":"L3 Out","serial":"DA12511H02816D","pressure":116,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.99},{"circ":"P1","width":"C1","depth":10.21},{"circ":"P1","width":"C2","depth":10.38},{"circ":"P1","width":"R","depth":14.26}]},
  {"pos":"R1","serial":"DA12510H11572D","pressure":95,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.83},{"circ":"P1","width":"C1","depth":17.53},{"circ":"P1","width":"C2","depth":18.41},{"circ":"P1","width":"R","depth":18.21}]},
  {"pos":"R2 In","serial":"DA1BFANH04813D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.07},{"circ":"P1","width":"C1","depth":11.9},{"circ":"P1","width":"C2","depth":11.91},{"circ":"P1","width":"R","depth":15.2}]},
  {"pos":"R2 Out","serial":"DA1BFANH05054D","pressure":101,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.42},{"circ":"P1","width":"C1","depth":10.27},{"circ":"P1","width":"C2","depth":10.65},{"circ":"P1","width":"R","depth":13.77}]},
  {"pos":"R3 In","serial":"DA1BFANH04848D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":13},{"circ":"P1","width":"C1","depth":9.07},{"circ":"P1","width":"C2","depth":10.05},{"circ":"P1","width":"R","depth":14.57}]},
  {"pos":"R3 Out","serial":"DA12511H03130D","pressure":115,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.95},{"circ":"P1","width":"C1","depth":7.58},{"circ":"P1","width":"C2","depth":8.21},{"circ":"P1","width":"R","depth":12.08}]}
]'::jsonb);
-- CH 847 · 2026-08-09 · 10 포지션
select public.save_inspection_round_with_points(
  '847', '2026-08-09'::date, 2748.8, 141766.6, null,
  '[
  {"pos":"L1","serial":"DA1BFANH10236D","pressure":94,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":20.81},{"circ":"P1","width":"C1","depth":19.67},{"circ":"P1","width":"C2","depth":19.92},{"circ":"P1","width":"R","depth":19.75}]},
  {"pos":"L2 In","serial":"DA1BFANH05092D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.84},{"circ":"P1","width":"C1","depth":12.91},{"circ":"P1","width":"C2","depth":13.81},{"circ":"P1","width":"R","depth":15.74}]},
  {"pos":"L2 Out","serial":"DA12511H02817D","pressure":116,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.68},{"circ":"P1","width":"C1","depth":11.82},{"circ":"P1","width":"C2","depth":12.6},{"circ":"P1","width":"R","depth":15.54}]},
  {"pos":"L3 In","serial":"DA12510H09949D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.74},{"circ":"P1","width":"C1","depth":12.59},{"circ":"P1","width":"C2","depth":13.23},{"circ":"P1","width":"R","depth":15.12}]},
  {"pos":"L3 Out","serial":"DA1BFANH04825D","pressure":117,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.58},{"circ":"P1","width":"C1","depth":12.68},{"circ":"P1","width":"C2","depth":14.34},{"circ":"P1","width":"R","depth":15.88}]},
  {"pos":"R1","serial":"DA1BFANH05040D","pressure":93,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":17.63},{"circ":"P1","width":"C1","depth":18.49},{"circ":"P1","width":"C2","depth":19.62},{"circ":"P1","width":"R","depth":18.94}]},
  {"pos":"R2 In","serial":"DA12511H03158D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.41},{"circ":"P1","width":"C1","depth":11.06},{"circ":"P1","width":"C2","depth":12.23},{"circ":"P1","width":"R","depth":16.26}]},
  {"pos":"R2 Out","serial":"DA1BFANH07614D","pressure":110,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":18.33},{"circ":"P1","width":"C1","depth":13.68},{"circ":"P1","width":"C2","depth":14.86},{"circ":"P1","width":"R","depth":18.65}]},
  {"pos":"R3 In","serial":"DA12511H03156D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.72},{"circ":"P1","width":"C1","depth":12.72},{"circ":"P1","width":"C2","depth":14.33},{"circ":"P1","width":"R","depth":17.24}]},
  {"pos":"R3 Out","serial":"DA12511H02830D","pressure":113,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":18.22},{"circ":"P1","width":"C1","depth":13.21},{"circ":"P1","width":"C2","depth":12.42},{"circ":"P1","width":"R","depth":15.39}]}
]'::jsonb);
-- CH 847 · 2026-08-23 · 10 포지션
select public.save_inspection_round_with_points(
  '847', '2026-08-23'::date, 3011.3, 147268, null,
  '[
  {"pos":"L1","serial":"DA1BFANH10236D","pressure":95,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":20.59},{"circ":"P1","width":"C1","depth":18.85},{"circ":"P1","width":"C2","depth":18.97},{"circ":"P1","width":"R","depth":19.27}]},
  {"pos":"L2 In","serial":"DA1BFANH05092D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.86},{"circ":"P1","width":"C1","depth":10.08},{"circ":"P1","width":"C2","depth":10.12},{"circ":"P1","width":"R","depth":11.66}]},
  {"pos":"L2 Out","serial":"DA12511H02817D","pressure":118,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.49},{"circ":"P1","width":"C1","depth":11.07},{"circ":"P1","width":"C2","depth":11.41},{"circ":"P1","width":"R","depth":14.42}]},
  {"pos":"L3 In","serial":"DA12510H09949D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":15.38},{"circ":"P1","width":"C1","depth":10.65},{"circ":"P1","width":"C2","depth":10.01},{"circ":"P1","width":"R","depth":12.9}]},
  {"pos":"L3 Out","serial":"DA1BFANH04825D","pressure":120,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.28},{"circ":"P1","width":"C1","depth":10.76},{"circ":"P1","width":"C2","depth":12.54},{"circ":"P1","width":"R","depth":14.74}]},
  {"pos":"R1","serial":"DA1BFANH05040D","pressure":94,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":18.1},{"circ":"P1","width":"C1","depth":18.29},{"circ":"P1","width":"C2","depth":19.09},{"circ":"P1","width":"R","depth":19.01}]},
  {"pos":"R2 In","serial":"DA12511H03158D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":12.34},{"circ":"P1","width":"C1","depth":8.65},{"circ":"P1","width":"C2","depth":10.18},{"circ":"P1","width":"R","depth":13.95}]},
  {"pos":"R2 Out","serial":"DA1BFANH07614D","pressure":110,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.03},{"circ":"P1","width":"C1","depth":11.57},{"circ":"P1","width":"C2","depth":11.77},{"circ":"P1","width":"R","depth":15.9}]},
  {"pos":"R3 In","serial":"DA12511H03156D","pressure":null,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":14.25},{"circ":"P1","width":"C1","depth":10.93},{"circ":"P1","width":"C2","depth":12},{"circ":"P1","width":"R","depth":15.12}]},
  {"pos":"R3 Out","serial":"DA12511H02830D","pressure":114,"tread_status":"measured","flag":"OK","flag_note":null,"remark":null,"points":[{"circ":"P1","width":"L","depth":16.14},{"circ":"P1","width":"C1","depth":11.76},{"circ":"P1","width":"C2","depth":10.61},{"circ":"P1","width":"R","depth":14.04}]}
]'::jsonb);

-- ============================================================
-- ROLLBACK:
--   -- inspections / replacements 는 DELETE 금지. 소프트 삭제만 사용한다.
--   update public.inspections set deleted_at = now()
--    where inspection_date in ('2026-08-09', '2026-08-23') and deleted_at is null;
--   update public.tread_points t set deleted_at = now()
--     from public.inspections i
--    where i.id = t.inspection_id
--      and i.inspection_date in ('2026-08-09', '2026-08-23') and t.deleted_at is null;
--   update public.replacements set deleted_at = now()
--    where date between '2026-07-28' and '2026-08-12' and deleted_at is null;
-- ============================================================

