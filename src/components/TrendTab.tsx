// @section: trend-tab
import { useState } from "react";
import { TMS_DATA, HEAD_MAP, NEW_TREAD, recPsi, treadLevel, treadThresholds } from "@/data/tmsData";
import type { TreadLevel, TreadSegment, Unit } from "@/data/tmsData";
import { headPosData, validDates, posSegments, segmentWearRate, vehicleWearRate } from "@/data/tmsUtils";
import { EMPTY, fmtInt, fmtTread, fmtPressure, fmtWearRate, fmtKmPerMm } from "@/lib/format";
import { useLang } from "@/i18n";
import FleetWearView from "@/components/FleetWearView";
import { irregularOfWidths } from "@/lib/irregularWear";
import { HEX, LEVEL_HEX, SERIES } from "@/lib/chartColors";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

/**
 * KM 열 한 칸. 원본에 문자열로 들어온 회차가 있어(CH 834 원시값) 숫자만
 * 서식을 입히고 문자열은 그대로 둔다. 파싱하면 없는 정밀도를 만들게 된다.
 */
const kmCell = (v: number | string | null) =>
  typeof v === "number" ? fmtInt(v) : (v ?? EMPTY);

type Thresholds = ReturnType<typeof treadThresholds>;

// 4단계 신호등 — 녹색 ≥10mm / 황색 5~10mm / 주황 3~5mm(발주) / 적색 <3mm.
// 차트(SVG)는 @/lib/chartColors 의 hex 를, 표 글자는 같은 값을 물고 있는
// --color-level-* 유틸리티를 쓴다. 전에는 text-*-400 이라 흰 카드 위에서 흐렸다.
const LEVEL_CELL_CLS: Record<TreadLevel, string> = {
  ok: "text-level-ok",
  warn: "text-level-warn font-bold",
  order: "text-level-order font-bold",
  danger: "text-level-danger font-bold",
};

const buildTX = () => ({
  ko: {
    viewUnit: "차량별",
    viewFleet: "전체 비교",
    vehicle: "차량(CH):",
    item: "항목:",
    treadOpt: "트레드 (mm)",
    pressOpt: "공기압 (psi)",
    treadTrend: "트레드 추이 (mm)",
    pressTrend: "공기압 추이 (psi)",
    warn: "주의",
    order: "발주",
    replace: "교체",
    treadFoot: (t: Thresholds) => `트레드 기준: 신품 ${NEW_TREAD}mm · 주의 <${t.caution}mm · 발주 <${t.order}mm · 즉시교체 <${t.critical}mm`,
    pressFoot: `공기압 권장: 조향축(L1/R1) ${recPsi(1)}psi · 구동축 ${recPsi(3)}psi | N/A = 내측 듀얼 타이어 (측정 제외)`,
    detailTitle: "회차별 상세 데이터",
    position: "포지션",
    serial: "시리얼",
    trend: "추이",
    wear: "마모율",
    lifeDb: "수명 DB 보기",
    current: "현재",
    removed: "제거",
    awaiting: "측정 대기 — 교체 뒤 아직 측정 회차가 없습니다",
    outlier: "이상점 제외 — 4점 중 0 하나를 빼고 판정",
    replacedOn: "교체",
    noData: "측정 없음",
    tableFoot: "회차별 측정값. 트레드는 4개 그루브 중 최소값 기준. 행은 시리얼 단위로 나뉘며, 빈칸은 그 타이어가 이 포지션에 없던 회차입니다(0 이 아님).",
    irregularFoot: "▲ = 4점 편마모 (최대−최소 3 mm 이상 노랑, 5 mm 이상 빨강). 칸에 마우스를 올리면 4점 값이 보입니다.",
    wearFoot: (r: string, k: string, n: number) => `CH 마모율 ${r} (${k}) — 시리얼이 같은 인접 회차 ${n}개 구간 기준. 트레드가 오른 구간·km 미증가 구간·트레드 0 회차는 제외합니다.`,
    wearNone: "마모율 산출에 쓸 구간이 없습니다 (km 미기록이거나 회차가 부족합니다).",
  },
  id: {
    viewUnit: "Per Unit",
    viewFleet: "Perbandingan semua Unit",
    vehicle: "Unit (CH):",
    item: "Item:",
    treadOpt: "Tapak (mm)",
    pressOpt: "Tekanan (psi)",
    treadTrend: "Tren Tapak (mm)",
    pressTrend: "Tren Tekanan (psi)",
    warn: "Perhatian",
    order: "Pesan",
    replace: "Ganti",
    treadFoot: (t: Thresholds) => `Standar tapak: baru ${NEW_TREAD}mm · perhatian <${t.caution}mm · pesan ban <${t.order}mm · ganti segera <${t.critical}mm`,
    pressFoot: `Rekomendasi tekanan: poros kemudi(L1/R1) ${recPsi(1)}psi · poros penggerak ${recPsi(3)}psi | N/A = ban dual dalam (tidak diukur)`,
    detailTitle: "Data detail per sesi",
    position: "Posisi",
    serial: "Serial",
    trend: "Tren",
    wear: "Laju aus",
    lifeDb: "Lihat DB umur",
    current: "Terpasang",
    removed: "Dilepas",
    awaiting: "Menunggu diukur — belum ada Pemeriksaan setelah Penggantian",
    outlier: "Titik anomali dikecualikan — satu nilai 0 dari 4 titik tidak dihitung",
    replacedOn: "Ganti",
    noData: "Tidak ada pengukuran",
    tableFoot: "Nilai ukur per sesi. Tapak berdasarkan nilai min dari 4 alur. Baris dipisah per serial; sel kosong berarti ban itu belum/tidak terpasang di posisi ini pada sesi tersebut (bukan 0).",
    irregularFoot: "▲ = aus tidak rata antar 4 alur (maks−min ≥ 3 mm kuning, ≥ 5 mm merah). Arahkan kursor ke sel untuk melihat 4 nilai.",
    wearFoot: (r: string, k: string, n: number) => `Laju aus unit ${r} (${k}) — dari ${n} interval sesi berurutan dengan serial sama. Interval dengan tapak naik, km tidak bertambah, atau tapak 0 dikecualikan.`,
    wearNone: "Tidak ada interval yang dapat dipakai untuk laju aus (km tidak tercatat atau sesi kurang).",
  },
  en: {
    viewUnit: "By vehicle",
    viewFleet: "Fleet comparison",
    vehicle: "Vehicle (CH):",
    item: "Item:",
    treadOpt: "Tread (mm)",
    pressOpt: "Pressure (psi)",
    treadTrend: "Tread trend (mm)",
    pressTrend: "Pressure trend (psi)",
    warn: "Caution",
    order: "Order",
    replace: "Replace",
    treadFoot: (t: Thresholds) => `Tread spec: new ${NEW_TREAD}mm · caution <${t.caution}mm · order <${t.order}mm · replace now <${t.critical}mm`,
    pressFoot: `Recommended pressure: steer axle (L1/R1) ${recPsi(1)}psi · drive axle ${recPsi(3)}psi | N/A = inner dual tire (not measured)`,
    detailTitle: "Detail data by round",
    position: "Position",
    serial: "Serial",
    trend: "Trend",
    wear: "Wear rate",
    lifeDb: "View lifetime DB",
    current: "Current",
    removed: "Removed",
    awaiting: "Awaiting measurement — no inspection since the replacement yet",
    outlier: "Outlier excluded — one 0 among the 4 points was left out",
    replacedOn: "Replaced",
    noData: "No measurement",
    tableFoot: "Measured values by round. Tread is the minimum of the 4 grooves. Rows are split per serial; a blank cell means that tire was not on this position for that round (not a zero).",
    irregularFoot: "▲ = irregular wear across the 4 grooves (max−min ≥ 3 mm amber, ≥ 5 mm red). Hover the cell for the 4 values.",
    wearFoot: (r: string, k: string, n: number) => `Vehicle wear rate ${r} (${k}) — from ${n} adjacent-round intervals on the same serial. Intervals with rising tread, non-increasing km, or zero tread are excluded.`,
    wearNone: "No usable interval for a wear rate (km not recorded, or too few rounds).",
  },
} as const);

export default function TrendTab({ onSerialClick }: { onSerialClick?: (serial: string) => void }) {
  const { lang } = useLang();
  // TMS_DATA.tire 가 로드된 뒤 렌더되므로, 문구는 렌더 시점에 DB 기준값으로 만든다.
  const th = treadThresholds();
  const tx = buildTX()[lang];
  const [selCh, setSelCh] = useState(TMS_DATA.units[0].ch);
  const [metric, setMetric] = useState<"tread" | "press">("tread");
  const [view, setView] = useState<"unit" | "fleet">("unit");

  const u = TMS_DATA.units.find((x) => x.ch === selCh)!;
  const vd = validDates(u);
  const positions = Array.from({ length: 10 }, (_, i) => HEAD_MAP[i + 1]);

  // 시리얼 단위 구간 — 차트도 표도 여기서만 값을 꺼낸다.
  // (ch, pos) 로 묶인 TMS_DATA.tread 는 교체 전후 타이어가 한 줄에 섞여 있어
  // 트레드가 올라가는 것처럼 보인다. 추이 화면에서는 쓰지 않는다.
  const bySeg = positions.map((rp) => ({ rp, segs: posSegments(u.ch, rp) }));

  const value = (seg: TreadSegment, i: number) =>
    metric === "tread" ? seg.tread[i] : seg.press[i];

  // 차트 데이터 — 계열 키를 "포지션#구간번호" 로 두어 구간이 바뀌면 선이 끊긴다.
  const chartData = vd.map((x) => {
    const pt: Record<string, number | string> = { date: x.d.slice(5) };
    for (const { rp, segs } of bySeg) {
      for (const seg of segs) {
        const v = value(seg, x.i);
        if (typeof v === "number") pt[`${rp}#${seg.segNo}`] = v;
      }
    }
    return pt;
  });

  return (
    <div className="space-y-4">
      {/* 차량별 / 전체 비교 (§A-6) */}
      <div className="flex gap-1">
        {(["unit", "fleet"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {v === "unit" ? tx.viewUnit : tx.viewFleet}
          </button>
        ))}
      </div>
      {view === "fleet" ? <FleetWearView /> : (<>
      {/* 컨트롤 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold">{tx.vehicle}</span>
          <div className="flex gap-1.5">
            {TMS_DATA.units.map((unit) => (
              <button
                key={unit.ch}
                onClick={() => setSelCh(unit.ch)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                  selCh === unit.ch
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                CH {unit.ch}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground font-semibold">{tx.item}</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as "tread" | "press")}
            className="text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-foreground font-semibold"
          >
            <option value="tread">{tx.treadOpt}</option>
            <option value="press">{tx.pressOpt}</option>
          </select>
        </div>
      </div>

      {/* 차트 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">
            {metric === "tread" ? tx.treadTrend : tx.pressTrend} — CH {selCh}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: HEX.ink }} />
            <YAxis
              domain={metric === "tread" ? [0, 24] : [60, 145]}
              tick={{ fontSize: 11, fill: HEX.ink }}
              tickFormatter={(v) => `${v}${metric === "tread" ? "mm" : "psi"}`}
            />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.ink}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: HEX.ink, fontWeight: "bold" }}
              itemStyle={{ color: HEX.ink }}
              formatter={(value: number) => [
                metric === "tread" ? fmtTread(value) : fmtPressure(value),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {metric === "tread" && (
              <>
                <ReferenceLine y={th.caution} stroke={LEVEL_HEX.warn} strokeDasharray="6 3" label={{ value: `${tx.warn} ${th.caution}mm`, fill: LEVEL_HEX.warn, fontSize: 10 }} />
                <ReferenceLine y={th.order} stroke={LEVEL_HEX.order} strokeDasharray="6 3" label={{ value: `${tx.order} ${th.order}mm`, fill: LEVEL_HEX.order, fontSize: 10 }} />
                <ReferenceLine y={th.critical} stroke={LEVEL_HEX.danger} strokeDasharray="6 3" label={{ value: `${tx.replace} ${th.critical}mm`, fill: LEVEL_HEX.danger, fontSize: 10 }} />
              </>
            )}
            {metric === "press" && [1, 3].map((p) => (
              <ReferenceLine key={p} y={recPsi(p)} stroke={HEX.divider} strokeDasharray="4 2" />
            ))}
            {/* 구간별로 별도 계열 — 교체 지점에서 선이 이어지지 않는다.
                제거된 타이어는 가는 점선으로 낮춰 현재 장착분과 구분한다. */}
            {bySeg.flatMap(({ rp, segs }, pi) =>
              segs.map((seg) => (
                <Line
                  key={`${rp}#${seg.segNo}`}
                  type="monotone"
                  dataKey={`${rp}#${seg.segNo}`}
                  name={seg.segNo === 0 ? rp : `${rp} (${seg.segNo + 1})`}
                  stroke={SERIES[pi % SERIES.length]}
                  strokeWidth={seg.isCurrent ? 2 : 1}
                  strokeDasharray={seg.isCurrent ? undefined : "4 3"}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          {metric === "tread" ? tx.treadFoot(th) : tx.pressFoot}
        </p>
      </div>

      {/* 상세 데이터 테이블 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.detailTitle}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left text-muted-foreground w-6">#</th>
                <th className="px-2 py-2 text-left text-muted-foreground">{tx.position}</th>
                <th className="px-2 py-2 text-left text-muted-foreground text-[10px]">{tx.serial}</th>
                {vd.map((x) => (
                  <th key={x.d} className="px-2 py-2 text-muted-foreground text-[10px] whitespace-nowrap">{x.d.slice(5)}</th>
                ))}
                <th className="px-2 py-2 text-muted-foreground">{tx.trend}</th>
                <th className="px-2 py-2 text-muted-foreground text-[10px] whitespace-nowrap">{tx.wear}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, i) => i + 1).flatMap((p) => {
                const rp = HEAD_MAP[p];
                const segs = posSegments(u.ch, rp);
                const d = headPosData(u, p);

                // 측정 회차가 하나도 없는 포지션 — 한 줄로 비워 둔다.
                if (!segs.length) {
                  return [(
                    <tr key={rp} className="border-b border-border/40">
                      <td className="px-2 py-1.5 font-bold text-primary">{p}</td>
                      <td className="px-2 py-1.5 font-semibold">{rp}</td>
                      <td className="px-2 py-1.5 text-[10px] text-muted-foreground truncate max-w-25">
                        {d?.serial || EMPTY}
                      </td>
                      <td colSpan={vd.length + 2} className="px-2 py-1.5 text-muted-foreground/50 text-[10px]">
                        {tx.noData}
                      </td>
                    </tr>
                  )];
                }

                // 시리얼이 바뀌는 회차 열 — 모든 행에 같은 자리에 세로 구분선을 긋는다.
                const breakCols = new Set(segs.slice(1).map((s) => s.idxFrom));
                // 스파크라인 y축은 포지션 전체 범위로 통일해야 구간끼리 비교가 된다.
                const all = segs.flatMap((s) => vd
                  .map((x) => value(s, x.i))
                  .filter((v): v is number => typeof v === "number"));
                const lo = all.length ? Math.min(...all) : 0;
                const hi = all.length ? Math.max(...all) : 1;

                // 교체 뒤 측정 전 — 지금 달린 타이어 줄이 없으면 한 줄 덧붙인다 (R-1 · TRD-01)
                const awaiting = !segs.some((s) => s.isCurrent) && !!d?.serial;
                const span = segs.length + (awaiting ? 1 : 0);

                const rows = segs.map((seg, k) => {
                  const pairs = vd
                    .map((x) => ({ d: x.d, v: value(seg, x.i) }))
                    .filter((q): q is { d: string; v: number } => typeof q.v === "number");
                  const rate = metric === "tread" ? segmentWearRate(u, seg) : null;

                  return (
                    <tr key={`${rp}#${seg.segNo}`} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                      {k === 0 && (
                        <>
                          <td rowSpan={span} className="px-2 py-1.5 font-bold text-primary align-top">{p}</td>
                          <td rowSpan={span} className="px-2 py-1.5 font-semibold align-top">{rp}</td>
                        </>
                      )}
                      <td className="px-2 py-1.5 text-[10px] max-w-30">
                        <SerialCell
                          seg={seg}
                          label={seg.isCurrent ? tx.current : tx.removed}
                          replacedLabel={tx.replacedOn}
                          title={tx.lifeDb}
                          onClick={onSerialClick}
                        />
                      </td>
                      {vd.map((x) => {
                        const line = breakCols.has(x.i) ? "border-l-2 border-primary/60" : "";
                        const v = value(seg, x.i);
                        // undefined = 이 타이어의 회차가 아님 → 빈칸. 0 도 − 도 찍지 않는다.
                        if (v === undefined) return <td key={x.i} className={`px-2 py-1.5 ${line}`} />;
                        if (v === null) return <td key={x.i} className={`px-2 py-1.5 text-center text-muted-foreground/40 ${line}`}>{EMPTY}</td>;
                        if (v === "N/A") return <td key={x.i} className={`px-2 py-1.5 text-center text-[10px] text-muted-foreground/50 ${line}`}>N/A</td>;
                        const cls = metric === "tread" ? LEVEL_CELL_CLS[treadLevel(v)] : "";
                        // 4점 편마모 (§A-7) — 4점이 있는 회차만. 값은 툴팁, 표시는 ▲ 하나로 칸 폭을 지킨다.
                        const w = metric === "tread" ? seg.widths[x.i] : null;
                        const iw = irregularOfWidths(w);
                        const wTitle = w && iw
                          ? `${[w.l, w.c1, w.c2, w.r].map((t) => (t != null ? fmtTread(t, false) : EMPTY)).join(" / ")} mm · Δ${fmtTread(iw.range, false)}`
                          : undefined;
                        const outlier = metric === "tread" && seg.outlier[x.i];
                        return (
                          <td key={x.i} title={outlier ? [tx.outlier, wTitle].filter(Boolean).join(" · ") : wTitle} className={`px-2 py-1.5 text-center ${cls} ${line}`}>
                            {metric === "tread" ? fmtTread(v, false) : fmtPressure(v, false)}
                            {outlier && <span className="ml-0.5 text-[9px] text-muted-foreground">*</span>}
                            {iw && iw.level !== "ok" && (
                              <span className={`ml-0.5 text-[9px] ${iw.level === "danger" ? "text-level-danger" : "text-level-warn"}`}>▲</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 min-w-30">
                        <TinySparkline pairs={pairs} metric={metric} isCurrent={seg.isCurrent} lo={lo} hi={hi} />
                      </td>
                      <td className="px-2 py-1.5 text-right text-[10px] whitespace-nowrap text-muted-foreground">
                        {rate ? fmtWearRate(rate.mmPer1000Km) : EMPTY}
                      </td>
                    </tr>
                  );
                });
                if (awaiting) {
                  rows.push(
                    <tr key={`${rp}#await`} className="border-b border-border/40">
                      <td className="px-2 py-1.5 text-[10px] text-primary truncate max-w-30">{d!.serial}</td>
                      <td colSpan={vd.length + 2} className="px-2 py-1.5 text-muted-foreground text-[10px]">{tx.awaiting}</td>
                    </tr>,
                  );
                }
                return rows;
              })}
              {/* HM / KM 행 */}
              <tr className="border-b border-border/40 bg-muted/5">
                <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-muted-foreground text-[10px]">HM</td>
                {vd.map((x) => (
                  <td key={x.d} className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">{fmtInt(u.hm[x.i])}</td>
                ))}
                <td colSpan={2} />
              </tr>
              <tr className="border-b border-border/40 bg-muted/5">
                <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-muted-foreground text-[10px]">KM</td>
                {vd.map((x) => (
                  <td key={x.d} className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">{kmCell(u.km[x.i])}</td>
                ))}
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{tx.tableFoot}</p>
        {metric === "tread" && <p className="mt-1 text-xs text-muted-foreground">{tx.irregularFoot}</p>}
        {metric === "tread" && <WearFoot u={u} tx={tx} />}
      </div>
      </>)}
    </div>
  );
}

/** 차량 단위 마모율 각주 — 표 아래 한 줄. */
function WearFoot({ u, tx }: { u: Unit; tx: ReturnType<typeof buildTX>[keyof ReturnType<typeof buildTX>] }) {
  const r = vehicleWearRate(u.ch);
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {r
        ? tx.wearFoot(fmtWearRate(r.mmPer1000Km), fmtKmPerMm(r.kmPerMm), r.intervals)
        : tx.wearNone}
    </p>
  );
}

function SerialCell({
  seg, label, replacedLabel, title, onClick,
}: {
  seg: TreadSegment;
  label: string;
  replacedLabel: string;
  title: string;
  onClick?: (serial: string) => void;
}) {
  if (!seg.serial) return <span className="text-muted-foreground">{EMPTY}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        className={`text-left truncate max-w-full hover:underline ${seg.isCurrent ? "text-primary" : "text-muted-foreground"}`}
        title={`${seg.serial} · ${title}`}
        onClick={() => onClick?.(seg.serial)}
      >
        {seg.serial}
      </button>
      <span className="flex items-center gap-1 text-[9px]">
        <span className={`px-1 rounded ${seg.isCurrent ? "bg-accent text-foreground" : "bg-muted/40 text-muted-foreground"}`}>
          {label}
        </span>
        {seg.replacedAt && (
          <span className="text-muted-foreground/70">{replacedLabel} {seg.replacedAt}</span>
        )}
      </span>
    </div>
  );
}

/**
 * 구간 하나의 스파크라인. 구간을 넘어 선을 잇지 않으므로 교체 지점에서 반드시 끊긴다.
 * y축은 같은 포지션의 전 구간 공통 범위(lo~hi)라 구간끼리 높이를 비교할 수 있다.
 */
function TinySparkline({
  pairs, metric, isCurrent, lo, hi,
}: {
  pairs: { d: string; v: number }[];
  metric: "tread" | "press";
  isCurrent: boolean;
  lo: number;
  hi: number;
}) {
  if (!pairs.length) return <span className="text-muted-foreground text-[10px]">{EMPTY}</span>;

  const W = 100, H = 28, padX = 4;
  const mn = lo - 1;
  const mx = hi + 1;
  const xs = (i: number) => (pairs.length === 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (pairs.length - 1));
  const ys = (v: number) => H - 4 - ((v - mn) / (mx - mn || 1)) * (H - 8);
  const last = pairs[pairs.length - 1].v;
  const color = metric === "tread" ? LEVEL_HEX[treadLevel(last)] : HEX.ink;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-7">
      {/* 회차가 하나뿐인 구간은 선이 될 수 없으므로 점으로만 찍는다. */}
      {pairs.length > 1 && (
        <path
          d={pairs.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={isCurrent ? 1.5 : 1}
          strokeDasharray={isCurrent ? undefined : "3 2"}
          strokeLinejoin="round"
          opacity={isCurrent ? 1 : 0.65}
        />
      )}
      <circle cx={xs(pairs.length - 1)} cy={ys(last)} r={2.5} fill={color} opacity={isCurrent ? 1 : 0.65} />
    </svg>
  );
}
