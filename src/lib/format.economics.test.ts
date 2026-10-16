import { describe, it, expect } from "vitest";
import { fmtLitre, fmtMoneyReport } from "./format";
import { fleetEconomics } from "@/data/tmsUtils";

describe("B-4 보고서 표기", () => {
  it("USD 는 소수 2자리, IDR 은 정수 전체 자리수", () => {
    expect(fmtMoneyReport(1250, "USD")).toBe("USD 1,250.00");
    expect(fmtMoneyReport(18_500_000, "IDR")).toBe("IDR 18,500,000");
    expect(fmtMoneyReport(18_500_000.6)).toBe("IDR 18,500,001");
  });
  it("값이 없으면 대시", () => {
    expect(fmtMoneyReport(null, "USD")).toBe("—");
    expect(fmtLitre(undefined)).toBe("—");
    expect(fmtLitre(1234.56)).toBe("1,234.6 L");
  });
});

describe("B-4 fleetEconomics — 미설정 상태", () => {
  it("수용 기준: 데이터·계수가 없으면 KPI 가 전부 null 이고 오류 없음", () => {
    const f = fleetEconomics([]);
    expect(f.rows).toEqual([]);
    expect(f.avgCpk).toBeNull();
    expect(f.compliance.pct).toBeNull();
    expect(f.fuelCost).toBeNull();
    expect(f.lifeCost).toBeNull();
    expect(f.monthly).toEqual([]);
  });
});
