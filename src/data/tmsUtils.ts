// @section: tms-utils
import { TMS_DATA, HEAD_MAP, TREAD_WARN, TREAD_DANGER, NEW_TREAD, recPsi } from "./tmsData";
import type { Unit, TirePosition } from "./tmsData";

export type TireStatus = "ok" | "warn" | "danger" | "none";

export interface HeadPosData {
  rp: string;
  serial: string;
  serial2?: string;
  remark?: string | null;
  press: (number | "N/A" | null)[];
  treadMin: (number | null)[];
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
    serial: pd?.serial ?? "",
    serial2: pd?.serial2,
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

  if (d.latestTread != null) {
    if (d.latestTread <= TREAD_DANGER) st = "danger";
    else if (d.latestTread <= TREAD_WARN) st = "warn";
  }

  if (typeof d.latestPress === "number") {
    const r = recPsi(pos);
    if (d.latestPress < r * 0.85) st = "danger";
    else if (Math.abs(d.latestPress - r) / r > 0.15 && st !== "danger")
      st = "warn";
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

  if (tread != null) {
    if (tread <= TREAD_DANGER) st = "danger";
    else if (tread <= TREAD_WARN) st = "warn";
  }

  if (typeof press === "number") {
    const r = recPsi(pos);
    if (press < r * 0.85) st = "danger";
    else if (Math.abs(press - r) / r > 0.15 && st !== "danger") st = "warn";
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
  if (typeof n === "number") return n.toLocaleString("ko-KR");
  return String(n);
}

export function fmtD(d: string | null | undefined): string {
  if (!d || d === "-") return "−";
  return d;
}

/** KM·HM 표기: 정수 반올림 + 천단위 콤마 (#,000). */
export function fmtInt(n: number | string | null | undefined): string {
  if (n == null || n === "") return "−";
  if (typeof n === "number") return Math.round(n).toLocaleString("ko-KR");
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

/** 시리얼(serial 또는 serial2)이 장착된 차량 Unit 탐색. */
export function findUnitBySerial(serial: string): Unit | null {
  if (!serial) return null;
  return (
    TMS_DATA.units.find((u) =>
      u.positions.some((p) => p.serial === serial || p.serial2 === serial)
    ) ?? null
  );
}

/**
 * 시리얼로 타이어를 찾아 km/hr 수명과 예상 KM을 계산.
 * - serial(원본) / serial2(교체) 일치 포지션 탐색
 * - 교체 이력이 있으면 해당 타이어가 장착된 구간(교체일 기준)만 사용
 * - 트레드 존재 + km 수치 회차의 (km, hm, tread, date) 수집
 * - 예상수명: 트레드 vs (km−km0) 선형회귀 기울기로 limit(mm) 도달 km 외삽
 * 데이터 부족(또는 신품 기준 회차 미포함) 시 null 반환.
 */
export function lifeCalc(serial: string, limit = 0): LifeCalc | null {
  if (!serial) return null;

  // ① 시리얼로 ch/pos 탐색
  let ch = "", pos = "";
  let pd: TirePosition | undefined;
  for (const u of TMS_DATA.units) {
    const p = u.positions.find((x) => x.serial === serial || x.serial2 === serial);
    if (p) { ch = u.ch; pos = p.pos; pd = p; break; }
  }
  if (!ch || !pd) return null;

  const u = TMS_DATA.units.find((x) => x.ch === ch)!;
  const tr = (TMS_DATA.tread[ch] || {})[pos];
  if (!tr) return null;

  // ② 트레드 존재 + km 수치 회차 수집 (날짜 포함)
  let pts: { km: number; hm: number | null; tread: number; date: string }[] = [];
  tr.min.forEach((t, i) => {
    if (typeof t !== "number") return;
    const kmV = u.km[i];
    if (typeof kmV !== "number") return;
    const d = tr.dates[i] ?? u.dates[i];
    if (!d) return;
    const hmV = u.hm[i];
    pts.push({ km: kmV, hm: typeof hmV === "number" ? hmV : null, tread: t, date: d as string });
  });
  if (pts.length < 2) return null;

  pts.sort((a, b) => a.km - b.km);

  // 교체 이력으로 해당 타이어 장착 구간만 선택 (원본/교체 시리즈 혼합 방지)
  const replForPos = TMS_DATA.repl.filter((r) => r.ch === ch && r.pos === pos);
  const isReplacement = pd.serial2 === serial && pd.serial !== serial;
  if (isReplacement) {
    const my = replForPos.find((r) => r.newSerial === serial);
    pts = my ? pts.filter((p) => p.date >= my.date) : [];
  } else if (replForPos.length) {
    const firstRepl = replForPos.reduce((a, b) => (a.date < b.date ? a : b));
    pts = pts.filter((p) => p.date < firstRepl.date);
  }
  if (pts.length < 2) return null;

  // 신품(22mm) 기준 회차가 수집 데이터에 없으면(예: HM Reset 후 부분 km, 교체 타이어)
  // 전체 수명을 대표하지 못하므로 계산 제외.
  if (pts[0].tread < NEW_TREAD) return null;

  // ③ km/hr 수명 = 최신 − 최초
  const km0 = pts[0].km;
  const kmDiff = pts[pts.length - 1].km - km0;
  const km = kmDiff > 0 ? kmDiff : null;
  const hmFirst = pts.find((p) => p.hm != null)?.hm ?? null;
  const hmLast = [...pts].reverse().find((p) => p.hm != null)?.hm ?? null;
  const hr = hmFirst != null && hmLast != null && hmLast - hmFirst > 0 ? hmLast - hmFirst : null;

  // ④ 예상 KM / 예상 HM = 회귀 마모율로 현재 트레드 → 0mm 잔여 외삽 + 주행량 (항상 주행 이상)
  const expectedKm = projectExpected(pts.map((p) => ({ x: p.km, y: p.tread })), km, limit);
  const hmPairs = pts.filter((p) => p.hm != null).map((p) => ({ x: p.hm as number, y: p.tread }));
  const expectedHm = hmPairs.length >= 2 && hmPairs[0].y >= NEW_TREAD
    ? projectExpected(hmPairs, hr, limit)
    : null;

  return { ch, pos, km, hr, expectedKm, expectedHm };
}

/** 시리얼 기준 최근 트레드(mm). 교체 타이어는 자기 장착 구간의 마지막 측정값. */
export function latestTreadOf(serial: string): number | null {
  if (!serial) return null;
  let ch = "", pos = "";
  let pd: TirePosition | undefined;
  for (const u of TMS_DATA.units) {
    const p = u.positions.find((x) => x.serial === serial || x.serial2 === serial);
    if (p) { ch = u.ch; pos = p.pos; pd = p; break; }
  }
  if (!ch || !pd) return null;

  const u = TMS_DATA.units.find((x) => x.ch === ch)!;
  const tr = (TMS_DATA.tread[ch] || {})[pos];
  if (!tr) return null;

  let pts: { date: string; tread: number }[] = [];
  tr.min.forEach((t, i) => {
    if (typeof t !== "number") return;
    const d = tr.dates[i] ?? u.dates[i];
    if (!d) return;
    pts.push({ date: d as string, tread: t });
  });
  if (!pts.length) return null;
  pts.sort((a, b) => a.date.localeCompare(b.date));

  const replForPos = TMS_DATA.repl.filter((r) => r.ch === ch && r.pos === pos);
  const isReplacement = pd.serial2 === serial && pd.serial !== serial;
  if (isReplacement) {
    const my = replForPos.find((r) => r.newSerial === serial);
    pts = my ? pts.filter((p) => p.date >= my.date) : [];
  } else if (replForPos.length) {
    const firstRepl = replForPos.reduce((a, b) => (a.date < b.date ? a : b));
    pts = pts.filter((p) => p.date < firstRepl.date);
  }
  if (!pts.length) return null;
  return pts[pts.length - 1].tread;
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
 * - 원본(최초) 장착: vehicle_positions.serial === serial → life.install 일자
 * - 교체 장착: replacements.newSerial === serial → repl.date
 * 일자순 정렬. 같은 (차량·포지션·일자)는 1건으로 합침.
 */
export function tireMovements(serial: string): TireMovement[] {
  if (!serial) return [];
  const life = TMS_DATA.life.find((l) => l.serial === serial);
  const install = life?.install && life.install !== "-" ? life.install : null;

  const out: TireMovement[] = [];
  for (const u of TMS_DATA.units) {
    for (const p of u.positions) {
      if (p.serial === serial) out.push({ date: install, ch: u.ch, pos: p.pos, kind: "install" });
    }
  }
  for (const r of TMS_DATA.repl) {
    if (r.newSerial === serial) out.push({ date: r.date, ch: r.ch, pos: r.pos, kind: "mount" });
  }

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

  let ch = "", pos = "";
  let pd: TirePosition | undefined;
  for (const u of TMS_DATA.units) {
    const p = u.positions.find((x) => x.serial === serial || x.serial2 === serial);
    if (p) { ch = u.ch; pos = p.pos; pd = p; break; }
  }
  const unit = ch ? TMS_DATA.units.find((u) => u.ch === ch) ?? null : null;
  const isReplacement = !!pd && pd.serial2 === serial && pd.serial !== serial;
  const replForPos = ch ? TMS_DATA.repl.filter((r) => r.ch === ch && r.pos === pos) : [];
  const mountRepl = replForPos.find((r) => r.newSerial === serial) ?? null;
  const removeRepl = !isReplacement && replForPos.length
    ? replForPos.reduce((a, b) => (a.date < b.date ? a : b))
    : null;

  // 측정 회차 (해당 타이어 장착 구간만)
  let rounds: TireRound[] = [];
  if (unit) {
    const tr = (TMS_DATA.tread[ch] || {})[pos];
    if (tr) {
      let pts = tr.min
        .map((t, i) => ({
          date: (tr.dates[i] ?? unit.dates[i]) as string | null,
          tread: typeof t === "number" ? t : null,
          km: typeof unit.km[i] === "number" ? (unit.km[i] as number) : null,
          hm: typeof unit.hm[i] === "number" ? (unit.hm[i] as number) : null,
        }))
        .filter((p) => p.date) as TireRound[];
      pts.sort((a, b) => a.date.localeCompare(b.date));
      if (isReplacement && mountRepl) pts = pts.filter((p) => p.date >= mountRepl.date);
      else if (removeRepl) pts = pts.filter((p) => p.date < removeRepl.date);
      rounds = pts;
    }
  }

  const c = lifeCalc(serial);
  const norm = (s: string | null | undefined) => (!s || s === "-" ? null : s);
  return {
    serial,
    ch,
    pos,
    installDate: norm(life?.install),
    mountDate: mountRepl?.date ?? null,
    removeDate: removeRepl?.date ?? null,
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
  const alerts: { lv: "danger" | "warn"; text: string }[] = [];
  for (let p = 1; p <= 10; p++) {
    const d = headPosData(u, p);
    const st = statusOf(d, p);
    if (!d) continue;

    const scrap = d.serial
      ? TMS_DATA.life.find((l) => l.serial === d.serial && l.status === "Scrap")
      : null;

    if (scrap) {
      alerts.push({
        lv: "danger",
        text: `CH ${u.ch} · ${d.rp} (#${p}) 폐기 — ${codeName(scrap.damage)} / 수명 ${scrap.lifetime}시간`,
      });
    } else if (st === "danger" && d.latestTread != null && d.latestTread <= TREAD_DANGER) {
      alerts.push({
        lv: "danger",
        text: `CH ${u.ch} · ${d.rp} (#${p}) 트레드 ${d.latestTread}mm — 교체권장`,
      });
    } else if (st === "warn" && d.latestTread != null) {
      alerts.push({
        lv: "warn",
        text: `CH ${u.ch} · ${d.rp} (#${p}) 트레드 ${d.latestTread}mm — 마모 진행`,
      });
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
