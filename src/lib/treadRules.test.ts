import { describe, it, expect } from "vitest";
import { effectiveTread, meterOrNull, isStale } from "./treadRules";

describe("effectiveTread — 0 이상점 (R-2)", () => {
  it("0 하나 + 나머지 셋 ≥ critical → 이상점 제외 (834 L1 사례)", () => {
    const r = effectiveTread({ l: 0, c1: 9.43, c2: 10.1, r: 5.6 }, 3);
    expect(r).toEqual({ min: 5.6, avg: 8.38, outlier: true });
  });
  it("나머지 중 critical 미만이 있으면 진짜 소진일 수 있어 그대로", () => {
    expect(effectiveTread({ l: 0, c1: 2.5, c2: 6, r: 7 }, 3)?.outlier).toBe(false);
    expect(effectiveTread({ l: 0, c1: 2.5, c2: 6, r: 7 }, 3)?.min).toBe(0);
  });
  it("0 이 둘 이상이면 그대로", () => {
    expect(effectiveTread({ l: 0, c1: 0, c2: 6, r: 7 }, 3)).toMatchObject({ min: 0, outlier: false });
  });
  it("경계 — 나머지 최소가 정확히 critical 이면 제외한다", () => {
    expect(effectiveTread({ l: 3, c1: 0, c2: 6, r: 7 }, 3)).toMatchObject({ min: 3, outlier: true });
  });
  it("4점이 다 없으면 null", () => {
    expect(effectiveTread({ l: null, c1: 5, c2: 6, r: 7 }, 3)).toBeNull();
    expect(effectiveTread(null, 3)).toBeNull();
  });
  it("0 이 없으면 최소·평균 그대로", () => {
    expect(effectiveTread({ l: 8, c1: 9, c2: 10, r: 11 }, 3)).toEqual({ min: 8, avg: 9.5, outlier: false });
  });
});

describe("meterOrNull — KM·HM 0 은 미기록", () => {
  it("0·음수 → null, 양수 그대로, 문자열 유지", () => {
    expect(meterOrNull(0)).toBeNull();
    expect(meterOrNull(-5)).toBeNull();
    expect(meterOrNull(12)).toBe(12);
    expect(meterOrNull("N/A")).toBe("N/A");
    expect(meterOrNull(null)).toBeNull();
  });
});

describe("isStale", () => {
  it("기준일 초과만 오래된 값", () => {
    expect(isStale("2026-09-16", "2026-10-16", 30)).toBe(false);
    expect(isStale("2026-09-15", "2026-10-16", 30)).toBe(true);
    expect(isStale(null, "2026-10-16", 30)).toBe(false);
  });
});
