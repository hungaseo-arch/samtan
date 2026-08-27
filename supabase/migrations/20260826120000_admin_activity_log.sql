-- ============================================================
-- Samtan TMS — 관리자 화면: 사용자별 활동 로그 조회
--
-- 관리자 페이지의 "사용자별 로그기록" 탭이 쓰는 두 갈래 자료를 준비한다.
--
--   1) 데이터 변경 이력 — public.audit_log
--      테이블·트리거는 T-101/T-103 에서 이미 만들었고 RLS 로 admin 만 읽는다.
--      여기서는 "특정 사용자의 최근 활동" 조회 경로에 맞는 인덱스만 보탠다.
--      (기존 인덱스는 (table_name, changed_at desc) 라 actor 필터에 쓰이지 않는다)
--
--   2) 로그인·로그아웃 이력 — auth.audit_log_entries
--      GoTrue 가 적재하는 인증 이벤트다. auth 스키마는 PostgREST 에 노출되지 않고
--      RLS 로 열 수도 없으므로(Supabase 관리 영역) security definer 함수로만 꺼낸다.
--      함수 안에서 app_role() = 'admin' 을 직접 확인한다 — security definer 는
--      호출자의 권한을 우회하므로 이 검사가 유일한 방어선이다.
--
--      ⚠ 적용 후 확인: auth 스키마 테이블의 소유자는 supabase_auth_admin 이다.
--        함수 소유자(postgres)에게 SELECT 가 없으면 호출 시 permission denied 가 난다.
--        `select public.admin_auth_events(null, 5, null);` 로 한 번 눌러 볼 것.
--        막히면 로그인 이력 대신 auth.users.last_sign_in_at(admin-users list)만 남는다.
--
-- 멱등성: create index if not exists · create or replace function
-- ============================================================

-- ── 1. audit_log 사용자별 조회 인덱스 ─────────────────────────
create index if not exists audit_log_actor_time_idx
  on public.audit_log (actor, changed_at desc);

-- ── 2. 인증 이벤트 조회 함수 ──────────────────────────────────
-- p_user   : 특정 사용자만 (null = 전체)
-- p_limit  : 최대 행수 (상한 500 — 관리 화면은 페이지 단위로만 읽는다)
-- p_before : 이 시각보다 이전 것만 (커서 페이지네이션)
--
-- token_refreshed 는 제외한다. 세션 유지를 위해 한 시간에도 여러 번 쌓여
-- 실제 로그인·로그아웃을 덮어버린다.
create or replace function public.admin_auth_events(
  p_user   uuid        default null,
  p_limit  int         default 100,
  p_before timestamptz default null
)
returns table (
  id          uuid,
  action      text,
  actor_id    uuid,
  actor_email text,
  ip_address  text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- security definer 이므로 호출자 권한이 적용되지 않는다. 여기서 반드시 막는다.
  if public.app_role() <> 'admin' then
    raise exception '인증 이벤트는 관리자만 조회할 수 있습니다'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select
      e.id,
      e.payload ->> 'action',
      nullif(e.payload ->> 'actor_id', '')::uuid,
      nullif(e.payload ->> 'actor_username', ''),
      nullif(e.ip_address::text, ''),
      e.created_at
    from auth.audit_log_entries e
    where (p_user   is null or e.payload ->> 'actor_id' = p_user::text)
      and (p_before is null or e.created_at < p_before)
      and coalesce(e.payload ->> 'action', '') <> 'token_refreshed'
    order by e.created_at desc
    limit least(coalesce(p_limit, 100), 500);
end $$;

comment on function public.admin_auth_events(uuid, int, timestamptz) is
  'GoTrue 인증 이벤트(로그인·로그아웃 등) 조회. 관리자 전용, token_refreshed 제외';

-- 기본값으로 PUBLIC 에 EXECUTE 가 붙으므로 회수하고 로그인 사용자에게만 준다.
-- (함수 내부에서 admin 을 다시 확인하지만, 익명 키로 호출조차 못 하게 둔다)
revoke all on function public.admin_auth_events(uuid, int, timestamptz) from public;
grant execute on function public.admin_auth_events(uuid, int, timestamptz) to authenticated;

-- ============================================================
-- ROLLBACK:
--   drop function if exists public.admin_auth_events(uuid, int, timestamptz);
--   drop index if exists public.audit_log_actor_time_idx;
--   -- audit_log 테이블·트리거는 T-101/T-103 소관이라 건드리지 않는다.
-- ============================================================
