// @section: tread-rules
// 결측·이상점 규칙 (점검보고서 CHK-TMS-2026-10-16-WEB R-2). 순수 함수만 둔다.
//
// ① 4점 중 0 이 정확히 하나이고 나머지 셋이 모두 tread_critical 이상이면
//    그 0 은 측정 누락(빈칸이 0 으로 저장된 것)으로 보고 판정에서 뺀다
//    (사용자 결정 2026-10-16 «이상점 제외 후 판정»).
//    예: CH 834 L1 0 / 9.43 / 10.10 / 5.60 → 5.60 (이상점 제외)
//    원본 DB 값은 고치지 않는다 — 화면 판정만 바꾸고 «이상점 제외» 배지를 붙인다.
// ② KM·HM 0 이하는 «미기록» 이다. 0 km 로 두면 주행거리·마모율이 튄다 (LIFE-04).
// ③ 측정일이 오늘(WITA)로부터 stale_days 를 넘으면 «오래된 값» 이다.
import type { TreadWidths } from "@/data/tmsData";
import { daysBetween } from "@/lib/lifeProjection";

export interface EffectiveTread {
  /** 판정에 쓰는 최소값 (mm) */
  min: number;
  /** 판정에 쓰는 평균 (mm) — 이상점을 뺀 점들의 평균 */
  avg: number;
  /** 0 하나를 이상점으로 뺐다 */
  outlier: boolean;
}

/**
 * 4점 원시값 → 판정용 트레드. 4점이 다 있지 않으면 null (호출부가 저장된 값을 그대로 쓴다).
 * 0 이 둘 이상이거나 나머지 중 critical 미만이 있으면 진짜 소진일 수 있어 건드리지 않는다.
 */
export function effectiveTread(w: TreadWidths | null | undefined, critical: number): EffectiveTread | null {
  if (!w) return null;
  const pts = [w.l, w.c1, w.c2, w.r];
  if (pts.some((v) => v == null || !Number.isFinite(v))) return null;
  const xs = pts as number[];
  const zeros = xs.filter((v) => v === 0).length;
  const rest = xs.filter((v) => v !== 0);
  const mean = (a: number[]) => Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 100) / 100;
  if (zeros === 1 && rest.every((v) => v >= critical)) {
    return { min: Math.min(...rest), avg: mean(rest), outlier: true };
  }
  return { min: Math.min(...xs), avg: mean(xs), outlier: false };
}

/** KM·HM — 0 이하·비숫자는 미기록(null). 문자열 표기(예: "N/A")는 그대로 둔다. */
export function meterOrNull<T extends number | string | null | undefined>(v: T): T | null {
  if (v == null) return null;
  if (typeof v === "number") return v > 0 && Number.isFinite(v) ? v : null;
  return v;
}

/** 측정일이 today 로부터 days 일을 넘었는가. 날짜가 없으면 false (판정 대상 아님). */
export function isStale(date: string | null | undefined, today: string, days: number): boolean {
  if (!date) return false;
  return daysBetween(date, today) > days;
}
