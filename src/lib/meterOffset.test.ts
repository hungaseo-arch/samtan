import { describe, it, expect } from "vitest";
import { applyMeterOffset, lastBeforeReset, meterOffsetOf, type MeterOffset } from "./meterOffset";

describe("meterOffset (§A-9)", () => {
  const off: MeterOffset = { resetDate: "2026-07-05", hm: 5000, km: null };

  it("리셋일 이후(포함)만 더하고, offset 이 없는 계기는 그대로", () => {
    expect(applyMeterOffset("2026-07-04", 4990, "hm", off)).toBe(4990);
    expect(applyMeterOffset("2026-07-05", 3, "hm", off)).toBe(5003);
    expect(applyMeterOffset("2026-08-01", 120, "hm", off)).toBe(5120);
    expect(applyMeterOffset("2026-08-01", 800, "km", off)).toBe(800);
    expect(applyMeterOffset("2026-08-01", null, "hm", off)).toBeNull();
    expect(applyMeterOffset("2026-08-01", 120, "hm", null)).toBe(120);
  });

  it("보정 후 시계열이 단조 증가", () => {
    const dates = ["2026-06-20", "2026-07-01", "2026-07-05", "2026-07-20"];
    const raw = [4900, 4995, 2, 150];
    const out = dates.map((d, i) => applyMeterOffset(d, raw[i], "hm", off)!);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });

  it("vehicles 행 변환 — 리셋일·offset 이 없으면 null, 문자열 numeric 허용", () => {
    expect(meterOffsetOf({ reset_date: null, hm_offset: 1 })).toBeNull();
    expect(meterOffsetOf({ reset_date: "2026-07-05", hm_offset: null, km_offset: null })).toBeNull();
    expect(meterOffsetOf({ reset_date: "2026-07-05", hm_offset: "5000.5", km_offset: null }))
      .toEqual({ resetDate: "2026-07-05", hm: 5000.5, km: null });
  });

  it("리셋 직전 값 힌트", () => {
    expect(lastBeforeReset(["2026-06-20", "2026-07-01", "2026-07-05"], [4900, null, 2], "2026-07-05")).toBe(4900);
    expect(lastBeforeReset(["2026-07-05"], [2], "2026-07-05")).toBeNull();
  });
});
