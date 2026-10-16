// @section: economics
// 타이어 경제성 순수 계산 (지시서 2026-10-16 §B-1 · §B-3).
//
// 원칙: 입력이 비면 결과도 null. 0 으로 채우지 않는다 — 단가 미확정 상태에서
// `IDR 0.00/km` 가 찍히면 «원가가 없다» 로 읽힌다 (v_tco_unit 과 같은 규칙).
import type { CostParam } from "@/data/tmsData";

/**
 * 기준일 이전 중 effectiveFrom 이 가장 최근인 원가 행 (v_tco_unit 의 lateral 과 같은 규칙).
 * date 가 null 이면 가장 최근 행. params 는 effectiveFrom 오름차순이 아니어도 된다.
 */
export function costParamAt(params: CostParam[], date: string | null): CostParam | null {
  let best: CostParam | null = null;
  for (const p of params) {
    if (date != null && p.effectiveFrom > date) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  return best;
}

export interface TireCostInput {
  /** lifetimes.purchase_price — 개별 입력 */
  purchasePrice: number | null;
  /** cost_params.unit_price (장착일 기준) — 폴백 */
  unitPrice: number | null;
  /** 재생 비용 합 (retreads 집계) */
  retreadCost: number;
}

/** 총비용 = (구매가 ?? 기본 단가) + 재생비. 단가가 하나도 없으면 null */
export function tireTotalCost(c: TireCostInput): number | null {
  const base = c.purchasePrice ?? c.unitPrice;
  if (base == null) return null;
  return base + (c.retreadCost || 0);
}

/** CPK = 총비용 ÷ km. km 가 없거나 0 이하면 null */
export function cpk(total: number | null, km: number | null | undefined): number | null {
  if (total == null || km == null || !(km > 0)) return null;
  return total / km;
}

/** USD 금액의 IDR 환산 — 환율 미설정이거나 이미 IDR 이면 null (환율 임의 가정 금지) */
export function toIdr(v: number | null, currency: string, fxUsdIdr: number | null): number | null {
  if (v == null || currency !== "USD" || fxUsdIdr == null || !(fxUsdIdr > 0)) return null;
  return v * fxUsdIdr;
}
