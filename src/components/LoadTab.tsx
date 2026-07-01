// @section: load-tab
import { LOAD_UNITS, LOAD_GROUPS, LOAD_GROSS_KG, HEAD_GROUP_SHARE, groupTotal } from "@/data/loadData";
import { loadPerTire, loadRatio, ratedByMount, fmtInt } from "@/data/tmsUtils";
import { Weight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    statusOk: "정상",
    statusWarn: "주의",
    statusDanger: "과적",
    mountSingle: "단독",
    mountDual: "듀얼",
    bannerTitle: "하중 계산 · Load Distribution",
    bannerBody1: "기준 하중 그룹별 타이어당 하중·정격 대비 부하율입니다. 총중량 ",
    bannerBody2: " · 정격: Head ",
    bannerBody3: "(단독) / 트레일러·돌리 ",
    bannerBody4: "(듀얼) kg/본.",
    overTitle: "과적 경고 (정격 초과)",
    overBody: " — 듀얼 정격을 초과합니다. 적재량 조정·축하중 재분배가 필요합니다.",
    allWithin1: "모든 유닛이 정격 이내입니다. (최대 부하율 ",
    allWithin2: "%)",
    unitStatusTitle: "유닛별 하중 현황",
    thUnit: "유닛",
    thSpec: "규격",
    thMount: "장착",
    thCount: "본수",
    thGroup: "그룹",
    thTare: "공차(kg)",
    thDist: "분배율",
    thRated: "정격(kg)",
    thPerTire: "타이어당(kg)",
    thLoad: "부하율",
    thStatus: "상태",
    groupPrefix: "그룹 ",
    ratioTitle: "정격 대비 부하율",
    ratingHundred: "정격 100%",
    footnoteLoad: "정상 <90% · 주의 90~100% · 과적 >100% (점선 = 정격 100%, 괄호 = 정격 대비 여유/초과)",
    src1: "출처: ",
    src2: " + 하중지수(LI) 표 + 제조사 데이터. 정격은 ",
    srcMount: "장착방식",
    src3: "에 따라 적용 — 트레일러·돌리는 듀얼 장착으로 단독 LI 162(4,750kg) 대신 ",
    srcDual: "듀얼 LI 160(4,500kg)",
    src4: "을 사용합니다. 타이어당 하중 = 기준중량 × 분배율 ÷ 본수, 부하율 = 타이어당 하중 ÷ 정격(장착방식 적용).",
    distBasisLabel: "분배율 기준:",
    distBasis1: " 트레일러·돌리는 그룹 총중량 대비, ",
    headBasis1: "Head 조향/구동축은 Head 하중(그룹1의 50% = ",
    headBasis2: " kg) 대비",
    headBasis3: ". Head 50% = 조향축 20%(2본) + 구동축 80%(8본).",
    egPrefix: "예: 조향축 ",
    egMid1: " · 구동축 ",
    egMid2: "(78%) · 트레일러 1 3,917/4,500(87%) · 트레일러 2·돌리 4,000/4,500(89%).",
    egSteer: "/6,000(78%)",
    editData: "데이터 수정: ",
  },
  id: {
    statusOk: "Normal",
    statusWarn: "Perhatian",
    statusDanger: "Kelebihan beban",
    mountSingle: "Tunggal",
    mountDual: "Ganda",
    bannerTitle: "Perhitungan Beban · Load Distribution",
    bannerBody1: "Per grup beban acuan, beban per ban·rasio beban thd rating. Berat total ",
    bannerBody2: " · Rating: Head ",
    bannerBody3: "(Tunggal) / trailer·dolly ",
    bannerBody4: "(Ganda) kg/ban.",
    overTitle: "Peringatan kelebihan beban (Melebihi rating)",
    overBody: " — Melebihi rating Ganda. Perlu penyesuaian muatan & distribusi beban poros.",
    allWithin1: "Semua unit dalam rating. (Rasio maks ",
    allWithin2: "%)",
    unitStatusTitle: "Status beban per unit",
    thUnit: "Unit",
    thSpec: "Ukuran",
    thMount: "Pasang",
    thCount: "Jml ban",
    thGroup: "Grup",
    thTare: "Berat kosong(kg)",
    thDist: "Distribusi",
    thRated: "Rating(kg)",
    thPerTire: "Per ban(kg)",
    thLoad: "Rasio beban",
    thStatus: "Status",
    groupPrefix: "Grup ",
    ratioTitle: "Rasio beban thd rating",
    ratingHundred: "Rating 100%",
    footnoteLoad: "Normal <90% · Perhatian 90~100% · Kelebihan beban >100% (garis putus = rating 100%, kurung = sisa/lebih thd rating)",
    src1: "Sumber: ",
    src2: " + tabel indeks beban(LI) + Data pabrikan. Rating diterapkan menurut ",
    srcMount: "cara pemasangan",
    src3: " — trailer·dolly dengan pemasangan Ganda memakai ",
    srcDual: "Ganda LI 160(4,500kg)",
    src4: " sebagai ganti Tunggal LI 162(4,750kg). Beban per ban = berat acuan × distribusi ÷ jml ban, rasio beban = beban per ban ÷ rating(menurut pemasangan).",
    distBasisLabel: "Dasar distribusi:",
    distBasis1: " trailer·dolly thd berat total grup, ",
    headBasis1: "poros kemudi/penggerak Head thd Beban Head (50% grup1 = ",
    headBasis2: " kg)",
    headBasis3: ". Head 50% = poros kemudi 20%(2 ban) + poros penggerak 80%(8 ban).",
    egPrefix: "Contoh: poros kemudi ",
    egMid1: " · poros penggerak ",
    egMid2: "(78%) · trailer 1 3,917/4,500(87%) · trailer 2·dolly 4,000/4,500(89%).",
    egSteer: "/6,000(78%)",
    editData: "Edit data: ",
  },
} as const;

export default function LoadTab() {
  const { lang } = useLang();
  const tx = TX[lang];
  const headLoad = groupTotal(1) * HEAD_GROUP_SHARE; // Head 하중(조향+구동 기준중량)
  const rows = LOAD_UNITS.map((u) => {
    // Head 축 분할 행은 Head 하중 대비, 그 외는 그룹 총중량 대비로 분배
    const total = u.axleOfHead ? headLoad : groupTotal(u.group);
    const rated = ratedByMount(u.mount, u.ratedSingle, u.ratedDual); // 장착방식 정격
    const perTire = loadPerTire(total, u.dist, u.count);     // 타이어당 하중
    const load = loadRatio(perTire, rated);                  // 부하율
    const over = load - 1;                                   // 정격 대비 초과율(음수=여유)
    const status: "ok" | "warn" | "danger" = load > 1 ? "danger" : load >= 0.9 ? "warn" : "ok";
    return { ...u, total, rated, perTire, load, over, status };
  });

  const overUnits = rows.filter((r) => r.status === "danger");
  const STATUS = {
    ok: { label: tx.statusOk, cls: "text-green-600", bar: "bg-green-500" },
    warn: { label: tx.statusWarn, cls: "text-yellow-600", bar: "bg-yellow-400" },
    danger: { label: tx.statusDanger, cls: "text-destructive", bar: "bg-destructive" },
  };
  const mountLabel = (m: "single" | "dual") => (m === "dual" ? tx.mountDual : tx.mountSingle);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* 안내 배너 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 flex items-start gap-3">
          <Weight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-primary">{tx.bannerTitle}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Techking <em>Load Distribution Road Train unit</em> {tx.bannerBody1}
              <strong className="text-foreground font-mono">{fmtInt(LOAD_GROSS_KG)} kg</strong>{tx.bannerBody2}
              <strong className="text-foreground font-mono">6,000</strong>{tx.bannerBody3}<strong className="text-foreground font-mono">4,500</strong>{tx.bannerBody4}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 과적 경고 (정격 초과 시에만 표시) */}
      {overUnits.length > 0 && (
        <motion.div variants={staggerItem}>
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-destructive">{tx.overTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {overUnits.map((u) => `${u.name} (${Math.round(u.load * 100)}%)`).join(" · ")}{tx.overBody}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* 하중 표 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <span className="text-sm font-bold text-foreground">{tx.unitStatusTitle}</span>
            <span className="text-xs text-muted-foreground">Load per Unit</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs border-collapse">
              <colgroup>
                {["12%", "12%", "7%", "6%", "9%", "8%", "9%", "9%", "12%", "10%", "6%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: tx.thUnit, align: "left" },
                    { label: tx.thSpec, align: "left" },
                    { label: tx.thMount, align: "center" },
                    { label: tx.thCount, align: "right" },
                    { label: tx.thGroup, align: "left" },
                    { label: tx.thTare, align: "right" },
                    { label: tx.thDist, align: "right" },
                    { label: tx.thRated, align: "right" },
                    { label: tx.thPerTire, align: "right" },
                    { label: tx.thLoad, align: "right" },
                    { label: tx.thStatus, align: "center" },
                  ].map((h) => (
                    <th key={h.label} className={`px-2 py-2 text-muted-foreground font-semibold whitespace-nowrap ${h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-2 font-bold text-primary">{r.name}<span className="block text-[10px] text-muted-foreground font-normal">{r.sub}</span></td>
                    <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">{r.spec}</td>
                    <td className="px-2 py-2 text-center text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded-full border ${r.mount === "dual" ? "border-primary/40 text-primary bg-primary/5" : "border-border text-muted-foreground bg-muted/30"}`}>{mountLabel(r.mount)}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{r.count}</td>
                    <td className="px-2 py-2 text-[11px]">{tx.groupPrefix}{r.group}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmtInt(r.unitWeight)}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{Math.round(r.dist * 100)}%</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmtInt(r.rated)}</td>
                    <td className="px-2 py-2 text-right font-mono font-bold text-primary">{fmtInt(r.perTire)}</td>
                    <td className={`px-2 py-2 text-right font-mono font-bold ${STATUS[r.status].cls}`}>{Math.round(r.load * 100)}%</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-[10px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 그룹 총중량 요약 */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LOAD_GROUPS.map((g) => (
              <div key={g.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] flex items-center justify-between">
                <span className="font-semibold">{g.name}</span>
                <span className="font-mono text-muted-foreground">Payload {fmtInt(g.payload)} · 총 <strong className="text-foreground">{fmtInt(groupTotal(g.id))} kg</strong></span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* 부하율 막대 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <span className="text-sm font-bold text-foreground">{tx.ratioTitle}</span>
            <span className="text-xs text-muted-foreground">Load Ratio</span>
          </div>
          <div className="space-y-3">
            {rows.map((r) => {
              const pct = r.load * 100;
              return (
                <div key={r.name}>
                  <div className="flex items-baseline justify-between mb-1 text-xs">
                    <span className="font-semibold">{r.name} <span className="text-muted-foreground font-normal">· {r.sub} · {mountLabel(r.mount)}</span></span>
                    <span className={`font-mono font-bold ${STATUS[r.status].cls}`}>
                      {Math.round(pct)}% <span className="text-muted-foreground font-normal">({r.over >= 0 ? "+" : ""}{Math.round(r.over * 100)}%)</span>
                    </span>
                  </div>
                  {/* 100% 기준선 = 트랙의 1/1.3 지점 */}
                  <div className="relative h-3 rounded-full bg-muted/40 overflow-hidden">
                    <div className={`h-full ${STATUS[r.status].bar} transition-all`} style={{ width: `${Math.min(pct / 1.3, 100)}%` }} />
                    <div className="absolute top-0 bottom-0 border-l border-dashed border-foreground/40" style={{ left: `${100 / 1.3}%` }} title={tx.ratingHundred} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> {tx.footnoteLoad}
          </p>
        </div>
      </motion.div>

      {/* 근거 */}
      <motion.div variants={staggerItem}>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {tx.src1}<strong className="text-foreground">Techking — Load Distribution Road Train unit</strong>{tx.src2}<strong className="text-foreground">{tx.srcMount}</strong>{tx.src3}<strong className="text-foreground">{tx.srcDual}</strong>{tx.src4}
          <br />
          <strong className="text-foreground">{tx.distBasisLabel}</strong>{tx.distBasis1}<strong className="text-foreground">{tx.headBasis1}{fmtInt(headLoad)}{tx.headBasis2}</strong>{tx.headBasis3}
          <br />
          {tx.egPrefix}{fmtInt(headLoad * 0.2 / 2)}{tx.egSteer}{tx.egMid1}{fmtInt(headLoad * 0.8 / 8)}{tx.egMid2}
          {tx.editData}<span className="font-mono">src/data/loadData.ts · LOAD_UNITS</span>.
        </p>
      </motion.div>
    </motion.div>
  );
}
