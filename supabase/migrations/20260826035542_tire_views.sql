-- ============================================================
-- Samtan TMS — M2. 타이어 조회 뷰 5종
--
-- 근거: 데이터 정합성 개선 작업지시서 v1 §Phase 1 / M2 (항목 2·5·6 의 토대)
--
-- 배경: vehicle_positions 는 serial(최초) + serial2(최신 교체) 2칸뿐이라
--       같은 포지션에서 3본째부터는 이력이 밀려 사라진다
--       (실증: CH 835 L3 Out 의 DA12511H03159D · CH 849 R2 In).
--       이 뷰들이 replacements 를 단일 진실원으로 삼아 2칸 한도를 대체한다.
--
-- serial2 는 삭제하지 않는다. M3 트리거가 계속 동기화하는 캐시 컬럼으로 남고,
-- 프론트만 v_current_tire.serial 로 옮겨 무중단 전환한다 (§2-3).
--
-- 뷰는 전부 security_invoker = on. 호출자의 RLS 를 그대로 적용받아
-- 뷰가 권한 우회로가 되지 않게 한다 (§1.3).
-- 멱등성: create or replace view
-- ============================================================

-- ── (1) v_current_tire — 포지션별 현재 장착 타이어 ─────────
-- serial/serial2 2칸 구조를 대체하는 정본. 70행(=vehicle_positions 활성 행)이 나온다.
create or replace view public.v_current_tire as
select
  vp.ch,
  vp.pos,
  vp.seq,
  coalesce(r.new_serial, vp.serial)      as serial,             -- 현재 장착 시리얼
  vp.serial                              as serial_initial,     -- 최초 장착
  r.new_serial                           as serial_latest_repl, -- 최신 교체분(교체 없으면 NULL)
  r.date                                 as mounted_at,
  coalesce(rc.cnt, 0)::int               as repl_count          -- 교체 횟수(>0 이면 교체이력 있음)
from public.vehicle_positions vp
left join lateral (
  select r2.new_serial, r2.date
    from public.replacements r2
   where r2.ch = vp.ch and r2.pos = vp.pos and r2.deleted_at is null
   order by r2.date desc, r2.created_at desc
   limit 1
) r on true
left join lateral (
  select count(*) as cnt
    from public.replacements r3
   where r3.ch = vp.ch and r3.pos = vp.pos and r3.deleted_at is null
) rc on true
where vp.deleted_at is null;

-- ── (2) v_position_history — 포지션별 전체 시리얼 이력 ─────
-- 최초 장착(seq_no 0) + 교체분(seq_no 1..n). 교체 횟수 제한이 없다.
create or replace view public.v_position_history as
select vp.ch, vp.pos, 0 as seq_no, vp.serial as serial,
       null::date as mounted_at, 'initial'::text as source
  from public.vehicle_positions vp
 where vp.deleted_at is null and vp.serial is not null
union all
select r.ch, r.pos,
       row_number() over (partition by r.ch, r.pos order by r.date, r.created_at)::int,
       r.new_serial, r.date, 'replacement'
  from public.replacements r
 where r.deleted_at is null and r.new_serial is not null;

-- ── (3) v_tire_mount_history — 시리얼별 장착 구간 ──────────
-- 같은 포지션의 다음 장착일이 이 타이어의 탈거일이 된다. 다음이 없으면 현재 장착 중.
create or replace view public.v_tire_mount_history as
select h.serial, h.ch, h.pos, h.seq_no,
       h.mounted_at,
       lead(h.mounted_at) over (partition by h.ch, h.pos order by h.seq_no) as removed_at,
       (lead(h.mounted_at) over (partition by h.ch, h.pos order by h.seq_no) is null) as is_current
  from public.v_position_history h;

-- ── (4) v_tire_detail — 타이어 상세 조회 단일 소스 (항목 5) ─
-- lifetimes 에 없는 시리얼도 행을 반환한다. 프론트의 "결과 없음" 분기가 사라진다.
-- is_registered = false → UI 에 미등록 배지(Belum terdaftar di DB umur ban).
create or replace view public.v_tire_detail as
with sn as (
  select distinct serial from public.v_position_history where serial is not null
  union
  select serial from public.lifetimes where serial is not null
  union
  select serial from public.inspections where serial is not null and deleted_at is null
)
select
  sn.serial,
  (l.no is not null)                       as is_registered,
  l.no                                     as lifetime_no,
  l.install                                as install_date,
  l.scrap                                  as scrap_date,
  l.damage                                 as damage_code,
  l.lifetime                               as lifetime_days,
  coalesce(l.status, case when cur.ch is not null then 'Install' else null end) as status,
  l.note                                   as note,
  cur.ch                                   as current_ch,
  cur.pos                                  as current_pos,
  cur.mounted_at                           as current_mounted_at,
  ins.first_inspection,
  ins.last_inspection,
  ins.inspection_count,
  ins.last_tread,
  ins.last_pressure
from sn
left join public.lifetimes l on l.serial = sn.serial
left join lateral (
  select m.ch, m.pos, m.mounted_at
    from public.v_tire_mount_history m
   where m.serial = sn.serial and m.is_current
   order by m.mounted_at desc nulls last
   limit 1
) cur on true
left join lateral (
  select min(i.inspection_date) as first_inspection,
         max(i.inspection_date) as last_inspection,
         count(*)::int          as inspection_count,
         (array_agg(i.tread    order by i.inspection_date desc))[1] as last_tread,
         (array_agg(i.pressure order by i.inspection_date desc))[1] as last_pressure
    from public.inspections i
   where i.serial = sn.serial and i.deleted_at is null
) ins on true;

-- ── (5) v_data_integrity — 정합성 감시 (항목 6) ────────────
-- severity: error = 배지를 주황으로 만드는 항목 / warning·info = 펼친 목록에만 표시.
-- install_but_unmounted 를 warning 으로 둔 이유: 현재 2건은 원장 오류로
-- Techking 회신 대기 중인 "정상 상태"라 배지를 빨갛게 만들면 안 된다 (§2-3, §5).
create or replace view public.v_data_integrity as
select 'missing_lifetime'::text as check_key,
       'error'::text            as severity,
       count(*)::int            as cnt,
       coalesce(jsonb_agg(jsonb_build_object('ch',t.ch,'pos',t.pos,'serial',t.serial)), '[]'::jsonb) as detail
  from public.v_current_tire t
 where not exists (select 1 from public.lifetimes l where l.serial = t.serial)
union all
select 'serial2_out_of_sync', 'error', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('ch',t.ch,'pos',t.pos,
              'expected',t.serial,'actual',vp.serial2)), '[]'::jsonb)
  from public.v_current_tire t
  join public.vehicle_positions vp on vp.ch = t.ch and vp.pos = t.pos
 where t.repl_count > 0 and vp.serial2 is distinct from t.serial_latest_repl
union all
-- note 가 채워진 15건은 TMS 미등록 차량(813·838·842·850·852·859) 장착분이라 제외한다 (§5).
select 'install_but_unmounted', 'warning', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('no',l.no,'serial',l.serial)), '[]'::jsonb)
  from public.lifetimes l
 where l.status = 'Install' and l.note is null
   and not exists (select 1 from public.v_current_tire t where t.serial = l.serial)
union all
select 'mounted_but_not_install', 'warning', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('no',l.no,'serial',l.serial,
              'status',l.status,'ch',t.ch,'pos',t.pos)), '[]'::jsonb)
  from public.v_current_tire t
  join public.lifetimes l on l.serial = t.serial
 where l.status is distinct from 'Install'
union all
select 'position_over_2_serials', 'info', count(*)::int,
       coalesce(jsonb_agg(jsonb_build_object('ch',t.ch,'pos',t.pos,'repl_count',t.repl_count)), '[]'::jsonb)
  from public.v_current_tire t
 where t.repl_count >= 2;

-- ── 권한 ───────────────────────────────────────────────────
alter view public.v_current_tire       set (security_invoker = on);
alter view public.v_position_history   set (security_invoker = on);
alter view public.v_tire_mount_history set (security_invoker = on);
alter view public.v_tire_detail        set (security_invoker = on);
alter view public.v_data_integrity     set (security_invoker = on);

grant select on public.v_current_tire, public.v_position_history,
                public.v_tire_mount_history, public.v_tire_detail,
                public.v_data_integrity
   to anon, authenticated;

-- ============================================================
-- ROLLBACK:
--   drop view if exists public.v_data_integrity;
--   drop view if exists public.v_tire_detail;
--   drop view if exists public.v_tire_mount_history;   -- v_position_history 에 의존
--   drop view if exists public.v_position_history;
--   drop view if exists public.v_current_tire;
--   ※ M3 의 retire_previous_tire() 가 v_current_tire 를 읽는다.
--     이 마이그레이션을 되돌리기 전에 M3 를 먼저 되돌릴 것.
-- ============================================================
