-- ============================================================
-- M-16 · 뷰 6개의 anon SELECT 회수 (쎄오님 결정 2026-11-08 «6개 모두 회수»)
--
-- 배경: 20260906100000 이 anon 의 테이블·뷰 권한을 전부 회수했다(로그인한 사용자만 읽는다).
-- 그 뒤 새로 만들거나 다시 만든 뷰가 같은 문장으로 `grant select … to anon, authenticated` 를
-- 복사해 와 anon 권한이 되살아났다:
--   v_tire_ledger · v_tire_ledger_total  ← 20261016150000
--   v_odometer_anomaly                   ← 20261016140000
--   v_wear_pattern                       ← 20261017100000
--   v_tco_unit · v_tco_fleet             ← 20261017120000
-- (2026-11-08 prod 읽기 조회: public 스키마에서 anon 권한이 남은 관계는 정확히 이 6개 SELECT 뿐.
--  컬럼·시퀀스·함수 명시 grant 없음. 6개 모두 security_invoker=on → 하위 테이블 RLS 가 막고 있어
--  실제 노출은 없었다. 그래도 «anon 권한 0» 이 규칙이다.)
--
-- 조치: 6개 뷰에서 anon 권한을 회수한다. authenticated · service_role 권한과 뷰 정의 ·
--       reloptions 는 건드리지 않는다.
-- 멱등: REVOKE 는 이미 없는 권한에도 오류가 없다 — 몇 번을 실행해도 같다.
-- 재발 방지: pgTAP t108 이 public 스키마 전체의 anon 권한 0 을 검사하고, CLAUDE.md 에 규칙을 추가했다.
-- ============================================================

revoke all on public.v_tire_ledger       from anon;
revoke all on public.v_tire_ledger_total from anon;
revoke all on public.v_odometer_anomaly  from anon;
revoke all on public.v_wear_pattern      from anon;
revoke all on public.v_tco_unit          from anon;
revoke all on public.v_tco_fleet         from anon;

-- ROLLBACK (되돌릴 일이 없어야 한다 — anon 이 읽을 이유가 없다):
--   grant select on public.v_tire_ledger, public.v_tire_ledger_total, public.v_odometer_anomaly,
--                   public.v_wear_pattern, public.v_tco_unit, public.v_tco_fleet to anon;
