// @section: pressure-judge
// 공기압 판정 — 화면 4곳(statusOf·statusFromValues·PressureTab·getUnitAlerts)에 따로 박혀 있던
// 규칙의 단일 정본 (지시서 2026-10-16 §A-4).
//
// 규칙 (사용자 결정 2026-10-16 — 과압 +15% 초과는 위험):
//   위험  실측 < 권장 × lowRatio        (저압)
//         (실측 − 권장)/권장 > devDanger (과압)
//   주의  |편차| > devWarn
//   정상  그 외 (|편차| ≤ devWarn)
// 경계값은 tire_config 정본(pressureThresholds)을 쓰고, 테스트는 th 를 직접 넘긴다.
import { pressureThresholds } from "@/data/tmsData";

export type PressureLevel = "ok" | "warn" | "danger";
/** 위험·주의의 원인. 정상이면 null */
export type PressureCause = "low" | "high" | null;

export interface PressureThresholds {
  lowRatio: number;
  devWarn: number;
  devDanger: number;
}

export interface PressureJudgement {
  level: PressureLevel;
  cause: PressureCause;
  /** (실측 − 권장)/권장 × 100 */
  devPct: number;
}

export function judgePressure(
  press: number,
  target: number,
  th: PressureThresholds = pressureThresholds(),
): PressureJudgement {
  const dev = (press - target) / target;
  const devPct = dev * 100;
  if (press < target * th.lowRatio) return { level: "danger", cause: "low", devPct };
  if (dev > th.devDanger) return { level: "danger", cause: "high", devPct };
  if (Math.abs(dev) > th.devWarn) return { level: "warn", cause: dev < 0 ? "low" : "high", devPct };
  return { level: "ok", cause: null, devPct };
}

/** 등급만 필요할 때 */
export function pressureJudge(
  press: number,
  target: number,
  th?: PressureThresholds,
): PressureLevel {
  return judgePressure(press, target, th).level;
}
