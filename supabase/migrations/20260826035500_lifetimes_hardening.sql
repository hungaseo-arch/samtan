-- ============================================================
-- Samtan TMS — M1. lifetimes 기반 정비
--
-- 근거: 데이터 정합성 개선 작업지시서 v1 §Phase 1 / M1 (항목 1 준비)
-- 목적: lifetimes 에 자동 INSERT(M3 ensure_lifetime_row)를 걸기 전에
--       무결성 장치와 다른 테이블과 동일한 감사 규약을 갖춘다.
--
-- 적용 전 실측 확인 (execute_sql, 2026-08-26):
--   · 95행 / distinct serial 95 / serial NULL 0     → 유니크 인덱스 가능
--   · max(no) = 95                                   → 시퀀스 setval 기준
--   · status 4종 외 값 0건 (87/5/2/1)                → CHECK 제약 통과
--   · 트리거 0개 · 감사 컬럼 0개                     → 신규 부여
--   · set_audit_fields() 요구 컬럼 = created_by / created_by_email /
--     updated_by / updated_by_email  (pg_get_functiondef 로 대조 완료)
--
-- 기존 95행의 값은 바꾸지 않는다. 컬럼 추가와 제약 부여만 한다.
-- 멱등성: create ... if not exists · drop constraint if exists + add ·
--         add column if not exists · drop trigger if exists + create
-- ============================================================

-- ── 1. serial 유일성 ───────────────────────────────────────
-- ensure_lifetime_row() 의 ON CONFLICT (serial) DO NOTHING 이 이 인덱스에 의존한다.
-- 부분 인덱스(WHERE serial IS NOT NULL)여도 ON CONFLICT 추론 대상이 되려면
-- 추론식에 동일한 술어를 함께 써야 하므로, M3 에서 그 형태로 작성한다.
create unique index if not exists lifetimes_serial_uniq
  on public.lifetimes (serial) where serial is not null;

-- ── 2. no 자동 채번 ────────────────────────────────────────
-- 지금까지 원장 엑셀에서 손으로 매기던 번호다. 트리거가 행을 만들기 시작하면
-- 채번 주체가 없어지므로 시퀀스를 붙인다.
create sequence if not exists public.lifetimes_no_seq owned by public.lifetimes.no;
select setval('public.lifetimes_no_seq', coalesce((select max(no) from public.lifetimes), 0), true);
alter table public.lifetimes alter column no set default nextval('public.lifetimes_no_seq');

-- ── 3. 상태 값 통제 ────────────────────────────────────────
-- 현재 사용 값 4종. 프론트 LifeRecord.status 타입과 동일하다.
alter table public.lifetimes drop constraint if exists lifetimes_status_chk;
alter table public.lifetimes
  add constraint lifetimes_status_chk
  check (status is null or status in ('Install','Spare','Not Install','Scrap'));

-- ── 4. 감사 규약 ───────────────────────────────────────────
-- T-103 이 4개 테이블(vehicles·vehicle_positions·inspections·replacements)에
-- 부여한 것과 동일한 컬럼 구성. 하나라도 빠지면 set_audit_fields() 가 런타임에 실패한다.
--
-- deleted_at 은 추가하지 않는다. lifetimes 는 소프트 삭제 대상(§3.1-3)이 아니고,
-- M2 의 뷰들도 lifetimes 에 deleted_at 필터를 걸지 않는다.
alter table public.lifetimes
  add column if not exists created_at       timestamptz not null default now(),
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists created_by       uuid,
  add column if not exists updated_by       uuid,
  add column if not exists created_by_email text,
  add column if not exists updated_by_email text;

drop trigger if exists trg_lifetimes_audit      on public.lifetimes;
drop trigger if exists trg_lifetimes_updated_at on public.lifetimes;
drop trigger if exists trg_lifetimes_log        on public.lifetimes;

create trigger trg_lifetimes_audit      before insert or update on public.lifetimes
  for each row execute function public.set_audit_fields();
create trigger trg_lifetimes_updated_at before update on public.lifetimes
  for each row execute function public.set_updated_at();
create trigger trg_lifetimes_log        after insert or update or delete on public.lifetimes
  for each row execute function public.log_audit('no');

-- ── 5. 컬럼 의미 고정 ──────────────────────────────────────
-- 로테이션(다른 포지션으로 옮겨 다는 것)으로 install 을 갱신하면 수명 계산이 초기화된다.
comment on column public.lifetimes.install is
  'Tgl pasang awal — 신품 최초 투입일. 로테이션으로 위치가 바뀌어도 갱신하지 않는다.';

-- ============================================================
-- ROLLBACK:
--   drop trigger if exists trg_lifetimes_log        on public.lifetimes;
--   drop trigger if exists trg_lifetimes_updated_at on public.lifetimes;
--   drop trigger if exists trg_lifetimes_audit      on public.lifetimes;
--   -- 감사 컬럼은 §4-2(컬럼 삭제 금지)에 따라 남겨 두는 것을 권장한다.
--   -- 되돌리려면: alter table public.lifetimes
--   --   drop column if exists updated_by_email, drop column if exists created_by_email,
--   --   drop column if exists updated_by,       drop column if exists created_by,
--   --   drop column if exists updated_at,       drop column if exists created_at;
--   alter table public.lifetimes drop constraint if exists lifetimes_status_chk;
--   alter table public.lifetimes alter column no drop default;
--   drop sequence if exists public.lifetimes_no_seq;
--   drop index if exists public.lifetimes_serial_uniq;
--   comment on column public.lifetimes.install is null;
-- ============================================================
