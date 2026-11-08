// @section: wear-analysis-tab
// 마모 분석 화면 — KPI 카드 8종 + 차트 5종 (작업지시서 v3 §E-2 · 설계서 §17).
//
// 원칙 두 가지만 기억하면 된다.
//  1. 숫자는 전부 DB 뷰가 계산한다. 여기서는 서식만 입힌다 — 다시 계산하면 소수점이 갈린다.
//  2. **원시값이 없으면 차트를 그리지 않는다.** 2026-08 이전 410행은 최소값만 있어
//     평균·CV·편마모가 전부 null 이다. 빈 축만 남은 차트 대신 note.legacy 안내를 띄운다
//     (게이트 E — "빈 차트가 나오지 않는다").
//
// 단일 종합점수는 만들지 않는다. 4개 평가축(마모성능·균일성·편마모·내구성)을
// 따로 보여 주는 것이 설계서 §16 의 명시적 요구다.
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { TMS_DATA, HEAD_MAP, NEW_TREAD } from "@/data/tmsData";
import { lifeCalc } from "@/data/tmsUtils";
import ResultSummaryCard from "./ResultSummaryCard";
import { useLang } from "@/i18n";
import {
  EMPTY, fmtTread, fmtTreadAvg, fmtPercent, fmtRatio,
  fmtWearRate, fmtKmPerMm, kmPerMmOf, fmtR2, fmtDistanceKm, fmtInt,
} from "@/lib/format";
import {
  listTreadSeries, listWearRateSegments, listWearPattern,
  listCvBenchmark, listTreadPoints,
  type TreadSeriesRow, type WearRateSegmentRow, type WearPatternRow,
  type CvBenchmarkRow, type TreadPointRow,
} from "@/api/wear";
import { WIDTH_POS, type WidthPos } from "@/lib/treadStats";
import {
  LineChart, Line, BarChart, Bar, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { HEX } from "@/lib/chartColors";

const POSITIONS = Array.from({ length: 10 }, (_, i) => HEAD_MAP[i + 1]);

/** 차량 칩의 «평균» 자리. 실제 CH 값과 겹치지 않는 표식이다. */
const AVG = "__avg__";

/**
 * 한 (ch, pos) 의 현재 장착 타이어(최신 세그먼트) 대표값.
 * 차량 1대 화면과 «평균» 화면이 같은 규칙으로 고르도록 한 곳에 둔다.
 */
function posStats(
  series: TreadSeriesRow[],
  segments: WearRateSegmentRow[],
  patterns: WearPatternRow[],
  ch: string,
  pos: string,
) {
  /** 원시값을 가진 회차. 이게 비어 있으면 아래는 전부 그리지 않는다. */
  const measured = series.filter(
    (r) => r.pos === pos && (r.point_count ?? 0) > 0 && r.tread_avg != null,
  );
  const segNo = measured.length ? measured[measured.length - 1].seg_no : null;
  const segRows = segNo == null ? [] : measured.filter((r) => r.seg_no === segNo);
  const segment =
    segments.find((s) => s.ch === ch && s.pos === pos && s.seg_no === segNo) ?? null;
  const patRows = patterns.filter((p) => p.pos === pos && p.seg_no === segNo);
  const latestPattern = patRows.length ? patRows[patRows.length - 1] : null;
  const latest = segRows.length ? segRows[segRows.length - 1] : null;
  const initialAvg = segment?.initial_avg ?? (segRows.length ? segRows[0].tread_avg : null);
  const totalWear =
    initialAvg != null && latest?.tread_avg != null
      ? Math.round((initialAvg - latest.tread_avg) * 100) / 100
      : null;
  // 예상 주행거리는 새로 계산하지 않고 수명 DB(lifeCalc, 최소 트레드 회귀 → 0 mm)
  // 값을 그대로 쓴다. 같은 타이어가 화면마다 다른 수명으로 찍히면 안 된다.
  const serial = latest?.serial ?? segment?.serial ?? null;
  const expectedKm = serial ? lifeCalc(serial)?.expectedKm ?? null : null;
  // 최신 회차에 0 점이 섞였는데 평균은 0 이 아니다 — 빈칸이 0 으로 저장됐을 수 있다 (R-2 · WEAR-01).
  // 0 하나(W-1)는 20261016190000 이 OUTLIER 로 빼므로, 남는 것은 중앙 2점 0 등 현장 확인 대상(M-6)이다.
  // 값은 DB 그대로 보여 주고 «결측 의심» 배지만 붙인다. «평균» 에서는 최신 회차에서 나온 지표를 전부 뺀다 — 초기 트레드·시험거리만 남긴다.
  const zeroSuspect = latest != null && latest.tread_min === 0 && (latest.tread_avg ?? 0) > 0;
  return { measured, segNo, segRows, segment, latestPattern, latest, initialAvg, totalWear, expectedKm, zeroSuspect };
}

/** 값이 있는 차량만 산술 평균. 하나도 없으면 null — 0 으로 메우지 않는다. */
function meanOf(xs: (number | null | undefined)[]) {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? { mean: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
}

/**
 * 3단으로 놓인 비교 차트(2·3·4)의 공통 높이와 여백.
 *
 * 세로 막대차트를 「항목 수 × 28px」로 잡았더니 포지션 수가 다른 차트끼리
 * 길이가 달라져 한 행에서 그림 바닥이 층졌다. 셋이 나란히 놓이는 이상
 * 높이는 같아야 눈금 위치가 비교된다 — 항목이 늘면 막대가 얇아질 뿐이다.
 * top 여백 18 은 CV 차트의 중앙값 기준선 라벨(position: "top")이 위로
 * 잘리지 않게 확보한 자리이며, 셋이 같은 여백을 써야 그림틀이 정렬된다.
 */
const CHART_H = 320;
const CHART_MARGIN = { top: 18, right: 24, bottom: 4, left: 8 } as const;

/**
 * 세로 막대차트 Y축의 세그먼트 라벨 tick.
 *
 * 기본 tick 은 축 width 안에 글자를 우겨넣으려고 공백에서 줄을 접는다.
 * 「L3 Out #2」처럼 공백이 둘인 라벨이 «L3 Out» / «#2» 두 줄로 갈라져
 * 막대와 눈금이 어긋나 보였다. 한 줄로 고정한다.
 */
const CategoryTick = ({ x, y, payload }: {
  x?: number; y?: number; payload?: { value?: string | number };
}) => (
  <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill={HEX.ink}>
    {String(payload?.value ?? "")}
  </text>
);

const TX = {
  ko: {
    vehicle: "차량(CH):",
    avg: "평균",
    position: "포지션:",
    loading: "마모 통계를 불러오는 중…",
    loadFail: "마모 통계를 불러오지 못했습니다.",
    kpiTitle: "핵심 지표",
    cTestDist: "시험 주행거리",
    cTread: "초기 → 현재 트레드",
    cTotalWear: "누적 마모량",
    cWearRate: "마모속도",
    cExpKm: "예상 주행거리 (0mm)",
    expKmNote: "수명 DB 와 같은 값 (최소 트레드 기준)",
    expKmNone: "산출 불가 — 신품 22mm 부터 측정된 타이어만 계산합니다",
    cCv: "마모 균일성 (CV)",
    cSc: "S/C 비율 (숄더/중앙)",
    // 외측/내측(O/I) 지표는 방향 규약 확정 전까지 노출하지 않는다 (v3 §Q1).
    dirPending: "Kiri/Kanan 이 외측·내측 중 무엇인지는 확인 중입니다",
    cDamage: "손상",
    noDamage: "무고장",
    ch1: "트레드 추이 — 평균 실선 · 최소~최대 밴드",
    ch2: "폭 방향 누적 마모량",
    ch3: "마모속도 비교 (낮을수록 우수)",
    ch4: "마모 균일성 (CV) — 플릿 중앙값 기준선",
    ch5: "숄더 vs 중앙 마모량 · S/C 비율",
    axisKm: "주행거리 (km)",
    axisDate: "점검일",
    axisMm: "mm",
    axisRate: "mm/1,000 km",
    axisPct: "%",
    round: "회차",
    fleetMedian: "플릿 중앙값",
    segLabel: "구간",
    xByKm: "km 기준",
    xByDate: "점검일 기준",
    noSegment: "이 포지션에는 아직 세그먼트 대표값이 없습니다. 같은 시리얼로 측정점 3회차 이상이 쌓이면 산출됩니다.",
    noPattern: "편마모 판정 보류 — 중앙 마모량이 판정 최소치에 못 미칩니다.",
    missingBadge: "결측 의심",
    missingHint: "최신 회차 4점 중 0 이 있는데 평균은 0 이 아닙니다. 빈칸이 0 으로 저장됐을 수 있어 현장 확인 중입니다. «평균» 에서는 이 차량의 최신 회차 지표(현재 트레드·최소·총마모·마모율·CV·S/C·예상 주행거리)를 뺍니다.",
    cvNoCriteria: "CV 합격 기준은 아직 정하지 않았습니다. 플릿 중앙값 대비 위치만 참고하십시오 (설계서 §10).",
    r2Low: "R² 가 0.80 미만입니다. 대표값 신뢰도가 낮습니다.",
    glossary: "용어 설명",
    gCv: "폭 4점(L·C1·C2·R) 트레드의 표본표준편차(n−1) ÷ 평균 × 100. 한 타이어 안에서 얼마나 고르게 닳았는지를 봅니다. 낮을수록 균일하고, 높으면 폭 방향 어느 한쪽만 닳고 있다는 뜻입니다. 합격 기준은 아직 정하지 않아 플릿 중앙값 대비 위치로만 읽습니다.",
    gSc: "숄더(L·R) 마모량 ÷ 중앙(C1·C2) 마모량. 마모량은 신품 트레드 대비 줄어든 값입니다. 1.00 에 가까우면 균일, 1보다 크면 숄더가 먼저 닳는 중(공기압 부족·과적이 흔한 원인), 1보다 작으면 중앙이 먼저 닳는 중(공기압 과다가 흔한 원인)입니다. 숄더 마모·중앙 마모 판정 경계와 판정 보류 최소 마모량은 tire_config 설정값을 따릅니다.",
    legacyTitle: "통계 산출 불가",
    avgNote: (n: number) => `차량 ${n}대의 현재 장착 타이어(최신 구간) 값을 산술 평균했습니다. 값이 없는 차량은 빼고 셉니다.`,
    avgCount: (n: number, total: number) => `${n}/${total}대 평균`,
    avgLine: "평균",
    avgSelect: "트레드 추이 · 폭 방향 · 숄더/중앙 차트는 차량마다 회차와 주행거리가 달라 평균을 내지 않습니다. 차량을 선택하면 보입니다.",
    avgNone: "이 포지션에는 폭 4점 원시값이 있는 차량이 아직 없습니다.",
    noPoints: "이 차량에는 폭 4점 원시 측정값이 아직 없습니다. 점검 입력 화면에서 4점을 기록하면 이 화면이 채워집니다.",
  },
  id: {
    vehicle: "Unit (CH):",
    avg: "Rata-rata",
    position: "Posisi:",
    loading: "Memuat statistik keausan…",
    loadFail: "Gagal memuat statistik keausan.",
    kpiTitle: "Indikator utama",
    cTestDist: "Jarak uji",
    cTread: "Tapak awal → sekarang",
    cTotalWear: "Total keausan",
    cWearRate: "Laju keausan",
    cExpKm: "Prediksi jarak tempuh (0mm)",
    expKmNote: "Sama dengan DB umur ban (berdasar tapak minimum)",
    expKmNone: "Tidak dapat dihitung — hanya ban yang diukur sejak baru 22mm",
    cCv: "Keseragaman keausan (CV)",
    cSc: "Rasio S/C (bahu/tengah)",
    dirPending: "Masih dipastikan apakah Kiri/Kanan berarti sisi luar atau sisi dalam",
    cDamage: "Kerusakan",
    noDamage: "Tanpa kerusakan",
    ch1: "Tren tapak — garis rata-rata · pita min~maks",
    ch2: "Keausan kumulatif arah lebar",
    ch3: "Perbandingan laju keausan (makin rendah makin baik)",
    ch4: "Keseragaman keausan (CV) — garis median armada",
    ch5: "Keausan bahu vs tengah · rasio S/C",
    axisKm: "Jarak tempuh (km)",
    axisDate: "Tgl inspeksi",
    axisMm: "mm",
    axisRate: "mm/1,000 km",
    axisPct: "%",
    round: "Sesi",
    fleetMedian: "Median armada",
    segLabel: "Segmen",
    xByKm: "Berdasar km",
    xByDate: "Berdasar tanggal",
    noSegment: "Belum ada nilai representatif segmen untuk posisi ini. Diperlukan minimal 3 sesi pengukuran dengan serial yang sama.",
    noPattern: "Penilaian keausan ditunda — keausan tengah belum mencapai batas minimum.",
    missingBadge: "Diduga kosong",
    missingHint: "Ada nilai 0 di antara 4 titik sesi terbaru, tetapi rata-rata bukan 0. Kolom kosong mungkin tersimpan sebagai 0 dan sedang dicek di lapangan. Indikator sesi terbaru unit ini (tapak saat ini·min·total aus·laju aus·CV·S/C·perkiraan jarak) tidak dihitung dalam «Rata-rata».",
    cvNoCriteria: "Kriteria lulus CV belum ditetapkan. Gunakan hanya sebagai posisi relatif terhadap median armada.",
    r2Low: "R² di bawah 0.80. Keandalan nilai representatif rendah.",
    glossary: "Penjelasan istilah",
    gCv: "Simpangan baku sampel (n−1) dari 4 titik lebar (L·C1·C2·R) ÷ rata-rata × 100. Menunjukkan seberapa merata satu ban aus. Makin rendah makin merata; makin tinggi berarti hanya satu sisi arah lebar yang aus. Kriteria lulus belum ditetapkan, jadi dibaca hanya sebagai posisi relatif terhadap median armada.",
    gSc: "Keausan bahu (L·R) ÷ keausan tengah (C1·C2). Keausan dihitung dari selisih terhadap tapak ban baru. Mendekati 1.00 berarti merata; di atas 1 berarti bahu aus lebih dulu (umumnya tekanan angin kurang atau muatan berlebih); di bawah 1 berarti tengah aus lebih dulu (umumnya tekanan angin berlebih). Batas penilaian dan keausan minimum untuk menunda penilaian mengikuti nilai di tire_config.",
    legacyTitle: "Statistik tidak tersedia",
    avgNote: (n: number) => `Rata-rata aritmetika nilai ban terpasang (segmen terbaru) dari ${n} unit. Unit tanpa nilai tidak dihitung.`,
    avgCount: (n: number, total: number) => `Rata-rata ${n}/${total} unit`,
    avgLine: "Rata-rata",
    avgSelect: "Grafik tren tapak · arah lebar · bahu/tengah tidak dirata-ratakan karena sesi dan jarak tempuh tiap unit berbeda. Pilih unit untuk melihatnya.",
    avgNone: "Belum ada unit dengan data mentah 4 titik pada posisi ini.",
    noPoints: "Unit ini belum punya data mentah 4 titik. Isi 4 titik di layar input inspeksi untuk mengisi halaman ini.",
  },
  en: {
    vehicle: "Vehicle (CH):",
    avg: "Average",
    position: "Position:",
    loading: "Loading wear statistics…",
    loadFail: "Failed to load wear statistics.",
    kpiTitle: "Key indicators",
    cTestDist: "Test distance",
    cTread: "Initial → current tread",
    cTotalWear: "Total wear",
    cWearRate: "Wear rate",
    cExpKm: "Est. distance (0mm)",
    expKmNote: "Same value as the lifetime DB (minimum tread basis)",
    expKmNone: "Not available — only tires measured from new 22mm are projected",
    cCv: "Wear uniformity (CV)",
    cSc: "S/C ratio (shoulder/center)",
    dirPending: "Whether Kiri/Kanan means outboard or inboard is being confirmed",
    cDamage: "Damage",
    noDamage: "No damage",
    ch1: "Tread trend — average line · min~max band",
    ch2: "Cumulative wear across width",
    ch3: "Wear rate comparison (lower is better)",
    ch4: "Wear uniformity (CV) — fleet median reference",
    ch5: "Shoulder vs center wear · S/C ratio",
    axisKm: "Distance (km)",
    axisDate: "Inspection date",
    axisMm: "mm",
    axisRate: "mm/1,000 km",
    axisPct: "%",
    round: "Round",
    fleetMedian: "Fleet median",
    segLabel: "Segment",
    xByKm: "By km",
    xByDate: "By date",
    noSegment: "No segment representative value yet for this position. It appears once 3+ measured rounds accumulate on the same serial.",
    noPattern: "Wear pattern on hold — center wear is below the minimum decision threshold.",
    missingBadge: "Possibly missing",
    missingHint: "The latest round has a 0 among its 4 points while the average is not 0. A blank may have been saved as 0; field check pending. This unit's latest-round figures (current tread, min, total wear, wear rate, CV, S/C, expected km) are left out of the «Average».",
    cvNoCriteria: "No CV pass criteria have been set. Read it only as a position relative to the fleet median (design §10).",
    r2Low: "R² is below 0.80. The representative value has low confidence.",
    glossary: "Glossary",
    gCv: "Sample standard deviation (n−1) of the four width points (L·C1·C2·R) ÷ mean × 100. It shows how evenly a single tire has worn. Lower is more even; higher means only one side across the width is wearing. No pass criteria are set yet, so read it only as a position relative to the fleet median.",
    gSc: "Shoulder (L·R) wear ÷ center (C1·C2) wear, where wear is the drop from new tread. Near 1.00 is even; above 1 means the shoulders wear first (commonly under-inflation or overload); below 1 means the center wears first (commonly over-inflation). The shoulder/center decision boundaries and the minimum wear that defers a decision come from tire_config.",
    legacyTitle: "Statistics unavailable",
    avgNote: (n: number) => `Arithmetic mean of the mounted tire (latest segment) across ${n} vehicles. Vehicles without a value are left out.`,
    avgCount: (n: number, total: number) => `Mean of ${n}/${total} vehicles`,
    avgLine: "Average",
    avgSelect: "Tread trend, width-direction and shoulder/center charts are not averaged because rounds and distance differ by vehicle. Select a vehicle to see them.",
    avgNone: "No vehicle has 4-point raw measurements on this position yet.",
    noPoints: "This vehicle has no 4-point raw measurements yet. Record 4 points on the inspection input screen to populate this page.",
  },
} as const;

export default function WearAnalysisTab() {
  const { lang, t } = useLang();
  const tx = TX[lang];
  const [selCh, setSelCh] = useState(TMS_DATA.units[0]?.ch ?? "");
  const [selPos, setSelPos] = useState(POSITIONS[0]);
  const [xAxis, setXAxis] = useState<"km" | "date">("km");
  // null = «최신 회차». 0 으로 두면 첫 회차가 기준일 자신이라 누적 마모량이
  // 전부 0.00 mm 로 열렸다. 차량·포지션을 바꿔도 최신에 붙어 있게 null 로 되돌린다.
  const [roundIdx, setRoundIdx] = useState<number | null>(null);
  const isAvg = selCh === AVG;
  const chs = TMS_DATA.units.map((u) => u.ch);

  const series = useQuery<TreadSeriesRow[]>({
    queryKey: ["v_tread_series", selCh],
    queryFn: () => listTreadSeries(selCh),
    enabled: !!selCh && !isAvg,
  });
  const segments = useQuery<WearRateSegmentRow[]>({
    queryKey: ["v_wear_rate_segment"],
    queryFn: () => listWearRateSegments(),
  });
  const patterns = useQuery<WearPatternRow[]>({
    queryKey: ["v_wear_pattern", selCh],
    queryFn: () => listWearPattern(selCh),
    enabled: !!selCh && !isAvg,
  });
  const cvBench = useQuery<CvBenchmarkRow[]>({
    queryKey: ["v_cv_benchmark"],
    queryFn: listCvBenchmark,
  });
  const points = useQuery<TreadPointRow[]>({
    queryKey: ["tread_points", selCh],
    queryFn: () => listTreadPoints(selCh),
    enabled: !!selCh && !isAvg,
  });
  // «평균» — 차량별 쿼리 키를 그대로 써서 차량 칩과 캐시를 나눠 쓴다.
  const allSeries = useQueries({
    queries: chs.map((ch) => ({
      queryKey: ["v_tread_series", ch],
      queryFn: () => listTreadSeries(ch),
      enabled: isAvg,
    })),
  });
  const allPatterns = useQueries({
    queries: chs.map((ch) => ({
      queryKey: ["v_wear_pattern", ch],
      queryFn: () => listWearPattern(ch),
      enabled: isAvg,
    })),
  });

  const loading =
    segments.isLoading || cvBench.isLoading ||
    (isAvg
      ? allSeries.some((q) => q.isLoading) || allPatterns.some((q) => q.isLoading)
      : series.isLoading || patterns.isLoading || points.isLoading);
  const failed =
    segments.isError || cvBench.isError ||
    (isAvg
      ? allSeries.some((q) => q.isError) || allPatterns.some((q) => q.isError)
      : series.isError || patterns.isError || points.isError);

  // ── 선택된 (ch, pos) 의 최신 세그먼트 ────────────────────────
  const stats = useMemo(
    () => posStats(series.data ?? [], segments.data ?? [], patterns.data ?? [], selCh, selPos),
    [series.data, segments.data, patterns.data, selCh, selPos],
  );
  const { measured, segNo, segRows, segment, latestPattern, latest, initialAvg, totalWear, expectedKm, zeroSuspect } = stats;

  /** «평균» — 차량마다 같은 규칙으로 고른 대표값. 원시값이 없는 차량은 뺀다.
   *  7대 × 수백 행이라 메모하지 않는다(useQueries 결과는 렌더마다 새 배열이다). */
  const perCh = isAvg
    ? chs
        .map((ch, i) => ({
          ch,
          st: posStats(allSeries[i].data ?? [], segments.data ?? [], allPatterns[i].data ?? [], ch, selPos),
        }))
        .filter((x) => x.st.measured.length > 0)
    : [];

  const avg = {
    testDist: meanOf(perCh.map((x) => x.st.segment?.test_distance_km)),
    initial: meanOf(perCh.map((x) => x.st.initialAvg)),
    // 결측 의심(0 포함) 차량은 최신 회차에서 나온 지표를 전부 뺀다 — tread_avg 가 ~5 mm 낮게 들어가면
    // 현재·총마모·마모율(OLS)·예상 주행거리가 함께 왜곡되는데 배지는 세 장에만 붙어 나머지가 깨끗해 보였다 (2026-10-17 점검)
    current: meanOf(perCh.map((x) => (x.st.zeroSuspect ? null : x.st.latest?.tread_avg))),
    min: meanOf(perCh.map((x) => (x.st.zeroSuspect ? null : x.st.latest?.tread_min))),
    totalWear: meanOf(perCh.map((x) => (x.st.zeroSuspect ? null : x.st.totalWear))),
    rate: meanOf(perCh.map((x) => (x.st.zeroSuspect ? null : x.st.segment?.wear_rate_km_ols))),
    expKm: meanOf(perCh.map((x) => (x.st.zeroSuspect ? null : x.st.expectedKm))),
    cv: meanOf(perCh.map((x) => (x.st.zeroSuspect ? null : x.st.latest?.tread_cv))),
    sc: meanOf(perCh.map((x) => (x.st.zeroSuspect ? null : x.st.latestPattern?.sc_ratio))),
  };

  // ── «평균» 차트 3·4 — 선택 포지션을 차량끼리 비교
  const avgRateData = perCh
    .filter((x) => x.st.segment?.wear_rate_km_ols != null && !x.st.zeroSuspect)
    .map((x) => ({ label: `CH ${x.ch}`, rate: x.st.segment!.wear_rate_km_ols as number, isSel: false }))
    .sort((a, b) => a.rate - b.rate);
  const avgCvData = perCh
    .filter((x) => x.st.latest?.tread_cv != null && !x.st.zeroSuspect)
    .map((x) => ({ label: `CH ${x.ch}`, cv: x.st.latest!.tread_cv as number, isSel: false }))
    .sort((a, b) => a.cv - b.cv);
  // ── 차트 1. 트레드 추이 — 세그먼트마다 계열 키를 바꿔 선을 끊는다 (v2 §A-3 승계)
  const trendData = useMemo(() => {
    // km 축에서 KM 없는 회차를 0 km 에 찍으면 곡선이 뒤로 꺾인다 — 그 회차는 km 축 차트에서 뺀다 (날짜 축은 그대로)
    return measured.filter((r) => xAxis !== "km" || r.km != null).map((r) => {
      const max = r.tread_min != null && r.tread_range != null ? r.tread_min + r.tread_range : null;
      return {
        x: xAxis === "km" ? (r.km as number) : r.inspection_date.slice(5),
        date: r.inspection_date,
        seg_no: r.seg_no,
        // 계열 키에 seg_no 를 넣어야 교체 전후 타이어가 한 선으로 이어지지 않는다.
        [`avg#${r.seg_no}`]: r.tread_avg,
        // Area 는 [하한, 상한] 배열을 받으면 밴드로 그린다.
        [`band#${r.seg_no}`]: r.tread_min != null && max != null ? [r.tread_min, max] : null,
      } as Record<string, unknown>;
    });
  }, [measured, xAxis]);

  const segNos = useMemo(
    () => Array.from(new Set(measured.map((r) => r.seg_no))).sort((a, b) => a - b),
    [measured],
  );

  /** 세그먼트가 바뀌는 첫 지점의 x — 점선 구분선을 세운다. */
  const segBoundaries = useMemo(() => {
    const out: (number | string)[] = [];
    for (let i = 1; i < measured.length; i++) {
      if (measured[i].seg_no !== measured[i - 1].seg_no) {
        out.push(xAxis === "km" ? (measured[i].km ?? 0) : measured[i].inspection_date.slice(5));
      }
    }
    return out;
  }, [measured, xAxis]);

  // ── 차트 2. 폭 방향 누적 마모량 — 회차 슬라이더
  /** 선택 포지션의 원시 측정점을 (점검일 → 폭위치 → 평균깊이) 로 접는다.
   *  원주 4점(16점) 확장 시 같은 폭위치의 평균을 쓴다. OUTLIER 는 제외. */
  const widthByDate = useMemo(() => {
    const m = new Map<string, Map<WidthPos, number[]>>();
    for (const p of points.data ?? []) {
      if (p.pos !== selPos || p.flag === "OUTLIER") continue;
      if (!m.has(p.inspection_date)) m.set(p.inspection_date, new Map());
      const byW = m.get(p.inspection_date)!;
      if (!byW.has(p.width_pos)) byW.set(p.width_pos, []);
      byW.get(p.width_pos)!.push(p.depth_mm);
    }
    return m;
  }, [points.data, selPos]);

  /** 차트 2 가 쓸 회차 목록 — 현재 세그먼트 안에서만 고른다(교체 전후를 섞지 않는다). */
  const widthDates = useMemo(
    () => segRows.map((r) => r.inspection_date).filter((d) => widthByDate.has(d)),
    [segRows, widthByDate],
  );

  const roundMax = Math.max(0, widthDates.length - 1);
  const curRound = Math.min(roundIdx ?? roundMax, roundMax);

  const widthData = useMemo(() => {
    if (widthDates.length === 0) return [];
    const baseD = widthDates[0];
    const currD = widthDates[curRound];
    const avg = (d: string, w: WidthPos) => {
      const xs = widthByDate.get(d)?.get(w);
      return xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    return WIDTH_POS.map((w) => {
      const b = avg(baseD, w);
      const c = avg(currD, w);
      return {
        width: w,
        // 외측/내측이 아니라 현장 표기 그대로 Kiri/Kanan 으로 쓴다 (v3 §Q1 보류).
        label: t(w === "L" ? "pos.kiri" : w === "R" ? "pos.kanan" : "pos.center"),
        wear: b != null && c != null ? Math.round((b - c) * 100) / 100 : null,
        depth: c != null ? Math.round(c * 100) / 100 : null,
      };
    });
  }, [widthDates, curRound, widthByDate, t]);

  // ── 차트 3. 마모속도 비교 — 이 차량의 세그먼트를 낮은 순으로
  const rateData = useMemo(
    () =>
      (segments.data ?? [])
        .filter((s) => s.ch === selCh && s.wear_rate_km_ols != null)
        .map((s) => ({
          label: `${s.pos}${s.seg_no > 1 ? ` #${s.seg_no}` : ""}`,
          rate: s.wear_rate_km_ols as number,
          r2: s.r2,
          isSel: s.pos === selPos && s.seg_no === segNo,
        }))
        .sort((a, b) => a.rate - b.rate),
    [segments.data, selCh, selPos, segNo],
  );

  // ── 차트 4. CV 비교 + 플릿 중앙값 기준선
  const cvData = useMemo(
    () =>
      (segments.data ?? [])
        .filter((s) => s.ch === selCh && s.cv_avg != null)
        .map((s) => ({
          label: `${s.pos}${s.seg_no > 1 ? ` #${s.seg_no}` : ""}`,
          cv: s.cv_avg as number,
          isSel: s.pos === selPos && s.seg_no === segNo,
        }))
        .sort((a, b) => a.cv - b.cv),
    [segments.data, selCh, selPos, segNo],
  );

  /** 플릿 중앙값 — 뷰가 점검일별로 내주므로 최신 회차 값을 기준선으로 쓴다. */
  const fleetCvMedian = useMemo(() => {
    const rows = cvBench.data ?? [];
    return rows.length ? rows[rows.length - 1].cv_median : null;
  }, [cvBench.data]);

  // ── 차트 5. Shoulder vs Center + S/C 보조축
  const scData = useMemo(
    () =>
      (patterns.data ?? [])
        .filter((p) => p.pos === selPos && p.seg_no === segNo)
        .map((p) => ({
          date: p.inspection_date.slice(5),
          shoulder: p.shoulder_wear,
          center: p.center_wear,
          sc: p.sc_ratio,
        })),
    [patterns.data, selPos, segNo],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> {tx.loading}
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive py-8">
        <AlertTriangle className="w-4 h-4" /> {tx.loadFail}
      </div>
    );
  }

  /** 이 포지션에 원시값이 하나도 없는 경우 — 안내만 띄우고 차트는 전부 생략한다. */
  const legacyOnly = isAvg ? perCh.length === 0 : measured.length === 0;
  const hasAnyPoints = (series.data ?? []).some((r) => (r.point_count ?? 0) > 0);
  const rateRows = isAvg ? avgRateData : rateData;
  const cvRows = isAvg ? avgCvData : cvData;
  /** «평균» 칩의 KPI 각주 — 몇 대가 평균에 들어갔는지. */
  const nOf = (m: { n: number } | null) => (m ? tx.avgCount(m.n, chs.length) : undefined);

  return (
    <div className="space-y-4">
      {/* 선택 줄 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold">{tx.vehicle}</span>
          <div className="flex flex-wrap gap-1.5">
            {TMS_DATA.units.map((u) => (
              <button
                key={u.ch}
                onClick={() => { setSelCh(u.ch); setRoundIdx(null); }}
                aria-pressed={selCh === u.ch}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                  selCh === u.ch
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {u.ch}
              </button>
            ))}
            <button
              onClick={() => { setSelCh(AVG); setRoundIdx(null); }}
              aria-pressed={isAvg}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                isAvg
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {tx.avg}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground font-semibold">{tx.position}</span>
          <select
            value={selPos}
            onChange={(e) => { setSelPos(e.target.value); setRoundIdx(null); }}
            className="text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-foreground font-semibold font-mono"
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>

      {legacyOnly ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-bold text-foreground">{tx.legacyTitle}</p>
              {/* 과거 회차는 최소값만 있어 평균·CV·편마모를 만들 수 없다.
                  추정으로 채우면 마모율 통계가 오염되므로 빈칸으로 둔다 (v3 §3). */}
              <p className="mt-1 text-sm text-muted-foreground">{t("note.legacy")}</p>
              {isAvg && <p className="mt-2 text-sm text-muted-foreground">{tx.avgNone}</p>}
              {!isAvg && !hasAnyPoints && (
                <p className="mt-2 text-sm text-muted-foreground">{tx.noPoints}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI 카드 ─────────────────────────────────────── */}
          {isAvg ? (
            <>
              {/* 차량별 대표값의 산술 평균. R²·편마모 판정은 한 타이어의 값이라 평균하지 않는다. */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label={tx.cTestDist} value={fmtDistanceKm(avg.testDist?.mean)} note={nOf(avg.testDist)} />
                <Kpi
                  label={tx.cTread}
                  value={
                    avg.initial == null || avg.current == null
                      ? EMPTY
                      : `${fmtTreadAvg(avg.initial.mean, false)} → ${fmtTreadAvg(avg.current.mean)}`
                  }
                  note={`${t("tread.min")} ${fmtTread(avg.min?.mean)} · ${nOf(avg.current) ?? ""}`}
                />
                <Kpi label={tx.cTotalWear} value={fmtTreadAvg(avg.totalWear?.mean)} note={nOf(avg.totalWear)} />
                <Kpi label={tx.cWearRate} value={fmtKmPerMm(kmPerMmOf(avg.rate?.mean))} note={withWearRate(avg.rate?.mean, nOf(avg.rate))} />
                <Kpi label={tx.cExpKm} value={fmtDistanceKm(avg.expKm?.mean)} note={nOf(avg.expKm) ?? tx.expKmNone} />
                <Kpi label={tx.cCv} value={fmtPercent(avg.cv?.mean)} note={nOf(avg.cv)} />
                <Kpi label={tx.cSc} value={fmtRatio(avg.sc?.mean)} note={nOf(avg.sc)} />
                <Kpi label={tx.cDamage} value={tx.noDamage} />
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-4">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>{tx.avgNote(perCh.length)}</p>
                  <p>{tx.avgSelect}</p>
                </div>
              </div>
            </>
          ) : (<>
          {/* ── 결과 요약 (WO-TMS-2026-10-LIFE T-5) — 선택 줄 아래 · KPI 위 */}
          <ResultSummaryCard
            ch={selCh}
            serial={latest?.serial ?? segment?.serial ?? null}
            from={segRows[0]?.inspection_date ?? null}
            to={latest?.inspection_date ?? null}
            r2={segment?.r2 ?? null}
            cv={latest?.tread_cv ?? null}
            fleetCvMedian={fleetCvMedian}
            scRatio={latestPattern?.sc_ratio ?? null}
            pattern={latestPattern?.wear_pattern ?? null}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label={tx.cTestDist} value={fmtDistanceKm(segment?.test_distance_km)} />
            <Kpi
              label={tx.cTread}
              value={
                initialAvg == null || latest?.tread_avg == null
                  ? EMPTY
                  : `${fmtTreadAvg(initialAvg, false)} → ${fmtTreadAvg(latest.tread_avg)}`
              }
              note={`${t("tread.min")} ${fmtTread(latest?.tread_min)}`}
              missing={zeroSuspect ? tx.missingBadge : undefined}
              missingHint={tx.missingHint}
            />
            <Kpi label={tx.cTotalWear} value={fmtTreadAvg(totalWear)} />
            <Kpi
              label={tx.cWearRate}
              value={fmtKmPerMm(kmPerMmOf(segment?.wear_rate_km_ols))}
              note={withWearRate(segment?.wear_rate_km_ols, segment?.r2 == null ? undefined : `R² ${fmtR2(segment.r2)}`)}
              // R² < 0.80 은 대표값으로 쓰기 어렵다 — 값을 숨기지 않고 신뢰도만 알린다.
              warn={segment?.r2 != null && segment.r2 < 0.8 ? tx.r2Low : undefined}
            />
            <Kpi
              label={tx.cExpKm}
              value={fmtDistanceKm(expectedKm)}
              note={expectedKm == null ? tx.expKmNone : tx.expKmNote}
            />
            <Kpi
              label={tx.cCv}
              value={fmtPercent(latest?.tread_cv)}
              note={tx.cvNoCriteria}
              missing={zeroSuspect ? tx.missingBadge : undefined}
              missingHint={tx.missingHint}
            />
            <Kpi
              label={tx.cSc}
              value={fmtRatio(latestPattern?.sc_ratio)}
              badge={latestPattern ? t(`pattern.${latestPattern.wear_pattern}`) : undefined}
              missing={zeroSuspect ? tx.missingBadge : undefined}
              missingHint={tx.missingHint}
              note={
                latestPattern?.wear_pattern === "insufficient" ? tx.noPattern
                  : `${t("pos.shoulder")} ${fmtTreadAvg(latestPattern?.shoulder_wear, false)} / ${t("pos.center")} ${fmtTreadAvg(latestPattern?.center_wear, false)} mm`
              }
            />
            {/* O/I 비율(외측/내측) 카드는 노출하지 않는다 (v3 §Q1 · §D-1).
                KIRI/KANAN 이 차량 절대 좌우인지 타이어 외/내측인지 미확정이라
                우측 5본에서 부호가 뒤집힐 수 있다. 방향 규약이 확정되면 되살린다.
                뷰(v_wear_pattern)의 oi_ratio·lateral_pattern 컬럼은 그대로 둔다. */}
            <Kpi label={tx.cDamage} value={tx.noDamage} />
          </div>

          {segment == null && (
            <p className="text-xs text-muted-foreground">{tx.noSegment}</p>
          )}

          {/* ── 차트 1. 트레드 추이 (세그먼트별 분리) ────────── */}
          <ChartCard
            title={tx.ch1}
            right={
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["km", "date"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setXAxis(m)}
                    aria-pressed={xAxis === m}
                    className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      xAxis === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {m === "km" ? tx.xByKm : tx.xByDate}
                  </button>
                ))}
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trendData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                <XAxis
                  dataKey="x"
                  type={xAxis === "km" ? "number" : "category"}
                  domain={xAxis === "km" ? ["dataMin", "dataMax"] : undefined}
                  // km 축은 원값이 소수 1자리라 눈금에 「708667.8」로 찍혔다.
                  // 주행거리 눈금은 정수·천 단위 콤마가 규약이다 (CLAUDE.md 숫자 표기).
                  // 소수 1자리는 KPI「시험 주행거리」가 아니라 축이라 버려도 되는 자리다.
                  tickFormatter={xAxis === "km" ? (v: number) => fmtInt(v) : undefined}
                  tick={{ fontSize: 11, fill: HEX.ink }}
                  label={{ value: xAxis === "km" ? tx.axisKm : tx.axisDate, position: "insideBottomRight", offset: -2, fontSize: 10, fill: HEX.ink }}
                />
                <YAxis
                  domain={[0, NEW_TREAD]}
                  tick={{ fontSize: 11, fill: HEX.ink }}
                  label={{ value: tx.axisMm, angle: -90, position: "insideLeft", fontSize: 10, fill: HEX.ink }}
                />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.ink}`, borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(l: unknown) =>
                    xAxis === "km" ? fmtDistanceKm(l as number) : String(l)
                  }
                  formatter={(v: unknown, name: string) =>
                    Array.isArray(v)
                      ? [`${fmtTread(v[0] as number, false)} ~ ${fmtTread(v[1] as number)}`, name]
                      : [fmtTreadAvg(v as number), name]
                  }
                />
                {/* 밴드를 먼저, 평균선을 나중에 — 겹치는 순서가 z-order 다.
                    map 두 번으로 나눈 것은 의도적이다. 배열을 중첩해 반환하면
                    recharts 가 자식 컴포넌트를 못 찾는 경우가 있다. */}
                {segNos.map((n) => (
                  <Area
                    key={`band${n}`}
                    dataKey={`band#${n}`}
                    name={`${tx.segLabel} ${n} · min~max`}
                    stroke="none"
                    fill={HEX.band}
                    fillOpacity={1}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
                {segNos.map((n) => (
                  <Line
                    key={`avg${n}`}
                    type="monotone"
                    dataKey={`avg#${n}`}
                    name={`${tx.segLabel} ${n} · ${t("tread.avg")}`}
                    stroke={HEX.ink}
                    strokeWidth={2}
                    dot={{ r: 3, fill: HEX.ink }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
                {segBoundaries.map((x) => (
                  <ReferenceLine key={String(x)} x={x} stroke={HEX.divider} strokeDasharray="5 4" />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 넓은 화면에서는 3단. 폭 4점·세그먼트 비교 차트는 가로를 다 쓸 이유가
              없다 — 한 행에 셋을 놓아야 서로 비교가 된다. 추이 차트(1·5)는 x축이
              날짜/거리라 좁히면 눈금이 뭉개지므로 전폭을 유지한다. */}
          </>)}
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {/* ── 차트 2. 폭 방향 누적 마모량 ──────────────────── */}
            {!isAvg && widthDates.length > 0 && (
              <ChartCard
                title={tx.ch2}
                right={
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{tx.round}</span>
                    <input
                      type="range"
                      min={0}
                      max={roundMax}
                      value={curRound}
                      onChange={(e) => setRoundIdx(Number(e.target.value))}
                      aria-label={tx.round}
                      className="w-28 accent-primary"
                    />
                    <span className="font-mono text-[11px] text-foreground">
                      {widthDates[curRound]}
                    </span>
                  </label>
                }
              >
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={widthData} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                    <XAxis dataKey="width" tick={{ fontSize: 12, fill: HEX.ink }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: HEX.ink }}
                      label={{ value: tx.axisMm, angle: -90, position: "insideLeft", fontSize: 10, fill: HEX.ink }}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.ink}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => fmtTreadAvg(v as number)}
                      labelFormatter={(l: unknown) =>
                        `${l} · ${widthData.find((d) => d.width === l)?.label ?? ""}`
                      }
                    />
                    <Bar dataKey="wear" name={t("wear.total")} fill={HEX.ink} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
                  L = Kiri · C1/C2 = Tengah ({t("pos.center")}) · R = Kanan — {tx.dirPending}
                </p>
              </ChartCard>
            )}

            {/* ── 차트 3. 마모속도 비교 ────────────────────────── */}
            {rateRows.length > 0 && (
              <ChartCard title={tx.ch3}>
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={rateRows} layout="vertical" margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: HEX.ink }}
                      label={{ value: tx.axisRate, position: "insideBottomRight", offset: -2, fontSize: 10, fill: HEX.ink }}
                    />
                    <YAxis type="category" dataKey="label" width={84} tick={<CategoryTick />} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.ink}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => fmtWearRate(v as number)}
                    />
                    <Bar dataKey="rate" name={t("wear.rate")} isAnimationActive={false}>
                      {rateRows.map((d) => (
                        <Cell key={d.label} fill={d.isSel ? HEX.ink : HEX.divider} />
                      ))}
                    </Bar>
                    {isAvg && avg.rate && (
                      <ReferenceLine
                        x={avg.rate.mean}
                        stroke={HEX.ink}
                        strokeDasharray="5 4"
                        label={{ value: `${tx.avgLine} ${fmtWearRate(avg.rate.mean)}`, fontSize: 10, fill: HEX.ink, position: "top" }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* ── 차트 4. CV — 플릿 중앙값 기준선 ──────────────── */}
            {cvRows.length > 0 && (
              <ChartCard title={tx.ch4}>
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={cvRows} layout="vertical" margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: HEX.ink }}
                      label={{ value: tx.axisPct, position: "insideBottomRight", offset: -2, fontSize: 10, fill: HEX.ink }}
                    />
                    <YAxis type="category" dataKey="label" width={84} tick={<CategoryTick />} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.ink}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => fmtPercent(v as number)}
                    />
                    <Bar dataKey="cv" name={t("tread.cv")} isAnimationActive={false}>
                      {cvRows.map((d) => (
                        <Cell key={d.label} fill={d.isSel ? HEX.ink : HEX.divider} />
                      ))}
                    </Bar>
                    {isAvg && avg.cv && (
                      <ReferenceLine
                        x={avg.cv.mean}
                        stroke={HEX.ink}
                        strokeDasharray="5 4"
                        label={{ value: `${tx.avgLine} ${fmtPercent(avg.cv.mean)}`, fontSize: 10, fill: HEX.ink, position: "insideBottomRight" }}
                      />
                    )}
                    {/* 합격선이 아니라 플릿 내 위치 참고선이다 (설계서 §10). */}
                    {fleetCvMedian != null && (
                      <ReferenceLine
                        x={fleetCvMedian}
                        stroke={HEX.warn}
                        strokeDasharray="5 4"
                        label={{ value: `${tx.fleetMedian} ${fmtPercent(fleetCvMedian)}`, fontSize: 10, fill: HEX.warn, position: "top" }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-auto pt-2 text-[11px] text-muted-foreground">{tx.cvNoCriteria}</p>
              </ChartCard>
            )}
          </div>

          {/* ── 차트 5. Shoulder vs Center + S/C 보조축 ──────── */}
          {!isAvg && scData.length > 0 && (
            <ChartCard title={tx.ch5}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={scData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: HEX.ink }} />
                  <YAxis
                    yAxisId="mm"
                    tick={{ fontSize: 11, fill: HEX.ink }}
                    label={{ value: tx.axisMm, angle: -90, position: "insideLeft", fontSize: 10, fill: HEX.ink }}
                  />
                  <YAxis
                    yAxisId="sc"
                    orientation="right"
                    tick={{ fontSize: 11, fill: HEX.warn }}
                    label={{ value: "S/C", angle: 90, position: "insideRight", fontSize: 10, fill: HEX.warn }}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.ink}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v: unknown, name: string) =>
                      name === "S/C" ? fmtRatio(v as number) : fmtTreadAvg(v as number)
                    }
                  />
                  <Line yAxisId="mm" type="monotone" dataKey="shoulder" name={t("pos.shoulder")} stroke={HEX.ink} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  <Line yAxisId="mm" type="monotone" dataKey="center" name={t("pos.center")} stroke={HEX.divider} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  <Line yAxisId="sc" type="monotone" dataKey="sc" name="S/C" stroke={HEX.warn} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ── 용어 설명 ────────────────────────────────────
              CV·S/C 는 현장에서 처음 보는 지표다. 뜻을 모르면 KPI 카드의
              숫자가 "높으면 나쁜 것"인지조차 판단이 안 된다. 임계값은
              적지 않는다 — 정본은 tire_config 이고 관리자가 바꾼다. */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="space-y-3">
                <p className="text-xs font-bold text-primary uppercase tracking-widest">
                  {tx.glossary}
                </p>
                <div>
                  <p className="text-sm font-bold text-foreground">{tx.cCv}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{tx.gCv}</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{tx.cSc}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{tx.gSc}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** KPI 카드 1장. 4개 축을 가중합하지 않고 값 그대로 나열한다 (설계서 §16). */
/**
 * 마모속도 카드 보조 줄 — `0.271 mm/1,000km · R² 0.90`. 카드 본값은 km/mm(사용자 결정 2026-10-16)지만
 * 평균은 mm/1,000 km 로 낸 뒤 뒤집는다 — 역수의 평균은 0 근처에서 발산한다. 마모 없음(≤0)이면 본값은 «—», 이 줄에 원값이 남는다.
 */
function withWearRate(rate: number | null | undefined, rest?: string): string | undefined {
  return [rate == null ? null : fmtWearRate(rate), rest].filter(Boolean).join(" · ") || undefined;
}

function Kpi({
  label, value, note, badge, warn, missing, missingHint,
}: {
  label: string;
  value: string;
  note?: string;
  badge?: string;
  warn?: string;
  /** «결측 의심» 배지 문구 — 0 점이 섞인 회차 (WEAR-01) */
  missing?: string;
  missingHint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[11px] font-semibold text-muted-foreground">
        {label}
        {missing && (
          <span title={missingHint} className="ml-1.5 inline-block rounded-full border border-border bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
            {missing}
          </span>
        )}
      </p>
      <p className="mt-1 font-mono text-lg font-bold text-foreground tabular-nums">{value}</p>
      {badge && (
        <span className="mt-1 inline-block rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
          {badge}
        </span>
      )}
      {note && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p>}
      {warn && (
        <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug" style={{ color: HEX.warn }}>
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {warn}
        </p>
      )}
    </div>
  );
}

function ChartCard({
  title, right, children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  // h-full = 그리드 한 행에서 카드끼리 같은 높이. 안쪽을 세로 플렉스로 두어야
  // 각주의 mt-auto 가 바닥에 붙는다. 머리글 min-h 는 조작부(회차 슬라이더)가
  // 있는 카드와 없는 카드의 차트 시작선을 맞추기 위한 것이다.
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-bold text-primary uppercase tracking-widest">{title}</span>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
