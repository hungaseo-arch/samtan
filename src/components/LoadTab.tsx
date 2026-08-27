// @section: load-tab
import { LOAD_UNITS, LOAD_GROUPS, LOAD_GROSS_KG, HEAD_GROUP_SHARE, groupTotal } from "@/data/loadData";
import { loadPerTire, loadRatio, ratedByMount, fmtInt } from "@/data/tmsUtils";
import { Weight, AlertTriangle } from "lucide-react";
import { Fragment } from "react";
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
    bannerTitle: "하중 계산",
    bannerBody1: "총중량 ",
    bannerBody2: " · 정격: Head ",
    bannerBody3: "(단독) / 트레일러·돌리 ",
    bannerBody4: "(듀얼) kg/본.",
    overTitle: "과적 경고 (정격 초과)",
    overBody: " — 듀얼 정격을 초과합니다. 적재량 조정·축하중 재분배가 필요합니다.",
    unitStatusTitle: "유닛별 하중 현황",
    thUnit: "유닛",
    thSpec: "규격",
    thMount: "장착",
    thCount: "본수",
    thGroup: "그룹",
    thTare: "공차(kg)",
    thPayload: "적재(kg)",
    thDist: "분배율",
    thRated: "정격(kg)",
    thActual: "실하중(kg)",
    thPerTire: "타이어당(kg)",
    thLoad: "부하율",
    thStatus: "상태",
    total: "합계",
    subtotal: "소계",
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
    uNames: { headSteer: "Head 조향축", headDrive: "Head 구동축", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
    uSubs: { headSteer: "L1·R1 · 단독 (Head 20%)", headDrive: "L2·L3·R2·R3 · 듀얼 (Head 80%)", trailer1: "트레일러 1", trailer2: "트레일러 2", dolly: "돌리" },
    gNames: { 1: "그룹 1 · Head + 트레일러 1", 2: "그룹 2 · 돌리 + 트레일러 2" },
  },
  id: {
    statusOk: "Normal",
    statusWarn: "Perhatian",
    statusDanger: "Kelebihan beban",
    mountSingle: "Tunggal",
    mountDual: "Ganda",
    bannerTitle: "Perhitungan Beban",
    bannerBody1: "Berat total ",
    bannerBody2: " · Rating: Head ",
    bannerBody3: "(Tunggal) / trailer·dolly ",
    bannerBody4: "(Ganda) kg/ban.",
    overTitle: "Peringatan kelebihan beban (Melebihi rating)",
    overBody: " — Melebihi rating Ganda. Perlu penyesuaian muatan & distribusi beban poros.",
    unitStatusTitle: "Status beban per unit",
    thUnit: "Unit",
    thSpec: "Ukuran",
    thMount: "Pasang",
    thCount: "Jml ban",
    thGroup: "Grup",
    thTare: "Berat kosong(kg)",
    thPayload: "Muatan(kg)",
    thDist: "Distribusi",
    thRated: "Rating(kg)",
    thActual: "Beban aktual(kg)",
    thPerTire: "Per ban(kg)",
    thLoad: "Rasio beban",
    thStatus: "Status",
    total: "Total",
    subtotal: "Subtotal",
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
    uNames: { headSteer: "Head Poros Kemudi", headDrive: "Head Poros Penggerak", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
    uSubs: { headSteer: "L1·R1 · Tunggal (Head 20%)", headDrive: "L2·L3·R2·R3 · Ganda (Head 80%)", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
    gNames: { 1: "Grup 1 · Head + Trailer 1", 2: "Grup 2 · Dolly + Trailer 2" },
  },
  en: {
    statusOk: "Normal",
    statusWarn: "Caution",
    statusDanger: "Overload",
    mountSingle: "Single",
    mountDual: "Dual",
    bannerTitle: "Load calculation",
    bannerBody1: "Gross weight ",
    bannerBody2: " · Rated: Head ",
    bannerBody3: "(single) / trailer·dolly ",
    bannerBody4: "(dual) kg/tire.",
    overTitle: "Overload warning (rated capacity exceeded)",
    overBody: " — Exceeds the dual rated capacity. Payload adjustment and axle load redistribution required.",
    unitStatusTitle: "Load status by unit",
    thUnit: "Unit",
    thSpec: "Size",
    thMount: "Mounting",
    thCount: "Tires",
    thGroup: "Group",
    thTare: "Tare(kg)",
    thPayload: "Payload(kg)",
    thDist: "Distribution",
    thRated: "Rated(kg)",
    thActual: "Actual(kg)",
    thPerTire: "Per tire(kg)",
    thLoad: "Load ratio",
    thStatus: "Status",
    total: "Total",
    subtotal: "Subtotal",
    groupPrefix: "Group ",
    ratioTitle: "Load ratio vs rated",
    ratingHundred: "Rated 100%",
    footnoteLoad: "Normal <90% · Caution 90~100% · Overload >100% (dashed line = rated 100%, brackets = margin/excess vs rated)",
    src1: "Source: ",
    src2: " + load index (LI) table + manufacturer data. Rated capacity is applied according to ",
    srcMount: "mounting type",
    src3: " — trailer·dolly use dual mounting, so ",
    srcDual: "dual LI 160(4,500kg)",
    src4: " is used instead of single LI 162(4,750kg). Load per tire = reference weight × distribution ÷ number of tires, load ratio = load per tire ÷ rated capacity (per mounting type).",
    distBasisLabel: "Distribution basis:",
    distBasis1: " trailer·dolly are based on group gross weight, ",
    headBasis1: "Head steer/drive axles are based on Head load (50% of group 1 = ",
    headBasis2: " kg)",
    headBasis3: ". Head 50% = steer axle 20%(2 tires) + drive axle 80%(8 tires).",
    egPrefix: "e.g. steer axle ",
    egMid1: " · drive axle ",
    egMid2: "(78%) · trailer 1 3,917/4,500(87%) · trailer 2·dolly 4,000/4,500(89%).",
    egSteer: "/6,000(78%)",
    uNames: { headSteer: "Head steer axle", headDrive: "Head drive axle", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
    uSubs: { headSteer: "L1·R1 · single (Head 20%)", headDrive: "L2·L3·R2·R3 · dual (Head 80%)", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
    gNames: { 1: "Group 1 · Head + Trailer 1", 2: "Group 2 · Dolly + Trailer 2" },
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
              {tx.bannerBody1}
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
                {overUnits.map((u) => `${tx.uNames[u.key]} (${Math.round(u.load * 100)}%)`).join(" · ")}{tx.overBody}
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
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-205 table-fixed text-xs border-collapse">
              <colgroup>
                {["9%", "11%", "10%", "6%", "5%", "7%", "7%", "7%", "7%", "10%", "9%", "7%", "5%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: tx.thGroup, align: "center" },
                    { label: tx.thUnit, align: "left" },
                    { label: tx.thSpec, align: "left" },
                    { label: tx.thMount, align: "center" },
                    { label: tx.thCount, align: "right" },
                    { label: tx.thTare, align: "right" },
                    { label: tx.thPayload, align: "right" },
                    { label: tx.thDist, align: "right" },
                    { label: tx.thRated, align: "right" },
                    { label: tx.thActual, align: "right" },
                    { label: tx.thPerTire, align: "right" },
                    { label: tx.thLoad, align: "right" },
                    { label: tx.thStatus, align: "center" },
                  ].map((h) => (
                    <th key={h.label} className={`px-2 py-2 text-muted-foreground font-semibold whitespace-nowrap ${h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...new Set(rows.map((r) => r.group))].map((gid) => {
                  // 그룹 단위로 데이터 행을 그린 뒤, 그룹마다 소계 행을 이어 붙인다(행이 그룹 순으로 연속).
                  const grp = rows.filter((r) => r.group === gid);
                  const tireSum = grp.reduce((s, r) => s + r.count, 0);
                  const tareSum = grp.reduce((s, r) => s + r.unitWeight, 0);
                  const payload = LOAD_GROUPS.find((x) => x.id === gid)!.payload; // 적재는 그룹 단위 값(병합 표시)
                  const actualSum = grp.reduce((s, r) => s + r.total * r.dist, 0); // 그룹 실하중 합 = 그룹 총중량
                  return (
                  <Fragment key={gid}>
                    {grp.map((r, i) => (
                      <tr key={r.name} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        {i === 0 && (
                          <td rowSpan={grp.length} className="px-2 py-2 text-center align-middle text-[11px] font-semibold border-r border-border/40 bg-muted/10">{tx.groupPrefix}{gid}</td>
                        )}
                        <td className="px-2 py-2 font-bold text-primary">{tx.uNames[r.key]}</td>
                        <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">{r.spec}</td>
                        <td className="px-2 py-2 text-center text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded-full border ${r.mount === "dual" ? "border-primary/40 text-primary bg-primary/5" : "border-border text-muted-foreground bg-muted/30"}`}>{mountLabel(r.mount)}</span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono">{r.count}</td>
                        <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmtInt(r.unitWeight)}</td>
                        {i === 0 && (
                          <td rowSpan={grp.length} className="px-2 py-2 text-right align-middle font-mono text-muted-foreground border-l border-border/40 bg-muted/10">{fmtInt(payload)}</td>
                        )}
                        {/* 분배율은 그룹 총중량 기준으로 표시. Head 축의 dist(조향 20%·구동 80%)는
                            Head 하중 기준이므로 HEAD_GROUP_SHARE(50%)를 곱해 그룹 기준으로 환산한다.
                            → 조향 50%×20%=10%, 구동 50%×80%=40%, 트레일러1 50% (그룹1 합계 100%). */}
                        <td className="px-2 py-2 text-right font-mono text-muted-foreground">{Math.round((r.axleOfHead ? HEAD_GROUP_SHARE * r.dist : r.dist) * 100)}%</td>
                        <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmtInt(r.rated)}</td>
                        <td className="px-2 py-2 text-right font-mono text-foreground">{fmtInt(r.total * r.dist)}</td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-primary">{fmtInt(r.perTire)}</td>
                        <td className={`px-2 py-2 text-right font-mono font-bold ${STATUS[r.status].cls}`}>{Math.round(r.load * 100)}%</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`text-[10px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                        </td>
                      </tr>
                    ))}
                    {/* 그룹 소계 — 수량·공차·적재 합산 */}
                    <tr className="border-b border-border bg-muted/20 font-semibold">
                      <td />
                      <td className="px-2 py-1.5 text-left text-[11px]">{tx.subtotal}</td>
                      <td colSpan={2} />
                      <td className="px-2 py-1.5 text-right font-mono">{tireSum}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{fmtInt(tareSum)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{fmtInt(payload)}</td>
                      <td colSpan={2} />
                      <td className="px-2 py-1.5 text-right font-mono">{fmtInt(actualSum)}</td>
                      <td colSpan={3} />
                    </tr>
                  </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                {/* 합계 — 수량·공차·적재 합산(분배율·정격·부하율은 합이 무의미). */}
                <tr className="border-t-2 border-border font-bold">
                  <td />
                  <td className="px-2 py-2 text-left text-[11px] text-muted-foreground">{tx.total}</td>
                  <td colSpan={2} />
                  <td className="px-2 py-2 text-right font-mono">{rows.reduce((s, r) => s + r.count, 0)}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtInt(rows.reduce((s, r) => s + r.unitWeight, 0))}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtInt(LOAD_GROUPS.reduce((s, g) => s + g.payload, 0))}</td>
                  <td colSpan={2} />
                  <td className="px-2 py-2 text-right font-mono">{fmtInt(rows.reduce((s, r) => s + r.total * r.dist, 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
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
        </p>
      </motion.div>
    </motion.div>
  );
}
