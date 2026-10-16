// @section: inspection-bulk-upload
// 점검 엑셀 일괄 업로드 (지시서 2026-10-16 §A-8).
//
// 양식 내려받기 → 파일 선택 → 미리보기(형식 오류 + validateRound 경고) → 회차별 선택 저장.
// 저장은 화면 입력과 같은 RPC(save_inspection_round_with_points)를 회차마다 한 번씩 부른다 —
// 회차 하나가 실패해도 다른 회차는 영향이 없고, 회차 안에서는 RPC 가 전부/전무를 보장한다.
// 호출부가 canWrite 로 버튼 자체를 숨긴다. RLS 가 최종 방어선.
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Download, Upload, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { TMS_DATA, HEAD_MAP } from "@/data/tmsData";
import { unitByCh } from "@/data/tmsUtils";
import { validateContextFor } from "@/data/roundContext";
import { listInspections, saveInspectionRoundWithPoints, type InspectionRow } from "@/api/inspections";
import { friendlyAuthError } from "@/lib/authErrors";
import { fmtInt, fmtMeter, todayInField } from "@/lib/format";
import { validateRound, hasError, type RoundIssue } from "@/lib/roundValidate";
import {
  BULK_COLUMNS, ZERO_STATUSES, parseBulkSheet, toPointsRows, minTread,
  type BulkRound, type BulkError, type BulkErrorCode,
} from "@/lib/bulkInspection";
import RoundIssueList from "@/components/RoundIssueList";
import ReplacementEntryModal from "@/components/ReplacementEntryModal";

const POSITIONS = Object.values(HEAD_MAP);

const TX = {
  ko: {
    title: "점검 엑셀 일괄 업로드",
    step1: "① 양식을 내려받아 측정값을 채웁니다. 한 행 = 한 포지션, CH·DATE 가 같은 행이 한 회차입니다.",
    step2: "② 채운 파일을 올리면 저장 전에 검증 결과를 보여 줍니다.",
    template: "양식 내려받기",
    pick: "파일 선택",
    loadingHist: "직전 회차 불러오는 중…",
    histFail: "점검 이력을 불러오지 못해 직전 회차 비교를 할 수 없습니다: ",
    parseFail: "파일을 읽지 못했습니다: ",
    noRounds: "측정값이 있는 행이 없습니다.",
    colRound: "회차",
    colRows: "포지션",
    colMeter: "HM / KM",
    colCheck: "검증",
    colSave: "저장",
    ok: "이상 없음",
    nErr: "오류 {n}",
    nWarn: "경고 {n}",
    overwrite: "이미 저장된 회차입니다 — 저장하면 같은 포지션 값을 덮어씁니다.",
    ackWarn: "경고 확인",
    saveSel: "선택 회차 저장 ({n})",
    saving: "저장 중… {i}/{n}",
    savedAll: "{n}개 회차를 저장했습니다",
    savedSome: "{ok}개 저장 · {fail}개 실패",
    close: "닫기",
    orphan: "회차에 묶이지 못한 행",
    line: "{n}행",
    guideSheet: "안내",
    guide: [
      "CH: 차량번호 (예: 824). DATE: 점검일 YYYY-MM-DD (현장 WITA 날짜).",
      "HM·KM·DRIVER: 회차 공통값 — 같은 회차의 행끼리 같아야 합니다(한 행에만 적어도 됩니다).",
      "POS: L1 · R1 · L2 Out · L2 In · R2 In · R2 Out · L3 Out · L3 In · R3 In · R3 Out",
      "SERIAL: 장착 시리얼. 장착 기록과 다르면 「교체 미등록」 경고 — 교체를 먼저 등록하세요.",
      "PSI: 공기압. 0 이하·200 초과는 저장되지 않습니다. 미측정은 비워 두세요.",
      "KIRI·TENGAH1·TENGAH2·KANAN: 트레드 4점(mm). 네 칸 모두 채우거나 모두 비웁니다.",
      `ZERO_STATUS: 4점 중 0 이 있으면 필수 — ${ZERO_STATUSES.join(" / ")}.`,
      "KM·HM 이 직전 회차보다 작거나, 트레드가 직전보다 1 mm 넘게 늘면 경고가 뜹니다(확인 후 저장 가능).",
    ],
    err: {
      unknown_ch: "등록되지 않은 차량 {d}",
      bad_date: "날짜 형식 오류 {d}",
      future_date: "오늘 이후 날짜 {d}",
      bad_pos: "포지션 코드 오류 {d}",
      dup_pos: "같은 회차에 포지션 {d} 이 두 번",
      bad_number: "숫자가 아님 ({d})",
      partial_points: "{d} 트레드 4칸 중 일부만 입력",
      zero_status: "{d} 트레드 0 mm — ZERO_STATUS 필요",
      meta_conflict: "같은 회차인데 {d} 값이 다름",
    } satisfies Record<BulkErrorCode, string>,
  },
  id: {
    title: "Unggah Excel Pemeriksaan massal",
    step1: "① Unduh templat dan isi hasil ukur. Satu baris = satu Posisi; baris dengan CH·DATE sama = satu Pemeriksaan.",
    step2: "② Unggah file yang sudah diisi — hasil validasi ditampilkan sebelum disimpan.",
    template: "Unduh templat",
    pick: "Pilih file",
    loadingHist: "Memuat Pemeriksaan sebelumnya…",
    histFail: "Riwayat Pemeriksaan gagal dimuat, perbandingan dengan Pemeriksaan sebelumnya tidak dapat dilakukan: ",
    parseFail: "File tidak dapat dibaca: ",
    noRounds: "Tidak ada baris berisi hasil ukur.",
    colRound: "Pemeriksaan",
    colRows: "Posisi",
    colMeter: "HM / KM",
    colCheck: "Validasi",
    colSave: "Simpan",
    ok: "Tidak ada masalah",
    nErr: "{n} kesalahan",
    nWarn: "{n} peringatan",
    overwrite: "Pemeriksaan ini sudah tersimpan — nilai Posisi yang sama akan ditimpa.",
    ackWarn: "Peringatan dicek",
    saveSel: "Simpan yang dipilih ({n})",
    saving: "Menyimpan… {i}/{n}",
    savedAll: "{n} Pemeriksaan disimpan",
    savedSome: "{ok} disimpan · {fail} gagal",
    close: "Tutup",
    orphan: "Baris yang tidak masuk Pemeriksaan",
    line: "baris {n}",
    guideSheet: "Panduan",
    guide: [
      "CH: nomor Unit (mis. 824). DATE: tanggal Pemeriksaan YYYY-MM-DD (tanggal lapangan WITA).",
      "HM·KM·DRIVER: nilai bersama satu Pemeriksaan — harus sama antar baris (cukup diisi di satu baris).",
      "POS: L1 · R1 · L2 Out · L2 In · R2 In · R2 Out · L3 Out · L3 In · R3 In · R3 Out",
      "SERIAL: serial terpasang. Jika berbeda dari catatan → peringatan «Penggantian belum dicatat» — catat Penggantian dulu.",
      "PSI: Tekanan angin. ≤ 0 atau > 200 tidak disimpan. Kosongkan jika tidak diukur.",
      "KIRI·TENGAH1·TENGAH2·KANAN: Kedalaman alur 4 titik (mm). Isi keempatnya atau kosongkan semua.",
      `ZERO_STATUS: wajib jika ada 0 di 4 titik — ${ZERO_STATUSES.join(" / ")}.`,
      "Peringatan muncul jika KM·HM lebih kecil dari Pemeriksaan sebelumnya, atau Kedalaman alur naik > 1 mm (bisa disimpan setelah dicek).",
    ],
    err: {
      unknown_ch: "Unit tidak terdaftar {d}",
      bad_date: "Format tanggal salah {d}",
      future_date: "Tanggal setelah hari ini {d}",
      bad_pos: "Kode Posisi salah {d}",
      dup_pos: "Posisi {d} muncul dua kali dalam satu Pemeriksaan",
      bad_number: "Bukan angka ({d})",
      partial_points: "{d} Kedalaman alur hanya sebagian dari 4 titik",
      zero_status: "{d} Kedalaman alur 0 mm — ZERO_STATUS wajib",
      meta_conflict: "Nilai {d} berbeda dalam satu Pemeriksaan",
    } satisfies Record<BulkErrorCode, string>,
  },
  en: {
    title: "Bulk inspection Excel upload",
    step1: "① Download the template and fill in the readings. One row = one position; rows sharing CH·DATE form one round.",
    step2: "② Upload the filled file — validation results are shown before saving.",
    template: "Download template",
    pick: "Choose file",
    loadingHist: "Loading previous rounds…",
    histFail: "Could not load inspection history, so previous-round checks are unavailable: ",
    parseFail: "Could not read the file: ",
    noRounds: "No rows with readings.",
    colRound: "Round",
    colRows: "Positions",
    colMeter: "HM / KM",
    colCheck: "Checks",
    colSave: "Save",
    ok: "No issues",
    nErr: "{n} errors",
    nWarn: "{n} warnings",
    overwrite: "This round is already saved — saving overwrites the same positions.",
    ackWarn: "Warnings checked",
    saveSel: "Save selected ({n})",
    saving: "Saving… {i}/{n}",
    savedAll: "Saved {n} rounds",
    savedSome: "{ok} saved · {fail} failed",
    close: "Close",
    orphan: "Rows not assigned to a round",
    line: "row {n}",
    guideSheet: "Guide",
    guide: [
      "CH: vehicle number (e.g. 824). DATE: inspection date YYYY-MM-DD (site WITA date).",
      "HM·KM·DRIVER: per-round values — must match across the round's rows (one row is enough).",
      "POS: L1 · R1 · L2 Out · L2 In · R2 In · R2 Out · L3 Out · L3 In · R3 In · R3 Out",
      "SERIAL: installed serial. If it differs from the record → “replacement not registered” warning — register the replacement first.",
      "PSI: pressure. ≤ 0 or > 200 is not saved. Leave blank if not measured.",
      "KIRI·TENGAH1·TENGAH2·KANAN: 4-point tread (mm). Fill all four or leave all blank.",
      `ZERO_STATUS: required when any point is 0 — ${ZERO_STATUSES.join(" / ")}.`,
      "Warnings appear if KM·HM is lower than the previous round or tread rose by more than 1 mm (can be saved after checking).",
    ],
    err: {
      unknown_ch: "Unregistered vehicle {d}",
      bad_date: "Invalid date {d}",
      future_date: "Date after today {d}",
      bad_pos: "Invalid position code {d}",
      dup_pos: "Position {d} appears twice in one round",
      bad_number: "Not a number ({d})",
      partial_points: "{d} only part of the 4 tread points entered",
      zero_status: "{d} tread 0 mm — ZERO_STATUS required",
      meta_conflict: "{d} differs within the same round",
    } satisfies Record<BulkErrorCode, string>,
  },
} as const;

type Checked = { round: BulkRound; issues: RoundIssue[]; exists: boolean; blocked: boolean; warns: number };

export default function InspectionBulkUpload({
  onClose, onSaved,
}: {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { lang } = useLang();
  const tx = TX[lang];
  const today = todayInField();

  const [history, setHistory] = useState<InspectionRow[] | null>(null);
  const [histErr, setHistErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ rounds: BulkRound[]; orphanErrors: BulkError[] } | null>(null);
  const [fileName, setFileName] = useState("");
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<{ i: number; n: number } | null>(null);
  const [results, setResults] = useState<Record<string, string | true>>({});
  const [repl, setRepl] = useState<{ ch: string; pos: string; date: string; serial: string | null; km: number | null; hm: number | null } | null>(null);
  // TMS_DATA 는 전역 가변 객체라 교체 등록 뒤 재검증을 강제할 신호가 필요하다.
  const [ver, setVer] = useState(0);

  const loadHistory = () =>
    listInspections()
      .then((h) => { setHistory(h); setHistErr(null); })
      .catch((e) => { setHistory([]); setHistErr(friendlyAuthError(e, lang)); });

  useEffect(() => { void loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const keyOf = (r: BulkRound) => `${r.ch}|${r.date}`;

  const checked: Checked[] = useMemo(() => {
    if (!parsed || !history) return [];
    void ver;
    return parsed.rounds.map((round) => {
      const issues = validateRound(
        {
          hm: round.hm, km: round.km,
          rows: round.rows.map((r) => ({ pos: r.pos, serial: r.serial, pressure: r.pressure, tread: minTread(r) })),
        },
        validateContextFor(history, round.ch, round.date),
      );
      const exists = history.some((h) => h.ch === round.ch && h.inspection_date === round.date);
      const blocked = round.errors.length > 0 || hasError(issues);
      const warns = issues.filter((x) => x.level === "warn").length + (exists ? 1 : 0);
      return { round, issues, exists, blocked, warns };
    });
  }, [parsed, history, ver]);

  // 새 파일·재검증 시 기본 선택: 오류 없음 + 경고 없음만 체크. 경고가 있으면 사용자가 직접 체크(= 확인).
  useEffect(() => {
    setPick((prev) => {
      const next: Record<string, boolean> = {};
      for (const c of checked) {
        const k = keyOf(c.round);
        next[k] = !c.blocked && (k in prev ? prev[k] : c.warns === 0);
        if (c.blocked) next[k] = false;
      }
      return next;
    });
  }, [checked]);

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const rows = TMS_DATA.units.flatMap((u) =>
      POSITIONS.map((pos) => {
        const serial = unitByCh(u.ch).positions.find((p) => p.pos === pos)?.serial ?? "";
        const o: Record<string, string> = {};
        for (const c of BULK_COLUMNS) o[c] = "";
        o.CH = u.ch; o.DATE = today; o.POS = pos; o.SERIAL = serial;
        return o;
      }),
    );
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...BULK_COLUMNS] });
    ws["!cols"] = BULK_COLUMNS.map((c) => ({ wch: c === "SERIAL" ? 20 : c === "REMARK" ? 24 : c === "ZERO_STATUS" ? 14 : 10 }));
    // DATE 는 문자열로 둔다 — 엑셀이 날짜로 바꾸면 셀 서식에 따라 일/월이 뒤바뀌어 보인다.
    const guide = XLSX.utils.aoa_to_sheet(tx.guide.map((g) => [g]));
    guide["!cols"] = [{ wch: 120 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inspections");
    XLSX.utils.book_append_sheet(wb, guide, tx.guideSheet);
    XLSX.writeFile(wb, `Inspection_Template_${today}.xlsx`);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setResults({});
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer());
      const ws = wb.Sheets["Inspections"] ?? wb.Sheets[wb.SheetNames[0]];
      const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
      setParsed(parseBulkSheet(sheet, TMS_DATA.units.map((u) => u.ch), POSITIONS, today));
    } catch (e) {
      setParsed(null);
      toast.error(tx.parseFail + (e instanceof Error ? e.message : String(e)));
    }
  };

  const selected = checked.filter((c) => pick[keyOf(c.round)] && results[keyOf(c.round)] !== true);

  const saveSelected = async () => {
    const n = selected.length;
    let ok = 0;
    const res: Record<string, string | true> = { ...results };
    for (let i = 0; i < n; i++) {
      const { round } = selected[i];
      setBusy({ i: i + 1, n });
      try {
        await saveInspectionRoundWithPoints({
          ch: round.ch, date: round.date, hm: round.hm, km: round.km, driver: round.driver,
          rows: toPointsRows(round),
        });
        res[keyOf(round)] = true;
        ok++;
      } catch (e) {
        res[keyOf(round)] = friendlyAuthError(e, lang);
      }
      setResults({ ...res });
    }
    setBusy(null);
    if (ok === n) toast.success(tx.savedAll.replace("{n}", fmtInt(ok)));
    else toast.error(tx.savedSome.replace("{ok}", fmtInt(ok)).replace("{fail}", fmtInt(n - ok)));
    if (ok > 0) {
      await onSaved();
      await loadHistory();
    }
  };

  const errText = (e: BulkError) =>
    (e.line ? tx.line.replace("{n}", String(e.line)) + " · " : "") + tx.err[e.code].replace("{d}", e.detail ?? "");

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="modal-in bg-card border border-border rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-bold">{tx.title}</span>
          <button onClick={onClose} disabled={!!busy} className="p-1 rounded hover:bg-muted/50 transition-colors disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground mb-4">
          <p>{tx.step1}</p>
          <p>{tx.step2}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:border-primary/50 hover:text-primary"
          >
            <Download className="w-3.5 h-3.5" /> {tx.template}
          </button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:bg-primary/90">
            <Upload className="w-3.5 h-3.5" /> {tx.pick}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={!!busy}
              onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
            />
          </label>
          {fileName && <span className="font-mono text-xs text-muted-foreground">{fileName}</span>}
        </div>

        {history == null && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tx.loadingHist}
          </p>
        )}
        {histErr && <p className="text-xs text-destructive mb-3">{tx.histFail}{histErr}</p>}

        {parsed && parsed.orphanErrors.length > 0 && (
          <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <div className="font-semibold mb-1">{tx.orphan}</div>
            <ul className="space-y-0.5">{parsed.orphanErrors.map((e, i) => <li key={i}>{errText(e)}</li>)}</ul>
          </div>
        )}

        {parsed && history && parsed.rounds.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">{tx.noRounds}</p>
        )}

        {checked.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-170 text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">{tx.colRound}</th>
                  <th className="px-2 py-2 text-right font-semibold">{tx.colRows}</th>
                  <th className="px-2 py-2 text-right font-semibold">{tx.colMeter}</th>
                  <th className="px-2 py-2 text-left font-semibold">{tx.colCheck}</th>
                  <th className="px-2 py-2 text-center font-semibold">{tx.colSave}</th>
                </tr>
              </thead>
              <tbody>
                {checked.map((c) => {
                  const k = keyOf(c.round);
                  const res = results[k];
                  const nErr = c.round.errors.length + c.issues.filter((x) => x.level === "error").length;
                  return (
                    <tr key={k} className="border-b border-border/40 align-top">
                      <td className="px-2 py-2 font-mono whitespace-nowrap">
                        <div className="font-bold">CH {c.round.ch}</div>
                        <div className="text-xs text-muted-foreground">{c.round.date}</div>
                      </td>
                      <td className="px-2 py-2 font-mono text-right">{fmtInt(c.round.rows.length)}</td>
                      <td className="px-2 py-2 font-mono text-right text-xs whitespace-nowrap">
                        <div>{fmtMeter(c.round.hm, "HM")}</div>
                        <div>{fmtMeter(c.round.km, "KM")}</div>
                      </td>
                      <td className="px-2 py-2 space-y-1">
                        {nErr === 0 && c.warns === 0 && (
                          <span className="text-xs text-level-ok font-semibold">{tx.ok}</span>
                        )}
                        {c.round.errors.length > 0 && (
                          <ul className="space-y-0.5 text-xs text-destructive">
                            {c.round.errors.map((e, i) => <li key={i}>✕ {errText(e)}</li>)}
                          </ul>
                        )}
                        {c.exists && <p className="text-xs text-level-warn">⚠ {tx.overwrite}</p>}
                        <RoundIssueList
                          issues={c.issues}
                          onReplace={(pos, serial) =>
                            setRepl({ ch: c.round.ch, pos, date: c.round.date, serial, km: c.round.km, hm: c.round.hm })}
                        />
                        {typeof res === "string" && <p className="text-xs text-destructive">✕ {res}</p>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {res === true ? (
                          <CheckCircle2 className="inline w-4 h-4 text-level-ok" />
                        ) : c.blocked ? (
                          <span className="inline-flex flex-col items-center text-[11px] text-destructive">
                            <XCircle className="w-4 h-4" />{tx.nErr.replace("{n}", fmtInt(nErr))}
                          </span>
                        ) : (
                          <label className="inline-flex flex-col items-center gap-0.5 text-[11px] text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!pick[k]}
                              disabled={!!busy}
                              onChange={(e) => setPick((p) => ({ ...p, [k]: e.target.checked }))}
                            />
                            {c.warns > 0 && (
                              <span className="text-level-warn">{tx.nWarn.replace("{n}", fmtInt(c.warns))} · {tx.ackWarn}</span>
                            )}
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={!!busy} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold text-muted-foreground disabled:opacity-50">
            {tx.close}
          </button>
          <button
            onClick={saveSelected}
            disabled={!!busy || selected.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy
              ? tx.saving.replace("{i}", fmtInt(busy.i)).replace("{n}", fmtInt(busy.n))
              : tx.saveSel.replace("{n}", fmtInt(selected.length))}
          </button>
        </div>
      </div>

      {repl && (
        <ReplacementEntryModal
          ch={repl.ch}
          pos={repl.pos}
          currentSerial={unitByCh(repl.ch).positions.find((x) => x.pos === repl.pos)?.serial ?? ""}
          defaultDate={repl.date}
          defaultSerial={repl.serial ?? undefined}
          defaultKm={repl.km != null ? String(repl.km) : undefined}
          defaultHm={repl.hm != null ? String(repl.hm) : undefined}
          onClose={() => setRepl(null)}
          onSaved={async () => {
            // 교체가 TMS_DATA 에 반영돼야 시리얼 검증이 풀린다.
            await onSaved();
            setVer((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
