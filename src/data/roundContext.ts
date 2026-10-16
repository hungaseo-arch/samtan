// @section: round-context
// validateRound() 에 넘길 비교 기준을 TMS_DATA·점검 이력에서 뽑는다 (§A-8).
import { TMS_DATA, HEAD_MAP } from "./tmsData";
import { unitByCh } from "./tmsUtils";
import type { InspectionRow } from "@/api/inspections";
import type { PrevRound, ValidateContext } from "@/lib/roundValidate";

const POSITIONS = Object.values(HEAD_MAP);

/**
 * 그 점검일에 (ch, pos) 에 달려 있어야 할 시리얼.
 * 마지막 교체가 점검일 이전이면 현재 장착(v_current_tire), 아니면 점검일 이전 마지막 교체의 신품.
 * 점검일 이전 교체 기록이 없는데 이후 교체가 있으면 알 수 없다 → null (검증 생략).
 */
export function expectedSerialAt(ch: string, pos: string, date: string): string | null {
  const rs = TMS_DATA.repl
    .filter((r) => r.ch === ch && r.pos === pos)
    .sort((a, b) => a.date.localeCompare(b.date));
  const current = unitByCh(ch)?.positions.find((p) => p.pos === pos)?.serial || null;
  if (!rs.length || rs[rs.length - 1].date <= date) return current;
  const before = rs.filter((r) => r.date <= date);
  return before.length ? before[before.length - 1].newSerial || null : null;
}

/** 점검일 이전 회차들에서 직전 계기값과 포지션별 마지막 측정 트레드 */
export function prevRoundOf(history: InspectionRow[], ch: string, date: string): PrevRound | null {
  const rows = history
    .filter((r) => r.ch === ch && r.inspection_date < date && !r.deleted_at)
    .sort((a, b) => b.inspection_date.localeCompare(a.inspection_date));
  if (!rows.length) return null;
  const meter = rows.find((r) => r.km != null || r.hm != null);
  const byPos: PrevRound["byPos"] = {};
  for (const r of rows) {
    if (byPos[r.pos] || r.tread == null || r.tread_status === "not_measured") continue;
    byPos[r.pos] = { tread: r.tread, serial: r.serial };
  }
  return { hm: meter?.hm ?? null, km: meter?.km ?? null, byPos };
}

export function validateContextFor(history: InspectionRow[], ch: string, date: string): ValidateContext {
  const expectedSerial: Record<string, string | null> = {};
  for (const pos of POSITIONS) expectedSerial[pos] = expectedSerialAt(ch, pos, date);
  return {
    prev: prevRoundOf(history, ch, date),
    expectedSerial,
    meterReset: !!TMS_DATA.units.find((u) => u.ch === ch)?.hmReset,
  };
}
