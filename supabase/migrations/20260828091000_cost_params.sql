-- T-3 · cost_params — 비용 파라미터 마스터 (이력형)
--
-- 근거: docs/WO-TMS-2026-09-TCO.md §2 T-3
--
-- 단가를 코드에 박지 않고 이력 표로 둔다. 단가가 바뀌어도 과거 CPK 가
-- 소급 변경되지 않아야 하기 때문이다. 적용 규칙은 pressure_targets 와 같다:
-- 기준일 이전 중 effective_from 이 가장 최근인 행 하나.
--
-- unit_price 는 NULL 허용이 핵심이다. 본당 IDR 6,000,000 은 역산 추정치라
-- 확정 전에는 넣지 않는다 (§1-5). NULL 이면 화면이 '단가 미확정' 을 띄운다.
-- 추정치를 하드코딩하면 그 숫자가 누군가의 확정값으로 굳는다.

create table if not exists public.cost_params (
  id                   uuid primary key default gen_random_uuid(),
  effective_from       date not null,
  brand                text,             -- NULL = 전체 적용
  size                 text,
  unit_price           numeric,          -- 본당 단가 IDR. NULL = 미확정
  freight_per_tire     numeric,          -- 본당 운송 배분액
  mount_cost           numeric,          -- 장착 + 탈착 공임
  repair_avg           numeric,          -- 건당 수리 평균
  pressure_check_cost  numeric,          -- 회차당 공기압 점검 배분액
  downtime_rate_hour   numeric,          -- 고객사 시간당 기회손실
  casing_value         numeric,          -- 재생 가능 케이싱 회수액
  scrap_value          numeric,          -- 스크랩 매각액
  retread_cost         numeric,          -- 재생 비용
  retread_life_km      numeric,          -- 재생 후 기대 수명
  currency             text not null default 'IDR',
  note                 text,
  -- 감사 컬럼 — 기존 테이블과 동일 패턴
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  updated_by           uuid,
  created_by_email     text,
  updated_by_email     text,
  deleted_at           timestamptz
);

create index if not exists cost_params_effective_from_idx
  on public.cost_params (effective_from desc);

comment on table public.cost_params is
  'TCO 비용 파라미터 이력. 기준일 이전 중 effective_from 최신 행을 적용한다. '
  'unit_price NULL = 단가 미확정 — 화면은 금액 대신 미확정을 표시해야 한다.';

-- 감사 트리거 — replacements 와 같은 함수 재사용. 마스터 표라
-- 수명 동기화 계열(ensure_lifetime_row 등)은 붙이지 않는다.
drop trigger if exists trg_cost_params_audit      on public.cost_params;
drop trigger if exists trg_cost_params_updated_at on public.cost_params;
drop trigger if exists trg_cost_params_log        on public.cost_params;
create trigger trg_cost_params_audit
  before insert or update on public.cost_params
  for each row execute function public.set_audit_fields();
create trigger trg_cost_params_updated_at
  before update on public.cost_params
  for each row execute function public.set_updated_at();
create trigger trg_cost_params_log
  after insert or delete or update on public.cost_params
  for each row execute function public.log_audit('id');

-- RLS — 조회는 공개(화면 산출에 필요), 쓰기는 admin 전용.
-- 단가·기회손실 단가는 점검자 입력 대상이 아니라 관리자 결정 사항이다.
alter table public.cost_params enable row level security;
drop policy if exists "cost_params public select" on public.cost_params;
drop policy if exists "cost_params admin insert"  on public.cost_params;
drop policy if exists "cost_params admin update"  on public.cost_params;
drop policy if exists "cost_params admin delete"  on public.cost_params;
create policy "cost_params public select" on public.cost_params
  for select using (true);
create policy "cost_params admin insert" on public.cost_params
  for insert to authenticated with check (public.app_role() = 'admin');
create policy "cost_params admin update" on public.cost_params
  for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy "cost_params admin delete" on public.cost_params
  for delete to authenticated using (public.app_role() = 'admin');

-- 초기 데이터 — 전 항목 NULL 1행. 추정치를 넣지 않는다 (§1-5).
insert into public.cost_params (effective_from, note)
select '2026-04-01'::date,
       '단가 확인 대기 — 보고서 9장 참조. 확정 전까지 전 항목 NULL 유지.'
 where not exists (select 1 from public.cost_params);

do $$
declare v_n int; v_price numeric;
begin
  select count(*) into v_n from public.cost_params where deleted_at is null;
  if v_n < 1 then
    raise exception 'cost_params 초기 행이 없다';
  end if;
  select unit_price into v_price
    from public.cost_params order by effective_from desc limit 1;
  if v_price is not null then
    raise exception '단가는 아직 미확정이어야 한다 — unit_price = %', v_price;
  end if;
end $$;
