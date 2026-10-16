-- cost_params.retread_allowed — 재생타이어 시나리오 사용 여부
--
-- PT. Trasindo Murni Perkasa 는 정책상 재생타이어를 쓰지 않는다. 그렇다고 TCO 화면의
-- 재생 시나리오를 코드에서 지우면 재생을 쓰는 다른 고객사에서 되살릴 방법이 없다.
-- 기능은 그대로 두고 **켜고 끄는 스위치**를 원가 설정에 둔다.
--
-- 값을 코드 상수나 빌드 플래그가 아니라 DB 에 두는 이유: 재생 사용 여부는 배포가 아니라
-- 고객사 정책이라 관리자가 재배포 없이 바꿀 수 있어야 한다. 임계치를 tire_config 에
-- 두는 것과 같은 이유다.
--
-- default false — 켜는 것이 명시적 결정이어야 한다. 기존 행도 전부 false 로 채워지고,
-- 이는 현재 고객사 정책과 일치한다.

alter table public.cost_params
  add column if not exists retread_allowed boolean not null default false;

comment on column public.cost_params.retread_allowed is
  '재생타이어 시나리오 사용 여부. false = 정책상 재생 미사용(기본값) — TCO 화면의 재생 시나리오 패널이 정책 안내로 대체된다.';

-- ============================================================
-- ROLLBACK:
--   ※ CLAUDE.md 절대금지 4 — drop column 금지. 되돌릴 때는 값을 false 로 되돌린다.
--   update public.cost_params set retread_allowed = false;
-- ============================================================
