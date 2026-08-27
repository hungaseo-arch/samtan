// @section: tms-utils
import { TMS_DATA, HEAD_MAP, NEW_TREAD, recPsi, treadLevel } from "./tmsData";
import type { Unit, TirePosition, TreadLevel, SerialChainEntry, TreadSegment } from "./tmsData";
import { fmtNumber } from "@/lib/format";

/** 4단계 신호등 + 미측정. 심각도 순: ok < warn < order < danger */
export type TireStatus = TreadLevel | "none";

const SEVERITY: Record<TireStatus, number> = { none: -1, ok: 0, warn: 1, order: 2, danger: 3 };

/** 여러 판정 중 더 심각한 쪽을 남긴다. */
function worst(a: TireStatus, b: TireStatus): TireStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

export interface HeadPosData {
  rp: string;
  /** 현재 장착 시리얼 */
  serial: string;
  /** 최초 장착 시리얼 */
  serialInitial: string;
  /** 교체 횟수 (0 = 최초 타이어 그대로) */
  replCount: number;
  /** 현재 타이어 장착일 (최초 타이어면 null) */
  mountedAt: string | null;
  /** 시리얼 이력 전체 — 개수 제한 없음 */
  chain: SerialChainEntry[];
  remark?: string | null;
  press: (number | "N/A" | null)[];
  treadMin: (number | null)[];
  /** 시리얼 단위로 잘린 측정 구간 — 추이 표·스파크라인·마모율은 이것만 쓴다. */
  segments: TreadSegment[];
  dates: (string | null)[];
  latestPress: number | null;
  latestPressDate: string | null;
  latestTread: number | null;
  latestTreadDate: string | null;
}

export function lastIdx(arr: (number | string | null | undefined)[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && arr[i] !== "") return i;
  }
  return -1;
}

export function validDates(u: Unit): { d: string; i: number }[] {
  return u.dates
    .map((d, i) => ({ d: d ?? "", i }))
    .filter((x) => x.d);
}

export function headPosData(u: Unit, pos: number): HeadPosData | null {
  const rp = HEAD_MAP[pos];
  if (!rp) return null;
  const pd: TirePosition | undefined = u.positions.find((p) => p.pos === rp);
  const tr = (TMS_DATA.tread[u.ch] || {})[rp];
  if (!pd && !tr) return null;

  const press = (pd ? pd.press : []).map((v) =>
    typeof v === "number" ? v : v === "N/A" ? "N/A" : null
  ) as (number | "N/A" | null)[];
  const treadMin: (number | null)[] = tr ? (tr.min as (number | null)[]) : [];

  const piLast = lastIdx(press);
  const tiLast = treadMin.length ? lastIdx(treadMin) : -1;

  return {
    rp,
    segments: posSegments(u.ch, rp),
    serial: pd?.serial ?? "",
    serialInitial: pd?.serialInitial ?? "",
    replCount: pd?.replCount ?? 0,
    mountedAt: pd?.mountedAt ?? null,
    chain: pd?.chain ?? [],
    remark: pd?.remark,
    press,
    treadMin,
    dates: u.dates,
    latestPress:
      piLast >= 0 && typeof press[piLast] === "number"
        ? (press[piLast] as number)
        : null,
    latestPressDate: piLast >= 0 ? (u.dates[piLast] ?? null) : null,
    latestTread: tiLast >= 0 ? (treadMin[tiLast] ?? null) : null,
    latestTreadDate:
      tiLast >= 0
        ? (tr?.dates?.[tiLast] ?? u.dates[tiLast] ?? null)
        : null,
  };
}

export function statusOf(d: HeadPosData | null, pos: number): TireStatus {
  if (!d) return "none";
  let st: TireStatus = "ok";

  if (d.latestTread != null) st = worst(st, treadLevel(d.latestTread));

  if (typeof d.latestPress === "number") {
    const r = recPsi(pos);
    if (d.latestPress < r * 0.85) st = worst(st, "danger");
    else if (Math.abs(d.latestPress - r) / r > 0.15) st = worst(st, "warn");
  }

  if (
    d.serial &&
    TMS_DATA.life.find((l) => l.serial === d.serial && l.status === "Scrap")
  )
    st = "danger";

  return st;
}

/**
 * 측정값(트레드·공기압)만으로 타이어 상태를 판정.
 * - statusOf()와 동일 임계값을 쓰되, HeadPosData 대신 개별 값을 받음.
 * - 폐기(Scrap) 이력은 회차 측정값에 없으므로 반영하지 않음(의도됨).
 * @param tread 최근 트레드(mm) | null
 * @param press 최근 공기압(psi) | null
 * @param pos   포지션 번호(1~10). recPsi 계산용.
 */
export function statusFromValues(
  tread: number | null,
  press: number | null,
  pos: number
): TireStatus {
  if (tread == null && press == null) return "none";
  let st: TireStatus = "ok";

  if (tread != null) st = worst(st, treadLevel(tread));

  if (typeof press === "number") {
    const r = recPsi(pos);
    if (press < r * 0.85) st = worst(st, "danger");
    else if (Math.abs(press - r) / r > 0.15) st = worst(st, "warn");
  }

  return st;
}

export function codeName(c: string | null | undefined): string {
  if (!c) return "";
  const name = TMS_DATA.codes[c];
  return name ? `${c} (${name})` : c;
}

export function fmtN(n: number | string | null | undefined): string {
  if (n == null || n === "") return "−";
  if (typeof n === "number") return fmtNumber(n);
  return String(n);
}

export function fmtD(d: string | null | undefined): string {
  if (!d || d === "-") return "−";
  return d;
}

/** KM·HM 표기: 정수 반올림 + 천단위 콤마 (#,000). */
export function fmtInt(n: number | string | null | undefined): string {
  if (n == null || n === "") return "−";
  if (typeof n === "number") return fmtNumber(Math.round(n));
  return String(n);
}

/** 트레드 표기: 소수점 1자리. */
export function fmtTread(n: number | null | undefined): string {
  if (n == null) return "−";
  return n.toFixed(1);
}

export function unitByCh(ch: string) {
  return TMS_DATA.units.find((u) => u.ch === ch)!;
}

/** 타이어당 하중(kg) = 총중량 × 분배율 ÷ 본수 */
export function loadPerTire(total: number, ratio: number, count: number): number {
  return count > 0 ? (total * ratio) / count : 0;
}

/** 장착방식별 정격(kg/본) — 듀얼이면 듀얼 정격 사용 */
export function ratedByMount(mount: "single" | "dual", single: number, dual: number): number {
  return mount === "dual" ? dual : single;
}

/** 부하율 = 타이어당 하중 ÷ 정격(장착방식 적용 값) (1.0 = 정격 100%) */
export function loadRatio(perTire: number, rated: number): number {
  return rated > 0 ? perTire / rated : 0;
}

// ── 시리얼 단위 측정 구간 · 마모율 (작업지시서 v2 §A) ─────────────

/** 한 포지션의 측정 구간 목록(시간순). 데이터가 없으면 빈 배열. */
export function posSegments(ch: string, pos: string): TreadSegment[] {
  return (TMS_DATA.segments[ch] ?? {})[pos] ?? [];
}

export interface SerialSegment {
  unit: Unit;
  seg: TreadSegment;
  /** 구간 첫 측정일 */
  from: string;
  /** 구간 마지막 측정일 */
  to: string;
}

/**
 * 시리얼이 실제로 측정된 구간 전체.
 * v_position_history 대신 inspections.serial 을 근거로 삼으므로, 한 시리얼이
 * 차량을 옮겨 다닌 경우(예: 834 → 849 → 832)도 구간이 각각 잡힌다.
 */
export function segmentsOfSerial(serial: string): SerialSegment[] {
  if (!serial) return [];
  const out: SerialSegment[] = [];
  for (const u of TMS_DATA.units) {
    for (const segs of Object.values(TMS_DATA.segments[u.ch] ?? {})) {
      for (const seg of segs) {
        if (seg.serial !== serial) continue;
        out.push({
          unit: u,
          seg,
          from: (u.dates[seg.idxFrom] ?? "") as string,
          to: (u.dates[seg.idxTo] ?? "") as string,
        });
      }
    }
  }
  out.sort((a, b) => a.from.localeCompare(b.from));
  return out;
}

/** 대표 구간 — 현재 장착 중인 구간이 있으면 그것, 없으면 가장 최근 구간. */
export function primarySerialSegment(serial: string): SerialSegment | null {
  const all = segmentsOfSerial(serial);
  if (!all.length) return null;
  return all.find((x) => x.seg.isCurrent) ?? all[all.length - 1];
}

export interface SegPoint {
  /** 회차 인덱스 (unit.dates 기준) */
  i: number;
  date: string;
  tread: number | null;
  km: number | null;
  hm: number | null;
}

/** 구간에 속한 회차의 (일자·트레드·km·hm) 점열. 구간 밖 회차는 들어오지 않는다. */
export function segmentPoints(u: Unit, seg: TreadSegment): SegPoint[] {
  const out: SegPoint[] = [];
  for (let i = seg.idxFrom; i <= seg.idxTo; i++) {
    const t = seg.tread[i];
    if (t === undefined) continue;          // 이 구간의 회차가 아니다
    const kv = u.km[i];
    const hv = u.hm[i];
    out.push({
      i,
      date: (u.dates[i] ?? "") as string,
      tread: t,
      km: typeof kv === "number" ? kv : null,
      hm: typeof hv === "number" ? hv : null,
    });
  }
  return out;
}

/**
 * 포지션 상세 화면용 — **현재 장착된 타이어 구간만**의 (일자, 값) 점열.
 * 교체 전 타이어를 같은 선에 이으면 트레드가 올라가 보인다. (작업지시서 v2 §A-3)
 */
export function currentSegmentPairs(
  u: Unit,
  segs: TreadSegment[],
  metric: "tread" | "press",
): { d: string; v: number }[] {
  const seg = segs.length ? segs[segs.length - 1] : null;
  if (!seg) return [];
  const out: { d: string; v: number }[] = [];
  for (let i = seg.idxFrom; i <= seg.idxTo; i++) {
    const v = metric === "tread" ? seg.tread[i] : seg.press[i];
    const dt = u.dates[i];
    if (dt && typeof v === "number") out.push({ d: dt, v });
  }
  return out;
}

export interface WearRate {
  /** 마모율 (mm / 1,000 km) */
  mmPer1000Km: number;
  /** 1 mm 마모당 주행거리 (km) */
  kmPerMm: number;
  /** 계산에 채택된 인접 회차 구간 수 */
  intervals: number;
  sumMm: number;
  sumKm: number;
}

interface WearInterval { mm: number; km: number }

/**
 * 한 측정 구간에서 마모율 계산에 채택되는 인접 회차 구간을 고른다.
 *
 * 채택 조건 (작업지시서 v2 §A-4):
 *   ① 같은 세그먼트(= 같은 시리얼) 안의 인접 회차일 것 — 구간을 넘어 잇지 않는다
 *   ② 트레드가 늘어난 구간 제외 (prev ≥ now). 늘어난 값은 측정 오차이지 마모가 아니다
 *   ③ km 이 실제로 증가한 구간만. CH 849 는 km 이 전부 0이라 여기서 통째로 빠진다
 *   ④ 끝점 트레드가 0 인 구간 제외 — 0 은 '다 닳음/미측정'이라 마모량을 대표하지 못한다
 *
 * ④ 를 빼면 4대 평균이 0.554 가 아니라 0.536 이 되어 실차보고서와 어긋난다.
 * 결과가 음수가 되는 경로는 ② 때문에 존재하지 않는다.
 */
function wearIntervals(u: Unit, seg: TreadSegment): WearInterval[] {
  const out: WearInterval[] = [];
  let prevT: number | null = null;
  let prevK: number | null = null;
  let hasPrev = false;

  for (const p of segmentPoints(u, seg)) {
    if (
      hasPrev &&
      prevT != null && prevK != null &&
      p.tread != null && p.km != null &&
      prevT >= p.tread &&      // ②
      p.km > prevK &&          // ③
      p.tread > 0              // ④
    ) {
      out.push({ mm: prevT - p.tread, km: p.km - prevK });
    }
    // 값이 비어 있어도 직전 회차 자리는 그대로 넘긴다 — 결측을 건너뛰어
    // 멀리 떨어진 두 회차를 인접한 것처럼 잇지 않기 위해서다.
    prevT = p.tread;
    prevK = p.km;
    hasPrev = true;
  }
  return out;
}

/** 채택 구간들을 가중 합산 — Σ마모 ÷ Σ주행. 단순 평균이 아니다. */
function accumulate(list: WearInterval[]): WearRate | null {
  if (!list.length) return null;
  const sumMm = list.reduce((s, x) => s + x.mm, 0);
  const sumKm = list.reduce((s, x) => s + x.km, 0);
  if (sumKm <= 0 || sumMm <= 0) return null;
  const mmPer1000Km = (sumMm / sumKm) * 1000;
  return { mmPer1000Km, kmPerMm: sumKm / sumMm, intervals: list.length, sumMm, sumKm };
}

/** 한 측정 구간(= 타이어 1본)의 마모율. */
export function segmentWearRate(u: Unit, seg: TreadSegment): WearRate | null {
  return accumulate(wearIntervals(u, seg));
}

/** 차량 1대의 마모율 — 그 차량 모든 포지션의 채택 구간을 가중 합산. */
export function vehicleWearRate(ch: string): WearRate | null {
  const u = TMS_DATA.units.find((x) => x.ch === ch);
  if (!u) return null;
  const all: WearInterval[] = [];
  for (const segs of Object.values(TMS_DATA.segments[ch] ?? {})) {
    for (const seg of segs) all.push(...wearIntervals(u, seg));
  }
  return accumulate(all);
}

export interface FleetWearRate {
  mmPer1000Km: number;
  kmPerMm: number;
  /** 평균에 실제로 들어간 차량 */
  vehicles: { ch: string; rate: WearRate }[];
}

/**
 * 여러 대의 평균 마모율 — **차량별 마모율의 단순 산술평균**이다.
 * 전체 구간을 다시 가중 합산하면 대당 주행거리 차이 때문에 값이 달라진다
 * (4대 기준 0.554 가 아니라 0.547 이 나온다). 실차보고서와 같은 정의를 쓴다.
 */
export function fleetWearRate(chs: string[]): FleetWearRate | null {
  const vehicles = chs
    .map((ch) => ({ ch, rate: vehicleWearRate(ch) }))
    .filter((x): x is { ch: string; rate: WearRate } => x.rate !== null);
  if (!vehicles.length) return null;
  const mean = vehicles.reduce((s, x) => s + x.rate.mmPer1000Km, 0) / vehicles.length;
  return { mmPer1000Km: mean, kmPerMm: 1000 / mean, vehicles };
}

export interface LifeCalc {
  ch: string;
  pos: string;
  km: number | null;         // 주행 KM = 최신 km − 최초 km
  hr: number | null;         // 주행 HR = 최신 HM − 최초 HM
  expectedKm: number | null; // 예상 KM = 주행 KM + 회귀 마모율 기준 0mm 잔여 외삽 (≥ 주행 KM)
  expectedHm: number | null; // 예상 HM = 주행 HR + 회귀 마모율 기준 0mm 잔여 외삽 (≥ 주행 HR)
}

/**
 * (x=누적 주행, y=트레드) 점들의 선형회귀 마모율로 현재 트레드 → limit(0mm) 잔여 주행을 외삽하고,
 * 이미 주행한 양(driven)에 가산해 총 예상수명을 산출.
 * → 예상수명은 항상 주행량(driven) 이상이 된다. 마모(음의 기울기)·유효 데이터일 때만 반환.
 */
function projectExpected(pairs: { x: number; y: number }[], driven: number | null, limit: number): number | null {
  if (driven == null || driven <= 0 || pairs.length < 2) return null;
  const n = pairs.length;
  const x0 = pairs[0].x;
  const xs = pairs.map((p) => p.x - x0);
  const ys = pairs.map((p) => p.y);
  const xbar = xs.reduce((s, v) => s + v, 0) / n;
  const ybar = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xbar) * (ys[i] - ybar);
    den += (xs[i] - xbar) ** 2;
  }
  if (den <= 0) return null;
  const slope = num / den;            // 단위당 마모(음수)
  if (slope >= 0) return null;        // 마모 추세가 아니면 외삽 불가
  const wearRate = -slope;            // 단위당 마모량(양수)
  const latestTread = pairs[pairs.length - 1].y;
  const remaining = (latestTread - limit) / wearRate; // 0mm까지 잔여 (이미 한계 이하면 음수)
  return Math.round(driven + Math.max(0, remaining));
}

/**
 * 한 시리얼이 특정 포지션에 장착돼 있던 구간.
 * 구간은 [from, to) — from 이 null 이면 최초 장착(원장에 일자 없음)이라 앞이 열려 있고,
 * to 가 null 이면 아직 장착 중이라 뒤가 열려 있다.
 */
export interface MountSpan {
  ch: string;
  pos: string;
  seqNo: number;                  // 0 = 최초 장착, 1..n = 교체 회차
  from: string | null;            // 장착일
  to: string | null;              // 탈거일 (= 다음 타이어의 장착일)
  isCurrent: boolean;             // 현재 장착 중인가
}

/**
 * 시리얼의 장착 구간 전체를 시리얼 체인(v_position_history)에서 재구성.
 * 과거처럼 serial/serial2 2칸만 보지 않으므로 중간 회차 타이어도 빠지지 않는다.
 */
export function mountSpansOf(serial: string): MountSpan[] {
  if (!serial) return [];
  const out: MountSpan[] = [];
  for (const u of TMS_DATA.units) {
    for (const p of u.positions) {
      p.chain.forEach((c, i) => {
        if (c.serial !== serial) return;
        const next = p.chain[i + 1];
        out.push({
          ch: u.ch,
          pos: p.pos,
          seqNo: c.seqNo,
          from: c.mountedAt,
          to: next?.mountedAt ?? null,
          isCurrent: !next,
        });
      });
    }
  }
  out.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
  return out;
}

/** 대표 장착 구간 — 현재 장착 중인 구간이 있으면 그것, 없으면 가장 최근 구간. */
export function primaryMountSpan(serial: string): MountSpan | null {
  const spans = mountSpansOf(serial);
  if (!spans.length) return null;
  return spans.find((s) => s.isCurrent) ?? spans[spans.length - 1];
}

/**
 * 수명 외삽용 점열 정리 — 트레드가 늘어나거나 km 이 줄어드는 점을 떨어낸다.
 * 회귀 기울기가 양수(= 음의 마모율)로 뒤집히는 경로를 여기서 차단한다 (§A-4).
 */
function monotoneWear<T extends { tread: number; km: number }>(pts: T[]): T[] {
  const out: T[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last) { out.push(p); continue; }
    if (p.tread <= last.tread && p.km > last.km) out.push(p);
  }
  return out;
}

/** 시리얼이 (과거 포함) 장착됐던 차량 Unit 탐색. */
export function findUnitBySerial(serial: string): Unit | null {
  if (!serial) return null;
  return (
    TMS_DATA.units.find((u) =>
      u.positions.some((p) => p.chain.some((c) => c.serial === serial))
    ) ?? null
  );
}

/**
 * 시리얼로 타이어를 찾아 km/hr 수명과 예상 KM을 계산.
 * - 구간 근거는 inspections.serial 이다 (v_position_history 의 장착일이 아니라).
 *   측정값이 그 타이어의 것임을 회차 단위로 보장하므로 앞뒤 타이어가 섞이지 않는다.
 * - tread = 0 회차는 제외하고, 마모가 단조로운 점만 남겨 음수 마모율을 차단한다.
 * - 예상수명: 트레드 vs km 선형회귀 기울기로 limit(mm) 도달 km 외삽
 * 데이터 부족(또는 신품 기준 회차 미포함) 시 null 반환.
 */
export function lifeCalc(serial: string, limit = 0): LifeCalc | null {
  if (!serial) return null;

  // ① 이 시리얼이 실제로 측정된 대표 구간
  const sel = primarySerialSegment(serial);
  if (!sel) return null;
  const { unit: u, seg } = sel;
  const { ch, pos } = seg;

  // ② 트레드·km 이 모두 있는 회차만 (구간 안에서만 나온다)
  type P = { tread: number; km: number; hm: number | null; date: string };
  let pts: P[] = segmentPoints(u, seg)
    .filter((p) => p.tread != null && p.km != null)
    .map((p) => ({ tread: p.tread as number, km: p.km as number, hm: p.hm, date: p.date }));

  // ③ tread = 0 회차 제외 — '다 닳음/미측정'이라 잔여 수명 외삽의 근거가 못 된다 (§A-4)
  pts = pts.filter((p) => p.tread > 0);

  // ④ 마모 단조 · km 증가 구간만
  pts = monotoneWear(pts);
  if (pts.length < 2) return null;

  // 신품(22mm) 기준 회차가 수집 데이터에 없으면(예: HM Reset 후 부분 km, 교체 타이어)
  // 전체 수명을 대표하지 못하므로 계산 제외.
  if (pts[0].tread < NEW_TREAD) return null;

  // ⑤ km/hr 수명 = 최신 − 최초
  const kmDiff = pts[pts.length - 1].km - pts[0].km;
  const km = kmDiff > 0 ? kmDiff : null;
  const hmFirst = pts.find((p) => p.hm != null)?.hm ?? null;
  const hmLast = [...pts].reverse().find((p) => p.hm != null)?.hm ?? null;
  const hr = hmFirst != null && hmLast != null && hmLast - hmFirst > 0 ? hmLast - hmFirst : null;

  // ⑥ 예상 KM / 예상 HM = 회귀 마모율로 현재 트레드 → 0mm 잔여 외삽 + 주행량 (항상 주행 이상)
  const expectedKm = projectExpected(pts.map((p) => ({ x: p.km, y: p.tread })), km, limit);
  const hmPairs = pts.filter((p) => p.hm != null).map((p) => ({ x: p.hm as number, y: p.tread }));
  const expectedHm = hmPairs.length >= 2 && hmPairs[0].y >= NEW_TREAD
    ? projectExpected(hmPairs, hr, limit)
    : null;

  return { ch, pos, km, hr, expectedKm, expectedHm };
}

/** 시리얼 기준 최근 트레드(mm) — 그 시리얼이 달려 있던 구간의 마지막 측정값. */
export function latestTreadOf(serial: string): number | null {
  const sel = primarySerialSegment(serial);
  if (!sel) return null;
  const pts = segmentPoints(sel.unit, sel.seg).filter((p) => p.tread != null);
  return pts.length ? (pts[pts.length - 1].tread as number) : null;
}

export interface TireRound { date: string; tread: number | null; km: number | null; hm: number | null }
export interface TireHistory {
  serial: string;
  ch: string;
  pos: string;
  installDate: string | null;   // 최초 장착일 (Lifetime 시트 입고/조립일)
  mountDate: string | null;     // (재)장착일 — 교체로 이 포지션에 장착된 날
  removeDate: string | null;    // 탈착일 — 이 타이어가 교체되어 내려간 날
  scrapDate: string | null;     // 폐기일
  damage: string | null;
  status: string;
  hmReset: boolean;
  km: number | null;
  hr: number | null;
  expectedKm: number | null;
  expectedHm: number | null;
  latestTread: number | null;
  rounds: TireRound[];          // 측정 이력 (해당 타이어 장착 구간)
}

export interface TireMovement {
  date: string | null;   // 장착일 (최초=입고/조립일, 교체=repl.date)
  ch: string;            // 장착 차량
  pos: string;           // 장착 포지션
  kind: "install" | "mount"; // 최초 장착 / 교체 장착
}

/**
 * 시리얼의 장착 이동 이력(차량·포지션 변경) 재구성.
 * 시리얼 체인의 장착 구간을 그대로 쓴다 — 최초 장착(seqNo 0)은 원장에 일자가 없으므로
 * lifetimes.install(최초 투입일)을 표시 일자로 대신한다.
 * 일자순 정렬. 같은 (차량·포지션·일자)는 1건으로 합침.
 */
export function tireMovements(serial: string): TireMovement[] {
  if (!serial) return [];
  const life = TMS_DATA.life.find((l) => l.serial === serial);
  const install = life?.install && life.install !== "-" ? life.install : null;

  const out: TireMovement[] = mountSpansOf(serial).map((s) => ({
    date: s.seqNo === 0 ? install : s.from,
    ch: s.ch,
    pos: s.pos,
    kind: s.seqNo === 0 ? "install" : "mount",
  }));

  const seen = new Set<string>();
  const dedup = out.filter((m) => {
    const k = `${m.ch}|${m.pos}|${m.date ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  dedup.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return dedup;
}

/** 시리얼로 타이어 전체 히스토리(장착·탈착·폐기·HM Reset·측정 회차)를 구성. */
export function tireHistory(serial: string): TireHistory | null {
  if (!serial) return null;
  const life = TMS_DATA.life.find((l) => l.serial === serial) ?? null;

  // 장착·탈착 일자는 교체 원장(v_position_history)이 정본이고,
  // 측정 회차는 inspections.serial 로 잘린 구간이 정본이다. 둘을 섞지 않는다.
  const span = primaryMountSpan(serial);
  const sel = primarySerialSegment(serial);
  const ch = sel?.seg.ch ?? span?.ch ?? "";
  const pos = sel?.seg.pos ?? span?.pos ?? "";
  const unit = ch ? TMS_DATA.units.find((u) => u.ch === ch) ?? null : null;

  // 측정 회차 — 그 시리얼이 실제로 달려 있던 구간만. 앞뒤 타이어 값이 섞이지 않는다.
  const rounds: TireRound[] = sel
    ? segmentPoints(sel.unit, sel.seg)
        .filter((p) => p.date)
        .map((p) => ({ date: p.date, tread: p.tread, km: p.km, hm: p.hm }))
    : [];

  const c = lifeCalc(serial);
  const norm = (s: string | null | undefined) => (!s || s === "-" ? null : s);
  return {
    serial,
    ch,
    pos,
    installDate: norm(life?.install),
    // 최초 장착(seqNo 0)은 '재장착'이 아니므로 재장착일을 비운다.
    mountDate: span && span.seqNo > 0 ? span.from : null,
    removeDate: span?.to ?? null,
    scrapDate: norm(life?.scrap),
    damage: life?.damage && life.damage !== "-" ? life.damage : null,
    status: life?.status ?? "",
    hmReset: !!unit?.hmReset,
    km: c?.km ?? null,
    hr: c?.hr ?? null,
    expectedKm: c?.expectedKm ?? null,
    expectedHm: c?.expectedHm ?? null,
    latestTread: latestTreadOf(serial),
    rounds,
  };
}

export function getUnitAlerts(u: Unit) {
  const alerts: { lv: "danger" | "order" | "warn"; text: string }[] = [];
  for (let p = 1; p <= 10; p++) {
    const d = headPosData(u, p);
    if (!d) continue;

    const scrap = d.serial
      ? TMS_DATA.life.find((l) => l.serial === d.serial && l.status === "Scrap")
      : null;

    if (scrap) {
      alerts.push({
        lv: "danger",
        text: `CH ${u.ch} · ${d.rp} (#${p}) 폐기 — ${codeName(scrap.damage)} / 수명 ${scrap.lifetime}시간`,
      });
    } else if (d.latestTread != null) {
      // 트레드 경보는 측정값 자체로 판정한다. st 는 공기압 이상까지 섞인 값이라
      // 트레드가 정상인데 트레드 경보가 나가는 것을 막는다.
      const lv = treadLevel(d.latestTread);
      if (lv === "danger") {
        alerts.push({
          lv: "danger",
          text: `CH ${u.ch} · ${d.rp} (#${p}) 트레드 ${fmtTread(d.latestTread)}mm — 즉시 교체`,
        });
      } else if (lv === "order") {
        alerts.push({
          lv: "order",
          text: `CH ${u.ch} · ${d.rp} (#${p}) 트레드 ${fmtTread(d.latestTread)}mm — 교체 타이어 발주`,
        });
      } else if (lv === "warn") {
        alerts.push({
          lv: "warn",
          text: `CH ${u.ch} · ${d.rp} (#${p}) 트레드 ${fmtTread(d.latestTread)}mm — 마모 진행`,
        });
      }
    }

    if (
      typeof d.latestPress === "number" &&
      d.latestPress < recPsi(p) * 0.85
    ) {
      alerts.push({
        lv: "danger",
        text: `CH ${u.ch} · ${d.rp} (#${p}) 공기압 ${Math.round(d.latestPress)}psi — 저압 (권장 ${recPsi(p)})`,
      });
    }
  }
  return alerts;
}
