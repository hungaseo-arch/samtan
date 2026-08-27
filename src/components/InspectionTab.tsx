// @section: inspection-tab
import { useState, useEffect, useCallback, useMemo } from "react";
import { TMS_DATA, HEAD_MAP, recPsi } from "@/data/tmsData";
import { unitByCh, fmtTread } from "@/data/tmsUtils";
import { fmtMeter, fmtTreadAvg, fmtPercent } from "@/lib/format";
import {
  listInspections,
  saveInspectionRoundWithPoints,
  deleteInspectionRound,
  type InspectionRow,
  type InspectionPointsRow,
  type TreadFlag,
  type TreadStatus,
} from "@/api/inspections";
import {
  treadStats, scPattern, medianOf,
  CHECK_MEDIAN_DEV_MM, CHECK_RANGE_RATIO,
  type WidthPos, type TreadStats,
} from "@/lib/treadStats";
import { listTreadPoints, type TreadPointRow } from "@/api/wear";
import { createVehicle, DuplicateVehicleError } from "@/api/vehicles";
import { Save, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Plus, Loader2, LayoutGrid, Table as TableIcon, ChevronDown, Lock as LockIcon, UserRound } from "lucide-react";
import TireSchematic, { type SchematicCell } from "@/components/TireSchematic";
import { friendlyAuthError } from "@/lib/authErrors";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { useAuth } from "@/auth/AuthProvider";
import TireDetailModal from "@/components/TireDetailModal";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    unitLabel: "차량(CH):",
    addVehicle: "차량 추가",
    addPh: "예: 850",
    addBtn: "추가",
    addCancel: "취소",
    addOk: "차량 추가 완료",
    addDup: "이미 존재하는 차량입니다.",
    addFail: "차량 추가 실패: ",
    readOnly: "조회 권한 계정입니다. 입력·수정은 실무자(staff) 이상 권한이 필요합니다.",
    resultInput: "점검결과 입력 — CH",
    filledSuffix: "입력",
    inspDate: "점검일",
    hmLabel: "HM (가동시간)",
    kmLabel: "KM (주행거리)",
    driverLabel: "차량 운전자",
    hmPh: "예: 2565.4",
    kmPh: "예: 736453",
    driverPh: "예: 홍길동",
    driverShort: "운전자",
    uploaderShort: "입력자",
    editorShort: "수정",
    colPos: "포지션",
    colTarget: "권장압",
    colPressure: "공기압 (psi)",
    colTread: "트레드 (mm)",
    colSerial: "시리얼",
    psiPh: "psi",
    mmPh: "mm",
    serialPh: "시리얼",
    colTreadPoints: "트레드 측정 4점 (mm)",
    ptL: "Kiri · 외측",
    ptC1: "Tengah 1",
    ptC2: "Tengah 2",
    ptR: "Kanan · 내측",
    colPreview: "미리보기",
    colFlag: "Flag",
    flagNotePh: "사유 (OUTLIER 는 필수)",
    outlierAdminOnly: "이상값(OUTLIER) 지정은 관리자 권한이 필요합니다.",
    previewPartial: "4칸 전부 입력 필요",
    errPartial: "트레드는 4칸 전부 입력하거나 전부 비워 주세요 — ",
    errOutlierNote: "이상값으로 지정한 포지션은 사유를 적어야 합니다 — ",
    checkHint: "측정값 확인이 필요합니다(저장은 가능):",
    checkMedian: "중앙값에서 3.0 mm 이상 벗어난 값",
    checkRange: "폭 방향 편차가 평균의 40% 초과",
    checkJump: "직전 회차보다 평균이 0.5 mm 이상 증가",
    checkCv: "직전 회차보다 균일성이 5.0%p 이상 악화",
    zeroTitle: "트레드 0 mm 입력",
    zeroBody: "0 mm 는 뜻이 두 가지입니다. 어느 쪽인지 골라 주세요. 잘못 고르면 마모율 통계가 오염됩니다.",
    zeroWorn: "실제로 다 닳았음 (실측 0 mm)",
    zeroWornDesc: "측정값을 그대로 저장합니다.",
    zeroNotMeasured: "측정하지 못했음",
    zeroNotMeasuredDesc: "트레드를 비우고 마모율·추이에서 제외합니다.",
    zeroScrapped: "폐기 처리",
    zeroScrappedDesc: "0 mm 로 저장하고 이 타이어를 수명 종료로 표시합니다.",
    zeroMustPick: "셋 중 하나를 골라야 저장됩니다. 잘못 입력했다면 «측정하지 못했음»을 고른 뒤 다시 입력하십시오.",
    save: "저장",
    resetInput: "입력 초기화",
    innerNote: "내측 듀얼(In)은 미측정 시 비워두면 N/A로 처리됩니다.",
    historyTitle: "저장된 점검 이력",
    viewLayout: "배치도",
    viewTable: "표",
    statusOk: "정상",
    statusWarn: "주의",
    statusDanger: "교체권장",
    refresh: "새로고침",
    loadingMsg: "불러오는 중…",
    emptyMsg: "저장된 점검 데이터가 없습니다. 위에서 입력 후 저장하세요.",
    deleteTitle: "이 회차 삭제",
    countSuffix: "건",
    histColPos: "포지션",
    histColPressure: "공기압(psi)",
    histColTread: "트레드(mm)",
    histColGrooves: "그루브 4점 L/C1/C2/R (mm)",
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
    unitLabel: "Unit(CH):",
    addVehicle: "Tambah unit",
    addPh: "cth: 850",
    addBtn: "Tambah",
    addCancel: "Batal",
    addOk: "Unit ditambahkan",
    addDup: "Unit sudah ada.",
    addFail: "Gagal menambah unit: ",
    readOnly: "Akun hanya-baca. Input memerlukan izin staf ke atas.",
    resultInput: "Input hasil inspeksi — CH",
    filledSuffix: "terisi",
    inspDate: "Tgl inspeksi",
    hmLabel: "HM (Jam operasi)",
    kmLabel: "KM (Jarak tempuh)",
    driverLabel: "Pengemudi unit",
    hmPh: "cth: 2565.4",
    kmPh: "cth: 736453",
    driverPh: "cth: Budi",
    driverShort: "Pengemudi",
    uploaderShort: "Diinput oleh",
    editorShort: "Diubah",
    colPos: "Posisi",
    colTarget: "Rekomendasi",
    colPressure: "Tekanan (psi)",
    colTread: "Tapak (mm)",
    colSerial: "Serial",
    psiPh: "psi",
    mmPh: "mm",
    serialPh: "Serial",
    colTreadPoints: "Kedalaman alur — 4 titik (mm)",
    ptL: "Kiri · Luar",
    ptC1: "Tengah 1",
    ptC2: "Tengah 2",
    ptR: "Kanan · Dalam",
    colPreview: "Pratinjau",
    colFlag: "Flag",
    flagNotePh: "Alasan (wajib untuk OUTLIER)",
    outlierAdminOnly: "Menandai OUTLIER memerlukan izin admin.",
    previewPartial: "Isi keempat kolom",
    errPartial: "Isi keempat kolom tapak atau kosongkan semuanya — ",
    errOutlierNote: "Posisi bertanda OUTLIER wajib diberi alasan — ",
    checkHint: "Nilai perlu diperiksa (tetap bisa disimpan):",
    checkMedian: "Nilai menyimpang ≥ 3.0 mm dari median",
    checkRange: "Rentang lebar melebihi 40% dari rata-rata",
    checkJump: "Rata-rata naik ≥ 0.5 mm dari inspeksi sebelumnya",
    checkCv: "Keseragaman memburuk ≥ 5.0%p dari inspeksi sebelumnya",
    zeroTitle: "Input tapak 0 mm",
    zeroBody: "0 mm punya dua arti. Pilih yang benar — salah pilih akan merusak statistik keausan.",
    zeroWorn: "Memang habis (hasil ukur 0 mm)",
    zeroWornDesc: "Nilai disimpan apa adanya.",
    zeroNotMeasured: "Tidak sempat diukur",
    zeroNotMeasuredDesc: "Tapak dikosongkan dan dikecualikan dari laju keausan.",
    zeroScrapped: "Dibuang (scrap)",
    zeroScrappedDesc: "Disimpan 0 mm dan ban ditandai habis masa pakai.",
    zeroMustPick: "Harus pilih salah satu untuk menyimpan. Kalau salah ketik, pilih «Tidak sempat diukur» lalu isi ulang.",
    save: "Simpan",
    resetInput: "Reset input",
    innerNote: "Dual dalam (In) yang tidak diukur dikosongkan akan diproses sebagai N/A.",
    historyTitle: "Riwayat inspeksi tersimpan",
    viewLayout: "Tata Letak",
    viewTable: "Tabel",
    statusOk: "Normal",
    statusWarn: "Perhatian",
    statusDanger: "Rekomendasi ganti",
    refresh: "Muat ulang",
    loadingMsg: "Memuat…",
    emptyMsg: "Tidak ada data inspeksi tersimpan. Masukkan dan simpan di atas.",
    deleteTitle: "Hapus sesi ini",
    countSuffix: "data",
    histColPos: "Posisi",
    histColPressure: "Tekanan(psi)",
    histColTread: "Tapak(mm)",
    histColGrooves: "4 titik alur L/C1/C2/R (mm)",
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
  en: {
    unitLabel: "Vehicle (CH):",
    addVehicle: "Add vehicle",
    addPh: "e.g. 850",
    addBtn: "Add",
    addCancel: "Cancel",
    addOk: "Vehicle added",
    addDup: "This vehicle already exists.",
    addFail: "Failed to add vehicle: ",
    readOnly: "Viewer account. Entering or editing data requires Inspector permission or above.",
    resultInput: "Inspection result entry — CH",
    filledSuffix: "filled",
    inspDate: "Inspection date",
    hmLabel: "HM (Operating hours)",
    kmLabel: "KM (Distance)",
    driverLabel: "Vehicle driver",
    hmPh: "e.g. 2565.4",
    kmPh: "e.g. 736453",
    driverPh: "e.g. John Doe",
    driverShort: "Driver",
    uploaderShort: "Entered by",
    editorShort: "Edited",
    colPos: "Position",
    colTarget: "Target",
    colPressure: "Pressure (psi)",
    colTread: "Tread (mm)",
    colSerial: "Serial",
    psiPh: "psi",
    mmPh: "mm",
    serialPh: "Serial",
    colTreadPoints: "Tread — 4 points (mm)",
    ptL: "Kiri · Outboard",
    ptC1: "Tengah 1",
    ptC2: "Tengah 2",
    ptR: "Kanan · Inboard",
    colPreview: "Preview",
    colFlag: "Flag",
    flagNotePh: "Reason (required for OUTLIER)",
    outlierAdminOnly: "Marking a value as OUTLIER requires admin permission.",
    previewPartial: "All four points required",
    errPartial: "Fill all four tread cells or leave them all empty — ",
    errOutlierNote: "Positions marked OUTLIER need a reason — ",
    checkHint: "These readings need a check (saving is still allowed):",
    checkMedian: "A value more than 3.0 mm from the median",
    checkRange: "Width-direction range exceeds 40% of the average",
    checkJump: "Average rose by 0.5 mm or more since the last round",
    checkCv: "Uniformity worsened by 5.0%p or more since the last round",
    zeroTitle: "Tread entered as 0 mm",
    zeroBody: "0 mm means two different things. Pick the right one — the wrong choice corrupts the wear statistics.",
    zeroWorn: "Genuinely worn out (measured 0 mm)",
    zeroWornDesc: "The reading is stored as-is.",
    zeroNotMeasured: "Could not be measured",
    zeroNotMeasuredDesc: "Tread is left empty and excluded from wear rate and trends.",
    zeroScrapped: "Scrapped",
    zeroScrappedDesc: "Stored as 0 mm and the tire is marked end-of-life.",
    zeroMustPick: "One of the three must be chosen to save. If it was a typo, pick «Could not be measured» and re-enter.",
    save: "Save",
    resetInput: "Reset input",
    innerNote: "Inner dual (In) left blank when not measured is recorded as N/A.",
    historyTitle: "Saved inspection history",
    viewLayout: "Layout",
    viewTable: "Table",
    statusOk: "Normal",
    statusWarn: "Caution",
    statusDanger: "Replace recommended",
    refresh: "Refresh",
    loadingMsg: "Loading…",
    emptyMsg: "No saved inspection data. Enter values above and save.",
    deleteTitle: "Delete this round",
    countSuffix: "records",
    histColPos: "Position",
    histColPressure: "Pressure(psi)",
    histColTread: "Tread(mm)",
    histColGrooves: "4 grooves L/C1/C2/R (mm)",
    histColSerial: "Serial",
    errLoad: "Failed to load",
    errEnterDate: "Enter the inspection date.",
    errEnterValue: "Enter at least one pressure or tread value.",
    saveOkPrefix: "CH",
    saveOkMid: "inspection results",
    saveOkSuffix: "records saved",
    saveFail: "Save failed: ",
    deleteOk: "Deleted",
    deleteFail: "Delete failed: ",
    errGeneric: "Error",
    confirmDelete: "Delete this inspection round?",
  },
} as const;

// 포지션 순서(1~10)에 따른 표준 코드
const POS_ORDER = Array.from({ length: 10 }, (_, i) => HEAD_MAP[i + 1]);
// 권장 공기압의 정본은 DB(tire_config)다. 여기에 100/116 을 박지 않고 recPsi() 를 경유한다.
const targetPsi = (pos: string) => recPsi(POS_ORDER.indexOf(pos) + 1);

// 폭 4점 입력칸 — 현장 기록지(KIRI/TENGAH/TENGAH/KANAN) 순서와 같게 둔다.
// L=Kiri / R=Kanan 은 현장 표기 그대로다. 어느 쪽이 외측(outboard)인지는
// 미확정이므로(v3 §Q1) 화면에 외측·내측으로 옮겨 적지 않는다. 순서는 뒤집지 않는다.
const POINT_FIELDS = [
  { key: "tL", width: "L" },
  { key: "tC1", width: "C1" },
  { key: "tC2", width: "C2" },
  { key: "tR", width: "R" },
] as const satisfies readonly { key: keyof FormCell; width: WidthPos }[];

/** 이력 표의 그루브 열 표시 순서 — 입력칸과 같다. */
const WIDTH_ORDER = POINT_FIELDS.map((f) => f.width) as readonly WidthPos[];

const FLAG_OPTIONS: readonly TreadFlag[] = [
  "OK", "CHECK", "OUTLIER", "DAMAGE", "PRESSURE", "LOAD", "POSITION", "OTHER",
];

interface FormCell {
  serial: string;
  pressure: string;
  tL: string;
  tC1: string;
  tC2: string;
  tR: string;
  flag: TreadFlag;
  flagNote: string;
}

const emptyCell = (serial: string): FormCell => ({
  serial, pressure: "", tL: "", tC1: "", tC2: "", tR: "", flag: "OK", flagNote: "",
});

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * 트레드 0 mm 를 설명하는 상태. TreadStatus 에서 "measured" 만 뺀 것이다.
 * 0 을 "실측했고 값이 measured 인 0" 으로 저장할 방법을 남기지 않기 위한 타입이다 (T-8).
 */
type ZeroStatus = Exclude<TreadStatus, "measured">;

export default function InspectionTab({ onSaved, onSerialClick }: { onSaved?: () => void; onSerialClick?: (serial: string) => void }) {
  const { lang, t } = useLang();
  const tx = TX[lang];
  const { canWrite, canDelete, isAdmin } = useAuth();
  const [selCh, setSelCh] = useState(TMS_DATA.units[0].ch);
  const [date, setDate] = useState(todayISO());
  const [hm, setHm] = useState("");
  const [km, setKm] = useState("");
  const [driver, setDriver] = useState("");
  const [cells, setCells] = useState<Record<string, FormCell>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCh, setNewCh] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false); // 입력 폼 아코디언 (기본 닫힘)
  // 트레드 0 mm 확인 모달(v2 §B-2) — 실측 0 인지 미측정인지는 사람만 안다.
  const [zeroAsk, setZeroAsk] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<number | null>(null); // 배치도 타이어 상세 모달(포지션 번호)

  const [history, setHistory] = useState<InspectionRow[]>([]);
  /** `${inspection_date}|${pos}` → 폭 4점. 이력 표의 그루브 열 소스 (v3 §D-1). */
  const [histPoints, setHistPoints] = useState<Map<string, Partial<Record<WidthPos, number>>>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selDate, setSelDate] = useState<string>("");
  const [histView, setHistView] = useState<"layout" | "table">("layout"); // 기본 배치도

  // 선택 차량의 포지션/시리얼로 폼 초기화
  const resetForm = useCallback(() => {
    const u = unitByCh(selCh);
    const init: Record<string, FormCell> = {};
    POS_ORDER.forEach((pos) => {
      const p = u.positions.find((x) => x.pos === pos);
      // 현재 장착 시리얼(v_current_tire) — 교체분 우선 분기는 뷰가 이미 처리한다.
      init[pos] = emptyCell(p?.serial || "");
    });
    setCells(init);
  }, [selCh]);

  // 점검 이력 로드. 그루브 4점은 별도 테이블(tread_points)이라 같이 읽는다 (v3 §D-1).
  // 측정점 조회가 실패해도 이력 자체는 보여 준다 — 4점 열만 비고 화면이 죽지 않는다.
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, pts] = await Promise.all([
        listInspections(selCh),
        listTreadPoints(selCh).catch(() => [] as TreadPointRow[]),
      ]);
      setHistory(rows);
      const m = new Map<string, Partial<Record<WidthPos, number>>>();
      for (const p of pts) {
        // OUTLIER 는 DB 통계에서 빠지므로 화면에서도 뺀다 (설계서 §15).
        if (p.flag === "OUTLIER") continue;
        const k = `${p.inspection_date}|${p.pos}`;
        const cur = m.get(k) ?? {};
        // 원주 확장(P2~P4) 시에는 폭 위치별 평균이 아니라 P1 을 대표로 보여 준다 —
        // 이력 표는 "현장이 적은 4개 숫자"를 그대로 보여 주는 자리다.
        if (p.circ_pos === "P1") cur[p.width_pos] = p.depth_mm;
        m.set(k, cur);
      }
      setHistPoints(m);
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

  const setCell = <K extends keyof FormCell>(pos: string, field: K, value: FormCell[K]) =>
    setCells((c) => ({ ...c, [pos]: { ...c[pos], [field]: value } }));

  const numOrNull = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = parseFloat(t);
    return Number.isNaN(n) ? null : n;
  };

  /** 한 포지션의 4칸을 읽어 폭 위치별 숫자로. 빈 칸은 키 자체가 빠진다. */
  const readPoints = useCallback((cell: FormCell | undefined) => {
    const out: Partial<Record<WidthPos, number>> = {};
    if (!cell) return out;
    for (const f of POINT_FIELDS) {
      const n = numOrNull(cell[f.key]);
      if (n !== null) out[f.width] = n;
    }
    return out;
  }, []);

  /**
   * 포지션별 실시간 미리보기. 반올림 순서까지 DB 트리거와 맞춰 둔 treadStats() 를
   * 그대로 쓰므로 저장 후 값과 소수점 자리까지 같아야 한다 (v3 §E-1 규칙 2).
   * 편마모·급변 판정의 기준점은 직전 회차다 — 없으면 그냥 표시하지 않는다.
   */
  const previews = useMemo(() => {
    const out: Record<string, {
      filled: number;
      stats: TreadStats | null;
      pattern: string | null;
      checks: string[];
    }> = {};

    for (const pos of POS_ORDER) {
      const pts = readPoints(cells[pos]);
      const vals = Object.values(pts) as number[];
      const stats = treadStats(pts);
      const checks: string[] = [];
      let pattern: string | null = null;

      // 같은 포지션의 직전 회차 — 원시값을 가진 행만 기준이 될 수 있다.
      const prev = history.find(
        (r) => r.pos === pos && r.inspection_date < date && (r.point_count ?? 0) > 0,
      );

      if (stats && vals.length === POINT_FIELDS.length) {
        const med = medianOf(vals);
        if (vals.some((v) => Math.abs(v - med) >= CHECK_MEDIAN_DEV_MM)) checks.push(tx.checkMedian);
        if (stats.avg > 0 && stats.range > CHECK_RANGE_RATIO * stats.avg) checks.push(tx.checkRange);
        if (prev?.tread_avg != null && stats.avg - prev.tread_avg >= 0.5) checks.push(tx.checkJump);
        if (prev?.tread_cv != null && stats.cv != null && stats.cv - prev.tread_cv >= 5.0) {
          checks.push(tx.checkCv);
        }

        // 중앙 그루브만 0 이고 숄더가 남은 상태는 직전 회차 없이도 판정된다.
        // 미측정이 아니라 실측이며(v3 §0.3) 중심부 급진 마모의 직접 증거다.
        // "검증 필요" 가 아니라 사실을 그대로 알리는 배지를 띄운다 (v3 §D-2).
        if (stats.center === 0 && stats.shoulder > 0) {
          pattern = t("pattern.center_zero");
        } else if (prev) {
          // O/I(외측·내측)는 KIRI/KANAN 방향 규약이 미확정이라 띄우지 않는다 (v3 §Q1).
          // 숄더 대 센터 비교는 방향과 무관하므로 그대로 쓴다.
          const sc = scPattern(prev.shoulder_avg, stats.shoulder, prev.center_avg, stats.center);
          // 균일하거나 판정 보류면 굳이 배지를 띄우지 않는다 — 화면이 시끄러워진다.
          if (sc.pattern !== "even" && sc.pattern !== "insufficient") {
            pattern = t(`pattern.${sc.pattern}`);
          }
        }
      }

      out[pos] = { filled: vals.length, stats, pattern, checks };
    }
    return out;
  }, [cells, history, date, readPoints, tx, t]);

  /** 4칸 중 1~3칸만 채운 포지션. 하나라도 있으면 저장을 막는다 (v3 §E-1 규칙 1). */
  const partialPositions = POS_ORDER.filter((p) => {
    const n = previews[p]?.filled ?? 0;
    return n > 0 && n < POINT_FIELDS.length;
  });

  const filledCount = POS_ORDER.filter(
    (p) => cells[p] && (cells[p].pressure.trim() !== "" || (previews[p]?.filled ?? 0) > 0),
  ).length;

  /** 4점을 전부 채웠는데 최소값이 0인 포지션 — 실측 0 인지 미측정인지 물어야 한다. */
  const zeroPositions = POS_ORDER.filter((p) => {
    const pv = previews[p];
    return pv?.filled === POINT_FIELDS.length && pv.stats?.min === 0;
  });

  /**
   * 트레드 0 을 설명할 수 있는 상태. "measured" 가 빠져 있는 것이 요점이다 —
   * 0 을 measured 로 저장하는 경로는 타입 차원에서 만들 수 없다 (T-8).
   * 0 인 포지션이 없으면 null 을 넘긴다.
   */
  const buildRows = (zeroStatus: ZeroStatus | null): InspectionPointsRow[] =>
    POS_ORDER.map((pos): InspectionPointsRow => {
      const cell = cells[pos];
      const pts = readPoints(cell);
      const complete = Object.keys(pts).length === POINT_FIELDS.length;
      const isZero = complete && previews[pos]?.stats?.min === 0;
      // 미측정으로 처리하는 행은 측정점을 만들지 않는다 (v3 §E-1 규칙 6).
      const dropPoints = !complete || (isZero && zeroStatus === "not_measured");
      // zeroStatus 가 null 인데 0 인 포지션이 나오면 호출 측 실수다.
      // measured 로 넘기지 않고 안전한 쪽(not_measured)으로 떨어뜨린다.
      const status: TreadStatus = !complete
        ? "not_measured"
        : isZero
          ? (zeroStatus ?? "not_measured")
          : "measured";

      return {
        pos,
        serial: cell?.serial?.trim() || null,
        pressure: numOrNull(cell?.pressure ?? ""),
        tread_status: status,
        flag: cell?.flag ?? "OK",
        flag_note: cell?.flagNote?.trim() || null,
        remark: null,
        points: dropPoints
          ? []
          : POINT_FIELDS.map((f) => ({ circ: "P1" as const, width: f.width, depth: pts[f.width]! })),
      };
    }).filter((r) => r.pressure !== null || r.points.length > 0);

  const persist = async (zeroStatus: ZeroStatus | null) => {
    const rows = buildRows(zeroStatus);
    if (rows.length === 0) {
      toast.error(tx.errEnterValue);
      return;
    }

    setSaving(true);
    try {
      const n = await saveInspectionRoundWithPoints({
        ch: selCh,
        date,
        hm: numOrNull(hm),
        km: numOrNull(km),
        driver: driver.trim() || null,
        rows,
      });
      toast.success(`${tx.saveOkPrefix} ${selCh} · ${date} ${tx.saveOkMid} ${n}${tx.saveOkSuffix}`);
      await loadHistory();
      onSaved?.();
      // 입력값만 비우고 시리얼은 유지
      setCells((c) => {
        const next = { ...c };
        POS_ORDER.forEach((p) => (next[p] = emptyCell(next[p]?.serial ?? "")));
        return next;
      });
    } catch (e) {
      toast.error(tx.saveFail + friendlyAuthError(e, lang));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!date) {
      toast.error(tx.errEnterDate);
      return;
    }
    // 규칙 1 — 버튼도 비활성화되지만, 키보드 저장 등 우회 경로가 있어 여기서도 막는다.
    if (partialPositions.length > 0) {
      toast.error(tx.errPartial + partialPositions.join(", "));
      return;
    }
    // 규칙 5 — RLS 와 RPC 도 막지만, 저장 실패 대신 이유를 먼저 알려 준다.
    const noReason = POS_ORDER.filter(
      (p) => cells[p]?.flag === "OUTLIER" && !cells[p]?.flagNote?.trim(),
    );
    if (noReason.length > 0) {
      toast.error(tx.errOutlierNote + noReason.join(", "));
      return;
    }
    if (zeroPositions.length > 0) {
      setZeroAsk(zeroPositions);
      return;
    }
    await persist(null);
  };

  // 차량(CH) 추가 — vehicles + 10개 포지션 생성 후 리로드·선택
  const handleAddVehicle = async () => {
    const c = newCh.trim();
    if (!c) return;
    setAddBusy(true);
    try {
      await createVehicle(c);
      toast.success(`${tx.addOk} · CH ${c}`);
      setNewCh(""); setAdding(false);
      onSaved?.();      // TMS_DATA(units) 리로드
      setSelCh(c);      // 새 차량 선택
    } catch (e) {
      if (e instanceof DuplicateVehicleError) toast.error(tx.addDup);
      else toast.error(tx.addFail + friendlyAuthError(e, lang));
    } finally {
      setAddBusy(false);
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
      toast.error(tx.deleteFail + friendlyAuthError(e, lang));
    }
  };

  // 이력을 점검일별로 그룹화
  const grouped = history.reduce<Record<string, InspectionRow[]>>((acc, r) => {
    (acc[r.inspection_date] ||= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const activeDate = selDate && grouped[selDate] ? selDate : (dates[0] ?? "");

  // 조회(이력)는 로그인 없이 가능. 데이터 CRUD(입력·저장·삭제·차량추가)는 로그인 사용자만.
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* 차량 선택 */}
      <motion.div variants={staggerItem}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold mr-1">{tx.unitLabel}</span>
          {TMS_DATA.units.map((u) => (
            <button
              key={u.ch}
              onClick={() => setSelCh(u.ch)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                selCh === u.ch
                  ? "bg-primary text-primary-foreground border-primary shadow-lg"
                  : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              CH {u.ch}
            </button>
          ))}
          {/* 차량(CH) 추가 — 입력 권한(staff/admin)만 */}
          {canWrite && (adding ? (
            <span className="flex items-center gap-1">
              <input
                value={newCh}
                onChange={(e) => setNewCh(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddVehicle(); if (e.key === "Escape") { setAdding(false); setNewCh(""); } }}
                placeholder={tx.addPh}
                aria-label={tx.addVehicle}
                autoFocus
                className="w-24 px-2 py-1.5 rounded-lg border border-border text-xs font-mono"
              />
              <button
                onClick={handleAddVehicle}
                disabled={addBusy || !newCh.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
              >
                {addBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{tx.addBtn}
              </button>
              <button onClick={() => { setAdding(false); setNewCh(""); }} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">{tx.addCancel}</button>
            </span>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> {tx.addVehicle}
            </button>
          ))}
        </div>
      </motion.div>

      {/* 입력 폼 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <button onClick={() => setFormOpen((o) => !o)} className="w-full flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <span className="text-sm font-bold text-foreground">{tx.resultInput} {selCh}</span>
            <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{filledCount}/10 {tx.filledSuffix}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${formOpen ? "" : "-rotate-90"}`} />
          </button>

          {formOpen && (canWrite ? (
          <>
          {/* 회차 메타 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Field label={tx.inspDate}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLS} />
            </Field>
            <Field label={tx.hmLabel}>
              <input type="number" inputMode="decimal" value={hm} onChange={(e) => setHm(e.target.value)} placeholder={tx.hmPh} className={INPUT_CLS} />
            </Field>
            <Field label={tx.kmLabel}>
              <input type="number" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={tx.kmPh} className={INPUT_CLS} />
            </Field>
            <Field label={tx.driverLabel}>
              <input type="text" value={driver} onChange={(e) => setDriver(e.target.value)} placeholder={tx.driverPh} className={INPUT_CLS} />
            </Field>
          </div>

          {/* 포지션별 입력 — 트레드는 폭 4점(Kiri/Tengah 1/Tengah 2/Kanan) 원시값을 그대로 받는다.
              최소값만 남기던 예전 입력칸은 나머지 3점을 버려 마모 균일성·편마모를 계산할 수 없었다. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-260 table-fixed text-sm border-collapse">
              <colgroup>
                {["8%", "6%", "9%", "8%", "8%", "8%", "8%", "17%", "11%", "17%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th rowSpan={2} scope="col" className={HEAD_CLS}>{tx.colPos}</th>
                  <th rowSpan={2} scope="col" className={HEAD_CLS}>{tx.colTarget}</th>
                  <th rowSpan={2} scope="col" className={HEAD_CLS}>{tx.colPressure}</th>
                  <th colSpan={4} scope="colgroup" className={`${HEAD_CLS} border-x border-border/60`}>
                    {tx.colTreadPoints}
                  </th>
                  <th rowSpan={2} scope="col" className={HEAD_CLS}>{tx.colPreview}</th>
                  <th rowSpan={2} scope="col" className={HEAD_CLS}>{tx.colFlag}</th>
                  <th rowSpan={2} scope="col" className={HEAD_CLS}>{tx.colSerial}</th>
                </tr>
                <tr className="border-b border-border">
                  {[tx.ptL, tx.ptC1, tx.ptC2, tx.ptR].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-1 pb-1.5 text-center text-[11px] font-medium text-muted-foreground whitespace-nowrap ${i === 0 ? "border-l border-border/60" : ""} ${i === 3 ? "border-r border-border/60" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POS_ORDER.map((pos) => {
                  const pv = previews[pos];
                  const partial = pv && pv.filled > 0 && pv.filled < POINT_FIELDS.length;
                  const flag = cells[pos]?.flag ?? "OK";
                  return (
                  <tr key={pos} className="border-b border-border/40 text-center align-top">
                    <th scope="row" className="px-2 py-1.5 text-center font-mono font-bold text-primary whitespace-nowrap">{pos}</th>
                    <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">{targetPsi(pos)}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number" inputMode="decimal"
                        value={cells[pos]?.pressure ?? ""}
                        onChange={(e) => setCell(pos, "pressure", e.target.value)}
                        placeholder={tx.psiPh}
                        aria-label={`${pos} · ${tx.colPressure}`}
                        className={CELL_CLS}
                      />
                    </td>
                    {POINT_FIELDS.map((f, i) => (
                      <td
                        key={f.key}
                        className={`px-1 py-1.5 ${i === 0 ? "border-l border-border/60" : ""} ${i === 3 ? "border-r border-border/60" : ""}`}
                      >
                        <input
                          type="number" inputMode="decimal" step="0.1"
                          value={cells[pos]?.[f.key] ?? ""}
                          onChange={(e) => setCell(pos, f.key, e.target.value)}
                          placeholder={tx.mmPh}
                          aria-label={`${pos} · ${tx.colTreadPoints} · ${f.width}`}
                          aria-invalid={partial || undefined}
                          className={`${POINT_CLS} ${partial ? "border-destructive" : "border-border"}`}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-left">
                      <TreadPreview pv={pv} tx={tx} t={t} />
                    </td>
                    <td className="px-1 py-1.5">
                      <select
                        value={flag}
                        onChange={(e) => setCell(pos, "flag", e.target.value as TreadFlag)}
                        aria-label={`${pos} · ${tx.colFlag}`}
                        className={`${CELL_CLS} w-full text-left ${flag === "OK" ? "text-muted-foreground" : "text-foreground font-semibold"}`}
                      >
                        {FLAG_OPTIONS.map((f) => (
                          // OUTLIER 지정은 관리자만 (v3 §E-1 규칙 5). 이미 찍힌 값은 계속 보여 준다.
                          <option key={f} value={f} disabled={f === "OUTLIER" && !isAdmin && flag !== "OUTLIER"}>
                            {f}
                          </option>
                        ))}
                      </select>
                      {flag !== "OK" && (
                        <input
                          type="text"
                          value={cells[pos]?.flagNote ?? ""}
                          onChange={(e) => setCell(pos, "flagNote", e.target.value)}
                          placeholder={tx.flagNotePh}
                          aria-label={`${pos} · ${tx.flagNotePh}`}
                          className={`${CELL_CLS} w-full text-left mt-1`}
                        />
                      )}
                      {flag === "OUTLIER" && !isAdmin && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{tx.outlierAdminOnly}</p>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={cells[pos]?.serial ?? ""}
                        onChange={(e) => setCell(pos, "serial", e.target.value)}
                        placeholder={tx.serialPh}
                        aria-label={`${pos} · ${tx.colSerial}`}
                        className={`${CELL_CLS} w-full text-left`}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 저장을 막는 유일한 조건 — 4칸 중 일부만 채운 포지션 (v3 §E-1 규칙 1).
              자동 CHECK 는 여기 오지 않는다. 경고만 띄우고 저장은 허용한다(규칙 4). */}
          {partialPositions.length > 0 && (
            <div className="flex items-start gap-2 mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                {tx.errPartial}
                <span className="font-mono font-bold">{partialPositions.join(", ")}</span>
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || partialPositions.length > 0}
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

          {/* 트레드 0 mm 확인 모달 (v2 §B-2 · v3 §E-1 규칙 6).
              "다 닳음"과 "못 쟀음"은 마모율 통계에서 정반대로 취급되므로 추측하지 않고 묻는다. */}
          <AnimatePresence>
            {zeroAsk && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                  role="dialog" aria-modal="true" aria-label={tx.zeroTitle}
                  className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
                >
                  <h4 className="flex items-center gap-2 text-base font-bold text-foreground">
                    <AlertTriangle className="w-4 h-4 text-destructive" /> {tx.zeroTitle}
                  </h4>
                  <p className="mt-2 text-sm text-muted-foreground">{tx.zeroBody}</p>
                  <p className="mt-2 font-mono text-sm font-bold text-foreground">
                    {zeroAsk.join(", ")}
                  </p>

                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      onClick={() => { setZeroAsk(null); void persist("worn_out"); }}
                      className="rounded-lg border border-border px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <span className="block text-sm font-bold text-foreground">{tx.zeroWorn}</span>
                      <span className="block text-xs text-muted-foreground">{tx.zeroWornDesc}</span>
                    </button>
                    <button
                      onClick={() => { setZeroAsk(null); void persist("not_measured"); }}
                      className="rounded-lg border border-border px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <span className="block text-sm font-bold text-foreground">{tx.zeroNotMeasured}</span>
                      <span className="block text-xs text-muted-foreground">{tx.zeroNotMeasuredDesc}</span>
                    </button>
                    <button
                      onClick={() => { setZeroAsk(null); void persist("scrapped"); }}
                      className="rounded-lg border border-border px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <span className="block text-sm font-bold text-foreground">{tx.zeroScrapped}</span>
                      <span className="block text-xs text-muted-foreground">{tx.zeroScrappedDesc}</span>
                    </button>
                    <p className="pt-1 text-xs text-muted-foreground">{tx.zeroMustPick}</p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          </>
          ) : (
            // 앱 전체가 로그인 뒤에 있으므로 여기서는 권한 부족만 안내한다.
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 my-4">
              <LockIcon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{tx.readOnly}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 저장된 점검 이력 */}
      <motion.div variants={staggerItem}>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <span className="text-sm font-bold text-foreground">{tx.historyTitle}</span>
            <span className="text-xs text-muted-foreground">CH {selCh}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-border overflow-hidden" role="group">
                <button
                  onClick={() => setHistView("layout")}
                  aria-pressed={histView === "layout"}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-colors ${
                    histView === "layout" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> {tx.viewLayout}
                </button>
                <button
                  onClick={() => setHistView("table")}
                  aria-pressed={histView === "table"}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-colors ${
                    histView === "table" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" /> {tx.viewTable}
                </button>
              </div>
              <button
                onClick={loadHistory}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {tx.refresh}
              </button>
            </div>
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
                      {[
                        meta.hm != null && fmtMeter(meta.hm, "HM"),
                        meta.km != null && fmtMeter(meta.km, "KM"),
                        meta.driver && `${tx.driverShort} ${meta.driver}`,
                      ].filter(Boolean).join(" · ")}
                    </span>
                    {/* 입력자(감사 추적) — 0009 이전 데이터는 값이 없어 표시하지 않는다 */}
                    {meta.created_by_email && (
                      <span
                        title={
                          meta.updated_by_email && meta.updated_by_email !== meta.created_by_email
                            ? `${tx.editorShort}: ${meta.updated_by_email}`
                            : undefined
                        }
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <UserRound className="w-3 h-3 shrink-0" />
                        {tx.uploaderShort} {meta.created_by_email}
                        {meta.updated_by_email && meta.updated_by_email !== meta.created_by_email && (
                          <span className="opacity-70">({tx.editorShort} {meta.updated_by_email})</span>
                        )}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{rows.length}{tx.countSuffix}</span>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(d)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        title={tx.deleteTitle}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {histView === "table" ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-180 table-fixed text-xs border-collapse font-mono">
                        <colgroup>
                          {["12%", "12%", "13%", "35%", "28%"].map((w, i) => (
                            <col key={i} style={{ width: w }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border/50">
                            {[tx.histColPos, tx.histColPressure, tx.histColTread, tx.histColGrooves, tx.histColSerial].map((h) => (
                              <th key={h} scope="col" className="px-3 py-1.5 text-center text-muted-foreground font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {POS_ORDER.map((pos) => {
                            const r = byPos.get(pos);
                            const gp = histPoints.get(`${d}|${pos}`);
                            // 중앙만 소진되고 숄더가 남은 상태는 미측정이 아니라 실측이다 (v3 §0.3).
                            const centerZero =
                              r?.center_avg === 0 && (r?.shoulder_avg ?? 0) > 0;
                            return (
                              <tr key={pos} className="border-b border-border/30 text-center">
                                <th scope="row" className="px-3 py-1.5 font-bold text-primary">{pos}</th>
                                <td className="px-3 py-1.5">{r?.pressure != null ? Math.round(r.pressure) : "−"}</td>
                                <td className="px-3 py-1.5">{r?.tread != null ? fmtTread(r.tread) : "−"}</td>
                                <td className="px-3 py-1.5">
                                  {gp && WIDTH_ORDER.every((w) => gp[w] != null) ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <span>{WIDTH_ORDER.map((w) => fmtTreadAvg(gp[w], false)).join(" / ")}</span>
                                      {centerZero && (
                                        <span className="px-1.5 py-0.5 rounded border border-border bg-muted/40 text-[10px] font-sans font-bold text-muted-foreground whitespace-nowrap">
                                          {t("pattern.center_zero")}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">−</span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground truncate max-w-40">{r?.serial ?? "−"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-3">
                      <TireSchematic
                        cells={POS_ORDER.reduce<Record<string, SchematicCell>>((acc, pos) => {
                          const r = byPos.get(pos);
                          acc[pos] = { pressure: r?.pressure ?? null, tread: r?.tread ?? null, serial: r?.serial ?? null };
                          return acc;
                        }, {})}
                        caption={`${TMS_DATA.tire.brand} · ${TMS_DATA.tire.size}`}
                        onCellClick={(rp) => setDetail(POS_ORDER.indexOf(rp) + 1)}
                      />
                      <div className="flex flex-wrap gap-4 mt-3 text-xs px-1">
                        {[
                          { cls: "bg-green-500/15 border-green-500", label: tx.statusOk },
                          { cls: "bg-yellow-400/15 border-yellow-400", label: tx.statusWarn },
                          { cls: "bg-red-500/15 border-red-500", label: tx.statusDanger },
                        ].map((l) => (
                          <span key={l.label} className="flex items-center gap-1.5">
                            <span className={`w-4 h-5 rounded border-2 ${l.cls} inline-block`} />
                            {l.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* 배치도 타이어 상세 모달 (차량 배치도와 동일 형태) */}
      <AnimatePresence>
        {detail != null && (
          <TireDetailModal ch={selCh} pos={detail} onClose={() => setDetail(null)} onSerialClick={onSerialClick} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const INPUT_CLS =
  "w-full h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground outline-none focus:border-primary transition-colors";
const CELL_CLS =
  "w-24 h-8 px-2 text-sm font-mono text-right rounded-md border border-border bg-background text-foreground outline-none focus:border-primary transition-colors";
const HEAD_CLS =
  "px-2 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap align-bottom";
/** 4점 입력칸 — 좁은 열에 4개가 들어가므로 CELL_CLS 의 고정폭(w-24) 대신 w-full. */
const POINT_CLS =
  "w-full h-8 px-1 text-sm font-mono text-right rounded-md border bg-background text-foreground outline-none focus:border-primary transition-colors";

/**
 * 입력 즉시 계산되는 통계 미리보기 (v3 §E-1 규칙 2).
 * 여기 뜨는 값은 저장 후 DB 트리거가 채운 값과 소수점 자리까지 같아야 한다.
 * 자동 CHECK 는 경고만 — 저장을 막지 않는다 (규칙 4).
 */
function TreadPreview({
  pv,
  tx,
  t,
}: {
  pv?: { filled: number; stats: TreadStats | null; pattern: string | null; checks: string[] };
  tx: (typeof TX)[keyof typeof TX];
  t: (k: string) => string;
}) {
  if (!pv || pv.filled === 0) return <span className="text-xs text-muted-foreground">—</span>;

  if (pv.filled < POINT_FIELDS.length) {
    return <span className="text-[11px] text-destructive">{tx.previewPartial}</span>;
  }

  const s = pv.stats;
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span className="font-mono text-xs text-foreground">
        {t("tread.avg")} {fmtTreadAvg(s.avg)} · {t("tread.min")} {fmtTread(s.min)}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {t("tread.cv")} {s.cv == null ? "—" : fmtPercent(s.cv)} · {t("tread.range")}{" "}
        {fmtTreadAvg(s.range, false)}
      </span>
      {pv.pattern && (
        <span className="text-[11px] font-semibold text-yellow-400">{pv.pattern}</span>
      )}
      {pv.checks.map((c) => (
        <span key={c} className="text-[11px] text-yellow-400">
          ⚠ {c}
        </span>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-semibold">{label}</span>
      {children}
    </label>
  );
}
