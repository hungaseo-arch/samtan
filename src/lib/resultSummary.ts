// @section: result-summary
// 마모 분석 «결과 요약» 카드의 배지 판정 — WO-TMS-2026-10-LIFE T-5.
//
// 배지 3단:
//   check   데이터 확인 필요 — 데이터 품질 문제가 있거나 R² < 0.80
//   caution 주의            — 발주 시점 30일 이내 · CV > 플릿 중앙값 × 1.5 · S/C 편마모
//   ok      정상            — 그 외
//
// 데이터 품질 문제로 보는 것:
//   · 측정 기간과 겹치는 주행계 이상 구간 (v_odometer_anomaly 와 같은 규칙)
//   · 원장 구간의 km_flag 가 KM_DECREASE
//   · 장착일이 있는(seq ≥ 1) 구간의 NO_KM — 차량 km 자체가 비어 있다 (예: CH 849)
// 최초 장착분(seq 0 · 장착일 없음)의 NO_KM 은 문제로 보지 않는다. 장착 전 주행을 원래 모르는
// 구조적 하한값이라 플릿 70본 전부가 해당한다 — 배지를 올리면 전 차량이 «확인 필요»가 된다.
// APPROX(보간 불가 → 앞 회차 값)도 거리로 쓰는 값이라 안내만 한다.
// (지시서 원문은 «km_flag≠OK» — 위 해석은 결과 보고서 §판단 기록에 남겼다)
import type { KmFlag } from "@/data/tmsData";
import type { OdoFlag } from "./odometerCheck";

export type SummaryLevel = "ok" | "caution" | "check";

/** R² 가 이 값 미만이면 마모율 대표값을 믿기 어렵다 — 마모 분석 KPI 의 r2Low 경고와 같다 */
export const R2_MIN = 0.8;
/** CV 가 플릿 중앙값의 이 배수를 넘으면 주의 (지시서 T-5) */
export const CV_MEDIAN_FACTOR = 1.5;

export type SummaryReason =
  | { kind: "odo"; flags: OdoFlag[]; datePrev: string; dateCurr: string }
  | { kind: "ledger"; flag: KmFlag }
  | { kind: "r2"; r2: number }
  | { kind: "order"; days: number }
  | { kind: "cv"; cv: number; median: number }
  | { kind: "sc"; pattern: string };

export interface SummaryInput {
  r2: number | null;
  /** 발주 기준(tread_order)까지 남은 일수. 이미 넘었으면 0 이하 */
  orderDaysLeft: number | null;
  /** 주의 판정 창 (일) — PREP_WINDOW_DAYS */
  orderWindowDays: number;
  cv: number | null;
  fleetCvMedian: number | null;
  /** v_wear_pattern.wear_pattern */
  pattern: string | null;
  anomalies: { flags: OdoFlag[]; datePrev: string; dateCurr: string }[];
  ledger: { kmFlag: KmFlag; seqNo: number; mountedAt: string | null }[];
}

export interface SummaryResult {
  level: SummaryLevel;
  /** 배지를 올린 사유 — 화면은 이 순서대로 보여 준다 */
  reasons: SummaryReason[];
}

const UNEVEN = new Set(["shoulder", "center"]);

export function judgeSummary(i: SummaryInput): SummaryResult {
  const check: SummaryReason[] = [];
  for (const a of i.anomalies) check.push({ kind: "odo", flags: a.flags, datePrev: a.datePrev, dateCurr: a.dateCurr });
  for (const g of i.ledger) {
    const structural = g.kmFlag === "NO_KM" && g.seqNo === 0 && g.mountedAt == null;
    if (g.kmFlag === "KM_DECREASE" || (g.kmFlag === "NO_KM" && !structural)) {
      check.push({ kind: "ledger", flag: g.kmFlag });
    }
  }
  if (i.r2 != null && i.r2 < R2_MIN) check.push({ kind: "r2", r2: i.r2 });
  if (check.length) return { level: "check", reasons: check };

  const caution: SummaryReason[] = [];
  if (i.orderDaysLeft != null && i.orderDaysLeft <= i.orderWindowDays) {
    caution.push({ kind: "order", days: i.orderDaysLeft });
  }
  if (i.cv != null && i.fleetCvMedian != null && i.fleetCvMedian > 0 && i.cv > i.fleetCvMedian * CV_MEDIAN_FACTOR) {
    caution.push({ kind: "cv", cv: i.cv, median: i.fleetCvMedian });
  }
  if (i.pattern && UNEVEN.has(i.pattern)) caution.push({ kind: "sc", pattern: i.pattern });
  if (caution.length) return { level: "caution", reasons: caution };

  return { level: "ok", reasons: [] };
}
