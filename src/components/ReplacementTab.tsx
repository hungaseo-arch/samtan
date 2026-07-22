// @section: replacement-tab
import { useState } from "react";
import { TMS_DATA } from "@/data/tmsData";
import { codeName } from "@/data/tmsUtils";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";

const TX = {
  ko: {
    title: "타이어 교체 이력",
    countSuffix: "건",
    rotation: "로테이션",
    chVehicle: "차량",
    position: "포지션",
    install1: "1차 장착일",
    install2: "2차 장착일",
    install3: "3차 장착일",
    footnote1: "교체가 실제 있었던 (차량·포지션)만 표시합니다.",
    footnoteOriginal: "원본 타이어",
    footnoteReplaced: "교체 장착 타이어",
    footnote2: "교체사유는 직전 타이어가 내려간 사유(폐기 시 손상코드, 그 외 \"로테이션\")입니다.",
    footnote3: "차량은 배치도로 이동하고, 장착일을 클릭하면 시리얼·교체사유 상세가 열립니다.",
    serialTitle: "수명 DB 보기",
    vehicleTitle: "배치도 보기",
    codeTitle: "손상 코드",
    excelDownload: "엑셀 다운로드",
    detailTitle: "교체 상세",
    stage: "차",
    stageOriginal: "원본 타이어",
    colSerial: "시리얼",
    colReason: "교체사유",
    colInstall: "장착일",
  },
  id: {
    title: "Riwayat Penggantian Ban",
    countSuffix: "item",
    rotation: "Rotasi",
    chVehicle: "Unit",
    position: "Posisi",
    install1: "Tgl pasang 1",
    install2: "Tgl pasang 2",
    install3: "Tgl pasang 3",
    footnote1: "Hanya menampilkan (Unit·Posisi) yang benar-benar diganti.",
    footnoteOriginal: "Ban asli",
    footnoteReplaced: "Ban pengganti",
    footnote2: "Alasan ganti adalah alasan ban sebelumnya dilepas (Kode kerusakan saat afkir, selainnya \"Rotasi\").",
    footnote3: "Unit → Tata Letak. Klik tanggal pasang untuk melihat serial·alasan ganti.",
    serialTitle: "Lihat DB Umur",
    vehicleTitle: "Lihat Tata Letak",
    codeTitle: "Kode Kerusakan",
    excelDownload: "Unduh Excel",
    detailTitle: "Detail Penggantian",
    stage: "",
    stageOriginal: "Ban asli",
    colSerial: "Serial",
    colReason: "Alasan ganti",
    colInstall: "Tgl pasang",
  },
  en: {
    title: "Tire Replacement History",
    countSuffix: "cases",
    rotation: "Rotation",
    chVehicle: "Vehicle",
    position: "Position",
    install1: "1st install date",
    install2: "2nd install date",
    install3: "3rd install date",
    footnote1: "Only (Vehicle·Position) pairs with an actual replacement are shown.",
    footnoteOriginal: "Original tire",
    footnoteReplaced: "Replacement tire",
    footnote2: "The replacement reason is why the previous tire was removed (damage code on scrap, otherwise \"Rotation\").",
    footnote3: "Vehicle opens the layout; clicking an install date opens the serial·replacement reason details.",
    serialTitle: "View lifetime DB",
    vehicleTitle: "View layout",
    codeTitle: "Damage code",
    excelDownload: "Excel download",
    detailTitle: "Replacement details",
    stage: "",
    stageOriginal: "Original tire",
    colSerial: "Serial",
    colReason: "Replacement reason",
    colInstall: "Install date",
  },
} as const;

interface ReplStage {
  date: string;
  serial: string;
  reason: { text: string; scrap: boolean };
}
interface ReplChain {
  ch: string;
  pos: string;
  firstSerial: string | null;
  firstInstall: string;
  stages: ReplStage[];
  lastDate: string;
}

export default function ReplacementTab({ onSerialClick, onVehicleClick }: {
  onSerialClick?: (serial: string) => void;
  onVehicleClick?: (ch: string) => void;
}) {
  const { lang } = useLang();
  const tx = TX[lang];
  const { canDownload } = useAuth();
  // 손상 코드 모달
  const [showCodes, setShowCodes] = useState(false);
  const [hiCode, setHiCode] = useState<string | null>(null);
  const openCodes = (code: string | null) => { setHiCode(code); setShowCodes(true); };
  // 교체 상세 모달 — 클릭한 (차량·포지션) 체인과 강조할 회차
  const [detail, setDetail] = useState<{ chain: ReplChain; stageIdx: number } | null>(null);

  // 교체 이력을 (차량·포지션)별 체인으로 묶어 1차 → 2차 → 3차 … 단계 구성
  const reasonOf = (serial: string | null) => {
    const l = serial ? TMS_DATA.life.find((x) => x.serial === serial) : undefined;
    const scrap = l?.status === "Scrap" && !!l.damage && l.damage !== "-";
    return { text: scrap ? codeName(l!.damage) : tx.rotation, scrap };
  };
  const installOf = (serial: string | null) => {
    const l = serial ? TMS_DATA.life.find((x) => x.serial === serial) : undefined;
    return l?.install && l.install !== "-" ? l.install : "−";
  };
  const replChains = (() => {
    const byPos = new Map<string, typeof TMS_DATA.repl>();
    TMS_DATA.repl.forEach((r) => {
      const k = `${r.ch}|${r.pos}`;
      if (!byPos.has(k)) byPos.set(k, []);
      byPos.get(k)!.push(r);
    });
    const rows = [...byPos.entries()].map(([k, reps]) => {
      const [ch, pos] = k.split("|");
      const sorted = [...reps].sort((a, b) => a.date.localeCompare(b.date));
      const pd = TMS_DATA.units.find((u) => u.ch === ch)?.positions.find((p) => p.pos === pos);
      const firstSerial = pd?.serial ?? null;
      const stages = sorted.map((r, idx) => ({
        date: r.date,
        serial: r.newSerial,
        reason: reasonOf(idx === 0 ? firstSerial : sorted[idx - 1].newSerial),
      }));
      return { ch, pos, firstSerial, firstInstall: installOf(firstSerial), stages, lastDate: sorted[sorted.length - 1].date };
    });
    rows.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    return rows;
  })();
  const has3rd = replChains.some((c) => c.stages.length >= 2);

  // 엑셀 내보내기 — 화면에서는 모달로 뺀 시리얼·교체사유까지 한 행에 모두 담는다.
  // (xlsx 는 클릭 시 동적 로드 — LifeTab 과 동일 방식)
  const exportExcel = async () => {
    const rows = replChains.map((c) => {
      const row: Record<string, string | number> = {
        [tx.chVehicle]: `CH ${c.ch}`,
        [tx.position]: c.pos,
        [tx.install1]: c.firstInstall === "−" ? "" : c.firstInstall,
        [`1${tx.stage} ${tx.colSerial}`]: c.firstSerial ?? "",
      };
      // 회차 수는 행마다 다르므로 표시 중인 최대 회차까지 열을 맞춘다.
      const maxStages = has3rd ? 2 : 1;
      for (let i = 0; i < maxStages; i++) {
        const s = c.stages[i];
        const n = i + 2; // 2차·3차
        row[`${n}${tx.stage} ${tx.colInstall}`] = s?.date ?? "";
        row[`${n}${tx.stage} ${tx.colSerial}`] = s?.serial ?? "";
        row[`${n}${tx.stage} ${tx.colReason}`] = s?.reason.text ?? "";
      }
      return row;
    });
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 20 },
      { wch: 12 }, { wch: 20 }, { wch: 14 },
      ...(has3rd ? [{ wch: 12 }, { wch: 20 }, { wch: 14 }] : []),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Replacement");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `TireReplacement_${stamp}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">
            {tx.title}
          </span>
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">
            {TMS_DATA.repl.length}{tx.countSuffix}
          </span>
          {/* 엑셀 다운로드 — 로그인한 모든 사용자(조회 권한 포함) */}
          {canDownload && (
            <button
              onClick={exportExcel}
              className="ml-auto inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {tx.excelDownload}
            </button>
          )}
        </div>
        {/* 가로 폭을 줄이기 위해 표에는 장착일까지만 두고, 시리얼·교체사유는 모달로 뺀다 */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm border-collapse">
            <colgroup>
              {(has3rd
                ? ["16%", "16%", "23%", "23%", "22%"]
                : ["20%", "20%", "30%", "30%"]
              ).map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                {(has3rd
                  ? [tx.chVehicle, tx.position, tx.install1, tx.install2, tx.install3]
                  : [tx.chVehicle, tx.position, tx.install1, tx.install2]
                ).map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {replChains.map((c, i) => {
                // 장착일 셀 — 클릭 시 해당 회차를 펼친 상세 모달을 연다.
                const dateCell = (date: string | undefined, stageIdx: number) =>
                  date && date !== "−" ? (
                    <button
                      className="font-mono text-xs text-foreground hover:text-primary hover:underline"
                      title={tx.detailTitle}
                      onClick={() => setDetail({ chain: c, stageIdx })}
                    >
                      {date}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">−</span>
                  );
                return (
                <tr key={i} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono font-bold text-primary">
                    <button className="hover:underline" title={`CH ${c.ch} ${tx.vehicleTitle}`} onClick={() => onVehicleClick?.(c.ch)}>CH {c.ch}</button>
                  </td>
                  <td className="px-3 py-2 font-mono text-sm">{c.pos}</td>
                  <td className="px-3 py-2">{dateCell(c.firstInstall, 0)}</td>
                  <td className="px-3 py-2">{dateCell(c.stages[0]?.date, 1)}</td>
                  {has3rd && <td className="px-3 py-2">{dateCell(c.stages[1]?.date, 2)}</td>}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          {tx.footnote1} <strong className="text-foreground">1</strong> = {tx.footnoteOriginal}, <strong className="text-foreground">2·3</strong> = {tx.footnoteReplaced}.
          {tx.footnote2}
          {tx.footnote3}
        </p>
      </div>

      {/* 교체 상세 모달 — 표에서 뺀 시리얼·교체사유를 회차별로 보여준다 */}
      <AnimatePresence>
        {detail && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDetail(null)}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">{tx.detailTitle}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    CH {detail.chain.ch} · {detail.chain.pos}
                  </p>
                </div>
                <button onClick={() => setDetail(null)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {[
                  { idx: 0, date: detail.chain.firstInstall, serial: detail.chain.firstSerial, reason: undefined as ReplStage["reason"] | undefined },
                  ...detail.chain.stages.map((s, i) => ({ idx: i + 1, date: s.date, serial: s.serial, reason: s.reason })),
                ].map((st) => {
                  const on = st.idx === detail.stageIdx;
                  return (
                    <div
                      key={st.idx}
                      className={`rounded-lg border px-4 py-3 ${on ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20"}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-black ${on ? "text-primary" : "text-muted-foreground"}`}>
                          {st.idx + 1}{tx.stage}
                        </span>
                        {st.idx === 0 && (
                          <span className="text-[10px] text-muted-foreground">({tx.stageOriginal})</span>
                        )}
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                        <dt className="text-muted-foreground">{tx.colInstall}</dt>
                        <dd className="font-mono">{st.date || "−"}</dd>
                        <dt className="text-muted-foreground">{tx.colSerial}</dt>
                        <dd className="font-mono">
                          {st.serial ? (
                            <button
                              className="text-primary hover:underline"
                              title={`${st.serial} · ${tx.serialTitle}`}
                              onClick={() => { setDetail(null); onSerialClick?.(st.serial!); }}
                            >
                              {st.serial}
                            </button>
                          ) : <span className="text-muted-foreground">−</span>}
                        </dd>
                        <dt className="text-muted-foreground">{tx.colReason}</dt>
                        <dd>
                          {!st.reason ? (
                            <span className="text-muted-foreground/50">−</span>
                          ) : st.reason.scrap ? (
                            <button
                              className="text-destructive font-bold hover:underline"
                              onClick={() => openCodes(st.reason!.text.split(" ")[0])}
                            >
                              {st.reason.text}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">{st.reason.text}</span>
                          )}
                        </dd>
                      </dl>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 손상 코드 모달 */}
      <AnimatePresence>
        {showCodes && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCodes(false)}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl"
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">{tx.codeTitle}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Damage Codes</p>
                </div>
                <button onClick={() => setShowCodes(false)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(TMS_DATA.codes).map(([code, desc]) => {
                  const on = code === hiCode;
                  return (
                    <div key={code} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${on ? "border-destructive bg-destructive/10" : "border-border/50 bg-muted/20"}`}>
                      <span className={`font-mono font-black text-xs w-10 shrink-0 ${on ? "text-destructive" : "text-primary"}`}>{code}</span>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
