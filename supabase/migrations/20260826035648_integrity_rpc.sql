-- ============================================================
-- Samtan TMS — M4. 정합성 점검 RPC
--
-- 근거: 데이터 정합성 개선 작업지시서 v1 §Phase 1 / M4 (항목 6)
--
-- 프론트는 supabase.rpc('check_data_integrity') 로 호출한다 (§2-3).
-- 뷰를 직접 select 해도 되지만, RPC 로 두면 정렬·형태를 서버가 고정하고
-- 나중에 체크 항목을 늘려도 프론트 계약이 바뀌지 않는다.
--
-- security invoker — 호출자의 RLS 를 그대로 탄다. v_data_integrity 가
-- 참조하는 테이블의 SELECT 정책이 public/true 라 anon 도 읽을 수 있다.
-- 멱등성: create or replace function
-- ============================================================

create or replace function public.check_data_integrity()
returns table (check_key text, severity text, cnt int, detail jsonb)
language sql stable security invoker set search_path = public
as $$ select check_key, severity, cnt, detail from public.v_data_integrity order by severity, check_key $$;

grant execute on function public.check_data_integrity() to anon, authenticated;

-- ============================================================
-- ROLLBACK:
--   drop function if exists public.check_data_integrity();
-- ============================================================
