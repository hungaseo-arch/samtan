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
}

export const JUDGE_KEYS: (keyof JudgeConfig)[] = [
  "tread_critical", "tread_order", "tread_caution",
  "rec_psi_steer", "rec_psi_drive",
  "psi_low_ratio", "psi_dev_warn", "psi_dev_danger",
  "inspection_interval_days", "target_life_km",
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
