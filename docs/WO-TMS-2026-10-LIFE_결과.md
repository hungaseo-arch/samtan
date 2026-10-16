# WO-TMS-2026-10-LIFE 결과 보고 — 수명·주행거리 보정

- 작업일: 2026-10-16 · 브랜치 `feat/life-km-correction`
- prod(`vndbzanhoumhhuneufni`) 반영: **안 함.** 새 마이그레이션 2건은 로컬 DB 에서만 적용·검증했다.
  아래 prod 수치는 새 뷰 본문을 CTE 로 감싸 **읽기 전용 SELECT** 로 계산한 값이다.
- 확인 대기: §5. 마이그레이션 적용(`supabase db push`)과 백필 실행은 사용자 승인 뒤에 한다.

---

## 1. 산출물

| Task | 파일 |
|---|---|
| T-3 뷰 | `supabase/migrations/20261016140000_v_odometer_anomaly.sql` — `tire_config.odo_*` 3열 + `v_odometer_anomaly` |
| T-1 | `supabase/migrations/20261016150000_v_tire_ledger_interpolate.sql` — 보간 원장, `v_tire_ledger_total.approx_segments` |
| T-2 | `src/components/LifeTab.tsx` · `src/data/tmsUtils.ts`(`lifeCalc.kmIsLowerBound`) · `src/data/tmsData.ts` · `src/data/loadData.ts` |
| T-3 폼 | `src/lib/odometerCheck.ts`(+test) · `src/components/InspectionTab.tsx` · `src/components/admin/SettingsPanel.tsx` · `src/api/config.ts` |
| T-4 | `src/components/ReplacementEntryModal.tsx` · `docs/backfill_removal_code_20261016.sql`(**미실행**) |
| T-5 | `src/lib/resultSummary.ts`(+test) · `src/components/ResultSummaryCard.tsx` · `src/components/WearAnalysisTab.tsx` |
| T-6 | `docs/사용설명서.md`(§3.5 · §3.6 · §3.10 · 판정 기준 표) · `docs/decisions.md`(L-1~L-4, 미결 M-1~M-5) · `CHANGELOG.md` · 이 문서 |

## 2. T-1 검증 — 원장 구간 km 전·후 (prod, 읽기 전용)

경계 km 우선순위: **REPLACEMENT → INSPECTION → INTERPOLATED → PREV_ROUND(`APPROX`)**.
전 = 현재 `v_tire_ledger`(OK 합), 후 = 새 뷰(OK + APPROX 합). TECHKING 시리얼 29본, NONTK 제외.
방법 열은 «시작/끝», `-` 는 장착일이 없는 최초 장착분(NO_KM).

| 시리얼 | 위치 | 방법 | 전 (km) | 후 (km) | 차이 | 하한값 |
|---|---|---|---:|---:|---:|:-:|
| DA1BFANH04814D | 824 R2 In 외 4 | INTERPOLATED/LAST_ROUND 외 | 58,389.2 | 49,618.0 | −8,771.2 | ○ |
| DA12511H03129D | 832 L3 Out, 834 R1 | INTERPOLATED/INTERPOLATED · /LAST_ROUND | 40,364.3 | 33,886.7 | −6,477.6 | |
| DA1BFBPH02432D | 824 R3 Out, 839 R3 In | INTERPOLATED/INTERPOLATED · /LAST_ROUND | 44,357.9 | 37,916.2 | −6,441.7 | |
| DA12510H11576D | 839 R2 Out, 849 R2 Out | INTERPOLATED/LAST_ROUND | 6,814.8 | 619.5 | −6,195.3 | ○ |
| DA1BFBPH02428D | 839 L2 In, 839 R2 In | INTERPOLATED/LAST_ROUND | 6,814.8 | 619.5 | −6,195.3 | ○ |
| DA12511H03130D | 824 R3 Out, 835 L2 Out | INTERPOLATED/INTERPOLATED | 17,512.9 | 23,341.6 | +5,828.7 | ○ |
| DA12511H03029D | 839 R3 In, 849 L3 Out | INTERPOLATED/LAST_ROUND | 6,814.8 | 1,239.1 | −5,575.7 | ○ |
| DA12511H03159D | 835 L3 Out, 839 L3 Out | INTERPOLATED/INTERPOLATED · /LAST_ROUND | 21,865.9 | 16,483.0 | −5,382.9 | |
| DA12511H03031D | 839 R3 Out | INTERPOLATED/LAST_ROUND | 43,725.3 | 38,478.3 | −5,247.0 | |
| DA1BFANH05089D | 834 L3 In, 839 R3 In | INTERPOLATED/LAST_ROUND | 22,991.0 | 18,630.9 | −4,360.1 | ○ |
| DA1BFBPH02653D | 834 L3 In, 849 R2 In · R3 Out | INSPECTION/INTERPOLATED | 16,463.4 | 20,823.5 | +4,360.1 | ○ |
| DA1BFBPH02689D | 839 L3 In | INTERPOLATED/INTERPOLATED | 49,214.6 | 46,261.4 | −2,953.2 | |
| DA12511H03052D | 834 R1, 839 L2 In | INTERPOLATED/INTERPOLATED | 36,910.5 | 34,023.8 | −2,886.7 | ○ |
| DA1BFANH10245D | 832 L2 In, 849 L1 | INTERPOLATED/LAST_ROUND | 6,934.7 | 4,097.8 | −2,836.9 | ○ |
| DA1BFANH05098D | 835 L2 In, 835 L3 Out | INTERPOLATED/LAST_ROUND | 31,197.1 | 28,490.9 | −2,706.2 | ○ |
| DA12511H03162D | 834 R2 In, 839 L3 Out | INTERPOLATED/INTERPOLATED | 39,523.9 | 37,029.8 | −2,494.1 | ○ |
| DA12510H11571D | 835 L2 Out, 839 L1 | INTERPOLATED/INTERPOLATED | 34,489.2 | 36,872.2 | +2,383.0 | ○ |
| DA12511H03161D | 835 R3 In, 849 R2 Out | INTERPOLATED/INTERPOLATED | 24,856.2 | 26,853.0 | +1,996.8 | ○ |
| DA1BFANH04818D | 835 L3 In, 839 L1 | INTERPOLATED/INTERPOLATED · /LAST_ROUND | 41,984.3 | 40,049.4 | −1,934.9 | |
| DA12511H03154D | 824 R2 In, 839 L3 In | INTERPOLATED/LAST_ROUND | 12,232.9 | 10,565.8 | −1,667.1 | ○ |
| DA1BFANH04813D | 824 R2 In, 824 R3 Out | INTERPOLATED/INTERPOLATED | 12,650.8 | 11,211.8 | −1,439.0 | ○ |
| DA1BFBPH02474D | 835 R2 Out, 839 L2 Out | INSPECTION · INTERPOLATED/LAST_ROUND | 6,814.8 | 5,885.5 | −929.3 | ○ |
| DA1BFANH04816D | 835 R2 In, 839 L2 In | INSPECTION · INTERPOLATED/LAST_ROUND | 6,814.8 | 5,885.5 | −929.3 | ○ |
| DA12511H03160D | 832 L2 Out 외 2 | INSPECTION · INTERPOLATED/INTERPOLATED | 5,635.9 | 6,344.0 | +708.1 | ○ |
| DA1BFBPH02574D | 839 L3 Out | INTERPOLATED/INTERPOLATED | 54,426.8 | 53,860.1 | −566.7 | |
| DA1BFANH07686D | 835 L2 In, 839 R3 Out | INTERPOLATED/INTERPOLATED | 34,489.2 | 35,037.3 | +548.1 | ○ |
| DA12511H03030D | 834 L3 Out | INTERPOLATED/LAST_ROUND | 33,590.7 | 33,499.6 | −91.1 | |
| DA1BFANH07618D | 834 L1, 835 R2 In | INSPECTION/LAST_ROUND | 6,340.9 | 6,340.9 | 0.0 | ○ |
| DA1BFANH04849D | 835 L3 In, 835 R2 Out | INSPECTION/LAST_ROUND | 6,340.9 | 6,340.9 | 0.0 | ○ |

- 감소가 다수인 것은 L-1(장착일 이전 회차 사용 → 과대)과 일치한다. 증가 6건은 모두 끝 경계가 INTERPOLATED 인 시리얼로,
  예전 방식에서 빠져 있던 탈착 직전 구간이 보간으로 채워진 것으로 본다.
- 교체 KM(`replacements.km_at`)이 63건 전부 NULL 이라 REPLACEMENT 방법은 아직 한 건도 없다 — T-4 이후 입력분부터 쓰인다.
- 현재 데이터에서는 APPROX(뒤 회차 없음) 구간이 나오지 않는다.

## 3. 수명 DB 평균 주행 km 전·후

| 구분 | 본수 | 전 | 후 |
|---|---:|---:|---:|
| 전체 평균 | 29 | 25,191.8 km | 23,114.0 km |
| 하한값 제외 평균 (최초 장착 NO_KM 구간이 없는 시리얼) | 8 | 41,191.2 km | 37,554.3 km |

- 값이 바뀐 시리얼 27 / 29. 하한값 제외 평균이 −8.8% — L-1 과대평가 크기의 대략치다.
- 전체 평균은 하한값 21본이 섞여 있어 실제 평균 수명보다 낮다. 화면 평균 행은 하한값 제외 평균으로 대체했다 (사용자 결정 2026-10-16, M-4).
- 위 숫자는 원장(`v_tire_ledger_total` 과 같은 합산) 기준이다. 수명 DB 화면의 «주행 KM» 은 OK 구간이 있는 시리얼은 원장과 같고,
  최초 장착분만 있는 시리얼은 측정 회차 span 폴백이라 `(하한값)` 표시로 구분된다.

## 4. `v_odometer_anomaly` 목록 (prod, 같은 규칙의 읽기 전용 계산)

임계: 800 km/일 · 60 km/h · 24 h/일. 원본 `inspections` 값 기준(계기 리셋 보정 전).

| 차량 | 구간 | 일수 | ΔKM | ΔHM | km/일 | km/h | h/일 | 플래그 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| CH 847 | 2026-07-12 → 07-26 | 14 | 46,297.1 | 263.0 | 3,306.9 | 176.0 | 18.8 | KM_DAILY, SPEED |
| CH 832 | 05-23 → 06-14 | 22 | 8,824.4 | 666.0 | 401.1 | 13.2 | 30.3 | HM_DAILY |
| CH 832 | 06-14 → 07-05 | 21 | 10,565.4 | 1,110.9 | 503.1 | 9.5 | 52.9 | HM_DAILY |
| CH 832 | 07-05 → 07-26 | 21 | 9,437.8 | 1,530.4 | 449.4 | 6.2 | 72.9 | HM_DAILY |
| CH 832 | 07-26 → 08-09 | 14 | 6,986.4 | 1,815.3 | 499.0 | 3.8 | 129.7 | HM_DAILY |
| CH 832 | 08-09 → 08-23 | 14 | 6,519.5 | 2,110.7 | 465.7 | 3.1 | 150.8 | HM_DAILY |
| CH 832 | 08-23 → 09-05 | 13 | 5,635.9 | 2,391.0 | 433.5 | 2.4 | 183.9 | HM_DAILY |
| CH 832 | 09-05 → 09-27 | 22 | 6,934.7 | 2,723.1 | 315.2 | 2.5 | 123.8 | HM_DAILY |
| CH 835 | 06-14 → 07-05 | 21 | 9,633.0 | 668.0 | 458.7 | 14.4 | 31.8 | HM_DAILY |
| CH 835 | 07-05 → 07-26 | 21 | 8,118.5 | 1,070.3 | 386.6 | 7.6 | 51.0 | HM_DAILY |
| CH 835 | 07-26 → 08-09 | 14 | 6,492.3 | 1,356.7 | 463.7 | 4.8 | 96.9 | HM_DAILY |
| CH 835 | 08-09 → 08-23 | 14 | 6,094.4 | 1,653.1 | 435.3 | 3.7 | 118.1 | HM_DAILY |
| CH 835 | 08-23 → 09-05 | 13 | 4,151.0 | 1,881.6 | 319.3 | 2.2 | 144.7 | HM_DAILY |
| CH 835 | 09-05 → 09-27 | 22 | 6,340.9 | 2,205.8 | 288.2 | 2.9 | 100.3 | HM_DAILY |

- **CH 847 07-12** 은 지시서 D-3 그대로다. 지시서의 추정 정정값 129,100 은 M-1 확인 대상이며 코드로 고치지 않았다.
- **CH 832 · 835** 는 HM 증분이 회차마다 커진다(666 → 2,723 h). 매 회차 HM 이 누적에 다시 더해진 «이중 누적» 패턴으로 보인다.
  HM Reset 차량이라 계기 리셋 보정값 입력 여부와 함께 원본 점검표 확인이 필요하다(M-3).
- 별도 관찰: CH 832 와 835 는 2026-04-12 ~ 05-10 회차 KM 이 같은 값이다 — 한 차량 값을 두 차량에 옮겨 적은 것으로 의심된다.
- CH 834 는 이상 구간이 없다(최대 460 km/일 · 26 km/h · 22 h/일). CH 849 는 KM 기록이 없어 전 구간 NO_KM.

## 5. 판단 기록

**결과 요약 배지의 NO_KM 해석 (decisions L-4).** 지시서 T-5 는 «km_flag≠OK → 데이터 확인 필요» 와
«834 L1 → 정상 또는 주의» 를 함께 요구한다. 834 L1(DA1BFANH07618D)은 seq 0 최초 장착분이라 NO_KM 이고, 원문대로면
«데이터 확인 필요» 가 되어 기대값과 충돌한다. 최초 장착분 NO_KM 은 장착 전 주행을 원래 모르는 **구조적 하한값**이고
플릿 전체가 해당하므로 배지를 올리지 않고 데이터 줄에 안내만 하도록 해석했다. 장착일이 있는 구간의 NO_KM(예: CH 849)과
KM_DECREASE 는 그대로 «데이터 확인 필요». APPROX 는 거리로 쓰는 값이라 안내만 한다.
결과: 834 L1 = 정상/주의(발주 일정·CV 에 따라), 847 L1 = 데이터 확인 필요(07-12→07-26 이상 구간이 측정 기간과 겹침).

**지시서 결함 번호.** decisions.md 의 §0 표가 이미 D-1~D-3 을 쓰고 있어 이 작업의 결함은 L-1~L-3 으로 적었다.

## 6. 완료 조건 (DoD)

| 항목 | 결과 |
|---|---|
| `npm run lint` | ✅ 오류 0 (경고 1 — 기존 `AuthProvider.tsx`) |
| `npx tsc --noEmit -p tsconfig.app.json` | ✅ |
| `lifeProjection.test.ts` | ✅ |
| 신규 테스트 `odometerCheck.test.ts`(10) · `resultSummary.test.ts`(5) | ✅ — 전체 vitest 통과 |
| 마이그레이션 `20261016130000` 이후 · 멱등 · DROP/TRUNCATE 없음 | ✅ 로컬 DB 적용·재적용 확인 |
| 수치 덮어쓰기 없음 — 방법을 `km_method` 에 기록 | ✅ |
| 데이터 오류 코드 정정 없음 (847 07-12) | ✅ 검출만 |
| 백필 미실행 | ✅ `ROLLBACK` 으로 끝나는 초안만 |
| `docs/사용설명서.md` 갱신 | ✅ |
| prod 적용 | ⏸ 승인 대기 (M-5) |

## 7. 사용자 확인 요청 (지시서 §4)

**2026-10-16 회신:** M-1 추후 확인 · M-2 진행 · M-3 추후 확인 · M-4 하한값 제외로 대체 · M-5 진행.
백필은 `supabase/migrations/20261016160000_backfill_removal_code.sql` 로 옮겼다(로컬 2회 적용 확인, prod 예상 ROT 32 · WO 21 · CD 2 · SC 1 · NULL 7 재확인).
**prod 적용은 아직 안 됐다** — 로컬 Supabase CLI 가 실행 즉시 SIGKILL 되어 `supabase db push` 를 돌리지 못했다.


1. **M-1** CH 847 2026-07-12 회차 KM 정정값 — 추정 129,100. 원본 점검표로 확인되면 해당 회차를 소프트 삭제하고 새로 입력.
2. **M-2** `docs/backfill_removal_code_20261016.sql` 실행 여부 — ROT 32 · WO 21 · CD 2 · SC 1 채움, 근거 없는 7건은 NULL 유지.
3. **M-3** 주행계 임계 800 km/일 · 60 km/h · 24 h/일 이 현장에 맞는지. CH 832·835 HM 이중 누적 의심 건 포함.
4. **M-4** 수명 DB 평균 행 — 하한값 제외 평균을 **병기**(현재 구현)할지 전체 평균을 **대체**할지.
5. **M-5** 마이그레이션 2건 prod `supabase db push` 승인.
