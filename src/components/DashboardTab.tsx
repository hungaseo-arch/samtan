// @section: dashboard-tab
import { Fragment, useState } from "react";
import { TMS_DATA } from "@/data/tmsData";
import { headPosData, statusOf, getUnitAlerts, fmtInt, validDates } from "@/data/tmsUtils";
import { Truck, Circle, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    monitoringUnits: "모니터링 차량",
    testTires: "시험 타이어",
    normal: "정상",
    caution: "주의",
    replaceScrap: "교체권장/폐기",
    cumulativeScrap: "누적 폐기",
    installed: "장착 (DB)",
    spareTires: "예비 타이어",
    unitDae: "대",
    pcsHead: "본 (Head)",
    pcs: "본",
    summaryTitle: "시험 현황 요약",
    statusPerUnit: "차량(CH)별 현황",
    unit: "차량",
    firstInstallDate: "최초 장착일",
    lastInspectDate: "최근 점검일",
    drivenHm: "주행 HM",
    drivenKm: "주행 KM",
    replaceRecommend: "교체권장",
    replaceHistory: "교체이력",
    totalAvg: "합계 · 평균",
    totalAvgNote: " (주행 HM·KM=평균)",
    times: "회",
    layoutTitle: "CH {ch} 배치도 보기",
    cautionAlertTitle: "CH {ch} 주의 알림 보기",
    replaceAlertTitle: "CH {ch} 교체권장 알림 보기",
    footerLead: "주의·교체권장",
    footerRest: " 숫자를 클릭하면 해당 차량의 알림 상세가 모달로 표시됩니다.",
    footerSpec: "트레드 기준: 신품 22mm · 주의 ≤8mm · 교체권장 ≤5mm | 권장 공기압: 조향축(L1/R1) 100psi / 구동축 116psi",
    approvalLine: "결재 라인",
    replaceDanger: "교체권장/위험",
    cases: "건",
    noItems: "해당 항목이 없습니다.",
    danger: "위험",
  },
  id: {
    monitoringUnits: "Unit dipantau",
    testTires: "Ban uji",
    normal: "Normal",
    caution: "Perhatian",
    replaceScrap: "Rekomendasi ganti/Afkir(Scrap)",
    cumulativeScrap: "Total afkir",
    installed: "Terpasang (DB)",
    spareTires: "Ban cadangan",
    unitDae: "unit",
    pcsHead: "pcs (Head)",
    pcs: "pcs",
    summaryTitle: "Ringkasan",
    statusPerUnit: "Status per Unit(CH)",
    unit: "Unit",
    firstInstallDate: "Tgl pasang awal",
    lastInspectDate: "Tgl inspeksi terakhir",
    drivenHm: "HM tempuh",
    drivenKm: "KM tempuh",
    replaceRecommend: "Rekomendasi ganti",
    replaceHistory: "Riwayat ganti",
    totalAvg: "Total · Rata-rata",
    totalAvgNote: " (HM·KM tempuh=Rata-rata)",
    times: "kali",
    layoutTitle: "Lihat tata letak CH {ch}",
    cautionAlertTitle: "Lihat peringatan Perhatian CH {ch}",
    replaceAlertTitle: "Lihat peringatan Rekomendasi ganti CH {ch}",
    footerLead: "Perhatian·Rekomendasi ganti",
    footerRest: " Klik angka untuk menampilkan detail peringatan unit dalam modal.",
    footerSpec: "Standar tapak: baru 22mm · Perhatian ≤8mm · Rekomendasi ganti ≤5mm | Tekanan disarankan: Poros kemudi(L1/R1) 100psi / Poros penggerak 116psi",
    approvalLine: "Jalur Persetujuan",
    replaceDanger: "Rekomendasi ganti/Bahaya",
    cases: "item",
    noItems: "Tidak ada item.",
    danger: "Bahaya",
  },
} as const;

const STATUS_COLOR: Record<string, string> = {
  danger: "text-destructive border-destructive/50 bg-destructive/10",
  warn: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10",
};

export default function DashboardTab({ onVehicleClick }: { onVehicleClick?: (ch: string) => void }) {
  const { lang } = useLang();
  const tx = TX[lang];
  // ── KPI 계산 ──────────────────────────────────────────────
  let okCount = 0, warnCount = 0, dangerCount = 0;
  TMS_DATA.units.forEach((u) => {
    for (let p = 1; p <= 10; p++) {
      const st = statusOf(headPosData(u, p), p);
      if (st === "ok") okCount++;
      else if (st === "warn") warnCount++;
      else if (st === "danger") dangerCount++;
    }
  });

  const kpis = [
    { label: tx.monitoringUnits, value: TMS_DATA.units.length, unit: tx.unitDae, cls: "border-primary/40 bg-primary/5" },
    { label: tx.testTires, value: TMS_DATA.units.length * 10, unit: tx.pcsHead, cls: "border-primary/40 bg-primary/5" },
    { label: tx.normal, value: okCount, unit: tx.pcs, cls: "border-green-500/40 bg-green-500/10 text-green-400" },
    { label: tx.caution, value: warnCount, unit: tx.pcs, cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" },
    { label: tx.replaceScrap, value: dangerCount, unit: tx.pcs, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    { label: tx.cumulativeScrap, value: TMS_DATA.summary["Scrap"] ?? 0, unit: tx.pcs, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    { label: tx.installed, value: TMS_DATA.summary["Install"] ?? 0, unit: tx.pcs, cls: "border-border bg-muted/30" },
    { label: tx.spareTires, value: TMS_DATA.summary["Spare"] ?? 0, unit: tx.pcs, cls: "border-border bg-muted/30" },
  ];

  const approvers = [
    { name: "Ricky", role: "Admin Tire" },
    { name: "Nazar Fadlullah", role: "Foreman" },
    { name: "Jung Tae Hee", role: "Manager" },
    { name: "Sugeng Priyo M.", role: "PJO" },
    { name: "Hwang Tae Gi", role: "Pres. Director" },
  ];

  // 차량별 현황 합계 (주행 HM·KM / 정상·주의·교체권장·교체이력)
  const dashTotal = (() => {
    const acc = { hm: [0, 0], km: [0, 0], ok: 0, warn: 0, danger: 0, rc: 0 };
    TMS_DATA.units.forEach((u) => {
      const vd = validDates(u);
      const hms = vd.map((x) => u.hm[x.i]).filter((v): v is number => typeof v === "number");
      const kms = vd.map((x) => u.km[x.i]).filter((v): v is number => typeof v === "number");
      const dh = hms.length >= 2 ? hms[hms.length - 1] - hms[0] : null;
      const dk = kms.length >= 2 ? kms[kms.length - 1] - kms[0] : null;
      if (dh != null) { acc.hm[0] += dh; acc.hm[1]++; }
      if (dk != null) { acc.km[0] += dk; acc.km[1]++; }
      for (let p = 1; p <= 10; p++) {
        const st = statusOf(headPosData(u, p), p);
        if (st === "ok") acc.ok++;
        else if (st === "warn") acc.warn++;
        else if (st === "danger") acc.danger++;
      }
      acc.rc += TMS_DATA.repl.filter((r) => r.ch === u.ch).length;
    });
    return {
      hm: acc.hm[1] ? acc.hm[0] / acc.hm[1] : null,  // 주행 HM 평균
      km: acc.km[1] ? acc.km[0] / acc.km[1] : null,  // 주행 KM 평균
      ok: acc.ok, warn: acc.warn, danger: acc.danger, rc: acc.rc, // 상태·교체이력 합계
    };
  })();

  // 주의·교체권장 카운트 클릭 → 해당 차량 알림 모달
  const [alertModal, setAlertModal] = useState<{ ch: string; lv: "warn" | "danger" } | null>(null);
  const alertItems = alertModal
    ? getUnitAlerts(TMS_DATA.units.find((u) => u.ch === alertModal.ch)!).filter((a) => a.lv === alertModal.lv)
    : [];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* ── KPI 카드 ── */}
      <motion.div variants={staggerItem}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.summaryTitle}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-xl border p-4 text-center ${k.cls}`}>
              <div className="text-xs text-muted-foreground mb-1">{k.label}</div>
              <div className="font-mono text-2xl font-bold leading-none">
                {k.value}
                <span className="text-xs font-normal ml-1 opacity-70">{k.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>


      {/* ── 차량별 현황 요약 테이블 ── */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{tx.statusPerUnit}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed text-sm border-collapse">
              <colgroup>
                {["9%","13%","13%","13%","13%","8%","8%","11%","12%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: tx.unit, center: false },
                    { label: tx.firstInstallDate, center: false },
                    { label: tx.lastInspectDate, center: false },
                    { label: tx.drivenHm, center: true },
                    { label: tx.drivenKm, center: true },
                    { label: tx.normal, center: true },
                    { label: tx.caution, center: true },
                    { label: tx.replaceRecommend, center: true },
                    { label: tx.replaceHistory, center: true },
                  ].map((h) => (
                    <th key={h.label} className={`px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap ${h.center ? "text-center" : "text-left"}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TMS_DATA.units.map((u) => {
                  const vd = validDates(u);
                  const fd = vd.length ? vd[0].d : "−";
                  const ld = vd.length ? vd[vd.length - 1].d : "−";
                  // 실제 주행량 = 최신 − 최초 (수치 회차 기준)
                  const hms = vd.map((x) => u.hm[x.i]).filter((v): v is number => typeof v === "number");
                  const kms = vd.map((x) => u.km[x.i]).filter((v): v is number => typeof v === "number");
                  const drivenHm = hms.length >= 2 ? hms[hms.length - 1] - hms[0] : null;
                  const drivenKm = kms.length >= 2 ? kms[kms.length - 1] - kms[0] : null;
                  let ok = 0, warn = 0, danger = 0;
                  for (let p = 1; p <= 10; p++) {
                    const st = statusOf(headPosData(u, p), p);
                    if (st === "ok") ok++;
                    else if (st === "warn") warn++;
                    else if (st === "danger") danger++;
                  }
                  const rc = TMS_DATA.repl.filter((r) => r.ch === u.ch).length;
                  return (
                    <tr key={u.ch} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-primary">
                        <button className="hover:underline" title={tx.layoutTitle.replace("{ch}", u.ch)} onClick={() => onVehicleClick?.(u.ch)}>CH {u.ch}</button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{fd}</td>
                      <td className="px-3 py-2 font-mono text-xs">{ld}</td>
                      <td className="px-3 py-2 font-mono text-xs text-center">{fmtInt(drivenHm)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-center">{fmtInt(drivenKm)}</td>
                      <td className="px-3 py-2 text-center">
                        {ok > 0 && <span className="font-mono text-xs text-green-400 font-bold">{ok}</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {warn > 0 && <button className="font-mono text-xs text-yellow-400 font-bold hover:underline" title={tx.cautionAlertTitle.replace("{ch}", u.ch)} onClick={() => setAlertModal({ ch: u.ch, lv: "warn" })}>{warn}</button>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {danger > 0 && <button className="font-mono text-xs text-destructive font-bold hover:underline" title={tx.replaceAlertTitle.replace("{ch}", u.ch)} onClick={() => setAlertModal({ ch: u.ch, lv: "danger" })}>{danger}</button>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {rc > 0 && <span className="font-mono text-xs text-muted-foreground">{rc}{tx.times}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-bold text-xs">
                  <td className="px-3 py-2 text-muted-foreground" colSpan={3}>{tx.totalAvg}<span className="font-normal opacity-70">{tx.totalAvgNote}</span></td>
                  <td className="px-3 py-2 text-center font-mono">{fmtInt(dashTotal.hm)}</td>
                  <td className="px-3 py-2 text-center font-mono">{fmtInt(dashTotal.km)}</td>
                  <td className="px-3 py-2 text-center font-mono text-green-400">{dashTotal.ok}</td>
                  <td className="px-3 py-2 text-center font-mono text-yellow-400">{dashTotal.warn}</td>
                  <td className="px-3 py-2 text-center font-mono text-destructive">{dashTotal.danger}</td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">{dashTotal.rc}{tx.times}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <strong className="text-foreground">{tx.footerLead}</strong>{tx.footerRest}
            <br />
            {tx.footerSpec}
          </p>
        </div>
      </motion.div>


      {/* ── 결재 라인 ── */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Circle className="w-3 h-3 text-primary fill-primary" />
            <span className="text-sm font-bold">{tx.approvalLine}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between mx-15 gap-6 text-center">
            {approvers.map((p, i) => (
              <Fragment key={p.name}>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-14 h-14 rounded-full border-2 border-border bg-muted/30 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{p.name[0]}</span>
                  </div>
                  <span className="text-xs font-semibold">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.role}</span>
                </div>
                {i < approvers.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-5" />
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </motion.div>

      {/* 주의·교체권장 클릭 → 해당 차량 알림 모달 */}
      <AnimatePresence>
        {alertModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAlertModal(null)}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary">CH {alertModal.ch}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[alertModal.lv]}`}>
                    {alertModal.lv === "danger" ? tx.replaceDanger : tx.caution}
                  </span>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{alertItems.length}{tx.cases}</span>
                </div>
                <button onClick={() => setAlertModal(null)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {alertItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{tx.noItems}</p>
              ) : (
                <ul className="space-y-2">
                  {alertItems.map((a, i) => (
                    <li key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${STATUS_COLOR[a.lv]}`}>
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold border ${STATUS_COLOR[a.lv]}`}>
                        {a.lv === "danger" ? tx.danger : tx.caution}
                      </span>
                      <span className="font-mono">{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
