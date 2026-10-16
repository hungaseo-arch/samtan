-- cost_params — TECHKING ETCRANE 14.00R24 2026년 가격 (부가세 미포함)
--
-- 근거: 사용자 제공값 2026-10-16
--   · 판매가 IDR 13,000,000 / 본 → unit_price (CPK·총비용의 기준. SAMTAN 이 실제 지불하는 값)
--   · 시장가 IDR 15,000,000 / 본 → market_price (참고값. 화면의 «시장가 대비» 비교에만 쓴다)
--   · 적용: 2026-01-01 부터, brand = 'TECHKING' 만. 경쟁제품(NONTK) 단가는 여전히 미확정이라
--     NONTK 타이어의 CPK 는 계속 NULL 이다 — 같은 단가를 씌우지 않는다 (CLAUDE.md 절대금지 6).
--
-- 2026-04-01 자리표시 행(전 항목 NULL)은 소프트 삭제한다. 남겨 두면 «기준일 이전 중 최신 행»
-- 규칙에 따라 4월 이후 장착분이 다시 NULL 단가를 집어 든다.
-- 멱등: 컬럼은 IF NOT EXISTS, 행은 (effective_from, brand, size) 로 ON CONFLICT 대신 존재 검사 후 갱신.

alter table public.cost_params
  add column if not exists market_price numeric;

comment on column public.cost_params.market_price is
  '본당 시장가(참고값). CPK 계산에는 쓰지 않는다 — unit_price(판매가)와의 차이를 «시장가 대비 절감» 으로만 표시.';

-- 2026 단가 행 — 있으면 값만 맞추고, 없으면 넣는다
update public.cost_params
   set unit_price   = 13000000,
       market_price = 15000000,
       currency     = 'IDR',
       note         = '2026년 가격 · 부가세(PPN) 미포함 — 판매가 IDR 13,000,000 / 시장가 IDR 15,000,000 (사용자 제공 2026-10-16)'
 where effective_from = '2026-01-01'
   and brand = 'TECHKING' and size = '14.00R24'
   and deleted_at is null;

insert into public.cost_params (effective_from, brand, size, unit_price, market_price, currency, note)
select '2026-01-01'::date, 'TECHKING', '14.00R24', 13000000, 15000000, 'IDR',
       '2026년 가격 · 부가세(PPN) 미포함 — 판매가 IDR 13,000,000 / 시장가 IDR 15,000,000 (사용자 제공 2026-10-16)'
 where not exists (
   select 1 from public.cost_params
    where effective_from = '2026-01-01' and brand = 'TECHKING' and size = '14.00R24'
      and deleted_at is null
 );

-- 자리표시 행 소프트 삭제 — 값이 하나라도 들어간 행은 건드리지 않는다
update public.cost_params
   set deleted_at = now()
 where deleted_at is null
   and effective_from = '2026-04-01'
   and brand is null and size is null
   and unit_price is null and market_price is null
   and freight_per_tire is null and mount_cost is null and repair_avg is null
   and pressure_check_cost is null and downtime_rate_hour is null
   and casing_value is null and scrap_value is null
   and retread_cost is null and retread_life_km is null;

do $$
declare v_price numeric; v_n int;
begin
  select unit_price into v_price
    from public.cost_params
   where deleted_at is null and brand = 'TECHKING'
     and effective_from <= current_date
   order by effective_from desc limit 1;
  if v_price is distinct from 13000000 then
    raise exception 'TECHKING 현재 단가가 13,000,000 이 아니다 — %', v_price;
  end if;
  select count(*) into v_n
    from public.cost_params
   where deleted_at is null and (brand is null or brand = 'NONTK') and unit_price is not null;
  if v_n > 0 then
    raise exception 'NONTK 에 적용되는 단가 행이 생겼다 (% 행) — 경쟁제품 단가는 미확정이어야 한다', v_n;
  end if;
end $$;

-- ============================================================
-- ROLLBACK:
--   ※ CLAUDE.md 절대금지 4 — drop column 금지. 값을 되돌린다.
--   update public.cost_params set deleted_at = now()
--    where effective_from = '2026-01-01' and brand = 'TECHKING' and size = '14.00R24' and deleted_at is null;
--   update public.cost_params set deleted_at = null
--    where effective_from = '2026-04-01' and brand is null and unit_price is null;
-- ============================================================
