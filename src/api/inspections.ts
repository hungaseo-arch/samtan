// @section: inspections-api
// 점검 입력 데이터 (공기압·트레드) Supabase CRUD
import { supabase } from "@/lib/supabase";

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
  created_at?: string;
  updated_at?: string;
}

const TABLE = "inspections";

/** 차량(ch) 기준 점검 이력 조회. ch 미지정 시 전체. */
export async function listInspections(ch?: string): Promise<InspectionRow[]> {
  let q = supabase
    .from(TABLE)
    .select("*")
    .order("inspection_date", { ascending: false })
    .order("pos", { ascending: true });
  if (ch) q = q.eq("ch", ch);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as InspectionRow[];
}

/** 한 회차(여러 포지션) 저장 — (ch, inspection_date, pos) 충돌 시 갱신(upsert). */
export async function saveInspectionRound(
  rows: InspectionRow[]
): Promise<InspectionRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "ch,inspection_date,pos" })
    .select();
  if (error) throw error;
  return (data ?? []) as InspectionRow[];
}

/** 특정 차량의 특정 점검일 회차 전체 삭제. */
export async function deleteInspectionRound(
  ch: string,
  date: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("ch", ch)
    .eq("inspection_date", date);
  if (error) throw error;
}
