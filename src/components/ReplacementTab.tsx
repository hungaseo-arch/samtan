// @section: replacement-tab
import { useState } from "react";
import { TMS_DATA } from "@/data/tmsData";
import { codeName } from "@/data/tmsUtils";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    title: "타이어 교체 이력",
    countSuffix: "건",
    rotation: "로테이션",
    chVehicle: "차량",
    position: "포지션",
    install1: "1차 장착일",
    serial1: "1차 시리얼",
    install2: "2차 장착일",
    serial2: "2차 시리얼",
    reason2: "2차 교체사유",
    install3: "3차 장착일",
    serial3: "3차 시리얼",
    reason3: "3차 교체사유",
    footnote1: "교체가 실제 있었던 (차량·포지션)만 표시합니다.",
    footnoteOriginal: "원본 타이어",
    footnoteReplaced: "교체 장착 타이어",
    footnote2: "교체사유는 직전 타이어가 내려간 사유(폐기 시 손상코드, 그 외 \"로테이션\")입니다.",
    footnote3: "차량은 배치도로, 시리얼은 수명 DB로 이동하며, 손상코드를 클릭하면 설명 모달이 열립니다.",
    serialTitle: "수명 DB 보기",
    vehicleTitle: "배치도 보기",
    codeTitle: "손상 코드",
  },
  id: {
    title: "Riwayat Penggantian Ban",
    countSuffix: "item",
    rotation: "Rotasi",
    chVehicle: "Unit",
    position: "Posisi",
    install1: "Tgl pasang 1",
    serial1: "Serial 1",
    install2: "Tgl pasang 2",
    serial2: "Serial 2",
    reason2: "Alasan ganti 2",
    install3: "Tgl pasang 3",
    serial3: "Serial 3",
    reason3: "Alasan ganti 3",
    footnote1: "Hanya menampilkan (Unit·Posisi) yang benar-benar diganti.",
    footnoteOriginal: "Ban asli",
    footnoteReplaced: "Ban pengganti",
    footnote2: "Alasan ganti adalah alasan ban sebelumnya dilepas (Kode kerusakan saat afkir, selainnya \"Rotasi\").",
    footnote3: "Unit → Tata Letak, Serial → DB Umur, dan klik kode kerusakan untuk buka modal keterangan.",
    serialTitle: "Lihat DB Umur",
    vehicleTitle: "Lihat Tata Letak",
    codeTitle: "Kode Kerusakan",
  },
} as const;

export default function ReplacementTab({ onSerialClick, onVehicleClick }: {
  onSerialClick?: (serial: string) => void;
  onVehicleClick?: (ch: string) => void;
}) {
  const { lang } = useLang();
  const tx = TX[lang];
  // 손상 코드 모달
  const [showCodes, setShowCodes] = useState(false);
  const [hiCode, setHiCode] = useState<string | null>(null);
  const openCodes = (code: string | null) => { setHiCode(code); setShowCodes(true); };

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">
            {tx.title}
          </span>
          <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">
            {TMS_DATA.repl.length}{tx.countSuffix}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-sm border-collapse">
            <colgroup>
              {(has3rd
                ? ["7%", "6%", "9%", "13%", "9%", "13%", "10%", "9%", "13%", "11%"]
                : ["9%", "9%", "13%", "19%", "13%", "19%", "18%"]
              ).map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                {(has3rd
                  ? [tx.chVehicle, tx.position, tx.install1, tx.serial1, tx.install2, tx.serial2, tx.reason2, tx.install3, tx.serial3, tx.reason3]
                  : [tx.chVehicle, tx.position, tx.install1, tx.serial1, tx.install2, tx.serial2, tx.reason2]
                ).map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {replChains.map((c, i) => {
                const serialCell = (s: string | null) => s ? (
                  <button className="text-primary hover:underline" title={`${s} · ${tx.serialTitle}`} onClick={() => onSerialClick?.(s)}>{s}</button>
                ) : <span className="text-muted-foreground">−</span>;
                const reasonCell = (r?: { text: string; scrap: boolean }) => !r ? <span className="text-muted-foreground/40">−</span> : (
                  r.scrap
                    ? <button className="text-destructive font-bold hover:underline" onClick={() => openCodes(r.text.split(" ")[0])}>{r.text}</button>
                    : <span className="text-muted-foreground">{r.text}</span>
                );
                const s2 = c.stages[0];
                const s3 = c.stages[1];
                return (
                <tr key={i} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono font-bold text-primary">
                    <button className="hover:underline" title={`CH ${c.ch} ${tx.vehicleTitle}`} onClick={() => onVehicleClick?.(c.ch)}>CH {c.ch}</button>
                  </td>
                  <td className="px-3 py-2 font-mono text-sm">{c.pos}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.firstInstall}</td>
                  <td className="px-3 py-2 font-mono text-xs truncate">{serialCell(c.firstSerial)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s2?.date ?? "−"}</td>
                  <td className="px-3 py-2 font-mono text-xs truncate">{serialCell(s2?.serial ?? null)}</td>
                  <td className="px-3 py-2 text-xs">{reasonCell(s2?.reason)}</td>
                  {has3rd && (
                    <>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s3?.date ?? "−"}</td>
                      <td className="px-3 py-2 font-mono text-xs truncate">{serialCell(s3?.serial ?? null)}</td>
                      <td className="px-3 py-2 text-xs">{reasonCell(s3?.reason)}</td>
                    </>
                  )}
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
