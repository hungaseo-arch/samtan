-- t107 · M-9 — W-1 단일 0 OUTLIER 트리거 상시화
--   20261017110000_single_zero_outlier_trigger  (apply_single_zero_outlier · recalc_inspection_tread_stats)
--
-- 규칙: P1 4점이 모두 있고, 0 이 정확히 하나이며, 나머지 셋이 모두 tread_critical 이상
--       → 그 0 점 flag = 'OUTLIER' + flag_note 표식. 규칙이 풀리면 **자동 표식분만** 'OK' 로 복원.
--
-- 픽스처는 가짜 차량 T107A 에만 넣고 rollback 한다 (실데이터와 섞이지 않는다).
--   포지션 1개당 회차 1개 — 회차별 시나리오는 아래 표.
--   L1       단일 0 (0 / 9.4 / 10.1 / 5.6)               ① 자동 OUTLIER · ④ 원값 불변
--   R1       0 두 개 (0 / 0 / 10 / 9)                     ② 아님
--   L2 In    0 하나 + 나머지에 critical 미만 (0 / 2.5 / 10 / 9)   ② 아님
--   L2 Out   3점뿐 (0 / 9 / 10)                           ② 아님 (4점 미만)
--   R2 In    단일 0 → 값 수정 8 로 해제                    ③ 자동분 OK 복원
--   R2 Out   단일 0 + 수동 OUTLIER(C1) → L 값 수정 해제     ③ 수동 OUTLIER 유지
--   L3 In    4점 한 문장씩 따로 입력(단일 0 이 마지막)       ① 입력 순서 무관
--   L3 Out   단일 0 — 트리거 깊이 기록                     ⑤ 재귀 1단
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

-- ── 픽스처 ────────────────────────────────────────────────
insert into public.tire_config (id, new_tread) values (1, 22)
  on conflict (id) do nothing;
update public.tire_config set tread_critical = 3 where id = 1;

insert into public.vehicles (ch) values ('T107A');
insert into public.vehicle_positions (ch, pos, serial) values
  ('T107A', 'L1', 'S107-L1'),   ('T107A', 'R1', 'S107-R1'),     ('T107A', 'L2 In', 'S107-L2I'),
  ('T107A', 'L2 Out', 'S107-L2O'), ('T107A', 'R2 In', 'S107-R2I'), ('T107A', 'R2 Out', 'S107-R2O'),
  ('T107A', 'L3 In', 'S107-L3I'),  ('T107A', 'L3 Out', 'S107-L3O');

-- ⑤ 깊이 기록용 임시 트리거: tread_points UPDATE 가 몇 겹 트리거 안에서 일어났는지
create temp table _depth (pos text, depth int) on commit drop;
create function public.t107_log_depth() returns trigger language plpgsql as $$
begin
  insert into _depth
  select i.pos, pg_trigger_depth() from public.inspections i where i.id = new.inspection_id;
  return null;
end $$;

create temp table _r (pos text, serial text, l numeric, c1 numeric, c2 numeric, r numeric) on commit drop;
insert into _r values
  ('L1',     'S107-L1',  0,   9.4, 10.1, 5.6),
  ('R1',     'S107-R1',  0,   0,   10,   9),
  ('L2 In',  'S107-L2I', 0,   2.5, 10,   9),
  ('L2 Out', 'S107-L2O', 0,   9,   10,   null),
  ('R2 In',  'S107-R2I', 0,   9,   10,   11),
  ('R2 Out', 'S107-R2O', 0,   9,   10,   11),
  ('L3 In',  'S107-L3I', 0,   9,   10,   11);

insert into public.inspections (ch, pos, inspection_date, serial, tread_status)
select 'T107A', pos, '2026-05-01', serial, 'measured' from _r;

-- 4점 한 번에 입력 (L3 In 은 아래에서 따로)
insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm)
select i.id, 'P1', w.k, w.v
  from _r
  join public.inspections i on i.ch = 'T107A' and i.pos = _r.pos and i.inspection_date = '2026-05-01'
  cross join lateral (values ('L', _r.l), ('C1', _r.c1), ('C2', _r.c2), ('R', _r.r)) w(k, v)
 where w.v is not null and _r.pos <> 'L3 In';

-- helper: 포지션 → 점 값 조회
create function public.t107_pt(p_pos text, p_w text, out flag text, out note text, out depth numeric)
language sql stable as $$
  select t.flag, t.flag_note, t.depth_mm
    from public.tread_points t join public.inspections i on i.id = t.inspection_id
   where i.ch = 'T107A' and i.pos = p_pos and t.width_pos = p_w and t.deleted_at is null
$$;

-- ── ① 단일 0 → OUTLIER + 표식 ─────────────────────────────
select is((public.t107_pt('L1', 'L')).flag, 'OUTLIER', '① 단일 0 점(L)이 OUTLIER');
select ok((public.t107_pt('L1', 'L')).note like '%CHK-TMS-2026-10-16-WEB W-1%',
          '① flag_note 에 W-1 표식');
select is((select count(*)::int from public.tread_points t join public.inspections i on i.id = t.inspection_id
            where i.ch = 'T107A' and i.pos = 'L1' and t.flag = 'OUTLIER'),
          1, '① OUTLIER 는 정확히 한 점');
select is((select point_count from public.inspections where ch = 'T107A' and pos = 'L1'),
          3, '① 통계 유효 점 수 3 (이상점 제외)');
select is((select tread from public.inspections where ch = 'T107A' and pos = 'L1'),
          5.6::numeric, '① inspections.tread = 이상점 제외 최소 5.6');
select is((select tread_avg from public.inspections where ch = 'T107A' and pos = 'L1'),
          8.37::numeric, '① tread_avg = (9.4+10.1+5.6)/3 = 8.37');

-- ── ④ depth_mm 원값 불변 ──────────────────────────────────
select is((public.t107_pt('L1', 'L')).depth, 0::numeric, '④ OUTLIER 점 depth_mm 은 0 그대로');
select is(array[(public.t107_pt('L1', 'C1')).depth, (public.t107_pt('L1', 'C2')).depth,
                (public.t107_pt('L1', 'R')).depth],
          array[9.4, 10.1, 5.6]::numeric[], '④ 나머지 세 점 값 불변');
select is(array[(public.t107_pt('L1', 'C1')).flag, (public.t107_pt('L1', 'C2')).flag,
                (public.t107_pt('L1', 'R')).flag],
          array['OK', 'OK', 'OK'], '① 나머지 세 점은 OK 유지');

-- ── ② 0 이 둘 이상 / critical 미만 형제 / 4점 미만 → OUTLIER 아님 ──
select is((select count(*)::int from public.tread_points t join public.inspections i on i.id = t.inspection_id
            where i.ch = 'T107A' and i.pos = 'R1' and t.flag = 'OUTLIER'),
          0, '② 0 두 개 → OUTLIER 없음 (진짜 소진일 수 있음)');
select is((select point_count from public.inspections where ch = 'T107A' and pos = 'R1'),
          4, '② 0 두 개 → 통계 4점 그대로');
select is((select tread from public.inspections where ch = 'T107A' and pos = 'R1'),
          0::numeric, '② 0 두 개 → tread(최소) 0');
select is((select count(*)::int from public.tread_points t join public.inspections i on i.id = t.inspection_id
            where i.ch = 'T107A' and i.pos = 'L2 In' and t.flag = 'OUTLIER'),
          0, '② 0 하나여도 나머지에 critical(3) 미만(2.5)이 있으면 OUTLIER 아님');
select is((select count(*)::int from public.tread_points t join public.inspections i on i.id = t.inspection_id
            where i.ch = 'T107A' and i.pos = 'L2 Out' and t.flag = 'OUTLIER'),
          0, '② 3점뿐인 회차는 OUTLIER 아님');

-- ── ③ 해제: 자동 표식분만 OK 복원 ─────────────────────────
-- R2 In : 단일 0 → 자동 OUTLIER → 값을 8 로 고치면 규칙 해제
select is((public.t107_pt('R2 In', 'L')).flag, 'OUTLIER', '③ 준비: R2 In 단일 0 자동 OUTLIER');
update public.tread_points t set depth_mm = 8
  from public.inspections i
 where i.id = t.inspection_id and i.ch = 'T107A' and i.pos = 'R2 In' and t.width_pos = 'L';
select is((public.t107_pt('R2 In', 'L')).flag, 'OK', '③ 값 수정으로 규칙 해제 → 자동분 OK 복원');
select ok((public.t107_pt('R2 In', 'L')).note is null, '③ 복원 시 flag_note 도 비움');
select is((public.t107_pt('R2 In', 'L')).depth, 8::numeric, '④ 수정한 값 8 은 그대로');
select is((select point_count from public.inspections where ch = 'T107A' and pos = 'R2 In'),
          4, '③ 복원 후 통계 유효 점 수 4');

-- R2 Out : 수동 OUTLIER(C1) 는 해제와 무관하게 유지
update public.tread_points t set flag = 'OUTLIER', flag_note = '현장 수동 판정 — 이물 낌'
  from public.inspections i
 where i.id = t.inspection_id and i.ch = 'T107A' and i.pos = 'R2 Out' and t.width_pos = 'C1';
select is((public.t107_pt('R2 Out', 'L')).flag, 'OUTLIER', '③ 준비: R2 Out 의 0 점은 자동 OUTLIER');
update public.tread_points t set depth_mm = 7
  from public.inspections i
 where i.id = t.inspection_id and i.ch = 'T107A' and i.pos = 'R2 Out' and t.width_pos = 'L';
select is((public.t107_pt('R2 Out', 'L')).flag, 'OK', '③ L 값 수정 → 자동분 OK 복원');
select is((public.t107_pt('R2 Out', 'C1')).flag, 'OUTLIER', '③ 수동 OUTLIER(C1) 는 유지');
select is((public.t107_pt('R2 Out', 'C1')).note, '현장 수동 판정 — 이물 낌', '③ 수동 flag_note 도 그대로');
select is((select point_count from public.inspections where ch = 'T107A' and pos = 'R2 Out'),
          3, '③ 수동 OUTLIER 한 점은 계속 통계 제외 (유효 3점)');

-- ── ① 입력 순서 무관: 한 점씩 따로 입력, 0 이 마지막 ──────────
insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm)
select i.id, 'P1', 'C1', 9 from public.inspections i where i.ch = 'T107A' and i.pos = 'L3 In';
insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm)
select i.id, 'P1', 'C2', 10 from public.inspections i where i.ch = 'T107A' and i.pos = 'L3 In';
insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm)
select i.id, 'P1', 'R', 11 from public.inspections i where i.ch = 'T107A' and i.pos = 'L3 In';
select is((select count(*)::int from public.tread_points t join public.inspections i on i.id = t.inspection_id
            where i.ch = 'T107A' and i.pos = 'L3 In' and t.flag = 'OUTLIER'),
          0, '① 3점까지는 OUTLIER 없음');
insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm)
select i.id, 'P1', 'L', 0 from public.inspections i where i.ch = 'T107A' and i.pos = 'L3 In';
select is((public.t107_pt('L3 In', 'L')).flag, 'OUTLIER', '① 4번째(0) 입력 순간 OUTLIER');

-- ── ⑤ 재귀 1단: 안쪽 update 의 트리거가 규칙을 다시 부르지 않는다 ──
create trigger t107_depth_probe after update on public.tread_points
  for each row execute function public.t107_log_depth();
insert into public.inspections (ch, pos, inspection_date, serial, tread_status)
values ('T107A', 'L3 Out', '2026-05-01', 'S107-L3O', 'measured');
insert into public.tread_points (inspection_id, circ_pos, width_pos, depth_mm)
select i.id, 'P1', w.k, w.v
  from public.inspections i
  cross join (values ('L', 0), ('C1', 9), ('C2', 10), ('R', 11)) w(k, v)
 where i.ch = 'T107A' and i.pos = 'L3 Out';
select is((public.t107_pt('L3 Out', 'L')).flag, 'OUTLIER', '⑤ 입력은 끝까지 완료 (무한 트리거 없음) · 0 점 OUTLIER');
select is((select count(*)::int from _depth where pos = 'L3 Out'),
          1, '⑤ tread_points UPDATE 는 OUTLIER 지정 1회뿐');
select is((select max(depth) from _depth where pos = 'L3 Out'),
          2, '⑤ 그 UPDATE 는 트리거 깊이 2 (바깥 1 + 안쪽 1) — 3 이상 없음');

select * from finish();
rollback;
