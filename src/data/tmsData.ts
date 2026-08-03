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
export interface TirePosition {
  pos: string;
  serial: string;
  serial2?: string;
  remark?: string | null;
  press: (number | "N/A" | null)[];
}

export interface TreadData {
  dates: (string | null)[];
  min: (number | null)[];
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
}

export interface TmsData {
  tire: TireConfig;
  units: Unit[];
  tread: Record<string, Record<string, TreadData>>;
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
  },
  units: [],
  tread: {},
  repl: [],
  life: [],
  codes: {},
  summary: {},
};
