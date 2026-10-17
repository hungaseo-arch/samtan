import { describe, expect, it } from "vitest";
import type { Unit } from "./tmsData";
import { economics, unitKmMissing } from "./tmsUtils";

// TCO-04 — KM 이 없는 차량(CH 849)은 손실 0 이 아니라 «주행거리 미입력» 이다
const unit = (km: (number | null)[]) =>
  ({ ch: "849", km, dates: km.map((_, i) => `2026-09-0${i + 1}`), positions: [], rounds: [] }) as unknown as Unit;

describe("unitKmMissing", () => {
  it("KM 이 2회차 미만이면 미입력", () => {
    expect(unitKmMissing(unit([null, null, null]))).toBe(true);
    expect(unitKmMissing(unit([1200, null]))).toBe(true);
    expect(unitKmMissing(unit([1200, 1500]))).toBe(false);
  });

  it("미입력 차량의 연료·수명 손실은 0 이 아니라 null", () => {
    const e = economics(unit([null, null]));
    expect(e.kmMissing).toBe(true);
    expect(e.fuelL).toBeNull();
    expect(e.fuelCost).toBeNull();
    expect(e.lifeKm).toBeNull();
    expect(e.lifeCost).toBeNull();
  });
});
