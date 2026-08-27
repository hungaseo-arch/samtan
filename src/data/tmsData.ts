// ============================================================
// @section: tms-data
// Samtan TMS – TECHKING ETCRANE 14.00R24 Road Train
// ※ 데이터는 Supabase에서 로드합니다 (src/data/loadData.ts).
//   이 파일은 타입·상수와 런타임에 채워지는 빈 TMS_DATA 컨테이너만 정의합니다.
// ============================================================

// ── 임계치·권장 공기압 ──────────────────────────────────────
// 정본은 DB(tire_config)입니다. 아래 상수는 loadData() 이전이나 DB 미설정 시의
// 폴백일 뿐이며, 판정에는 반드시 아래 접근자(treadLevel·recPsi)를 사용하십시오.
export const NEW_TREAD = 22;
const FALLBACK_TREAD_CAUTION = 10;
const FALLBACK_TREAD_ORDER = 5;
const FALLBACK_TREAD_CRITICAL = 3;
const FALLBACK_PSI_STEER = 100;
const FALLBACK_PSI_DRIVE = 116;
// 편마모 판정 경계 — 정본은 tire_config(sc_ratio_upper/lower·wear_min_mm).
// 0.870 = 1 ÷ 1.150 대칭이고, 0.5 mm 는 측정오차 한계라 그 미만은 판정 보류다.
const FALLBACK_SC_UPPER = 1.15;
const FALLBACK_SC_LOWER = 0.87;
const FALLBACK_WEAR_MIN = 0.5;

/** 트레드 4단계 신호등. 녹색 ≥10 / 황색 5~10 / 주황 3~5 / 적색 <3 (기본값 기준) */
export type TreadLevel = "ok" | "warn" | "order" | "danger";

export const HEAD_MAP: Record<number, string> = {
  1: "L1", 2: "R1",
  3: "L2 Out", 4: "L2 In",
  5: "R2 In", 6: "R2 Out",
  7: "L3 Out", 8: "L3 In",
  9: "R3 In", 10: "R3 Out",
};

/** 조향축 = L1·R1(포지션 1·2), 나머지 8본 = 구동축 */
export function isSteerPos(pos: number) {
  return pos === 1 || pos === 2;
}

/** 포지션별 권장 공기압(psi). tire_config 값을 사용하고 미설정 시 폴백. */
export function recPsi(pos: number): number {
  const t = TMS_DATA.tire;
  return isSteerPos(pos)
    ? (t.recPsiSteer ?? FALLBACK_PSI_STEER)
    : (t.recPsiDrive ?? FALLBACK_PSI_DRIVE);
}

/** 현재 적용 중인 트레드 경계값(mm). tire_config 값을 사용하고 미설정 시 폴백. */
export function treadThresholds() {
  const t = TMS_DATA.tire;
  return {
    caution: t.treadCaution ?? FALLBACK_TREAD_CAUTION,
    order: t.treadOrder ?? FALLBACK_TREAD_ORDER,
    critical: t.treadCritical ?? FALLBACK_TREAD_CRITICAL,
  };
}

/**
 * 편마모(S/C · O/I) 판정 경계. tire_config 값을 쓰고 미설정 시 폴백.
 * DB 뷰 v_wear_pattern 과 같은 값을 봐야 화면 미리보기와 저장 결과가 어긋나지 않는다.
 */
export function wearPatternThresholds() {
  const t = TMS_DATA.tire;
  return {
    upper: t.scRatioUpper ?? FALLBACK_SC_UPPER,
    lower: t.scRatioLower ?? FALLBACK_SC_LOWER,
    wearMin: t.wearMinMm ?? FALLBACK_WEAR_MIN,
  };
}

/**
 * 트레드(mm) → 4단계 신호등.
 * 경계는 "미만"으로 판정합니다 — 정확히 5.00 mm 는 주황이 아니라 황색입니다.
 * (5 mm = 발주 트리거이므로, 5 mm를 밑도는 순간 발주 단계로 넘어갑니다.)
 */
export function treadLevel(tread: number): TreadLevel {
  const { caution, order, critical } = treadThresholds();
  if (tread < critical) return "danger";
  if (tread < order) return "order";
  if (tread < caution) return "warn";
  return "ok";
}

// ── Types ──────────────────────────────────────────────────
/**
 * 포지션 시리얼 이력 한 칸 — DB 뷰 v_position_history 의 1행.
 * 과거 vehicle_positions 의 serial/serial2 2칸 구조를 대체하며 개수 제한이 없다.
 */
export interface SerialChainEntry {
  /** 0 = 최초 장착, 1..n = 교체 회차 */
  seqNo: number;
  serial: string;
  /** 장착일(YYYY-MM-DD). 최초 장착은 원장에 일자가 없어 null */
  mountedAt: string | null;
  source: "initial" | "replacement";
}

export interface TirePosition {
  pos: string;
  /** 현재 장착 시리얼 — v_current_tire.serial (단일 진실원) */
  serial: string;
  /** 최초 장착 시리얼 — v_current_tire.serial_initial */
  serialInitial: string;
  /** 이 포지션의 교체 횟수 — v_current_tire.repl_count. 0 = 최초 타이어 그대로 */
  replCount: number;
  /** 현재 타이어의 장착일 — v_current_tire.mounted_at. 최초 타이어면 null */
  mountedAt: string | null;
  /** 시리얼 이력 전체 — v_position_history. 길이 = replCount + 1 */
  chain: SerialChainEntry[];
  remark?: string | null;
  press: (number | "N/A" | null)[];
}

export interface TreadData {
  dates: (string | null)[];
  min: (number | null)[];
}

/**
 * 한 포지션에 특정 시리얼이 장착돼 있던 연속 측정 구간.
 *
 * 경계는 inspections.serial 의 변화로만 판정한다. 트레드가 올라간 것을 교체 근거로
 * 삼지 않는다 — 측정 오차·재기입으로도 올라가므로 교체와 구분되지 않는다.
 * (작업지시서 v2 §A-1)
 */
export interface TreadSegment {
  ch: string;
  pos: string;
  /** 0 = 최초 구간, 1..n = 시리얼이 바뀐 순번 */
  segNo: number;
  serial: string;
  /** 회차 인덱스 범위 [idxFrom, idxTo] — 양끝 포함. Unit.dates 기준 */
  idxFrom: number;
  idxTo: number;
  /**
   * 회차별 트레드. 길이는 그 차량의 전체 회차 수와 같다.
   *  undefined = 이 구간의 회차가 아님 → 표에서 **빈칸** (0 도 − 도 아니다)
   *  null      = 이 구간의 회차이지만 측정값 없음 → 표에서 −
   */
  tread: (number | null | undefined)[];
  /**
   * 회차별 4점 평균. 빈칸/미측정 구분은 tread 와 같다.
   * tread 가 4점 **최소값**이라 중앙 그루브만 닳은 타이어는 0 으로 보인다.
   * 숄더가 얼마나 남았는지는 이 값이라야 보인다 — 판정 기준은 아니고 병기용이다.
   * 원시값이 없던 회차는 백필 전이라도 null 이 들어온다(2026-08-27 이후로는 전 회차 존재).
   */
  treadAvg: (number | null | undefined)[];
  /** 회차별 공기압. 빈칸/미측정 구분은 tread 와 같다. */
  press: (number | "N/A" | null | undefined)[];
  /** 이 구간이 교체로 시작됐다면 그 교체일(replacements 매칭). 최초 구간은 null */
  replacedAt: string | null;
  /** 이 포지션의 마지막 구간 = 현재 장착 중 */
  isCurrent: boolean;
}

export interface Unit {
  ch: string;
  dates: (string | null)[];
  hm: (number | null)[];
  km: (number | string | null)[];
  positions: TirePosition[];
  hmReset?: boolean;
}

export interface ReplRecord {
  ch: string;
  pos: string;
  date: string;
  newSerial: string;
}

export interface LifeRecord {
  no: number;
  serial: string;
  scrap: string;
  damage: string | null;
  install: string | null;
  lifetime: number | string | null;
  status: "Install" | "Scrap" | "Spare" | "Not Install";
  note: string | null;
}

export interface TireConfig {
  brand: string;
  type: string;
  size: string;
  tubetype: string;
  newTread: number;
  capacity: number;
  // tire_config 로 이관된 운영 기준값. DB 미설정 시 null → 접근자가 폴백을 씁니다.
  treadCaution: number | null;
  treadOrder: number | null;
  treadCritical: number | null;
  recPsiSteer: number | null;
  recPsiDrive: number | null;
  scRatioUpper: number | null;
  scRatioLower: number | null;
  wearMinMm: number | null;
}

export interface TmsData {
  tire: TireConfig;
  units: Unit[];
  tread: Record<string, Record<string, TreadData>>;
  /**
   * 시리얼 단위 측정 구간 — segments[ch][pos] = 시간순 구간 배열.
   * tread[ch][pos] 는 (ch,pos) 로만 묶여 있어 교체 전후 타이어가 한 줄에 섞인다.
   * 추이 화면·마모율은 반드시 이쪽을 쓴다.
   */
  segments: Record<string, Record<string, TreadSegment[]>>;
  repl: ReplRecord[];
  life: LifeRecord[];
  codes: Record<string, string>;
  summary: Record<string, number>;
}

// ── 런타임 컨테이너 ─────────────────────────────────────────
// loadData()가 Supabase에서 데이터를 받아 이 객체를 in-place로 채웁니다.
// 컴포넌트/유틸은 이 객체(및 중첩 배열)를 그대로 참조합니다.
export const TMS_DATA: TmsData = {
  tire: {
    brand: "TECHKING", type: "ETCRANE", size: "14.00R24", tubetype: "Tube Type",
    newTread: NEW_TREAD, capacity: 6000,
    treadCaution: null, treadOrder: null, treadCritical: null,
    recPsiSteer: null, recPsiDrive: null,
    scRatioUpper: null, scRatioLower: null, wearMinMm: null,
  },
  units: [],
  tread: {},
  segments: {},
  repl: [],
  life: [],
  codes: {},
  summary: {},
};
