-- ============================================================
-- C-1. tread_points — 트레드 원시 측정값 원본 테이블 (작업지시서 v3 §C-1)
--
-- 현장은 타이어 1본당 폭 방향 4점(KIRI/TENGAH1/TENGAH2/KANAN)을 측정한다.
-- 기존 구조는 최소값 1개만 inspections.tread 에 저장하고 3개를 버렸다.
-- 이 테이블이 원시값의 정본이 되고, inspections.tread* 는 파생 캐시로 강등된다.
--
-- Long format: 1 점검 × 원주위치(circ_pos) × 폭위치(width_pos) = 1행.
-- 폭 4점 기본, 원주 4점(16점) 확장 시에도 스키마 변경 불필요.
--
-- 방향 확정 규약 (2026-08-26, 임원 확인 · v3 §0.2):
--   L = Kiri  = 차량 외측(Luar/outboard)  · Shoulder
--   C1/C2 = Tengah 1/2 = 중앙            · Center
--   R = Kanan = 차량 내측(Dalam/inboard)  · Shoulder
-- 차량 좌우 어느 쪽 휠이든 동일 적용. 뒤집기 금지 (§3).
-- ============================================================

create table if not exists public.tread_points (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.inspections(id),
  circ_pos       text not null default 'P1'
                   constraint tread_points_circ_pos_chk
                   check (circ_pos in ('P1','P2','P3','P4')),
  width_pos      text not null
                   constraint tread_points_width_pos_chk
                   check (width_pos in ('L','C1','C2','R')),
  depth_mm       numeric(5,2) not null
                   constraint tread_points_depth_range_chk
                   check (depth_mm >= 0 and depth_mm <= 60),
  flag           text not null default 'OK'
                   constraint tread_points_flag_chk
                   check (flag in ('OK','CHECK','OUTLIER','DAMAGE',
                                   'PRESSURE','LOAD','POSITION','OTHER')),
  flag_note      text,
  measured_by    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  created_by_email  text,
  updated_by_email  text,
  deleted_at        timestamptz,
  unique (inspection_id, circ_pos, width_pos)
);

create index if not exists tread_points_inspection_idx
  on public.tread_points (inspection_id) where deleted_at is null;

comment on table  public.tread_points is
  '트레드 원시 측정값. 1 점검 × 원주위치 × 폭위치 = 1행. 폭 4점 기본, 원주 4점 확장 가능. 정본 — inspections.tread* 는 파생 캐시.';
comment on column public.tread_points.width_pos is
  'L=Kiri=차량 외측(Luar) / C1=Tengah 1 / C2=Tengah 2 / R=Kanan=차량 내측(Dalam). 2026-08-26 확정 규약. 현장 기록지 순서와 동일.';
comment on column public.tread_points.circ_pos is
  '원주 방향 P1=0° P2=90° P3=180° P4=270°. 폭 4점만 측정 시 전부 P1.';
comment on column public.tread_points.flag is
  '설계서 §15. OUTLIER 는 통계 산출에서 제외되되 행은 보존된다. OUTLIER 지정 시 flag_note 필수(운영 규칙).';
comment on column public.tread_points.deleted_at is
  '소프트 삭제. 입력 오류 정정은 deleted_at 세팅 + 신규 행 추가. 하드 DELETE 는 화면에서 호출하지 않는다.';

-- RLS (v1 규약 동일 — 이 리포의 역할명은 staff/admin. 0007_rls_role_based.sql 참조)
alter table public.tread_points enable row level security;
drop policy if exists "tread_points read"         on public.tread_points;
drop policy if exists "tread_points write insert" on public.tread_points;
drop policy if exists "tread_points write update" on public.tread_points;
drop policy if exists "tread_points write delete" on public.tread_points;
create policy "tread_points read" on public.tread_points
  for select using (true);
create policy "tread_points write insert" on public.tread_points
  for insert to authenticated with check (public.app_role() in ('staff','admin'));
create policy "tread_points write update" on public.tread_points
  for update to authenticated using (public.app_role() in ('staff','admin'))
  with check (public.app_role() in ('staff','admin'));
-- 하드 DELETE 는 admin 한정. 화면은 소프트 삭제(deleted_at)만 사용한다.
create policy "tread_points write delete" on public.tread_points
  for delete to authenticated using (public.app_role() = 'admin');

grant select on public.tread_points to anon, authenticated;
grant insert, update, delete on public.tread_points to authenticated;

-- 감사 트리거 (v1 §1.3 패턴)
drop trigger if exists trg_tread_points_audit      on public.tread_points;
drop trigger if exists trg_tread_points_updated_at on public.tread_points;
drop trigger if exists trg_tread_points_log        on public.tread_points;

create trigger trg_tread_points_audit      before insert or update on public.tread_points
  for each row execute function public.set_audit_fields();
create trigger trg_tread_points_updated_at before update on public.tread_points
  for each row execute function public.set_updated_at();
create trigger trg_tread_points_log        after insert or update or delete on public.tread_points
  for each row execute function public.log_audit('id');

-- ROLLBACK:
--   drop table if exists public.tread_points;
