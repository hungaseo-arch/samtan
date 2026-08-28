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
import { useQuery } from "@tanstack/react-query";
import { TMS_DATA, HEAD_MAP, NEW_TREAD } from "@/data/tmsData";
import { useLang } from "@/i18n";
import {
  EMPTY, fmtTread, fmtTreadAvg, fmtPercent, fmtRatio,
  fmtWearRate, fmtR2, fmtDistanceKm,
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

// 사내 디자인 지침 (v3 §E-2 색상표). recharts 는 SVG 속성이라 Tailwind 클래스를 못 받는다.
const HEX = {
  band: "#ECEFF1",     // min~max 밴드
  line: "#546E7A",     // 평균선·텍스트·경계선
  divider: "#90A4AE",  // 세그먼트 구분선 (점선)
  primary: "#E3F2FD",  // 주요 요소
  accent: "#E8F5E9",   // 강조·성공
  // 경고색은 팔레트에 없어 #546E7A 기반 저채도 주황을 쓴다 (v3 §E-2 각주).
  // 대비 검증: #B4611F on #F0F0F0 = 4.55:1 (WCAG AA 통과).
  warn: "#B4611F",
} as const;

const POSITIONS = Array.from({ length: 10 }, (_, i) => HEAD_MAP[i + 1]);

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
  <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill={HEX.line}>
    {String(payload?.value ?? "")}
  </text>
);

const TX = {
  ko: {
    vehicle: "차량(CH):",
    position: "포지션:",
    loading: "마모 통계를 불러오는 중…",
    loadFail: "마모 통계를 불러오지 못했습니다.",
    kpiTitle: "핵심 지표",
    cTestDist: "시험 주행거리",
    cTread: "초기 → 현재 트레드",
    cTotalWear: "누적 마모량",
    cWearRate: "마모속도",
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
    cvNoCriteria: "CV 합격 기준은 아직 정하지 않았습니다. 플릿 중앙값 대비 위치만 참고하십시오 (설계서 §10).",
    r2Low: "R² 가 0.80 미만입니다. 대표값 신뢰도가 낮습니다.",
    legacyTitle: "통계 산출 불가",
    noPoints: "이 차량에는 폭 4점 원시 측정값이 아직 없습니다. 점검 입력 화면에서 4점을 기록하면 이 화면이 채워집니다.",
  },
  id: {
    vehicle: "Unit (CH):",
    position: "Posisi:",
    loading: "Memuat statistik keausan…",
    loadFail: "Gagal memuat statistik keausan.",
    kpiTitle: "Indikator utama",
    cTestDist: "Jarak uji",
    cTread: "Tapak awal → sekarang",
    cTotalWear: "Total keausan",
    cWearRate: "Laju keausan",
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
    axisRate: "mm/1.000 km",
    axisPct: "%",
    round: "Sesi",
    fleetMedian: "Median armada",
    segLabel: "Segmen",
    xByKm: "Berdasar km",
    xByDate: "Berdasar tanggal",
    noSegment: "Belum ada nilai representatif segmen untuk posisi ini. Diperlukan minimal 3 sesi pengukuran dengan serial yang sama.",
    noPattern: "Penilaian keausan ditunda — keausan tengah belum mencapai batas minimum.",
    cvNoCriteria: "Kriteria lulus CV belum ditetapkan. Gunakan hanya sebagai posisi relatif terhadap median armada.",
    r2Low: "R² di bawah 0,80. Keandalan nilai representatif rendah.",
    legacyTitle: "Statistik tidak tersedia",
    noPoints: "Unit ini belum punya data mentah 4 titik. Isi 4 titik di layar input inspeksi untuk mengisi halaman ini.",
  },
  en: {
    vehicle: "Vehicle (CH):",
    position: "Position:",
    loading: "Loading wear statistics…",
    loadFail: "Failed to load wear statistics.",
    kpiTitle: "Key indicators",
    cTestDist: "Test distance",
    cTread: "Initial → current tread",
    cTotalWear: "Total wear",
    cWearRate: "Wear rate",
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
    cvNoCriteria: "No CV pass criteria have been set. Read it only as a position relative to the fleet median (design §10).",
    r2Low: "R² is below 0.80. The representative value has low confidence.",
    legacyTitle: "Statistics unavailable",
    noPoints: "This vehicle has no 4-point raw measurements yet. Record 4 points on the inspection input screen to populate this page.",
  },
} as const;

export default function WearAnalysisTab() {
  const { lang, t } = useLang();
  const tx = TX[lang];
  const [selCh, setSelCh] = useState(TMS_DATA.units[0]?.ch ?? "");
  const [selPos, setSelPos] = useState(POSITIONS[0]);
  const [xAxis, setXAxis] = useState<"km" | "date">("km");
  const [roundIdx, setRoundIdx] = useState(0);

  const series = useQuery<TreadSeriesRow[]>({
    queryKey: ["v_tread_series", selCh],
    queryFn: () => listTreadSeries(selCh),
    enabled: !!selCh,
  });
  const segments = useQuery<WearRateSegmentRow[]>({
    queryKey: ["v_wear_rate_segment"],
    queryFn: () => listWearRateSegments(),
  });
  const patterns = useQuery<WearPatternRow[]>({
    queryKey: ["v_wear_pattern", selCh],
    queryFn: () => listWearPattern(selCh),
    enabled: !!selCh,
  });
  const cvBench = useQuery<CvBenchmarkRow[]>({
    queryKey: ["v_cv_benchmark"],
    queryFn: listCvBenchmark,
  });
  const points = useQuery<TreadPointRow[]>({
    queryKey: ["tread_points", selCh],
    queryFn: () => listTreadPoints(selCh),
    enabled: !!selCh,
  });

  const loading =
    series.isLoading || segments.isLoading || patterns.isLoading ||
    cvBench.isLoading || points.isLoading;
  const failed =
    series.isError || segments.isError || patterns.isError ||
    cvBench.isError || points.isError;

  // ── 선택된 (ch, pos) 의 최신 세그먼트 ────────────────────────
  const posSeries = useMemo(
    () => (series.data ?? []).filter((r) => r.pos === selPos),
    [series.data, selPos],
  );

  /** 원시값을 가진 회차. 이게 비어 있으면 아래는 전부 그리지 않는다. */
  const measured = useMemo(
    () => posSeries.filter((r) => (r.point_count ?? 0) > 0 && r.tread_avg != null),
    [posSeries],
  );

  const segNo = measured.length ? measured[measured.length - 1].seg_no : null;
  const segRows = useMemo(
    () => (segNo == null ? [] : measured.filter((r) => r.seg_no === segNo)),
    [measured, segNo],
  );

  const segment = useMemo(
    () =>
      (segments.data ?? []).find(
        (s) => s.ch === selCh && s.pos === selPos && s.seg_no === segNo,
      ) ?? null,
    [segments.data, selCh, selPos, segNo],
  );

  const latestPattern = useMemo(() => {
    const rows = (patterns.data ?? []).filter(
      (p) => p.pos === selPos && p.seg_no === segNo,
    );
    return rows.length ? rows[rows.length - 1] : null;
  }, [patterns.data, selPos, segNo]);

  const latest = segRows.length ? segRows[segRows.length - 1] : null;
  const initialAvg = segment?.initial_avg ?? (segRows.length ? segRows[0].tread_avg : null);
  const totalWear =
    initialAvg != null && latest?.tread_avg != null
      ? Math.round((initialAvg - latest.tread_avg) * 100) / 100
      : null;

  // ── 차트 1. 트레드 추이 — 세그먼트마다 계열 키를 바꿔 선을 끊는다 (v2 §A-3 승계)
  const trendData = useMemo(() => {
    return measured.map((r) => {
      const max = r.tread_min != null && r.tread_range != null ? r.tread_min + r.tread_range : null;
      return {
        x: xAxis === "km" ? (r.km ?? 0) : r.inspection_date.slice(5),
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

  const widthData = useMemo(() => {
    if (widthDates.length === 0) return [];
    const idx = Math.min(roundIdx, widthDates.length - 1);
    const baseD = widthDates[0];
    const currD = widthDates[idx];
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
  }, [widthDates, roundIdx, widthByDate, t]);

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
  const legacyOnly = measured.length === 0;
  const hasAnyPoints = (series.data ?? []).some((r) => (r.point_count ?? 0) > 0);

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
                onClick={() => { setSelCh(u.ch); setRoundIdx(0); }}
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
          </div>
        </div>
        <label className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground font-semibold">{tx.position}</span>
          <select
            value={selPos}
            onChange={(e) => { setSelPos(e.target.value); setRoundIdx(0); }}
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
              {!hasAnyPoints && (
                <p className="mt-2 text-sm text-muted-foreground">{tx.noPoints}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI 카드 ─────────────────────────────────────── */}
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
            />
            <Kpi label={tx.cTotalWear} value={fmtTreadAvg(totalWear)} />
            <Kpi
              label={tx.cWearRate}
              value={fmtWearRate(segment?.wear_rate_km_ols)}
              note={segment?.r2 == null ? undefined : `R² ${fmtR2(segment.r2)}`}
              // R² < 0.80 은 대표값으로 쓰기 어렵다 — 값을 숨기지 않고 신뢰도만 알린다.
              warn={segment?.r2 != null && segment.r2 < 0.8 ? tx.r2Low : undefined}
            />
            <Kpi label={tx.cCv} value={fmtPercent(latest?.tread_cv)} note={tx.cvNoCriteria} />
            <Kpi
              label={tx.cSc}
              value={fmtRatio(latestPattern?.sc_ratio)}
              badge={latestPattern ? t(`pattern.${latestPattern.wear_pattern}`) : undefined}
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
                  tick={{ fontSize: 11, fill: HEX.line }}
                  label={{ value: xAxis === "km" ? tx.axisKm : tx.axisDate, position: "insideBottomRight", offset: -2, fontSize: 10, fill: HEX.line }}
                />
                <YAxis
                  domain={[0, NEW_TREAD]}
                  tick={{ fontSize: 11, fill: HEX.line }}
                  label={{ value: tx.axisMm, angle: -90, position: "insideLeft", fontSize: 10, fill: HEX.line }}
                />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.line}`, borderRadius: 8, fontSize: 12 }}
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
                    stroke={HEX.line}
                    strokeWidth={2}
                    dot={{ r: 3, fill: HEX.line }}
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

          {/* 넓은 화면에서는 2단. 폭 4점·세그먼트 비교 차트는 가로를 다 쓸 이유가
              없다 — 한 행에 둘씩 놓아야 서로 비교가 된다. 추이 차트(1·5)는 x축이
              날짜/거리라 좁히면 눈금이 뭉개지므로 전폭을 유지한다. */}
          <div className="grid gap-4 xl:grid-cols-2">
            {/* ── 차트 2. 폭 방향 누적 마모량 ──────────────────── */}
            {widthDates.length > 0 && (
              <ChartCard
                title={tx.ch2}
                right={
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{tx.round}</span>
                    <input
                      type="range"
                      min={0}
                      max={widthDates.length - 1}
                      value={Math.min(roundIdx, widthDates.length - 1)}
                      onChange={(e) => setRoundIdx(Number(e.target.value))}
                      aria-label={tx.round}
                      className="w-36 accent-primary"
                    />
                    <span className="font-mono text-[11px] text-foreground">
                      {widthDates[Math.min(roundIdx, widthDates.length - 1)]}
                    </span>
                  </label>
                }
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={widthData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                    <XAxis dataKey="width" tick={{ fontSize: 12, fill: HEX.line }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: HEX.line }}
                      label={{ value: tx.axisMm, angle: -90, position: "insideLeft", fontSize: 10, fill: HEX.line }}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.line}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => fmtTreadAvg(v as number)}
                      labelFormatter={(l: unknown) =>
                        `${l} · ${widthData.find((d) => d.width === l)?.label ?? ""}`
                      }
                    />
                    <Bar dataKey="wear" name={t("wear.total")} fill={HEX.line} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  L = Kiri · C1/C2 = Tengah ({t("pos.center")}) · R = Kanan — {tx.dirPending}
                </p>
              </ChartCard>
            )}

            {/* ── 차트 3. 마모속도 비교 ────────────────────────── */}
            {rateData.length > 0 && (
              <ChartCard title={tx.ch3}>
                <ResponsiveContainer width="100%" height={Math.max(200, rateData.length * 28)}>
                  <BarChart data={rateData} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: HEX.line }}
                      label={{ value: tx.axisRate, position: "insideBottomRight", offset: -2, fontSize: 10, fill: HEX.line }}
                    />
                    <YAxis type="category" dataKey="label" width={84} tick={<CategoryTick />} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.line}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => fmtWearRate(v as number)}
                    />
                    <Bar dataKey="rate" name={t("wear.rate")} isAnimationActive={false}>
                      {rateData.map((d) => (
                        <Cell key={d.label} fill={d.isSel ? HEX.line : HEX.divider} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* ── 차트 4. CV — 플릿 중앙값 기준선 ──────────────── */}
            {cvData.length > 0 && (
              <ChartCard title={tx.ch4}>
                <ResponsiveContainer width="100%" height={Math.max(200, cvData.length * 28)}>
                  <BarChart data={cvData} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: HEX.line }}
                      label={{ value: tx.axisPct, position: "insideBottomRight", offset: -2, fontSize: 10, fill: HEX.line }}
                    />
                    <YAxis type="category" dataKey="label" width={84} tick={<CategoryTick />} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.line}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => fmtPercent(v as number)}
                    />
                    <Bar dataKey="cv" name={t("tread.cv")} isAnimationActive={false}>
                      {cvData.map((d) => (
                        <Cell key={d.label} fill={d.isSel ? HEX.line : HEX.divider} />
                      ))}
                    </Bar>
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
                <p className="mt-2 text-[11px] text-muted-foreground">{tx.cvNoCriteria}</p>
              </ChartCard>
            )}
          </div>

          {/* ── 차트 5. Shoulder vs Center + S/C 보조축 ──────── */}
          {scData.length > 0 && (
            <ChartCard title={tx.ch5}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={scData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: HEX.line }} />
                  <YAxis
                    yAxisId="mm"
                    tick={{ fontSize: 11, fill: HEX.line }}
                    label={{ value: tx.axisMm, angle: -90, position: "insideLeft", fontSize: 10, fill: HEX.line }}
                  />
                  <YAxis
                    yAxisId="sc"
                    orientation="right"
                    tick={{ fontSize: 11, fill: HEX.warn }}
                    label={{ value: "S/C", angle: 90, position: "insideRight", fontSize: 10, fill: HEX.warn }}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: `1px solid ${HEX.line}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v: unknown, name: string) =>
                      name === "S/C" ? fmtRatio(v as number) : fmtTreadAvg(v as number)
                    }
                  />
                  <Line yAxisId="mm" type="monotone" dataKey="shoulder" name={t("pos.shoulder")} stroke={HEX.line} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  <Line yAxisId="mm" type="monotone" dataKey="center" name={t("pos.center")} stroke={HEX.divider} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  <Line yAxisId="sc" type="monotone" dataKey="sc" name="S/C" stroke={HEX.warn} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}

/** KPI 카드 1장. 4개 축을 가중합하지 않고 값 그대로 나열한다 (설계서 §16). */
function Kpi({
  label, value, note, badge, warn,
}: {
  label: string;
  value: string;
  note?: string;
  badge?: string;
  warn?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
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
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-bold text-primary uppercase tracking-widest">{title}</span>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </div>
  );
}
