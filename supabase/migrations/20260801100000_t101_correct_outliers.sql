-- ============================================================
-- Samtan TMS — T-101 이상치 정정
--
-- 근거: docs/audit-report.md (T-002 진단, 읽기 전용)
-- 승인: 사용자 확인 2026-08-01
--   · 공기압 이상치 2건 → 120 psi 로 정정
--   · 트레드 22.00 mm 9건 중 "신품 추정" 6건은 정정 대상에서 제외하고,
--     CH 835 의 3개 회차(04-26 · 05-10 · 05-23)만 검토 대상으로 표기
--
-- 값을 판단할 수 없는 건은 고치지 않는다. 지시서 §4 T-101 에 따라 값은 그대로 두고
-- remark 에 [DATA REVIEW REQUIRED] 만 남긴다. 트레드 3개 회차가 여기 해당한다.
--
-- 멱등성: 모든 UPDATE 가 "아직 안 고쳐진 행"만 대상으로 한다. 두 번째 실행에서는
--         대상이 0건이 되고 audit_log 에도 아무것도 쌓이지 않는다.
-- ============================================================

-- ── 감사 로그 ────────────────────────────────────────────────
-- T-103 이 트리거 기반 자동 기록으로 확장한다. 여기서는 T-101 의 완료 조건
-- ("정정 전/후 값이 audit_log 에 기록됨")을 만족하기 위한 최소 형태로 만든다.
create table if not exists public.audit_log (
  id          bigserial primary key,
  table_name  text        not null,
  record_pk   jsonb       not null,   -- 대상 행의 식별자
  old_value   jsonb,                  -- 변경 전 (변경된 컬럼만)
  new_value   jsonb,                  -- 변경 후 (변경된 컬럼만)
  actor       uuid,                   -- auth.users.id. 마이그레이션 실행분은 null
  actor_email text,
  source      text        not null,   -- 변경 경로 (migration:<version> / trigger 등)
  note        text,
  changed_at  timestamptz not null default now()
);

create index if not exists audit_log_table_time_idx
  on public.audit_log (table_name, changed_at desc);

comment on table public.audit_log is '데이터 변경 이력. 정정·삭제의 근거를 남긴다.';

-- 감사 로그는 관리자만 읽는다. 다른 테이블처럼 public select 를 열면 고객사
-- 계정에도 전 이력이 노출된다(§0 D-1 = 고객사 제공).
alter table public.audit_log enable row level security;

drop policy if exists "audit_log admin select" on public.audit_log;
create policy "audit_log admin select" on public.audit_log
  for select to authenticated using (public.app_role() = 'admin');

-- 클라이언트의 직접 쓰기는 허용하지 않는다. 기록은 마이그레이션과 트리거만 수행한다.

-- ── 1. 공기압 이상치 정정 (2건) ──────────────────────────────
-- CH 834 / 2026-05-10 / R3 Out : 10 psi  → 120 psi
--   같은 회차 후륜은 114~115 psi 다. 자릿수 누락(110)일 가능성도 있으나
--   사용자 확인값 120 을 적용한다.
-- CH 835 / 2026-07-05 / R3 Out : 13 psi  → 120 psi
--   같은 회차 후륜은 106~128 psi 로, 120 이 그 범위 안에 든다.
with corrected as (
  update public.inspections i
     set pressure = v.new_pressure
    from (values
            ('834', date '2026-05-10', 'R3 Out', 10::numeric, 120::numeric),
            ('835', date '2026-07-05', 'R3 Out', 13::numeric, 120::numeric)
         ) as v(ch, inspection_date, pos, old_pressure, new_pressure)
   where i.ch              = v.ch
     and i.inspection_date = v.inspection_date
     and i.pos             = v.pos
     and i.pressure        = v.old_pressure   -- 이미 정정됐으면 대상 없음 → 멱등
  returning i.id, i.ch, i.inspection_date, i.pos,
            v.old_pressure, i.pressure as new_pressure
)
insert into public.audit_log (table_name, record_pk, old_value, new_value, source, note)
select 'inspections',
       jsonb_build_object('id', id, 'ch', ch,
                          'inspection_date', inspection_date, 'pos', pos),
       jsonb_build_object('pressure', old_pressure),
       jsonb_build_object('pressure', new_pressure),
       'migration:20260801100000',
       'T-101 공기압 이상치 정정 — 사용자 승인 2026-08-01'
  from corrected;

-- ── 2. 트레드 검토 대상 표기 (3개 회차 = 30행) ────────────────
-- CH 835 는 04-26 · 05-10 · 05-23 세 회차 연속으로 전 포지션 트레드가 신품값
-- 22.00 mm 다. 첫 회차가 아니므로 한 달간 마모 0 이 되어 실측 누락이 의심된다.
-- 참값을 알 수 없으므로 값은 보존하고 표기만 남긴다.
with target as (
  select id, ch, inspection_date, pos, tread, remark
    from public.inspections
   where ch = '835'
     and inspection_date in (date '2026-04-26', date '2026-05-10', date '2026-05-23')
     and (remark is null or remark not like '%[DATA REVIEW REQUIRED]%')  -- 재실행 시 0건
),
marked as (
  update public.inspections i
     set remark = case
                    when t.remark is null or btrim(t.remark) = ''
                      then '[DATA REVIEW REQUIRED]'
                    else t.remark || ' [DATA REVIEW REQUIRED]'
                  end
    from target t
   where i.id = t.id
  returning i.id, i.ch, i.inspection_date, i.pos, i.tread,
            t.remark as old_remark, i.remark as new_remark
)
insert into public.audit_log (table_name, record_pk, old_value, new_value, source, note)
select 'inspections',
       jsonb_build_object('id', id, 'ch', ch,
                          'inspection_date', inspection_date, 'pos', pos),
       jsonb_build_object('remark', old_remark),
       jsonb_build_object('remark', new_remark),
       'migration:20260801100000',
       'T-101 트레드 실측 누락 의심 — 값 보존, 검토 표기만 추가 (tread=' || tread || ')'
  from marked;
