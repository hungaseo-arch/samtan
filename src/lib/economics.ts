// @section: economics
// 타이어 경제성 순수 계산 (지시서 2026-10-16 §B-1 · §B-3).
//
// 원칙: 입력이 비면 결과도 null. 0 으로 채우지 않는다 — 단가 미확정 상태에서
// `IDR 0.00/km` 가 찍히면 «원가가 없다» 로 읽힌다 (v_tco_unit 과 같은 규칙).
import type { CostParam } from "@/data/tmsData";

/**
 * 시리얼의 브랜드 — v_tco_unit 과 같은 규칙. 정식 brand 컬럼이 생기기 전까지는
 * NONTK- 플레이스홀더 시리얼만 경쟁제품이다.
 */
export function brandOfSerial(serial: string): "NONTK" | "TECHKING" {
  return serial.startsWith("NONTK-") ? "NONTK" : "TECHKING";
}

/**
 * 기준일 이전 중 effectiveFrom 이 가장 최근인 원가 행 (v_tco_unit 의 lateral 과 같은 규칙).
 * date 가 null 이면 가장 최근 행. params 는 effectiveFrom 오름차순이 아니어도 된다.
 * brand 를 주면 brand 가 null(전체 적용)이거나 같은 행만 본다 — TECHKING 단가가
 * 경쟁제품(NONTK)에 씌워지지 않게 한다.
 */
export function costParamAt(params: CostParam[], date: string | null, brand?: string): CostParam | null {
  let best: CostParam | null = null;
  for (const p of params) {
    if (date != null && p.effectiveFrom > date) continue;
    if (brand != null && p.brand != null && p.brand !== brand) continue;
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

// ── 연료·수명 손실 추정 (§B-3) ──────────────────────────────────
//
// 모든 계수는 tire_config 설정값(가정값)이다. 하나라도 NULL 이면 그 항목은 null(«설정 필요»),
// 0 이면 손실도 0. 저압 회차가 없으면 계수와 무관하게 0.

/** 플릿 1대의 연료는 타이어 10본이 함께 영향을 준다 — 본당 기여를 1/10 로 배분 */
export const TIRES_PER_UNIT = 10;

export interface LowInterval {
  lowPct: number;
  km: number;
}

/**
 * 타이어 1본의 저압 구간들이 만든 추가 연료(L).
 * Σ [ 저압률 ÷ 10 × fuelSens ÷ 100 × 구간 KM × 기준 연비(L/km) ] ÷ 10
 */
export function extraFuelL(
  iv: LowInterval[],
  fuelSensPer10Pct: number | null,
  fuelBaseLPerKm: number | null,
): number | null {
  if (!iv.length) return 0;
  if (fuelSensPer10Pct == null || fuelBaseLPerKm == null) return null;
  const s = iv.reduce((a, x) => a + (x.lowPct / 10) * (fuelSensPer10Pct / 100) * x.km * fuelBaseLPerKm, 0);
  return s / TIRES_PER_UNIT;
}

/**
 * 저압 노출(%·km)이 깎아 먹은 수명(km).
 * 저압 10% 로 달린 1 km 는 수명을 lifeSens% 만큼 빨리 쓴다고 보는 선형 환산:
 * exposure ÷ 10 × lifeSens ÷ 100.
 */
export function lifeLossKm(exposure: number, lifeSensPer10Pct: number | null): number | null {
  if (!(exposure > 0)) return 0;
  if (lifeSensPer10Pct == null) return null;
  return (exposure / 10) * (lifeSensPer10Pct / 100);
}

/** a × b, 한쪽이라도 null 이면 null */
export const mulOrNull = (a: number | null, b: number | null): number | null =>
  a == null || b == null ? null : a * b;
