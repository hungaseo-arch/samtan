// @section: meter-offset
// HM/KM 계기 리셋 보정 (지시서 2026-10-16 §A-9).
//
// 계기를 교체·리셋한 차량은 리셋일부터 HM·KM 이 0 근처에서 다시 시작한다.
// 리셋 직전 누적값(offset)을 리셋일 이후(포함) 회차에 더해 하나의 연속 시계열로 잇는다.
// DB 원본(inspections)은 고치지 않는다 — 읽을 때만 더한다.

export interface MeterOffset {
  /** 리셋일 YYYY-MM-DD. 이 날짜 이후(포함) 회차에 더한다 */
  resetDate: string;
  /** 리셋 직전 누적 HM. null 이면 HM 은 보정 안 함 */
  hm: number | null;
  /** 리셋 직전 누적 KM. null 이면 KM 은 보정 안 함 */
  km: number | null;
}

/** vehicles 행 → 보정값. 리셋일이 없거나 offset 이 둘 다 없으면 null */
export function meterOffsetOf(v: {
  reset_date?: string | null;
  hm_offset?: number | string | null;
  km_offset?: number | string | null;
}): MeterOffset | null {
  if (!v.reset_date) return null;
  const num = (x: number | string | null | undefined) => (x == null || x === "" ? null : Number(x));
  const hm = num(v.hm_offset), km = num(v.km_offset);
  if (hm == null && km == null) return null;
  return { resetDate: v.reset_date, hm, km };
}

/** 한 회차의 계기값 보정. 리셋일 이전이거나 값·offset 이 없으면 그대로 */
export function applyMeterOffset(
  date: string,
  value: number | null,
  which: "hm" | "km",
  off: MeterOffset | null,
): number | null {
  if (value == null || !off || date < off.resetDate) return value;
  const add = off[which];
  return add == null ? value : value + add;
}

/**
 * 리셋일 이전 마지막 계기값 — 관리자 화면에서 offset 입력 힌트로 보여 준다.
 * dates·values 는 날짜 오름차순이고, 리셋 이전 값은 보정되지 않은 원본이다.
 */
export function lastBeforeReset(
  dates: (string | null)[],
  values: (number | string | null)[],
  resetDate: string,
): number | null {
  let out: number | null = null;
  dates.forEach((d, i) => {
    const v = values[i];
    if (d && d < resetDate && typeof v === "number") out = v;
  });
  return out;
}
