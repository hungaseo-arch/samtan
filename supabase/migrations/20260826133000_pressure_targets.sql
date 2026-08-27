-- ============================================================
-- B-4 · 공기압 목표 이력 테이블
--
-- 지금 권장 공기압은 tire_config 의 rec_psi_steer / rec_psi_drive 단일 값이라
-- 과거 회차를 현재 기준으로 판정한다. 목표압이 바뀐 적이 있으면 과거 점검이
-- 통째로 오판된다.
--
-- 구동축 116 psi 의 effective_from 은 **2026-05-10** 이다 (사용자 결정 2026-08-26).
-- 작업지시서 초안의 2026-06-25 추정치를 쓰면 실측 공기압이 125.0(05-03)에서
-- 114.0(05-10)으로 내려간 시점을 넘겨 4개 회차가 잘못 표시된다.
--
-- ⚠ 미확정 (작업지시서 v3 §C-3, 2026-08-27):
--   현장 원본에 "Since end of June 2026 the pressure set become 116 psi" 라는
--   기재가 있다. 실측 하향 시점(05-10)과 6주 어긋나므로 둘 중 하나다.
--     (a) 05-10 은 시험적 하향, 06월 말에 공식 기준으로 확정된 것
--     (b) 원본 기재가 사후 회고라 날짜가 부정확한 것
--   실측 데이터가 05-10 을 지지하므로 그 값을 유지하되, 공식 시행일이
--   확인되면 **행을 수정하지 말고** effective_from='2026-06-30' 행을 추가한다
--   (이력 테이블의 목적이 그것이다). Bpk. Irawan 확인 대기.
-- ============================================================

create table if not exists public.pressure_targets (
  id              uuid primary key default gen_random_uuid(),
  axle_group      text not null check (axle_group in ('steer','drive')),
  target_psi      numeric not null check (target_psi >= 60 and target_psi <= 200),
  effective_from  date not null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  created_by_email text,
  updated_by_email text,
  deleted_at      timestamptz,
  constraint pressure_targets_group_date_key unique (axle_group, effective_from)
);

comment on table public.pressure_targets is
  '축군별 목표 공기압의 시행일 이력. 점검일 이하 중 가장 최근 행이 그 점검의 목표압이다.';
comment on column public.pressure_targets.axle_group is 'steer = L1·R1 / drive = 나머지 8본';
comment on column public.pressure_targets.effective_from is '이 목표압이 적용되기 시작한 날 (WIB 기준 날짜)';

-- ── RLS: 읽기는 전체, 쓰기는 staff·admin ──────────────────
alter table public.pressure_targets enable row level security;

drop policy if exists "pressure_targets read"         on public.pressure_targets;
drop policy if exists "pressure_targets write insert" on public.pressure_targets;
drop policy if exists "pressure_targets write update" on public.pressure_targets;
drop policy if exists "pressure_targets write delete" on public.pressure_targets;

create policy "pressure_targets read" on public.pressure_targets
  for select to anon, authenticated using (true);
create policy "pressure_targets write insert" on public.pressure_targets
  for insert to authenticated with check (public.app_role() in ('staff','admin'));
create policy "pressure_targets write update" on public.pressure_targets
  for update to authenticated using (public.app_role() in ('staff','admin'))
  with check (public.app_role() in ('staff','admin'));
create policy "pressure_targets write delete" on public.pressure_targets
  for delete to authenticated using (public.app_role() = 'admin');

grant select on public.pressure_targets to anon, authenticated;
grant insert, update, delete on public.pressure_targets to authenticated;

-- ── 감사 트리거 (t103 헬퍼 재사용) ─────────────────────────
drop trigger if exists trg_pressure_targets_updated_at on public.pressure_targets;
create trigger trg_pressure_targets_updated_at
  before insert or update on public.pressure_targets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_pressure_targets_audit on public.pressure_targets;
create trigger trg_pressure_targets_audit
  before insert or update on public.pressure_targets
  for each row execute function public.set_audit_fields();

-- ── 시드 ───────────────────────────────────────────────────
-- 이미 값이 있으면 덮어쓰지 않는다. 목표압 변경은 새 effective_from 행으로 남긴다.
insert into public.pressure_targets (axle_group, target_psi, effective_from, note) values
  ('steer', 100, '2026-04-02', '초기 기준 — tire_config.rec_psi_steer'),
  ('drive', 116, '2026-05-10', '실측 기준일. 05-03 125.0 → 05-10 114.0 하향 시점')
on conflict (axle_group, effective_from) do nothing;

-- ── 점검 행별 목표압 뷰 ────────────────────────────────────
create or replace view public.v_inspection_pressure_target as
select
  i.id,
  i.ch,
  i.pos,
  i.inspection_date,
  i.pressure,
  case when i.pos in ('L1','R1') then 'steer' else 'drive' end as axle_group,
  t.target_psi,
  t.effective_from as target_effective_from,
  case when t.target_psi is null then null
       else round(i.pressure - t.target_psi, 1) end as psi_delta
from public.inspections i
left join lateral (
  select pt.target_psi, pt.effective_from
  from public.pressure_targets pt
  where pt.deleted_at is null
    and pt.axle_group = case when i.pos in ('L1','R1') then 'steer' else 'drive' end
    and pt.effective_from <= i.inspection_date
  order by pt.effective_from desc
  limit 1
) t on true
where i.deleted_at is null;

alter view public.v_inspection_pressure_target set (security_invoker = on);
comment on view public.v_inspection_pressure_target is
  '점검 행마다 그 시점에 유효했던 목표 공기압. 차트의 목표선은 이 뷰를 계단식으로 그린다. tire_config.rec_psi_* 를 직접 참조하지 말 것.';

grant select on public.v_inspection_pressure_target to anon, authenticated;

-- ============================================================
-- ROLLBACK:
--   drop view if exists public.v_inspection_pressure_target;
--   drop trigger if exists trg_pressure_targets_audit      on public.pressure_targets;
--   drop trigger if exists trg_pressure_targets_updated_at on public.pressure_targets;
--   drop policy  if exists "pressure_targets read"         on public.pressure_targets;
--   drop policy  if exists "pressure_targets write insert" on public.pressure_targets;
--   drop policy  if exists "pressure_targets write update" on public.pressure_targets;
--   drop policy  if exists "pressure_targets write delete" on public.pressure_targets;
--   -- 테이블은 남긴다 (프로젝트 규약: DROP TABLE 금지).
--   -- 시드만 되돌리려면:
--   --   update public.pressure_targets set deleted_at = now()
--   --   where (axle_group, effective_from) in (('steer','2026-04-02'), ('drive','2026-05-10'));
-- ============================================================
