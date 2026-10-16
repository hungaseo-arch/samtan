// @section: fleet-wear-view
// 추이 탭 › 전체 비교 (지시서 2026-10-16 §A-6).
//
// ① 차트 : x = 타이어 주행 km(첫 측정 이후), y = 트레드. 전 차량 × 10포지션 구간 선을
//          축 그룹(조향 / 구동 외측 / 구동 내측) 색으로 겹쳐 그린다. 차량 체크박스로 거른다.
// ② 표   : 차량 × 포지션 마모율(mm/1,000 km). 전 차량 평균 대비 +20% 노랑, +40% 빨강.
// ③ 좌우 편차 : 차량별 좌·우 평균 마모율 차이 ≥15% 면 경고 1줄.
// 표의 셀에 마우스를 올리면 차트에서 그 포지션 선만 진하게 보인다.
import { useMemo, useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TMS_DATA, HEAD_MAP, treadThresholds } from "@/data/tmsData";
import { posSegments, positionWearRate, segmentKmCurve, vehicleWearRate } from "@/data/tmsUtils";
import { fmtInt, fmtPercent, fmtWearRate, todayInField } from "@/lib/format";
import { HEX, LEVEL_HEX, SERIES } from "@/lib/chartColors";
import {
  axleGroupOf, meanOf, sideImbalance, wearDevLevel,
  WEAR_DEV_WARN, WEAR_DEV_DANGER, SIDE_DEV_WARN, type AxleGroup, type WearDevLevel,
} from "@/lib/fleetWear";
import { useLang } from "@/i18n";

const GROUP_HEX: Record<AxleGroup, string> = { steer: SERIES[0], outer: SERIES[4], inner: SERIES[8] };

const DEV_CLS: Record<WearDevLevel, string> = {
  ok: "",
  warn: "bg-level-warn/10 text-level-warn font-bold",
  danger: "bg-level-danger/10 text-level-danger font-bold",
};

const pct = (r: number) => Math.round(r * 100);

const TX = {
  ko: {
    vehicles: "차량:",
    chartTitle: "전 차량 트레드 vs 주행 km",
    xLabel: "타이어 주행 km (첫 측정 이후)",
    steer: "조향 (L1·R1)", outer: "구동 외측", inner: "구동 내측",
    matrixTitle: "마모율 비교 (mm/1,000 km)",
    unitCol: "차량", vehCol: "차량 전체",
    meanRow: "전 차량 평균",
    excel: "엑셀 다운로드",
    legendDev: `평균 대비 +${pct(WEAR_DEV_WARN)}% 이상 노랑 · +${pct(WEAR_DEV_DANGER)}% 이상 빨강`,
    side: (ch: string, l: string, r: string, d: string) =>
      `CH ${ch} 좌우 편차 ${d} — 좌 ${l} / 우 ${r}. 정렬·토인 점검을 권장합니다.`,
    sideNone: `좌우 평균 마모율 차이가 ${pct(SIDE_DEV_WARN)}% 이상인 차량이 없습니다.`,
    foot: "마모율은 같은 시리얼의 인접 회차 구간만으로 계산합니다 (트레드 증가·km 미증가·트레드 0 구간 제외). 포지션 값에는 교체 전 타이어 구간도 포함됩니다. 평균은 차량 선택과 무관하게 전 차량 포지션 값의 산술평균입니다.",
    noData: "비교할 마모율 데이터가 없습니다 (km 미기록이거나 회차가 부족합니다).",
    sheet: "마모율", sheetSide: "좌우 편차", colLeft: "좌 평균", colRight: "우 평균", colDiff: "편차",
  },
  id: {
    vehicles: "Unit:",
    chartTitle: "Kedalaman alur vs km tempuh — semua Unit",
    xLabel: "km tempuh ban (sejak pengukuran pertama)",
    steer: "Kemudi (L1·R1)", outer: "Penggerak luar", inner: "Penggerak dalam",
    matrixTitle: "Perbandingan laju Aus (mm/1,000 km)",
    unitCol: "Unit", vehCol: "Seluruh Unit",
    meanRow: "Rata-rata semua Unit",
    excel: "Unduh Excel",
    legendDev: `≥ +${pct(WEAR_DEV_WARN)}% dari rata-rata kuning · ≥ +${pct(WEAR_DEV_DANGER)}% merah`,
    side: (ch: string, l: string, r: string, d: string) =>
      `CH ${ch} selisih Kiri·Kanan ${d} — Kiri ${l} / Kanan ${r}. Disarankan periksa alignment·toe-in.`,
    sideNone: `Tidak ada Unit dengan selisih laju Aus Kiri·Kanan ≥ ${pct(SIDE_DEV_WARN)}%.`,
    foot: "Laju Aus dihitung hanya dari interval Pemeriksaan berurutan dengan serial yang sama (interval dengan alur naik, km tidak bertambah, atau alur 0 dikecualikan). Nilai Posisi juga mencakup ban sebelum Penggantian. Rata-rata adalah rata-rata aritmetika semua Posisi di semua Unit, tidak tergantung pilihan Unit.",
    noData: "Tidak ada data laju Aus untuk dibandingkan (km tidak tercatat atau Pemeriksaan kurang).",
    sheet: "Laju Aus", sheetSide: "Selisih Kiri-Kanan", colLeft: "Rata-rata Kiri", colRight: "Rata-rata Kanan", colDiff: "Selisih",
  },
  en: {
    vehicles: "Vehicles:",
    chartTitle: "Tread vs km driven — all vehicles",
    xLabel: "Tire km driven (since first measurement)",
    steer: "Steer (L1·R1)", outer: "Drive outer", inner: "Drive inner",
    matrixTitle: "Wear rate comparison (mm/1,000 km)",
    unitCol: "Vehicle", vehCol: "Vehicle total",
    meanRow: "Fleet average",
    excel: "Download Excel",
    legendDev: `≥ +${pct(WEAR_DEV_WARN)}% over average yellow · ≥ +${pct(WEAR_DEV_DANGER)}% red`,
    side: (ch: string, l: string, r: string, d: string) =>
      `CH ${ch} left/right imbalance ${d} — left ${l} / right ${r}. Check alignment and toe-in.`,
    sideNone: `No vehicle has a left/right wear-rate difference of ${pct(SIDE_DEV_WARN)}% or more.`,
    foot: "Wear rates use only adjacent-round intervals on the same serial (intervals with rising tread, non-increasing km, or zero tread are excluded). Position values include tires removed before replacement. The average is the arithmetic mean of all positions on all vehicles, regardless of the vehicle filter.",
    noData: "No wear-rate data to compare (km not recorded, or too few rounds).",
    sheet: "Wear rate", sheetSide: "Left-right imbalance", colLeft: "Left avg", colRight: "Right avg", colDiff: "Imbalance",
  },
} as const;

export default function FleetWearView() {
  const { lang } = useLang();
  const tx = TX[lang];
  const th = treadThresholds();
  const positions = useMemo(() => Array.from({ length: 10 }, (_, i) => HEAD_MAP[i + 1]), []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(TMS_DATA.units.map((u) => u.ch)));
  const [hover, setHover] = useState<string | null>(null);

  // 차량 × 포지션 마모율. 평균은 필터와 무관하게 전 차량 기준이다 — 거를 때마다 색이 바뀌면 비교가 안 된다.
  const matrix = useMemo(() => TMS_DATA.units.map((u) => ({
    ch: u.ch,
    cells: positions.map((pos) => ({ pos, rate: positionWearRate(u.ch, pos)?.mmPer1000Km ?? null })),
    vehicle: vehicleWearRate(u.ch)?.mmPer1000Km ?? null,
  })), [positions]);
  const mean = useMemo(
    () => meanOf(matrix.flatMap((m) => m.cells.map((c) => c.rate)).filter((x): x is number => x != null)),
    [matrix],
  );
  const posMean = (pos: string) =>
    meanOf(matrix.map((m) => m.cells.find((c) => c.pos === pos)?.rate).filter((x): x is number => x != null));

  const lines = useMemo(() => TMS_DATA.units.flatMap((u) => positions.flatMap((pos) =>
    posSegments(u.ch, pos).map((seg) => ({
      key: `${u.ch}|${pos}|${seg.segNo}`, ch: u.ch, pos,
      group: axleGroupOf(pos), data: segmentKmCurve(u, seg),
    })).filter((l) => l.data.length >= 2),
  )), [positions]);

  const shown = matrix.filter((m) => selected.has(m.ch));
  const sides = shown.map((m) => ({ ch: m.ch, s: sideImbalance(m.cells) })).filter((x) => x.s?.warn);

  const toggle = (ch: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(ch)) n.delete(ch); else n.add(ch);
    return n;
  });

  const exportExcel = async () => {
    // 숫자는 숫자 셀로 내린다 — 엑셀에서 다시 계산할 수 있게 소수 3자리로만 반올림
    const r3 = (v: number | null) => (v == null ? "" : Math.round(v * 1000) / 1000);
    const rows = shown.map((m) => {
      const row: Record<string, string | number> = { [tx.unitCol]: `CH ${m.ch}` };
      m.cells.forEach((c) => { row[c.pos] = r3(c.rate); });
      row[tx.vehCol] = r3(m.vehicle);
      return row;
    });
    const avg: Record<string, string | number> = { [tx.unitCol]: tx.meanRow };
    positions.forEach((p) => { avg[p] = r3(posMean(p)); });
    avg[tx.vehCol] = r3(mean);
    rows.push(avg);
    const sideRows = shown.map((m) => {
      const s = sideImbalance(m.cells);
      return {
        [tx.unitCol]: `CH ${m.ch}`,
        [tx.colLeft]: s ? r3(s.left) : "", [tx.colRight]: s ? r3(s.right) : "",
        [tx.colDiff]: s ? Math.round(s.ratio * 1000) / 10 : "",
      };
    });
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, ...positions.map(() => ({ wch: 9 })), { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, tx.sheet);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sideRows), tx.sheetSide);
    XLSX.writeFile(wb, `FleetWearRate_${todayInField()}.xlsx`);
  };

  const hasRates = mean != null;

  return (
    <div className="space-y-4">
      {/* 차량 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-semibold">{tx.vehicles}</span>
        {TMS_DATA.units.map((u) => (
          <label key={u.ch} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-muted/30 text-xs font-mono font-bold cursor-pointer">
            <input type="checkbox" checked={selected.has(u.ch)} onChange={() => toggle(u.ch)} />
            CH {u.ch}
          </label>
        ))}
      </div>

      {/* 차트 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.chartTitle}</span>
          <div className="ml-auto flex flex-wrap gap-3 text-[11px]">
            {(["steer", "outer", "inner"] as const).map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5" style={{ color: GROUP_HEX[g] }}>
                <span className="inline-block w-4 h-0.5" style={{ background: GROUP_HEX[g] }} />
                {tx[g]}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart margin={{ top: 10, right: 20, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
            <XAxis
              type="number" dataKey="km" domain={[0, "auto"]} allowDuplicatedCategory={false}
              tick={{ fontSize: 11, fill: HEX.ink }} tickFormatter={(v: number) => fmtInt(v)}
              label={{ value: tx.xLabel, position: "insideBottom", offset: -8, fontSize: 11, fill: HEX.ink }}
            />
            <YAxis type="number" domain={[0, 24]} tick={{ fontSize: 11, fill: HEX.ink }} tickFormatter={(v) => `${v}mm`} />
            <ReferenceLine y={th.order} stroke={LEVEL_HEX.order} strokeDasharray="4 4" />
            <ReferenceLine y={th.critical} stroke={LEVEL_HEX.danger} strokeDasharray="4 4" />
            {lines.filter((l) => selected.has(l.ch)).map((l) => {
              const hot = hover === `${l.ch}|${l.pos}`;
              return (
                <Line
                  key={l.key} data={l.data} dataKey="tread" name={`CH ${l.ch} ${l.pos}`}
                  stroke={GROUP_HEX[l.group]} strokeWidth={hot ? 3 : 1.2}
                  strokeOpacity={hover && !hot ? 0.15 : 0.8}
                  dot={false} isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 마모율 표 */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.matrixTitle}</span>
          <span className="text-[11px] text-muted-foreground">{tx.legendDev}</span>
          <button
            onClick={exportExcel}
            disabled={!hasRates}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold hover:bg-muted/40 disabled:opacity-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> {tx.excel}
          </button>
        </div>
        {!hasRates ? (
          <p className="text-xs text-muted-foreground">{tx.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">{tx.unitCol}</th>
                  {positions.map((p) => <th key={p} className="px-2 py-1.5 text-right whitespace-nowrap">{p}</th>)}
                  <th className="px-2 py-1.5 text-right">{tx.vehCol}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.ch} className="border-b border-border/50">
                    <td className="px-2 py-1.5 font-bold whitespace-nowrap">CH {m.ch}</td>
                    {m.cells.map((c) => {
                      const lv = wearDevLevel(c.rate, mean);
                      return (
                        <td
                          key={c.pos}
                          onMouseEnter={() => setHover(`${m.ch}|${c.pos}`)}
                          onMouseLeave={() => setHover(null)}
                          className={`px-2 py-1.5 text-right tabular-nums ${lv ? DEV_CLS[lv] : "text-muted-foreground"}`}
                        >
                          {fmtWearRate(c.rate, false)}
                        </td>
                      );
                    })}
                    <td className={`px-2 py-1.5 text-right tabular-nums ${DEV_CLS[wearDevLevel(m.vehicle, mean) ?? "ok"]}`}>
                      {fmtWearRate(m.vehicle, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-bold">
                  <td className="px-2 py-1.5 whitespace-nowrap">{tx.meanRow}</td>
                  {positions.map((p) => (
                    <td key={p} className="px-2 py-1.5 text-right tabular-nums">{fmtWearRate(posMean(p), false)}</td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtWearRate(mean, false)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* 좌우 편차 */}
        {hasRates && (sides.length ? (
          <ul className="space-y-1">
            {sides.map(({ ch, s }) => (
              <li key={ch} className="flex items-start gap-2 rounded-md border border-level-warn/40 bg-level-warn/10 px-2.5 py-1.5 text-xs text-level-warn">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {tx.side(ch, fmtWearRate(s!.left, false), fmtWearRate(s!.right, false), fmtPercent(s!.ratio * 100))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{tx.sideNone}</p>
        ))}
        <p className="text-[11px] text-muted-foreground">{tx.foot}</p>
      </div>
    </div>
  );
}
