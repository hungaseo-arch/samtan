// @section: round-validate
// 점검 회차 입력 검증 (지시서 2026-10-16 §A-8). 일괄 업로드와 화면 입력이 같은 함수를 쓴다.
//
// 순수 함수만 둔다 — 직전 회차·현재 시리얼은 호출부가 뽑아서 넘긴다.
// error 는 저장 차단, warn 은 사용자가 확인하면 저장된다.

/** 공기압 상한(psi). 0 이하·이 값 초과는 입력 오류 (지시서 §A-8 · CLAUDE.md 정상 범위 상한) */
export const PSI_INPUT_MAX = 200;
/** 직전 회차보다 트레드가 이만큼(mm) 넘게 늘면 경고 — 마모는 줄기만 한다 */
export const TREAD_RISE_WARN_MM = 1;

export type RoundIssueCode =
  | "km_back"         // KM 이 직전 회차보다 작다
  | "hm_back"         // HM 이 직전 회차보다 작다
  | "tread_rise"      // 트레드가 직전 회차보다 1 mm 초과 증가
  | "pressure_range"  // 공기압 0 이하 또는 200 초과
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
}

export interface RoundInput {
  hm: number | null;
  km: number | null;
  rows: RoundInputRow[];
}

/** 직전 회차 (점검일이 이번 회차보다 앞선 것 중 가장 늦은 것) */
export interface PrevRound {
  hm: number | null;
  km: number | null;
  /** 포지션 → 직전 측정 트레드·시리얼 */
  byPos: Record<string, { tread: number | null; serial: string | null }>;
}

export interface ValidateContext {
  prev: PrevRound | null;
  /** 포지션 → 그 점검일에 장착돼 있어야 할 시리얼. 알 수 없으면 키를 빼거나 null */
  expectedSerial: Record<string, string | null>;
  /** 계기 리셋 차량 — KM·HM 역행 경고를 끈다 */
  meterReset: boolean;
}

export function validateRound(input: RoundInput, ctx: ValidateContext): RoundIssue[] {
  const out: RoundIssue[] = [];
  const { prev } = ctx;

  if (prev && !ctx.meterReset) {
    if (input.km != null && prev.km != null && input.km < prev.km)
      out.push({ level: "warn", code: "km_back", ref: prev.km, value: input.km });
    if (input.hm != null && prev.hm != null && input.hm < prev.hm)
      out.push({ level: "warn", code: "hm_back", ref: prev.hm, value: input.hm });
  }

  for (const r of input.rows) {
    if (r.pressure != null && (r.pressure <= 0 || r.pressure > PSI_INPUT_MAX))
      out.push({ level: "error", code: "pressure_range", pos: r.pos, value: r.pressure });

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
