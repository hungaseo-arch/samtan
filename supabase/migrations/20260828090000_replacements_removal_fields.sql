-- T-2 · replacements 에 탈착 사유 정보 추가
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-2
--
-- 현재 replacements 27건에는 new_serial 과 날짜만 있다. 무엇을 빼냈는지,
-- 왜 뺐는지, 뺀 타이어가 어떻게 됐는지가 없다. TCO 산출이 불가능한 근본 원인이다.
--
-- old_serial 은 v_tire_mount_history 로 역산할 수 있지만 컬럼으로 둔다.
-- 역산은 장착 이력이 완전할 때만 맞고, 현장에서 "이 타이어를 뺐다" 는
-- 관측 사실이라 추론값과 구분해 남겨야 한다. 소급 자동 채움은 하지 않는다.
--
-- 전부 NULL 허용이다. 기존 27건은 사유 미입력 상태로 남고, 화면(T-10)에서
-- '사유 미입력' 배지로 유도한다. NOT NULL 을 걸면 과거 행이 저장 불가가 된다.

alter table public.replacements
  add column if not exists old_serial        text,
  add column if not exists removal_code      text,
  add column if not exists removal_tread_min numeric,
  add column if not exists casing_grade      text,
  add column if not exists retreadable       boolean,
  add column if not exists downtime_minutes  integer,
  add column if not exists removal_note      text;

-- 제약은 컬럼 추가와 분리한다. 재실행 시 add column 이 건너뛰어도 확인된다.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.replacements'::regclass
                    and conname  = 'replacements_removal_code_fkey') then
    alter table public.replacements
      add constraint replacements_removal_code_fkey
      foreign key (removal_code) references public.damage_codes(code);
  end if;

  -- 신품 22mm 인데 상한을 60 으로 둔다. 규격이 다른 타이어가 들어와도
  -- 제약이 먼저 걸려 입력을 막는 일이 없게 한다. 오타 방어가 목적이다.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.replacements'::regclass
                    and conname  = 'replacements_removal_tread_min_check') then
    alter table public.replacements
      add constraint replacements_removal_tread_min_check
      check (removal_tread_min is null
             or (removal_tread_min >= 0 and removal_tread_min <= 60));
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.replacements'::regclass
                    and conname  = 'replacements_casing_grade_check') then
    alter table public.replacements
      add constraint replacements_casing_grade_check
      check (casing_grade is null or casing_grade in ('A','B','C','REJECT'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.replacements'::regclass
                    and conname  = 'replacements_downtime_minutes_check') then
    alter table public.replacements
      add constraint replacements_downtime_minutes_check
      check (downtime_minutes is null or downtime_minutes >= 0);
  end if;
end $$;

comment on column public.replacements.old_serial is
  '탈거한 타이어 시리얼. v_tire_mount_history 로 역산 가능하나 관측 사실로 명시 기록한다.';
comment on column public.replacements.removal_code is
  '탈착 사유. damage_codes 재사용 — TCO 귀속은 damage_codes.tco_category 를 경유한다.';
comment on column public.replacements.removal_tread_min is
  '탈착 시점 4점 최소 트레드(mm). 실현 마모율의 분자다.';
comment on column public.replacements.casing_grade is
  '케이싱 등급 A/B/C/REJECT. 재생 가능 여부와 회수액(casing_value) 판단 근거.';
comment on column public.replacements.retreadable is
  '재생 가능 여부. true 면 회수액에 casing_value, 아니면 scrap_value 를 쓴다.';
comment on column public.replacements.downtime_minutes is
  '교체로 인한 정지 시간(분). downtime_rate_hour 와 곱해 TCO 에 들어간다.';

do $$
declare v_missing text;
begin
  select string_agg(c, ', ') into v_missing
    from unnest(array['old_serial','removal_code','removal_tread_min',
                      'casing_grade','retreadable','downtime_minutes','removal_note']) c
   where not exists (
     select 1 from information_schema.columns
      where table_schema='public' and table_name='replacements' and column_name = c);
  if v_missing is not null then
    raise exception '추가되지 않은 컬럼: %', v_missing;
  end if;
end $$;
