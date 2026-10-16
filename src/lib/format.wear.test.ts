import { describe, expect, it } from "vitest";
import { fmtKmPerMm, kmPerMmOf } from "./format";

describe("kmPerMmOf", () => {
  it("mm/1,000 km 를 km/mm 로 뒤집는다", () => {
    expect(fmtKmPerMm(kmPerMmOf(0.271))).toBe("3,690 km/mm");
  });

  it("0 이하·없음·비유한 값은 null — 0 근처 발산을 숫자로 내지 않는다", () => {
    expect(kmPerMmOf(0)).toBeNull();
    expect(kmPerMmOf(-0.1)).toBeNull();
    expect(kmPerMmOf(null)).toBeNull();
    expect(kmPerMmOf(Number.NaN)).toBeNull();
  });
});
