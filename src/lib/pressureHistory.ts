// @section: pressure-history
// 공기압 이력 분석 순수 계산 (지시서 2026-10-16 §B-2).
//
// 준수율   = 정상 회차 ÷ 측정 회차 (판정은 pressureJudge 정본 — 기본 ±5%)
// 저압 노출 = Σ 저압 회차 i 의 (권장 − 실측)/권장 × 100 × (회차 i → i+1 주행 KM), 단위 %·km
//   · 가정: 회차 i 의 공기압이 다음 회차까지 그대로 유지됐다. (화면 각주에 명시)
//   · «저압 회차» = 판정이 저압(주의·위험 중 cause = low)인 회차. 정상 범위(±5%) 안의
//     소폭 저압은 넣지 않는다 — «전 회차 정상이면 노출 0» (수용 기준)과 맞추기 위함.
//   · 다음 회차 KM 이 없거나 역행·0 이면 그 회차는 거리를 알 수 없어 빠진다. 마지막 회차도 빠진다.
import { judgePressure, type PressureThresholds } from "@/lib/pressureJudge";

export interface PressRound {
  date: string;
  /** 실측 psi. 미측정·N/A 는 null */
  press: number | null;
  /** 권장 psi */
  rec: number;
  km: number | null;
}

export interface Compliance {
  ok: number;
  total: number;
  /** ok ÷ total × 100. 측정 회차가 없으면 null */
  pct: number | null;
}

export function pressureComplianceOf(rounds: PressRound[], th?: PressureThresholds): Compliance {
  let ok = 0, total = 0;
  for (const r of rounds) {
    if (r.press == null || !(r.rec > 0)) continue;
    total++;
    if (judgePressure(r.press, r.rec, th).level === "ok") ok++;
  }
  return { ok, total, pct: total ? (ok / total) * 100 : null };
}

/** 회차 i 의 편차(%) 평균 — 부호 유지(저압 −). 측정 회차가 없으면 null */
export function meanDeviationPct(rounds: PressRound[]): number | null {
  let s = 0, n = 0;
  for (const r of rounds) {
    if (r.press == null || !(r.rec > 0)) continue;
    s += ((r.press - r.rec) / r.rec) * 100;
    n++;
  }
  return n ? s / n : null;
}

export interface ExposureInterval {
  /** 저압 회차의 점검일 — 월 집계 기준 */
  date: string;
  /** (권장 − 실측)/권장 × 100 */
  lowPct: number;
  /** 회차 i → i+1 주행 KM */
  km: number;
}

/** 저압 회차별 노출 구간. rounds 는 날짜 오름차순 · 같은 장착 구간이어야 한다 */
export function exposureIntervals(rounds: PressRound[], th?: PressureThresholds): ExposureInterval[] {
  const out: ExposureInterval[] = [];
  for (let i = 0; i < rounds.length - 1; i++) {
    const r = rounds[i];
    if (r.press == null || !(r.rec > 0)) continue;
    const j = judgePressure(r.press, r.rec, th);
    if (j.cause !== "low") continue;
    const a = r.km, b = rounds[i + 1].km;
    if (a == null || b == null || !(b > a)) continue;
    out.push({ date: r.date, lowPct: -j.devPct, km: b - a });
  }
  return out;
}

/** Σ lowPct × km (%·km) */
export function exposureSum(iv: ExposureInterval[]): number {
  return iv.reduce((s, x) => s + x.lowPct * x.km, 0);
}
