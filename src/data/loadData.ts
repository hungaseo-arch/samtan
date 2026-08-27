// @section: load-data
// Supabase에서 전체 데이터를 로드해 TMS_DATA를 in-place로 채운다.
// (참조 데이터: tire_config·vehicles·vehicle_positions·replacements·lifetimes·damage_codes,
//  측정 데이터: inspections → 회차별 dates/hm/km/공기압/트레드 재구성)
import { supabase } from "@/lib/supabase";
import { TMS_DATA, HEAD_MAP } from "./tmsData";
import type { Unit, LifeRecord, TirePosition, SerialChainEntry, TreadSegment, TreadWidths } from "./tmsData";
import { listInspections, type InspectionRow } from "@/api/inspections";

// ============================================================
// 하중(축하중) 데이터 — Techking "Load Distribution Road Train unit" 시트 기준
// 하중 그룹: ① 그룹 1 = Head + 트레일러 1 (Payload 55t, 총 94t) — 분배 Head 50% / 트레일러1 50%
//            ② 그룹 2 = 돌리 + 트레일러 2 (Payload 65t, 총 96t) — 분배 50% / 50%
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

/** Head의 그룹 1 총중량 분배율 (나머지 50%는 트레일러 1). Head 하중 = 그룹1총중량 × 이 값
 *  근거: 고객 하중분배 시트(Load Distribution Road Train) — 그룹1 Head 50% / 트레일러1 50%. */
export const HEAD_GROUP_SHARE = 0.5;

export const LOAD_UNITS: LoadUnit[] = [
  { key: "headSteer", name: "Head Steering axis", sub: "L1·R1 · Single (Head 20%)",          spec: "14.00R24", count: 2,  mount: "single", ratedSingle: 6000, ratedDual: 6000, unitWeight: 3200,  group: 1, dist: 0.20, axleOfHead: true },
  { key: "headDrive", name: "Head Driving axis", sub: "L2·L3·R2·R3 · Dual (Head 80%)",       spec: "14.00R24", count: 8,  mount: "dual",   ratedSingle: 6000, ratedDual: 6000, unitWeight: 12800, group: 1, dist: 0.80, axleOfHead: true },
  { key: "trailer1",  name: "Trailer 1",  sub: "Trailer 1",                         spec: "12.00R24", count: 12, mount: "dual",   ratedSingle: 4750, ratedDual: 4500, unitWeight: 23000, group: 1, dist: 0.50 },
  { key: "dolly",     name: "Dolly",      sub: "Dolly",                               spec: "12.00R24", count: 12, mount: "dual",   ratedSingle: 4750, ratedDual: 4500, unitWeight: 6000,  group: 2, dist: 0.50 },
  { key: "trailer2",  name: "Trailer 2",  sub: "Trailer 2",                         spec: "12.00R24", count: 12, mount: "dual",   ratedSingle: 4750, ratedDual: 4500, unitWeight: 25000, group: 2, dist: 0.50 },
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
  /** 4점 평균 — 표시용 병기값. 판정은 언제나 tread(최소값)로 한다. */
  treadAvg: Record<string, number | null>;
  /** 폭 4점 원시값 — 히스토리 모달이 회차마다 그대로 보여준다. */
  widths: Record<string, TreadWidths | null>;
  /** 그 회차에 그 포지션에 달려 있던 시리얼 — 구간 분리의 유일한 근거 */
  serial: Record<string, string | null>;
  /** 그 회차에 행이 존재한 포지션. 값이 전부 null 인 행과 '행 없음'을 구분한다. */
  seen: Set<string>;
}

/** 빈 문자열은 '시리얼 없음'으로 본다. DB 의 null 과 같게 취급. */
function normSerial(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v ? v : null;
}

/**
 * 한 포지션의 회차열을 시리얼이 바뀌는 지점에서 잘라 구간 배열로 만든다.
 *
 * 판정은 DB 쪽 검증 쿼리와 같은 규칙이다 —
 *   is_break = (직전 회차의 시리얼이 있다) AND (지금 시리얼과 다르다)
 * SQL 의 `lag(serial) is not null AND serial IS DISTINCT FROM lag(serial)` 과 동치이며,
 * 이 규칙으로 현재 원장에서 변경점 19개가 잡힌다(전부 replacements 와 1:1).
 *
 * ⚠ 트레드가 올라간 것은 절대 구분 근거로 쓰지 않는다 (작업지시서 v2 §3).
 */
function buildSegments(ch: string, pos: string, rounds: Round[]): TreadSegment[] {
  const n = rounds.length;
  const segs: TreadSegment[] = [];
  let cur: TreadSegment | null = null;
  let prev: string | null = null;
  let seenAny = false;

  for (let i = 0; i < n; i++) {
    const r = rounds[i];
    if (!r.seen.has(pos)) continue;
    const s = normSerial(r.serial[pos]);
    const isBreak = seenAny && prev !== null && s !== prev;

    if (!cur || isBreak) {
      cur = {
        ch, pos,
        segNo: segs.length,
        serial: s ?? "",
        idxFrom: i,
        idxTo: i,
        tread: new Array<number | null | undefined>(n).fill(undefined),
        treadAvg: new Array<number | null | undefined>(n).fill(undefined),
        widths: new Array<TreadWidths | null | undefined>(n).fill(undefined),
        press: new Array<number | "N/A" | null | undefined>(n).fill(undefined),
        replacedAt: null,
        isCurrent: false,
      };
      segs.push(cur);
    }

    cur.idxTo = i;
    // 구간 첫 회차에만 시리얼이 비어 있던 경우를 뒤 회차 값으로 메운다.
    if (!cur.serial && s) cur.serial = s;
    cur.tread[i] = r.tread[pos] ?? null;
    cur.treadAvg[i] = r.treadAvg[pos] ?? null;
    cur.widths[i] = r.widths[pos] ?? null;
    cur.press[i] = r.press[pos] ?? null;

    prev = s;   // SQL 의 lag() 과 같게 null 도 그대로 넘긴다
    seenAny = true;
  }

  if (segs.length) segs[segs.length - 1].isCurrent = true;

  // 교체일 매칭 — 시리얼이 근거이고 날짜는 표시용이다.
  // 최초 구간(segNo 0)은 교체가 아니므로 비운다.
  for (const seg of segs) {
    if (seg.segNo === 0 || !seg.serial) continue;
    const hit = TMS_DATA.repl.find(
      (r) => r.ch === ch && r.pos === pos && r.newSerial === seg.serial,
    );
    seg.replacedAt = hit?.date ?? null;
  }

  return segs;
}

/** inspections 행으로 units의 회차 배열(dates/hm/km/press)과 tread·segments를 재구성. */
function buildRounds(rows: InspectionRow[]) {
  const byCh = new Map<string, InspectionRow[]>();
  for (const r of rows) {
    if (!byCh.has(r.ch)) byCh.set(r.ch, []);
    byCh.get(r.ch)!.push(r);
  }

  TMS_DATA.tread = {};
  TMS_DATA.segments = {};
  TMS_DATA.units.forEach((unit) => {
    const rounds = new Map<string, Round>();
    for (const r of byCh.get(unit.ch) || []) {
      let round = rounds.get(r.inspection_date);
      if (!round) {
        round = {
          date: r.inspection_date,
          hm: null, km: null,
          press: {}, tread: {}, treadAvg: {}, widths: {}, serial: {},
          seen: new Set<string>(),
        };
        rounds.set(r.inspection_date, round);
      }
      if (r.hm != null) round.hm = r.hm;
      if (r.km != null) round.km = r.km;
      if (r.pressure != null) round.press[r.pos] = r.pressure;
      if (r.tread != null) round.tread[r.pos] = r.tread;
      if (r.tread_avg != null) round.treadAvg[r.pos] = r.tread_avg;
      // 넷 중 하나라도 있으면 담는다. 전부 null 인 회차는 4점 측정 이전이다.
      if (r.tread_l != null || r.tread_c1 != null || r.tread_c2 != null || r.tread_r != null) {
        round.widths[r.pos] = {
          l: r.tread_l ?? null, c1: r.tread_c1 ?? null,
          c2: r.tread_c2 ?? null, r: r.tread_r ?? null,
        };
      }
      round.serial[r.pos] = r.serial ?? null;
      round.seen.add(r.pos);
    }

    const sorted = [...rounds.values()].sort((a, b) => a.date.localeCompare(b.date));
    unit.dates = sorted.map((r) => r.date);
    unit.hm = sorted.map((r) => r.hm);
    unit.km = sorted.map((r) => r.km);

    TMS_DATA.tread[unit.ch] = {};
    TMS_DATA.segments[unit.ch] = {};
    for (let p = 1; p <= 10; p++) {
      const rp = HEAD_MAP[p];
      const pd = unit.positions.find((x) => x.pos === rp);
      if (pd) pd.press = sorted.map((r) => r.press[rp] ?? null);
      // (ch,pos) 로만 묶은 이 배열은 교체 전후 타이어가 섞여 있다.
      // 추이 화면·마모율은 쓰지 않는다 — segments 를 쓸 것.
      TMS_DATA.tread[unit.ch][rp] = {
        dates: sorted.map((r) => r.date),
        min: sorted.map((r) => r.tread[rp] ?? null),
      };
      TMS_DATA.segments[unit.ch][rp] = buildSegments(unit.ch, rp, sorted);
    }
  });
}

/** 전체 데이터 로드 → TMS_DATA 갱신. 실패 시 throw. */
export async function loadData(): Promise<void> {
  const [cfg, veh, pos, cur, hist, repl, life, codes, insp] = await Promise.all([
    supabase.from("tire_config").select("*").eq("id", 1).maybeSingle(),
    supabase.from("vehicles").select("*").order("seq", { ascending: true }),
    // 시리얼은 더 이상 여기서 읽지 않는다 — v_current_tire 가 단일 진실원.
    // 이 테이블에서 필요한 것은 포지션 비고(remark)뿐이다.
    supabase.from("vehicle_positions").select("ch,pos,remark").order("seq", { ascending: true }),
    // 현재 장착 시리얼 (replacements 최신 회차 → 없으면 최초 장착분)
    supabase.from("v_current_tire").select("*").order("seq", { ascending: true }),
    // 포지션별 시리얼 이력 — 2칸 한도 없이 전 회차
    supabase
      .from("v_position_history")
      .select("*")
      .order("ch", { ascending: true })
      .order("pos", { ascending: true })
      .order("seq_no", { ascending: true }),
    // 소프트 삭제(T-103)된 교체 이력은 제외한다.
    supabase.from("replacements").select("*").is("deleted_at", null),
    supabase.from("lifetimes").select("*").order("no", { ascending: true }),
    supabase.from("damage_codes").select("*").order("seq", { ascending: true }),
    listInspections(),
  ]);

  for (const r of [cfg, veh, pos, cur, hist, repl, life, codes]) {
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
      // 마이그레이션 미적용 환경에서는 컬럼 자체가 없으므로 ?? null 로 방어한다.
      treadCaution: cfg.data.tread_caution ?? null,
      treadOrder: cfg.data.tread_order ?? null,
      treadCritical: cfg.data.tread_critical ?? null,
      recPsiSteer: cfg.data.rec_psi_steer ?? null,
      recPsiDrive: cfg.data.rec_psi_drive ?? null,
      scRatioUpper: cfg.data.sc_ratio_upper ?? null,
      scRatioLower: cfg.data.sc_ratio_lower ?? null,
      wearMinMm: cfg.data.wear_min_mm ?? null,
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
  // 비고는 vehicle_positions, 시리얼은 v_current_tire / v_position_history 에서 온다.
  const remarkByKey = new Map<string, string | null>();
  (pos.data ?? []).forEach((p) => { remarkByKey.set(`${p.ch}|${p.pos}`, p.remark ?? null); });

  const chainByKey = new Map<string, SerialChainEntry[]>();
  (hist.data ?? []).forEach((h) => {
    const k = `${h.ch}|${h.pos}`;
    if (!chainByKey.has(k)) chainByKey.set(k, []);
    chainByKey.get(k)!.push({
      seqNo: h.seq_no,
      serial: h.serial,
      mountedAt: h.mounted_at ?? null,
      source: h.source === "replacement" ? "replacement" : "initial",
    });
  });

  const curByCh = new Map<string, typeof cur.data>();
  (cur.data ?? []).forEach((c) => {
    if (!curByCh.has(c.ch)) curByCh.set(c.ch, []);
    curByCh.get(c.ch)!.push(c);
  });

  TMS_DATA.units = (veh.data ?? []).map((v): Unit => ({
    ch: v.ch,
    dates: [],
    hm: [],
    km: [],
    hmReset: !!v.hm_reset,
    positions: (curByCh.get(v.ch) ?? []).map((c): TirePosition => ({
      pos: c.pos,
      serial: c.serial ?? "",
      serialInitial: c.serial_initial ?? "",
      replCount: c.repl_count ?? 0,
      mountedAt: c.mounted_at ?? null,
      chain: chainByKey.get(`${c.ch}|${c.pos}`) ?? [],
      remark: remarkByKey.get(`${c.ch}|${c.pos}`) ?? null,
      press: [],
    })),
  }));

  // 측정 회차 반영
  buildRounds(insp);
}
