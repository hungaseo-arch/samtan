// @section: life-tab
import { Fragment, useState, useEffect, useRef } from "react";
import { TMS_DATA, treadLevel, treadThresholds } from "@/data/tmsData";
import type { TreadLevel } from "@/data/tmsData";
import { codeName, fmtD, lifeCalc, findUnitBySerial, latestTreadOf, latestTreadAvgOf, tireHistory, tireMovements } from "@/data/tmsUtils";
import { EMPTY, fmtInt, fmtTread } from "@/lib/format";
import type { LifeRecord } from "@/data/tmsData";
import { X, Download } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import TireDetailCard from "./TireDetailCard";

// 4단계 신호등 — 녹색 ≥10mm / 황색 5~10mm / 주황 3~5mm(발주) / 적색 <3mm
const TREAD_CLS: Record<TreadLevel, string> = {
  ok: "text-level-ok",
  warn: "text-level-warn font-bold",
  order: "text-level-order font-bold",
  danger: "text-level-danger font-bold",
};

const buildTX = () => ({
  ko: {
    dbTitle: "타이어 수명 DB",
    status: "상태",
    all: "전체",
    pcs: "본",
    colNo: "No",
    colSerial: "시리얼",
    colInstall: "최초 장착일",
    colTread: "최근 트레드",
    avgPrefix: "평균 ",
    colTreadAvg: "최근 트레드(4점평균)",
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
    foot3d: " = 가장 최근 회차의 폭 4점 중 ",
    foot3dMin: "최소값",
    foot3d2: `입니다(<${treadThresholds().caution}mm 주의, <${treadThresholds().order}mm 발주, <${treadThresholds().critical}mm 즉시교체). 교체 판정은 가장 얇은 지점을 기준으로 하기 때문입니다. 그 아래 회색 숫자는 같은 회차의 `,
    foot3dAvg: "4점 평균",
    foot3d3: "입니다. 중앙 그루브가 먼저 닳는 타이어는 최소값이 0.0mm 여도 숄더가 남아 주행 중일 수 있으며, 두 값의 차이가 그 상태를 보여줍니다. 4점 측정 이전 회차는 평균이 표시되지 않습니다.",
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
    wL: "좌", wC1: "중1", wC2: "중2", wR: "우",
    hTreadMin: "최소",
    hTreadAvg: "평균",
    hWidths: "폭 4점",
    hNoWidths: "4점 측정 이전 회차",
    modalFoot: "굵은 숫자가 그 회차의 최소값이며 교체 판정과 색상은 최소값 기준입니다. 평균은 참고용으로, 중앙이 먼저 닳는 타이어는 최소값이 0.0mm 여도 숄더가 남아 있습니다.",
    colDepth: "트레드(mm)",
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
    avgPrefix: "rerata ",
    colTreadAvg: "Tapak terkini (rata-rata 4 titik)",
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
    foot3d: " = ",
    foot3dMin: "nilai terkecil dari 4 titik lebar",
    foot3d2: ` pada sesi ukur terbaru (<${treadThresholds().caution}mm perhatian, <${treadThresholds().order}mm pesan ban, <${treadThresholds().critical}mm ganti segera). Penilaian ganti selalu memakai titik paling tipis. Angka abu-abu di bawahnya adalah `,
    foot3dAvg: "rata-rata 4 titik",
    foot3d3: " pada sesi yang sama. Pada ban yang alur tengahnya habis lebih dulu, nilai terkecil bisa 0.0mm padahal bahunya masih tersisa dan ban masih jalan — selisih kedua angka menunjukkan kondisi itu. Sesi sebelum pengukuran 4 titik tidak menampilkan rata-rata.",
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
    wL: "Kiri", wC1: "Tgh 1", wC2: "Tgh 2", wR: "Kanan",
    hTreadMin: "min",
    hTreadAvg: "rerata",
    hWidths: "4 titik lebar",
    hNoWidths: "Sesi sebelum pengukuran 4 titik",
    modalFoot: "Angka tebal adalah nilai minimum sesi tersebut; penilaian penggantian dan warna memakai nilai minimum. Rata-rata hanya acuan — pada ban yang aus di tengah, bahu masih tersisa meski minimum 0.0 mm.",
    colDepth: "Tapak (mm)",
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
  en: {
    dbTitle: "Tire Lifetime DB",
    status: "Status",
    all: "All",
    pcs: "pcs",
    colNo: "No",
    colSerial: "Serial",
    colInstall: "First install date",
    colTread: "Latest tread",
    avgPrefix: "avg ",
    colTreadAvg: "Latest tread (4-point avg)",
    colKm: "Distance KM",
    colHr: "Operating HR",
    colExpKm: "Estimated KM",
    colExpHm: "Estimated HM",
    colStatus: "Status",
    colNote: "Note",
    avg: "Average",
    nonMeasured: "Not measured",
    hmReset: "HM Reset",
    foot1a: "Click a row",
    foot1b: " to open a modal with that tire's full history (install · removal · scrap · HM Reset · measurement rounds).",
    foot2a: "Target lifetime {km} km",
    foot2b: " — estimated lifetime at or above the target is shown in green.",
    foot3a: "Latest lifetime (km·hr)",
    foot3b: " = cumulative distance and operating hours from the first measurement (new tire) to the latest round. ",
    foot3c: "Latest tread",
    foot3d: " = the ",
    foot3dMin: "minimum of the 4 width points",
    foot3d2: ` in the latest round (<${treadThresholds().caution}mm caution, <${treadThresholds().order}mm order, <${treadThresholds().critical}mm replace now). Replacement is judged on the thinnest point. The grey figure below it is the `,
    foot3dAvg: "4-point average",
    foot3d3: " for the same round. On tires whose centre grooves wear first, the minimum can read 0.0mm while the shoulders still have rubber and the tire is still running — the gap between the two shows that. Rounds measured before 4-point recording show no average.",
    foot4a: "HM Reset",
    foot4b: " = vehicles whose Hour Meter and distance were reset to 0 during operation (CH 832·835). Cumulative history before the reset is broken, so lifetime and estimated lifetime may be shown as ",
    foot4c: ".",
    foot5: "Estimated KM applies only to tires measured from a new 22mm tread and estimates when 0mm will be reached; it is not shown for replaced, scrapped (Scrap) or not-installed (Not Install) tires.",
    foot6a: "Not measured",
    foot6b: " = fitted to a vehicle outside the 5 monitored units (834·839·832·835·849) or held as a spare — with no inspection data, tread·distance·estimates are shown as ",
    foot6c: ".",
    foot7a: "In the Note column, ",
    foot7b: "damage codes",
    foot7c: " open an explanation modal when clicked. ",
    foot7d: "View all damage codes",
    codesTitle: "Damage Codes",
    histNotInstall: "Not installed",
    histTireHistory: "Tire history",
    hInstall: "First install date",
    hMount: "Reinstall date",
    hMountSub: "Replacement install",
    hRemove: "Removal date",
    hScrap: "Scrap date",
    hDamage: "Damage Code",
    hHmReset: "HM Reset",
    hHmResetYes: "Yes (meter-reset vehicle)",
    hHmResetNo: "None",
    hKmHr: "Distance KM / HR",
    hExpKmHm: "Estimated KM / HM",
    hTread: "Latest tread",
    wL: "L", wC1: "C1", wC2: "C2", wR: "R",
    hTreadMin: "min",
    hTreadAvg: "avg",
    hWidths: "4 width points",
    hNoWidths: "Round measured before 4-point recording",
    modalFoot: "Bold figures are that round\u2019s minimum; replacement judgement and colour follow the minimum. The average is reference only — a centre-worn tyre can read 0.0 mm at the minimum while the shoulders still carry rubber.",
    colDepth: "Tread (mm)",
    measHist: "Measurement history",
    sessions: "rounds",
    noMeasData: "No measurement data",
    colInspect: "Inspection date",
    moveHist: "Install history (position·vehicle changes)",
    moveNone: "Only 1 install record (no changes).",
    mDate: "Install date",
    mVehicle: "Vehicle",
    mPos: "Position",
    mKind: "Type",
    mInstall: "First install",
    mMount: "Replacement install",
    mCurrent: "Current",
    excelDownload: "Excel download",
  },
} as const);

const TARGET_KM = 75000; // 목표 수명 (km)

/** 값 없음 표기 — 표·요약·모달이 같은 글자를 쓴다. */

const STATUS_STYLE: Record<LifeRecord["status"], string> = {
  Install: "text-level-ok border-level-ok/40 bg-level-ok/10",
  Scrap: "text-level-danger border-level-danger/40 bg-level-danger/10",
  Spare: "text-level-warn border-level-warn/40 bg-level-warn/10",
  "Not Install": "text-muted-foreground border-border bg-muted/20",
};

export default function LifeTab({ focusSerial }: { focusSerial?: string | null }) {
  const { lang } = useLang();
  const { canDownload } = useAuth();
  // 문구에 임계치가 들어가므로 DB 로드 후 렌더 시점에 만든다.
  const tx = buildTX()[lang];

  // 폭 방향 4점. 열 순서(좌→중1→중2→우)는 확정이고, 차량 기준 외측/내측은
  // 미확정이라 방향 이름을 붙이지 않는다 (v3 §Q1 보류).
  const WIDTH_KEYS = [
    { k: "l" as const, label: tx.wL },
    { k: "c1" as const, label: tx.wC1 },
    { k: "c2" as const, label: tx.wC2 },
    { k: "r" as const, label: tx.wR },
  ];
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
  // 요약의 4점 — hist 안에서 한 번 꺼내 둔다(렌더 안에서 non-null 단언을 쓰지 않도록).
  const latestW = hist?.latestWidths ?? null;

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
      const treadAvg = latestTreadAvgOf(l.serial);
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
        [tx.colTreadAvg]: treadAvg != null ? Number(treadAvg.toFixed(1)) : "",
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
      {/* 배치도에서 시리얼을 클릭해 들어온 경우 — v_tire_detail 단건 상세.
          수명 DB에 없는 시리얼이면 아래 표에 행이 없으므로 이 카드가 유일한 표시원이다. */}
      {target && <TireDetailCard key={target} serial={target} />}

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
            {/* 엑셀 다운로드 — 로그인한 모든 사용자(조회 권한 포함) */}
            {canDownload && (
              <button
                onClick={exportExcel}
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-level-ok text-white hover:bg-level-ok/85 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {tx.excelDownload}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full min-w-210 table-fixed text-xs border-collapse font-mono">
            <colgroup>
              {/* 상태 열은 'Not Install' 이 한 줄로 들어갈 만큼 준다(12%). 합계 100% */}
              {["4%", "13%", "10%", "9%", "9%", "9%", "9%", "9%", "12%", "16%"].map((w, i) => (
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
                const treadAvg = latestTreadAvgOf(l.serial);
                const treadCls = tread == null ? "" : TREAD_CLS[treadLevel(tread)];
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
                      <>
                        <span className={treadCls}>{fmtTread(tread, false)}<span className="text-muted-foreground/60 ml-0.5">mm</span></span>
                        {/* 4점 평균 병기 — 최소값이 0.0 이어도 숄더가 남았는지 여기서 보인다.
                            판정·색상은 위의 최소값이 그대로 쥔다. 평균은 읽기 보조일 뿐이다.
                            평균이 최소값과 같으면(4점이 모두 동일) 줄만 차지하므로 생략한다. */}
                        {treadAvg != null && treadAvg !== tread && (
                          <div className="text-[10px] text-muted-foreground/60 leading-tight">
                            {tx.avgPrefix}{fmtTread(treadAvg, false)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground/40">{EMPTY}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.km != null ? (
                      <span className="font-bold text-primary">{fmtInt(c.km)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">{EMPTY}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.hr != null ? (
                      <span className="text-foreground">{fmtInt(c.hr)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">{EMPTY}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.expectedKm != null && !noExpected ? (
                      <span className={`font-bold ${c.expectedKm >= TARGET_KM ? "text-level-ok" : "text-primary"}`}>{fmtInt(c.expectedKm)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">{EMPTY}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {c?.expectedHm != null && !noExpected ? (
                      <span className="font-bold text-primary">{fmtInt(c.expectedHm)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">{EMPTY}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`inline-block whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[l.status]}`}
                    >
                      {l.status}
                    </span>
                  </td>
                  {/* 비고 — 조각 사이에 실제 ' · ' 문자를 넣는다.
                      여백(margin)만으로 띄우면 복사·스크린리더에서 '측정 외850 R2i' 처럼 붙는다. */}
                  <td className="px-2 py-1.5 text-[10px] text-muted-foreground text-center">
                    {[
                      !monitored && <span key="nm" className="text-[9px] text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 align-middle">{tx.nonMeasured}</span>,
                      damage && <button key="dmg" className="text-destructive font-bold hover:underline" onClick={(e) => { e.stopPropagation(); openCodes(damage); }}>{codeName(damage)}</button>,
                      l.note && <span key="note">{l.note}</span>,
                      hmReset && <span key="hmr" className="text-level-warn font-semibold">{tx.hmReset}</span>,
                    ].filter(Boolean).map((node, i) => (
                      <Fragment key={i}>{i > 0 && " · "}{node}</Fragment>
                    ))}
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="px-2 py-2 text-muted-foreground" colSpan={3}>{tx.avg}</td>
                <td className="px-2 py-2 text-right">{avg.tread != null ? <span>{fmtTread(avg.tread, false)}<span className="text-muted-foreground/60 ml-0.5">mm</span></span> : EMPTY}</td>
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
          <strong className="text-foreground">{tx.foot2a.replace("{km}", fmtInt(TARGET_KM))}</strong>{tx.foot2b}
          <br />
          <strong className="text-foreground">{tx.foot3a}</strong>{tx.foot3b}<strong className="text-foreground">{tx.foot3c}</strong>{tx.foot3d}<strong className="text-foreground">{tx.foot3dMin}</strong>{tx.foot3d2}<strong className="text-foreground">{tx.foot3dAvg}</strong>{tx.foot3d3}
          <br />
          <strong className="text-foreground">{tx.foot4a}</strong>{tx.foot4b}<span className="font-mono">{EMPTY}</span>{tx.foot4c}
          <br />
          {tx.foot5}
          <br />
          <span className="border border-border/60 rounded px-1.5 py-0.5">{tx.foot6a}</span>{tx.foot6b}<span className="font-mono">{EMPTY}</span>{tx.foot6c}
          <br />
          {tx.foot7a}<strong className="text-destructive">{tx.foot7b}</strong>{tx.foot7c}<button className="text-primary hover:underline font-semibold" onClick={() => openCodes(null)}>{tx.foot7d}</button>
        </p>
      </div>

      {/* 손상 코드 모달 (표의 손상 코드 클릭 또는 '손상 코드 전체 보기'로 열림) */}
        {showCodes && (
          <div
            className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowCodes(false)}
          >
            <div
              className="modal-in bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl"
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
            </div>
          </div>
        )}

      {/* 타이어 히스토리 모달 */}
        {hist && (
          <div
            className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setHistoryOf(null)}
          >
            <div
              className="modal-in bg-card border border-border rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl"
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
                <HRow
                  label={tx.hTread}
                  value={hist.latestTread != null
                    ? `${fmtTread(hist.latestTread, false)} mm (${tx.hTreadMin})`
                    : null}
                  mono
                />
                {/* 4점은 두 칸을 다 쓴다 — 값 넷에 평균까지 한 줄에 넣어야 비교가 된다.
                    최소값이 어느 점에서 나왔는지 굵게 표시해 위의 숫자와 이어 붙인다. */}
                <div className="col-span-2">
                  <span className="text-[11px] text-muted-foreground font-semibold">{tx.hWidths}</span>
                  {latestW ? (
                    <p className="font-mono text-xs mt-0.5">
                      {WIDTH_KEYS.map((w) => {
                        const v = latestW[w.k];
                        const isMin = v != null && hist.latestTread != null && v === hist.latestTread;
                        return (
                          <span key={w.k} className="inline-block mr-3">
                            <span className="text-[10px] text-muted-foreground mr-1">{w.label}</span>
                            <span className={isMin ? "font-bold text-foreground" : ""}>
                              {v != null ? fmtTread(v, false) : EMPTY}
                            </span>
                          </span>
                        );
                      })}
                      {hist.latestTreadAvg != null && (
                        <span className="text-muted-foreground">
                          · {tx.hTreadAvg} {fmtTread(hist.latestTreadAvg, false)} mm
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{tx.hNoWidths}</p>
                  )}
                </div>
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
                            <td className="px-2 py-1">{m.date ?? EMPTY}</td>
                            <td className="px-2 py-1 font-bold text-primary">CH {m.ch}</td>
                            <td className="px-2 py-1">{m.pos}</td>
                            <td className="px-2 py-1">
                              <span className="font-sans text-muted-foreground">{m.kind === "install" ? tx.mInstall : tx.mMount}</span>
                              {current && <span className="font-sans ml-1 text-[10px] text-level-ok font-bold">· {tx.mCurrent}</span>}
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
                        <tr className="text-muted-foreground/70">
                          <th />
                          <th colSpan={6} className="px-2 pt-1 text-center text-[10px] font-semibold border-b border-border/40">{tx.colDepth}</th>
                          <th colSpan={2} />
                        </tr>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-2 py-1 text-left font-semibold">{tx.colInspect}</th>
                          {/* 폭 4점을 먼저 보이고, 그 뒤에 거기서 나온 최소·평균을 둔다.
                              읽는 순서가 계산 순서와 같아야 표를 설명할 필요가 없다. */}
                          {WIDTH_KEYS.map((w) => (
                            <th key={w.k} className="px-2 py-1 text-right font-semibold">{w.label}</th>
                          ))}
                          <th className="px-2 py-1 text-right font-semibold">{tx.hTreadMin}</th>
                          <th className="px-2 py-1 text-right font-semibold">{tx.hTreadAvg}</th>
                          <th className="px-2 py-1 text-right font-semibold">KM</th>
                          <th className="px-2 py-1 text-right font-semibold">HM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hist.rounds.map((r, i) => (
                          <tr key={i} className="border-b border-border/30">
                            <td className="px-2 py-1">{r.date}</td>
                            {WIDTH_KEYS.map((w) => {
                              const v = r.widths ? r.widths[w.k] : null;
                              // 최소값이 나온 지점을 굵게. 어느 그루브가 판정을 쥐는지가 이 표의 요점이다.
                              const isMin = v != null && r.tread != null && v === r.tread;
                              return (
                                <td key={w.k} className={`px-2 py-1 text-right ${isMin ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                                  {v != null ? fmtTread(v, false) : EMPTY}
                                </td>
                              );
                            })}
                            <td className={`px-2 py-1 text-right font-bold ${r.tread != null ? TREAD_CLS[treadLevel(r.tread)] : ""}`}>
                              {r.tread != null ? fmtTread(r.tread, false) : EMPTY}
                            </td>
                            <td className="px-2 py-1 text-right text-muted-foreground">{r.treadAvg != null ? fmtTread(r.treadAvg, false) : EMPTY}</td>
                            <td className="px-2 py-1 text-right">{fmtInt(r.km)}</td>
                            <td className="px-2 py-1 text-right">{fmtInt(r.hm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-relaxed">{tx.modalFoot}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

function HRow({ label, value, mono, danger, sub }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground font-semibold">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${danger && value && value !== EMPTY ? "text-level-danger font-bold" : "text-foreground"}`}>
        {value || EMPTY}{sub && value && value !== EMPTY ? <span className="text-[10px] text-muted-foreground ml-1">{sub}</span> : null}
      </span>
    </div>
  );
}
