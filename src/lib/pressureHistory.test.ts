import { describe, it, expect } from "vitest";
import { exposureIntervals, exposureSum, meanDeviationPct, pressureComplianceOf, type PressRound } from "./pressureHistory";

const TH = { lowRatio: 0.85, devWarn: 0.05, devDanger: 0.15 };
const R = (date: string, press: number | null, km: number | null, rec = 116): PressRound => ({ date, press, rec, km });

describe("pressureHistory — B-2 준수율·저압 노출", () => {
  it("수용 기준: 전 회차 정상(±5% 안, 소폭 저압 포함)이면 준수율 100.0%, 노출 0", () => {
    const rs = [R("2026-01-01", 116, 0), R("2026-01-15", 112, 1000), R("2026-02-01", 120, 2000)];
    expect(pressureComplianceOf(rs, TH).pct).toBe(100);
    expect(exposureSum(exposureIntervals(rs, TH))).toBe(0);
  });

  it("저압 회차는 다음 회차까지의 KM 으로 가중 — 마지막 회차는 빠진다", () => {
    // 100 psi / 권장 116 → 13.79% 저압, 다음 회차까지 1,000 km
    const rs = [R("2026-01-01", 100, 0), R("2026-01-15", 116, 1000), R("2026-02-01", 90, 2000)];
    const iv = exposureIntervals(rs, TH);
    expect(iv).toHaveLength(1);
    expect(iv[0].km).toBe(1000);
    expect(exposureSum(iv)).toBeCloseTo((16 / 116) * 100 * 1000);
    expect(pressureComplianceOf(rs, TH)).toEqual({ ok: 1, total: 3, pct: (1 / 3) * 100 });
  });

  it("과압·미측정은 노출에 안 들어가고, 미측정은 준수율 분모에서도 빠진다", () => {
    const rs = [R("2026-01-01", 140, 0), R("2026-01-15", null, 1000), R("2026-02-01", 116, 2000)];
    expect(exposureSum(exposureIntervals(rs, TH))).toBe(0);
    expect(pressureComplianceOf(rs, TH)).toEqual({ ok: 1, total: 2, pct: 50 });
  });

  it("다음 회차 KM 이 없거나 역행이면 그 구간은 빠진다", () => {
    const rs = [R("2026-01-01", 100, 5000), R("2026-01-15", 100, null), R("2026-02-01", 100, 4000), R("2026-02-15", 116, 4500)];
    const iv = exposureIntervals(rs, TH);
    expect(iv.map((x) => x.km)).toEqual([500]);
  });

  it("측정 회차가 없으면 준수율·평균 편차 null", () => {
    expect(pressureComplianceOf([R("2026-01-01", null, 0)], TH).pct).toBeNull();
    expect(meanDeviationPct([])).toBeNull();
    expect(meanDeviationPct([R("d", 110, 0, 100), R("d", 90, 0, 100)])).toBeCloseTo(0);
  });
});
