import { describe, it, expect } from "vitest";
import { axleGroupOf, sideImbalance, wearDevLevel } from "./fleetWear";

describe("fleetWear (§A-6)", () => {
  it("축 그룹", () => {
    expect(axleGroupOf("L1")).toBe("steer");
    expect(axleGroupOf("R1")).toBe("steer");
    expect(axleGroupOf("L2 Out")).toBe("outer");
    expect(axleGroupOf("R3 Out")).toBe("outer");
    expect(axleGroupOf("L3 In")).toBe("inner");
    expect(axleGroupOf("R2 In")).toBe("inner");
  });

  it("평균 대비 +20% 이상 노랑, +40% 이상 빨강", () => {
    expect(wearDevLevel(0.5, 0.5)).toBe("ok");
    expect(wearDevLevel(0.59, 0.5)).toBe("ok");
    expect(wearDevLevel(0.6, 0.5)).toBe("warn");
    expect(wearDevLevel(0.7, 0.5)).toBe("danger");
    expect(wearDevLevel(0.3, 0.5)).toBe("ok");
    expect(wearDevLevel(null, 0.5)).toBeNull();
    expect(wearDevLevel(0.5, null)).toBeNull();
  });

  it("좌우 편차 ≥15% 경고", () => {
    const even = sideImbalance([{ pos: "L1", rate: 0.5 }, { pos: "R1", rate: 0.52 }]);
    expect(even?.warn).toBe(false);
    const skew = sideImbalance([
      { pos: "L1", rate: 0.6 }, { pos: "L2 Out", rate: 0.6 },
      { pos: "R1", rate: 0.5 }, { pos: "R2 Out", rate: null },
    ]);
    expect(skew?.left).toBeCloseTo(0.6);
    expect(skew?.right).toBeCloseTo(0.5);
    expect(skew?.ratio).toBeCloseTo(0.1 / 0.55);
    expect(skew?.warn).toBe(true);
    expect(sideImbalance([{ pos: "L1", rate: 0.5 }, { pos: "R1", rate: null }])).toBeNull();
  });
});
