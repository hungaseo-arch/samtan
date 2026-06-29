// @section: trend-tab
import { useState } from "react";
import { TMS_DATA, HEAD_MAP, NEW_TREAD, TREAD_WARN, TREAD_DANGER, recPsi } from "@/data/tmsData";
import { headPosData, validDates, fmtInt } from "@/data/tmsUtils";
import { useLang } from "@/i18n";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

const COLORS = [
  "#1B3972","#2563eb","#16a34a","#dc2626","#7c3aed",
  "#0891b2","#9333ea","#0284c7","#15803d","#b45309",
];

const TX = {
  ko: {
    vehicle: "차량(CH):",
    item: "항목:",
    treadOpt: "트레드 (mm)",
    pressOpt: "공기압 (psi)",
    treadTrend: "트레드 추이 (mm)",
    pressTrend: "공기압 추이 (psi)",
    warn: "주의",
    replace: "교체",
    treadFoot: `트레드 기준: 신품 ${NEW_TREAD}mm · 주의 ≤${TREAD_WARN}mm · 교체권장 ≤${TREAD_DANGER}mm`,
    pressFoot: "공기압 권장: 조향축(L1/R1) 100psi · 구동축 116psi | N/A = 내측 듀얼 타이어 (측정 제외)",
    detailTitle: "회차별 상세 데이터",
    position: "포지션",
    serial: "시리얼",
    trend: "추이",
    lifeDb: "수명 DB 보기",
    tableFoot: "회차별 측정값. 트레드는 4개 그루브 중 최소값 기준.",
  },
  id: {
    vehicle: "Unit (CH):",
    item: "Item:",
    treadOpt: "Tapak (mm)",
    pressOpt: "Tekanan (psi)",
    treadTrend: "Tren Tapak (mm)",
    pressTrend: "Tren Tekanan (psi)",
    warn: "Perhatian",
    replace: "Ganti",
    treadFoot: `Standar tapak: baru ${NEW_TREAD}mm · perhatian ≤${TREAD_WARN}mm · rekomendasi ganti ≤${TREAD_DANGER}mm`,
    pressFoot: "Rekomendasi tekanan: poros kemudi(L1/R1) 100psi · poros penggerak 116psi | N/A = ban dual dalam (tidak diukur)",
    detailTitle: "Data detail per sesi",
    position: "Posisi",
    serial: "Serial",
    trend: "Tren",
    lifeDb: "Lihat DB umur",
    tableFoot: "Nilai ukur per sesi. Tapak berdasarkan nilai min dari 4 alur.",
  },
} as const;

export default function TrendTab({ onSerialClick }: { onSerialClick?: (serial: string) => void }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const [selCh, setSelCh] = useState(TMS_DATA.units[0].ch);
  const [metric, setMetric] = useState<"tread" | "press">("tread");

  const u = TMS_DATA.units.find((x) => x.ch === selCh)!;
  const vd = validDates(u);

  // 차트 데이터 구성
  const chartData = vd.map((x) => {
    const pt: Record<string, number | string> = { date: x.d.slice(5) };
    for (let p = 1; p <= 10; p++) {
      const d = headPosData(u, p);
      if (!d) continue;
      const v = metric === "tread" ? d.treadMin[x.i] : d.press[x.i];
      if (typeof v === "number") pt[HEAD_MAP[p]] = v;
    }
    return pt;
  });

  const positions = Array.from({ length: 10 }, (_, i) => HEAD_MAP[i + 1]);

  return (
    <div className="space-y-4">
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <YAxis
              domain={metric === "tread" ? [0, 24] : [60, 145]}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickFormatter={(v) => `${v}${metric === "tread" ? "mm" : "psi"}`}
            />
            <Tooltip
              contentStyle={{ background: "#1c1c1e", border: "1px solid #3a3a3c", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "#FFB800", fontWeight: "bold" }}
              itemStyle={{ color: "#e5e7eb" }}
              formatter={(value: number) => [`${metric === "tread" ? value.toFixed(1) : Math.round(value)}${metric === "tread" ? " mm" : " psi"}`]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {metric === "tread" && (
              <>
                <ReferenceLine y={TREAD_WARN} stroke="#eab308" strokeDasharray="6 3" label={{ value: `${tx.warn} ${TREAD_WARN}mm`, fill: "#eab308", fontSize: 10 }} />
                <ReferenceLine y={TREAD_DANGER} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `${tx.replace} ${TREAD_DANGER}mm`, fill: "#ef4444", fontSize: 10 }} />
              </>
            )}
            {metric === "press" && positions.slice(0, 2).map((_, i) => (
              <ReferenceLine key={i} y={recPsi(i + 1)} stroke="#3b82f6" strokeDasharray="4 2" />
            ))}
            {positions.map((pos, i) => (
              <Line
                key={pos}
                type="monotone"
                dataKey={pos}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          {metric === "tread" ? tx.treadFoot : tx.pressFoot}
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
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => {
                const d = headPosData(u, p);
                const series = vd.map((x) => {
                  if (!d) return null;
                  const v = metric === "tread" ? d.treadMin[x.i] : d.press[x.i];
                  return typeof v === "number" ? v : v === "N/A" ? "N/A" : null;
                });
                const numPairs = vd
                  .map((x, k) => ({ d: x.d, v: series[k] }))
                  .filter((p) => typeof p.v === "number") as { d: string; v: number }[];

                return (
                  <tr key={p} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                    <td className="px-2 py-1.5 font-bold text-primary">{p}</td>
                    <td className="px-2 py-1.5 font-semibold">{HEAD_MAP[p]}</td>
                    <td className="px-2 py-1.5 text-[10px] max-w-25 truncate">
                      {d?.serial ? (
                        <button className="text-primary hover:underline truncate max-w-full" title={`${d.serial} · ${tx.lifeDb}`} onClick={() => onSerialClick?.(d.serial)}>
                          {d.serial}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">−</span>
                      )}
                    </td>
                    {series.map((v, si) => {
                      if (v == null) return <td key={si} className="px-2 py-1.5 text-muted-foreground/40 text-center">−</td>;
                      if (v === "N/A") return <td key={si} className="px-2 py-1.5 text-muted-foreground/50 text-center text-[10px]">N/A</td>;
                      const n = v as number;
                      let cls = "";
                      if (metric === "tread") {
                        if (n <= TREAD_DANGER) cls = "text-destructive font-bold";
                        else if (n <= TREAD_WARN) cls = "text-yellow-400 font-bold";
                        else cls = "text-green-400";
                      }
                      return (
                        <td key={si} className={`px-2 py-1.5 text-center ${cls}`}>{metric === "tread" ? n.toFixed(1) : Math.round(n)}</td>
                      );
                    })}
                    <td className="px-2 py-1.5 min-w-30">
                      <TinySparkline pairs={numPairs} metric={metric} />
                    </td>
                  </tr>
                );
              })}
              {/* HM / KM 행 */}
              <tr className="border-b border-border/40 bg-muted/5">
                <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-muted-foreground text-[10px]">HM</td>
                {vd.map((x) => (
                  <td key={x.d} className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">{fmtInt(u.hm[x.i])}</td>
                ))}
                <td />
              </tr>
              <tr className="border-b border-border/40 bg-muted/5">
                <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-muted-foreground text-[10px]">KM</td>
                {vd.map((x) => (
                  <td key={x.d} className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">{fmtInt(u.km[x.i])}</td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {tx.tableFoot}
        </p>
      </div>
    </div>
  );
}

function TinySparkline({ pairs, metric }: { pairs: { d: string; v: number }[]; metric: "tread" | "press" }) {
  if (pairs.length < 2) return <span className="text-muted-foreground text-[10px]">−</span>;
  const W = 100, H = 28, padX = 4;
  const vals = pairs.map((p) => p.v);
  const mn = Math.min(...vals) - 1;
  const mx = Math.max(...vals) + 1;
  const xs = (i: number) => padX + (i * (W - 2 * padX)) / (pairs.length - 1);
  const ys = (v: number) => H - 4 - ((v - mn) / (mx - mn)) * (H - 8);
  const path = pairs.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ");
  const last = pairs[pairs.length - 1].v;
  const color =
    metric === "tread"
      ? last <= TREAD_DANGER ? "#ef4444" : last <= TREAD_WARN ? "#eab308" : "#4ade80"
      : "#FFB800";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-7">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={xs(pairs.length - 1)} cy={ys(last)} r={2.5} fill={color} />
    </svg>
  );
}
