-- 마모 패턴 손상코드 3종 추가 — CW / SW / AL
--
-- 근거: docs/제안_TEMUAN-damage_code-매핑.md §2 (나) · 사용자 승인 2026-08-27
--
-- 왜 IW 로 흡수하지 않는가.
--   IW(Irregular Wear) 는 "고르게 안 닳았다" 까지만 말하고 멈춘다. 중앙 마모와
--   숄더 마모는 원인이 정반대다 — 중앙은 과공기압, 숄더는 저공기압·과하중.
--   한 코드에 합치면 "공기압을 올려야 하나 내려야 하나" 에 답할 수 없고,
--   §0.3 에서 실증한 중앙 52.2% 대 숄더 1.8% 라는 비대칭이 집계에서 사라진다.
--   그 비대칭이 Techking 클레임의 근거다.
--
-- AL 은 결이 다르다. CW·SW 는 타이어에서 관찰한 현상이고 AL 은 그 현상을 만든
-- 차량 쪽 원인이다. 기존 표에도 SWB(Spot Wear Brake) 처럼 원인이 이름에 붙은
-- 코드가 있어 표의 성격상 예외는 아니다. 다만 한 점검에 SW 와 AL 이 함께
-- 붙어야 맞으므로, 다대일 소견 표(inspection_findings)는 별도 승인 후에 만든다.
--
-- seq 는 14·15·16 을 쓴다. 기존 0~13 은 한 값도 건드리지 않는다.
-- 그 결과 OTH(Other, seq 13) 가 목록 끝이 아니게 된다. 순서를 되돌리려면
-- OTH 를 16 으로 옮기는 UPDATE 가 필요한데, 승인 범위 밖이라 하지 않는다.
--
-- damage_codes 는 참조 표이고 code 가 기본키다. 재실행하면 description·seq 만
-- 덮어쓰므로 몇 번을 돌려도 같다. lifetimes.damage 의 기존 값은 영향받지 않는다.

insert into public.damage_codes (code, description, seq) values
  ('CW', 'Center Wear',   14),
  ('SW', 'Shoulder Wear', 15),
  ('AL', 'Alignment',     16)
on conflict (code) do update
   set description = excluded.description,
       seq         = excluded.seq;

do $$
declare v_n int; v_dup int;
begin
  select count(*) into v_n from public.damage_codes
   where code in ('CW', 'SW', 'AL');
  if v_n <> 3 then
    raise exception '손상코드 3종이 들어가지 않았다 — %건', v_n;
  end if;

  -- 기존 14종이 그대로인지. 하나라도 사라지면 여기서 멈춘다.
  select count(*) into v_n from public.damage_codes
   where code in ('WO','SC','BC','BB','SHC','ILB','CD','SWB',
                  'IW','SCF','BO','RF','ORF','OTH');
  if v_n <> 14 then
    raise exception '기존 손상코드가 %건이다 (14 이어야 한다)', v_n;
  end if;

  -- seq 는 화면 정렬 키다. 겹치면 순서가 흔들린다.
  select count(*) into v_dup from (
    select seq from public.damage_codes group by seq having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise exception 'seq 가 겹치는 값이 %개 있다', v_dup;
  end if;
end $$;
