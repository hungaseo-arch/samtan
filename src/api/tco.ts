// @section: tco-api
// TCO(총소유비용) 조회 — WO-TMS-2026-09-TCO T-5·T-6·T-7 의 뷰를 읽는다.
//
// 여기 있는 것은 전부 **읽기 전용 뷰**다. CPK 계산은 DB 가 하고 화면은 서식만 입힌다.
// 클라이언트에서 다시 계산하면 뷰와 소수점이 갈린다.
//
// 뷰 정본:
//   v_tire_ledger_total — 시리얼별 누적 km·순회 차량 수·유효 구간 수
//   v_removal_analysis  — 탈착 사유 × 실현 마모율
//   v_tco_unit          — 개체별 CPK 3종 + 비용 구성
//   v_tco_fleet         — scope(ALL/BRAND/BRAND_CH/BRAND_AXLE)별 집계
//
// **NULL 은 NULL 로 온다.** 단가 미확정 상태에서 cpk_* 는 전부 null 이며
// 화면은 이를 0 으로 바꾸지 않는다. IDR 0 으로 보이는 순간 심각한 오독이 된다.
import { supabase } from "@/lib/supabase";

/** TCO 귀속 분류 (damage_codes.tco_category). OTH 는 미분류라 null 이다. */
export type TcoCategory =
  | "PRODUCT"      // 제품 자체 문제 — 공급자 책임
  | "OPERATION"    // 운전·노면 취급
  | "MAINTENANCE"  // 정비 — 공기압 관리 포함
  | "SURFACE"      // 노면 조건
  | "MANUFACTURE"; // 제조 결함

export type CasingGrade = "A" | "B" | "C" | "REJECT";

/** 개체 원장 합계 1행. cumulative_km 은 invalid_segments > 0 이면 **하한값**이다. */
export interface TireLedgerTotalRow {
  serial: string;
  mount_count: number;
  vehicle_count: number;
  first_mounted_at: string | null;
  last_date: string | null;
  cumulative_km: number | null;
  invalid_segments: number;
  in_service: boolean;
}

export interface RemovalAnalysisRow {
  id: string;
  ch: string | null;
  pos: string | null;
  removal_date: string | null;
  serial: string | null;
  new_serial: string | null;
  removal_code: string | null;
  description: string | null;
  description_id: string | null;
  tco_category: TcoCategory | null;
  removal_tread_min: number | null;
  casing_grade: CasingGrade | null;
  retreadable: boolean | null;
  downtime_minutes: number | null;
  cumulative_km: number | null;
  vehicle_count: number | null;
  invalid_segments: number | null;
  new_tread: number | null;
  realized_wear_rate: number | null;
}

/**
 * 개체별 CPK. params_missing 이 비어 있지 않으면 그 항목 때문에 cpk_* 가 null 이다.
 * 화면은 금액 대신 무엇이 없는지를 보여 준다.
 */
export interface TcoUnitRow {
  serial: string;
  brand: string | null;
  ch: string | null;
  pos: string | null;
  axle_group: "STEER" | "DRIVE" | null;
  cumulative_km: number | null;
  invalid_segments: number;
  mount_count: number;
  vehicle_count: number;
  first_mounted_at: string | null;
  in_service: boolean;
  removal_date: string | null;
  removal_code: string | null;
  retreadable: boolean | null;
  cost_effective_from: string | null;
  currency: string | null;
  unit_price: number | null;
  freight_per_tire: number | null;
  mount_cost: number | null;
  repair_cost: number | null;
  pressure_cost: number | null;
  downtime_cost: number | null;
  /** 회수가치. 비용 구성에서는 **음수 방향**으로 쌓인다. */
  recovery: number | null;
  cpk_gross: number | null;
  cpk_tco: number | null;
  cpk_lifecycle: number | null;
  params_missing: string[];
}

export type TcoScope = "ALL" | "BRAND" | "BRAND_CH" | "BRAND_AXLE";

export interface TcoFleetRow {
  scope: TcoScope;
  brand: string | null;
  ch: string | null;
  axle_group: "STEER" | "DRIVE" | null;
  sample_size: number;
  /** cpk_gross 가 실제로 나온 개체 수. 0 이면 단가 미확정이다. */
  costed_count: number;
  total_km: number | null;
  cpk_gross_avg: number | null;
  cpk_tco_avg: number | null;
  cpk_lifecycle_avg: number | null;
  /** 가중평균 = Σ비용 ÷ Σ주행거리 — 화면 대표값 (M-10). *_avg 는 본당 단순 평균(참고) */
  cpk_gross_wavg: number | null;
  cpk_tco_wavg: number | null;
  cpk_lifecycle_wavg: number | null;
  /** km 구간이 하나라도 끊긴 개체 수. 분모가 하한값임을 알린다. */
  km_incomplete_count: number;
}

/** 원가 파라미터 1행. 전 항목 NULL 허용 — 확정 전에는 비워 둔다 (지시서 §1 원칙 5). */
export interface CostParamsRow {
  id: string;
  effective_from: string;
  brand: string | null;
  size: string | null;
  unit_price: number | null;
  /** 시장가(참고값, 20261016130000). CPK 에는 쓰지 않는다. 컬럼 미적용 환경에서는 undefined */
  market_price?: number | null;
  freight_per_tire: number | null;
  mount_cost: number | null;
  repair_avg: number | null;
  pressure_check_cost: number | null;
  downtime_rate_hour: number | null;
  casing_value: number | null;
  scrap_value: number | null;
  retread_cost: number | null;
  retread_life_km: number | null;
  /**
   * 재생타이어 시나리오 사용 여부 (20260829110000). false = 정책상 재생 미사용.
   * 고객사 정책이라 빌드 플래그가 아니라 원가 설정에 둔다 — 관리자가 재배포 없이 켠다.
   * 컬럼이 아직 없는 환경에서는 undefined 로 오므로 `=== true` 로만 켠다.
   */
  retread_allowed: boolean | null;
  currency: string;
  note: string | null;
}

export async function listTireLedgerTotals(): Promise<TireLedgerTotalRow[]> {
  const { data, error } = await supabase
    .from("v_tire_ledger_total")
    .select("*")
    .order("cumulative_km", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as TireLedgerTotalRow[];
}

export async function listRemovalAnalysis(): Promise<RemovalAnalysisRow[]> {
  const { data, error } = await supabase
    .from("v_removal_analysis")
    .select("*")
    .order("removal_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as RemovalAnalysisRow[];
}

export async function listTcoUnits(): Promise<TcoUnitRow[]> {
  const { data, error } = await supabase
    .from("v_tco_unit")
    .select("*")
    .order("cumulative_km", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as TcoUnitRow[];
}

export async function listTcoFleet(): Promise<TcoFleetRow[]> {
  const { data, error } = await supabase.from("v_tco_fleet").select("*");
  if (error) throw error;
  return (data ?? []) as TcoFleetRow[];
}

/**
 * 적용 중인 원가 파라미터 1행. effective_from 이 가장 최근인 것.
 * 행이 아예 없을 수도 있으므로 null 을 돌려준다 — 화면이 «파라미터 대기» 로 간다.
 */
export async function getCurrentCostParams(): Promise<CostParamsRow | null> {
  const { data, error } = await supabase
    .from("cost_params")
    .select("*")
    .is("deleted_at", null)
    // 이 화면의 카드·시나리오는 시험 타이어(TECHKING) 기준 — 경쟁제품 전용 행은 집지 않는다
    .or("brand.is.null,brand.eq.TECHKING")
    .order("effective_from", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as CostParamsRow | undefined) ?? null;
}
