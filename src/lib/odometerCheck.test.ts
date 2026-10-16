import { describe, expect, it } from "vitest";
import {
  ODO_WARN_TAG,
  anomalyOverlaps,
  checkOdometer,
  previousReading,
  scanOdometer,
  tagRemark,
  type OdoLimits,
} from "./odometerCheck";

// tire_config 초기값 (20261016140000_v_odometer_anomaly.sql)
const LIM: OdoLimits = { dailyKmMax: 800, speedKmhMax: 60, dailyHmMax: 24 };

describe("checkOdometer", () => {
  it("정상 증분은 플래그가 없다", () => {
    const r = checkOdometer(
      { date: "2026-07-26", km: 135_397.1, hm: 5_000 },
      { date: "2026-08-09", km: 140_000, hm: 5_200 },
      LIM,
    );
    expect(r.flags).toEqual([]);
    expect(r.days).toBe(14);
    expect(r.kmPerDay).toBeCloseTo(328.8, 1);
  });

  it("CH 847 2026-07-12 → 07-26 은 KM_DAILY + SPEED", () => {
    const r = checkOdometer(
      { date: "2026-07-12", km: 89_100.0, hm: 4_737 },
      { date: "2026-07-26", km: 135_397.1, hm: 5_000 },
      LIM,
    );
    expect(r.flags).toEqual(["KM_DAILY", "SPEED"]);
    expect(r.kmPerDay).toBeCloseTo(3_306.9, 1);
    expect(r.kmPerHm).toBeCloseTo(176.0, 1);
  });

  it("KM 감소는 KM_DECREASE — 속도 판정은 하지 않는다", () => {
    const r = checkOdometer(
      { date: "2026-08-01", km: 50_000, hm: 3_000 },
      { date: "2026-08-15", km: 120, hm: 3_150 },
      LIM,
    );
    expect(r.flags).toEqual(["KM_DECREASE"]);
  });

  it("하루 24시간을 넘는 HM 증분은 HM_DAILY", () => {
    const r = checkOdometer(
      { date: "2026-06-01", km: 10_000, hm: 2_000 },
      { date: "2026-06-15", km: 14_000, hm: 2_000 + 14 * 30 },
      LIM,
    );
    expect(r.flags).toEqual(["HM_DAILY"]);
  });

  it("값이 없거나 같은 날이면 해당 판정을 건너뛴다", () => {
    expect(checkOdometer({ date: "2026-06-01", km: null, hm: 10 }, { date: "2026-06-02", km: 5_000, hm: 20 }, LIM).flags).toEqual([]);
    const same = checkOdometer({ date: "2026-06-01", km: 1_000, hm: 10 }, { date: "2026-06-01", km: 9_000, hm: 100 }, LIM);
    expect(same.kmPerDay).toBeNull();
    expect(same.flags).toEqual(["SPEED"]);
  });

  it("임계값은 인자로 받는다 — 하드코딩이 아니다", () => {
    const prev = { date: "2026-07-12", km: 89_100.0, hm: 4_737 };
    const curr = { date: "2026-07-26", km: 135_397.1, hm: 5_000 };
    expect(checkOdometer(prev, curr, { dailyKmMax: 5_000, speedKmhMax: 200, dailyHmMax: 24 }).flags).toEqual([]);
  });
});

describe("scanOdometer", () => {
  it("정렬해서 이상 구간만 돌려준다", () => {
    const out = scanOdometer(
      "CH 847",
      [
        { date: "2026-07-26", km: 135_397.1, hm: 5_000 },
        { date: "2026-07-12", km: 89_100.0, hm: 4_737 },
        { date: "2026-08-09", km: 140_000, hm: 5_200 },
      ],
      LIM,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ch: "CH 847", datePrev: "2026-07-12", dateCurr: "2026-07-26" });
  });
});

describe("previousReading", () => {
  const rounds = [
    { date: "2026-07-12", km: 89_100, hm: 4_737 },
    { date: "2026-07-20", km: null, hm: null },
    { date: "2026-07-26", km: 135_397.1, hm: 5_000 },
  ];
  it("같은 날·값 없는 회차는 건너뛴다", () => {
    expect(previousReading(rounds, "2026-07-26")?.date).toBe("2026-07-12");
    expect(previousReading(rounds, "2026-08-01")?.date).toBe("2026-07-26");
    expect(previousReading(rounds, "2026-07-01")).toBeNull();
  });
});

describe("anomalyOverlaps", () => {
  const a = { datePrev: "2026-07-12", dateCurr: "2026-07-26" };
  it("기간과 겹칠 때만 true", () => {
    expect(anomalyOverlaps(a, "2026-07-10", null)).toBe(true);
    expect(anomalyOverlaps(a, "2026-07-26", null)).toBe(false);
    expect(anomalyOverlaps(a, null, "2026-07-12")).toBe(false);
    expect(anomalyOverlaps(a, null, null)).toBe(true);
  });
});

describe("tagRemark", () => {
  it("[ODO-WARN] 접두어를 한 번만 붙인다", () => {
    const t = tagRemark("타이어 이상 없음", ["KM_DECREASE"], "계기 교체");
    expect(t).toBe(`${ODO_WARN_TAG} KM_DECREASE — 계기 교체 | 타이어 이상 없음`);
    expect(tagRemark(t, ["KM_DAILY"])).toBe(t);
    expect(tagRemark("", ["KM_DAILY", "SPEED"])).toBe(`${ODO_WARN_TAG} KM_DAILY,SPEED`);
  });
});
