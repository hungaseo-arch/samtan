// @section: life-tab
import { useState, useEffect, useRef } from "react";
import { TMS_DATA, TREAD_WARN, TREAD_DANGER } from "@/data/tmsData";
import { codeName, fmtD, fmtInt, fmtTread, lifeCalc, findUnitBySerial, latestTreadOf, tireHistory, tireMovements } from "@/data/tmsUtils";
import type { LifeRecord } from "@/data/tmsData";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    dbTitle: "타이어 수명 DB",
    status: "상태",
    all: "전체",
    pcs: "본",
    colNo: "No",
    colSerial: "시리얼",
    colInstall: "최초 장착일",
    colTread: "최근 트레드",
    colKm: "주행 KM",
    colHr: "주행 HR",
    colExpKm: "예상 KM",
    colExpHm: "예상 HM",
    colStatus: "상태",
    colNote: "비고",
    avg: "평균",
    nonMeasured: "측정 외",
    hmReset: "HM Reset",
    foot1a: "행을 클릭",
    foot1b: "하면 해당 타이어의 전체 히스토리(장착·탈착·폐기·HM Reset·측정 회차)를 모달로 확인할 수 있습니다.",
    foot2a: "목표 수명 {km} km",
    foot2b: " — 예상수명이 목표 이상이면 초록색으로 표시됩니다.",
    foot3a: "최근 수명(km·hr)",
    foot3b: " = 측정 시작(신품)부터 최신 회차까지 누적 주행거리·가동시간. ",
    foot3c: "최근 트레드",
    foot3d: " = 해당 타이어의 가장 최근 측정값(≤8mm 주의, ≤5mm 교체권장).",
    foot4a: "HM Reset",
    foot4b: " = 운용 중 차량의 가동시간계(Hour Meter)·주행거리가 0으로 초기화된 차량(CH 832·835). 리셋 이전 누적 이력이 끊겨 수명·예상수명이 ",
    foot4c: "로 표시될 수 있습니다.",
    foot5: "예상 KM은 트레드가 신품 22mm부터 측정된 타이어에 한해 0mm 도달 시점을 추정하며, 교체·폐기(Scrap)·미장착(Not Install) 타이어에는 표시하지 않습니다.",
    foot6a: "측정 외",
    foot6b: " = 모니터링 5대(834·839·832·835·849) 외 차량 장착 또는 예비 타이어 — 점검 데이터가 없어 트레드·주행·예상이 ",
    foot6c: "로 표시됩니다.",
    foot7a: "비고의 ",
    foot7b: "손상 코드",
    foot7c: "를 클릭하면 설명 모달이 열립니다. ",
    foot7d: "손상 코드 전체 보기",
    codesTitle: "손상 코드",
    histNotInstall: "미장착",
    histTireHistory: "타이어 히스토리",
    hInstall: "최초 장착일",
    hMount: "재장착일",
    hMountSub: "교체 장착",
    hRemove: "탈착일",
    hScrap: "폐기일",
    hDamage: "손상 코드",
    hHmReset: "HM Reset",
    hHmResetYes: "해당 (계기 초기화 차량)",
    hHmResetNo: "없음",
    hKmHr: "주행 KM / HR",
    hExpKmHm: "예상 KM / HM",
    hTread: "최근 트레드",
    measHist: "측정 이력",
    sessions: "회차",
    noMeasData: "측정 데이터 없음",
    colInspect: "점검일",
    moveHist: "장착 이력 (위치·차량 변경)",
    moveNone: "장착 이력이 1건입니다 (변경 없음).",
    mDate: "장착일",
    mVehicle: "차량",
    mPos: "포지션",
    mKind: "구분",
    mInstall: "최초 장착",
    mMount: "교체 장착",
    mCurrent: "현재",
    excelDownload: "엑셀 다운로드",
  },
  id: {
    dbTitle: "DB Umur Ban",
    status: "Status",
    all: "Semua",
    pcs: "pcs",
    colNo: "No",
    colSerial: "Serial",
    colInstall: "Tgl pasang awal",
    colTread: "Tapak terkini",
    colKm: "KM tempuh",
    colHr: "Jam (HR)",
    colExpKm: "Prediksi KM",
    colExpHm: "Prediksi HM",
    colStatus: "Status",
    colNote: "Catatan",
    avg: "Rata-rata",
    nonMeasured: "Non-ukur",
    hmReset: "HM Reset",
    foot1a: "Klik baris",
    foot1b: " untuk melihat riwayat lengkap ban (pasang·lepas·afkir·HM Reset·sesi ukur) dalam modal.",
    foot2a: "Target umur {km} km",
    foot2b: " — jika prediksi umur mencapai target atau lebih, ditampilkan hijau.",
    foot3a: "Umur terkini (km·hr)",
    foot3b: " = akumulasi jarak·jam dari awal ukur (baru) hingga sesi terbaru. ",
    foot3c: "Tapak terkini",
    foot3d: " = nilai ukur paling baru ban tersebut (≤8mm perhatian, ≤5mm disarankan ganti).",
    foot4a: "HM Reset",
    foot4b: " = unit yang Hour Meter·jarak tempuhnya di-reset ke 0 saat operasi (CH 832·835). Riwayat akumulasi sebelum reset terputus sehingga umur·prediksi dapat ditampilkan ",
    foot4c: ".",
    foot5: "Prediksi KM hanya untuk ban yang diukur dari kondisi baru 22mm, mengestimasi waktu mencapai 0mm, dan tidak ditampilkan untuk ban ganti·afkir (Scrap)·tidak terpasang (Not Install).",
    foot6a: "Non-ukur",
    foot6b: " = terpasang di unit selain 5 unit pantau (834·839·832·835·849) atau ban cadangan — tanpa data inspeksi sehingga tapak·tempuh·prediksi ditampilkan ",
    foot6c: ".",
    foot7a: "Pada Catatan, ",
    foot7b: "kode kerusakan",
    foot7c: " yang diklik akan membuka modal penjelasan. ",
    foot7d: "Lihat semua kode",
    codesTitle: "Kode Kerusakan",
    histNotInstall: "Tidak terpasang",
    histTireHistory: "Riwayat ban",
    hInstall: "Tgl pasang awal",
    hMount: "Tgl pasang ulang",
    hMountSub: "Pasang ganti",
    hRemove: "Tgl lepas",
    hScrap: "Tgl afkir",
    hDamage: "Kode Kerusakan",
    hHmReset: "HM Reset",
    hHmResetYes: "Ya (unit reset meter)",
    hHmResetNo: "Tidak",
    hKmHr: "KM tempuh / HR",
    hExpKmHm: "Prediksi KM / HM",
    hTread: "Tapak terkini",
    measHist: "Riwayat ukur",
    sessions: "sesi",
    noMeasData: "Tidak ada data ukur",
    colInspect: "Tgl inspeksi",
    moveHist: "Riwayat pemasangan (posisi·unit)",
    moveNone: "Hanya 1 riwayat pemasangan (tidak berubah).",
    mDate: "Tgl pasang",
    mVehicle: "Unit",
    mPos: "Posisi",
    mKind: "Jenis",
    mInstall: "Pasang awal",
    mMount: "Pasang ganti",
    mCurrent: "Saat ini",
    excelDownload: "Unduh Excel",
  },
} as const;

const TARGET_KM = 75000; // 목표 수명 (km)

const STATUS_STYLE: Record<LifeRecord["status"], string> = {
  Install: "text-green-400 border-green-500/40 bg-green-500/10",
  Scrap: "text-destructive border-destructive/40 bg-destructive/10",
  Spare: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  "Not Install": "text-muted-foreground border-border bg-muted/20",
};

export default function LifeTab({ focusSerial }: { focusSerial?: string | null }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const [lifeFilter, setLifeFilter] = useState<string>("ALL");

  const filtered = TMS_DATA.life.filter(
    (l) => lifeFilter === "ALL" || l.status === lifeFilter
  );

  // 시리얼 포커스(다른 페이지/교체 이력 탭에서 시리얼 클릭) → 해당 행 스크롤·하이라이트
  const focusRow = useRef<HTMLTableRowElement | null>(null);
  const [target, setTarget] = useState<string | null>(focusSerial ?? null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0); // 동일 시리얼 반복 클릭에도 재동작

  useEffect(() => {
    if (focusSerial) { setLifeFilter("ALL"); setTarget(focusSerial); setFocusKey((k) => k + 1); }
  }, [focusSerial]);

  useEffect(() => {
    if (!target) return;
    focusRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(target);
    const t = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(t);
  }, [target, focusKey]);

  // 행 클릭 → 타이어 전체 히스토리 모달
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const hist = historyOf ? tireHistory(historyOf) : null;
  const moves = historyOf ? tireMovements(historyOf) : [];

  // 손상 코드 모달 (코드 클릭 시 열기, hiCode = 강조할 코드)
  const [showCodes, setShowCodes] = useState(false);
  const [hiCode, setHiCode] = useState<string | null>(null);
  const openCodes = (code: string | null) => { setHiCode(code); setShowCodes(true); };

  // 표시 행(필터 적용)의 평균값 — 최근 트레드 / 주행 KM·HR / 예상 KM·HM
  const avg = (() => {
    const acc = { tread: [0, 0], km: [0, 0], hr: [0, 0], ekm: [0, 0], ehm: [0, 0] };
    const add = (slot: number[], v: number | null | undefined) => { if (v != null) { slot[0] += v; slot[1]++; } };
    filtered.forEach((l) => {
      const c = lifeCalc(l.serial);
      const noExp = l.status === "Scrap" || l.status === "Not Install";
      add(acc.tread, latestTreadOf(l.serial));
      add(acc.km, c?.km);
      add(acc.hr, c?.hr);
      if (!noExp) add(acc.ekm, c?.expectedKm);
      if (!noExp) add(acc.ehm, c?.expectedHm);
    });
    const m = (s: number[]) => (s[1] > 0 ? s[0] / s[1] : null);
    return { tread: m(acc.tread), km: m(acc.km), hr: m(acc.hr), ekm: m(acc.ekm), ehm: m(acc.ehm) };
  })();

  // 현재 필터에 표시된 행을 엑셀(.xlsx)로 내보내기 (xlsx는 클릭 시 동적 로드)
  const exportExcel = async () => {
    const rows = filtered.map((l) => {
      const c = lifeCalc(l.serial);
      const noExpected = l.status === "Scrap" || l.status === "Not Install";
      const unit = findUnitBySerial(l.serial);
      const monitored = !!unit;
      const tread = latestTreadOf(l.serial);
      const damage = l.damage && l.damage !== "-" ? l.damage : null;
      const noteParts: string[] = [];
      if (!monitored) noteParts.push(tx.nonMeasured);
      if (damage) noteParts.push(codeName(damage));
      if (l.note) noteParts.push(l.note);
      if (unit?.hmReset) noteParts.push(tx.hmReset);
      return {
        [tx.colNo]: l.no,
        [tx.colSerial]: l.serial,
        [tx.colInstall]: fmtD(l.install),
        [tx.colTread]: tread != null ? Number(tread.toFixed(1)) : "",
        [tx.colKm]: c?.km ?? "",
        [tx.colHr]: c?.hr ?? "",
        [tx.colExpKm]: c?.expectedKm != null && !noExpected ? c.expectedKm : "",
        [tx.colExpHm]: c?.expectedHm != null && !noExpected ? c.expectedHm : "",
        [tx.colStatus]: l.status,
        [tx.colNote]: noteParts.join(" · "),
      };
    });
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lifetime DB");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `TireLifetimeDB_${stamp}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Lifetime DB */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">
            {tx.dbTitle}
          </span>
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">
            {filtered.length}{tx.pcs} / {TMS_DATA.life.length}{tx.pcs}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{tx.status}:</span>
            <select
              value={lifeFilter}
              onChange={(e) => setLifeFilter(e.target.value)}
              className="text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-foreground font-semibold"
            >
              <option value="ALL">{tx.all}</option>
              <option value="Install">Install</option>
              <option value="Scrap">Scrap</option>
              <option value="Spare">Spare</option>
              <option value="Not Install">Not Install</option>
            </select>
            <button
              onClick={exportExcel}
              className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {tx.excelDownload}
            </button>
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full table-fixed text-xs border-collapse font-mono">
            <colgroup>
              {["4%", "13%", "11%", "9%", "9%", "9%", "9%", "9%", "9%", "18%"].map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                {[
                  { k: "no", label: tx.colNo, align: "text-left" },
                  { k: "serial", label: tx.colSerial, align: "text-left" },
                  { k: "install", label: tx.colInstall, align: "text-left" },
                  { k: "tread", label: tx.colTread, align: "text-right" },
                  { k: "km", label: tx.colKm, align: "text-right" },
                  { k: "hr", label: tx.colHr, align: "text-right" },
                  { k: "ekm", label: tx.colExpKm, align: "text-right" },
                  { k: "ehm", label: tx.colExpHm, align: "text-right" },
                  { k: "status", label: tx.colStatus, align: "text-center" },
                  { k: "note", label: tx.colNote, align: "text-center" },
                ].map((h) => (
                  <th
                    key={h.k}
                    className={`bg-card border-b border-border px-2 py-2 text-muted-foreground font-semibold whitespace-nowrap ${h.align}`}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const c = lifeCalc(l.serial);
                const noExpected = l.status === "Scrap" || l.status === "Not Install";
                const unit = findUnitBySerial(l.serial);
                const hmReset = unit?.hmReset;
                const monitored = !!unit; // 모니터링 5대 장착 여부 (아니면 측정 외)
                const tread = latestTreadOf(l.serial);
                const treadCls = tread == null ? "" : tread <= TREAD_DANGER ? "text-destructive font-bold" : tread <= TREAD_WARN ? "text-yellow-600 font-bold" : "text-green-600";
                const damage = l.damage && l.damage !== "-" ? l.damage : null;
                const isFocus = highlight != null && l.serial === highlight;
                return (
                <tr
                  key={l.no}
                  ref={l.serial === target ? focusRow : undefined}
                  onClick={() => setHistoryOf(l.serial)}
                  className={`border-b border-border/30 transition-colors cursor-pointer ${isFocus ? "bg-primary/10 ring-2 ring-primary/50" : `hover:bg-muted/10 ${!monitored ? "bg-muted/20" : ""}`}`}
                >
                  <td className="px-2 py-1.5 text-muted-foreground">{l.no}</td>
                  <td className="px-2 py-1.5 text-[10px] max-w-35 truncate">{l.serial}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{fmtD(l.install)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {tread != null ? (
                      <span className={treadCls}>{fmtTread(tread)}<span className="text-muted-foreground/60 ml-0.5">mm</span></span>
                    ) : (
                      <span className="text-muted-foreground/40">−</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.km != null ? (
                      <span className="font-bold text-primary">{fmtInt(c.km)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">−</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.hr != null ? (
                      <span className="text-foreground">{fmtInt(c.hr)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">−</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.expectedKm != null && !noExpected ? (
                      <span className={`font-bold ${c.expectedKm >= TARGET_KM ? "text-green-600" : "text-primary"}`}>{fmtInt(c.expectedKm)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">−</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.expectedHm != null && !noExpected ? (
                      <span className="font-bold text-primary">{fmtInt(c.expectedHm)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">−</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[l.status]}`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-muted-foreground text-center">
                    {!monitored && <span className="text-[9px] text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 mr-1.5 align-middle">{tx.nonMeasured}</span>}
                    {damage && <button className="text-destructive font-bold hover:underline mr-1.5" onClick={(e) => { e.stopPropagation(); openCodes(damage); }}>{codeName(damage)}</button>}
                    {l.note && <span className="mr-1.5">{l.note}</span>}
                    {hmReset && <span className="text-yellow-600 font-semibold">{tx.hmReset}</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="px-2 py-2 text-muted-foreground" colSpan={3}>{tx.avg}</td>
                <td className="px-2 py-2 text-right">{avg.tread != null ? <span>{fmtTread(avg.tread)}<span className="text-muted-foreground/60 ml-0.5">mm</span></span> : "−"}</td>
                <td className="px-2 py-2 text-right text-primary">{fmtInt(avg.km)}</td>
                <td className="px-2 py-2 text-right">{fmtInt(avg.hr)}</td>
                <td className="px-2 py-2 text-right text-primary">{fmtInt(avg.ekm)}</td>
                <td className="px-2 py-2 text-right text-primary">{fmtInt(avg.ehm)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">{tx.foot1a}</strong>{tx.foot1b}
          <br />
          <strong className="text-foreground">{tx.foot2a.replace("{km}", TARGET_KM.toLocaleString("ko-KR"))}</strong>{tx.foot2b}
          <br />
          <strong className="text-foreground">{tx.foot3a}</strong>{tx.foot3b}<strong className="text-foreground">{tx.foot3c}</strong>{tx.foot3d}
          <br />
          <strong className="text-foreground">{tx.foot4a}</strong>{tx.foot4b}<span className="font-mono">−</span>{tx.foot4c}
          <br />
          {tx.foot5}
          <br />
          <span className="border border-border/60 rounded px-1.5 py-0.5">{tx.foot6a}</span>{tx.foot6b}<span className="font-mono">−</span>{tx.foot6c}
          <br />
          {tx.foot7a}<strong className="text-destructive">{tx.foot7b}</strong>{tx.foot7c}<button className="text-primary hover:underline font-semibold" onClick={() => openCodes(null)}>{tx.foot7d}</button>
        </p>
      </div>

      {/* 손상 코드 모달 (표의 손상 코드 클릭 또는 '손상 코드 전체 보기'로 열림) */}
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
                  <h3 className="text-base font-bold text-foreground">{tx.codesTitle}</h3>
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

      {/* 타이어 히스토리 모달 */}
      <AnimatePresence>
        {hist && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setHistoryOf(null)}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold font-mono break-all">{hist.serial}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hist.ch ? `CH ${hist.ch} · ${hist.pos}` : tx.histNotInstall} · {tx.histTireHistory}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[hist.status as LifeRecord["status"]] ?? ""}`}>
                    {hist.status}
                  </span>
                  <button onClick={() => setHistoryOf(null)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 이력 요약 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
                <HRow label={tx.hInstall} value={hist.installDate} />
                <HRow label={tx.hMount} value={hist.mountDate} sub={tx.hMountSub} />
                <HRow label={tx.hRemove} value={hist.removeDate} />
                <HRow label={tx.hScrap} value={hist.scrapDate} danger />
                <HRow label={tx.hDamage} value={hist.damage ? codeName(hist.damage) : null} danger />
                <HRow label={tx.hHmReset} value={hist.hmReset ? tx.hHmResetYes : tx.hHmResetNo} danger={hist.hmReset} />
                <HRow label={tx.hKmHr} value={`${fmtInt(hist.km)} km / ${fmtInt(hist.hr)} hr`} mono />
                <HRow label={tx.hExpKmHm} value={`${fmtInt(hist.expectedKm)} km / ${fmtInt(hist.expectedHm)} hr`} mono />
                <HRow label={tx.hTread} value={hist.latestTread != null ? `${fmtTread(hist.latestTread)} mm` : null} mono />
              </div>

              {/* 장착 이력 (위치·차량 변경) */}
              <div className="mb-4">
                <p className="text-xs font-bold text-primary mb-2">{tx.moveHist} ({moves.length})</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-2 py-1 text-left font-semibold">{tx.mDate}</th>
                        <th className="px-2 py-1 text-left font-semibold">{tx.mVehicle}</th>
                        <th className="px-2 py-1 text-left font-semibold">{tx.mPos}</th>
                        <th className="px-2 py-1 text-left font-semibold">{tx.mKind}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moves.map((m, i) => {
                        const current = hist.ch === m.ch && hist.pos === m.pos;
                        return (
                          <tr key={i} className={`border-b border-border/30 ${current ? "bg-primary/5" : ""}`}>
                            <td className="px-2 py-1">{m.date ?? "−"}</td>
                            <td className="px-2 py-1 font-bold text-primary">CH {m.ch}</td>
                            <td className="px-2 py-1">{m.pos}</td>
                            <td className="px-2 py-1">
                              <span className="font-sans text-muted-foreground">{m.kind === "install" ? tx.mInstall : tx.mMount}</span>
                              {current && <span className="font-sans ml-1 text-[10px] text-green-600 font-bold">· {tx.mCurrent}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {moves.length <= 1 && <p className="text-[11px] text-muted-foreground mt-1">{tx.moveNone}</p>}
              </div>

              {/* 측정 회차 이력 */}
              <div>
                <p className="text-xs font-bold text-primary mb-2">{tx.measHist} ({hist.rounds.length}{tx.sessions})</p>
                {hist.rounds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tx.noMeasData}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse font-mono">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-2 py-1 text-left font-semibold">{tx.colInspect}</th>
                          <th className="px-2 py-1 text-right font-semibold">트레드(mm)</th>
                          <th className="px-2 py-1 text-right font-semibold">KM</th>
                          <th className="px-2 py-1 text-right font-semibold">HM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hist.rounds.map((r, i) => (
                          <tr key={i} className="border-b border-border/30">
                            <td className="px-2 py-1">{r.date}</td>
                            <td className="px-2 py-1 text-right">{r.tread != null ? fmtTread(r.tread) : "−"}</td>
                            <td className="px-2 py-1 text-right">{fmtInt(r.km)}</td>
                            <td className="px-2 py-1 text-right">{fmtInt(r.hm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HRow({ label, value, mono, danger, sub }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground font-semibold">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${danger && value && value !== "−" ? "text-destructive font-bold" : "text-foreground"}`}>
        {value || "−"}{sub && value && value !== "−" ? <span className="text-[10px] text-muted-foreground ml-1">{sub}</span> : null}
      </span>
    </div>
  );
}
