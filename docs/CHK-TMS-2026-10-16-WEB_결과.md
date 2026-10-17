# CHK-TMS-2026-10-16-WEB 결과 보고 — 웹사이트 개선

- 작업일: 2026-10-16 · 브랜치 `feat/web-improvements-20261016`
- prod(`vndbzanhoumhhuneufni`) 반영: 마이그레이션 3건 **적용 (2026-10-16, 사용자 승인 후 `supabase db push`, decisions M-7).**
  웹 코드는 미배포. 아래 prod 수치는 **읽기 전용 SELECT** 로 확인한 값이다.
- 사용자 결정 (2026-10-16): W-1 0 하나는 이상점 제외 · W-2 오래된 값 30일 · W-3 공기압 50 ~ 150 차단 + ±15% 경고 ·
  W-4 트레드 0 ~ 23 mm 소수 1자리 (`docs/decisions.md`).
- WO-TMS-2026-10-LIFE 와 겹치는 항목(KM·HM 급증, 탈착 사유, 하한값 표기)은 다시 손대지 않았다 (보고서 §7).
- 검증: `npm run typecheck` 통과 · `eslint src` 오류 0 (기존 경고 1, `AuthProvider.tsx`) · `vitest` 16파일 91건 통과.

---

## 1. 단계별 완료 조건 (보고서 §8)

| 단계 | 완료 기준 | 결과 |
|---|---|---|
| 1 현재 장착 단일 출처 | DA1BFANH07618D 가 전 화면에서 같은 위치 · CH 834 즉시교체 재산출 | **코드 충족.** 상태·최근값·추이 «현재»·수명 DB 위치 모두 `v_current_tire` 시리얼 기준(`loadData.buildSegments` · `tmsUtils.headPosData`). 교체 뒤 미측정 포지션은 «측정 대기»로 빠져 탈착 타이어의 08-23 0.0 mm 로 판정하지 않는다. 배포 후 화면 대조는 미실시 |
| 2 결측 규칙 | 내측 125 psi 거짓 알림 0건 · 즉시교체 재집계 | **충족.** 04-02 값은 `stale_days`(30) 초과로 알림·준수율에서 빠진다. 0 하나 이상점은 화면에서 제외(W-1), DB 뷰용 `OUTLIER` 표시는 마이그레이션 190000 으로 7점 적용(트리거 재계산 확인). C1·C2 동시 0(M-6, 72행·36본)은 규칙 밖 — 현장 확인 대상 |
| 3 예측 보정 | 교체 준비 목록에 14.0 mm 타이어 없음 | **충족.** DA1BFBPH02433D(마지막 측정 04-26)는 «측정 필요» 표로 이동. 발주 기준 이하는 잔여 0 km · 예상일 = 측정일(DA12510H11573D 잔여 8,353 km 해소). 경과 / 30일 / 60일 분리 |
| 4 입력 검증·임시저장 | 4종 이상값 저장 차단 · 새로고침 후 입력 복원 | **충족.** 트레드 −3·35 mm, 소수 2자리, 미래 점검일, 공기압 180 psi 차단. KM +920만은 WO-LIFE T-3 경고(체크 필수). 임시저장은 차량별 localStorage — 오프라인 큐·PWA 는 없음 |
| 5 지표 정의 통일 | 화면 간 동일 지표 수치 일치 | **부분.** REPL-01 · LAY-04 · DASH-06 · DASH-07 · TCO-04 완료. DASH-03 · TCO-01~03 은 정의가 사용자 결정 대상(§3) — 손대지 않음. DASH-04 미착수 |
| 6 공통 컴포넌트 | Esc 로 모든 모달·메뉴 닫힘 | **충족 (예외 1).** `useDialog` 로 모달 10종 + 헤더 메뉴 3종. 점검 입력의 «0 mm 사유 선택» 창만 Esc 를 받지 않는다 — 고르지 않으면 저장 의미가 정해지지 않는 필수 선택이라 의도적으로 뺐다. shadcn Dialog 교체가 아니라 기존 마크업에 훅을 붙였다(방향키 메뉴 이동은 없음) |
| 7 배포·보안 | 딥링크 HTTP 200 · 토큰 출처 분리 | **미충족.** COM-01·02 는 도메인 분리 결정(§3-7) 뒤. COM-08 라우트별 제목 완료, COM-07 은 탭 아이콘만 정사각 S 마크로 — manifest·apple-touch-icon 은 180 · 512 px 원본 이미지가 없어 보류 |
| 8 기능 추가 | — | 미착수 |

## 2. 항목별 처리

| ID | 처리 | 파일 |
|---|---|---|
| R-1 · LAY-01 · TRD-01 · LIFE-03 | 현재 구간 = 마지막 구간 ∧ 시리얼 = `v_current_tire`. 없으면 «측정 대기» | `src/data/loadData.ts` · `src/data/tmsUtils.ts` · `src/components/PosLatestRows.tsx` |
| R-2 · INP-02 · LIFE-04 | `effectiveTread()` — 0 하나 · 나머지 ≥ `tread_critical` 이면 제외, «이상점 제외» 배지 | `src/lib/treadRules.ts`(+test) · `20261016190000_…outlier.sql` |
| R-2 · LAY-02 · PRS-01 | `stale_days`(30). 공기압 판정·알림 제외, 트레드 정상만 «오래된 값» | `src/data/tmsData.ts` · `src/components/PressureTab.tsx` · `20261016170000_…stale_days.sql` |
| PRS-02 | 알림별 측정일·경과일, 측정 본수 = 판정한 본수 | `src/components/PressureTab.tsx` |
| R-3 · DASH-02 · LIFE-01·02 | 기준 이하 클램프, 경과/30/60 분리, «측정 필요» | `src/lib/lifeProjection.ts`(+test) · `src/components/DashboardTab.tsx` · `src/components/LifeTab.tsx` |
| R-4 · INP-01·03·05 | 범위·자리수·미래일 차단, ±15% · 최근 회차보다 앞 경고 | `src/lib/roundValidate.ts`(+test) · `src/lib/roundIssueText.ts` · `src/data/roundContext.ts` · `20261016180000_ck_pressure_50_150.sql` |
| INP-04 | 차량별 임시저장·복원·이탈 확인 | `src/components/InspectionTab.tsx` |
| INP-11 | 확인 결과 버튼 17개 모두 `type="button"`, `<form>` 없음 | — |
| WEAR-01 | C1·C2 동시 0 차량 «결측 의심», 평균에서 제외 | `src/components/WearAnalysisTab.tsx` |
| TCO-04 (· PRS-06 일부) | KM 2회차 미만 차량은 연료·수명 손실·저압 노출 «주행거리 미입력» — prod: CH 849 만 해당(10회차 중 KM 0) | `src/data/tmsUtils.ts`(`unitKmMissing`, +test) · `EconomicsSection.tsx` · `PressureHistorySection.tsx` |
| REPL-01 | 회차 열 = 가장 긴 체인 + 1. 엑셀 동일. DEV 에서 셀 수 ≠ 이력 건수면 콘솔 경고 | `src/components/ReplacementTab.tsx` |
| LAY-04 | 배지 경고 = 패널의 error 외 항목 합(정합성 경고 + 품질 경고). 패널 합계 줄 | `src/components/IntegrityBadge.tsx` |
| DASH-06 · 07 | «최초 점검일», «타이어 N본 · 알림 M건» | `src/components/DashboardTab.tsx` |
| COM-03 · DASH-08 · LAY-11 · REPL-05 | `useDialog` | `src/lib/useDialog.ts` 외 모달 파일 |
| COM-04 | 국기 이모지 제거, `aria-label` · `lang` | `src/pages/home/Index.tsx` · `src/i18n/index.tsx` |
| LAY-07 · INP-08 | 범례에 «발주» — 4단계 | `LayoutTab.tsx` · `InspectionTab.tsx` |
| COM-07(일부) · COM-08 | 정사각 탭 아이콘, `탭 이름 · SAMTAN TMS` | `index.html` · `src/pages/home/Index.tsx` |

## 3. 남은 일

**사용자 확인 (보고서 §9, 가정하지 않음)**
1. 0.00 mm 의 의미 — 특히 중앙 C1·C2 동시 0 (M-6, `docs/트레드0-현장확인-20261016.md`)
2. CH 834 L3 In 0 mm · L3 Out SCRAP 실제 장착 여부 (안전)
3. NONTK 임시 시리얼 실시리얼 확보
4. 복륜 내측 공기압 측정 방침 — 현재는 30일 «오래된 값» 규칙으로만 빠진다
5. CPK-G 대표값 941.77(본당 평균) vs 516.04(가중) — TCO-01·02·03 보류
6. «시험 타이어 70본» 정의 — DASH-03 보류
7. 도메인 분리 (COM-01) — COM-02 와 같이 보류
8. Head 규격·브랜드 표기

**적용 완료 (2026-10-16)**
- 마이그레이션 3건 `supabase db push` (decisions M-7). 적용 후 `stale_days` = 30 · `ck_pressure` 50 ~ 150 · OUTLIER 7점 확인.
  CH 834 L1 08-23 DB 평균 6.28 → 8.38 mm.

**판단으로 남긴 것**
- 트레드 증가 경고는 기존 1 mm 초과 규칙을 유지했다(보고서 제안 +0.5 mm 로 바꾸지 않음 — 결정 범위 밖).
- LAY-05(경고 1건 이상이면 주황 배지)는 하지 않았다 — CH 849 KM 결측만으로 배지가 상시 주황이 되는 것을 피하려고 품질 경고를 일부러 색에서 뺀 기존 설계(`IntegrityBadge.tsx` 주석)와 충돌한다.
- 미착수: DASH-04 · DASH-09·10 · LAY-03·05·06·08·10·12·13 · LOAD-* · REV-* · REPL-03·04·06 · LIFE-05~13 · INP-06·07·09·10·12 · TRD-02~09 · PRS-03~09 · WEAR-02~07 · TCO-05~10 · COM-05·06·09~12.

## 4. 사후 점검 (2026-10-17) — 마모 분석 · 원가 분석 집중

개선 반영본을 다시 훑었다. 코드에서 고친 것과, 정의·DB 가 걸려 사용자 결정으로 넘긴 것을 나눈다.

**고친 것 (코드)**
| 위치 | 결함 | 조치 |
|---|---|---|
| `irregularWear.ts` → 배치도·수명 DB·추이 편마모 배지 | W-1 이상점(0 하나)을 뺀 회차에 원시 4점을 그대로 넣어 Δ≈9 mm «위험» 배지와 거짓 숄더 태그가 붙었다. prod 에서 현재 최신 회차 4본(CH 834 L1 · 835 R1 · 849 R1 · 849 L3 In)이 그렇게 떠 있었다 | `irregularOfWidths` 가 `effectiveTread` 로 이상점을 확인하고 3점 회차는 판정하지 않음. 테스트 추가 |
| `WearAnalysisTab` 평균 블록 | «결측 의심» 차량을 평균 트레드에서만 빼고 총마모·마모율·예상 KM 평균에는 넣었다 | 최신 회차 지표 4개 모두 제외. 마모율 막대도 같은 기준. 안내 문구 3개 로케일 수정 |
| `WearAnalysisTab` 추이 차트 | X 축 = KM 일 때 KM 결측 회차가 `x: null` 로 들어가 점이 0 에 찍혔다 | KM 축이면 KM 없는 회차 제외 |
| `WearAnalysisTab` id 문구 | `mm/1.000 km` · `0,80` · `1,00` — 금지된 `1.234,56` 형식 | `mm/1,000 km` · `0.80` · `1.00` |
| `TcoTab` 탈거 기준 선택 | 3 · 5 mm 상수 — `tire_config` 와 어긋날 수 있음 | `treadThresholds()` 의 critical·order 로 |
| `TcoTab` CPK 카드 | 통화 미표기 | `tco_params.currency` 전달 |
| `EconomicsSection` 준수율 부제 | «±5%» 고정 문구 — `pressureThresholds().devWarn` 과 별개 | 임계에서 생성 (3 로케일) |
| `EconomicsSection` 엑셀 | 노출 KM 조건이 화면(공기압 회차 없으면 공란)과 달랐다 | 화면과 같은 조건 |
| `tmsUtils.economicsRow` | 주행계 역행으로 KM 차가 음수면 그대로 노출 KM 로 썼다 | 음수 → 결측 |
| `PressureHistorySection` 각주 | «80%» 문구가 `COMPLIANCE_WARN_PCT` 와 분리 | 상수에서 생성 |
| `IntegrityBadge` | «주의» 건수에 info 포함 | warning 만 |

**사용자 결정 (2026-10-17)** → decisions M-8 ~ M-11 전부 결정됨. M-8 뷰 가드 · M-9 트리거 상시화 · M-10 가중평균 · M-11 정규화.
마이그레이션 `20261017100000` · `110000` · `120000` 작성, prod 적용은 M-12 승인 대기.

**확인했고 바꾸지 않은 것**
- W-1 은 DB 트리거(OUTLIER 제외)와 화면 `effectiveTread` 가 같은 값을 낸다 (CH 834 L1 08-23: 최소 5.6 · 평균 8.38). 이중 제외 없음.
- OUTLIER 7점 중 6점이 L(Kiri) 점 — 측정 순서 첫 칸 빈칸=0 패턴으로 보인다. 현장 확인 항목 2 와 같이 볼 것.
