// @section: wear-api
// 마모 분석 KPI 조회 (작업지시서 v3 §D · §E-2).
//
// 여기 있는 것은 전부 **읽기 전용 뷰**다. 계산은 DB 가 하고 화면은 서식만 입힌다.
// 클라이언트에서 다시 계산하면 트리거·뷰와 소수점이 갈리므로 하지 않는다.
//
// 뷰 정본:
//   v_tread_series      — 점검 시계열 + 시리얼 세그먼트(seg_no)
//   v_wear_rate_segment — 세그먼트 OLS 마모속도 + R²
//   v_wear_pattern      — 편마모(S/C · O/I) — 마모량의 비
//   v_cv_benchmark      — 점검일별 CV 중앙값·P90 (합격 기준 미설정)
//   v_tire_comparison   — 4개 평가축 분리 비교 (단일 종합점수 금지)
import { supabase } from "@/lib/supabase";
import type { TreadStatus } from "@/api/inspections";
import type { WidthPos } from "@/lib/treadStats";

/** v_tread_series 1행. 2026-08 이전 회차는 point_count 0 · 통계 전부 null 이다. */
export interface TreadSeriesRow {
  inspection_id: string;
  ch: string;
  pos: string;
  serial: string | null;
  inspection_date: string;
  km: number | null;
  hm: number | null;
  tread_min: number | null;
  tread_avg: number | null;
  tread_sd: number | null;
  tread_cv: number | null;
  tread_range: number | null;
  shoulder_avg: number | null;
  center_avg: number | null;
  outboard_avg: number | null;
  inboard_avg: number | null;
  point_count: number;
  tread_status: TreadStatus;
  seg_no: number;
}

export interface WearRateSegmentRow {
  ch: string;
  pos: string;
  serial: string | null;
  seg_no: number;
  n_points: number;
  from_date: string;
  to_date: string;
  test_distance_km: number | null;
  initial_avg: number | null;
  /** OLS 기울기 × (−1,000). 낮을수록 우수. */
  wear_rate_km_ols: number | null;
  r2: number | null;
  cv_avg: number | null;
}

export type WearPattern = "shoulder" | "center" | "even" | "insufficient";
export type LateralPattern = "outboard" | "inboard" | "even" | "insufficient";

export interface WearPatternRow {
  ch: string;
  pos: string;
  serial: string | null;
  seg_no: number;
  inspection_date: string;
  tread_avg: number | null;
  tread_cv: number | null;
  shoulder_wear: number | null;
  center_wear: number | null;
  sc_ratio: number | null;
  wear_pattern: WearPattern;
  outboard_wear: number | null;
  inboard_wear: number | null;
  oi_ratio: number | null;
  lateral_pattern: LateralPattern;
}

export interface CvBenchmarkRow {
  inspection_date: string;
  n: number;
  cv_median: number | null;
  cv_p90: number | null;
}

export interface TireComparisonRow {
  serial: string | null;
  ch: string;
  pos: string;
  seg_no: number;
  from_date: string;
  to_date: string;
  test_distance_km: number | null;
  n_points: number;
  initial_avg: number | null;
  wear_rate: number | null;
  r2: number | null;
  cv: number | null;
  sc_ratio: number | null;
  wear_pattern: WearPattern | null;
  oi_ratio: number | null;
  lateral_pattern: LateralPattern | null;
  damage_code: string | null;
  scrap_date: string | null;
}

/** 폭 위치별 원시 측정값 1행 — 차트 2(폭 방향 분포)의 소스.
 *  OUTLIER 는 통계에서 빠지지만 행은 남으므로 flag 를 같이 받아 화면에서 거른다. */
export interface TreadPointRow {
  inspection_date: string;
  pos: string;
  serial: string | null;
  width_pos: WidthPos;
  circ_pos: string;
  depth_mm: number;
  flag: string;
}

/** 특정 차량의 점검 시계열. 오래된 순 — 차트가 그대로 쓸 수 있게 정렬해 둔다. */
export async function listTreadSeries(ch: string): Promise<TreadSeriesRow[]> {
  const { data, error } = await supabase
    .from("v_tread_series")
    .select("*")
    .eq("ch", ch)
    .order("pos", { ascending: true })
    .order("inspection_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TreadSeriesRow[];
}

/** 세그먼트 마모속도. ch 미지정 시 전체(차트 3의 플릿 비교용). */
export async function listWearRateSegments(ch?: string): Promise<WearRateSegmentRow[]> {
  let q = supabase.from("v_wear_rate_segment").select("*");
  if (ch) q = q.eq("ch", ch);
  const { data, error } = await q
    .order("ch", { ascending: true })
    .order("pos", { ascending: true })
    .order("seg_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WearRateSegmentRow[];
}

/** 편마모 시계열. 차트 5(Shoulder vs Center)와 S/C·O/I 카드가 함께 쓴다. */
export async function listWearPattern(ch: string): Promise<WearPatternRow[]> {
  const { data, error } = await supabase
    .from("v_wear_pattern")
    .select("*")
    .eq("ch", ch)
    .order("pos", { ascending: true })
    .order("inspection_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WearPatternRow[];
}

/** 점검일별 CV 중앙값·P90. 합격 임계가 아니라 **플릿 내 위치** 참고용이다 (설계서 §10). */
export async function listCvBenchmark(): Promise<CvBenchmarkRow[]> {
  const { data, error } = await supabase
    .from("v_cv_benchmark")
    .select("*")
    .order("inspection_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CvBenchmarkRow[];
}

/** 타이어 세그먼트 비교 — 4개 축을 따로 보여 준다. 가중합 금지 (설계서 §16). */
export async function listTireComparison(): Promise<TireComparisonRow[]> {
  const { data, error } = await supabase
    .from("v_tire_comparison")
    .select("*")
    .order("wear_rate", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TireComparisonRow[];
}

/** 원시 측정점(폭 4점). inspections 를 inner join 해 차량으로 좁힌다. */
export async function listTreadPoints(ch: string): Promise<TreadPointRow[]> {
  const { data, error } = await supabase
    .from("tread_points")
    .select("circ_pos, width_pos, depth_mm, flag, inspections!inner(ch, pos, serial, inspection_date, deleted_at)")
    .eq("inspections.ch", ch)
    .is("deleted_at", null)
    .is("inspections.deleted_at", null);
  if (error) throw error;

  type Joined = {
    circ_pos: string;
    width_pos: WidthPos;
    depth_mm: number;
    flag: string;
    inspections: { pos: string; serial: string | null; inspection_date: string };
  };
  return ((data ?? []) as unknown as Joined[])
    .map((r) => ({
      inspection_date: r.inspections.inspection_date,
      pos: r.inspections.pos,
      serial: r.inspections.serial,
      width_pos: r.width_pos,
      circ_pos: r.circ_pos,
      depth_mm: Number(r.depth_mm),
      flag: r.flag,
    }))
    .sort((a, b) =>
      a.pos.localeCompare(b.pos) || a.inspection_date.localeCompare(b.inspection_date),
    );
}
