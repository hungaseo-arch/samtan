/**
 * T-002 — 기존 데이터 정합성 진단
 *
 * 프로덕션 DB를 **읽기 전용**으로 조회해 작업지시서 §4 T-002의 7개 항목을 검사하고
 * docs/audit-report.md 를 생성한다.
 *
 * 읽기 전용 보장:
 *   - publishable(anon) 키만 사용한다. service_role 키는 읽지도 받지도 않는다 (§3.1-2).
 *   - Supabase 클라이언트에 대해 .select() 외의 메서드를 호출하지 않는다.
 *     아래 readAll() 이 유일한 DB 접근 경로이며, insert/update/upsert/delete/rpc 는
 *     이 파일 어디에도 없다.
 *   - 유일한 쓰기 대상은 로컬 파일 docs/audit-report.md 이다.
 *
 * 실행:
 *   npx tsx scripts/audit-legacy-data.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fmtInt,
  fmtMeter,
  fmtPressure,
  fmtTread,
  fmtVehicle,
  EMPTY,
} from "../src/lib/format.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = resolve(ROOT, "docs/audit-report.md");

// 검사 임계값 — 부록 A 의 CHECK 제약 예정값과 같은 값을 쓴다.
// 이 스크립트에서 걸리는 건수가 곧 T-102 마이그레이션에서 실패할 건수다.
const PRESSURE_MIN = 60;
const PRESSURE_MAX = 200;
const TREAD_MIN = 0;
const TREAD_MAX = 60;

// ── 환경변수 ──────────────────────────────────────────────────────

/** .env 를 파싱한다. dotenv 의존성을 더하지 않기 위한 최소 구현. */
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = "";
  try {
    raw = readFileSync(resolve(ROOT, ".env"), "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 가 없습니다. .env 를 확인하십시오.",
  );
  process.exit(1);
}
if (/service_role|SERVICE_ROLE/.test(SUPABASE_KEY)) {
  console.error("service_role 키로는 실행하지 않습니다 (§3.1-2).");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 타입 ─────────────────────────────────────────────────────────

type Num = number | null;

interface Inspection {
  id: string;
  ch: string;
  inspection_date: string;
  hm: Num;
  km: Num;
  pos: string;
  serial: string | null;
  pressure: Num;
  tread: Num;
  remark: string | null;
}
interface VehiclePosition {
  ch: string;
  pos: string;
  serial: string | null;
  serial2: string | null;
}
interface Replacement {
  ch: string;
  pos: string;
  date: string;
  new_serial: string | null;
}
interface Vehicle {
  ch: string;
  hm_reset: boolean;
}
interface TireConfig {
  new_tread: Num;
}

/** 유일한 DB 접근 경로. select 만 수행하며 페이지네이션으로 전량을 읽는다. */
async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

// ── 리포트 조립 ───────────────────────────────────────────────────

interface Finding {
  id: string;
  title: string;
  rule: string;
  rows: string[][];
  header: string[];
  /** 건수가 0이어도 근거를 남겨야 하는 경우의 보충 설명 */
  note?: string;
}

const findings: Finding[] = [];

function mdTable(header: string[], rows: string[][]): string {
  if (rows.length === 0) return "_해당 없음_\n";
  const align = header.map(() => "---");
  return [
    `| ${header.join(" | ")} |`,
    `| ${align.join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

const key = (i: { ch: string; inspection_date: string; pos: string }) =>
  `${i.ch}|${i.inspection_date}|${i.pos}`;

async function main(): Promise<void> {
  console.log(`진단 대상: ${SUPABASE_URL} (읽기 전용)`);

  const [inspections, positions, replacements, vehicles, configs] =
    await Promise.all([
      readAll<Inspection>(
        "inspections",
        "id,ch,inspection_date,hm,km,pos,serial,pressure,tread,remark",
      ),
      readAll<VehiclePosition>("vehicle_positions", "ch,pos,serial,serial2"),
      readAll<Replacement>("replacements", "ch,pos,date,new_serial"),
      readAll<Vehicle>("vehicles", "ch,hm_reset"),
      readAll<TireConfig>("tire_config", "new_tread"),
    ]);

  // 신품 트레드. 이 값과 같은 트레드는 "미측정 더미"가 아니라 신품 장착 직후의
  // 정상값일 수 있으므로 검사 4에서 구분해야 한다.
  const newTread = configs[0]?.new_tread ?? null;

  // 차량별 최초 점검일 — 신품 장착 직후 회차인지 판단하는 근거.
  const firstRound = new Map<string, string>();
  for (const i of inspections) {
    const prev = firstRound.get(i.ch);
    if (!prev || i.inspection_date < prev) firstRound.set(i.ch, i.inspection_date);
  }

  console.log(
    `읽음: inspections ${inspections.length} / vehicle_positions ${positions.length} / ` +
      `replacements ${replacements.length} / vehicles ${vehicles.length}`,
  );

  // ── 1. (ch, inspection_date, pos) 중복 ──
  {
    const seen = new Map<string, Inspection[]>();
    for (const i of inspections) {
      const k = key(i);
      (seen.get(k) ?? seen.set(k, []).get(k)!).push(i);
    }
    const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);
    findings.push({
      id: "1",
      title: "`(ch, inspection_date, pos)` 중복 레코드",
      rule: "같은 차량·같은 점검일·같은 포지션에 2건 이상 존재",
      header: ["차량", "점검일", "포지션", "건수"],
      rows: dupes.map(([k, v]) => {
        const [ch, date, pos] = k.split("|");
        return [fmtVehicle(ch), date, pos, fmtInt(v.length)];
      }),
      note:
        dupes.length === 0
          ? "`inspections_ch_date_pos_uniq` UNIQUE 인덱스가 이미 존재하므로(`0001`) 0건이 정상입니다. " +
            "지시서 §1.3 P-1은 이 인덱스를 반영하지 않은 진술입니다."
          : undefined,
    });
  }

  // ── 2. pressure 이상치 ──
  {
    const bad = inspections.filter(
      (i) =>
        i.pressure !== null &&
        (i.pressure < PRESSURE_MIN || i.pressure > PRESSURE_MAX),
    );
    findings.push({
      id: "2",
      title: "`pressure` 이상치",
      rule: `NULL 이 아니면서 ${PRESSURE_MIN} 미만 또는 ${PRESSURE_MAX} 초과`,
      header: ["차량", "점검일", "포지션", "공기압", "동일 회차 중앙값", "비고"],
      rows: bad.map((i) => {
        const peers = inspections
          .filter(
            (o) =>
              o.ch === i.ch &&
              o.inspection_date === i.inspection_date &&
              o.pressure !== null &&
              o.id !== i.id,
          )
          .map((o) => o.pressure as number)
          .sort((a, b) => a - b);
        const median = peers.length
          ? peers[Math.floor(peers.length / 2)]
          : null;
        return [
          fmtVehicle(i.ch),
          i.inspection_date,
          i.pos,
          fmtPressure(i.pressure),
          fmtPressure(median),
          i.remark ?? EMPTY,
        ];
      }),
    });
  }

  // ── 3. tread 이상치 ──
  {
    const bad = inspections.filter(
      (i) => i.tread !== null && (i.tread < TREAD_MIN || i.tread > TREAD_MAX),
    );
    findings.push({
      id: "3",
      title: "`tread` 이상치",
      rule: `${TREAD_MIN} 미만 또는 ${TREAD_MAX} 초과`,
      header: ["차량", "점검일", "포지션", "트레드", "비고"],
      rows: bad.map((i) => [
        fmtVehicle(i.ch),
        i.inspection_date,
        i.pos,
        fmtTread(i.tread),
        i.remark ?? EMPTY,
      ]),
    });
  }

  // ── 4. 전 포지션 tread 동일 회차 (더미 데이터 의심) ──
  {
    const byRound = new Map<string, Inspection[]>();
    for (const i of inspections) {
      const k = `${i.ch}|${i.inspection_date}`;
      (byRound.get(k) ?? byRound.set(k, []).get(k)!).push(i);
    }
    const suspects = [...byRound.entries()].filter(([, rows]) => {
      const treads = rows.map((r) => r.tread).filter((t) => t !== null);
      // 포지션이 1개뿐인 회차는 "전부 동일"이 의미가 없으므로 제외한다.
      return treads.length > 1 && new Set(treads).size === 1;
    });
    findings.push({
      id: "4",
      title: "동일 회차 전 포지션 `tread` 동일 (더미 데이터 의심)",
      rule: "같은 (ch, 점검일)의 NULL 아닌 트레드 값이 2개 이상이고 전부 같은 값",
      header: [
        "차량",
        "점검일",
        "포지션 수",
        "트레드",
        "신품값?",
        "첫 회차?",
        "공기압도 동일?",
        "판정",
      ],
      rows: suspects.map(([k, rows]) => {
        const [ch, date] = k.split("|");
        const pressures = rows.map((r) => r.pressure).filter((p) => p !== null);
        const samePressure =
          pressures.length > 1 && new Set(pressures).size === 1;
        const isNew = newTread !== null && rows[0].tread === newTread;
        const isFirst = firstRound.get(ch) === date;
        // 신품 트레드와 같고 그 차량의 첫 회차라면 실측 누락이 아니라 신품 장착
        // 직후의 정상값으로 설명된다. 둘 중 하나라도 어긋나면 확인이 필요하다.
        const verdict = !isNew
          ? "**더미 의심**"
          : isFirst
            ? "신품 추정"
            : "확인 필요";
        return [
          fmtVehicle(ch),
          date,
          fmtInt(rows.length),
          fmtTread(rows[0].tread),
          isNew ? "예" : "아니오",
          isFirst ? "예" : "아니오",
          samePressure ? `예 (${fmtPressure(pressures[0])})` : "아니오",
          verdict,
        ];
      }),
      note:
        newTread !== null
          ? `\`tire_config.new_tread\` = ${fmtTread(newTread)} 입니다. ` +
            "이 값과 같은 트레드는 실측 누락이 아니라 신품 장착 직후의 정상값일 수 있어 " +
            "위 표에서 구분했습니다. **판정이 '신품 추정'인 회차는 정정 대상이 아닙니다.**"
          : undefined,
    });
  }

  // ── 5. vehicle_positions 에 없는 (ch, pos) 를 참조하는 inspections ──
  {
    const known = new Set(positions.map((p) => `${p.ch}|${p.pos}`));
    const knownVehicles = new Set(vehicles.map((v) => v.ch));
    const orphans = inspections.filter((i) => !known.has(`${i.ch}|${i.pos}`));
    const grouped = new Map<string, number>();
    for (const o of orphans) {
      const k = `${o.ch}|${o.pos}`;
      grouped.set(k, (grouped.get(k) ?? 0) + 1);
    }
    findings.push({
      id: "5",
      title: "`vehicle_positions` 에 없는 `(ch, pos)` 를 참조하는 `inspections`",
      rule: "T-102 의 `fk_insp_position` 추가 시 실패 원인이 되는 고아 레코드",
      header: ["차량", "포지션", "건수", "차량 자체는 등록됨?"],
      rows: [...grouped.entries()].map(([k, n]) => {
        const [ch, pos] = k.split("|");
        return [
          fmtVehicle(ch),
          pos,
          fmtInt(n),
          knownVehicles.has(ch) ? "예" : "**아니오**",
        ];
      }),
    });
  }

  // ── 6. replacements 에 있으나 vehicle_positions.serial2 에 미반영 ──
  {
    const posMap = new Map(positions.map((p) => [`${p.ch}|${p.pos}`, p]));
    // 같은 (ch,pos)에 교체가 여러 번이면 serial2 는 최신 것만 담을 수 있다.
    const latest = new Map<string, Replacement>();
    const countByPos = new Map<string, number>();
    for (const r of replacements) {
      const k = `${r.ch}|${r.pos}`;
      countByPos.set(k, (countByPos.get(k) ?? 0) + 1);
      const prev = latest.get(k);
      if (!prev || r.date > prev.date) latest.set(k, r);
    }
    const mismatched = [...latest.entries()].filter(([k, r]) => {
      const p = posMap.get(k);
      return !p || p.serial2 !== r.new_serial;
    });
    findings.push({
      id: "6",
      title: "`replacements` 가 `vehicle_positions.serial2` 에 미반영",
      rule: "각 (ch, pos) 의 최신 교체 `new_serial` 과 `serial2` 불일치",
      header: [
        "차량",
        "포지션",
        "최신 교체일",
        "교체 시리얼",
        "현재 serial2",
        "해당 포지션 교체 횟수",
      ],
      rows: mismatched.map(([k, r]) => {
        const p = posMap.get(k);
        return [
          fmtVehicle(r.ch),
          r.pos,
          r.date,
          r.new_serial ?? EMPTY,
          p ? (p.serial2 ?? EMPTY) : "**포지션 없음**",
          fmtInt(countByPos.get(k) ?? 0),
        ];
      }),
      note: (() => {
        const multi = [...countByPos.entries()].filter(([, n]) => n > 1);
        return multi.length
          ? `교체가 2회 이상인 포지션이 ${fmtInt(multi.length)}개 있습니다. ` +
              "`serial`/`serial2` 2열로는 3본째 이력을 담을 수 없습니다 (P-4). " +
              "T-202 이관 시 `replacements` 를 정본으로 사용해야 합니다."
          : undefined;
      })(),
    });
  }

  // ── 7. hm / km 이 직전 회차보다 감소 ──
  {
    const resetVehicles = new Set(
      vehicles.filter((v) => v.hm_reset).map((v) => v.ch),
    );
    // 회차 단위 메타이므로 (ch, 점검일) 로 접어서 본다.
    const rounds = new Map<string, { hm: Num; km: Num }>();
    for (const i of inspections) {
      const k = `${i.ch}|${i.inspection_date}`;
      if (!rounds.has(k)) rounds.set(k, { hm: i.hm, km: i.km });
    }
    const byVehicle = new Map<string, { date: string; hm: Num; km: Num }[]>();
    for (const [k, v] of rounds) {
      const [ch, date] = k.split("|");
      (byVehicle.get(ch) ?? byVehicle.set(ch, []).get(ch)!).push({
        date,
        ...v,
      });
    }
    const rows: string[][] = [];
    for (const [ch, list] of byVehicle) {
      list.sort((a, b) => a.date.localeCompare(b.date));
      for (let n = 1; n < list.length; n++) {
        const prev = list[n - 1];
        const cur = list[n];
        const hmDrop =
          prev.hm !== null && cur.hm !== null && cur.hm < prev.hm;
        const kmDrop =
          prev.km !== null && cur.km !== null && cur.km < prev.km;
        if (!hmDrop && !kmDrop) continue;
        rows.push([
          fmtVehicle(ch),
          `${prev.date} → ${cur.date}`,
          hmDrop ? `${fmtMeter(prev.hm)} → ${fmtMeter(cur.hm)}` : EMPTY,
          kmDrop
            ? `${fmtMeter(prev.km, "KM")} → ${fmtMeter(cur.km, "KM")}`
            : EMPTY,
          resetVehicles.has(ch) ? "**예**" : "아니오",
        ]);
      }
    }
    findings.push({
      id: "7",
      title: "`hm` / `km` 이 직전 회차보다 감소",
      rule: "차량별 점검일 오름차순에서 회차 메타값이 역행",
      header: ["차량", "구간", "HM 감소", "KM 감소", "계기 리셋 차량?"],
      rows,
      note:
        "`hm_reset = true` 차량(`832`, `835`)의 감소는 계기 리셋일 수 있으므로 " +
        "T-101 정정 대상에서 제외할지 사용자 확인이 필요합니다.",
    });
  }

  // ── 리포트 파일 작성 ──
  const total = findings.reduce((s, f) => s + f.rows.length, 0);
  const md = [
    "# 데이터 정합성 진단 리포트 (T-002)",
    "",
    `생성: \`npx tsx scripts/audit-legacy-data.ts\` · 대상: 프로덕션 \`samtam\` · **읽기 전용**`,
    "",
    "> 이 리포트는 진단만 수행합니다. 어떤 값도 수정하지 않았습니다.",
    "> 정정은 T-101에서 **건별 사용자 확인을 받은 뒤** 마이그레이션으로 수행합니다 (§4 T-101).",
    "",
    "## 조회 범위",
    "",
    mdTable(
      ["테이블", "행 수"],
      [
        ["`inspections`", fmtInt(inspections.length)],
        ["`vehicle_positions`", fmtInt(positions.length)],
        ["`replacements`", fmtInt(replacements.length)],
        ["`vehicles`", fmtInt(vehicles.length)],
      ],
    ),
    "",
    "## 요약",
    "",
    mdTable(
      ["#", "검사 항목", "적출 건수"],
      findings.map((f) => [f.id, f.title, fmtInt(f.rows.length)]),
    ),
    "",
    `**합계 ${fmtInt(total)}건**`,
    "",
    "---",
    "",
    ...findings.flatMap((f) => [
      `## ${f.id}. ${f.title}`,
      "",
      `**판정 기준**: ${f.rule}`,
      `**적출**: ${fmtInt(f.rows.length)}건`,
      "",
      mdTable(f.header, f.rows),
      "",
      ...(f.note ? [`> ${f.note}`, ""] : []),
    ]),
  ].join("\n");

  writeFileSync(REPORT_PATH, md, "utf8");
  console.log(`\n리포트 작성: ${REPORT_PATH}`);
  for (const f of findings) {
    console.log(`  ${f.id}. ${f.title.replace(/`/g, "")} — ${f.rows.length}건`);
  }
  console.log(`\n합계 ${total}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
