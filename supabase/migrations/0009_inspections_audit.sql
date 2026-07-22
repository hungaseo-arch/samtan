-- ============================================================
-- Samtan TMS — 점검 데이터 감사 추적(누가 입력·수정했는가)
--
-- created_by / updated_by  : auth.users.id (누구인지)
-- created_by_email / updated_by_email : 표시용 이메일 스냅샷
--   클라이언트는 auth.users 를 조회할 수 없으므로(권한 없음) 화면에 이름을 띄우려면
--   이메일을 비정규화해 함께 저장한다. 계정이 삭제돼도 "누가 올렸는지"는 남는다.
--
-- 값은 트리거가 JWT에서 채운다 — 클라이언트가 보낸 값은 무시되므로 위조할 수 없다.
-- 기존 330행은 null(입력자 미상)로 남는다.
-- ============================================================

alter table public.inspections
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_by_email text,
  add column if not exists updated_by_email text;

comment on column public.inspections.created_by is '최초 입력한 사용자 (auth.users.id)';
comment on column public.inspections.updated_by is '마지막 수정한 사용자 (auth.users.id)';

-- 감사 필드 자동 기록 — 클라이언트 입력값을 신뢰하지 않고 항상 덮어쓴다.
create or replace function public.set_audit_fields()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if (TG_OP = 'INSERT') then
    new.created_by       := auth.uid();
    new.created_by_email := auth.jwt() ->> 'email';
    new.updated_by       := new.created_by;
    new.updated_by_email := new.created_by_email;
  else
    -- 최초 입력자는 보존하고 수정자만 갱신한다.
    new.created_by       := old.created_by;
    new.created_by_email := old.created_by_email;
    new.updated_by       := auth.uid();
    new.updated_by_email := auth.jwt() ->> 'email';
  end if;
  return new;
end $$;

drop trigger if exists trg_inspections_audit on public.inspections;
create trigger trg_inspections_audit
  before insert or update on public.inspections
  for each row execute function public.set_audit_fields();
