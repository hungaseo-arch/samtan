// @section: fleet-wear
// 전 차량 마모율 비교 (지시서 2026-10-16 §A-6) — 순수 함수만 둔다.
//
// 마모율 값 자체(mm/1,000 km)는 tmsUtils 의 wearIntervals 규칙을 그대로 쓴다.
// 여기서는 그 값들을 평균과 견주어 색을 정하고, 좌우 편차를 판정한다.

/** 평균 대비 이만큼(비율) 이상 빠르면 노랑 */
export const WEAR_DEV_WARN = 0.2;
/** 평균 대비 이만큼(비율) 이상 빠르면 빨강 */
export const WEAR_DEV_DANGER = 0.4;
/** 좌·우 평균 마모율 차이가 이 비율 이상이면 "좌우 편차" 경고 (정렬·토인 점검 유도) */
export const SIDE_DEV_WARN = 0.15;

/** 축 기준 색 그룹 — 조향(L1·R1) / 구동 외측 / 구동 내측 */
export type AxleGroup = "steer" | "outer" | "inner";

export function axleGroupOf(pos: string): AxleGroup {
  if (pos === "L1" || pos === "R1") return "steer";
  return /\bIn$/i.test(pos) ? "inner" : "outer";
}

/** 포지션 코드 → 좌/우 */
export const sideOf = (pos: string): "L" | "R" => (pos.startsWith("L") ? "L" : "R");

/** 경계값 비교 허용오차 — 0.6/0.5−1 이 0.19999… 로 떨어져 "이상" 판정이 빠지는 것을 막는다 */
const EPS = 1e-9;

export const meanOf = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

export type WearDevLevel = "ok" | "warn" | "danger";

/** 평균 대비 마모율 단계. 값·평균이 없으면 null. 경계는 이상(≥) — 지시서 문구 그대로 */
export function wearDevLevel(rate: number | null, mean: number | null): WearDevLevel | null {
  if (rate == null || mean == null || mean <= 0) return null;
  const dev = rate / mean - 1;
  if (dev >= WEAR_DEV_DANGER - EPS) return "danger";
  if (dev >= WEAR_DEV_WARN - EPS) return "warn";
  return "ok";
}

export interface SideImbalance {
  left: number;
  right: number;
  /** |좌−우| ÷ 좌우 평균 */
  ratio: number;
  warn: boolean;
}

/**
 * 한 차량의 좌·우 평균 마모율 차이. 한쪽이라도 값이 없으면 null.
 * 분모를 좌우 평균으로 두어 어느 쪽이 기준인지에 따라 값이 달라지지 않게 했다.
 */
export function sideImbalance(cells: { pos: string; rate: number | null }[]): SideImbalance | null {
  const L = meanOf(cells.filter((c) => sideOf(c.pos) === "L" && c.rate != null).map((c) => c.rate!));
  const R = meanOf(cells.filter((c) => sideOf(c.pos) === "R" && c.rate != null).map((c) => c.rate!));
  if (L == null || R == null) return null;
  const avg = (L + R) / 2;
  if (avg <= 0) return null;
  const ratio = Math.abs(L - R) / avg;
  return { left: L, right: R, ratio, warn: ratio >= SIDE_DEV_WARN - EPS };
}
