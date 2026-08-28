// @section: replacement-tab
//
// 교체 이력 조회 + **탈착 시점 정보 소급 입력** (WO-TMS-2026-09-TCO T-10).
//
// 이 탭의 목적이 하나 늘었다. 예전에는 "언제 무엇으로 갈았나"만 보여줬다.
// 이제는 "왜 뺐나, 뺀 것은 어떻게 됐나"를 받아야 한다. 그 27건이 비어 있는 한
// TCO 는 계산되지 않는다 — 사유별 원가 귀속의 분모가 통째로 없는 상태다.
//
// 규칙 두 가지.
//   1. **사유 미입력 상태로도 저장된다.** 막으면 현장이 아무것도 안 적는다.
//      대신 목록에 배지를, 상단에 미입력 건수를 띄워 소급 입력을 유도한다.
//   2. **모르는 값은 비워 둔다.** 특히 재생 가능 여부는 체크박스가 아니라
//      3상태다. 체크박스로 두면 다른 칸만 고친 27건이 전부 "재생 불가"로
//      단정돼 버린다. 미확정에 임의 기본값을 넣지 않는다(지시서 §1-5).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TMS_DATA } from "@/data/tmsData";
import { codeName } from "@/data/tmsUtils";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Loader2, AlertTriangle, Wand2 } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { fmtInt, fmtTread, EMPTY } from "@/lib/format";
import type { CasingGrade } from "@/api/tco";
import {
  listReplacements, listDamageCodes, updateReplacementRemoval, validateRemoval,
  type ReplacementRow, type DamageCodeRow, type RemovalPatch,
} from "@/api/replacements";

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

    loading: "교체 이력을 불러오는 중…",
    loadFail: "교체 이력을 불러오지 못했습니다.",

    // 탈착 정보 (T-2 신규 컬럼)
    removalTitle: "탈착 정보",
    removalSub: "이 회차에 내려간 타이어의 기록입니다. TCO 산출의 입력값입니다.",
    oldSerial: "탈거 시리얼",
    oldSerialAuto: "직전 장착분으로 채우기",
    removalCode: "탈착 사유",
    removalCodePick: "— 선택 —",
    removalCodeGuess: "수명 DB 추정",
    removalTreadMin: "탈착 시 최소 트레드",
    casingGrade: "케이싱 등급",
    casingPick: "— 선택 —",
    retreadable: "재생 가능 여부",
    retreadYes: "가능",
    retreadNo: "불가",
    retreadUnknown: "미입력",
    downtime: "정지 시간",
    downtimeUnit: "분",
    removalNote: "비고",
    save: "저장",
    saving: "저장 중…",
    saved: "저장했습니다.",
    saveFail: "저장하지 못했습니다.",
    revert: "되돌리기",
    readOnly: "입력 권한이 없어 조회만 됩니다.",
    invalidTread: "0 ~ 60 mm 범위로 입력하십시오.",
    invalidDowntime: "0 이상 정수로 입력하십시오.",

    missingBadge: "사유 미입력",
    missingCount: "사유 미입력",
    missingHelp: "탈착 사유가 없으면 TCO 사유별 원가가 산출되지 않습니다. 장착일을 눌러 입력하십시오.",
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

    loading: "Memuat riwayat penggantian…",
    loadFail: "Gagal memuat riwayat penggantian.",

    removalTitle: "Data pelepasan",
    removalSub: "Catatan ban yang dilepas pada tahap ini. Menjadi masukan perhitungan TCO.",
    oldSerial: "Serial ban dilepas",
    oldSerialAuto: "Isi dari pemasangan sebelumnya",
    removalCode: "Alasan pelepasan",
    removalCodePick: "— Pilih —",
    removalCodeGuess: "Perkiraan dari DB Umur",
    removalTreadMin: "Kedalaman alur minimum saat dilepas",
    casingGrade: "Kelas casing",
    casingPick: "— Pilih —",
    retreadable: "Bisa divulkanisir",
    retreadYes: "Bisa",
    retreadNo: "Tidak",
    retreadUnknown: "Belum diisi",
    downtime: "Waktu henti",
    downtimeUnit: "menit",
    removalNote: "Catatan",
    save: "Simpan",
    saving: "Menyimpan…",
    saved: "Tersimpan.",
    saveFail: "Gagal menyimpan.",
    revert: "Kembalikan",
    readOnly: "Tidak ada hak input — hanya bisa melihat.",
    invalidTread: "Isi antara 0 ~ 60 mm.",
    invalidDowntime: "Isi bilangan bulat 0 atau lebih.",

    missingBadge: "Alasan kosong",
    missingCount: "Alasan pelepasan kosong",
    missingHelp: "Tanpa alasan pelepasan, biaya TCO per alasan tidak bisa dihitung. Klik tanggal pasang untuk mengisi.",
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

    loading: "Loading replacement history…",
    loadFail: "Could not load replacement history.",

    removalTitle: "Removal record",
    removalSub: "The tire taken off at this stage. Feeds the TCO calculation.",
    oldSerial: "Removed serial",
    oldSerialAuto: "Fill from previous mount",
    removalCode: "Removal reason",
    removalCodePick: "— Select —",
    removalCodeGuess: "Lifetime-DB guess",
    removalTreadMin: "Minimum tread at removal",
    casingGrade: "Casing grade",
    casingPick: "— Select —",
    retreadable: "Retreadable",
    retreadYes: "Yes",
    retreadNo: "No",
    retreadUnknown: "Not entered",
    downtime: "Downtime",
    downtimeUnit: "min",
    removalNote: "Note",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    saveFail: "Could not save.",
    revert: "Revert",
    readOnly: "No write permission — view only.",
    invalidTread: "Enter a value between 0 and 60 mm.",
    invalidDowntime: "Enter a whole number of 0 or more.",

    missingBadge: "No reason",
    missingCount: "Removal reason missing",
    missingHelp: "Without a removal reason the per-reason TCO cannot be computed. Click an install date to fill it in.",
  },
} as const;

const CASING_GRADES: CasingGrade[] = ["A", "B", "C", "REJECT"];

interface ReplStage {
  /** replacements.id — 탈착 정보를 UPDATE 할 대상 */
  id: string;
  date: string;
  serial: string;
  /** 수명 DB 에서 역산한 교체사유. 기록이 아니라 추론이다. */
  reason: { text: string; scrap: boolean; code: string | null };
  /** 이 회차에 내려간 타이어의 시리얼 — old_serial 자동 채움의 근거 */
  prevSerial: string | null;
  row: ReplacementRow;
}
interface ReplChain {
  ch: string;
  pos: string;
  firstSerial: string | null;
  firstInstall: string;
  stages: ReplStage[];
  lastDate: string;
}

/** DB 행 → 편집 초안. 저장 전까지 이 모양으로 들고 있는다. */
const patchOf = (r: ReplacementRow): RemovalPatch => ({
  old_serial: r.old_serial,
  removal_code: r.removal_code,
  removal_tread_min: r.removal_tread_min,
  casing_grade: r.casing_grade,
  retreadable: r.retreadable,
  downtime_minutes: r.downtime_minutes,
  removal_note: r.removal_note,
});

const samePatch = (a: RemovalPatch, b: RemovalPatch) =>
  (Object.keys(a) as (keyof RemovalPatch)[]).every((k) => a[k] === b[k]);

/** 빈 문자열은 null 로 접는다. "" 를 저장하면 미입력과 구분이 안 된다. */
const orNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

export default function ReplacementTab({ onSerialClick, onVehicleClick }: {
  onSerialClick?: (serial: string) => void;
  onVehicleClick?: (ch: string) => void;
}) {
  const { lang } = useLang();
  const tx = TX[lang];
  const { canDownload, canWrite } = useAuth();
  const qc = useQueryClient();

  const repls = useQuery<ReplacementRow[]>({ queryKey: ["replacements"], queryFn: listReplacements });
  const codes = useQuery<DamageCodeRow[]>({ queryKey: ["damage_codes"], queryFn: listDamageCodes });

  // 손상 코드 모달
  const [showCodes, setShowCodes] = useState(false);
  const [hiCode, setHiCode] = useState<string | null>(null);
  const openCodes = (code: string | null) => { setHiCode(code); setShowCodes(true); };
  // 교체 상세 모달 — 클릭한 (차량·포지션) 키와 강조할 회차. 저장 후에도 살아 있도록
  // 체인 객체가 아니라 키로 들고 있는다(데이터가 갱신되면 객체 정체성이 바뀐다).
  const [detail, setDetail] = useState<{ key: string; stageIdx: number } | null>(null);
  // 편집 초안 — replacements.id 별. 저장 성공 시 제거한다.
  const [drafts, setDrafts] = useState<Record<string, RemovalPatch>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const rows = useMemo(() => repls.data ?? [], [repls.data]);

  // 교체 이력을 (차량·포지션)별 체인으로 묶어 1차 → 2차 → 3차 … 단계 구성
  const reasonOf = (serial: string | null) => {
    const l = serial ? TMS_DATA.life.find((x) => x.serial === serial) : undefined;
    const scrap = l?.status === "Scrap" && !!l.damage && l.damage !== "-";
    return { text: scrap ? codeName(l!.damage) : tx.rotation, scrap, code: scrap ? l!.damage : null };
  };
  const installOf = (serial: string | null) => {
    const l = serial ? TMS_DATA.life.find((x) => x.serial === serial) : undefined;
    return l?.install && l.install !== "-" ? l.install : "−";
  };
  const replChains: ReplChain[] = useMemo(() => {
    const byPos = new Map<string, ReplacementRow[]>();
    rows.forEach((r) => {
      const k = `${r.ch}|${r.pos}`;
      if (!byPos.has(k)) byPos.set(k, []);
      byPos.get(k)!.push(r);
    });
    const out = [...byPos.entries()].map(([k, reps]) => {
      const [ch, pos] = k.split("|");
      const sorted = [...reps].sort((a, b) => a.date.localeCompare(b.date));
      const pd = TMS_DATA.units.find((u) => u.ch === ch)?.positions.find((p) => p.pos === pos);
      const firstSerial = pd?.serialInitial || pd?.serial || null;
      const stages = sorted.map((r, idx): ReplStage => {
        const prevSerial = idx === 0 ? firstSerial : (sorted[idx - 1].new_serial ?? null);
        return {
          id: r.id,
          date: r.date,
          serial: r.new_serial ?? "",
          reason: reasonOf(prevSerial),
          prevSerial,
          row: r,
        };
      });
      return {
        ch, pos, firstSerial,
        firstInstall: installOf(firstSerial),
        stages,
        lastDate: sorted[sorted.length - 1].date,
      };
    });
    out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    return out;
    // reasonOf/installOf 는 TMS_DATA(모듈 전역)와 tx 만 읽는다. lang 이 바뀌면
    // "로테이션" 문구가 바뀌어야 하므로 tx 를 의존성에 둔다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tx]);

  const has3rd = replChains.some((c) => c.stages.length >= 2);
  const missingCount = useMemo(() => rows.filter((r) => r.removal_code === null).length, [rows]);
  const chainOf = (key: string) => replChains.find((c) => `${c.ch}|${c.pos}` === key) ?? null;

  const codeLabel = (c: DamageCodeRow) => {
    const desc = (lang === "ko" ? c.description : c.description_id) ?? c.description ?? "";
    return desc ? `${c.code} · ${desc}` : c.code;
  };
  const codeText = (code: string | null) => {
    if (!code) return null;
    const hit = (codes.data ?? []).find((c) => c.code === code);
    return hit ? codeLabel(hit) : code;
  };

  const draftOf = (st: ReplStage) => drafts[st.id] ?? patchOf(st.row);
  const setDraft = (st: ReplStage, next: Partial<RemovalPatch>) =>
    setDrafts((d) => ({ ...d, [st.id]: { ...(d[st.id] ?? patchOf(st.row)), ...next } }));

  const save = async (st: ReplStage) => {
    const patch = draftOf(st);
    setBusyId(st.id);
    setFlash(null);
    try {
      await updateReplacementRemoval(st.id, patch);
      setDrafts((d) => { const n = { ...d }; delete n[st.id]; return n; });
      await qc.invalidateQueries({ queryKey: ["replacements"] });
      // 사유가 채워지면 TCO 사유별 집계가 바뀐다. 열려 있으면 같이 갱신한다.
      await qc.invalidateQueries({ queryKey: ["v_removal_analysis"] });
      setFlash({ id: st.id, ok: true, msg: tx.saved });
    } catch (e) {
      setFlash({ id: st.id, ok: false, msg: `${tx.saveFail} ${(e as Error).message}` });
    } finally {
      setBusyId(null);
    }
  };

  // 엑셀 내보내기 — 화면에서는 모달로 뺀 시리얼·교체사유까지 한 행에 모두 담는다.
  // (xlsx 는 클릭 시 동적 로드 — LifeTab 과 동일 방식)
  const exportExcel = async () => {
    const sheet = replChains.map((c) => {
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
        // 탈착 정보 — 미입력은 빈 칸으로 둔다. 0 으로 채우면 실측 0 과 구분이 안 된다.
        row[`${n}${tx.stage} ${tx.oldSerial}`] = s?.row.old_serial ?? "";
        row[`${n}${tx.stage} ${tx.removalCode}`] = s?.row.removal_code ?? "";
        row[`${n}${tx.stage} ${tx.removalTreadMin}`] = s?.row.removal_tread_min ?? "";
        row[`${n}${tx.stage} ${tx.casingGrade}`] = s?.row.casing_grade ?? "";
        row[`${n}${tx.stage} ${tx.retreadable}`] =
          s?.row.retreadable === null || s?.row.retreadable === undefined
            ? "" : s.row.retreadable ? tx.retreadYes : tx.retreadNo;
        row[`${n}${tx.stage} ${tx.downtime}`] = s?.row.downtime_minutes ?? "";
        row[`${n}${tx.stage} ${tx.removalNote}`] = s?.row.removal_note ?? "";
      }
      return row;
    });
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(sheet);
    const stageCols = [
      { wch: 12 }, { wch: 20 }, { wch: 14 },            // 장착일·시리얼·교체사유
      { wch: 20 }, { wch: 10 }, { wch: 12 },            // 탈거 시리얼·탈착 사유·최소 트레드
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, // 케이싱·재생·정지시간·비고
    ];
    ws["!cols"] = [
      { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 20 },
      ...stageCols,
      ...(has3rd ? stageCols : []),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Replacement");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `TireReplacement_${stamp}.xlsx`);
  };

  if (repls.isLoading || codes.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {tx.loading}
      </div>
    );
  }
  if (repls.isError) {
    return <div className="py-16 text-center text-sm text-destructive">{tx.loadFail}</div>;
  }

  const openChain = detail ? chainOf(detail.key) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">
            {tx.title}
          </span>
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">
            {rows.length}{tx.countSuffix}
          </span>
          {/* 미입력 건수 — 소급 입력을 유도하는 장치 (지시서 T-10) */}
          {missingCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
              title={tx.missingHelp}
            >
              <AlertTriangle className="w-3 h-3" />
              {tx.missingCount} {missingCount}{tx.countSuffix}
            </span>
          )}
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
        {missingCount > 0 && (
          <p className="mb-3 text-[11px] text-muted-foreground leading-relaxed">{tx.missingHelp}</p>
        )}
        {/* 가로 폭을 줄이기 위해 표에는 장착일까지만 두고, 시리얼·탈착 정보는 모달로 뺀다 */}
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
              {replChains.map((c) => {
                // 장착일 셀 — 클릭 시 해당 회차를 펼친 상세 모달을 연다.
                // stageIdx 0 은 최초 장착(교체 행 아님)이라 배지가 붙지 않는다.
                const dateCell = (stageIdx: number) => {
                  const st = stageIdx === 0 ? null : c.stages[stageIdx - 1];
                  const date = stageIdx === 0 ? c.firstInstall : st?.date;
                  if (!date || date === "−") return <span className="text-muted-foreground">−</span>;
                  return (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <button
                        className="font-mono text-xs text-foreground hover:text-primary hover:underline"
                        title={tx.detailTitle}
                        onClick={() => setDetail({ key: `${c.ch}|${c.pos}`, stageIdx })}
                      >
                        {date}
                      </button>
                      {st && st.row.removal_code === null && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-destructive/40 bg-destructive/10 text-destructive whitespace-nowrap"
                          title={tx.missingHelp}
                        >
                          {tx.missingBadge}
                        </span>
                      )}
                    </span>
                  );
                };
                return (
                <tr key={`${c.ch}|${c.pos}`} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono font-bold text-primary">
                    <button className="hover:underline" title={`CH ${c.ch} ${tx.vehicleTitle}`} onClick={() => onVehicleClick?.(c.ch)}>CH {c.ch}</button>
                  </td>
                  <td className="px-3 py-2 font-mono text-sm">{c.pos}</td>
                  <td className="px-3 py-2">{dateCell(0)}</td>
                  <td className="px-3 py-2">{dateCell(1)}</td>
                  {has3rd && <td className="px-3 py-2">{dateCell(2)}</td>}
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

      {/* 교체 상세 모달 — 표에서 뺀 시리얼·교체사유와 탈착 정보 입력 폼 */}
      <AnimatePresence>
        {openChain && detail && (
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
                    CH {openChain.ch} · {openChain.pos}
                  </p>
                </div>
                <button onClick={() => setDetail(null)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {[
                  { idx: 0, date: openChain.firstInstall, serial: openChain.firstSerial, st: null as ReplStage | null },
                  ...openChain.stages.map((s, i) => ({ idx: i + 1, date: s.date, serial: s.serial, st: s })),
                ].map((row) => {
                  const on = row.idx === detail.stageIdx;
                  const st = row.st;
                  return (
                    <div
                      key={row.idx}
                      className={`rounded-lg border px-4 py-3 ${on ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20"}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-black ${on ? "text-primary" : "text-muted-foreground"}`}>
                          {row.idx + 1}{tx.stage}
                        </span>
                        {row.idx === 0 && (
                          <span className="text-[10px] text-muted-foreground">({tx.stageOriginal})</span>
                        )}
                        {st && st.row.removal_code === null && (
                          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded border border-destructive/40 bg-destructive/10 text-destructive">
                            {tx.missingBadge}
                          </span>
                        )}
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                        <dt className="text-muted-foreground">{tx.colInstall}</dt>
                        <dd className="font-mono">{row.date || "−"}</dd>
                        <dt className="text-muted-foreground">{tx.colSerial}</dt>
                        <dd className="font-mono">
                          {row.serial ? (
                            <button
                              className="text-primary hover:underline"
                              title={`${row.serial} · ${tx.serialTitle}`}
                              onClick={() => { setDetail(null); onSerialClick?.(row.serial!); }}
                            >
                              {row.serial}
                            </button>
                          ) : <span className="text-muted-foreground">−</span>}
                        </dd>
                        <dt className="text-muted-foreground">{tx.colReason}</dt>
                        <dd>
                          {!st ? (
                            <span className="text-muted-foreground/50">−</span>
                          ) : st.reason.scrap ? (
                            <button
                              className="text-destructive font-bold hover:underline"
                              onClick={() => openCodes(st.reason.code)}
                            >
                              {st.reason.text}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">{st.reason.text}</span>
                          )}
                        </dd>
                      </dl>

                      {/* 탈착 정보 — 교체 회차(replacements 행)에만 붙는다 */}
                      {st && (
                        <RemovalForm
                          st={st}
                          tx={tx}
                          codes={codes.data ?? []}
                          codeLabel={codeLabel}
                          codeText={codeText}
                          draft={draftOf(st)}
                          dirty={!samePatch(draftOf(st), patchOf(st.row))}
                          canWrite={canWrite}
                          busy={busyId === st.id}
                          flash={flash && flash.id === st.id ? flash : null}
                          onChange={(next) => setDraft(st, next)}
                          onRevert={() => setDrafts((d) => { const n = { ...d }; delete n[st.id]; return n; })}
                          onSave={() => void save(st)}
                        />
                      )}
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

// ── 탈착 정보 입력 폼 ────────────────────────────────────────
// TX 는 as const 라 로케일마다 리터럴 타입이 갈린다. 여기서 쓰는 키만 구조로 받는다.
type RemovalTx = {
  removalTitle: string; removalSub: string;
  oldSerial: string; oldSerialAuto: string;
  removalCode: string; removalCodePick: string; removalCodeGuess: string;
  removalTreadMin: string; casingGrade: string; casingPick: string;
  retreadable: string; retreadYes: string; retreadNo: string; retreadUnknown: string;
  downtime: string; downtimeUnit: string; removalNote: string;
  save: string; saving: string; revert: string; readOnly: string;
  invalidTread: string; invalidDowntime: string;
};

const FIELD = "text-[11px] text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground " +
  "focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60";

function RemovalForm({
  st, tx, codes, codeLabel, codeText, draft, dirty, canWrite, busy, flash,
  onChange, onRevert, onSave,
}: {
  st: ReplStage;
  tx: RemovalTx;
  codes: DamageCodeRow[];
  codeLabel: (c: DamageCodeRow) => string;
  codeText: (code: string | null) => string | null;
  draft: RemovalPatch;
  dirty: boolean;
  canWrite: boolean;
  busy: boolean;
  flash: { ok: boolean; msg: string } | null;
  onChange: (next: Partial<RemovalPatch>) => void;
  onRevert: () => void;
  onSave: () => void;
}) {
  const bad = validateRemoval(draft);
  const ro = !canWrite;
  // 수명 DB 에서 역산한 코드가 있고 아직 비어 있으면 한 번에 채울 수 있게 한다.
  const guess = st.reason.code && st.reason.code !== draft.removal_code ? st.reason.code : null;

  if (ro) {
    // 조회 권한 — 입력 칸 대신 값만 보여준다. 빈 값은 EMPTY 로 둔다.
    const items: [string, string][] = [
      [tx.oldSerial, draft.old_serial ?? EMPTY],
      [tx.removalCode, codeText(draft.removal_code) ?? EMPTY],
      [tx.removalTreadMin, fmtTread(draft.removal_tread_min)],
      [tx.casingGrade, draft.casing_grade ?? EMPTY],
      [tx.retreadable, draft.retreadable === null ? tx.retreadUnknown : draft.retreadable ? tx.retreadYes : tx.retreadNo],
      [tx.downtime, draft.downtime_minutes === null ? EMPTY : `${fmtInt(draft.downtime_minutes)} ${tx.downtimeUnit}`],
      [tx.removalNote, draft.removal_note ?? EMPTY],
    ];
    return (
      <div className="mt-3 pt-3 border-t border-border/60">
        <p className="text-[11px] font-bold text-foreground mb-1.5">{tx.removalTitle}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {items.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-foreground break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 text-[10px] text-muted-foreground">{tx.readOnly}</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
      <div>
        <p className="text-[11px] font-bold text-foreground">{tx.removalTitle}</p>
        <p className="text-[10px] text-muted-foreground">{tx.removalSub}</p>
      </div>

      <label className="block">
        <span className={FIELD}>{tx.oldSerial}</span>
        <div className="flex items-center gap-1.5">
          <input
            className={`${INPUT} font-mono`}
            value={draft.old_serial ?? ""}
            onChange={(e) => onChange({ old_serial: orNull(e.target.value) })}
            placeholder={st.prevSerial ?? ""}
          />
          {/* v_current_tire 와 같은 값 — 이 회차 직전에 달려 있던 시리얼이다 */}
          {st.prevSerial && st.prevSerial !== draft.old_serial && (
            <button
              type="button"
              title={tx.oldSerialAuto}
              onClick={() => onChange({ old_serial: st.prevSerial })}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[10px] hover:bg-muted/40 transition-colors"
            >
              <Wand2 className="w-3 h-3" /> {tx.oldSerialAuto}
            </button>
          )}
        </div>
      </label>

      <label className="block">
        <span className={FIELD}>{tx.removalCode}</span>
        <select
          className={INPUT}
          value={draft.removal_code ?? ""}
          onChange={(e) => onChange({ removal_code: orNull(e.target.value) })}
        >
          <option value="">{tx.removalCodePick}</option>
          {codes.map((c) => (
            <option key={c.code} value={c.code}>{codeLabel(c)}</option>
          ))}
        </select>
        {guess && (
          <button
            type="button"
            onClick={() => onChange({ removal_code: guess })}
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Wand2 className="w-3 h-3" /> {tx.removalCodeGuess}: {codeText(guess)}
          </button>
        )}
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={FIELD}>{tx.removalTreadMin} (mm)</span>
          <input
            type="number" step="0.1" min="0" max="60" inputMode="decimal"
            className={INPUT}
            value={draft.removal_tread_min ?? ""}
            onChange={(e) => onChange({
              removal_tread_min: e.target.value === "" ? null : Number(e.target.value),
            })}
          />
          {bad.includes("removal_tread_min") && (
            <span className="text-[10px] text-destructive">{tx.invalidTread}</span>
          )}
        </label>
        <label className="block">
          <span className={FIELD}>{tx.downtime} ({tx.downtimeUnit})</span>
          <input
            type="number" step="1" min="0" inputMode="numeric"
            className={INPUT}
            value={draft.downtime_minutes ?? ""}
            onChange={(e) => onChange({
              downtime_minutes: e.target.value === "" ? null : Number(e.target.value),
            })}
          />
          {bad.includes("downtime_minutes") && (
            <span className="text-[10px] text-destructive">{tx.invalidDowntime}</span>
          )}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={FIELD}>{tx.casingGrade}</span>
          <select
            className={INPUT}
            value={draft.casing_grade ?? ""}
            onChange={(e) => onChange({
              casing_grade: e.target.value === "" ? null : (e.target.value as CasingGrade),
            })}
          >
            <option value="">{tx.casingPick}</option>
            {CASING_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <div>
          {/* 3상태. 체크박스로 두면 "미확인"이 조용히 "재생 불가"가 된다. */}
          <span className={FIELD}>{tx.retreadable}</span>
          <div className="flex gap-1">
            {([
              [null, tx.retreadUnknown],
              [true, tx.retreadYes],
              [false, tx.retreadNo],
            ] as [boolean | null, string][]).map(([v, label]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => onChange({ retreadable: v })}
                className={`flex-1 rounded-md border px-1.5 py-1.5 text-[10px] transition-colors ${
                  draft.retreadable === v
                    ? "border-primary bg-primary/10 text-primary font-bold"
                    : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="block">
        <span className={FIELD}>{tx.removalNote}</span>
        <textarea
          rows={2}
          className={INPUT}
          value={draft.removal_note ?? ""}
          onChange={(e) => onChange({ removal_note: orNull(e.target.value) })}
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || busy || bad.length > 0}
          onClick={onSave}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {busy ? tx.saving : tx.save}
        </button>
        {dirty && !busy && (
          <button
            type="button"
            onClick={onRevert}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            {tx.revert}
          </button>
        )}
        {flash && (
          <span className={`text-[10px] ${flash.ok ? "text-primary" : "text-destructive"}`}>
            {flash.msg}
          </span>
        )}
      </div>
    </div>
  );
}
