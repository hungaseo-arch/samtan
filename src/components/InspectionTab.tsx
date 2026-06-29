// @section: inspection-tab
import { useState, useEffect, useCallback } from "react";
import { TMS_DATA, HEAD_MAP } from "@/data/tmsData";
import { unitByCh, fmtTread } from "@/data/tmsUtils";
import {
  listInspections,
  saveInspectionRound,
  deleteInspectionRound,
  type InspectionRow,
} from "@/api/inspections";
import { SquarePen, Save, Trash2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { useAuth } from "@/auth/AuthProvider";
import LoginCard from "@/auth/LoginCard";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    inputTitle: "점검 입력",
    inputDesc:
      "차량을 선택하고 점검일·가동시간·주행거리와 포지션별 공기압(psi)·트레드(mm)를 입력해 저장합니다. 저장 데이터는 Supabase에 보관되며, 동일 (차량·점검일·포지션)은 자동 갱신됩니다.",
    unitLabel: "차량(CH):",
    resultInput: "점검결과 입력 — CH",
    filledSuffix: "입력",
    inspDate: "점검일",
    hmLabel: "HM (가동시간)",
    kmLabel: "KM (주행거리)",
    hmPh: "예: 2565.4",
    kmPh: "예: 736453",
    colPos: "포지션",
    colTarget: "권장압",
    colPressure: "공기압 (psi)",
    colTread: "트레드 (mm)",
    colSerial: "시리얼",
    psiPh: "psi",
    mmPh: "mm",
    serialPh: "시리얼",
    save: "저장",
    resetInput: "입력 초기화",
    innerNote: "내측 듀얼(In)은 미측정 시 비워두면 N/A로 처리됩니다.",
    historyTitle: "저장된 점검 이력 (Supabase)",
    refresh: "새로고침",
    loadingMsg: "불러오는 중…",
    emptyMsg: "저장된 점검 데이터가 없습니다. 위에서 입력 후 저장하세요.",
    deleteTitle: "이 회차 삭제",
    countSuffix: "건",
    histColPos: "포지션",
    histColPressure: "공기압(psi)",
    histColTread: "트레드(mm)",
    histColSerial: "시리얼",
    errLoad: "불러오기 실패",
    errEnterDate: "점검일을 입력하세요.",
    errEnterValue: "공기압 또는 트레드 값을 1개 이상 입력하세요.",
    saveOkPrefix: "CH",
    saveOkMid: "점검결과",
    saveOkSuffix: "건 저장 완료",
    saveFail: "저장 실패: ",
    deleteOk: "삭제 완료",
    deleteFail: "삭제 실패: ",
    errGeneric: "오류",
    confirmDelete: "점검 회차를 삭제하시겠습니까?",
  },
  id: {
    inputTitle: "Input Inspeksi",
    inputDesc:
      "Pilih unit lalu masukkan tgl inspeksi·jam operasi·jarak tempuh dan tekanan(psi)·tapak(mm) per posisi untuk disimpan. Data tersimpan di Supabase, dan (unit·tgl inspeksi·posisi) yang sama diperbarui otomatis.",
    unitLabel: "Unit(CH):",
    resultInput: "Input hasil inspeksi — CH",
    filledSuffix: "terisi",
    inspDate: "Tgl inspeksi",
    hmLabel: "HM (Jam operasi)",
    kmLabel: "KM (Jarak tempuh)",
    hmPh: "cth: 2565.4",
    kmPh: "cth: 736453",
    colPos: "Posisi",
    colTarget: "Rekomendasi",
    colPressure: "Tekanan (psi)",
    colTread: "Tapak (mm)",
    colSerial: "Serial",
    psiPh: "psi",
    mmPh: "mm",
    serialPh: "Serial",
    save: "Simpan",
    resetInput: "Reset input",
    innerNote: "Dual dalam (In) yang tidak diukur dikosongkan akan diproses sebagai N/A.",
    historyTitle: "Riwayat inspeksi tersimpan (Supabase)",
    refresh: "Muat ulang",
    loadingMsg: "Memuat…",
    emptyMsg: "Tidak ada data inspeksi tersimpan. Masukkan dan simpan di atas.",
    deleteTitle: "Hapus sesi ini",
    countSuffix: "data",
    histColPos: "Posisi",
    histColPressure: "Tekanan(psi)",
    histColTread: "Tapak(mm)",
    histColSerial: "Serial",
    errLoad: "Gagal memuat",
    errEnterDate: "Masukkan tgl inspeksi.",
    errEnterValue: "Masukkan minimal 1 nilai tekanan atau tapak.",
    saveOkPrefix: "CH",
    saveOkMid: "hasil inspeksi",
    saveOkSuffix: "data tersimpan",
    saveFail: "Gagal menyimpan: ",
    deleteOk: "Terhapus",
    deleteFail: "Gagal menghapus: ",
    errGeneric: "Error",
    confirmDelete: "Yakin ingin menghapus sesi inspeksi?",
  },
} as const;

// 포지션 순서(1~10)에 따른 표준 코드
const POS_ORDER = Array.from({ length: 10 }, (_, i) => HEAD_MAP[i + 1]);
const targetPsi = (pos: string) => (pos === "L1" || pos === "R1" ? 100 : 116);

interface FormCell {
  serial: string;
  pressure: string;
  tread: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function InspectionTab({ onSaved }: { onSaved?: () => void }) {
  const { lang } = useLang();
  const tx = TX[lang];
  const { user } = useAuth();
  const [selCh, setSelCh] = useState(TMS_DATA.units[0].ch);
  const [date, setDate] = useState(todayISO());
  const [hm, setHm] = useState("");
  const [km, setKm] = useState("");
  const [cells, setCells] = useState<Record<string, FormCell>>({});
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selDate, setSelDate] = useState<string>("");

  // 선택 차량의 포지션/시리얼로 폼 초기화
  const resetForm = useCallback(() => {
    const u = unitByCh(selCh);
    const init: Record<string, FormCell> = {};
    POS_ORDER.forEach((pos) => {
      const p = u.positions.find((x) => x.pos === pos);
      init[pos] = { serial: p?.serial2 || p?.serial || "", pressure: "", tread: "" };
    });
    setCells(init);
  }, [selCh]);

  // 점검 이력 로드
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listInspections(selCh);
      setHistory(rows);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : tx.errLoad);
    } finally {
      setLoading(false);
    }
  }, [selCh, tx]);

  useEffect(() => {
    resetForm();
    loadHistory();
  }, [selCh, resetForm, loadHistory]);

  const setCell = (pos: string, field: keyof FormCell, value: string) =>
    setCells((c) => ({ ...c, [pos]: { ...c[pos], [field]: value } }));

  const numOrNull = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = parseFloat(t);
    return Number.isNaN(n) ? null : n;
  };

  const filledCount = POS_ORDER.filter(
    (p) => cells[p] && (cells[p].pressure.trim() !== "" || cells[p].tread.trim() !== "")
  ).length;

  const handleSave = async () => {
    if (!date) {
      toast.error(tx.errEnterDate);
      return;
    }
    const rows: InspectionRow[] = POS_ORDER.map((pos): InspectionRow => ({
      ch: selCh,
      inspection_date: date,
      hm: numOrNull(hm),
      km: numOrNull(km),
      pos,
      serial: cells[pos]?.serial?.trim() || null,
      pressure: numOrNull(cells[pos]?.pressure ?? ""),
      tread: numOrNull(cells[pos]?.tread ?? ""),
      remark: null,
    })).filter((r) => r.pressure !== null || r.tread !== null);

    if (rows.length === 0) {
      toast.error(tx.errEnterValue);
      return;
    }

    setSaving(true);
    try {
      await saveInspectionRound(rows);
      toast.success(`${tx.saveOkPrefix} ${selCh} · ${date} ${tx.saveOkMid} ${rows.length}${tx.saveOkSuffix}`);
      await loadHistory();
      onSaved?.();
      // 입력값만 비우고 시리얼은 유지
      setCells((c) => {
        const n = { ...c };
        POS_ORDER.forEach((p) => (n[p] = { ...n[p], pressure: "", tread: "" }));
        return n;
      });
    } catch (e) {
      toast.error(tx.saveFail + (e instanceof Error ? e.message : tx.errGeneric));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: string) => {
    if (!window.confirm(`CH ${selCh} · ${d} ${tx.confirmDelete}`)) return;
    try {
      await deleteInspectionRound(selCh, d);
      toast.success(tx.deleteOk);
      await loadHistory();
      onSaved?.();
    } catch (e) {
      toast.error(tx.deleteFail + (e instanceof Error ? e.message : tx.errGeneric));
    }
  };

  // 이력을 점검일별로 그룹화
  const grouped = history.reduce<Record<string, InspectionRow[]>>((acc, r) => {
    (acc[r.inspection_date] ||= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const activeDate = selDate && grouped[selDate] ? selDate : (dates[0] ?? "");

  // 점검 입력(쓰기)은 로그인 필요 — 비로그인 시 로그인 카드 표시
  if (!user) return <LoginCard />;

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* 안내 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 flex items-start gap-3">
          <SquarePen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-primary">{tx.inputTitle}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {tx.inputDesc}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 차량 선택 */}
      <motion.div variants={staggerItem}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold mr-1">{tx.unitLabel}</span>
          {TMS_DATA.units.map((u) => (
            <button
              key={u.ch}
              onClick={() => setSelCh(u.ch)}
              className={`px-4 py-1.5 rounded-lg text-sm font-mono font-bold border transition-all ${
                selCh === u.ch
                  ? "bg-primary text-primary-foreground border-primary shadow-lg"
                  : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              CH {u.ch}
            </button>
          ))}
        </div>
      </motion.div>

      {/* 입력 폼 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <span className="text-sm font-bold text-foreground">{tx.resultInput} {selCh}</span>
            <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{filledCount}/10 {tx.filledSuffix}</span>
          </div>

          {/* 회차 메타 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Field label={tx.inspDate}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label={tx.hmLabel}>
              <input type="number" inputMode="decimal" value={hm} onChange={(e) => setHm(e.target.value)} placeholder={tx.hmPh} className={INPUT_CLS} />
            </Field>
            <Field label={tx.kmLabel}>
              <input type="number" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={tx.kmPh} className={INPUT_CLS} />
            </Field>
          </div>

          {/* 포지션별 입력 */}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm border-collapse">
              <colgroup>
                {["16%", "14%", "20%", "20%", "30%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  {[tx.colPos, tx.colTarget, tx.colPressure, tx.colTread, tx.colSerial].map((h) => (
                    <th key={h} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POS_ORDER.map((pos) => (
                  <tr key={pos} className="border-b border-border/40 text-center">
                    <td className="px-2 py-1.5 font-mono font-bold text-primary whitespace-nowrap">{pos}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{targetPsi(pos)}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number" inputMode="decimal"
                        value={cells[pos]?.pressure ?? ""}
                        onChange={(e) => setCell(pos, "pressure", e.target.value)}
                        placeholder={tx.psiPh}
                        className={CELL_CLS}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number" inputMode="decimal"
                        value={cells[pos]?.tread ?? ""}
                        onChange={(e) => setCell(pos, "tread", e.target.value)}
                        placeholder={tx.mmPh}
                        className={CELL_CLS}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={cells[pos]?.serial ?? ""}
                        onChange={(e) => setCell(pos, "serial", e.target.value)}
                        placeholder={tx.serialPh}
                        className={`${CELL_CLS} w-40 text-left`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {tx.save}
            </button>
            <button
              onClick={resetForm}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              {tx.resetInput}
            </button>
            <span className="text-xs text-muted-foreground ml-auto">
              {tx.innerNote}
            </span>
          </div>
        </div>
      </motion.div>

      {/* 저장된 점검 이력 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <span className="text-sm font-bold text-foreground">{tx.historyTitle}</span>
            <span className="text-xs text-muted-foreground">CH {selCh}</span>
            <button
              onClick={loadHistory}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {tx.refresh}
            </button>
          </div>

          {loadError && (
            <div className="flex items-center gap-2 text-destructive text-sm py-2">
              <AlertTriangle className="w-4 h-4" /> {loadError}
            </div>
          )}

          {!loadError && loading && (
            <div className="text-sm text-muted-foreground py-2">{tx.loadingMsg}</div>
          )}

          {!loadError && !loading && dates.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <CheckCircle2 className="w-4 h-4" /> {tx.emptyMsg}
            </div>
          )}

          <div className="space-y-4">
            {/* 날짜 탭 버튼 줄 */}
            {dates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {dates.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelDate(d)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-mono font-bold border transition-all ${
                      activeDate === d
                        ? "bg-primary text-primary-foreground border-primary shadow-lg"
                        : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            {/* 선택된 날짜(activeDate) 한 건만 렌더 */}
            {(activeDate && grouped[activeDate] ? [activeDate] : []).map((d) => {
              const rows = grouped[d];
              const meta = rows[0];
              const byPos = new Map(rows.map((r) => [r.pos, r]));
              return (
                <div key={d} className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="flex items-center gap-2 bg-muted/30 px-3 py-2">
                    <span className="font-mono text-sm font-bold text-primary">{d}</span>
                    <span className="text-xs text-muted-foreground">
                      {meta.hm != null && `HM ${meta.hm.toLocaleString("ko-KR")}`}
                      {meta.km != null && ` · KM ${meta.km.toLocaleString("ko-KR")}`}
                    </span>
                    <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{rows.length}{tx.countSuffix}</span>
                    <button
                      onClick={() => handleDelete(d)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title={tx.deleteTitle}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-xs border-collapse font-mono">
                      <colgroup>
                        {["22%", "24%", "24%", "30%"].map((w, i) => (
                          <col key={i} style={{ width: w }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border/50">
                          {[tx.histColPos, tx.histColPressure, tx.histColTread, tx.histColSerial].map((h) => (
                            <th key={h} className="px-3 py-1.5 text-center text-muted-foreground font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {POS_ORDER.map((pos) => {
                          const r = byPos.get(pos);
                          return (
                            <tr key={pos} className="border-b border-border/30 text-center">
                              <td className="px-3 py-1.5 font-bold text-primary">{pos}</td>
                              <td className="px-3 py-1.5">{r?.pressure != null ? Math.round(r.pressure) : "−"}</td>
                              <td className="px-3 py-1.5">{r?.tread != null ? fmtTread(r.tread) : "−"}</td>
                              <td className="px-3 py-1.5 text-muted-foreground truncate max-w-40">{r?.serial ?? "−"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const INPUT_CLS =
  "w-full h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground outline-none focus:border-primary transition-colors";
const CELL_CLS =
  "w-24 h-8 px-2 text-sm font-mono text-right rounded-md border border-border bg-background text-foreground outline-none focus:border-primary transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-semibold">{label}</span>
      {children}
    </label>
  );
}
