// @section: pressure-history
// 공기압관리 탭 «공기압 이력 분석» (지시서 2026-10-16 §B-2).
//
// 차량별 준수율 · 포지션별 평균 편차 · 저압 노출 상위 5본. 준수율 ${COMPLIANCE_WARN_PCT}% 미만 차량은 노랑.
import { TMS_DATA, HEAD_MAP, pressureThresholds } from "@/data/tmsData";
import { topUnderinflated, unitKmMissing, vehiclePressureStats } from "@/data/tmsUtils";
import { judgePressure } from "@/lib/pressureJudge";
import { EMPTY, fmtInt, fmtPercent, fmtVehicle } from "@/lib/format";
import { useLang } from "@/i18n";

/** 준수율 경고 기준(%) — 지시서 §B-2 */
export const COMPLIANCE_WARN_PCT = 80;

const TX = {
  ko: {
    title: "공기압 이력 분석",
    vehTitle: "차량별 준수율 · 포지션별 평균 편차",
    colCh: "차량",
    colCompliance: "준수율",
    colRounds: "정상/측정",
    colExposure: "저압 노출",
    kmMissing: "주행거리 미입력",
    topTitle: "저압 노출 상위 5본",
    colRank: "순위",
    colSerial: "시리얼",
    colAt: "현재 위치",
    detached: "탈착",
    fleet: "전체",
    none: "저압 노출이 기록된 타이어가 없습니다.",
    foot: (warn: string) =>
      `준수율 = 정상(권장 대비 ±${warn} 이내) 회차 ÷ 측정 회차. ${COMPLIANCE_WARN_PCT}% 미만 차량은 노랑. 평균 편차는 부호 유지(− 저압).`,
    footExposure:
      "저압 노출(%·km) = Σ 저압 회차의 (권장 − 실측)/권장 × 다음 회차까지 주행 KM. 가정: 각 회차의 공기압이 다음 회차까지 그대로 유지됐다. 정상 범위 안의 소폭 저압·다음 회차 KM 이 없는 회차는 넣지 않습니다.",
  },
  id: {
    title: "Analisis riwayat tekanan angin",
    vehTitle: "Kepatuhan per unit · deviasi rata-rata per posisi",
    colCh: "Unit",
    colCompliance: "Kepatuhan",
    colRounds: "Normal/diukur",
    colExposure: "Paparan tekanan rendah",
    kmMissing: "KM belum diisi",
    topTitle: "5 ban dengan paparan tekanan rendah tertinggi",
    colRank: "No",
    colSerial: "Serial",
    colAt: "Posisi saat ini",
    detached: "dilepas",
    fleet: "Total",
    none: "Belum ada ban dengan paparan tekanan rendah.",
    foot: (warn: string) =>
      `Kepatuhan = pemeriksaan normal (dalam ±${warn} dari rekomendasi) ÷ pemeriksaan terukur. Unit di bawah ${COMPLIANCE_WARN_PCT}% berwarna kuning. Deviasi rata-rata bertanda (− = rendah).`,
    footExposure:
      "Paparan tekanan rendah (%·km) = Σ (rekomendasi − aktual)/rekomendasi pada pemeriksaan bertekanan rendah × KM sampai pemeriksaan berikutnya. Asumsi: tekanan tiap pemeriksaan bertahan sampai pemeriksaan berikutnya. Kekurangan kecil dalam rentang normal dan pemeriksaan tanpa KM berikutnya tidak dihitung.",
  },
  en: {
    title: "Pressure history analysis",
    vehTitle: "Compliance per unit · average deviation per position",
    colCh: "Unit",
    colCompliance: "Compliance",
    colRounds: "Normal/measured",
    colExposure: "Under-inflation exposure",
    kmMissing: "Distance not entered",
    topTitle: "Top 5 tires by under-inflation exposure",
    colRank: "#",
    colSerial: "Serial",
    colAt: "Current position",
    detached: "removed",
    fleet: "Fleet",
    none: "No tire has recorded under-inflation exposure.",
    foot: (warn: string) =>
      `Compliance = normal rounds (within ±${warn} of recommended) ÷ measured rounds. Units below ${COMPLIANCE_WARN_PCT}% are yellow. Average deviation is signed (− = low).`,
    footExposure:
      "Under-inflation exposure (%·km) = Σ (recommended − actual)/recommended on low rounds × KM to the next round. Assumption: each round's pressure held until the next round. Small shortfalls within the normal range and rounds without a next KM are excluded.",
  },
};

const devCls = (dev: number | null) => {
  if (dev == null) return "text-muted-foreground";
  const lv = judgePressure(100 + dev, 100).level;
  return lv === "danger" ? "text-level-danger font-semibold" : lv === "warn" ? "text-level-warn font-semibold" : "";
};
const fmtDev = (dev: number | null) => (dev == null ? EMPTY : `${dev > 0 ? "+" : ""}${fmtPercent(dev)}`);

export default function PressureHistorySection() {
  const { lang } = useLang();
  const tx = TX[lang];
  const positions = Object.values(HEAD_MAP);
  // KM 이 없는 차량은 노출이 0 이 아니라 «주행거리 미입력» 이다 (TCO-04)
  const stats = TMS_DATA.units.map((u) => ({ ...vehiclePressureStats(u), kmMissing: unitKmMissing(u) }));
  const top = topUnderinflated(5);
  const fleetOk = stats.reduce((s, x) => s + x.compliance.ok, 0);
  const fleetTotal = stats.reduce((s, x) => s + x.compliance.total, 0);
  const fleetPct = fleetTotal ? (fleetOk / fleetTotal) * 100 : null;
  const fleetExposure = stats.reduce((s, x) => s + x.exposure, 0);
  const lowCls = (pct: number | null) =>
    pct != null && pct < COMPLIANCE_WARN_PCT ? "bg-level-warn/10 text-level-warn font-semibold" : "";

  const th = "px-2 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap";
  const num = "px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-primary rounded-full" />
        <span className="text-sm font-bold text-foreground">{tx.title}</span>
      </div>

      <div>
        <p className="text-xs font-bold text-primary mb-2">{tx.vehTitle}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-225 text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={`${th} text-left`}>{tx.colCh}</th>
                <th className={`${th} text-right`}>{tx.colCompliance}</th>
                <th className={`${th} text-right`}>{tx.colRounds}</th>
                <th className={`${th} text-right`}>{tx.colExposure} <span className="font-normal">(%·km)</span></th>
                {positions.map((p) => <th key={p} className={`${th} text-right font-mono`}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.ch} className="border-b border-border/50">
                  <td className="px-2 py-1.5 font-mono font-semibold whitespace-nowrap">{fmtVehicle(s.ch)}</td>
                  <td className={`${num} ${lowCls(s.compliance.pct)}`}>{s.compliance.pct == null ? EMPTY : fmtPercent(s.compliance.pct)}</td>
                  <td className={`${num} text-muted-foreground`}>{fmtInt(s.compliance.ok)}/{fmtInt(s.compliance.total)}</td>
                  <td className={num}>
                    {s.kmMissing ? (
                      <>{EMPTY} <span className="text-[10px] font-sans text-muted-foreground">{tx.kmMissing}</span></>
                    ) : s.compliance.total ? fmtInt(s.exposure) : EMPTY}
                  </td>
                  {positions.map((p) => (
                    <td key={p} className={`${num} ${devCls(s.posDev[p])}`}>{fmtDev(s.posDev[p])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="px-2 py-1.5">{tx.fleet}</td>
                <td className={`${num} ${lowCls(fleetPct)}`}>{fleetPct == null ? EMPTY : fmtPercent(fleetPct)}</td>
                <td className={`${num} text-muted-foreground`}>{fmtInt(fleetOk)}/{fmtInt(fleetTotal)}</td>
                <td className={num}>{fleetTotal ? fmtInt(fleetExposure) : EMPTY}</td>
                <td colSpan={positions.length} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-primary mb-2">{tx.topTitle}</p>
        {top.length === 0 ? (
          <p className="text-xs text-muted-foreground">{tx.none}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140 text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${th} text-right`}>{tx.colRank}</th>
                  <th className={`${th} text-left`}>{tx.colSerial}</th>
                  <th className={`${th} text-left`}>{tx.colAt}</th>
                  <th className={`${th} text-right`}>{tx.colExposure} <span className="font-normal">(%·km)</span></th>
                  <th className={`${th} text-right`}>{tx.colCompliance}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((t, i) => (
                  <tr key={t.serial} className="border-b border-border/50">
                    <td className={num}>{i + 1}</td>
                    <td className="px-2 py-1.5 font-mono">{t.serial}</td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                      {t.at ? `${fmtVehicle(t.at.ch)} · ${t.at.pos}` : <span className="text-muted-foreground">{tx.detached}</span>}
                    </td>
                    <td className={`${num} font-semibold`}>{fmtInt(t.exposure)}</td>
                    <td className={`${num} ${lowCls(t.compliance.pct)}`}>{t.compliance.pct == null ? EMPTY : fmtPercent(t.compliance.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
        <p>{tx.foot(fmtPercent(pressureThresholds().devWarn * 100))}</p>
        <p>{tx.footExposure}</p>
      </div>
    </div>
  );
}
