// @section: inspection-age
// 점검 지연 판정 (지시서 2026-10-16 §A-3). 순수 함수 — 주기는 호출부가 tire_config 에서 넘긴다.
import { daysBetween } from "./lifeProjection";

/** 경과일이 주기의 이 배수를 넘으면 지연 */
export const OVERDUE_FACTOR = 1.5;

/** none = 주기 이내 · due = 주기 초과(곧 점검) · overdue = 주기 × 1.5 초과 */
export type InspectionLag = "none" | "due" | "overdue";

export interface InspectionAge {
  lastDate: string | null;
  /** 마지막 점검일부터 오늘까지 일수 */
  days: number | null;
  level: InspectionLag;
}

/**
 * @param dates    회차 날짜 (YYYY-MM-DD, 빈값 허용, 순서 무관)
 * @param today    오늘 — 반드시 todayInField() (현장 WITA)
 * @param interval 점검 주기(일) — inspectionIntervalDays()
 */
export function inspectionAge(dates: (string | null | undefined)[], today: string, interval: number): InspectionAge {
  const ds = dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10));
  if (!ds.length) return { lastDate: null, days: null, level: "none" };
  const lastDate = ds.reduce((a, b) => (b > a ? b : a));
  const days = daysBetween(lastDate, today);
  const level: InspectionLag =
    days > interval * OVERDUE_FACTOR ? "overdue" : days > interval ? "due" : "none";
  return { lastDate, days, level };
}
