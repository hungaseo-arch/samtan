import { describe, it, expect } from "vitest";
import { inspectionAge } from "./inspectionAge";

describe("inspectionAge", () => {
  const today = "2026-10-16";

  it("마지막 점검일 = 가장 늦은 날짜 (순서·빈값 무관)", () => {
    const a = inspectionAge(["2026-10-01", "", null, "2026-09-20"], today, 14);
    expect(a.lastDate).toBe("2026-10-01");
    expect(a.days).toBe(15);
  });

  it("주기 이내 → none, 주기 초과 → due, 1.5배 초과 → overdue", () => {
    expect(inspectionAge(["2026-10-02"], today, 14).level).toBe("none"); // 14일 = 주기 (초과 아님)
    expect(inspectionAge(["2026-10-01"], today, 14).level).toBe("due"); // 15일
    expect(inspectionAge(["2026-09-25"], today, 14).level).toBe("due"); // 21일 = 1.5배 (초과 아님)
    expect(inspectionAge(["2026-09-24"], today, 14).level).toBe("overdue"); // 22일
  });

  it("점검 기록이 없으면 판정하지 않는다", () => {
    expect(inspectionAge([], today, 14)).toEqual({ lastDate: null, days: null, level: "none" });
  });
});
