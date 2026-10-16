import { describe, it, expect } from "vitest";
import { parseBulkSheet, excelDate, toPointsRows, minTread } from "./bulkInspection";

const POS = ["L1", "R1", "L2 Out", "L2 In"];
const UNITS = ["824", "832"];
const TODAY = "2026-10-16";
const row = (o: Record<string, unknown>) => ({ CH: "824", DATE: "2026-10-10", HM: 5000, KM: 700000, POS: "L1", PSI: 100, ...o });

describe("excelDate", () => {
  it("직렬값과 문자열을 같은 ISO 날짜로", () => {
    expect(excelDate(46305)).toBe("2026-10-10");
    expect(excelDate("2026/10/1")).toBe("2026-10-01");
    expect(excelDate("2026-02-30")).toBeNull();
    expect(excelDate("10/10/2026")).toBeNull();
  });
});

describe("parseBulkSheet", () => {
  it("(CH, DATE) 로 회차를 묶고 포지션 순서로 정렬, 머리글·포지션 표기 차이 허용", () => {
    const { rounds, orphanErrors } = parseBulkSheet(
      [
        row({ POS: "l2out", "Tengah 1": 10, KIRI: 11, TENGAH2: 10.5, kanan: 12 }),
        row({ POS: "L1" }),
        row({ CH: "CH 832", POS: "R1" }),
        row({ POS: "R1", PSI: "" }), // 측정값 없는 양식 빈 줄
      ],
      UNITS, POS, TODAY,
    );
    expect(orphanErrors).toEqual([]);
    expect(rounds.map((r) => [r.ch, r.rows.map((x) => x.pos)])).toEqual([["824", ["L1", "L2 Out"]], ["832", ["R1"]]]);
    expect(minTread(rounds[0].rows[1])).toBe(10);
    expect(rounds[0].errors).toEqual([]);
  });

  it("형식 오류: 미등록 차량·날짜·포지션·중복·부분 입력·0mm 상태·메타 불일치·미래 날짜", () => {
    const { rounds, orphanErrors } = parseBulkSheet(
      [
        row({ CH: "999" }),
        row({ DATE: "abc" }),
        row({ POS: "X9" }),
        row({ POS: "L1" }),
        row({ POS: "L1" }),
        row({ POS: "R1", KIRI: 3, TENGAH1: 3 }),
        row({ POS: "L2 Out", KM: 700001, KIRI: 0, TENGAH1: 3, TENGAH2: 3, KANAN: 3 }),
        row({ DATE: "2026-10-20" }),
      ],
      UNITS, POS, TODAY,
    );
    expect(orphanErrors.map((e) => e.code)).toEqual(["unknown_ch", "bad_date"]);
    expect(rounds[0].errors.map((e) => e.code)).toEqual(["bad_pos", "dup_pos", "partial_points", "meta_conflict", "zero_status"]);
    expect(rounds[1].errors.map((e) => e.code)).toEqual(["future_date"]);
  });
});

describe("toPointsRows", () => {
  it("0 mm + not_measured 는 측정점을 버리고, 4점 없는 행은 not_measured", () => {
    const { rounds } = parseBulkSheet(
      [
        row({ POS: "L1", KIRI: 0, TENGAH1: 1, TENGAH2: 1, KANAN: 1, ZERO_STATUS: "not_measured" }),
        row({ POS: "R1", KIRI: 0, TENGAH1: 1, TENGAH2: 1, KANAN: 1, ZERO_STATUS: "WORN_OUT" }),
        row({ POS: "L2 In" }),
      ],
      UNITS, POS, TODAY,
    );
    const out = toPointsRows(rounds[0]);
    expect(out.map((r) => [r.pos, r.tread_status, r.points.length])).toEqual([
      ["L1", "not_measured", 0], ["R1", "worn_out", 4], ["L2 In", "not_measured", 0],
    ]);
  });
});
