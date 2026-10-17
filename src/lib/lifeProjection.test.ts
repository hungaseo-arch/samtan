import { describe, it, expect } from "vitest";
import {
  wearRatePer1000Km, wearRatePerDay, remainingKmTo, dailyKm, addDays, projectReplacement,
} from "./lifeProjection";

// 지시서 2026-10-16 §4 실측 샘플: 22→18→14 mm, 0→10,000→20,000 km
const SAMPLE = [
  { km: 0, date: "2026-01-01", tread: 22 },
  { km: 10_000, date: "2026-01-31", tread: 18 },
  { km: 20_000, date: "2026-03-02", tread: 14 },
];

describe("lifeProjection", () => {
  it("마모율 0.4 mm/1,000 km", () => {
    expect(wearRatePer1000Km(SAMPLE)).toBeCloseTo(0.4, 10);
  });

  it("5 mm 도달 잔여 22,500 km", () => {
    expect(remainingKmTo(14, 0.4, 5)).toBeCloseTo(22_500, 6);
  });

  it("이미 기준 이하면 잔여 0", () => {
    expect(remainingKmTo(4.2, 0.4, 5)).toBe(0);
  });

  it("마모 추세가 없으면 null", () => {
    expect(wearRatePer1000Km([{ km: 0, tread: 10 }, { km: 1000, tread: 10 }])).toBeNull();
    expect(wearRatePer1000Km([{ km: 0, tread: 10 }])).toBeNull();
  });

  it("일 마모율 — 30일에 4 mm", () => {
    expect(wearRatePerDay(SAMPLE)).toBeCloseTo(4 / 30, 10);
  });

  it("최근 30일 일평균 주행", () => {
    expect(dailyKm(SAMPLE.map(({ date, km }) => ({ date, km })))).toBeCloseTo(10_000 / 30, 6);
  });

  it("km 이 줄면(계기 리셋) 일평균 null", () => {
    expect(dailyKm([{ date: "2026-01-01", km: 500 }, { date: "2026-01-10", km: 100 }])).toBeNull();
  });

  it("날짜 더하기는 올림", () => {
    expect(addDays("2026-03-02", 0.2)).toBe("2026-03-03");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("예상 교체일 — 22,500 km ÷ 333.3 km/일 = 67.5일 → 68일 뒤", () => {
    const p = projectReplacement(SAMPLE, 14, 10_000 / 30, 5);
    expect(p.wearRateKm).toBeCloseTo(0.4, 10);
    expect(p.remainingKm).toBeCloseTo(22_500, 6);
    expect(p.remainingDays).toBeCloseTo(67.5, 6);
    expect(p.projectedDate).toBe("2026-05-09");
    expect(p.reason).toBeNull();
  });

  it("KM 이 없으면 mm/일 경로", () => {
    const p = projectReplacement(SAMPLE, 14, null, 5);
    expect(p.remainingDays).toBeCloseTo(9 / (4 / 30), 6);
  });

  it("회차 3개 미만은 few_rounds", () => {
    const p = projectReplacement(SAMPLE.slice(0, 2), 18, 300, 5);
    expect(p.projectedDate).toBeNull();
    expect(p.reason).toBe("few_rounds");
  });
});

describe("projectReplacement — 이미 기준선 이하 (R-3 · LIFE-02)", () => {
  it("0 mm 면 잔여 0 km · 측정일이 예상 교체일 (회차 부족이어도)", () => {
    const p = projectReplacement(SAMPLE.slice(0, 2), 0, 300, 5, "2026-09-27");
    expect(p).toMatchObject({ remainingKm: 0, remainingDays: 0, projectedDate: "2026-09-27", reason: null });
  });
  it("정확히 기준선이면 즉시 교체", () => {
    const p = projectReplacement(SAMPLE, 5, 300, 5);
    expect(p.remainingKm).toBe(0);
    expect(p.projectedDate).toBe(SAMPLE[SAMPLE.length - 1].date);
  });
});
