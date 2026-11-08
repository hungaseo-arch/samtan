import { describe, it, expect } from "vitest";
import { irregularWear, irregularOfWidths } from "./irregularWear";

describe("irregularWear (§A-7)", () => {
  it("max−min ≥3 노랑, ≥5 빨강, 경계는 이상", () => {
    expect(irregularWear([12, 12.5, 12.2, 11.8])?.level).toBe("ok");
    expect(irregularWear([11.2, 9.0, 8.2, 10.0])?.level).toBe("warn");   // 3.0 정확히
    expect(irregularWear([14, 12, 10, 9])?.level).toBe("danger");        // 5.0 정확히
    expect(irregularWear([14, 12, 10, 9])?.range).toBeCloseTo(5);
  });

  it("외측 2점 평균 < 내측 2점 평균 − 3 mm → 외측 숄더", () => {
    expect(irregularWear([6, 7, 11, 12])?.shoulder).toBe("outer");   // 6.5 vs 11.5
    expect(irregularWear([12, 11, 7, 6])?.shoulder).toBe("inner");
    expect(irregularWear([8, 9, 11, 12])?.shoulder).toBeNull();     // 8.5 vs 11.5 → 차 3.0, 초과 아님
  });

  it("W-1 이상점(0 하나 · 나머지 ≥ critical)을 뺀 회차는 3점이라 판정 안 함 — 거짓 Δ 위험 배지 방지", () => {
    // CH 834 L1 2026-08-23: 0 / 9.43 / 10.10 / 5.60 — 트레드 판정은 5.60(이상점 제외), 편마모는 미판정
    expect(irregularOfWidths({ l: 0, c1: 9.43, c2: 10.1, r: 5.6 }, 3)).toBeNull();
    // 0 이 둘이면 진짜 소진일 수 있어 그대로 판정한다
    expect(irregularOfWidths({ l: 0, c1: 0, c2: 10, r: 9 }, 3)?.level).toBe("danger");
    // 0 하나지만 나머지에 critical 미만이 있으면 이상점이 아니다 → 그대로 판정
    expect(irregularOfWidths({ l: 0, c1: 2.5, c2: 10, r: 9 }, 3)?.level).toBe("danger");
  });

  it("4점이 다 없으면 판정 안 함 (미입력 회차는 기존과 동일)", () => {
    expect(irregularWear([12, null, 11, 10])).toBeNull();
    expect(irregularOfWidths(null)).toBeNull();
    expect(irregularOfWidths({ l: 10, c1: 10, c2: 10, r: 10 })?.level).toBe("ok");
  });
});
