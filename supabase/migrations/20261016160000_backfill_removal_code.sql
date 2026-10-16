-- ============================================================
-- replacements.removal_code 백필 — WO-TMS-2026-10-LIFE T-4
-- 사용자 승인 2026-10-16 (decisions M-2). 초안: docs/backfill_removal_code_20261016.sql
--
-- 근거는 두 가지뿐이다. 추정으로 메우지 않는다.
--   ① ROT — 구 타이어가 같은 날 이후 다른 교체에서 신 타이어로 다시 장착됨 (위치 교환).
--   ② lifetimes.damage — 원본 Excel 'Lifetime' 시트의 폐기 사유. damage_codes 에 있는 코드만.
--   그 외는 NULL 로 둔다 — 현장 확인 대상.
-- 기대값 (2026-10-16 prod 조회): ROT 32 · WO 21 · CD 2 · SC 1 · NULL 7
--
-- 멱등: removal_code 가 이미 있는 행은 건드리지 않는다. 소프트 삭제 행 제외.
-- ============================================================

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
