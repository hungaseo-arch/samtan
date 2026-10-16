import { describe, it, expect } from "vitest";
import { costParamAt, cpk, tireTotalCost, toIdr } from "./economics";
import type { CostParam } from "@/data/tmsData";

const P = (effectiveFrom: string, unitPrice: number | null): CostParam =>
  ({ effectiveFrom, unitPrice, currency: "IDR", retreadAllowed: false });

describe("economics — B-1 원가·CPK", () => {
  it("원가 행은 기준일 이전 최신 행, 기준일 없으면 최신 행", () => {
    const ps = [P("2026-01-01", 100), P("2026-06-01", 120), P("2026-03-01", 110)];
    expect(costParamAt(ps, "2026-04-15")?.unitPrice).toBe(110);
    expect(costParamAt(ps, "2026-06-01")?.unitPrice).toBe(120);
    expect(costParamAt(ps, "2025-12-31")).toBeNull();
    expect(costParamAt(ps, null)?.unitPrice).toBe(120);
  });

  it("총비용 = 구매가(없으면 기본 단가) + 재생비, 둘 다 없으면 null", () => {
    expect(tireTotalCost({ purchasePrice: 1000, unitPrice: 900, retreadCost: 0 })).toBe(1000);
    expect(tireTotalCost({ purchasePrice: null, unitPrice: 900, retreadCost: 0 })).toBe(900);
    // 수용 기준: 재생 1회 타이어의 총비용 = 구매가 + 재생비
    expect(tireTotalCost({ purchasePrice: 1000, unitPrice: null, retreadCost: 350 })).toBe(1350);
    expect(tireTotalCost({ purchasePrice: null, unitPrice: null, retreadCost: 350 })).toBeNull();
  });

  it("CPK — 단가 미입력·km 없음은 null (0 이 아님)", () => {
    expect(cpk(1520, 100_000)).toBeCloseTo(0.0152);
    expect(cpk(null, 100_000)).toBeNull();
    expect(cpk(1520, 0)).toBeNull();
    expect(cpk(1520, null)).toBeNull();
  });

  it("IDR 환산은 USD + 환율이 있을 때만", () => {
    expect(toIdr(10, "USD", 16_000)).toBe(160_000);
    expect(toIdr(10, "USD", null)).toBeNull();
    expect(toIdr(10, "IDR", 16_000)).toBeNull();
  });
});
