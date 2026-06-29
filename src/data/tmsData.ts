// ============================================================
// @section: tms-data
// Samtan TMS – TECHKING ETCRANE 385/95R24(14.00R24) Road Train
// ※ 데이터는 Supabase에서 로드합니다 (src/data/loadData.ts).
//   이 파일은 타입·상수와 런타임에 채워지는 빈 TMS_DATA 컨테이너만 정의합니다.
// ============================================================

export const TREAD_WARN = 8;
export const TREAD_DANGER = 5;
export const NEW_TREAD = 22;

export const HEAD_MAP: Record<number, string> = {
  1: "L1", 2: "R1",
  3: "L2 Out", 4: "L2 In",
  5: "R2 In", 6: "R2 Out",
  7: "L3 Out", 8: "L3 In",
  9: "R3 In", 10: "R3 Out",
};

export function recPsi(pos: number) {
  return pos === 1 || pos === 2 ? 100 : 116;
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

export interface TmsData {
  tire: { brand: string; type: string; size: string; tubetype: string; newTread: number; capacity: number };
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
  tire: { brand: "TECHKING", type: "ETCRANE", size: "385/95R24(14.00R24)", tubetype: "Tube Type", newTread: NEW_TREAD, capacity: 6000 },
  units: [],
  tread: {},
  repl: [],
  life: [],
  codes: {},
  summary: {},
};
