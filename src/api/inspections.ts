// @section: inspections-api
// 점검 입력 데이터 (공기압·트레드) Supabase CRUD
import { supabase } from "@/lib/supabase";
import type { WidthPos } from "@/lib/treadStats";

/** 설계서 §15 · v3 §C-3. OUTLIER 만 통계에서 제외되고, 행 자체는 항상 보존된다. */
export type TreadFlag =
  | "OK" | "CHECK" | "OUTLIER" | "DAMAGE"
  | "PRESSURE" | "LOAD" | "POSITION" | "OTHER";

export type TreadStatus = "measured" | "not_measured" | "worn_out" | "scrapped";

export interface InspectionRow {
  id?: string;
  ch: string;
  inspection_date: string; // YYYY-MM-DD
  hm: number | null;
  km: number | null;
  driver: string | null; // 회차 메타 — 같은 (ch, 점검일) 행에 동일 값
  pos: string;
  serial: string | null;
  pressure: number | null; // psi (null = N/A / 미측정)
  tread: number | null; // mm
  remark: string | null;
  /** 측정 상태(B-2). not_measured 인 행은 마모율·추이에서 빠진다. */
  tread_status?: TreadStatus;
  // ── 트레드 통계 파생 캐시 (C-2) ────────────────────────────
  // 정본은 tread_points 다. 이 값들은 트리거가 채우므로 저장 시 보내지 않는다.
  // 2026-08 이전 회차는 원시값이 없어 전부 null / point_count 0 — 정상이다.
  tread_avg?: number | null;
  tread_max?: number | null;
  tread_range?: number | null;
  tread_sd?: number | null;
  tread_cv?: number | null;
  shoulder_avg?: number | null;
  center_avg?: number | null;
  outboard_avg?: number | null;
  inboard_avg?: number | null;
  point_count?: number;
  // ── 폭 4점 원시값 (v_inspections_wide 가 펼쳐 준다) ─────────
  // 정본은 tread_points 다. 읽기 전용이며 저장 시 보내지 않는다.
  // tread 는 이 넷의 최소값, tread_avg 는 평균이다.
  tread_l?: number | null;
  tread_c1?: number | null;
  tread_c2?: number | null;
  tread_r?: number | null;
  created_at?: string;
  updated_at?: string;
  // 감사 추적(0009) — 트리거가 JWT에서 채우므로 저장 시 보내지 않는다(보내도 무시됨).
  created_by?: string | null;
  updated_by?: string | null;
  created_by_email?: string | null;
  updated_by_email?: string | null;
  /** 소프트 삭제 시각(T-103). null = 유효한 레코드. */
  deleted_at?: string | null;
}

const TABLE = "inspections";
/** 읽기는 폭 4점이 붙은 뷰에서. 쓰기는 여전히 RPC 로만 한다. */
const READ_VIEW = "v_inspections_wide";

/** 차량(ch) 기준 점검 이력 조회. ch 미지정 시 전체.
 *  소프트 삭제(deleted_at)된 회차는 제외한다. */
export async function listInspections(ch?: string): Promise<InspectionRow[]> {
  let q = supabase
    .from(READ_VIEW)
    .select("*")
    .is("deleted_at", null)
    .order("inspection_date", { ascending: false })
    .order("pos", { ascending: true });
  if (ch) q = q.eq("ch", ch);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as InspectionRow[];
}

/** 한 회차(여러 포지션) 저장 — (ch, inspection_date, pos) 충돌 시 갱신(upsert).
 *  삭제했던 회차를 같은 날짜로 다시 입력하면 deleted_at 을 지워 되살린다.
 *  ⚠ 호출부는 반드시 canWrite/canDelete로 게이팅 + RLS가 최종 방어선 */
export async function saveInspectionRound(
  rows: InspectionRow[]
): Promise<InspectionRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      // 읽기는 v_inspections_wide 에서 오므로 표에 없는 열이 섞여 있다.
      // 그대로 upsert 하면 'column tread_l does not exist' 로 죽는다.
      rows.map(({ tread_l, tread_c1, tread_c2, tread_r, ...r }) => {
        void tread_l; void tread_c1; void tread_c2; void tread_r;
        return { ...r, deleted_at: null as string | null };
      }),
      { onConflict: "ch,inspection_date,pos" }
    )
    .select();
  if (error) throw error;
  return (data ?? []) as InspectionRow[];
}

/** RPC 로 넘기는 측정점 하나. circ 미지정 시 P1(폭 4점 측정)으로 들어간다. */
export interface TreadPointInput {
  circ?: "P1" | "P2" | "P3" | "P4";
  width: WidthPos;
  depth: number;
}

/** RPC 로 넘기는 포지션 1행. points 는 0·4·16개만 허용된다(부분 입력 저장 금지). */
export interface InspectionPointsRow {
  pos: string;
  serial: string | null;
  pressure: number | null;
  tread_status: TreadStatus;
  flag: TreadFlag;
  flag_note: string | null;
  remark: string | null;
  points: TreadPointInput[];
}

/**
 * 한 회차(차량·점검일)를 원시 측정점까지 한 트랜잭션으로 저장 (v3 §E-1 규칙 7).
 *
 * saveInspectionRound 와 달리 inspections 에 트레드를 직접 쓰지 않는다.
 * tread_points 가 정본이고 통계 캐시(tread·tread_avg·CV…)는 DB 트리거가 채운다.
 * 한 포지션이라도 검증에 걸리면 회차 전체가 롤백되어 부분 저장이 남지 않는다.
 *
 * ⚠ 호출부는 반드시 canWrite 로 게이팅 + RLS 가 최종 방어선
 */
export async function saveInspectionRoundWithPoints(input: {
  ch: string;
  date: string; // YYYY-MM-DD
  hm: number | null;
  km: number | null;
  driver: string | null;
  rows: InspectionPointsRow[];
}): Promise<number> {
  const { data, error } = await supabase.rpc("save_inspection_round_with_points", {
    p_ch: input.ch,
    p_date: input.date,
    p_hm: input.hm,
    p_km: input.km,
    p_driver: input.driver,
    p_rows: input.rows,
  });
  if (error) throw error;
  return (data ?? 0) as number;
}

/** 특정 차량의 특정 점검일 회차 전체 삭제 — 소프트 삭제(§3.1-3).
 *  레코드는 남고 deleted_at 만 채워지며, DB 트리거가 하드 삭제를 차단한다.
 *  ⚠ 호출부는 반드시 canWrite/canDelete로 게이팅 + RLS가 최종 방어선 */
export async function deleteInspectionRound(
  ch: string,
  date: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("ch", ch)
    .eq("inspection_date", date)
    .is("deleted_at", null);
  if (error) throw error;
}
