-- ============================================================
-- Samtan TMS — T-102. 제약조건 및 인덱스 추가
--
-- 근거: 작업지시서 §4 T-102 / 부록 A.
-- 전제: T-101(이상치 정정) 적용 완료 — pressure = 10 · 13 이 각각 110 · 120 으로
--       정정되어 있어야 ck_pressure 가 통과합니다.
--
-- 부록 A 대비 생략한 항목 (이미 존재 — 중복 생성 시 인덱스만 2벌이 됩니다):
--   · uq_inspection          → 유니크 인덱스 inspections_ch_date_pos_uniq 가 동일 역할
--   · idx_insp_ch_date       → 인덱스 inspections_ch_date_idx 가 동일
--   · fk_vp_vehicle          → 제약 vehicle_positions_ch_fkey 가 동일
--
-- 적용 전 프로덕션 데이터 전수 검증 결과 (2026-08-03, 330행):
--   pressure 범위 76.5 ~ 132 · tread 범위 0 ~ 22 · 음수 hm/km 0건 ·
--   고아 (ch,pos) 0건 · (ch,date,pos) 중복 0건 → 위반 0건
--
-- 멱등성: drop constraint if exists + add constraint / create index if not exists
-- ============================================================

-- ── 값 검증 ────────────────────────────────────────────────
-- NULL 은 "미측정"을 뜻하므로 모두 허용합니다 (내측 듀얼 타이어의 공기압 = N/A 등).

alter table public.inspections drop constraint if exists ck_pressure;
alter table public.inspections
  add constraint ck_pressure
  check (pressure is null or pressure between 60 and 200);

alter table public.inspections drop constraint if exists ck_tread;
alter table public.inspections
  add constraint ck_tread
  check (tread is null or tread between 0 and 60);

-- 부록 A 의 `hm >= 0 AND km >= 0` 는 한쪽이 NULL 이면 결과가 NULL 이 되어
-- CHECK 상 통과합니다. 의도는 같지만 판정을 명시적으로 씁니다.
alter table public.inspections drop constraint if exists ck_meter;
alter table public.inspections
  add constraint ck_meter
  check ((hm is null or hm >= 0) and (km is null or km >= 0));

comment on constraint ck_pressure on public.inspections is
  '공기압 60 ~ 200 psi. 하한 60 은 지시서 부록 A 값이며 실측 최저는 76.5 psi (사용자 확인 필요)';
comment on constraint ck_tread on public.inspections is
  '트레드 0 ~ 60 mm. 신품 22 mm, 0 mm = 완전 마모';
comment on constraint ck_meter on public.inspections is
  'HM · KM 음수 금지';

-- ── 참조 무결성 ────────────────────────────────────────────
-- ON DELETE 를 지정하지 않아 기본값 NO ACTION 입니다. 점검 이력이 남아 있는 한
-- 포지션(과 그 상위 차량)을 지울 수 없습니다 — §3.1-3 의 "측정 레코드 DELETE 금지"와
-- 같은 방향의 보호막입니다.

alter table public.inspections drop constraint if exists fk_insp_position;
alter table public.inspections
  add constraint fk_insp_position
  foreign key (ch, pos) references public.vehicle_positions (ch, pos);

alter table public.replacements drop constraint if exists fk_repl_position;
alter table public.replacements
  add constraint fk_repl_position
  foreign key (ch, pos) references public.vehicle_positions (ch, pos);

-- ── 조회 인덱스 ────────────────────────────────────────────
-- 시리얼 단건 조회(수명 DB → 타이어 이력)와 전 차량 최신 회차 조회에 쓰입니다.
create index if not exists idx_insp_serial on public.inspections (serial);
create index if not exists idx_insp_date   on public.inspections (inspection_date desc);
