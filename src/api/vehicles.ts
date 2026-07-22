// @section: vehicles-api
// 차량(CH) 추가 — vehicles + vehicle_positions(10본) 생성. (쓰기: authenticated 필요, RLS 0006)
import { supabase } from "@/lib/supabase";
import { HEAD_MAP } from "@/data/tmsData";

export class DuplicateVehicleError extends Error {}

/** 새 차량(CH)과 표준 10개 포지션을 생성. 중복 시 DuplicateVehicleError.
 *  ⚠ 호출부는 반드시 canWrite/canDelete로 게이팅 + RLS가 최종 방어선 */
export async function createVehicle(ch: string): Promise<void> {
  const c = ch.trim();
  if (!c) throw new Error("빈 차량 번호");

  // 중복 확인
  const { data: exist, error: qe } = await supabase
    .from("vehicles").select("ch").eq("ch", c).maybeSingle();
  if (qe) throw qe;
  if (exist) throw new DuplicateVehicleError(c);

  // 다음 seq
  const { data: maxRow } = await supabase
    .from("vehicles").select("seq").order("seq", { ascending: false }).limit(1).maybeSingle();
  const nextSeq = ((maxRow?.seq as number | undefined) ?? 0) + 1;

  const { error: ve } = await supabase.from("vehicles").insert({ ch: c, seq: nextSeq });
  if (ve) throw ve;

  // 표준 10개 포지션 (HEAD_MAP 순서)
  const positions = Array.from({ length: 10 }, (_, i) => ({
    ch: c, pos: HEAD_MAP[i + 1], serial: "", seq: i + 1,
  }));
  const { error: pe } = await supabase.from("vehicle_positions").insert(positions);
  if (pe) throw pe;
}
