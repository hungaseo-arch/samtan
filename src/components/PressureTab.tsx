// @section: pressure-tab
import { useState } from "react";
import { TMS_DATA, recPsi, pressureThresholds } from "@/data/tmsData";
import { headPosData } from "@/data/tmsUtils";
import {
  Gauge, AlertTriangle, CheckCircle2, Wrench, ClipboardCheck,
  Activity, Wind, Circle, CheckSquare, Square,
} from "lucide-react";
import { useLang } from "@/i18n";
import { fmtInt, fmtPercent, fmtPressure, fmtVehicle } from "@/lib/format";
import { judgePressure } from "@/lib/pressureJudge";
import PressureHistorySection from "@/components/PressureHistorySection";

// 판정 경계는 tire_config 정본(pressureThresholds)에서 읽어 문구에 넣는다 — 관리자가 바꾸면 문구도 바뀐다.
const buildTX = () => {
  const th = pressureThresholds();
  const low = fmtPercent(th.lowRatio * 100);
  const warn = fmtPercent(th.devWarn * 100);
  const danger = fmtPercent(th.devDanger * 100);
  return {
  ko: {

    secStdTitle: "권장 공기압 기준",
    position: "포지션",

    secStatusTitle: "최근 공기압 점검 현황",
    kpiMeasured: "측정 본수",
    kpiNormal: "정상",
    kpiWarn: "편차 주의",
    kpiDanger: "위험 (저압·과압)",
    unitCount: "본",
    alertTitle: "공기압 이상 알림",
    alertCount: "건",
    noAlert: "현재 공기압 이상 항목이 없습니다.",
    badgeLow: "저압",
    badgeHigh: "과압",
    badgeDev: "편차",
    rec: "권장",
    alertNote: `판정: 위험 = 권장의 ${low} 미만(저압) 또는 +${danger} 초과(과압) · 주의 = 권장 대비 ±${warn} 초과 편차 (각 차량 최근 회차 실측값 기준)`,

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
    judgeNormalRange: `권장 대비 ±${warn} 이내`,
    judgeNormalDesc: "적정 — 조치 불필요",
    judgeWarnRange: `권장 대비 ±${warn} 초과 편차`,
    judgeWarnDesc: "재측정 · 보충 권장",
    judgeDangerRange: `저압 ${low} 미만 또는 과압 +${danger} 초과`,
    judgeDangerDesc: "운행 전 즉시 조치",
    // PROCEDURE
    pc1: "냉간 상태에서 측정 (운행 직후 측정 금지)",
    pc2: `각 포지션 실측 공기압 기록 — 조향축 ${recPsi(1)} / 구동축 ${recPsi(3)} psi 기준`,
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
    eqOpNote: `기존 125psi → ETCrane 시험 ${recPsi(3)} psi 하향`,
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

    secStdTitle: "Standar tekanan rekomendasi",
    position: "Posisi",

    secStatusTitle: "Status terkini cek tekanan",
    kpiMeasured: "Jml diukur",
    kpiNormal: "Normal",
    kpiWarn: "Perhatian deviasi",
    kpiDanger: "Bahaya (rendah·berlebih)",
    unitCount: "unit",
    alertTitle: "Peringatan tekanan",
    alertCount: "kasus",
    noAlert: "Saat ini tidak ada anomali tekanan.",
    badgeLow: "Tekanan rendah",
    badgeHigh: "Tekanan berlebih",
    badgeDev: "Deviasi",
    rec: "Rekomendasi",
    alertNote: `Penilaian: Bahaya = di bawah ${low} rekomendasi (rendah) atau lebih dari +${danger} (berlebih) · Perhatian = deviasi melebihi ±${warn} thd rekomendasi (berdasarkan nilai aktual inspeksi terakhir tiap kendaraan)`,

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
    judgeNormalRange: `Dalam ±${warn} thd rekomendasi`,
    judgeNormalDesc: "Sesuai — tidak perlu tindakan",
    judgeWarnRange: `Deviasi melebihi ±${warn} thd rekomendasi`,
    judgeWarnDesc: "Ukur ulang · disarankan tambah angin",
    judgeDangerRange: `Tekanan rendah <${low} atau tekanan berlebih >+${danger}`,
    judgeDangerDesc: "Tindakan segera sebelum jalan",
    // PROCEDURE
    pc1: "Ukur saat ban dingin (dilarang ukur tepat setelah jalan)",
    pc2: `Catat tekanan aktual per posisi — standar poros kemudi ${recPsi(1)} / poros penggerak ${recPsi(3)} psi`,
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
    eqOpNote: `Sebelumnya 125psi → uji ETCrane turun ${recPsi(3)} psi`,
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
  en: {

    secStdTitle: "Recommended pressure standard",
    position: "Position",

    secStatusTitle: "Latest pressure inspection status",
    kpiMeasured: "Tires measured",
    kpiNormal: "Normal",
    kpiWarn: "Deviation caution",
    kpiDanger: "Danger (low/high)",
    unitCount: "pcs",
    alertTitle: "Pressure anomaly alerts",
    alertCount: "cases",
    noAlert: "No pressure anomalies at present.",
    badgeLow: "Low pressure",
    badgeHigh: "Over-inflated",
    badgeDev: "Deviation",
    rec: "Recommended",
    alertNote: `Criteria: Danger = below ${low} of recommended (low) or above +${danger} (high) · Caution = deviation beyond ±${warn} of recommended (based on each vehicle's latest measured round)`,

    secJudgeTitle: "Status criteria",

    secProcTitle: "Pressure inspection procedure",

    secEquipTitle: "Measuring equipment management",

    secSymTitle: "Symptoms and actions",
    thSym: "Symptom",
    thCause: "Cause",
    thRisk: "Risk",
    thAction: "Action",

    secLineTitle: "Inspection reporting line",
    lineNote: "Inspection cycle: round inspection roughly every 2 weeks · report anomalies Foreman → Manager",

    // PRESSURE_STD
    stdSteering: "Steer axle",
    stdDrive: "Drive axle",
    // JUDGE
    judgeNormal: "Normal",
    judgeWarn: "Caution",
    judgeDanger: "Danger",
    judgeNormalRange: `Within ±${warn} of recommended`,
    judgeNormalDesc: "In spec — no action needed",
    judgeWarnRange: `Deviation beyond ±${warn} from recommended`,
    judgeWarnDesc: "Re-measure · top-up recommended",
    judgeDangerRange: `Low pressure below ${low} or over-inflation above +${danger}`,
    judgeDangerDesc: "Act immediately before operation",
    // PROCEDURE
    pc1: "Measure cold (do not measure right after operation)",
    pc2: `Record measured pressure at each position — steer axle ${recPsi(1)} / drive axle ${recPsi(3)} psi standard`,
    pc3: "Inner dual (In) tires are excluded from measurement (N/A)",
    pc4: "Check gauge accuracy (calibration within ±5%)",
    pc5: "Confirm the compressor can reach a maximum of 130 psi",
    pc6: "On low pressure or irregular wear, top up immediately and report to the supervisor",
    pc7: "Record measured values on the OTR Data Tracking Sheet",
    // EQUIP
    eqCompLabel: "Compressor max pressure",
    eqCompNote: "Must be able to reach the ETCrane target pressure. If not, consider auxiliary (portable) equipment",
    eqGaugeLabel: "Gauge accuracy",
    eqGaugeValue: "Within ±5%",
    eqGaugeNote: "Periodic calibration — check the last calibration date",
    eqOpLabel: "Current operating pressure",
    eqOpNote: `Previously 125psi → lowered to ${recPsi(3)} psi for the ETCrane trial`,
    // SYMPTOMS
    sym1: "Low pressure (Under-inflation)",
    sym1cause: "Puncture · valve leak · not topped up",
    sym1risk: "Shoulder wear · heat build-up · sidewall damage",
    sym1action: "Top up immediately, then check for leaks",
    sym2: "Over-inflation",
    sym2cause: "Over-filling · high-temperature expansion",
    sym2risk: "Center wear · impact damage · tread cut",
    sym2action: "Bleed down to the specified pressure",
    sym3: "Irregular wear / TOE IN",
    sym3cause: "Poor alignment (toe)",
    sym3risk: "Early 0mm wear on one side",
    sym3action: "Report to supervisor · alignment service (e.g. CH 839 L1)",
    sym4: "Left-right deviation",
    sym4cause: "Uneven top-up",
    sym4risk: "Steering pull · unstable running",
    sym4action: "Equalize left and right pressure on the same axle",
  },
} as const;
};

// ── 권장 공기압 기준 ──────────────────────────────────────────
const pressureStd = () => [
  { key: "stdSteering", sub: "Steering · As Kemudi", pos: "L1 · R1", psi: recPsi(1) },
  { key: "stdDrive", sub: "Drive · As Penggerak", pos: "L2 · L3 · R2 · R3", psi: recPsi(3) },
] as const;

// ── 상태 판정 기준 ────────────────────────────────────────────
const JUDGE = [
  { lvKey: "judgeNormal", subKey: "kpiNormal", rangeKey: "judgeNormalRange", descKey: "judgeNormalDesc", cls: "border-level-ok/40 bg-level-ok/10 text-level-ok" },
  { lvKey: "judgeWarn", subKey: "judgeWarn", rangeKey: "judgeWarnRange", descKey: "judgeWarnDesc", cls: "border-level-warn/40 bg-level-warn/10 text-level-warn" },
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
  { labelKey: "eqOpLabel", sub: "Tekanan operasional", valueFn: () => `${recPsi(3)} psi`, noteKey: "eqOpNote" },
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
  // 문구에 권장 공기압이 들어가므로 DB 로드 후 렌더 시점에 만든다.
  const tx = buildTX()[lang];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecked((p) => ({ ...p, [id]: !p[id] }));
  const doneCount = PROCEDURE.filter((p) => checked[p.id]).length;

  // ── 실시간 공기압 이상 현황 계산 ──────────────────────────
  let measured = 0, ok = 0, warn = 0, danger = 0;
  const alerts: { lv: "danger" | "warn"; high: boolean; ch: string; pos: string; psi: number; target: number; dev: number }[] = [];
  TMS_DATA.units.forEach((u) => {
    for (let p = 1; p <= 10; p++) {
      const d = headPosData(u, p);
      if (!d || typeof d.latestPress !== "number") continue;
      measured++;
      const target = recPsi(p);
      const j = judgePressure(d.latestPress, target);
      if (j.level === "ok") { ok++; continue; }
      if (j.level === "danger") danger++; else warn++;
      alerts.push({ lv: j.level, high: j.cause === "high", ch: u.ch, pos: d.rp, psi: d.latestPress, target, dev: j.devPct });
    }
  });
  alerts.sort((a, b) => (a.lv === "danger" ? 0 : 1) - (b.lv === "danger" ? 0 : 1));

  const kpis = [
    { label: tx.kpiMeasured, sub: "Diukur", value: measured, cls: "border-primary/40 bg-primary/5 text-primary" },
    { label: tx.kpiNormal, sub: "Normal", value: ok, cls: "border-level-ok/40 bg-level-ok/10 text-level-ok" },
    { label: tx.kpiWarn, sub: "Perhatian", value: warn, cls: "border-level-warn/40 bg-level-warn/10 text-level-warn" },
    { label: tx.kpiDanger, sub: "Bahaya", value: danger, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  ];

  return (
    <div className="stagger-in space-y-6">

      {/* ── 1행: 권장 공기압 기준 + 공기압 이상 알림 (행 높이 맞춤) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="flex flex-col">
          <SectionTitle icon={<Wind className="w-4 h-4 text-primary" />} ko={tx.secStdTitle} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 auto-rows-fr">
            {pressureStd().map((s) => (
              <div key={s.key} className="rounded-xl border border-border bg-card p-4 text-center flex flex-col justify-center">
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
        </div>

        <div className="flex flex-col">
          <SectionTitle
            icon={<AlertTriangle className="w-4 h-4 text-level-warn" />}
            ko={tx.alertTitle}
            right={
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">
                {fmtInt(alerts.length)}{tx.alertCount}
              </span>
            }
          />
          <div className="rounded-xl border border-border bg-card p-4 flex-1 flex flex-col">
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 text-level-ok text-sm py-2">
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
                        : "text-level-warn border-level-warn/40 bg-level-warn/10"
                    }`}
                  >
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold border border-current">
                      {a.lv === "danger" ? (a.high ? tx.badgeHigh : tx.badgeLow) : tx.badgeDev}
                    </span>
                    <span className="font-mono">
                      {fmtVehicle(a.ch)} · {a.pos} — {fmtPressure(a.psi, false)}psi
                      <span className="text-muted-foreground"> ({tx.rec} {fmtPressure(a.target, false)} / {a.dev > 0 ? "+" : ""}{fmtPercent(a.dev)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-auto pt-3 text-xs text-muted-foreground">
              {tx.alertNote}
            </p>
          </div>
        </div>
      </div>

      {/* ── 2행: 최근 공기압 점검 현황 + 상태 판정 기준 (행 높이 맞춤) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="flex flex-col">
          <SectionTitle icon={<Activity className="w-4 h-4 text-primary" />} ko={tx.secStatusTitle} />
          <div className="grid grid-cols-2 gap-3 flex-1 auto-rows-fr">
            {kpis.map((k) => (
              <div key={k.label} className={`rounded-xl border p-4 text-center flex flex-col justify-center ${k.cls}`}>
                <div className="text-xs opacity-80 mb-1">{k.label} <span className="opacity-60">· {k.sub}</span></div>
                <div className="font-mono text-2xl font-bold leading-none">
                  {k.value}<span className="text-xs font-normal ml-1 opacity-70">{tx.unitCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <SectionTitle icon={<Gauge className="w-4 h-4 text-primary" />} ko={tx.secJudgeTitle} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 auto-rows-fr">
            {JUDGE.map((j) => (
              <div key={j.lvKey} className={`rounded-xl border p-4 text-center flex flex-col justify-center ${j.cls}`}>
                <div className="flex items-baseline justify-center gap-2 mb-2">
                  <span className="text-sm font-bold">{tx[j.lvKey]}</span>
                  <span className="text-xs opacity-70">{tx[j.subKey]}</span>
                </div>
                <div className="text-xs font-mono mb-1">{tx[j.rangeKey]}</div>
                <div className="text-xs opacity-80">{tx[j.descKey]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 공기압 이력 분석 (§B-2) ── */}
      <PressureHistorySection />

      {/* ── 점검 절차 체크리스트 ── */}
      <div>
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
      </div>

      {/* ── 측정 장비 관리 ── */}
      <div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{tx.secEquipTitle}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {EQUIP.map((e) => (
              <div key={e.labelKey} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                <div className="text-xs text-muted-foreground">{tx[e.labelKey]} <span className="opacity-60">· {e.sub}</span></div>
                <div className="font-mono text-lg font-bold text-primary my-1">{"valueFn" in e ? e.valueFn() : "value" in e ? e.value : tx[e.valueKey]}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{tx[e.noteKey]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 이상 징후 및 대응 ── */}
      <div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{tx.secSymTitle}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-140 table-fixed text-sm border-collapse">
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
      </div>

      {/* ── 결재/담당 라인 ── */}
      <div>
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
      </div>
    </div>
  );
}

// right = 제목 줄 오른쪽 끝에 붙는 슬롯. 건수 배지처럼 카드 안에서 한 줄을
// 통째로 잡아먹던 요소를 여기로 올려 카드 세로 여백을 줄인다.
function SectionTitle({ icon, ko, right }: { icon: React.ReactNode; ko: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 min-h-6">
      <div className="w-1 h-5 bg-primary rounded-full" />
      {icon}
      <span className="text-sm font-bold text-foreground">{ko}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}
