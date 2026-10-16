import { describe, it, expect } from "vitest";
import { validateRound, hasError, type RoundInput, type RoundInputRow, type ValidateContext } from "./roundValidate";

const ctx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  prev: { hm: 5000, km: 700000, byPos: { L1: { tread: 12.0, serial: "A1" } } },
  expectedSerial: { L1: "A1" },
  meterReset: false,
  ...over,
});
const row = (o: Partial<RoundInputRow> = {}): RoundInputRow => ({
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

  it("공기압 50 미만·150 초과는 오류, 경계값 50·150 은 허용 (W-3)", () => {
    expect(hasError(validateRound({ hm: null, km: null, rows: [row({ pressure: 49 })] }, ctx()))).toBe(true);
    expect(hasError(validateRound({ hm: null, km: null, rows: [row({ pressure: 151 })] }, ctx()))).toBe(true);
    expect(validateRound({ hm: null, km: null, rows: [row({ pressure: 50 })] }, ctx())).toEqual([]);
    expect(validateRound({ hm: null, km: null, rows: [row({ pressure: 150 })] }, ctx())).toEqual([]);
  });

  it("권장값 ±15% 밖은 경고, 15% 정확히는 허용", () => {
    const at = (pressure: number) => validateRound({ hm: null, km: null, rows: [row({ pressure, recPsi: 100 })] }, ctx());
    expect(at(115)).toEqual([]);
    expect(at(85)).toEqual([]);
    expect(at(116)[0]).toMatchObject({ code: "pressure_dev", level: "warn", ref: 100, value: 116 });
    expect(at(84)[0]).toMatchObject({ code: "pressure_dev", level: "warn" });
    // 범위 오류가 나면 편차 경고는 겹쳐 띄우지 않는다
    expect(validateRound({ hm: null, km: null, rows: [row({ pressure: 160, recPsi: 100 })] }, ctx()).map((x) => x.code))
      .toEqual(["pressure_range"]);
  });

  it("트레드 측정점 0~23 mm 밖은 오류 (W-4)", () => {
    const at = (points: (number | null)[]) => validateRound({ hm: null, km: null, rows: [row({ points })] }, ctx());
    expect(at([0, 23, 11.5, null])).toEqual([]);
    expect(at([23.1, 11, 11, 11])[0]).toMatchObject({ code: "tread_range", level: "error", value: 23.1 });
    expect(at([-0.5, 11, 11, 11])[0]).toMatchObject({ code: "tread_range", level: "error" });
  });

  it("소수 2자리는 화면 입력에선 오류, 일괄 업로드(precisionLevel warn)에선 경고", () => {
    const input: RoundInput = { hm: null, km: null, rows: [row({ points: [11.25, 11.3, 0.1 + 0.2, 11] })] };
    expect(validateRound(input, ctx())[0]).toMatchObject({ code: "tread_precision", level: "error", value: 11.25 });
    expect(validateRound(input, ctx({ precisionLevel: "warn" }))[0]).toMatchObject({ level: "warn" });
    // 0.1+0.2 같은 부동소수 오차는 1자리로 본다
    expect(validateRound({ hm: null, km: null, rows: [row({ points: [0.1 + 0.2] })] }, ctx())).toEqual([]);
  });

  it("점검일이 오늘(WITA)보다 뒤면 오류, 오늘은 허용", () => {
    const c = ctx({ today: "2026-10-16" });
    expect(validateRound({ date: "2026-10-16", hm: null, km: null, rows: [] }, c)).toEqual([]);
    expect(validateRound({ date: "2026-10-17", hm: null, km: null, rows: [] }, c)[0])
      .toMatchObject({ code: "future_date", level: "error", ref: "2026-10-16" });
    // today 를 모르면 검사하지 않는다
    expect(validateRound({ date: "2099-01-01", hm: null, km: null, rows: [] }, ctx())).toEqual([]);
  });

  it("새 회차가 최근 회차보다 앞이면 경고 (INP-03)", () => {
    const c = ctx({ today: "2026-10-16", latestDate: "2026-09-27" });
    expect(validateRound({ date: "2026-09-20", hm: null, km: null, rows: [] }, c)[0])
      .toMatchObject({ code: "backdated", level: "warn", ref: "2026-09-27" });
    expect(validateRound({ date: "2026-10-01", hm: null, km: null, rows: [] }, c)).toEqual([]);
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
