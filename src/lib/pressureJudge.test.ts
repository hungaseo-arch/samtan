import { describe, it, expect } from "vitest";
import { judgePressure, pressureJudge } from "./pressureJudge";

// 초기값: 저압 85% · 정상 ±5% · 과압 +15% (사용자 결정 2026-10-16)
const TH = { lowRatio: 0.85, devWarn: 0.05, devDanger: 0.15 };

describe("pressureJudge — 구동축 권장 116 psi", () => {
  it("±5% 이내는 정상", () => {
    expect(pressureJudge(116, 116, TH)).toBe("ok");
    expect(pressureJudge(121, 116, TH)).toBe("ok"); // +4.3%
    expect(pressureJudge(111, 116, TH)).toBe("ok"); // −4.3%
  });

  it("5~15% 편차는 주의 (저압·과압 모두)", () => {
    expect(judgePressure(125, 116, TH)).toMatchObject({ level: "warn", cause: "high" }); // +7.8%
    expect(judgePressure(105, 116, TH)).toMatchObject({ level: "warn", cause: "low" });  // −9.5%
  });

  it("권장의 85% 미만은 위험(저압)", () => {
    expect(judgePressure(98, 116, TH)).toMatchObject({ level: "danger", cause: "low" }); // 84.5%
  });

  it("+15% 초과는 위험(과압)", () => {
    expect(judgePressure(134, 116, TH)).toMatchObject({ level: "danger", cause: "high" }); // +15.5%
  });

  it("경계는 미만·초과 판정 — 정확히 85% 와 +15% 는 주의", () => {
    expect(pressureJudge(85, 100, TH)).toBe("warn");
    expect(pressureJudge(115, 100, TH)).toBe("warn");
    expect(pressureJudge(105, 100, TH)).toBe("ok");
  });

  it("devPct 는 권장 대비 백분율 편차", () => {
    expect(judgePressure(110, 100, TH).devPct).toBeCloseTo(10);
  });
});
