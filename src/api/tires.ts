// @section: tires-api
// 타이어 상세(v_tire_detail) · 데이터 정합성(check_data_integrity) 조회.
// 두 소스 모두 lifetimes 에 행이 없어도 결과를 돌려준다 —
// 미등록 시리얼로 상세를 열었을 때 빈 화면이 나오지 않게 하는 것이 목적이다.
import { supabase } from "@/lib/supabase";

/** v_tire_detail 1행. lifetimes 에 없는 시리얼도 inspections·replacements 로 채워져 나온다. */
export interface TireDetail {
  serial: string;
  /** false = lifetimes(수명 DB) 미등록 — 장착 정보 대신 점검 이력으로 대체 표시한다. */
  is_registered: boolean;
  lifetime_no: number | null;
  install_date: string | null;
  scrap_date: string | null;
  damage_code: string | null;
  lifetime_days: number | null;
  status: string | null;
  note: string | null;
  current_ch: string | null;
  current_pos: string | null;
  current_mounted_at: string | null;
  first_inspection: string | null;
  last_inspection: string | null;
  inspection_count: number | null;
  last_tread: number | null;
  last_pressure: number | null;
}

/** 시리얼 1건 상세. 어느 테이블에도 흔적이 없으면 null. */
export async function getTireDetail(serial: string): Promise<TireDetail | null> {
  if (!serial) return null;
  const { data, error } = await supabase
    .from("v_tire_detail")
    .select("*")
    .eq("serial", serial)
    .maybeSingle();
  if (error) throw error;
  return (data as TireDetail | null) ?? null;
}

export type IntegritySeverity = "error" | "warning" | "info";

/** check_data_integrity() 1행 — 점검 항목별 위반 건수와 상세. */
export interface IntegrityCheck {
  check_key: string;
  severity: IntegritySeverity;
  cnt: number;
  detail: unknown;
}

/** 정합성 점검 실행. severity 오름차순(error → info) 정렬은 RPC 쪽에서 한다. */
export async function checkDataIntegrity(): Promise<IntegrityCheck[]> {
  const { data, error } = await supabase.rpc("check_data_integrity");
  if (error) throw error;
  return (data ?? []) as IntegrityCheck[];
}

/** v_data_quality 1행 — 점검 데이터 자체의 품질 경고 (작업지시서 v3 §C-4). */
export interface DataQualityRow {
  check_key: string;
  ch: string | null;
  pos: string | null;
  inspection_date: string | null;
  detail: string | null;
}

/**
 * 데이터 품질 경고 목록 (v3 §D-3).
 *
 * check_data_integrity() 는 **원장 정합성**(장착·수명·시리얼)을 보고,
 * 이 뷰는 **점검값 자체**(트레드 0 · km 결측 · 급증 · 측정점 수)를 본다.
 * 어느 항목도 저장을 막지 않으므로 배지 색은 바꾸지 않고 목록에만 싣는다.
 */
export async function listDataQuality(): Promise<DataQualityRow[]> {
  const { data, error } = await supabase
    .from("v_data_quality")
    .select("*")
    .order("check_key", { ascending: true })
    .order("ch", { ascending: true })
    .order("inspection_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DataQualityRow[];
}
