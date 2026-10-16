-- ============================================================
-- B-2 · 측정 상태 코드
--
-- tread = 0 은 두 가지 뜻이 섞여 있다.
--   ① 실제로 다 닳았다 (gundul — 실차보고서 REMARKS 확인)
--   ② 측정을 못 했다 / 값을 안 적었다
-- 지금은 구분이 안 되어 마모율·수명 통계가 ② 때문에 오염된다.
--
-- 기존 tread = 0 인 15행은 전부 'measured' 로 남긴다 (사용자 결정 2026-08-26).
-- 일괄 수정하지 않는다 (작업지시서 v2 §3).
-- ============================================================

alter table public.inspections
  add column if not exists tread_status text not null default 'measured';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspections'::regclass
      and conname = 'inspections_tread_status_check'
  ) then
    alter table public.inspections
      add constraint inspections_tread_status_check
      check (tread_status in ('measured','not_measured','worn_out','scrapped'));
  end if;
end $$;

comment on column public.inspections.tread_status is
  'measured=정상 측정 / not_measured=측정 못 함(tread 는 NULL, 마모율·추이에서 제외) / worn_out=완전 마모(tread 0 이 실측) / scrapped=폐기 처리분';

-- 예외 상태만 인덱싱한다. 대부분의 행은 measured 라 부분 인덱스가 훨씬 작다.
create index if not exists idx_inspections_tread_status_abnormal
  on public.inspections (ch, inspection_date)
  where tread_status <> 'measured';

-- ============================================================
-- ROLLBACK:
--   drop index if exists public.idx_inspections_tread_status_abnormal;
--   alter table public.inspections drop constraint if exists inspections_tread_status_check;
--   -- 컬럼은 남긴다 (프로젝트 규약: DROP COLUMN 금지).
--   -- 값을 되돌리려면: update public.inspections set tread_status = 'measured';
-- ============================================================
