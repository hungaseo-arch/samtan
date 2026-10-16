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

export interface MeterOffsetInput {
  /** YYYY-MM-DD. null 이면 보정 해제 (offset 도 함께 비운다) */
  resetDate: string | null;
  hmOffset: number | null;
  kmOffset: number | null;
}

/**
 * 계기 리셋 보정값 저장 (지시서 2026-10-16 §A-9). 저장 후 호출부가 loadData() 로 TMS_DATA 를 갱신할 것.
 * 점검 원본(inspections)은 건드리지 않는다 — 읽을 때 buildRounds() 가 더한다.
 * ⚠ 호출부는 반드시 canWrite/canDelete로 게이팅 + RLS가 최종 방어선
 */
export async function updateVehicleMeterOffset(ch: string, v: MeterOffsetInput): Promise<void> {
  const clear = !v.resetDate;
  for (const x of [v.hmOffset, v.kmOffset]) {
    if (x != null && (!Number.isFinite(x) || x < 0)) throw new Error("invalid offset");
  }
  const { data, error } = await supabase
    .from("vehicles")
    .update({
      reset_date: clear ? null : v.resetDate,
      hm_offset: clear ? null : v.hmOffset,
      km_offset: clear ? null : v.kmOffset,
    })
    .eq("ch", ch)
    .select("ch");
  if (error) throw error;
  // RLS 가 막으면 오류 없이 0행이 돌아온다 — 저장된 척하지 않는다.
  if (!data || data.length === 0) throw new Error("vehicle not updated (no permission?)");
}
