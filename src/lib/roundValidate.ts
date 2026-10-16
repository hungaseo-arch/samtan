// @section: round-validate
// 점검 회차 입력 검증 (지시서 2026-10-16 §A-8). 일괄 업로드와 화면 입력이 같은 함수를 쓴다.
//
// 순수 함수만 둔다 — 직전 회차·현재 시리얼은 호출부가 뽑아서 넘긴다.
// error 는 저장 차단, warn 은 사용자가 확인하면 저장된다.

/** 공기압 입력 범위(psi). 밖이면 저장 차단 — 사용자 결정 2026-10-16 (decisions W-3) */
export const PSI_INPUT_MIN = 50;
export const PSI_INPUT_MAX = 150;
/** 권장 공기압 대비 이 비율을 넘게 벗어나면 확인 후 저장 (W-3) */
export const PSI_DEV_WARN_RATIO = 0.15;
/** 트레드 측정점 입력 범위(mm)·자리수 — 신품 22 mm + 측정 여유 1 mm (W-4) */
export const TREAD_INPUT_MAX = 23;
export const TREAD_INPUT_DECIMALS = 1;
/** 직전 회차보다 트레드가 이만큼(mm) 넘게 늘면 경고 — 마모는 줄기만 한다 */
export const TREAD_RISE_WARN_MM = 1;

export type RoundIssueCode =
  | "km_back"         // KM 이 직전 회차보다 작다
  | "hm_back"         // HM 이 직전 회차보다 작다
  | "tread_rise"      // 트레드가 직전 회차보다 1 mm 초과 증가
  | "pressure_range"  // 공기압 50 미만 또는 150 초과
  | "pressure_dev"    // 권장 공기압 ±15% 밖
  | "tread_range"     // 측정점이 0 미만 또는 23 mm 초과
  | "tread_precision" // 측정점 소수 2자리 이상
  | "future_date"     // 점검일이 오늘(현장 WITA)보다 뒤
  | "backdated"       // 새 회차인데 점검일이 이 차량 최근 회차보다 앞 (INP-03)
  | "serial_mismatch"; // 장착 시리얼과 다름 — 교체 미등록

export interface RoundIssue {
  level: "error" | "warn";
  code: RoundIssueCode;
  pos?: string;
  /** 비교 기준값 (직전 값·장착 시리얼 등) */
  ref?: string | number;
  /** 입력값 */
  value?: string | number;
}

export interface RoundInputRow {
  pos: string;
  serial: string | null;
  pressure: number | null;
  /** 4점 최소값 (mm). 트레드 미입력이면 null */
  tread: number | null;
  /** 4점 원시값 — 범위·자리수 검사용. 없으면 검사 생략 */
  points?: (number | null)[];
  /** 이 포지션의 권장 공기압 — 편차 경고용. 없으면 검사 생략 */
  recPsi?: number | null;
}

export interface RoundInput {
  /** 점검일 YYYY-MM-DD — ctx.today 와 같이 주면 미래 날짜를 막는다 */
  date?: string;
  hm: number | null;
  km: number | null;
  rows: RoundInputRow[];
}

/** 직전 회차 (점검일이 이번 회차보다 앞선 것 중 가장 늦은 것) */
export interface PrevRound {
  hm: number | null;
  km: number | null;
  /** hm·km 을 읽은 회차의 점검일 */
  meterDate?: string;
  /** 포지션 → 직전 측정 트레드·시리얼 */
  byPos: Record<string, { tread: number | null; serial: string | null }>;
}

export interface ValidateContext {
  prev: PrevRound | null;
  /** 포지션 → 그 점검일에 장착돼 있어야 할 시리얼. 알 수 없으면 키를 빼거나 null */
  expectedSerial: Record<string, string | null>;
  /** 계기 리셋 차량 — KM·HM 역행 경고를 끈다 */
  meterReset: boolean;
  /** 오늘(현장 WITA, todayInField()). 없으면 미래 날짜 검사 생략 */
  today?: string;
  /**
   * 이 차량의 최근 회차 점검일. 입력 날짜가 이미 있는 회차(수정)면 비운다.
   * 새 회차가 이보다 앞이면 날짜 오타일 가능성이 커 경고한다 (INP-03).
   */
  latestDate?: string;
  /**
   * 소수 2자리 이상 측정점의 수준. 화면 입력은 error(기본).
   * 일괄 업로드는 기존 현장 기록지가 소수 2자리라 warn 으로 낮춘다.
   */
  precisionLevel?: "error" | "warn";
}

/** 소수 n 자리 이내인가 — 부동소수 오차(0.1+0.2)를 흡수한다 */
function withinDecimals(v: number, n: number): boolean {
  const k = 10 ** n;
  return Math.abs(Math.round(v * k) - v * k) < 1e-6;
}

export function validateRound(input: RoundInput, ctx: ValidateContext): RoundIssue[] {
  const out: RoundIssue[] = [];
  const { prev } = ctx;

  if (input.date && ctx.today && input.date > ctx.today)
    out.push({ level: "error", code: "future_date", ref: ctx.today, value: input.date });
  else if (input.date && ctx.latestDate && input.date < ctx.latestDate)
    out.push({ level: "warn", code: "backdated", ref: ctx.latestDate, value: input.date });

  if (prev && !ctx.meterReset) {
    if (input.km != null && prev.km != null && input.km < prev.km)
      out.push({ level: "warn", code: "km_back", ref: prev.km, value: input.km });
    if (input.hm != null && prev.hm != null && input.hm < prev.hm)
      out.push({ level: "warn", code: "hm_back", ref: prev.hm, value: input.hm });
  }

  for (const r of input.rows) {
    if (r.pressure != null && (r.pressure < PSI_INPUT_MIN || r.pressure > PSI_INPUT_MAX))
      out.push({ level: "error", code: "pressure_range", pos: r.pos, value: r.pressure });
    else if (r.pressure != null && r.recPsi && Math.abs(r.pressure - r.recPsi) / r.recPsi > PSI_DEV_WARN_RATIO)
      out.push({ level: "warn", code: "pressure_dev", pos: r.pos, ref: r.recPsi, value: r.pressure });

    const pts = (r.points ?? []).filter((v): v is number => v != null && Number.isFinite(v));
    const outOfRange = pts.find((v) => v < 0 || v > TREAD_INPUT_MAX);
    if (outOfRange != null)
      out.push({ level: "error", code: "tread_range", pos: r.pos, value: outOfRange });
    const tooFine = pts.find((v) => !withinDecimals(v, TREAD_INPUT_DECIMALS));
    if (tooFine != null)
      out.push({ level: ctx.precisionLevel ?? "error", code: "tread_precision", pos: r.pos, value: tooFine });

    const exp = ctx.expectedSerial[r.pos];
    const serial = r.serial?.trim() || null;
    const mismatch = !!(exp && serial && serial !== exp);
    if (mismatch) out.push({ level: "warn", code: "serial_mismatch", pos: r.pos, ref: exp, value: serial });

    // 다른 타이어로 바뀌었으면 트레드가 느는 게 당연하다 — 같은 타이어끼리만 비교한다.
    const p = prev?.byPos[r.pos];
    const sameTire = !mismatch && (!p?.serial || !serial || p.serial === serial);
    if (sameTire && r.tread != null && p?.tread != null && r.tread - p.tread > TREAD_RISE_WARN_MM)
      out.push({ level: "warn", code: "tread_rise", pos: r.pos, ref: p.tread, value: r.tread });
  }
  return out;
}

export const hasError = (xs: RoundIssue[]) => xs.some((x) => x.level === "error");
