-- T-6 · v_removal_analysis — 사유별 수명 분포
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-6
--
-- tco_category = 'PRODUCT' 인 행만으로 산출한 평균 수명이 대외 벤치마크에
-- 쓸 수 있는 유일한 모수다. 표면 손상이나 정비 사유로 빠진 타이어를 섞으면
-- 제품 수명을 실제보다 짧게 말하게 된다.
--
-- 지금은 replacements 27건 전부 removal_code 가 NULL 이라 tco_category 도
-- NULL 로 나온다. 이것이 정상이며, 화면(T-10)에서 사유 입력을 유도한 만큼
-- 표가 채워진다. 빈 값을 OTH 나 WO 로 추정해 채우지 않는다.

create or replace view public.v_removal_analysis as
select r.id,
       r.ch, r.pos,
       r.date as removal_date,
       r.old_serial as serial,
       r.new_serial,
       r.removal_code,
       d.description,
       d.description_id,
       d.tco_category,
       r.removal_tread_min,
       r.casing_grade,
       r.retreadable,
       r.downtime_minutes,
       t.cumulative_km,
       t.vehicle_count,
       t.invalid_segments,
       c.new_tread,
       -- 실현 마모율 mm/1,000km. 분모가 하한값(invalid_segments>0)이면
       -- 이 값은 과대평가다 — 호출부는 invalid_segments 를 함께 봐야 한다.
       case
         when t.cumulative_km is not null and t.cumulative_km > 0
          and c.new_tread is not null and r.removal_tread_min is not null
         then (c.new_tread - r.removal_tread_min) / t.cumulative_km * 1000
       end as realized_wear_rate
  from public.replacements r
  left join public.damage_codes d          on d.code   = r.removal_code
  left join public.v_tire_ledger_total t   on t.serial = r.old_serial
  cross join lateral (
    -- tire_config 는 단일 설정 행이다. 여러 행이 되면 limit 1 이 임의 선택을
    -- 하므로, 규격별 신품 트레드가 필요해지는 시점에 size 조인으로 바꾼다.
    select new_tread from public.tire_config order by id limit 1
  ) c
 where r.deleted_at is null;

alter view public.v_removal_analysis set (security_invoker = on);
grant select on public.v_removal_analysis to anon, authenticated;

comment on view public.v_removal_analysis is
  '탈착 사유별 수명 분포. 제품 수명 벤치마크는 tco_category = PRODUCT 로 거른 뒤에만 산출한다.';
