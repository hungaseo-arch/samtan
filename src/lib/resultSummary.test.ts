import { describe, expect, it } from "vitest";
import { judgeSummary, type SummaryInput } from "./resultSummary";

const base: SummaryInput = {
  r2: 0.95,
  orderDaysLeft: 120,
  orderWindowDays: 30,
  cv: 4,
  fleetCvMedian: 4,
  pattern: "even",
  anomalies: [],
  // 최초 장착분 NO_KM 은 구조적 하한값 — 배지를 올리지 않는다
  ledger: [{ kmFlag: "NO_KM", seqNo: 0, mountedAt: null }],
};

describe("judgeSummary", () => {
  it("문제가 없으면 정상 (834 L1 형태: 최초 장착 NO_KM 만 있음)", () => {
    expect(judgeSummary(base)).toEqual({ level: "ok", reasons: [] });
  });

  it("측정 기간과 겹치는 주행계 이상은 데이터 확인 필요 (847 L1)", () => {
    const r = judgeSummary({
      ...base,
      anomalies: [{ flags: ["KM_DAILY", "SPEED"], datePrev: "2026-07-12", dateCurr: "2026-07-26" }],
      orderDaysLeft: 5, // 주의 사유가 있어도 확인 필요가 우선
    });
    expect(r.level).toBe("check");
    expect(r.reasons.map((x) => x.kind)).toEqual(["odo"]);
  });

  it("R² < 0.80 은 데이터 확인 필요", () => {
    expect(judgeSummary({ ...base, r2: 0.79 }).level).toBe("check");
    expect(judgeSummary({ ...base, r2: 0.8 }).level).toBe("ok");
  });

  it("장착일이 있는 구간의 NO_KM · KM_DECREASE 는 데이터 확인 필요", () => {
    expect(judgeSummary({ ...base, ledger: [{ kmFlag: "NO_KM", seqNo: 1, mountedAt: "2026-09-01" }] }).level).toBe("check");
    expect(judgeSummary({ ...base, ledger: [{ kmFlag: "KM_DECREASE", seqNo: 0, mountedAt: null }] }).level).toBe("check");
    expect(judgeSummary({ ...base, ledger: [{ kmFlag: "APPROX", seqNo: 1, mountedAt: "2026-09-01" }] }).level).toBe("ok");
  });

  it("발주 30일 이내 · CV 1.5배 초과 · 편마모는 주의", () => {
    expect(judgeSummary({ ...base, orderDaysLeft: 30 }).reasons).toEqual([{ kind: "order", days: 30 }]);
    expect(judgeSummary({ ...base, orderDaysLeft: 31 }).level).toBe("ok");
    expect(judgeSummary({ ...base, cv: 6.1 }).level).toBe("caution");
    expect(judgeSummary({ ...base, cv: 6.0 }).level).toBe("ok");
    expect(judgeSummary({ ...base, pattern: "shoulder" }).level).toBe("caution");
    expect(judgeSummary({ ...base, pattern: "insufficient" }).level).toBe("ok");
  });
});
