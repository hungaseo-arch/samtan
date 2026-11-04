// WO-TMS-2026-11-LIFE-KM T-2 · T-3 — lifeCalc 주행 거리·예상 수명 기준
//
// TMS_DATA 를 직접 채운 픽스처다. 02687D 형태(§0 재현)의 km 는 WO 본문 값, 나머지 회차 km·4점은
// 형태를 맞춘 **가상값**이다 — prod 데이터 대조가 아니다 (결과 보고 §4 참고).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TMS_DATA } from "./tmsData";
import type { KmFlag, KmMethod, LedgerSegment, TreadSegment, TreadWidths, Unit } from "./tmsData";
import { lifeCalc, widthRankValues } from "./tmsUtils";

interface Rnd {
  date: string;
  km: number | null;
  hm?: number | null;
  /** [L, C1, C2, R] — 없으면 4점 미측정 회차 (최소값만) */
  w?: [number, number, number, number];
  min?: number;
}

const snapshot = JSON.stringify(TMS_DATA);
afterEach(() => { Object.assign(TMS_DATA, JSON.parse(snapshot)); });
beforeEach(() => {
  TMS_DATA.units = [];
  TMS_DATA.segments = {};
  TMS_DATA.ledger = {};
  TMS_DATA.life = [];
  TMS_DATA.tire.lifeEndBasis = null;
});

/** 차량 1대 · 포지션 1곳 · 시리얼 1본 구간을 TMS_DATA 에 붙인다. */
function addSegment(ch: string, pos: string, serial: string, rounds: Rnd[], opts: { current: boolean; segNo?: number }) {
  let u = TMS_DATA.units.find((x) => x.ch === ch);
  if (!u) {
    u = { ch, dates: [], hm: [], km: [], positions: [], hmReset: false, meterOffset: null } as Unit;
    TMS_DATA.units.push(u);
    TMS_DATA.segments[ch] = {};
  }
  const idx: number[] = [];
  for (const r of rounds) {
    let i = u.dates.indexOf(r.date);
    if (i < 0) {
      u.dates.push(r.date); u.km.push(r.km); u.hm.push(r.hm ?? null);
      i = u.dates.length - 1;
    }
    idx.push(i);
  }
  const n = u.dates.length;
  const seg: TreadSegment = {
    ch, pos, segNo: opts.segNo ?? 0, serial,
    idxFrom: Math.min(...idx), idxTo: Math.max(...idx),
    tread: new Array(n).fill(undefined), treadAvg: new Array(n).fill(undefined),
    widths: new Array<TreadWidths | null | undefined>(n).fill(undefined),
    outlier: new Array<boolean>(n).fill(false), press: new Array(n).fill(undefined),
    replacedAt: null, isCurrent: opts.current,
  };
  rounds.forEach((r, k) => {
    const i = idx[k];
    if (r.w) {
      const [l, c1, c2, rr] = r.w;
      seg.widths[i] = { l, c1, c2, r: rr };
      seg.tread[i] = Math.min(...r.w);
      seg.treadAvg[i] = Math.round(((l + c1 + c2 + rr) / 4) * 100) / 100;
    } else {
      seg.tread[i] = r.min ?? null;
      seg.treadAvg[i] = r.min ?? null;
      seg.widths[i] = null;
    }
  });
  (TMS_DATA.segments[ch][pos] ??= []).push(seg);
  if (opts.current) {
    u.positions.push({ pos, serial, serialInitial: serial, replCount: 0, mountedAt: null, chain: [], press: [] });
  }
}

function ledger(serial: string, g: Partial<LedgerSegment> & { ch: string; pos: string; kmFlag: KmFlag }) {
  const seg: LedgerSegment = {
    seqNo: 0, mountedAt: null, removedAt: null, isCurrent: false,
    segmentKm: null, kmStart: null, kmEnd: null, hmStart: null, hmEnd: null,
    kmMethod: null as KmMethod | null, mountedAtEffective: null, startInferred: false,
    ...g,
  };
  (TMS_DATA.ledger[serial] ??= []).push(seg);
}

// DA1BFBPH02687D (CH 834 L2 Out) — 첫 회차 22.0 신품, 07-26 부터 최소 0 (센터 0 · 숄더 잔존), 09-05 탈착.
// 04-02 · 07-05 · 07-26 km 와 탈착 km 는 WO §0 값. 사이 회차 km·4점은 형태 픽스처.
const R02687: Rnd[] = [
  { date: "2026-04-02", km: 708667.8, hm: 10000, w: [22, 22, 22, 22] },
  { date: "2026-05-10", km: 720000.0, hm: 10400, w: [17.5, 14.0, 14.2, 17.0] },
  { date: "2026-06-07", km: 729500.0, hm: 10700, w: [13.0, 7.9, 8.1, 12.6] },
  { date: "2026-07-05", km: 738366.2, hm: 11000, w: [9.6, 3.82, 4.0, 9.2] },
  { date: "2026-07-26", km: 747052.7, hm: 11250, w: [5.9, 0, 0, 4.74] },  // 평균 2.66
  { date: "2026-08-23", km: 757000.0, hm: 11560, w: [4.2, 0, 0, 3.52] },  // 평균 1.93
];
const END_02687 = 764018.9;

describe("lifeCalc · 최초 장착분 FIRST_NEW_INSPECTION (T-1·T-2)", () => {
  it("① seq 0 · 첫 회차 22.0 · 중간 최소 0 · 탈착 km_end → km = km_end − 첫 회차 km, 하한값 아님", () => {
    addSegment("834", "L2 Out", "02687D", R02687, { current: false });
    ledger("02687D", {
      ch: "834", pos: "L2 Out", kmFlag: "OK", kmMethod: "FIRST_NEW_INSPECTION",
      kmStart: 708667.8, kmEnd: END_02687, segmentKm: Math.round((END_02687 - 708667.8) * 10) / 10,
      removedAt: "2026-09-05", mountedAtEffective: "2026-04-02", startInferred: true, hmStart: 10000, hmEnd: 11800,
    });
    const c = lifeCalc("02687D")!;
    expect(c.km).toBeCloseTo(55351.1, 0);
    expect(c.kmIsLowerBound).toBe(false);
    expect(c.hr).toBe(1800);
  });

  it("② seq 0 · 첫 회차 18 mm(중고) → 원장 NO_KM 유지 · 하한값 true", () => {
    addSegment("834", "R1", "USED18", [
      { date: "2026-04-02", km: 708667.8, w: [18, 18, 18, 18] },
      { date: "2026-05-10", km: 720000.0, w: [15, 13, 13, 15] },
      { date: "2026-06-07", km: 729500.0, w: [12, 9, 9, 12] },
    ], { current: true });
    ledger("USED18", { ch: "834", pos: "R1", kmFlag: "NO_KM", isCurrent: true, kmEnd: 729500.0 });
    const c = lifeCalc("USED18")!;
    expect(c.kmIsLowerBound).toBe(true);
    expect(c.km).toBeCloseTo(729500.0 - 708667.8, 1);
    // 신품 기준 회차가 없으니 예상값은 비운다
    expect(c.expectedKm).toBeNull();
  });

  it("③ 최소 0 회차가 거리에서 빠지지 않는다 — 원장 OK 구간이 없어도 탈착 km_end 까지 (02687D 형태)", () => {
    // 20261104100000 적용 전 원장: seq 0 NO_KM, km_end 만 있다
    addSegment("834", "L2 Out", "02687D", R02687, { current: false });
    ledger("02687D", { ch: "834", pos: "L2 Out", kmFlag: "NO_KM", kmEnd: END_02687, removedAt: "2026-09-05" });
    const c = lifeCalc("02687D")!;
    // 종전 값 29,698 (= 738,366.2 − 708,667.8, 최소 > 0 마지막 회차) 이 아니라 탈착까지
    expect(Math.round(c.km!)).not.toBe(29698);
    expect(c.km).toBeCloseTo(55351.1, 0);
    expect(c.kmIsLowerBound).toBe(true);
  });

  it("④ 여러 차량을 돈 시리얼 → seq 0 구간 + 이후 구간 합산", () => {
    addSegment("839", "L3 Out", "MOVER", [
      { date: "2026-04-06", km: 423771.8, w: [22, 22, 22, 22] },
      { date: "2026-04-20", km: 426000.0, w: [21, 20, 20, 21] },
    ], { current: false });
    addSegment("832", "R2 In", "MOVER", [
      { date: "2026-05-10", km: 450000.0, w: [19, 18, 18, 19] },
      { date: "2026-06-07", km: 470000.0, w: [12, 9, 9, 12] },
    ], { current: true, segNo: 1 });
    ledger("MOVER", {
      ch: "839", pos: "L3 Out", kmFlag: "OK", kmMethod: "FIRST_NEW_INSPECTION",
      kmStart: 423771.8, kmEnd: 428647.0, segmentKm: 4875.2, removedAt: "2026-04-25", startInferred: true,
    });
    ledger("MOVER", {
      ch: "832", pos: "R2 In", seqNo: 1, mountedAt: "2026-05-01", kmFlag: "OK", kmMethod: "INTERPOLATED",
      kmStart: 447000.0, kmEnd: 470000.0, segmentKm: 23000.0, isCurrent: true,
    });
    const c = lifeCalc("MOVER")!;
    expect(c.km).toBeCloseTo(4875.2 + 23000.0, 1);
    expect(c.kmIsLowerBound).toBe(false);
  });
});

describe("lifeCalc · 수명 종료 기준 (T-3)", () => {
  const setup = () => {
    addSegment("834", "L2 Out", "02687D", R02687, { current: false });
    ledger("02687D", {
      ch: "834", pos: "L2 Out", kmFlag: "OK", kmMethod: "FIRST_NEW_INSPECTION",
      kmStart: 708667.8, kmEnd: END_02687, segmentKm: 55351.1, removedAt: "2026-09-05", startInferred: true,
      hmStart: 10000, hmEnd: 11800,
    });
  };

  it("⑤ 센터 마모 패턴: four_zero ≥ three_zero ≥ min, 모두 주행 KM 이상", () => {
    setup();
    const c = lifeCalc("02687D")!;
    const { min, three_zero, four_zero } = c.expectedByBasis;
    expect(min.km).not.toBeNull();
    expect(three_zero.km).not.toBeNull();
    expect(four_zero.km).not.toBeNull();
    expect(four_zero.km!).toBeGreaterThanOrEqual(three_zero.km!);
    expect(three_zero.km!).toBeGreaterThanOrEqual(min.km!);
    expect(min.km!).toBeGreaterThanOrEqual(Math.round(c.km!));
    // 숄더가 남은 채 폐기 → 4점 0 mm 외삽은 실주행보다 길다
    expect(four_zero.km!).toBeGreaterThan(Math.round(c.km!));
    expect(c.fourPointShort).toBe(false);
  });

  it("기본값 'min' — 기준 미설정·이상값이면 expectedKm = min 기준", () => {
    setup();
    const c = lifeCalc("02687D")!;
    expect(c.basis).toBe("min");
    expect(c.expectedKm).toBe(c.expectedByBasis.min.km);
    TMS_DATA.tire.lifeEndBasis = "shoulder" as never;
    expect(lifeCalc("02687D")!.basis).toBe("min");
  });

  it("life_end_basis = four_zero 면 expectedKm·expectedHm 이 그 기준을 따른다", () => {
    setup();
    TMS_DATA.tire.lifeEndBasis = "four_zero";
    const c = lifeCalc("02687D")!;
    expect(c.basis).toBe("four_zero");
    expect(c.expectedKm).toBe(c.expectedByBasis.four_zero.km);
    expect(c.expectedHm).toBe(c.expectedByBasis.four_zero.hm);
  });

  it("4점 회차가 2개 미만이면 4점 기준 예상값은 비우고 fourPointShort", () => {
    addSegment("835", "L1", "OLDROUNDS", [
      { date: "2026-04-21", km: 100000, min: 22 },
      { date: "2026-05-10", km: 106000, min: 18 },
      { date: "2026-06-07", km: 112000, w: [16, 14, 14, 16] },
    ], { current: true });
    ledger("OLDROUNDS", { ch: "835", pos: "L1", kmFlag: "OK", kmMethod: "FIRST_NEW_INSPECTION",
      kmStart: 100000, kmEnd: 112000, segmentKm: 12000, isCurrent: true, startInferred: true });
    TMS_DATA.tire.lifeEndBasis = "three_zero";
    const c = lifeCalc("OLDROUNDS")!;
    expect(c.fourPointShort).toBe(true);
    expect(c.expectedByBasis.three_zero.km).toBeNull();
    expect(c.expectedByBasis.four_zero.km).toBeNull();
    expect(c.expectedKm).toBeNull();
    expect(c.expectedByBasis.min.km).not.toBeNull();
  });

  it("widthRankValues — 최대·두 번째 값, OUTLIER 0 하나는 빼고 순위", () => {
    expect(widthRankValues({ l: 5.9, c1: 0, c2: 0, r: 4.74 }, false)).toEqual({ fourZero: 5.9, threeZero: 4.74 });
    expect(widthRankValues({ l: 0, c1: 9.43, c2: 10.1, r: 5.6 }, true)).toEqual({ fourZero: 10.1, threeZero: 9.43 });
    expect(widthRankValues({ l: 3, c1: null, c2: 2, r: 4 }, false)).toBeNull();
    expect(widthRankValues(null, false)).toBeNull();
  });
});

// WO §4 수용 표 — **표에 적힌 입력값(첫 km · 탈착 km_end · 이후 구간 합)** 으로 lifeCalc 합산을 재현한다.
// 이후 구간 km 는 표의 «수정 후» − (km_end − 첫 km) 로 역산한 값이라, 이 테스트는 합산 규칙의
// 산술 검증이지 prod 원장 대조가 아니다 (prod 읽기는 RLS 로 막힘 — 결과 보고 §4).
const ACCEPT: [string, number, number, number][] = [
  ["DA1BFBPH02687D", 708667.8, 764018.9, 55351.1],
  ["DA12511H02845D", 708667.8, 754285.2, 45617.4],
  ["DA12511H03155D", 708667.8, 759713.7, 51045.9],
  ["DA1BFANH07452D", 708667.8, 754285.2, 45617.4],
  ["DA1BFANH10237D", 708667.8, 764018.9, 55351.1],
  ["DA12511H03162D", 423771.8, 428647.0, 41905.0],
  ["DA1BFANH05091D", 423771.8, 492453.4, 68681.6],
  ["DA12510H11571D", 423771.8, 451255.6, 64356.0],
  ["DA1BFANH04847D", 434888.4, 492049.9, 57161.5],
  ["DA1BFBPH02472D", 434888.4, 492049.9, 57161.5],
  ["DA12511H02833D", 423771.8, 492453.4, 68681.6],
  ["DA12511H03169D", 423771.8, 482090.3, 58318.5],
  ["DA1BFANH07563D", 434888.4, 487912.4, 53024.0],
  ["DA1BFANH07686D", 423771.8, 454594.6, 65860.1],
  ["DA1BFANH05096D", 434888.4, 494256.4, 59368.0],
  ["DA12511H03052D", 708667.8, 734777.7, 60133.7],
  ["DA1BFANH05052D", 423771.8, 487187.4, 63415.6],
];

describe("WO §4 수용 표 17본 — 입력값 기반 합산 재현 (±1 km)", () => {
  it.each(ACCEPT)("%s", (serial, firstKm, kmEnd, expected) => {
    const seq0 = Math.round((kmEnd - firstKm) * 10) / 10;
    const later = Math.round((expected - seq0) * 10) / 10;
    addSegment("A", "L1", serial, [
      { date: "2026-04-02", km: firstKm, w: [22, 22, 22, 22] },
      { date: "2026-05-10", km: firstKm + seq0 * 0.6, w: [12, 6, 6, 12] },
      { date: "2026-06-07", km: firstKm + seq0 * 0.9, w: [6, 0, 0, 5] },
    ], { current: false });
    ledger(serial, { ch: "A", pos: "L1", kmFlag: "OK", kmMethod: "FIRST_NEW_INSPECTION",
      kmStart: firstKm, kmEnd, segmentKm: seq0, removedAt: "2026-06-20", startInferred: true });
    if (later > 1) {
      addSegment("B", "R1", serial, [
        { date: "2026-07-01", km: 10000, w: [6, 5, 5, 6] },
        { date: "2026-07-20", km: 10000 + later * 0.8, w: [4, 2, 2, 4] },
      ], { current: false, segNo: 1 });
      ledger(serial, { ch: "B", pos: "R1", seqNo: 1, mountedAt: "2026-06-25", kmFlag: "OK",
        kmMethod: "INTERPOLATED", kmStart: 9800, kmEnd: 9800 + later, segmentKm: later, removedAt: "2026-07-25" });
    }
    const c = lifeCalc(serial)!;
    expect(Math.abs((c.km as number) - expected)).toBeLessThanOrEqual(1);
    expect(c.kmIsLowerBound).toBe(false);
  });

  it("17본 평균 57,121 km", () => {
    const mean = ACCEPT.reduce((s, r) => s + r[3], 0) / ACCEPT.length;
    expect(Math.round(mean)).toBe(57121);
  });
});
