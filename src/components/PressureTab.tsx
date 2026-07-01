// @section: pressure-tab
import { useState } from "react";
import { TMS_DATA, recPsi } from "@/data/tmsData";
import { headPosData } from "@/data/tmsUtils";
import {
  Gauge, AlertTriangle, CheckCircle2, Wrench, ClipboardCheck,
  Activity, Wind, Circle, CheckSquare, Square,
} from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    bannerTitle: "타이어 공기압 관리",
    bannerDesc1: "현장 관리자(Pengawas)용 공기압 점검 기준 · 절차 · 대응 참조 페이지입니다.",
    bannerDesc2: "회차 점검 시 본 기준에 따라 측정·기록하고, 이상 발견 시 즉시 감독자에게 보고하십시오.",

    secStdTitle: "권장 공기압 기준",
    position: "포지션",

    secStatusTitle: "최근 공기압 점검 현황",
    kpiMeasured: "측정 본수",
    kpiNormal: "정상",
    kpiWarn: "편차 주의",
    kpiDanger: "저압 위험",
    unitCount: "본",
    alertTitle: "공기압 이상 알림",
    alertCount: "건",
    noAlert: "현재 공기압 이상 항목이 없습니다.",
    badgeLow: "저압",
    badgeDev: "편차",
    rec: "권장",
    alertNote: "판정: 저압 = 권장의 85% 미만 · 편차 = 권장 대비 ±15% 초과 (각 차량 최근 회차 실측값 기준)",

    secJudgeTitle: "상태 판정 기준",

    secProcTitle: "공기압 점검 절차",

    secEquipTitle: "측정 장비 관리",

    secSymTitle: "이상 징후 및 대응",
    thSym: "증상",
    thCause: "원인",
    thRisk: "위험",
    thAction: "조치",

    secLineTitle: "점검 담당 라인",
    lineNote: "점검 주기: 약 2주 간격 회차 점검 · 이상 발견 시 Foreman → Manager 보고",

    // PRESSURE_STD
    stdSteering: "조향축",
    stdDrive: "구동축",
    // JUDGE
    judgeNormal: "정상",
    judgeWarn: "주의",
    judgeDanger: "위험",
    judgeNormalRange: "권장 대비 ±5% 이내",
    judgeNormalDesc: "적정 — 조치 불필요",
    judgeWarnRange: "권장 대비 ±5~15% 편차",
    judgeWarnDesc: "재측정 · 보충 권장",
    judgeDangerRange: "저압 85% 미만 또는 과압 +15% 초과",
    judgeDangerDesc: "운행 전 즉시 조치",
    // PROCEDURE
    pc1: "냉간 상태에서 측정 (운행 직후 측정 금지)",
    pc2: "각 포지션 실측 공기압 기록 — 조향축 100 / 구동축 116 psi 기준",
    pc3: "내측 듀얼(In) 타이어는 측정 제외(N/A) 처리",
    pc4: "게이지 정확도 확인 (캘리브레이션 ±5% 이내)",
    pc5: "컴프레서 최대압 130 psi 도달 가능 여부 확인",
    pc6: "저압·편마모 발견 시 즉시 보충 후 감독자 보고",
    pc7: "OTR Data Tracking Sheet에 측정값 기록",
    // EQUIP
    eqCompLabel: "컴프레서 최대압",
    eqCompNote: "ETCrane 목표압 도달 가능 필요. 불가 시 보조(포터블) 장비 검토",
    eqGaugeLabel: "게이지 정확도",
    eqGaugeValue: "±5% 이내",
    eqGaugeNote: "정기 캘리브레이션 — 최근 교정일 확인",
    eqOpLabel: "현재 운용압",
    eqOpNote: "기존 125psi → ETCrane 시험 116 psi 하향",
    // SYMPTOMS
    sym1: "저압 (Under-inflation)",
    sym1cause: "펑크 · 밸브 누설 · 미보충",
    sym1risk: "숄더 편마모 · 발열 · 사이드월 손상",
    sym1action: "즉시 보충 후 누설 점검",
    sym2: "과압 (Over-inflation)",
    sym2cause: "과보충 · 고온 팽창",
    sym2risk: "중앙 편마모 · 충격 손상 · 트레드 컷",
    sym2action: "규정압까지 배출",
    sym3: "편마모 / TOE IN",
    sym3cause: "얼라인먼트(토우) 불량",
    sym3risk: "한쪽 0mm 조기 마모",
    sym3action: "감독자 보고 · 얼라인먼트 정비 (예: CH 839 L1)",
    sym4: "좌우 편차",
    sym4cause: "불균일 보충",
    sym4risk: "조향 쏠림 · 주행 불안정",
    sym4action: "동일 축 좌우 공기압 균등화",
  },
  id: {
    bannerTitle: "Manajemen Tekanan Ban",
    bannerDesc1: "Halaman referensi kriteria · prosedur · tindakan cek tekanan untuk Pengawas lapangan.",
    bannerDesc2: "Saat inspeksi berkala, ukur·catat sesuai kriteria ini, dan segera lapor ke pengawas bila ada anomali.",

    secStdTitle: "Standar tekanan rekomendasi",
    position: "Posisi",

    secStatusTitle: "Status terkini cek tekanan",
    kpiMeasured: "Jml diukur",
    kpiNormal: "Normal",
    kpiWarn: "Perhatian deviasi",
    kpiDanger: "Tekanan rendah bahaya",
    unitCount: "unit",
    alertTitle: "Peringatan tekanan",
    alertCount: "kasus",
    noAlert: "Saat ini tidak ada anomali tekanan.",
    badgeLow: "Tekanan rendah",
    badgeDev: "Deviasi",
    rec: "Rekomendasi",
    alertNote: "Penilaian: Tekanan rendah = di bawah 85% rekomendasi · Deviasi = melebihi ±15% thd rekomendasi (berdasarkan nilai aktual inspeksi terakhir tiap kendaraan)",

    secJudgeTitle: "Kriteria penilaian",

    secProcTitle: "Prosedur cek tekanan",

    secEquipTitle: "Manajemen alat ukur",

    secSymTitle: "Gejala & Tindakan",
    thSym: "Gejala",
    thCause: "Penyebab",
    thRisk: "Risiko",
    thAction: "Tindakan",

    secLineTitle: "Jalur penanggung jawab",
    lineNote: "Siklus inspeksi: inspeksi berkala sekitar 2 minggu · bila ada anomali lapor Foreman → Manager",

    // PRESSURE_STD
    stdSteering: "Poros kemudi",
    stdDrive: "Poros penggerak",
    // JUDGE
    judgeNormal: "Normal",
    judgeWarn: "Perhatian",
    judgeDanger: "Bahaya",
    judgeNormalRange: "Dalam ±5% thd rekomendasi",
    judgeNormalDesc: "Sesuai — tidak perlu tindakan",
    judgeWarnRange: "Deviasi ±5~15% thd rekomendasi",
    judgeWarnDesc: "Ukur ulang · disarankan tambah angin",
    judgeDangerRange: "Tekanan rendah <85% atau tekanan tinggi >+15%",
    judgeDangerDesc: "Tindakan segera sebelum jalan",
    // PROCEDURE
    pc1: "Ukur saat ban dingin (dilarang ukur tepat setelah jalan)",
    pc2: "Catat tekanan aktual per posisi — standar poros kemudi 100 / poros penggerak 116 psi",
    pc3: "Ban dual dalam (In) = tidak diukur (N/A)",
    pc4: "Cek akurasi gauge (kalibrasi dalam ±5%)",
    pc5: "Konfirmasi kompresor mampu mencapai tekanan maks 130 psi",
    pc6: "Bila ditemukan tekanan rendah·aus tidak rata, segera tambah angin lalu lapor ke pengawas",
    pc7: "Catat nilai ukur di OTR Data Tracking Sheet",
    // EQUIP
    eqCompLabel: "Tekanan maks kompresor",
    eqCompNote: "Perlu mampu mencapai tekanan target ETCrane. Bila tidak, kaji alat bantu (portabel)",
    eqGaugeLabel: "Akurasi gauge",
    eqGaugeValue: "Dalam ±5%",
    eqGaugeNote: "Kalibrasi berkala — cek tanggal kalibrasi terakhir",
    eqOpLabel: "Tekanan operasi saat ini",
    eqOpNote: "Sebelumnya 125psi → uji ETCrane turun 116 psi",
    // SYMPTOMS
    sym1: "Tekanan rendah (Under-inflation)",
    sym1cause: "Bocor · kebocoran valve · belum ditambah angin",
    sym1risk: "Aus tidak rata bahu · panas · kerusakan sidewall",
    sym1action: "Segera tambah angin lalu cek kebocoran",
    sym2: "Tekanan tinggi (Over-inflation)",
    sym2cause: "Kelebihan angin · pemuaian suhu tinggi",
    sym2risk: "Aus tidak rata tengah · kerusakan benturan · tread cut",
    sym2action: "Buang hingga tekanan standar",
    sym3: "Aus tidak rata / TOE IN",
    sym3cause: "Alignment (toe) buruk",
    sym3risk: "Aus dini 0mm sebelah",
    sym3action: "Lapor pengawas · servis alignment (mis: CH 839 L1)",
    sym4: "Deviasi kiri-kanan",
    sym4cause: "Penambahan angin tidak merata",
    sym4risk: "Kemudi menarik · kestabilan jalan terganggu",
    sym4action: "Samakan tekanan kiri-kanan pada poros yang sama",
  },
} as const;

// ── 권장 공기압 기준 ──────────────────────────────────────────
const PRESSURE_STD = [
  { key: "stdSteering", sub: "Steering · As Kemudi", pos: "L1 · R1", psi: 100 },
  { key: "stdDrive", sub: "Drive · As Penggerak", pos: "L2 · L3 · R2 · R3", psi: 116 },
] as const;

// ── 상태 판정 기준 ────────────────────────────────────────────
const JUDGE = [
  { lvKey: "judgeNormal", subKey: "kpiNormal", rangeKey: "judgeNormalRange", descKey: "judgeNormalDesc", cls: "border-green-500/40 bg-green-500/10 text-green-600" },
  { lvKey: "judgeWarn", subKey: "judgeWarn", rangeKey: "judgeWarnRange", descKey: "judgeWarnDesc", cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600" },
  { lvKey: "judgeDanger", subKey: "judgeDanger", rangeKey: "judgeDangerRange", descKey: "judgeDangerDesc", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
] as const;

// ── 점검 절차 체크리스트 ──────────────────────────────────────
const PROCEDURE = [
  { id: "pc1", textKey: "pc1", sub: "Ukur saat ban dingin" },
  { id: "pc2", textKey: "pc2", sub: "Catat tekanan aktual per posisi" },
  { id: "pc3", textKey: "pc3", sub: "Ban dalam dual = N/A" },
  { id: "pc4", textKey: "pc4", sub: "Cek kalibrasi alat ukur" },
  { id: "pc5", textKey: "pc5", sub: "Konfirmasi kompresor 130 psi" },
  { id: "pc6", textKey: "pc6", sub: "Lapor pengawas bila ada anomali" },
  { id: "pc7", textKey: "pc7", sub: "Catat di OTR Tracking Sheet" },
] as const;

// ── 측정 장비 관리 ────────────────────────────────────────────
const EQUIP = [
  { labelKey: "eqCompLabel", sub: "Tekanan maks kompresor", value: "130 psi", noteKey: "eqCompNote" },
  { labelKey: "eqGaugeLabel", sub: "Akurasi gauge", valueKey: "eqGaugeValue", noteKey: "eqGaugeNote" },
  { labelKey: "eqOpLabel", sub: "Tekanan operasional", value: "116 psi", noteKey: "eqOpNote" },
] as const;

// ── 이상 징후 및 대응 ─────────────────────────────────────────
const SYMPTOMS = [
  { symKey: "sym1", causeKey: "sym1cause", riskKey: "sym1risk", actionKey: "sym1action" },
  { symKey: "sym2", causeKey: "sym2cause", riskKey: "sym2risk", actionKey: "sym2action" },
  { symKey: "sym3", causeKey: "sym3cause", riskKey: "sym3risk", actionKey: "sym3action" },
  { symKey: "sym4", causeKey: "sym4cause", riskKey: "sym4risk", actionKey: "sym4action" },
] as const;

export default function PressureTab() {
  const { lang } = useLang();
  const tx = TX[lang];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecked((p) => ({ ...p, [id]: !p[id] }));
  const doneCount = PROCEDURE.filter((p) => checked[p.id]).length;

  // ── 실시간 공기압 이상 현황 계산 ──────────────────────────
  let measured = 0, ok = 0, warn = 0, danger = 0;
  const alerts: { lv: "danger" | "warn"; ch: string; pos: string; psi: number; target: number; dev: number }[] = [];
  TMS_DATA.units.forEach((u) => {
    for (let p = 1; p <= 10; p++) {
      const d = headPosData(u, p);
      if (!d || typeof d.latestPress !== "number") continue;
      measured++;
      const target = recPsi(p);
      const dev = ((d.latestPress - target) / target) * 100;
      if (d.latestPress < target * 0.85) {
        danger++;
        alerts.push({ lv: "danger", ch: u.ch, pos: d.rp, psi: d.latestPress, target, dev });
      } else if (Math.abs(dev) > 15) {
        warn++;
        alerts.push({ lv: "warn", ch: u.ch, pos: d.rp, psi: d.latestPress, target, dev });
      } else {
        ok++;
      }
    }
  });
  alerts.sort((a, b) => (a.lv === "danger" ? 0 : 1) - (b.lv === "danger" ? 0 : 1));

  const kpis = [
    { label: tx.kpiMeasured, sub: "Diukur", value: measured, cls: "border-primary/40 bg-primary/5 text-primary" },
    { label: tx.kpiNormal, sub: "Normal", value: ok, cls: "border-green-500/40 bg-green-500/10 text-green-600" },
    { label: tx.kpiWarn, sub: "Perhatian", value: warn, cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600" },
    { label: tx.kpiDanger, sub: "Bahaya", value: danger, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  ];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">

      {/* ── 권장 공기압 기준 ── */}
      <motion.div variants={staggerItem}>
        <SectionTitle icon={<Wind className="w-4 h-4 text-primary" />} ko={tx.secStdTitle} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRESSURE_STD.map((s) => (
            <div key={s.key} className="rounded-xl border border-border bg-card p-4 text-center">
              <div className="text-sm font-bold text-foreground">{tx[s.key]}</div>
              <div className="text-xs text-muted-foreground">{s.sub}</div>
              <div className="font-mono text-2xl font-bold text-primary leading-none my-2">
                {s.psi}<span className="text-xs font-normal ml-1 opacity-70">psi</span>
              </div>
              <div className="pt-2 border-t border-border/60 text-xs font-mono text-muted-foreground">
                {tx.position}: {s.pos}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── 실시간 공기압 이상 현황 ── */}
      <motion.div variants={staggerItem}>
        <SectionTitle icon={<Activity className="w-4 h-4 text-primary" />} ko={tx.secStatusTitle} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-xl border p-4 text-center ${k.cls}`}>
              <div className="text-xs opacity-80 mb-1">{k.label} <span className="opacity-60">· {k.sub}</span></div>
              <div className="font-mono text-2xl font-bold leading-none">
                {k.value}<span className="text-xs font-normal ml-1 opacity-70">{tx.unitCount}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-bold text-foreground">{tx.alertTitle}</span>
            <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{alerts.length}{tx.alertCount}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 text-sm py-2">
              <CheckCircle2 className="w-4 h-4" />
              {tx.noAlert}
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                    a.lv === "danger"
                      ? "text-destructive border-destructive/40 bg-destructive/10"
                      : "text-yellow-600 border-yellow-500/40 bg-yellow-500/10"
                  }`}
                >
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold border border-current">
                    {a.lv === "danger" ? tx.badgeLow : tx.badgeDev}
                  </span>
                  <span className="font-mono">
                    CH {a.ch} · {a.pos} — {Math.round(a.psi)}psi
                    <span className="text-muted-foreground"> ({tx.rec} {a.target} / {a.dev > 0 ? "+" : ""}{a.dev.toFixed(0)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {tx.alertNote}
          </p>
        </div>
      </motion.div>

      {/* ── 상태 판정 기준 ── */}
      <motion.div variants={staggerItem}>
        <SectionTitle icon={<Gauge className="w-4 h-4 text-primary" />} ko={tx.secJudgeTitle} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {JUDGE.map((j) => (
            <div key={j.lvKey} className={`rounded-xl border p-4 text-center ${j.cls}`}>
              <div className="flex items-baseline justify-center gap-2 mb-2">
                <span className="text-sm font-bold">{tx[j.lvKey]}</span>
                <span className="text-xs opacity-70">{tx[j.subKey]}</span>
              </div>
              <div className="text-xs font-mono mb-1">{tx[j.rangeKey]}</div>
              <div className="text-xs opacity-80">{tx[j.descKey]}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── 점검 절차 체크리스트 ── */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{tx.secProcTitle}</span>
            <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{doneCount}/{PROCEDURE.length}</span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PROCEDURE.map((p) => {
              const on = !!checked[p.id];
              return (
                <li key={p.id}>
                  <button
                    onClick={() => toggle(p.id)}
                    className={`w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      on ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/30"
                    }`}
                  >
                    {on
                      ? <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      : <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                    <span>
                      <span className={`text-sm ${on ? "text-muted-foreground line-through" : "text-foreground"}`}>{tx[p.textKey]}</span>
                      <span className="block text-xs text-muted-foreground/80 mt-0.5">{p.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </motion.div>

      {/* ── 측정 장비 관리 ── */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{tx.secEquipTitle}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {EQUIP.map((e) => (
              <div key={e.labelKey} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                <div className="text-xs text-muted-foreground">{tx[e.labelKey]} <span className="opacity-60">· {e.sub}</span></div>
                <div className="font-mono text-lg font-bold text-primary my-1">{"value" in e ? e.value : tx[e.valueKey]}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{tx[e.noteKey]}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── 이상 징후 및 대응 ── */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{tx.secSymTitle}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed text-sm border-collapse">
              <colgroup>
                {["22%", "26%", "26%", "26%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  {[tx.thSym, tx.thCause, tx.thRisk, tx.thAction].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYMPTOMS.map((s) => (
                  <tr key={s.symKey} className="border-b border-border/50 align-top">
                    <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">{tx[s.symKey]}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{tx[s.causeKey]}</td>
                    <td className="px-3 py-2.5 text-xs text-destructive">{tx[s.riskKey]}</td>
                    <td className="px-3 py-2.5 text-xs text-foreground">{tx[s.actionKey]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* ── 결재/담당 라인 ── */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Circle className="w-3 h-3 text-primary fill-primary" />
            <span className="text-sm font-bold">{tx.secLineTitle}</span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
            {[
              { role: "Admin Tire", name: "Ricky" },
              { role: "Foreman", name: "Nazar Fadlullah" },
              { role: "Manager", name: "Jung Tae Hee" },
              { role: "PJO", name: "Sugeng Priyo M." },
            ].map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="text-muted-foreground">{p.role}</span>
                <span className="font-semibold text-foreground">{p.name}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {tx.lineNote}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SectionTitle({ icon, ko }: { icon: React.ReactNode; ko: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-1 h-5 bg-primary rounded-full" />
      {icon}
      <span className="text-sm font-bold text-foreground">{ko}</span>
    </div>
  );
}
