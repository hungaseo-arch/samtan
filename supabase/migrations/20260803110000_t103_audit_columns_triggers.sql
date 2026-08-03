-- ============================================================
-- Samtan TMS — T-103. 감사 컬럼 및 트리거
--
-- 근거: 작업지시서 §4 T-103. 문제점 P-5(감사 추적 불가) 해소.
-- 대상 4개 테이블: vehicles · vehicle_positions · inspections · replacements (§1.2)
--
-- 현재 상태 (적용 전):
--   · inspections 만 created_at/updated_at/created_by/updated_by(+_email) 보유 (0009)
--   · set_updated_at() · set_audit_fields() 함수와 inspections 트리거 2개 존재
--   · audit_log 는 T-101 에서 최소 형태로 생성됨 — 여기서 op 컬럼과 트리거를 붙인다
--
-- 멱등성: add column if not exists · create or replace function ·
--         drop trigger if exists + create trigger · 백필은 대상 행만 갱신
-- ============================================================

-- ── 1. 감사 컬럼 ───────────────────────────────────────────
-- set_audit_fields() 가 *_email 까지 채우므로 4개 테이블의 컬럼 구성을 맞춘다.
-- 하나라도 빠지면 트리거가 런타임에 실패한다.

alter table public.vehicles
  add column if not exists created_at       timestamptz not null default now(),
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists created_by       uuid,
  add column if not exists updated_by       uuid,
  add column if not exists created_by_email text,
  add column if not exists updated_by_email text,
  add column if not exists deleted_at       timestamptz;

alter table public.vehicle_positions
  add column if not exists created_at       timestamptz not null default now(),
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists created_by       uuid,
  add column if not exists updated_by       uuid,
  add column if not exists created_by_email text,
  add column if not exists updated_by_email text,
  add column if not exists deleted_at       timestamptz;

-- replacements.created_at 만 3단계로 추가한다. `not null default now()` 로 한 번에 넣으면
-- 기존 17행이 전부 "마이그레이션을 실행한 시각"으로 굳어지고, 그 뒤에는 어떤 조건으로도
-- 되돌릴 행을 특정할 수 없다. NULL 로 넣고 → 교체일로 채우고 → 제약을 건다.
alter table public.replacements
  add column if not exists created_at       timestamptz;

update public.replacements
   set created_at = (date::timestamp at time zone 'Asia/Jakarta')
 where created_at is null;

alter table public.replacements
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.replacements
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists created_by       uuid,
  add column if not exists updated_by       uuid,
  add column if not exists created_by_email text,
  add column if not exists updated_by_email text,
  add column if not exists deleted_at       timestamptz;

alter table public.inspections
  add column if not exists deleted_at timestamptz;

comment on column public.inspections.deleted_at is
  '소프트 삭제 시각. NULL = 유효. §3.1-3 에 따라 측정 레코드는 하드 삭제하지 않는다';
comment on column public.replacements.deleted_at is
  '소프트 삭제 시각. NULL = 유효';

-- 유효 레코드만 훑는 조회를 위한 부분 인덱스
create index if not exists idx_insp_active
  on public.inspections (ch, inspection_date desc) where deleted_at is null;

-- ── 2. updated_at · 실행자 트리거 ──────────────────────────
-- 함수는 0001 · 0009 에서 이미 만들어졌다. 여기서는 나머지 3개 테이블에 붙인다.

-- set_updated_at 에는 search_path 고정이 빠져 있었다. 트리거 함수가 늘어나는 김에
-- 나머지와 동일하게 맞춘다 (본문은 그대로).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_vehicles_audit on public.vehicles;
create trigger trg_vehicles_audit
  before insert or update on public.vehicles
  for each row execute function public.set_audit_fields();

drop trigger if exists trg_vehicle_positions_updated_at on public.vehicle_positions;
create trigger trg_vehicle_positions_updated_at
  before update on public.vehicle_positions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_vehicle_positions_audit on public.vehicle_positions;
create trigger trg_vehicle_positions_audit
  before insert or update on public.vehicle_positions
  for each row execute function public.set_audit_fields();

drop trigger if exists trg_replacements_updated_at on public.replacements;
create trigger trg_replacements_updated_at
  before update on public.replacements
  for each row execute function public.set_updated_at();

drop trigger if exists trg_replacements_audit on public.replacements;
create trigger trg_replacements_audit
  before insert or update on public.replacements
  for each row execute function public.set_audit_fields();

-- ── 3. inspections.created_at 백필 ─────────────────────────
-- inspections.created_at 은 0001 부터 있던 컬럼이고, 기존 330행의 값은 "일괄 적재를
-- 실행한 날"(2026-06-27 · 2026-07-21)이라 감사 자료로 의미가 없다. 실제 점검일 기준으로
-- 되돌린다. 저장은 UTC, 기준 시각은 현장 시간대(WIB)의 자정이다.
--
-- 컷오프(2026-08-01)를 두어 이후 현장에서 입력된 행은 건드리지 않는다.
-- 현장 입력은 점검일과 입력일이 다를 수 있고, 그 차이 자체가 감사 정보다.
-- 적용 시점 확인 결과 컷오프 이후 행은 0건, 대상은 330행 전부다.
--
-- 트리거를 잠시 끄는 이유: set_updated_at 이 updated_at 을 now() 로 덮어써
-- "적재 시각" 정보까지 잃게 되고, set_audit_fields 가 updated_by 를 NULL 로 만든다.
-- (마이그레이션 세션에는 JWT 가 없다.)
--
-- replacements.created_at 은 §1 에서 컬럼을 추가하며 함께 채웠다. 트리거를 붙이기
-- 전이라 같은 조치가 필요 없다.

alter table public.inspections disable trigger user;

update public.inspections
   set created_at = (inspection_date::timestamp at time zone 'Asia/Jakarta')
 where created_at < timestamptz '2026-08-01 00:00:00+00'
   and created_at <> (inspection_date::timestamp at time zone 'Asia/Jakarta');

alter table public.inspections enable trigger user;

-- ── 4. audit_log 확장 ──────────────────────────────────────
alter table public.audit_log
  add column if not exists op text;

comment on column public.audit_log.op is
  '변경 종류 — INSERT · UPDATE · DELETE. T-101 이 직접 넣은 행은 NULL';

create index if not exists audit_log_pk_idx
  on public.audit_log using gin (record_pk);

-- ── 5. 변경 기록 트리거 ────────────────────────────────────
-- PK 컬럼명을 TG_ARGV 로 받아 테이블마다 재사용한다.
-- security definer: audit_log 는 RLS 가 켜져 있고 INSERT 정책이 없다. 소유자
-- 권한으로 실행해야 일반 사용자의 변경도 기록된다. 반대로 말하면 이 함수를 통하지
-- 않고서는 아무도 audit_log 에 쓸 수 없다.

create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  rec  jsonb;
  pk   jsonb := '{}'::jsonb;
  col  text;
begin
  if TG_OP = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;

  foreach col in array TG_ARGV loop
    pk := pk || jsonb_build_object(col, rec -> col);
  end loop;

  -- 값이 그대로인 UPDATE 는 기록하지 않는다 (T-104 의 멱등 UPSERT 가 매 회차마다
  -- 60행씩 잡음을 남기지 않도록). 비교에서 감사 컬럼 자체는 뺀다 — set_updated_at
  -- 이 updated_at 을 항상 새로 쓰므로, 그대로 비교하면 모든 UPDATE 가 "변경"이 된다.
  if TG_OP = 'UPDATE'
     and (to_jsonb(old) - 'updated_at' - 'updated_by' - 'updated_by_email')
         is not distinct from
         (to_jsonb(new) - 'updated_at' - 'updated_by' - 'updated_by_email') then
    return null;
  end if;

  insert into public.audit_log
    (table_name, record_pk, old_value, new_value, actor, actor_email, source, op)
  values (
    TG_TABLE_NAME,
    pk,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid(),
    auth.jwt() ->> 'email',
    'trigger',
    TG_OP
  );
  return null;
end $$;

comment on function public.log_audit() is
  '변경 전/후 행 전체를 JSONB 로 audit_log 에 적재. PK 컬럼명을 트리거 인자로 받는다';

drop trigger if exists trg_inspections_log on public.inspections;
create trigger trg_inspections_log
  after insert or update or delete on public.inspections
  for each row execute function public.log_audit('id');

drop trigger if exists trg_replacements_log on public.replacements;
create trigger trg_replacements_log
  after insert or update or delete on public.replacements
  for each row execute function public.log_audit('id');

drop trigger if exists trg_vehicles_log on public.vehicles;
create trigger trg_vehicles_log
  after insert or update or delete on public.vehicles
  for each row execute function public.log_audit('ch');

drop trigger if exists trg_vehicle_positions_log on public.vehicle_positions;
create trigger trg_vehicle_positions_log
  after insert or update or delete on public.vehicle_positions
  for each row execute function public.log_audit('ch', 'pos');

-- ── 6. 하드 삭제 차단 ──────────────────────────────────────
-- §3.1-3: inspections · replacements 는 DELETE 금지, 소프트 삭제만 사용.
-- 지금까지는 규칙 문서로만 존재했고 DB 는 막지 않았다.

create or replace function public.forbid_hard_delete()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception
    '% 은 하드 삭제할 수 없습니다. deleted_at 을 채우는 소프트 삭제를 사용하십시오 (§3.1-3)',
    TG_TABLE_NAME
    using errcode = 'restrict_violation';
end $$;

drop trigger if exists trg_inspections_no_delete on public.inspections;
create trigger trg_inspections_no_delete
  before delete on public.inspections
  for each row execute function public.forbid_hard_delete();

drop trigger if exists trg_replacements_no_delete on public.replacements;
create trigger trg_replacements_no_delete
  before delete on public.replacements
  for each row execute function public.forbid_hard_delete();

-- ── 7. 소프트 삭제 권한 ────────────────────────────────────
-- 하드 삭제는 RLS 상 admin 전용이었다(0010). 삭제를 UPDATE 로 바꾸면 UPDATE 정책
-- (inspector·admin)을 타게 되어 점검자도 회차를 지울 수 있게 된다 — 권한 완화다.
-- 컬럼 단위 판정은 RLS 로 표현할 수 없으므로 트리거로 원래 경계를 되살린다.
--
-- 막는 것은 "지우는 방향"(NULL → 값)뿐이다. 되살리는 방향(값 → NULL)은 삭제된
-- 날짜에 점검을 다시 입력하는 정상 흐름이라 점검자에게도 허용하고, 대신 audit_log
-- 에 그대로 남는다.
-- auth.uid() 가 NULL 인 경우(마이그레이션·service_role·서버 작업)는 통과시킨다.

create or replace function public.guard_soft_delete()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
     and auth.uid() is not null
     and public.app_role() <> 'admin' then
    raise exception '삭제 권한이 없습니다. % 삭제는 관리자만 가능합니다', TG_TABLE_NAME
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_inspections_guard_delete on public.inspections;
create trigger trg_inspections_guard_delete
  before update on public.inspections
  for each row execute function public.guard_soft_delete();

drop trigger if exists trg_replacements_guard_delete on public.replacements;
create trigger trg_replacements_guard_delete
  before update on public.replacements
  for each row execute function public.guard_soft_delete();
