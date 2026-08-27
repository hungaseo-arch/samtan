// @section: tread-stats
// 트레드 4점(또는 16점) 측정값의 클라이언트 통계.
//
// 정본은 DB다 — recalc_inspection_tread_stats() 트리거가 저장 시 다시 계산한다.
// 이 모듈은 "입력 즉시 보여 주는 미리보기"용이며, 지시서 v3 §E-1 규칙 2에 따라
// **저장 후 DB 값과 소수점 자리까지 일치**해야 한다. 그래서 계산식뿐 아니라
// 반올림 순서까지 트리거와 동일하게 맞춘다:
//   avg = round(mean, 2)
//   sd  = round(stddev_samp, 3)          ← 표본(n-1). 모집단 SD 금지 (v3 §4.3)
//   cv  = round(sd_rounded / avg_rounded * 100, 1)   ← 이미 반올림된 값으로 나눈다
//
// JavaScript 에는 표준편차 내장이 없어 직접 구현한다. Excel STDEV.S 와 같은 식이다.

import { wearPatternThresholds } from "@/data/tmsData";

/** 폭 방향 측정 위치. L=Kiri=외측 / C1·C2=Tengah / R=Kanan=내측 (2026-08-26 확정 규약) */
export const WIDTH_POS = ["L", "C1", "C2", "R"] as const;
export type WidthPos = (typeof WIDTH_POS)[number];

export const SHOULDER_POS: readonly WidthPos[] = ["L", "R"];
export const CENTER_POS: readonly WidthPos[] = ["C1", "C2"];

export interface TreadStats {
  n: number;
  avg: number;
  min: number;
  max: number;
  range: number;
  /** 표본표준편차(n-1). n < 2 이면 null */
  sd: number | null;
  /** SD / Mean × 100 (%). 평균이 0이거나 sd 가 null 이면 null */
  cv: number | null;
  shoulder: number | null;
  center: number | null;
  outboard: number | null;
  inboard: number | null;
}

/**
 * PostgreSQL numeric 의 round() 는 half-away-from-zero 다.
 * Math.round 도 양수에서는 half-up 이지만, 부동소수 오차로 0.5 경계가
 * 아래로 밀리는 경우(예: 1.0049999999999999)가 있어 1ulp 만큼 밀어 준다.
 * 측정값은 음수가 될 수 없으므로 양수만 고려한다.
 */
function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f * (1 + Number.EPSILON)) / f;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 표본표준편차(n-1). n < 2 이면 null. */
export function sampleSd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/**
 * 폭 위치별 측정값 → 통계. 값이 하나도 없으면 null.
 * OUTLIER 로 제외할 점은 호출부에서 미리 빼고 넘긴다(트리거와 동일 규칙).
 */
export function treadStats(points: Partial<Record<WidthPos, number>>): TreadStats | null {
  const entries = WIDTH_POS.map((w) => [w, points[w]] as const).filter(
    (e): e is readonly [WidthPos, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
  );
  if (entries.length === 0) return null;

  const all = entries.map((e) => e[1]);
  const pick = (ws: readonly WidthPos[]) =>
    entries.filter((e) => ws.includes(e[0])).map((e) => e[1]);
  const avgOf = (xs: number[]) => (xs.length ? roundTo(mean(xs), 2) : null);

  const avg = roundTo(mean(all), 2);
  const sdRaw = sampleSd(all);
  const sd = sdRaw === null ? null : roundTo(sdRaw, 3);
  const min = Math.min(...all);
  const max = Math.max(...all);

  return {
    n: all.length,
    avg,
    min,
    max,
    range: roundTo(max - min, 2),
    sd,
    // 트리거와 같은 순서 — 반올림된 sd·avg 로 나눈다. 원값으로 나누면 1자리에서 갈릴 수 있다.
    cv: sd !== null && avg > 0 ? roundTo((sd / avg) * 100, 1) : null,
    shoulder: avgOf(pick(SHOULDER_POS)),
    center: avgOf(pick(CENTER_POS)),
    outboard: avgOf(pick(["L"])),
    inboard: avgOf(pick(["R"])),
  };
}

export type WearPattern = "shoulder" | "center" | "even" | "insufficient";
export type LateralPattern = "outboard" | "inboard" | "even" | "insufficient";

export interface PatternResult<T> {
  /** 마모량의 비. 분모가 임계 미만이면 null */
  ratio: number | null;
  pattern: T;
}

/**
 * 편마모 판정 — 깊이의 비가 아니라 **마모량의 비**다 (설계서 §11, v3 §D-3).
 * 분모(중앙 마모량 / 내측 마모량)가 wear_min_mm 미만이면 측정오차와 구분이 안 되므로
 * 판정을 보류한다. 경계값은 tire_config 정본을 경유한다.
 *
 * DB 뷰 v_wear_pattern 은 세그먼트 첫 회차를 기준점으로 쓰지만, 입력 화면에는
 * 아직 저장되지 않은 값뿐이라 직전 회차를 기준으로 잡는다. 그래서 이 결과는
 * 참고 표시이며 분석 화면의 값(뷰)과 다를 수 있다.
 */
function classify<T extends string>(
  baseA: number | null | undefined,
  currA: number | null | undefined,
  baseB: number | null | undefined,
  currB: number | null | undefined,
  high: T,
  low: T,
): PatternResult<T | "even" | "insufficient"> {
  const { upper, lower, wearMin } = wearPatternThresholds();
  if (baseA == null || currA == null || baseB == null || currB == null) {
    return { ratio: null, pattern: "insufficient" };
  }
  const wearB = baseB - currB;
  if (wearB < wearMin) return { ratio: null, pattern: "insufficient" };
  const ratio = roundTo((baseA - currA) / wearB, 3);
  if (ratio >= upper) return { ratio, pattern: high };
  if (ratio <= lower) return { ratio, pattern: low };
  return { ratio, pattern: "even" };
}

/** S/C — 숄더 마모량 ÷ 중앙 마모량. 높으면 숄더 과마모. */
export function scPattern(
  baseShoulder: number | null | undefined,
  currShoulder: number | null | undefined,
  baseCenter: number | null | undefined,
  currCenter: number | null | undefined,
): PatternResult<WearPattern> {
  return classify(baseShoulder, currShoulder, baseCenter, currCenter, "shoulder", "center");
}

/** O/I — 외측(Kiri) 마모량 ÷ 내측(Kanan) 마모량. 높으면 외측 편마모. */
export function oiPattern(
  baseOutboard: number | null | undefined,
  currOutboard: number | null | undefined,
  baseInboard: number | null | undefined,
  currInboard: number | null | undefined,
): PatternResult<LateralPattern> {
  return classify(baseOutboard, currOutboard, baseInboard, currInboard, "outboard", "inboard");
}

/**
 * 자동 CHECK 제안 (v3 §C-3). **저장을 막지 않고 경고만 띄운다** —
 * 현장이 기록 자체를 포기하게 만들지 않는 것이 v2 부터의 원칙이다.
 * 여기서 다루는 것은 한 회차 안에서 판정 가능한 두 조건뿐이고,
 * 직전 회차 대비 조건(평균 +0.5 mm 증가 / CV +5.0%p 급증)은 호출부가 덧붙인다.
 */
export const CHECK_MEDIAN_DEV_MM = 3.0;
export const CHECK_RANGE_RATIO = 0.4;

export function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
