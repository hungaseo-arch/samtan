// @section: bulk-inspection
// 점검 엑셀 일괄 업로드 — 시트 행 → 회차 묶음 (지시서 2026-10-16 §A-8).
//
// 시트는 「한 행 = 한 포지션」 세로형이다. (CH, DATE) 가 같은 행이 한 회차로 묶인다.
// 열 이름은 언어와 무관한 고정 코드다 — 현장이 id 화면에서 받은 양식을 ko 화면에서 올려도 된다.
// 여기서는 형식 검증만 한다. 직전 회차 비교는 validateRound() 몫이다.
import type { InspectionPointsRow, TreadStatus } from "@/api/inspections";

export const BULK_COLUMNS = [
  "CH", "DATE", "HM", "KM", "DRIVER", "POS", "SERIAL", "PSI",
  "KIRI", "TENGAH1", "TENGAH2", "KANAN", "ZERO_STATUS", "REMARK",
] as const;
export type BulkColumn = (typeof BULK_COLUMNS)[number];

/** 트레드 0 mm 가 들어간 행에 필요한 상태 — 화면 입력의 0 mm 확인 모달과 같은 세 갈래 */
export const ZERO_STATUSES = ["worn_out", "not_measured", "scrapped"] as const;
type ZeroStatus = (typeof ZERO_STATUSES)[number];

export type BulkErrorCode =
  | "unknown_ch"       // 등록되지 않은 차량
  | "bad_date"         // 날짜 형식 오류
  | "future_date"      // 오늘(현장) 이후
  | "bad_pos"          // 포지션 코드 오류
  | "dup_pos"          // 같은 회차에 같은 포지션 두 번
  | "bad_number"       // 숫자 칸에 숫자가 아님
  | "partial_points"   // 트레드 4칸 중 일부만
  | "zero_status"      // 0 mm 인데 ZERO_STATUS 없음/오류
  | "meta_conflict";   // 같은 회차 행끼리 HM·KM·운전자가 다름

export interface BulkError {
  code: BulkErrorCode;
  /** 엑셀 행 번호 (머리글 = 1행) */
  line?: number;
  detail?: string;
}

export interface BulkRow {
  line: number;
  pos: string;
  serial: string | null;
  pressure: number | null;
  /** KIRI·TENGAH1·TENGAH2·KANAN 4점. 전부 비었으면 null */
  points: { L: number; C1: number; C2: number; R: number } | null;
  zeroStatus: ZeroStatus | null;
  remark: string | null;
}

export interface BulkRound {
  ch: string;
  date: string;
  hm: number | null;
  km: number | null;
  driver: string | null;
  rows: BulkRow[];
  errors: BulkError[];
}

/** 4점 최소값 — validateRound 의 트레드 비교용 */
export const minTread = (r: BulkRow): number | null =>
  r.points ? Math.min(r.points.L, r.points.C1, r.points.C2, r.points.R) : null;

/** 머리글 정규화: 대소문자·공백·밑줄 무시 */
const normKey = (k: string) => k.toUpperCase().replace(/[\s_]/g, "");
const KEY_OF: Record<string, BulkColumn> = Object.fromEntries(BULK_COLUMNS.map((c) => [normKey(c), c]));

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** 숫자 칸: 빈칸·N/A → null, 숫자 아님 → NaN. 천단위 콤마는 허용 */
function cellNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = cellStr(v).replace(/,/g, "");
  if (s === "" || /^n\/?a$/i.test(s) || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** 엑셀 날짜: 직렬값(1900 체계) 또는 YYYY-MM-DD / YYYY/MM/DD 문자열 → YYYY-MM-DD. 실패 시 null */
export function excelDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    // 1899-12-30 기준 — 1900 윤년 버그를 엑셀과 같이 흡수한다. UTC 로만 계산해 타임존이 끼지 않는다.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(cellStr(v));
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * 시트 행(sheet_to_json 결과) → 회차 묶음.
 * @param sheet     머리글을 키로 한 행 배열 (2행부터)
 * @param units     등록 차량 CH 목록
 * @param positions 포지션 코드 (HEAD_MAP 값)
 * @param today     현장 오늘 — 이후 날짜는 오류
 */
export function parseBulkSheet(
  sheet: Record<string, unknown>[],
  units: string[],
  positions: string[],
  today: string,
): { rounds: BulkRound[]; orphanErrors: BulkError[] } {
  const posOf = new Map(positions.map((p) => [p.toUpperCase().replace(/\s+/g, ""), p]));
  const unitSet = new Set(units);
  const rounds = new Map<string, BulkRound>();
  const orphanErrors: BulkError[] = [];

  sheet.forEach((raw, i) => {
    const line = i + 2;
    const r: Partial<Record<BulkColumn, unknown>> = {};
    for (const [k, v] of Object.entries(raw)) {
      const col = KEY_OF[normKey(k)];
      if (col) r[col] = v;
    }
    // 측정값이 하나도 없는 행은 양식의 빈 줄이다 — 조용히 건너뛴다.
    const measured = (["PSI", "KIRI", "TENGAH1", "TENGAH2", "KANAN"] as const).some((c) => cellStr(r[c]) !== "");
    if (!measured) return;

    const ch = cellStr(r.CH).replace(/^CH\s*/i, "");
    const date = excelDate(r.DATE);
    if (!ch || !unitSet.has(ch)) { orphanErrors.push({ code: "unknown_ch", line, detail: ch }); return; }
    if (!date) { orphanErrors.push({ code: "bad_date", line, detail: cellStr(r.DATE) }); return; }

    const key = `${ch}|${date}`;
    let rd = rounds.get(key);
    if (!rd) {
      rd = { ch, date, hm: null, km: null, driver: null, rows: [], errors: [] };
      if (date > today) rd.errors.push({ code: "future_date", detail: date });
      rounds.set(key, rd);
    }

    // 회차 메타 — 첫 값으로 정하고, 다른 값이 나오면 오류
    const hm = cellNum(r.HM), km = cellNum(r.KM), driver = cellStr(r.DRIVER) || null;
    for (const [name, v] of [["HM", hm], ["KM", km]] as const) {
      if (v == null) continue;
      if (Number.isNaN(v) || v < 0) { rd.errors.push({ code: "bad_number", line, detail: name }); continue; }
      const cur = name === "HM" ? rd.hm : rd.km;
      if (cur == null) { if (name === "HM") rd.hm = v; else rd.km = v; }
      else if (cur !== v) rd.errors.push({ code: "meta_conflict", line, detail: name });
    }
    if (driver) {
      if (rd.driver == null) rd.driver = driver;
      else if (rd.driver !== driver) rd.errors.push({ code: "meta_conflict", line, detail: "DRIVER" });
    }

    const pos = posOf.get(cellStr(r.POS).toUpperCase().replace(/\s+/g, ""));
    if (!pos) { rd.errors.push({ code: "bad_pos", line, detail: cellStr(r.POS) }); return; }
    if (rd.rows.some((x) => x.pos === pos)) { rd.errors.push({ code: "dup_pos", line, detail: pos }); return; }

    const psi = cellNum(r.PSI);
    if (psi != null && Number.isNaN(psi)) rd.errors.push({ code: "bad_number", line, detail: "PSI" });

    const pv = (["KIRI", "TENGAH1", "TENGAH2", "KANAN"] as const).map((c) => cellNum(r[c]));
    let points: BulkRow["points"] = null;
    const filled = pv.filter((v) => v != null);
    if (filled.some((v) => Number.isNaN(v) || (v as number) < 0)) {
      rd.errors.push({ code: "bad_number", line, detail: "KIRI~KANAN" });
    } else if (filled.length > 0 && filled.length < 4) {
      rd.errors.push({ code: "partial_points", line, detail: pos });
    } else if (filled.length === 4) {
      const [L, C1, C2, R] = pv as number[];
      points = { L, C1, C2, R };
    }

    const zsRaw = cellStr(r.ZERO_STATUS).toLowerCase();
    const zeroStatus = (ZERO_STATUSES as readonly string[]).includes(zsRaw) ? (zsRaw as ZeroStatus) : null;
    if (points && Math.min(points.L, points.C1, points.C2, points.R) === 0 && !zeroStatus)
      rd.errors.push({ code: "zero_status", line, detail: pos });

    rd.rows.push({
      line, pos,
      serial: cellStr(r.SERIAL) || null,
      pressure: psi != null && !Number.isNaN(psi) ? psi : null,
      points, zeroStatus,
      remark: cellStr(r.REMARK) || null,
    });
  });

  const order = new Map(positions.map((p, i) => [p, i]));
  const out = [...rounds.values()].sort((a, b) => a.ch.localeCompare(b.ch) || a.date.localeCompare(b.date));
  for (const rd of out) rd.rows.sort((a, b) => (order.get(a.pos) ?? 0) - (order.get(b.pos) ?? 0));
  return { rounds: out, orphanErrors };
}

/** 회차 → save_inspection_round_with_points 행. 규칙은 화면 입력 buildRows() 와 같다 */
export function toPointsRows(rd: BulkRound): InspectionPointsRow[] {
  return rd.rows.map((r): InspectionPointsRow => {
    const min = minTread(r);
    const isZero = min === 0;
    const status: TreadStatus = !r.points ? "not_measured" : isZero ? (r.zeroStatus ?? "not_measured") : "measured";
    const dropPoints = !r.points || (isZero && status === "not_measured");
    return {
      pos: r.pos,
      serial: r.serial,
      pressure: r.pressure,
      tread_status: status,
      flag: "OK",
      flag_note: null,
      remark: r.remark,
      points: dropPoints || !r.points
        ? []
        : (["L", "C1", "C2", "R"] as const).map((w) => ({ circ: "P1" as const, width: w, depth: r.points![w] })),
    };
  });
}
