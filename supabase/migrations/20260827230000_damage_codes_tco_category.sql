-- T-1 · damage_codes 에 TCO 귀속 분류와 인니어 설명 추가
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-1 · 사용자 결정 2026-08-27
--
-- 새 코드 체계를 만들지 않는다. 기존 손상코드에 귀속 축을 하나 더 붙일 뿐이다.
-- 이래야 "우리 타이어가 짧게 간다" 가 아니라 "PRODUCT 귀속분 수명이 목표 대비
-- 몇 % 이고 나머지는 SURFACE·MAINTENANCE 원인이었다" 로 설명된다.
--
-- CW·SW·AL 은 셋 다 MAINTENANCE 다 (사용자 결정 2026-08-27).
--   중앙 마모는 과공기압, 숄더 마모는 저공기압·과하중, 얼라인먼트는 정렬 —
--   전부 정비·관리 축에서 통제되는 원인이라는 판단이다.
--   그 결과 PRODUCT 에는 WO(정상 마모) 하나만 남는다. 이것이 의도된 것이며,
--   지시서가 WO 를 '수명 통계의 유일한 유효 모수' 라고 한 것과 맞는다.
--
-- OTH(Other) 만 NULL 이다. 미분류를 MANUFACTURE 나 PRODUCT 로 밀어 넣으면
-- 분류하지 않은 건이 특정 축의 책임처럼 집계된다.

alter table public.damage_codes
  add column if not exists tco_category text,
  add column if not exists description_id text;

-- check 는 컬럼 추가와 분리한다. 재실행 시 add column 이 건너뛰어도 제약은 확인된다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.damage_codes'::regclass
       and conname  = 'damage_codes_tco_category_check'
  ) then
    alter table public.damage_codes
      add constraint damage_codes_tco_category_check
      check (tco_category is null or tco_category in
             ('PRODUCT','SURFACE','OPERATION','MAINTENANCE','MANUFACTURE'));
  end if;
end $$;

comment on column public.damage_codes.tco_category is
  'TCO 귀속 축. PRODUCT 만 제품 수명 통계의 유효 모수다. OTH(미분류)는 NULL.';
comment on column public.damage_codes.description_id is
  'Bahasa Indonesia 설명. 현장 점검자 화면 기본 로케일이 id 라 코드 옆에 병기한다.';

update public.damage_codes as d
   set tco_category = v.cat,
       description_id = v.desc_id
  from (values
    ('WO',  'PRODUCT',     'Aus habis'),
    ('SC',  'SURFACE',     'Sobek dinding samping'),
    ('BC',  'MAINTENANCE', 'Sobek bead'),
    ('BB',  'MANUFACTURE', 'Benjol bead'),
    ('SHC', 'SURFACE',     'Sobek bahu'),
    ('ILB', 'MANUFACTURE', 'Benjol inner liner'),
    ('CD',  'SURFACE',     'Kerusakan mahkota'),
    ('SWB', 'OPERATION',   'Aus setempat akibat rem'),
    ('IW',  'MAINTENANCE', 'Aus tidak merata'),
    ('SCF', 'OPERATION',   'Lecet dinding samping'),
    ('BO',  'OPERATION',   'Terbakar'),
    ('RF',  'MAINTENANCE', 'Jalan dalam keadaan kempis'),
    ('ORF', 'MAINTENANCE', 'Jalan terlalu lama dalam keadaan kempis'),
    ('CW',  'MAINTENANCE', 'Aus bagian tengah'),
    ('SW',  'MAINTENANCE', 'Aus bahu'),
    ('AL',  'MAINTENANCE', 'Ketidaksejajaran roda (spooring)')
  ) as v(code, cat, desc_id)
 where d.code = v.code;

-- OTH 는 귀속 축을 비우고 설명만 넣는다.
update public.damage_codes
   set description_id = 'Lainnya'
 where code = 'OTH';

do $$
declare v_null int; v_desc int; v_oth text;
begin
  select count(*) into v_null from public.damage_codes where tco_category is null;
  if v_null <> 1 then
    raise exception 'tco_category 가 비어 있는 코드가 %건이다 (OTH 1건이어야 한다)', v_null;
  end if;

  select tco_category into v_oth from public.damage_codes where code = 'OTH';
  if v_oth is not null then
    raise exception 'OTH 는 미분류라 NULL 이어야 하는데 % 다', v_oth;
  end if;

  select count(*) into v_desc from public.damage_codes where description_id is null;
  if v_desc > 0 then
    raise exception '인니어 설명이 없는 코드가 %건 남았다', v_desc;
  end if;
end $$;
