// @section: load-data
// Supabase에서 전체 데이터를 로드해 TMS_DATA를 in-place로 채운다.
// (참조 데이터: tire_config·vehicles·vehicle_positions·replacements·lifetimes·damage_codes,
//  측정 데이터: inspections → 회차별 dates/hm/km/공기압/트레드 재구성)
import { supabase } from "@/lib/supabase";
import { TMS_DATA, HEAD_MAP } from "./tmsData";
import type { Unit, LifeRecord, TirePosition } from "./tmsData";
import { listInspections, type InspectionRow } from "@/api/inspections";

// ============================================================
// 하중(축하중) 데이터 — Techking "Load Distribution Road Train unit" 시트 기준
// 하중 그룹: ① 그룹 1 = Head + 트레일러 1 (Payload 55t, 총 94t)
//            ② 그룹 2 = 돌리 + 트레일러 2 (Payload 65t, 총 96t)
// 정격(rated): 하중지수(LI) + 장착방식 기준
//   · Head 385/95R24 단독(single) 6,000 kg/본
//   · 트레일러·돌리 12.00R24 듀얼(dual) 4,500 kg/본 (단독 LI 162 = 4,750 → 듀얼 LI 160 = 4,500)
// ============================================================
export type Mount = "single" | "dual";

export interface LoadGroup {
  id: 1 | 2;
  name: string;       // 표시명
  payload: number;    // 적재 (kg)
}

export type LoadUnitKey = "headSteer" | "headDrive" | "trailer1" | "trailer2" | "dolly";

export interface LoadUnit {
  key: LoadUnitKey;    // 다국어 표시명 조회 키 (LoadTab에서 name·sub 번역)
  name: string;        // Head 조향축/구동축 / Trailer 1 / Trailer 2 / Dolly (기본=한국어)
  sub: string;         // 포지션·장착 설명
  spec: string;        // 타이어 규격
  count: number;       // 본수
  mount: Mount;        // 장착 방식 (단독/듀얼)
  ratedSingle: number; // 단독 정격 (kg/본)
  ratedDual: number;   // 듀얼 정격 (kg/본)
  unitWeight: number;  // 공차(Unit Weight, kg)
  group: 1 | 2;        // 소속 하중 그룹
  dist: number;        // 분배율 (axleOfHead=true → Head 하중 대비, 그 외 → 그룹 총중량 대비)
  axleOfHead?: boolean; // Head 축 분할 행 여부 (분배 기준중량 = Head 하중)
}

export const LOAD_GROUPS: LoadGroup[] = [
  { id: 1, name: "그룹 1 · Head + 트레일러 1", payload: 55000 },
  { id: 2, name: "그룹 2 · 돌리 + 트레일러 2",  payload: 65000 },
];

/** Head의 그룹 1 총중량 분배율 (나머지 50%는 트레일러 1). Head 하중 = 그룹1총중량 × 이 값 */
export const HEAD_GROUP_SHARE = 0.5;

export const LOAD_UNITS: LoadUnit[] = [
  { key: "headSteer", name: "Head Steering axis", sub: "L1·R1 · Single (Head 20%)",          spec: "385/95R24(14.00R24)", count: 2,  mount: "single", ratedSingle: 6000, ratedDual: 6000, unitWeight: 3200,  group: 1, dist: 0.20, axleOfHead: true },
  { key: "headDrive", name: "Head Driving axis", sub: "L2·L3·R2·R3 · Single (Head 80%)",     spec: "385/95R24(14.00R24)", count: 8,  mount: "single", ratedSingle: 6000, ratedDual: 6000, unitWeight: 12800, group: 1, dist: 0.80, axleOfHead: true },
  { key: "trailer1",  name: "Trailer 1",  sub: "Trailer 1",                         spec: "12.00R24",            count: 12, mount: "dual",   ratedSingle: 4750, ratedDual: 4500, unitWeight: 23000, group: 1, dist: 0.50 },
  { key: "trailer2",  name: "Trailer 2",  sub: "Trailer 2",                         spec: "12.00R24",            count: 12, mount: "dual",   ratedSingle: 4750, ratedDual: 4500, unitWeight: 25000, group: 2, dist: 0.50 },
  { key: "dolly",     name: "Dolly",      sub: "Dolly",                               spec: "12.00R24",            count: 12, mount: "dual",   ratedSingle: 4750, ratedDual: 4500, unitWeight: 6000,  group: 2, dist: 0.50 },
];

/** 그룹 총중량(kg) = 그룹 소속 유닛 공차 합 + 그룹 Payload */
export function groupTotal(id: 1 | 2): number {
  const g = LOAD_GROUPS.find((x) => x.id === id)!;
  const tare = LOAD_UNITS.filter((u) => u.group === id).reduce((s, u) => s + u.unitWeight, 0);
  return tare + g.payload;
}

/** Road Train 총중량(kg) */
export const LOAD_GROSS_KG = groupTotal(1) + groupTotal(2);

interface Round {
  date: string;
  hm: number | null;
  km: number | string | null;
  press: Record<string, number | "N/A" | null>;
  tread: Record<string, number | null>;
}

/** inspections 행으로 units의 회차 배열(dates/hm/km/press)과 tread를 재구성. */
function buildRounds(rows: InspectionRow[]) {
  const byCh = new Map<string, InspectionRow[]>();
  for (const r of rows) {
    if (!byCh.has(r.ch)) byCh.set(r.ch, []);
    byCh.get(r.ch)!.push(r);
  }

  TMS_DATA.tread = {};
  TMS_DATA.units.forEach((unit) => {
    const rounds = new Map<string, Round>();
    for (const r of byCh.get(unit.ch) || []) {
      let round = rounds.get(r.inspection_date);
      if (!round) {
        round = { date: r.inspection_date, hm: null, km: null, press: {}, tread: {} };
        rounds.set(r.inspection_date, round);
      }
      if (r.hm != null) round.hm = r.hm;
      if (r.km != null) round.km = r.km;
      if (r.pressure != null) round.press[r.pos] = r.pressure;
      if (r.tread != null) round.tread[r.pos] = r.tread;
    }

    const sorted = [...rounds.values()].sort((a, b) => a.date.localeCompare(b.date));
    unit.dates = sorted.map((r) => r.date);
    unit.hm = sorted.map((r) => r.hm);
    unit.km = sorted.map((r) => r.km);

    TMS_DATA.tread[unit.ch] = {};
    for (let p = 1; p <= 10; p++) {
      const rp = HEAD_MAP[p];
      const pd = unit.positions.find((x) => x.pos === rp);
      if (pd) pd.press = sorted.map((r) => r.press[rp] ?? null);
      TMS_DATA.tread[unit.ch][rp] = {
        dates: sorted.map((r) => r.date),
        min: sorted.map((r) => r.tread[rp] ?? null),
      };
    }
  });
}

/** 전체 데이터 로드 → TMS_DATA 갱신. 실패 시 throw. */
export async function loadData(): Promise<void> {
  const [cfg, veh, pos, repl, life, codes, insp] = await Promise.all([
    supabase.from("tire_config").select("*").eq("id", 1).maybeSingle(),
    supabase.from("vehicles").select("*").order("seq", { ascending: true }),
    supabase.from("vehicle_positions").select("*").order("seq", { ascending: true }),
    supabase.from("replacements").select("*"),
    supabase.from("lifetimes").select("*").order("no", { ascending: true }),
    supabase.from("damage_codes").select("*").order("seq", { ascending: true }),
    listInspections(),
  ]);

  for (const r of [cfg, veh, pos, repl, life, codes]) {
    if (r.error) throw r.error;
  }

  // tire
  if (cfg.data) {
    TMS_DATA.tire = {
      brand: cfg.data.brand,
      type: cfg.data.type,
      size: cfg.data.size,
      tubetype: cfg.data.tubetype,
      newTread: cfg.data.new_tread,
      capacity: cfg.data.capacity,
    };
  }

  // codes
  const codeMap: Record<string, string> = {};
  (codes.data ?? []).forEach((r) => { codeMap[r.code] = r.description; });
  TMS_DATA.codes = codeMap;

  // repl
  TMS_DATA.repl = (repl.data ?? []).map((r) => ({
    ch: r.ch, pos: r.pos, date: r.date, newSerial: r.new_serial ?? "",
  }));

  // life
  TMS_DATA.life = (life.data ?? []).map((r): LifeRecord => ({
    no: r.no,
    serial: r.serial,
    scrap: r.scrap ?? "-",
    damage: r.damage ?? null,
    install: r.install ?? null,
    lifetime: r.lifetime ?? "-",
    status: r.status,
    note: r.note ?? null,
  }));

  // summary (life 상태별 집계)
  const summary: Record<string, number> = {};
  TMS_DATA.life.forEach((l) => { summary[l.status] = (summary[l.status] ?? 0) + 1; });
  TMS_DATA.summary = summary;

  // units + positions
  const posByCh = new Map<string, typeof pos.data>();
  (pos.data ?? []).forEach((p) => {
    if (!posByCh.has(p.ch)) posByCh.set(p.ch, []);
    posByCh.get(p.ch)!.push(p);
  });
  TMS_DATA.units = (veh.data ?? []).map((v): Unit => ({
    ch: v.ch,
    dates: [],
    hm: [],
    km: [],
    hmReset: !!v.hm_reset,
    positions: (posByCh.get(v.ch) ?? []).map((p): TirePosition => ({
      pos: p.pos,
      serial: p.serial ?? "",
      serial2: p.serial2 ?? undefined,
      remark: p.remark ?? null,
      press: [],
    })),
  }));

  // 측정 회차 반영
  buildRounds(insp);
}
