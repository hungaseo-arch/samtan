// @section: economics
// TCO 탭 «경제성 요약» (지시서 2026-10-16 §B-4).
//
// KPI 4장 · 차량별 표 · 목표 수명 대비 CPK · 월별 저압 노출/연료 손실 추이 · 엑셀.
// 단가·연비·유가·계수가 비어 있으면(전부 NULL 이 기본) 금액 자리에 «−» 와 «설정 필요» 를 쓴다.
// 0 으로 채우지 않는다 — 0 은 «손실 없음» 으로 읽힌다 (TcoTab 머리말과 같은 규칙).
// 연료·수명 손실은 전부 추정치다. 계수는 현장 실측으로 보정되기 전까지 가정값이다.
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { AlertTriangle, Download, Info } from "lucide-react";
import { useLang } from "@/i18n";
import { TMS_DATA, targetLifeKm } from "@/data/tmsData";
import { fleetEconomics, type EconomicsRow } from "@/data/tmsUtils";
import { toIdr } from "@/lib/economics";
import {
  EMPTY, fmtCpk, fmtDistanceKm, fmtInt, fmtLitre, fmtMoneyReport, fmtNumber, fmtPercent, todayInField,
} from "@/lib/format";
import { HEX, LEVEL_HEX } from "@/lib/chartColors";

const TX = {
  ko: {
    title: "경제성 요약",
    sub: "장착 타이어 원가 · 공기압 준수 · 저압 손실 추정 (추정치)",
    kCpk: "플릿 평균 CPK",
    kCpkSub: "장착 타이어 본당 실적 CPK 평균",
    kComp: "공기압 준수율",
    kCompSub: "권장 ±5% 이내 측정 회차 비율",
    kFuel: "누적 연료 손실 추정액",
    kFuelSub: "저압 노출 × 연료 민감도 × 기준 연비 × 유가",
    kLife: "누적 수명 손실 추정액",
    kLifeSub: "저압 노출 × 수명 민감도 × 타이어 CPK",
    setup: "설정 필요",
    setupHelp: "관리 › 경제성 계수 / TCO › 원가 설정",
    mixed: "통화 혼재 — 합산 불가",
    tableTitle: "차량별",
    cCh: "차량",
    cKm: "주행 KM",
    cTires: "단가 입력",
    cTotal: "장착 타이어 총비용",
    cCpk: "실적 CPK",
    cExp: "예상 CPK",
    cComp: "준수율",
    cExpo: "저압 노출 (%·km)",
    cFuelL: "연료 손실",
    cFuel: "연료 손실액",
    cLife: "수명 손실",
    cLifeCost: "수명 손실액",
    targetTitle: "목표 수명 대비",
    targetSub: (km: string) => `목표 수명 ${km} 달성 시 CPK 와 현재 예상 CPK 비교`,
    cTarget: "목표 CPK",
    cAchieved: "목표 달성 본수",
    targetNone: "단가가 입력된 차량이 없어 비교할 수 없습니다 — 설정 필요",
    monthTitle: "월별 추이",
    monthSub: "저압 노출(막대) · 추가 연료(선). 회차가 속한 달로 집계",
    monthNone: "저압 노출 기록이 없습니다.",
    sExpo: "저압 노출 (%·km)",
    sFuel: "추가 연료 (L)",
    download: "엑셀 다운로드",
    sheetVehicle: "차량별",
    sheetMonthly: "월별",
    sheetCoef: "계수",
    coefName: "계수",
    coefValue: "값",
    month: "월",
    notesTitle: "각주 — 사용한 계수",
    fx: "환율 USD→IDR",
    fuelBase: "기준 연비 (L/km, 차량)",
    fuelPrice: "유가",
    fuelSens: "연료 민감도 (10% 저압당 %)",
    lifeSens: "수명 민감도 (10% 저압당 %)",
    target: "목표 수명",
    unset: "미설정",
    estimate:
      "연료·수명 손실은 추정치입니다. 계수는 가정값 — 현장 실측으로 보정 필요. 측정 회차의 공기압이 다음 회차까지 유지됐다고 가정합니다.",
    cpkNote:
      "차량 CPK = 장착 10본의 본당 CPK 합(차량 1 km 당 타이어 원가). 한 본이라도 단가가 없거나 통화가 섞이면 비웁니다.",
  },
  id: {
    title: "Ringkasan ekonomi",
    sub: "Biaya ban terpasang · kepatuhan tekanan angin · estimasi kerugian tekanan rendah (estimasi)",
    kCpk: "Rata-rata CPK armada",
    kCpkSub: "rata-rata CPK aktual per ban terpasang",
    kComp: "Kepatuhan tekanan angin",
    kCompSub: "porsi pemeriksaan dalam ±5% rekomendasi",
    kFuel: "Estimasi kerugian bahan bakar kumulatif",
    kFuelSub: "paparan tekanan rendah × sensitivitas BBM × konsumsi dasar × harga BBM",
    kLife: "Estimasi kerugian umur kumulatif",
    kLifeSub: "paparan tekanan rendah × sensitivitas umur × CPK ban",
    setup: "Perlu diatur",
    setupHelp: "Admin › koefisien ekonomi / TCO › pengaturan biaya",
    mixed: "Mata uang campuran — tidak bisa dijumlah",
    tableTitle: "Per unit",
    cCh: "Unit",
    cKm: "KM tempuh",
    cTires: "Harga terisi",
    cTotal: "Total biaya ban terpasang",
    cCpk: "CPK aktual",
    cExp: "CPK prediksi",
    cComp: "Kepatuhan",
    cExpo: "Paparan tekanan rendah (%·km)",
    cFuelL: "Kerugian BBM",
    cFuel: "Nilai kerugian BBM",
    cLife: "Kerugian umur",
    cLifeCost: "Nilai kerugian umur",
    targetTitle: "Dibanding target umur",
    targetSub: (km: string) => `CPK bila target umur ${km} tercapai vs CPK prediksi saat ini`,
    cTarget: "CPK target",
    cAchieved: "Ban mencapai target",
    targetNone: "Belum ada unit dengan harga terisi — perlu diatur",
    monthTitle: "Tren bulanan",
    monthSub: "Paparan tekanan rendah (batang) · BBM tambahan (garis). Dikelompokkan per bulan pemeriksaan",
    monthNone: "Tidak ada catatan paparan tekanan rendah.",
    sExpo: "Paparan tekanan rendah (%·km)",
    sFuel: "BBM tambahan (L)",
    download: "Unduh Excel",
    sheetVehicle: "Per unit",
    sheetMonthly: "Bulanan",
    sheetCoef: "Koefisien",
    coefName: "Koefisien",
    coefValue: "Nilai",
    month: "Bulan",
    notesTitle: "Catatan — koefisien yang dipakai",
    fx: "Kurs USD→IDR",
    fuelBase: "Konsumsi dasar (L/km, unit)",
    fuelPrice: "Harga BBM",
    fuelSens: "Sensitivitas BBM (% per 10% kurang)",
    lifeSens: "Sensitivitas umur (% per 10% kurang)",
    target: "Target umur",
    unset: "belum diatur",
    estimate:
      "Kerugian BBM dan umur adalah estimasi. Koefisien adalah asumsi — perlu dikoreksi dengan pengukuran lapangan. Tekanan tiap pemeriksaan dianggap bertahan sampai pemeriksaan berikutnya.",
    cpkNote:
      "CPK unit = jumlah CPK per ban dari 10 ban terpasang (biaya ban per 1 km unit). Dikosongkan bila ada ban tanpa harga atau mata uang campuran.",
  },
  en: {
    title: "Economics summary",
    sub: "Mounted tire cost · pressure compliance · under-inflation loss estimates (estimates)",
    kCpk: "Fleet average CPK",
    kCpkSub: "mean actual CPK per mounted tire",
    kComp: "Pressure compliance",
    kCompSub: "share of rounds within ±5% of recommended",
    kFuel: "Cumulative fuel loss (est.)",
    kFuelSub: "under-inflation exposure × fuel sensitivity × base consumption × fuel price",
    kLife: "Cumulative life loss (est.)",
    kLifeSub: "under-inflation exposure × life sensitivity × tire CPK",
    setup: "Setup needed",
    setupHelp: "Admin › economics coefficients / TCO › cost settings",
    mixed: "Mixed currencies — cannot sum",
    tableTitle: "By vehicle",
    cCh: "Unit",
    cKm: "Driven KM",
    cTires: "Priced",
    cTotal: "Mounted tire total cost",
    cCpk: "Actual CPK",
    cExp: "Projected CPK",
    cComp: "Compliance",
    cExpo: "Under-inflation exposure (%·km)",
    cFuelL: "Fuel loss",
    cFuel: "Fuel loss cost",
    cLife: "Life loss",
    cLifeCost: "Life loss cost",
    targetTitle: "Against target life",
    targetSub: (km: string) => `CPK if the ${km} target life is reached vs current projected CPK`,
    cTarget: "Target CPK",
    cAchieved: "Tires reaching target",
    targetNone: "No vehicle has prices yet — setup needed",
    monthTitle: "Monthly trend",
    monthSub: "Under-inflation exposure (bars) · extra fuel (line). Grouped by inspection month",
    monthNone: "No under-inflation exposure recorded.",
    sExpo: "Under-inflation exposure (%·km)",
    sFuel: "Extra fuel (L)",
    download: "Download Excel",
    sheetVehicle: "By vehicle",
    sheetMonthly: "Monthly",
    sheetCoef: "Coefficients",
    coefName: "Coefficient",
    coefValue: "Value",
    month: "Month",
    notesTitle: "Notes — coefficients used",
    fx: "FX USD→IDR",
    fuelBase: "Base consumption (L/km, vehicle)",
    fuelPrice: "Fuel price",
    fuelSens: "Fuel sensitivity (% per 10% under)",
    lifeSens: "Life sensitivity (% per 10% under)",
    target: "Target life",
    unset: "not set",
    estimate:
      "Fuel and life losses are estimates. Coefficients are assumptions — to be calibrated with field measurements. Each round's pressure is assumed to hold until the next round.",
    cpkNote:
      "Vehicle CPK = sum of per-tire CPK of the 10 mounted tires (tire cost per vehicle km). Left blank if any tire lacks a price or currencies are mixed.",
  },
};

type Tx = (typeof TX)["ko"];

/** 보고서 금액 + (USD 이고 환율이 있으면) IDR 병기 */
function money(v: number | null, cur: string | null): string {
  if (v == null || !cur) return EMPTY;
  const idr = cur === "USD" ? toIdr(v, cur, TMS_DATA.tire.fxUsdIdr) : null;
  return idr != null ? `${fmtMoneyReport(v, cur)} (${fmtMoneyReport(idr, "IDR")})` : fmtMoneyReport(v, cur);
}

export default function EconomicsSection() {
  const { lang } = useLang();
  const tx: Tx = TX[lang];
  // TMS_DATA 는 loadData() 로 갈아끼워지므로 렌더마다 다시 계산한다 (차량 7대 × 10본 — 가볍다)
  const f = fleetEconomics();
  const t = TMS_DATA.tire;
  const target = targetLifeKm();

  const fuelCur = f.fuelCurrency;
  const lifeMixed = f.lifeCost == null && f.lifeCurrency != null && f.rows.some((r) => r.econ.lifeCost != null);

  const targetRows = f.rows.filter((r) => r.targetCpk != null);
  const chartRows = targetRows.map((r) => ({ ch: r.ch, target: r.targetCpk, exp: r.expCpk }));
  const chartCur = targetRows[0]?.currency ?? "IDR";

  const coefs: [string, string][] = [
    [tx.fx, t.fxUsdIdr != null ? fmtNumber(t.fxUsdIdr) : tx.unset],
    [tx.fuelBase, t.fuelBaseLPerKm != null ? fmtNumber(t.fuelBaseLPerKm) : tx.unset],
    [tx.fuelPrice, t.fuelPrice != null ? fmtMoneyReport(t.fuelPrice, fuelCur) : tx.unset],
    [tx.fuelSens, t.fuelSensPer10Pct != null ? fmtPercent(t.fuelSensPer10Pct) : tx.unset],
    [tx.lifeSens, t.lifeSensPer10Pct != null ? fmtPercent(t.lifeSensPer10Pct) : tx.unset],
    [tx.target, fmtDistanceKm(target)],
  ];

  const download = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const vehicle = f.rows.map((r) => ({
      [tx.cCh]: r.ch,
      [tx.cKm]: r.km != null ? Math.round(r.km) : null,
      [tx.cTires]: `${r.priced}/${r.mounted}`,
      [tx.cTotal]: money(r.totalCost, r.currency),
      [tx.cCpk]: fmtCpk(r.cpk, r.currency ?? undefined),
      [tx.cExp]: fmtCpk(r.expCpk, r.currency ?? undefined),
      [tx.cTarget]: fmtCpk(r.targetCpk, r.currency ?? undefined),
      [tx.cAchieved]: `${r.achieved}/${r.evaluated}`,
      [tx.cComp]: fmtPercent(r.compliance.pct),
      [tx.cExpo]: Math.round(r.econ.exposure),
      [tx.cFuelL]: fmtLitre(r.econ.fuelL),
      [tx.cFuel]: money(r.econ.fuelCost, r.econ.fuelCurrency),
      [tx.cLife]: fmtDistanceKm(r.econ.lifeKm),
      [tx.cLifeCost]: money(r.econ.lifeCost, r.econ.lifeCurrency),
    }));
    const ws1 = XLSX.utils.json_to_sheet(vehicle);
    ws1["!cols"] = Object.keys(vehicle[0] ?? {}).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws1, tx.sheetVehicle);
    const ws2 = XLSX.utils.json_to_sheet(
      f.monthly.map((m) => ({
        [tx.month]: m.month,
        [tx.sExpo]: Math.round(m.exposure),
        [tx.sFuel]: fmtLitre(m.fuelL),
        [tx.cFuel]: money(m.fuelCost, fuelCur),
      })),
    );
    ws2["!cols"] = [{ wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws2, tx.sheetMonthly);
    const ws3 = XLSX.utils.json_to_sheet([
      ...coefs.map(([k, v]) => ({ [tx.coefName]: k, [tx.coefValue]: v })),
      { [tx.coefName]: "", [tx.coefValue]: tx.estimate },
    ]);
    ws3["!cols"] = [{ wch: 36 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws3, tx.sheetCoef);
    XLSX.writeFile(wb, `SAMTAN_TMS_economics_${todayInField().replace(/-/g, "")}.xlsx`);
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-primary" />
            <h3 className="text-sm font-bold text-foreground">{tx.title}</h3>
          </div>
          <p className="mt-1 ml-3 text-xs text-muted-foreground">{tx.sub}</p>
        </div>
        <button
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted/40"
        >
          <Download className="w-3.5 h-3.5" />
          {tx.download}
        </button>
      </div>

      {/* KPI 4장 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={tx.kCpk} sub={tx.kCpkSub} tx={tx}
          value={f.avgCpk != null ? fmtCpk(f.avgCpk, f.avgCpkCurrency ?? undefined) : null} />
        <KpiCard label={tx.kComp} sub={tx.kCompSub} tx={tx}
          value={f.compliance.pct != null ? fmtPercent(f.compliance.pct) : null}
          extra={f.compliance.total ? `${fmtInt(f.compliance.ok)} / ${fmtInt(f.compliance.total)}` : undefined} />
        <KpiCard label={tx.kFuel} sub={tx.kFuelSub} tx={tx}
          value={f.fuelCost != null ? money(f.fuelCost, fuelCur) : null} />
        <KpiCard label={tx.kLife} sub={tx.kLifeSub} tx={tx}
          value={f.lifeCost != null ? money(f.lifeCost, f.lifeCurrency ?? "IDR") : null}
          extra={lifeMixed ? tx.mixed : undefined} />
      </div>

      {/* 차량별 표 */}
      <p className="mt-5 mb-2 text-xs font-bold text-foreground">{tx.tableTitle}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              {[tx.cCh, tx.cKm, tx.cTires, tx.cTotal, tx.cCpk, tx.cExp, tx.cComp, tx.cExpo, tx.cFuelL, tx.cFuel, tx.cLife, tx.cLifeCost]
                .map((h, i) => <th key={h} className={`${HEAD} ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {f.rows.map((r) => <VehicleRow key={r.ch} r={r} />)}
          </tbody>
        </table>
      </div>

      {/* 목표 수명 대비 */}
      <p className="mt-5 mb-1 text-xs font-bold text-foreground">{tx.targetTitle}</p>
      <p className="mb-2 text-[11px] text-muted-foreground">{tx.targetSub(fmtDistanceKm(target))}</p>
      {chartRows.length === 0 ? (
        <Note tone="warn">{tx.targetNone}</Note>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
              <XAxis dataKey="ch" tick={{ fontSize: 11, fill: HEX.ink }} />
              <YAxis tick={{ fontSize: 11, fill: HEX.ink }} width={90}
                tickFormatter={(v: number) => fmtCpk(v, chartCur)} />
              <Tooltip formatter={(v: number, n) => [fmtCpk(v, chartCur), String(n)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="target" name={tx.cTarget} fill={HEX.sage} stroke={HEX.ink} />
              <Bar dataKey="exp" name={tx.cExp} fill={HEX.blue} stroke={HEX.ink} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {f.rows.map((r) => (
              <span key={r.ch} className="font-mono">
                {r.ch} · {tx.cAchieved} {r.evaluated ? `${fmtInt(r.achieved)}/${fmtInt(r.evaluated)}` : EMPTY}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 월별 추이 */}
      <p className="mt-5 mb-1 text-xs font-bold text-foreground">{tx.monthTitle}</p>
      <p className="mb-2 text-[11px] text-muted-foreground">{tx.monthSub}</p>
      {f.monthly.every((m) => m.exposure === 0) ? (
        <Note tone="info">{tx.monthNone}</Note>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={f.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: HEX.ink }} />
              <YAxis yAxisId="e" tick={{ fontSize: 11, fill: HEX.ink }} width={70}
                tickFormatter={(v: number) => fmtInt(v)} />
              <YAxis yAxisId="f" orientation="right" tick={{ fontSize: 11, fill: HEX.ink }} width={70}
                tickFormatter={(v: number) => fmtLitre(v)} />
              <Tooltip formatter={(v: number, n, item) =>
                [item.dataKey === "fuelL" ? fmtLitre(v) : fmtInt(v), String(n)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="e" dataKey="exposure" name={tx.sExpo} fill={HEX.blue} stroke={HEX.ink} />
              <Line yAxisId="f" dataKey="fuelL" name={tx.sFuel} stroke={LEVEL_HEX.order} strokeWidth={2}
                dot={{ r: 3 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 각주 */}
      <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <p className="text-[11px] font-bold text-muted-foreground">{tx.notesTitle}</p>
        <ul className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-[11px] text-muted-foreground">
          {coefs.map(([k, v]) => (
            <li key={k} className="flex justify-between gap-2">
              <span>{k}</span><span className="font-mono">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] font-semibold" style={{ color: HEX.warn }}>{tx.estimate}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{tx.cpkNote}</p>
      </div>
    </section>
  );
}

const HEAD = "px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap";
const NUM = "px-3 py-1.5 text-right font-mono whitespace-nowrap";

function VehicleRow({ r }: { r: EconomicsRow }) {
  const cur = r.currency ?? undefined;
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-1.5 font-mono font-semibold whitespace-nowrap">{r.ch}</td>
      <td className={NUM}>{fmtDistanceKm(r.km)}</td>
      <td className={NUM}>{fmtInt(r.priced)}/{fmtInt(r.mounted)}</td>
      <td className={NUM}>{money(r.totalCost, r.currency)}</td>
      <td className={NUM}>{fmtCpk(r.cpk, cur)}</td>
      <td className={NUM}>{fmtCpk(r.expCpk, cur)}</td>
      <td className={NUM}>{fmtPercent(r.compliance.pct)}</td>
      <td className={NUM}>{r.compliance.total ? fmtInt(r.econ.exposure) : EMPTY}</td>
      <td className={NUM}>{fmtLitre(r.econ.fuelL)}</td>
      <td className={NUM}>{money(r.econ.fuelCost, r.econ.fuelCurrency)}</td>
      <td className={NUM}>{fmtDistanceKm(r.econ.lifeKm)}</td>
      <td className={NUM}>{money(r.econ.lifeCost, r.econ.lifeCurrency)}</td>
    </tr>
  );
}

/** 값이 null 이면 «−» + «설정 필요» — 0 으로 채우지 않는다 */
function KpiCard({ label, sub, value, extra, tx }: {
  label: string; sub: string; value: string | null; extra?: string; tx: Tx;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5" style={{ borderTopColor: HEX.blue, borderTopWidth: 3 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {value != null ? (
        <p className="mt-1 font-mono text-lg font-bold text-foreground">{value}</p>
      ) : (
        <>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{EMPTY}</p>
          <p className="text-xs font-bold" style={{ color: HEX.warn }}>{tx.setup}</p>
          <p className="text-[10px] text-muted-foreground">{tx.setupHelp}</p>
        </>
      )}
      {extra && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{extra}</p>}
      <p className="mt-1 text-[10px] text-muted-foreground/80">{sub}</p>
    </div>
  );
}

function Note({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tone === "warn" ? HEX.warn : HEX.ink }} />
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
