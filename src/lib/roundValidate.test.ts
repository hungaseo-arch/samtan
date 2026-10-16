import { describe, it, expect } from "vitest";
import { validateRound, hasError, type ValidateContext } from "./roundValidate";

const ctx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  prev: { hm: 5000, km: 700000, byPos: { L1: { tread: 12.0, serial: "A1" } } },
  expectedSerial: { L1: "A1" },
  meterReset: false,
  ...over,
});
const row = (o: Partial<{ serial: string | null; pressure: number | null; tread: number | null }> = {}) => ({
  pos: "L1", serial: "A1", pressure: 100, tread: 11.5, ...o,
});

describe("validateRound", () => {
  it("정상 입력은 이슈 없음", () => {
    expect(validateRound({ hm: 5100, km: 701000, rows: [row()] }, ctx())).toEqual([]);
  });

  it("KM·HM 역행은 경고, 계기 리셋 차량은 제외", () => {
    const xs = validateRound({ hm: 4900, km: 699000, rows: [] }, ctx());
    expect(xs.map((x) => x.code)).toEqual(["km_back", "hm_back"]);
    expect(hasError(xs)).toBe(false);
    expect(validateRound({ hm: 10, km: 10, rows: [] }, ctx({ meterReset: true }))).toEqual([]);
  });

  it("공기압 0 이하·200 초과는 오류, 200 은 허용", () => {
    expect(hasError(validateRound({ hm: null, km: null, rows: [row({ pressure: 0 })] }, ctx()))).toBe(true);
    expect(hasError(validateRound({ hm: null, km: null, rows: [row({ pressure: 201 })] }, ctx()))).toBe(true);
    expect(validateRound({ hm: null, km: null, rows: [row({ pressure: 200 })] }, ctx())).toEqual([]);
  });

  it("트레드가 직전보다 1 mm 초과 증가하면 경고 (정확히 1 mm 는 허용)", () => {
    expect(validateRound({ hm: null, km: null, rows: [row({ tread: 13.0 })] }, ctx())).toEqual([]);
    const xs = validateRound({ hm: null, km: null, rows: [row({ tread: 13.1 })] }, ctx());
    expect(xs[0]).toMatchObject({ code: "tread_rise", level: "warn", ref: 12.0 });
  });

  it("시리얼 불일치는 교체 미등록 경고, 이때 트레드 증가는 따지지 않는다", () => {
    const xs = validateRound({ hm: null, km: null, rows: [row({ serial: "B2", tread: 22 })] }, ctx());
    expect(xs).toEqual([{ level: "warn", code: "serial_mismatch", pos: "L1", ref: "A1", value: "B2" }]);
  });

  it("직전 회차가 없으면 비교 검증은 건너뛴다", () => {
    expect(validateRound({ hm: 1, km: 1, rows: [row({ tread: 22 })] }, ctx({ prev: null }))).toEqual([]);
  });
});
