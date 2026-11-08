// @section: irregular-wear
// 한 회차 4점 트레드의 편마모 지표 (지시서 2026-10-16 §A-7).
//
// 지시서의 그루브 g1~g4(외측→내측)는 기존 폭 4점 L·C1·C2·R 과 같다
// (L = Kiri = 외측, R = Kanan = 내측 — 2026-08-26 확정 규약, treadStats.ts).
// 새 컬럼(tread_g1~g4)을 만들지 않고 inspection_tread_points 원시값을 그대로 쓴다.
//
// 이 지표는 한 회차의 **깊이 차**다. 마모량의 비로 보는 S/C·O/I 패턴(WearAnalysisTab,
// v_wear_pattern)과는 별개이며, 기준 회차 없이 지금 측정만으로 바로 보인다.
import type { TreadWidths } from "@/data/tmsData";
import { treadThresholds } from "@/data/tmsData";
import { effectiveTread } from "@/lib/treadRules";

/** 4점 최대−최소가 이 값(mm) 이상이면 노랑 */
export const IRREGULAR_WARN_MM = 3;
/** 4점 최대−최소가 이 값(mm) 이상이면 빨강 */
export const IRREGULAR_DANGER_MM = 5;
/** 외측 2점 평균이 내측 2점 평균보다 이만큼(mm) 넘게 낮으면 외측 숄더 마모 (반대도 같은 기준) */
export const SHOULDER_GAP_MM = 3;

export type IrregularLevel = "ok" | "warn" | "danger";
/** outer = 외측(Kiri 쪽) 숄더 마모, inner = 내측(Kanan 쪽) */
export type ShoulderTag = "outer" | "inner";

export interface IrregularWear {
  /** 최대−최소 (mm) */
  range: number;
  level: IrregularLevel;
  shoulder: ShoulderTag | null;
}

/** 경계 비교 허용오차 — 11.2−8.2 가 2.9999… 로 떨어지는 것을 막는다 */
const EPS = 1e-9;

/**
 * 4점(외측→내측) → 편마모 지표. 4점이 다 있어야 판정한다 — 일부만으로는 폭 분포를 말할 수 없다.
 * 0 mm 는 '다 닳음/미측정' 일 수 있지만 여기서는 측정값 그대로 본다(호출부가 not_measured 를 거른다).
 */
export function irregularWear(g: (number | null | undefined)[]): IrregularWear | null {
  if (g.length !== 4 || g.some((x) => x == null || !Number.isFinite(x))) return null;
  const [g1, g2, g3, g4] = g as number[];
  const range = Math.max(g1, g2, g3, g4) - Math.min(g1, g2, g3, g4);
  const level: IrregularLevel =
    range >= IRREGULAR_DANGER_MM - EPS ? "danger" : range >= IRREGULAR_WARN_MM - EPS ? "warn" : "ok";
  const outer = (g1 + g2) / 2, inner = (g3 + g4) / 2;
  const shoulder: ShoulderTag | null =
    outer < inner - SHOULDER_GAP_MM - EPS ? "outer" : inner < outer - SHOULDER_GAP_MM - EPS ? "inner" : null;
  return { range, level, shoulder };
}

/**
 * TreadWidths(l·c1·c2·r) → irregularWear.
 * W-1 이상점(0 하나 · 나머지 ≥ tread_critical)을 뺀 회차는 유효 점이 3개라 폭 분포를 말할 수 없다 → null.
 * 그대로 두면 0 − 9.4 = Δ9.4 로 거짓 «위험» 배지가 붙는다 (CH 834 L1 08-23 등 7회차, 2026-10-17 점검).
 */
export const irregularOfWidths = (
  w: TreadWidths | null | undefined,
  critical: number = treadThresholds().critical,
): IrregularWear | null =>
  w && !effectiveTread(w, critical)?.outlier ? irregularWear([w.l, w.c1, w.c2, w.r]) : null;
