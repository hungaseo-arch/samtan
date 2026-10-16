-- ============================================================
-- replacements.removal_code 백필 — WO-TMS-2026-10-LIFE T-4
--
-- ⚠ 실행하지 않았다. 실행 여부는 사용자 결정 대기 (지시서 §4-2).
--   실행하더라도 마이그레이션이 아니라 데이터 정정이므로, 승인 후 이 파일을
--   supabase/migrations/ 로 옮겨 `supabase db push` 로 적용한다 (CLAUDE.md — 대시보드 SQL 편집기 금지).
--   기본은 마지막 줄이 ROLLBACK 이라 그대로 돌려도 미리보기만 하고 아무것도 바꾸지 않는다.
--
-- 현황 (2026-10-16 prod 조회): 교체 63건 전부 removal_code NULL.
--
-- 근거는 두 가지뿐이다. 추정으로 메우지 않는다.
--   ① ROT — 구 타이어가 같은 날 이후 다른 교체에서 신 타이어로 다시 장착됨 (위치 교환).
--      원장 구조에서 나오는 사실이라 추정이 아니다.                                   32건
--   ② lifetimes.damage — 원본 Excel 'Lifetime' 시트의 폐기 사유 열. damage_codes 에
--      있는 코드만 쓴다 (WO 21 · CD 2 · SC 1).                                         24건
--   그 외 7건은 근거가 없어 NULL 로 둔다 — 현장 확인 대상.
--
-- 덮어쓰지 않는다: removal_code 가 이미 있는 행은 건드리지 않는다 (멱등).
-- 소프트 삭제 행(deleted_at)은 제외한다.
-- ============================================================

begin;

-- ── 미리보기: 무엇을 무엇으로 채우는가 ──────────────────────
with src as (
  select r.id, r.ch, r.pos, r.date, r.old_serial, r.new_serial,
         case
           when exists (select 1 from public.replacements r2
                         where r2.deleted_at is null
                           and r2.new_serial = r.old_serial
                           and r2.date >= r.date)
             then 'ROT'
           when dc.code is not null
             then dc.code
         end as proposed,
         case
           when exists (select 1 from public.replacements r2
                         where r2.deleted_at is null
                           and r2.new_serial = r.old_serial
                           and r2.date >= r.date)
             then 'remounted'
           when dc.code is not null
             then 'lifetimes.damage'
           else 'no evidence'
         end as basis
    from public.replacements r
    left join public.lifetimes l on l.serial = r.old_serial
    left join public.damage_codes dc on dc.code = upper(btrim(l.damage))
   where r.deleted_at is null
     and r.removal_code is null
)
select basis, proposed, count(*) from src group by 1, 2 order by 1, 2;

-- ── 적용 ────────────────────────────────────────────────────
update public.replacements r
   set removal_code = 'ROT'
 where r.deleted_at is null
   and r.removal_code is null
   and exists (select 1 from public.replacements r2
                where r2.deleted_at is null
                  and r2.new_serial = r.old_serial
                  and r2.date >= r.date);

update public.replacements r
   set removal_code = dc.code
  from public.lifetimes l
  join public.damage_codes dc on dc.code = upper(btrim(l.damage))
 where r.deleted_at is null
   and r.removal_code is null
   and l.serial = r.old_serial;

-- ── 검증: 기대값 ROT 32 · WO 21 · CD 2 · SC 1 · NULL 7 ─────
select coalesce(removal_code, '(null)') as removal_code, count(*)
  from public.replacements
 where deleted_at is null
 group by 1 order by 2 desc;

-- 확인 후 승인되면 rollback → commit 으로 바꾼다.
rollback;
