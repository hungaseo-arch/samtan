-- t106 · WO-TMS-2026-11-LIFE-KM — 최초 장착분 시작점 추론 · 수명 종료 기준 · 센터 0 WARN
--   20261104100000_v_tire_ledger_first_mount
--   20261104110000_tire_config_life_end_basis
--   20261104120000_dq_zero_tread_center_warn
--
-- 픽스처는 가짜 차량 T106A · T106B 에만 넣고 rollback 한다 (실데이터와 섞이지 않는다).
--   T106A 회차: 04-02 10,000 km / 100 h · 04-16 15,000 · 05-01 20,000 / 300 h · 06-01 35,000
--   L1     NEWA  04-02 22.0 신품 → 05-01 중앙 0(숄더 잔존) → 05-20 교체(km_at 30,000)
--   R1     USEDB 04-02 18.0 중고 → NO_KM 유지 (진짜 하한값)
--   L2 Out NOROUND 측정 회차 없음 → NO_KM 유지
--   T106B  L1 NEWK 04-02 22.0 이지만 차량 km 기록 없음(CH 849 형) → NO_KM 유지
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ── 픽스처 ────────────────────────────────────────────────
insert into public.tire_config (id, new_tread) values (1, 22)
  on conflict (id) do nothing;

insert into public.vehicles (ch) values ('T106A'), ('T106B');
insert into public.vehicle_positions (ch, pos, serial) values
  ('T106A', 'L1', 'NEWA'), ('T106A', 'R1', 'USEDB'), ('T106A', 'L2 Out', 'NOROUND'),
  ('T106B', 'L1', 'NEWK');

-- 점검 행 + 4점 (트리거가 tread·tread_avg 를 다시 쓴다)
create temp table _r (ch text, pos text, d date, serial text, km numeric, hm numeric,
                      l numeric, c1 numeric, c2 numeric, r numeric) on commit drop;
insert into _r values
  ('T106A', 'L1', '2026-04-02', 'NEWA', 10000, 100, 22, 22, 22, 22),
  ('T106A', 'L1', '2026-04-16', 'NEWA', 15000, null, 12, 8, 8, 12),
  ('T106A', 'L1', '2026-05-01', 'NEWA', 20000, 300, 5, 0, 0, 4),
  ('T106A', 'R1', '2026-04-02', 'USEDB', 10000, 100, 18, 18, 18, 18),
  ('T106A', 'R1', '2026-05-01', 'USEDB', 20000, 300, 0, 0, 0, 3),
  ('T106A', 'L2 Out', '2026-06-01', null, 35000, null, null, null, null, null),
  ('T106B', 'L1', '2026-04-02', 'NEWK', null, null, 22, 22, 22, 22),
  ('T106B', 'L1', '2026-05-01', 'NEWK', null, null, 10, 10, 10, 10);

insert into public.inspections (ch, pos, inspection_date, serial, km, hm, tread_status)
select ch, pos, d, serial, km, hm, 'measured' from _r;

insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm)
select i.id, 'P1', w.k, w.v
  from _r
  join public.inspections i on i.ch = _r.ch and i.pos = _r.pos and i.inspection_date = _r.d
  cross join lateral (values ('L', _r.l), ('C1', _r.c1), ('C2', _r.c2), ('R', _r.r)) w(k, v)
 where w.v is not null;

insert into public.replacements (ch, pos, date, new_serial, km_at)
values ('T106A', 'L1', '2026-05-20', 'NEWD', 30000);

-- ── T-1 v_tire_ledger ─────────────────────────────────────
select is((select km_method from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          'FIRST_NEW_INSPECTION', '신품 첫 측정 seq 0 → km_method FIRST_NEW_INSPECTION');
select is((select km_start from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          10000::numeric, 'km_start = 첫 신품 회차 차량 km');
select is((select km_end from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          30000::numeric, 'km_end = 교체 km_at (끝 경계 규칙 종전 그대로)');
select is((select segment_km from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          20000::numeric, 'segment_km = 30,000 − 10,000 (중앙 0 회차 포함 전 구간)');
select is((select km_flag from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          'OK', '추론 구간 km_flag = OK');
select is((select hm_start from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          100::numeric, 'hm_start = 첫 신품 회차 차량 hm');
select ok((select mounted_at is null from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          'mounted_at 원값(NULL) 유지 — 덮어쓰지 않는다');
select is((select mounted_at_effective from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          '2026-04-02'::date, 'mounted_at_effective = 첫 신품 회차 일자');
select ok((select start_inferred from public.v_tire_ledger where serial = 'NEWA' and seq_no = 0),
          'start_inferred = true');

select is((select km_flag from public.v_tire_ledger where serial = 'USEDB'),
          'NO_KM', '첫 측정 18 mm(중고) → NO_KM 유지');
select ok((select km_method is null and not start_inferred and mounted_at_effective is null
             from public.v_tire_ledger where serial = 'USEDB'),
          '중고: km_method NULL · start_inferred false · mounted_at_effective NULL');
select is((select km_flag from public.v_tire_ledger where serial = 'NOROUND'),
          'NO_KM', '측정 회차 없음 → NO_KM 유지');
select is((select km_flag from public.v_tire_ledger where serial = 'NEWK'),
          'NO_KM', '신품이지만 차량 km 기록 없음 → NO_KM 유지');

select is((select invalid_segments from public.v_tire_ledger_total where serial = 'NEWA'),
          0::bigint, 'v_tire_ledger_total.invalid_segments 0 (본문 변경 없이 자동 반영)');
select is((select cumulative_km from public.v_tire_ledger_total where serial = 'NEWA'),
          20000::numeric, 'v_tire_ledger_total.cumulative_km = 20,000');

select ok((select coalesce('security_invoker=on' = any(reloptions), false)
             from pg_class where oid = 'public.v_tire_ledger'::regclass),
          'v_tire_ledger security_invoker 유지');

-- ── T-3 tire_config.life_end_basis ────────────────────────
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'tire_config' and column_name = 'life_end_basis'),
          '''min''::text', 'life_end_basis 기본값 min (승인 전 화면 수치 유지)');
select throws_ok($$ update public.tire_config set life_end_basis = 'shoulder' where id = 1 $$,
                 '23514', null, '폐기된 숄더 기준 값은 check 제약이 막는다');
select lives_ok($$ update public.tire_config set life_end_basis = 'four_zero' where id = 1 $$,
                'four_zero 허용');

-- ── T-4 v_data_quality.zero_tread_unverified ──────────────
select is((select severity from public.v_data_quality
             where check_key = 'zero_tread_unverified' and ch = 'T106A' and pos = 'L1'
               and inspection_date = '2026-05-01'),
          'WARN', '숄더 5·4 잔존 · 센터 0 → WARN');
select is((select severity from public.v_data_quality
             where check_key = 'zero_tread_unverified' and ch = 'T106A' and pos = 'R1'
               and inspection_date = '2026-05-01'),
          'ERROR', '숄더 0 포함 → ERROR 유지');
select ok((select coalesce('security_invoker=on' = any(reloptions), false)
             from pg_class where oid = 'public.v_data_quality'::regclass),
          'v_data_quality security_invoker 재설정');

select * from finish();
rollback;
