-- ============================================================
-- Samtan TMS — T-102 제약조건 회귀 테스트 (pgTAP)
--
-- 실행: supabase test db
-- 전체를 트랜잭션으로 감싸고 마지막에 rollback 하므로 로컬 DB 상태를 바꾸지 않습니다.
-- ============================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- ── 구조 확인 ──────────────────────────────────────────────
select has_index('public', 'inspections', 'inspections_ch_date_pos_uniq',
  '(ch, inspection_date, pos) 유니크 인덱스가 존재한다 — 부록 A 의 uq_inspection 역할');
select has_index('public', 'inspections', 'idx_insp_serial',
  'serial 조회 인덱스가 존재한다');
select has_index('public', 'inspections', 'idx_insp_date',
  'inspection_date 조회 인덱스가 존재한다');
select col_is_fk('public', 'inspections', array['ch', 'pos'],
  'inspections (ch, pos) 는 외래키다');
select col_is_fk('public', 'replacements', array['ch', 'pos'],
  'replacements (ch, pos) 는 외래키다');

-- ── 픽스처 ────────────────────────────────────────────────
insert into public.vehicles (ch, seq, hm_reset) values ('T99', 99, false);
insert into public.vehicle_positions (ch, pos, serial, seq)
  values ('T99', 'L1', 'TESTSERIAL0001', 1);

insert into public.inspections (ch, inspection_date, pos, pressure, tread, hm, km)
  values ('T99', date '2026-01-01', 'L1', 100, 22, 1000, 5000);

-- ── UNIQUE (ch, inspection_date, pos) ──────────────────────
select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, pressure)
    values ('T99', date '2026-01-01', 'L1', 105)$$,
  '23505',
  null,
  '동일 (ch, date, pos) 재삽입은 UNIQUE 위반으로 차단된다');

select lives_ok(
  $$insert into public.inspections (ch, inspection_date, pos, pressure)
    values ('T99', date '2026-01-02', 'L1', 105)$$,
  '날짜가 다르면 삽입된다');

select lives_ok(
  $$insert into public.vehicle_positions (ch, pos, seq) values ('T99', 'R1', 2);
    insert into public.inspections (ch, inspection_date, pos, pressure)
    values ('T99', date '2026-01-01', 'R1', 105)$$,
  '포지션이 다르면 같은 날짜에도 삽입된다');

-- ── CHECK ck_pressure ──────────────────────────────────────
-- 13 psi 는 T-002 에서 적출된 실제 오타값입니다 (T-101 에서 120 으로 정정).
select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, pressure)
    values ('T99', date '2026-02-01', 'L1', 13)$$,
  '23514',
  null,
  'pressure = 13 은 CHECK 위반으로 차단된다');

select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, pressure)
    values ('T99', date '2026-02-02', 'L1', 250)$$,
  '23514',
  null,
  'pressure = 250 은 CHECK 위반으로 차단된다');

select lives_ok(
  $$insert into public.inspections (ch, inspection_date, pos, pressure)
    values ('T99', date '2026-02-03', 'L1', null)$$,
  'pressure = NULL(미측정)은 허용된다');

-- ── CHECK ck_tread ─────────────────────────────────────────
select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, tread)
    values ('T99', date '2026-03-01', 'L1', -1)$$,
  '23514',
  null,
  'tread = -1 은 CHECK 위반으로 차단된다');

select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, tread)
    values ('T99', date '2026-03-02', 'L1', 61)$$,
  '23514',
  null,
  'tread = 61 은 CHECK 위반으로 차단된다');

select lives_ok(
  $$insert into public.inspections (ch, inspection_date, pos, tread)
    values ('T99', date '2026-03-03', 'L1', 0)$$,
  'tread = 0(완전 마모)은 허용된다 — 수명 계산의 한계값');

-- ── CHECK ck_meter ─────────────────────────────────────────
select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, hm)
    values ('T99', date '2026-04-01', 'L1', -1)$$,
  '23514',
  null,
  'hm = -1 은 CHECK 위반으로 차단된다');

select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, km)
    values ('T99', date '2026-04-02', 'L1', -1)$$,
  '23514',
  null,
  'km = -1 은 CHECK 위반으로 차단된다');

-- ── FK ─────────────────────────────────────────────────────
select throws_ok(
  $$insert into public.inspections (ch, inspection_date, pos, pressure)
    values ('T99', date '2026-05-01', 'ZZ9', 100)$$,
  '23503',
  null,
  '등록되지 않은 포지션의 점검은 FK 위반으로 차단된다');

select throws_ok(
  $$insert into public.replacements (ch, pos, date, new_serial)
    values ('T99', 'ZZ9', date '2026-05-01', 'X')$$,
  '23503',
  null,
  '등록되지 않은 포지션의 교체 기록은 FK 위반으로 차단된다');

select throws_ok(
  $$delete from public.vehicle_positions where ch = 'T99' and pos = 'L1'$$,
  '23503',
  null,
  '점검 이력이 있는 포지션은 삭제되지 않는다');

select * from finish();
rollback;
