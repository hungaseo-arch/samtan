import { describe, it, expect } from "vitest";
import { normalizeSerial, normalizeSerialOrNull } from "./serial";

describe("normalizeSerial (M-11)", () => {
  it("대문자 · 공백 제거", () => {
    expect(normalizeSerial(" da1bfanh 07451d ")).toBe("DA1BFANH07451D");
    expect(normalizeSerial("NONTK-001")).toBe("NONTK-001");
  });
  it("빈 값", () => {
    expect(normalizeSerial(null)).toBe("");
    expect(normalizeSerialOrNull("  ")).toBeNull();
    expect(normalizeSerialOrNull(undefined)).toBeNull();
  });
});
