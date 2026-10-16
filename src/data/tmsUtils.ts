// @section: tms-utils
import { TMS_DATA, HEAD_MAP, NEW_TREAD, recPsi, treadLevel, treadThresholds, inspectionIntervalDays, meterUnresolved } from "./tmsData";
import type { Unit, TirePosition, TreadLevel, LedgerSegment, SerialChainEntry, TreadSegment, TreadWidths } from "./tmsData";
import { EMPTY, fmtTread, fmtPressure, fmtPercent, todayInField } from "@/lib/format";
import { pressureJudge, judgePressure } from "@/lib/pressureJudge";
import { projectReplacement, dailyKm, daysBetween, type Projection } from "@/lib/lifeProjection";
import { inspectionAge, type InspectionAge } from "@/lib/inspectionAge";
import type { Lang } from "@/i18n";

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

  if (typeof d.latestPress === "number") st = worst(st, pressureJudge(d.latestPress, recPsi(pos)));

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

  if (typeof press === "number") st = worst(st, pressureJudge(press, recPsi(pos)));

  return st;
}

export function codeName(c: string | null | undefined): string {
  if (!c) return "";
  const name = TMS_DATA.codes[c];
  return name ? `${c} (${name})` : c;
}

/**
 * 장착일 표기. 원본이 "-" 인 행은 미상이라는 뜻이라 빈값 기호로 바꾼다.
 *
 * 숫자·트레드 서식 함수는 여기 두지 않는다. 예전에는 fmtInt·fmtTread 가
 * 이 파일에도 있어서, 같은 이름이 파일마다 다른 함수를 가리켰다 —
 * `@/lib/format` 쪽은 «11.2 mm» 를, 이쪽은 «11.2» 를 돌려주고 빈값 기호도
 * «—» 와 «−» 로 갈렸다. 서식은 `@/lib/format` 하나만 쓴다 (CLAUDE.md §숫자 표기).
 */
export function fmtD(d: string | null | undefined): string {
  if (!d || d === "-") return EMPTY;
  return d;
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
  /** 4점 최소값 — 판정·마모율은 전부 이 값을 쓴다. */
  tread: number | null;
  /** 4점 평균 — 표시 병기용. 최소값이 0 이어도 숄더가 남았는지 여기서 보인다. */
  treadAvg: number | null;
  /** 폭 4점 원시값. 4점 측정 이전 회차는 null. */
  widths: TreadWidths | null;
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
      treadAvg: seg.treadAvg[i] ?? null,
      widths: seg.widths[i] ?? null,
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

/** 포지션 1곳의 마모율 — 그 포지션을 거쳐 간 모든 구간(시리얼)의 채택 구간 가중 합산 (§A-6).
 *  정렬·토인처럼 차량·자리에 붙은 원인을 보려는 것이라 교체 전 타이어도 함께 넣는다. */
export function positionWearRate(ch: string, pos: string): WearRate | null {
  const u = TMS_DATA.units.find((x) => x.ch === ch);
  if (!u) return null;
  return accumulate(posSegments(ch, pos).flatMap((seg) => wearIntervals(u, seg)));
}

/**
 * 구간 1개의 (주행 km, 트레드) 곡선 — 전 차량 비교 차트용 (§A-6).
 * x 는 차량 누적 KM 이 아니라 **그 타이어 첫 측정 이후 주행 km** 다. 차량마다 계기값이
 * 수만 km 씩 달라 누적 KM 으로 두면 선이 서로 겹치지 않아 기울기를 견줄 수 없다.
 * km·트레드가 없는 회차와 트레드 0(다 닳음/미측정)은 뺀다.
 */
export function segmentKmCurve(u: Unit, seg: TreadSegment): { km: number; tread: number }[] {
  const pts = segmentPoints(u, seg).filter(
    (p): p is SegPoint & { km: number; tread: number } => p.km != null && p.tread != null && p.tread > 0,
  );
  if (!pts.length) return [];
  const base = pts[0].km;
  return pts.filter((p) => p.km >= base).map((p) => ({ km: p.km - base, tread: p.tread }));
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
  /** 예상 교체 시점 — tread_order(발주) 기준 (§A-2). 0 mm 외삽인 expectedKm 과 다르다 */
  projection: Projection;
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

/** 원장 구간 목록 — 없으면 빈 배열. */
export function ledgerOf(serial: string): LedgerSegment[] {
  return serial ? TMS_DATA.ledger[serial] ?? [] : [];
}

/** 차량 `ch` 의 `date` 시점 주행계 — `hmAt()` 과 같은 규칙(그 날짜 이하 마지막 회차). */
function kmAt(ch: string, date: string | null): number | null {
  return sampleAt(ch, date, (u, i) => {
    const v = u.km[i];
    return typeof v === "number" ? v : null;
  });
}

/**
 * 차량 `ch` 의 `date` 시점 HM — 그 날짜 **이하**의 마지막 측정 회차 값.
 * `v_tire_ledger` 가 km_start·km_end 를 잡는 규칙과 같다. 원장에 HM 컬럼이 없어
 * 여기서 같은 규칙으로 되짚는다 — 다른 규칙을 쓰면 KM 과 HR 이 서로 다른 구간을 잰다.
 */
function hmAt(ch: string, date: string | null): number | null {
  return sampleAt(ch, date, (u, i) => u.hm[i] ?? null);
}

/** `date` 이하의 마지막 회차에서 값을 꺼낸다. 회차열은 일자순이 아닐 수 있어 전부 훑는다. */
function sampleAt(
  ch: string,
  date: string | null,
  pick: (u: Unit, i: number) => number | null,
): number | null {
  if (!date) return null;
  const u = TMS_DATA.units.find((x) => x.ch === ch);
  if (!u) return null;
  let hit: number | null = null;
  let hitDate = "";
  for (let i = 0; i < u.dates.length; i++) {
    const d = u.dates[i];
    if (!d || d > date || d < hitDate) continue;
    const v = pick(u, i);
    if (v == null) continue;
    hit = v;
    hitDate = d;
  }
  return hit;
}

/**
 * 시리얼로 타이어를 찾아 km/hr 수명과 예상 KM을 계산.
 *
 * - **주행 KM·HR 은 원장(`v_tire_ledger`) 이 정본이다.** 장착·탈착 시점의 차량 km 는
 *   그 타이어가 측정된 회차 밖(교체 당일)에 있어서 점검 점열의 차이로는 잡히지 않는다.
 *   `km_flag = 'OK'` 인 구간을 합산하며, 한 시리얼이 차량·포지션을 옮겨 다닌 경우도
 *   구간마다 더해진다.
 * - 산출 가능한 구간이 하나도 없으면(최초 장착분은 `mounted_at` 이 없어 전부 `NO_KM`)
 *   종전대로 측정 점열의 최신 − 최초 로 되돌아간다.
 * - **마모 점열은 구간 근거가 inspections.serial 이다** (원장의 장착일이 아니라).
 *   측정값이 그 타이어의 것임을 회차 단위로 보장하므로 앞뒤 타이어가 섞이지 않는다.
 *   차량이 바뀌면 km 가 리셋되므로 구간별 누적 오프셋으로 이어 붙인다.
 * - tread = 0 회차는 제외하고, 마모가 단조로운 점만 남겨 음수 마모율을 차단한다.
 * - 예상수명: 트레드 vs 누적 km 선형회귀 기울기로 limit(mm) 도달 km 외삽.
 *   신품(22mm) 기준 회차가 점열에 없으면 **예상값만** 비운다 — 전체 수명을 대표하지
 *   못하기 때문이다. 주행 실적은 원장에서 나오므로 이 가드와 무관하다.
 *
 * 데이터 부족 시 null 반환.
 */
export function lifeCalc(serial: string, limit = 0): LifeCalc | null {
  if (!serial) return null;

  // ① 이 시리얼이 실제로 측정된 구간 전체 (차량 이동 포함, 시간순)
  const sels = segmentsOfSerial(serial);
  if (!sels.length) return null;
  // 표시 위치는 종전과 같이 대표 구간(현재 장착 중 → 없으면 최신)
  const primary = sels.find((x) => x.seg.isCurrent) ?? sels[sels.length - 1];
  const { ch, pos } = primary.seg;

  // ② 구간별로 점열을 만들고 **누적** km·hm 축으로 이어 붙인다.
  //    차량이 바뀌면 주행계·가동계가 리셋되므로 구간 안에서의 증분만 쓴다.
  //    구간 원점은 원장의 장착 시점(km_start)이다 — 첫 측정 회차가 아니다.
  //    첫 측정까지의 주행이 빠지면 구간 경계에서 누적값이 겹쳐 점이 하나 사라진다.
  const segs = ledgerOf(serial);
  const used = new Set<number>();
  type P = { tread: number; km: number; hm: number | null; date: string };
  const pts: P[] = [];
  let kmBase = 0;
  let hmBase = 0;
  for (const sel of sels) {
    const raw = segmentPoints(sel.unit, sel.seg)
      .filter((p) => p.tread != null && p.km != null && (p.tread as number) > 0)
      .map((p) => ({ tread: p.tread as number, km: p.km as number, hm: p.hm, date: p.date }));
    if (!raw.length) continue;

    const gi = segs.findIndex(
      (g, i) => !used.has(i) && g.ch === sel.seg.ch && g.pos === sel.seg.pos,
    );
    const g = gi >= 0 ? segs[gi] : null;
    if (gi >= 0) used.add(gi);
    const measurable = g != null && g.kmFlag === "OK" && g.segmentKm != null;

    const kmOrigin = measurable && g.mountedAt ? kmAt(g.ch, g.mountedAt) ?? raw[0].km : raw[0].km;
    const hmOrigin = (measurable && g.mountedAt ? hmAt(g.ch, g.mountedAt) : null)
      ?? raw.find((p) => p.hm != null)?.hm ?? null;

    for (const p of raw) {
      pts.push({
        ...p,
        km: kmBase + (p.km - kmOrigin),
        hm: p.hm != null && hmOrigin != null ? hmBase + (p.hm - hmOrigin) : null,
      });
    }
    // 다음 구간은 이 구간이 실제로 달린 만큼 뒤에서 시작한다.
    kmBase += measurable ? (g.segmentKm as number) : raw[raw.length - 1].km - raw[0].km;
    const hmEnd = measurable && g.removedAt ? hmAt(g.ch, g.removedAt) : null;
    hmBase += hmEnd != null && hmOrigin != null
      ? hmEnd - hmOrigin
      : (pts[pts.length - 1].hm ?? hmBase) - hmBase;
  }

  // ③ 마모 단조 · 누적 km 증가 구간만
  const wear = monotoneWear(pts);
  if (wear.length < 2) return null;

  // ④ 주행 KM — 원장의 산출 가능 구간 합. 없으면 측정 점열의 증분.
  const ok = ledgerOf(serial).filter((g) => g.kmFlag === "OK" && g.segmentKm != null);
  const ledgerKm = ok.reduce((sum, g) => sum + (g.segmentKm as number), 0);
  const spanKm = wear[wear.length - 1].km - wear[0].km;
  const km = ok.length ? (ledgerKm > 0 ? ledgerKm : null) : (spanKm > 0 ? spanKm : null);

  // ⑤ 주행 HR — 같은 구간의 HM 차. 원장에 HM 이 없어 구간 경계일로 되짚는다.
  let hr: number | null = null;
  if (ok.length) {
    let sum = 0;
    let any = false;
    for (const g of ok) {
      const a = hmAt(g.ch, g.mountedAt);
      const b = hmAt(g.ch, g.removedAt);
      if (a == null || b == null || b <= a) continue;
      sum += b - a;
      any = true;
    }
    hr = any ? sum : null;
  } else {
    const first = wear.find((p) => p.hm != null)?.hm ?? null;
    const last = [...wear].reverse().find((p) => p.hm != null)?.hm ?? null;
    hr = first != null && last != null && last - first > 0 ? last - first : null;
  }

  // ⑥ 예상 KM / 예상 HM — 회귀 마모율로 현재 트레드 → limit 잔여 외삽 + 주행량.
  //    신품 기준 회차가 없으면 전체 수명을 대표하지 못하므로 예상값만 비운다.
  const fromNew = wear[0].tread >= NEW_TREAD;
  const expectedKm = fromNew
    ? projectExpected(wear.map((p) => ({ x: p.km, y: p.tread })), km, limit)
    : null;
  const hmPairs = wear.filter((p) => p.hm != null).map((p) => ({ x: p.hm as number, y: p.tread }));
  const expectedHm = fromNew && hmPairs.length >= 2
    ? projectExpected(hmPairs, hr, limit)
    : null;

  // ⑦ 예상 교체 시점 (§A-2) — 발주 기준선(tread_order)까지. 신품 기준 회차는 요구하지 않는다:
  //    마모율은 최근 추세만으로 충분하고, 교체 준비는 중고 장착 타이어에도 필요하다.
  const unit = TMS_DATA.units.find((x) => x.ch === ch);
  const rounds = unit
    ? unit.dates.flatMap((d, i) => {
        const k = unit.km[i];
        return d && typeof k === "number" && k > 0 ? [{ date: d, km: k }] : [];
      })
    : [];
  const latest = latestTreadOf(serial);
  const projection = projectReplacement(
    wear,
    latest != null && latest > 0 ? latest : wear[wear.length - 1].tread,
    dailyKm(rounds),
    treadThresholds().order,
  );
  // 보정값이 없는 계기 리셋 차량은 실패 사유를 리셋으로 돌린다 — 회차 부족보다 그쪽이 원인이다.
  // 보정값(§A-9)이 있으면 km 이 이미 연속이라 보통 회차처럼 예측된다.
  if (projection.reason && meterUnresolved(unit)) projection.reason = "hm_reset";

  return { ch, pos, km, hr, expectedKm, expectedHm, projection };
}

/** 교체 준비 목록 기본 창 (일). 대시보드 카드와 수명 DB 필터가 같은 값을 쓴다 */
export const PREP_WINDOW_DAYS = 30;
/** 예상 교체일 배지 — 이 일수 이내면 적색 (§A-2) */
export const PREP_URGENT_DAYS = 14;

export interface PrepItem {
  serial: string;
  ch: string;
  pos: string;
  projectedDate: string;
  /** 오늘(현장 WITA)부터 예상 교체일까지. 이미 지났으면 음수 */
  daysLeft: number;
  latestTread: number | null;
  remainingKm: number | null;
}

/** 장착 중 타이어의 예상 교체일까지 남은 일수. 예측 불가·미장착이면 null */
export function prepDaysLeft(serial: string, status: string, today = todayInField()): number | null {
  if (status !== "Install") return null;
  const d = lifeCalc(serial)?.projection.projectedDate;
  return d ? daysBetween(today, d) : null;
}

/**
 * 교체 준비 목록 — 예상 교체일이 오늘부터 withinDays 이내(이미 지난 것 포함)인 장착 타이어.
 * 예상 교체일 오름차순. 대시보드 카드와 수명 DB 의 「30일 이내」 필터가 이 함수 하나를 쓴다.
 */
export function replacementPrepList(withinDays = PREP_WINDOW_DAYS, today = todayInField()): PrepItem[] {
  const out: PrepItem[] = [];
  for (const l of TMS_DATA.life) {
    if (l.status !== "Install" || !l.serial) continue;
    const c = lifeCalc(l.serial);
    const d = c?.projection.projectedDate;
    if (!c || !d) continue;
    const daysLeft = daysBetween(today, d);
    if (daysLeft > withinDays) continue;
    out.push({
      serial: l.serial, ch: c.ch, pos: c.pos, projectedDate: d, daysLeft,
      latestTread: latestTreadOf(l.serial), remainingKm: c.projection.remainingKm,
    });
  }
  return out.sort((a, b) => a.projectedDate.localeCompare(b.projectedDate) || a.ch.localeCompare(b.ch));
}

// ── 점검 지연 (§A-3) ────────────────────────────────────────

/** 차량의 점검 경과 — 주기는 tire_config.inspection_interval_days, 오늘은 현장 WITA */
export function unitInspectionAge(u: Unit, today = todayInField()): InspectionAge {
  return inspectionAge(u.dates, today, inspectionIntervalDays());
}

/** 대시보드 집계 버킷. stale = 점검 지연 차량의 정상 판정 타이어 (마지막 값이 오래돼 정상이라 단정 못 함) */
export type DashBucket = "ok" | "warn" | "order" | "danger" | "stale";

/**
 * 차량 1대의 대시보드 상태 집계. statusOf() 판정은 그대로 두고,
 * 점검 지연(overdue) 차량에서 「정상」으로 나온 타이어만 stale 로 옮긴다.
 * 주의·발주·위험은 오래된 값이어도 그대로 센다 — 지연이 경고를 지우면 안 된다.
 */
export function unitStatusCounts(u: Unit, today = todayInField()): Record<DashBucket, number> {
  const overdue = unitInspectionAge(u, today).level === "overdue";
  const c: Record<DashBucket, number> = { ok: 0, warn: 0, order: 0, danger: 0, stale: 0 };
  for (let p = 1; p <= 10; p++) {
    const st = statusOf(headPosData(u, p), p);
    if (st === "none") continue;
    if (st === "ok" && overdue) c.stale++;
    else c[st]++;
  }
  return c;
}

/** 시리얼 기준 최근 트레드(mm) — 그 시리얼이 달려 있던 구간의 마지막 측정값. */
export function latestTreadOf(serial: string): number | null {
  return latestTreadPointOf(serial)?.tread ?? null;
}

/**
 * 시리얼 기준 최근 4점 평균(mm) — `latestTreadOf()` 와 **같은 회차**의 값이다.
 * 최소값만 보면 중앙 그루브가 닳은 타이어가 전부 0.0 mm 로 보여 폐기로 오독된다.
 * 4점이 없던 회차(백필 이전 데이터)는 null 이므로 호출부에서 병기를 생략해야 한다.
 */
export function latestTreadAvgOf(serial: string): number | null {
  return latestTreadPointOf(serial)?.treadAvg ?? null;
}

/** 두 함수가 서로 다른 회차를 보지 않도록 마지막 측정점을 한 곳에서 고른다. */
function latestTreadPointOf(serial: string): SegPoint | null {
  const sel = primarySerialSegment(serial);
  if (!sel) return null;
  const pts = segmentPoints(sel.unit, sel.seg).filter((p) => p.tread != null);
  return pts.length ? pts[pts.length - 1] : null;
}

export interface TireRound {
  date: string;
  /** 4점 최소값 — 표의 기본 표시값이자 판정값 */
  tread: number | null;
  treadAvg: number | null;
  widths: TreadWidths | null;
  km: number | null;
  hm: number | null;
}
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
  /** 최근 트레드와 **같은 회차**의 4점 평균·원시값. 4점 측정 이전이면 null. */
  latestTreadAvg: number | null;
  latestWidths: TreadWidths | null;
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
        .map((p) => ({
          date: p.date, tread: p.tread, treadAvg: p.treadAvg,
          widths: p.widths, km: p.km, hm: p.hm,
        }))
    : [];

  const c = lifeCalc(serial);
  // 요약의 세 값이 서로 다른 회차를 가리키지 않도록 한 점에서 뽑는다.
  const last = latestTreadPointOf(serial);
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
    latestTread: last?.tread ?? null,
    latestTreadAvg: last?.treadAvg ?? null,
    latestWidths: last?.widths ?? null,
    rounds,
  };
}

const ALERT_TX = {
  ko: {
    scrap: (code: string, life: string) => `폐기 — ${code} / 수명 ${life}시간`,
    tread: "트레드",
    treadDanger: "즉시 교체", treadOrder: "교체 타이어 발주", treadWarn: "마모 진행",
    press: "공기압", rec: "권장",
    low: "저압", high: "과압", devLow: "공기압 부족", devHigh: "공기압 과다",
  },
  id: {
    scrap: (code: string, life: string) => `Scrap — ${code} / umur ${life} jam`,
    tread: "Kedalaman alur",
    treadDanger: "ganti segera", treadOrder: "pesan ban pengganti", treadWarn: "aus berlanjut",
    press: "Tekanan angin", rec: "standar",
    low: "tekanan rendah", high: "tekanan berlebih", devLow: "kurang angin", devHigh: "kelebihan angin",
  },
  en: {
    scrap: (code: string, life: string) => `Scrapped — ${code} / life ${life} h`,
    tread: "Tread",
    treadDanger: "replace now", treadOrder: "order replacement tire", treadWarn: "wear progressing",
    press: "Pressure", rec: "rec.",
    low: "under-inflated", high: "over-inflated", devLow: "low pressure", devHigh: "high pressure",
  },
} as const;

/**
 * 차량 1대의 경보 목록. 대시보드 카운트(statusOf)와 같은 판정을 쓰므로
 * 카운트를 눌러 연 목록과 숫자가 맞는다 — 공기압 주의(±편차)도 여기 나온다.
 */
export function getUnitAlerts(u: Unit, lang: Lang = "id") {
  const tx = ALERT_TX[lang];
  const alerts: { lv: "danger" | "order" | "warn"; text: string }[] = [];
  for (let p = 1; p <= 10; p++) {
    const d = headPosData(u, p);
    if (!d) continue;
    const head = `CH ${u.ch} · ${d.rp} (#${p})`;

    const scrap = d.serial
      ? TMS_DATA.life.find((l) => l.serial === d.serial && l.status === "Scrap")
      : null;

    if (scrap) {
      alerts.push({ lv: "danger", text: `${head} ${tx.scrap(codeName(scrap.damage), String(scrap.lifetime))}` });
    } else if (d.latestTread != null) {
      // 트레드 경보는 측정값 자체로 판정한다. st 는 공기압 이상까지 섞인 값이라
      // 트레드가 정상인데 트레드 경보가 나가는 것을 막는다.
      const lv = treadLevel(d.latestTread);
      const what = lv === "danger" ? tx.treadDanger : lv === "order" ? tx.treadOrder : lv === "warn" ? tx.treadWarn : null;
      if (lv !== "ok" && what) {
        alerts.push({ lv, text: `${head} ${tx.tread} ${fmtTread(d.latestTread)} — ${what}` });
      }
    }

    if (typeof d.latestPress === "number") {
      const target = recPsi(p);
      const j = judgePressure(d.latestPress, target);
      if (j.level !== "ok") {
        const what = j.level === "danger"
          ? (j.cause === "low" ? tx.low : tx.high)
          : (j.cause === "low" ? tx.devLow : tx.devHigh);
        const sign = j.devPct > 0 ? "+" : "";
        alerts.push({
          lv: j.level,
          text: `${head} ${tx.press} ${fmtPressure(d.latestPress)} — ${what} (${tx.rec} ${fmtPressure(target)}, ${sign}${fmtPercent(j.devPct)})`,
        });
      }
    }
  }
  return alerts;
}
