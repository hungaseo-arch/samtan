// @section: config-api
// 판정 기준(tire_config id=1) 조회·갱신 — 지시서 2026-10-16 §A-5.
//
// 신호등·공기압·점검 주기의 정본은 이 한 행이다. 화면 코드에 임계치를 박지 않고
// tmsData.ts 의 접근자(treadThresholds·recPsi·pressureThresholds …)가 이 값을 읽는다.
// 저장 후 호출부는 loadData() 를 다시 돌려 TMS_DATA 를 갱신해야 판정이 바뀐다.
//
// 경계 순서(critical < order < caution, warn < danger)는 DB check 제약도 지키지만
// 여기서 먼저 걸러 친절한 오류를 낸다.
import { supabase } from "@/lib/supabase";

/** 관리자가 조정할 수 있는 판정 기준. 비율 값은 0~1 소수(0.85 = 85%). */
export interface JudgeConfig {
  tread_critical: number;
  tread_order: number;
  tread_caution: number;
  rec_psi_steer: number;
  rec_psi_drive: number;
  psi_low_ratio: number;
  psi_dev_warn: number;
  psi_dev_danger: number;
  inspection_interval_days: number;
  target_life_km: number;
  /** 주행계 이상치 경계 (WO-TMS-2026-10-LIFE T-3) — 20261016140000 */
  odo_daily_km_max: number;
  odo_speed_kmh_max: number;
  odo_daily_hm_max: number;
  /** «오래된 값» 기준일 (CHK-TMS-2026-10-16-WEB R-2) — 20261016170000 */
  stale_days: number;
}

export const JUDGE_KEYS: (keyof JudgeConfig)[] = [
  "tread_critical", "tread_order", "tread_caution",
  "rec_psi_steer", "rec_psi_drive",
  "psi_low_ratio", "psi_dev_warn", "psi_dev_danger",
  "inspection_interval_days", "target_life_km",
  "odo_daily_km_max", "odo_speed_kmh_max", "odo_daily_hm_max",
  "stale_days",
];

/** 잘못된 항목 키 목록. 비어 있으면 저장 가능. */
export function validateJudgeConfig(c: JudgeConfig): (keyof JudgeConfig)[] {
  const bad = new Set<keyof JudgeConfig>();
  for (const k of JUDGE_KEYS) {
    if (!Number.isFinite(c[k]) || c[k] <= 0) bad.add(k);
  }
  if (c.tread_caution > 22) bad.add("tread_caution");
  if (!(c.tread_critical < c.tread_order)) { bad.add("tread_critical"); bad.add("tread_order"); }
  if (!(c.tread_order < c.tread_caution)) { bad.add("tread_order"); bad.add("tread_caution"); }
  if (!(c.psi_low_ratio < 1)) bad.add("psi_low_ratio");
  if (!(c.psi_dev_danger < 1)) bad.add("psi_dev_danger");
  if (!(c.psi_dev_warn < c.psi_dev_danger)) { bad.add("psi_dev_warn"); bad.add("psi_dev_danger"); }
  if (!Number.isInteger(c.inspection_interval_days) || c.inspection_interval_days > 365) {
    bad.add("inspection_interval_days");
  }
  // DB check 제약(tire_config_stale_days_check)과 같다
  if (!Number.isInteger(c.stale_days) || c.stale_days > 365) bad.add("stale_days");
  // 하루는 24시간 — DB check 제약(tire_config_odo_check)과 같다
  if (c.odo_daily_hm_max > 24) bad.add("odo_daily_hm_max");
  return JUDGE_KEYS.filter((k) => bad.has(k));
}

/**
 * 판정 기준을 저장한다. 저장 직후 호출부가 loadData() 로 TMS_DATA 를 갱신할 것.
 * ⚠ 호출부는 반드시 canWrite/canDelete로 게이팅 + RLS가 최종 방어선
 */
export async function updateJudgeConfig(c: JudgeConfig): Promise<void> {
  const bad = validateJudgeConfig(c);
  if (bad.length > 0) throw new Error(`invalid config fields: ${bad.join(", ")}`);
  const { data, error } = await supabase
    .from("tire_config")
    .update(c)
    .eq("id", 1)
    .select("id");
  if (error) throw error;
  // RLS 가 막으면 오류 없이 0행이 돌아온다 — 저장된 척하지 않는다.
  if (!data || data.length === 0) throw new Error("tire_config not updated (no permission?)");
}

/**
 * 경제성 계수 (지시서 2026-10-16 §B-3) — 전부 nullable. NULL = 미확정 → 화면 «설정 필요».
 * 값은 쎄오님 확정 전 임의로 넣지 않는다 (CLAUDE.md 절대금지 6).
 */
export interface EconomicsConfig {
  fx_usd_idr: number | null;
  fuel_base_l_per_km: number | null;
  fuel_price: number | null;
  fuel_currency: string;
  fuel_sens_per_10pct: number | null;
  life_sens_per_10pct: number | null;
}

export const ECON_NUM_KEYS = [
  "fx_usd_idr", "fuel_base_l_per_km", "fuel_price", "fuel_sens_per_10pct", "life_sens_per_10pct",
] as const;

/** 잘못된 항목 키 목록 (DB check 제약 tire_config_economics_check 와 같은 규칙) */
export function validateEconomicsConfig(c: EconomicsConfig): string[] {
  const bad: string[] = [];
  for (const k of ECON_NUM_KEYS) {
    const v = c[k];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0 || (k === "fx_usd_idr" && v === 0)) bad.push(k);
  }
  if (!["IDR", "USD"].includes(c.fuel_currency)) bad.push("fuel_currency");
  return bad;
}

/**
 * 경제성 계수 저장. 저장 직후 호출부가 loadData() 로 TMS_DATA 를 갱신할 것.
 * ⚠ 호출부는 반드시 canWrite/canDelete로 게이팅 + RLS가 최종 방어선
 */
export async function updateEconomicsConfig(c: EconomicsConfig): Promise<void> {
  const bad = validateEconomicsConfig(c);
  if (bad.length > 0) throw new Error(`invalid config fields: ${bad.join(", ")}`);
  const { data, error } = await supabase
    .from("tire_config")
    .update(c)
    .eq("id", 1)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("tire_config not updated (no permission?)");
}
