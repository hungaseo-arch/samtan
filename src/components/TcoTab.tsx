// @section: tco-tab
// TCO(총소유비용) 화면 — WO-TMS-2026-09-TCO T-9.
//
// 이 화면의 규칙은 하나다. **없는 숫자는 없다고 쓴다.**
// cost_params.unit_price 가 확정되기 전에는 CPK 3종이 전부 null 로 온다.
// 0 으로 채우면 `IDR 0.00/km` 가 찍혀 "원가가 들지 않는다"로 읽히고, 그 화면이
// 그대로 보고서로 나간다. 그래서 금액 자리에는 무엇이 없어서 못 냈는지를 쓴다.
//
// 계산은 전부 DB 뷰(v_tco_unit · v_tco_fleet · v_removal_analysis · v_tire_ledger_total)가
// 한다. 유일한 예외는 재생 시나리오 패널로, 이것은 "만약" 계산이라 DB 에 넣을 수 없다.
// 대신 입력 파라미터가 하나라도 비면 패널 전체를 비활성으로 둔다.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/i18n";
import {
  EMPTY, fmtCpk, fmtCurrencyDoc, fmtDistanceKm, fmtInt, fmtPercent,
  fmtTread, fmtWearRate, fmtDateWIB,
} from "@/lib/format";
import {
  listTcoUnits, listTcoFleet, listRemovalAnalysis, listTireLedgerTotals,
  getCurrentCostParams,
  type TcoUnitRow, type TcoFleetRow, type RemovalAnalysisRow,
  type TireLedgerTotalRow, type CostParamsRow, type TcoCategory,
} from "@/api/tco";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { AlertTriangle, Info, Loader2, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { HEX } from "@/lib/chartColors";

/** 사유별 분포의 기본 필터. 제품 책임분이 이 화면의 첫 질문이다 (지시서 T-9 3번). */
const DEFAULT_CATEGORY: TcoCategory = "PRODUCT";

const CATEGORIES: TcoCategory[] = [
  "PRODUCT", "OPERATION", "MAINTENANCE", "SURFACE", "MANUFACTURE",
];

/** 탈착 기준 트레드 후보 (지시서 T-9 5번). 5.0 mm 는 발주 트리거이지 폐기선이 아니다. */
const REMOVAL_THRESHOLDS = [3.0, 5.0] as const;

const TX = {
  ko: {
    loading: "TCO 지표를 불러오는 중…",
    loadFail: "TCO 지표를 불러오지 못했습니다.",

    cpkTitle: "주행거리당 원가 (CPK)",
    cpkG: "CPK-G · 구매가 기준",
    cpkGSub: "구매가 ÷ 누적 주행거리",
    cpkT: "CPK-T · 총소유비용 기준",
    cpkTSub: "구매가 + 부대비용 + 다운타임 ÷ 누적 주행거리",
    cpkL: "CPK-L · 생애주기 기준",
    cpkLSub: "총소유비용 − 회수가치 ÷ 누적 주행거리",
    priceUnset: "단가 미확정",
    priceUnsetHelp: "본당 단가가 확정되어야 산출됩니다. 보고서 9장 ⑦ 확인 요청 중입니다.",
    missingLabel: "대기 중인 파라미터",
    basisSample: "표본",
    basisTires: "본",
    basisKm: "누적 주행거리",
    basisCosted: "산출 가능",
    kmIncomplete: "구간 결손",
    kmIncompleteHelp:
      "장착일 이전 주행거리를 모르는 구간이 있어 누적 주행거리가 하한값입니다. 분모가 작아 CPK 는 실제보다 높게 나옵니다.",

    costTitle: "비용 구성",
    costSub: "구매가가 총비용에서 차지하는 비중이 이 화면의 요지입니다.",
    costWaiting: "원가 파라미터가 입력되면 구성비가 표시됩니다.",
    cPurchase: "구매가",
    cExtra: "부대비용",
    cDowntime: "다운타임",
    cRecovery: "회수가치",

    reasonTitle: "탈착 사유별 수명",
    reasonSub: "사유 분류는 damage_codes.tco_category 를 따릅니다.",
    reasonNone: "탈착 사유가 입력된 교체 이력이 없습니다.",
    reasonUnlogged: "사유 미입력",
    colCount: "본수",
    colAvgKm: "평균 수명",
    colAvgTread: "평균 탈착 트레드",
    colWearRate: "평균 실현 마모율",

    ledgerTitle: "개체 원장",
    ledgerSub: "시리얼 단위 누적 주행거리. 여러 차량을 돈 타이어는 굵게 표시됩니다.",
    colSerial: "시리얼",
    colMounts: "장착",
    colVehicles: "차량",
    colFirst: "최초 장착",
    colLast: "최종 기록",
    colCumKm: "누적 주행거리",
    colStatus: "상태",
    stInService: "사용 중",
    stRemoved: "탈착",
    flagLowerBound: "하한값",

    retreadTitle: "재생 시나리오",
    retreadSub: "탈착 기준과 재생 여부를 바꿨을 때의 CPK 를 비교합니다.",
    retreadWaiting: "재생 파라미터가 확정되면 활성화됩니다.",
    retreadOffTitle: "재생타이어를 쓰지 않는 정책입니다.",
    retreadOffBody: "원가 설정에서 재생 시나리오가 꺼져 있습니다 (cost_params.retread_allowed). 재생을 운용하는 곳에서 켜면 그대로 동작합니다.",
    thLabel: "탈착 기준",
    retreadOn: "재생 1회 반영",
    retreadOff: "신품만",
    scExpectedKm: "예상 수명",
    scTotalCost: "총비용",
    scCpk: "CPK",
    scDelta: "기준 대비",
  },
  id: {
    loading: "Memuat indikator TCO…",
    loadFail: "Gagal memuat indikator TCO.",

    cpkTitle: "Biaya per Kilometer (CPK)",
    cpkG: "CPK-G · dasar harga beli",
    cpkGSub: "Harga beli ÷ jarak tempuh kumulatif",
    cpkT: "CPK-T · dasar biaya kepemilikan total",
    cpkTSub: "Harga beli + biaya tambahan + waktu henti ÷ jarak tempuh kumulatif",
    cpkL: "CPK-L · dasar siklus hidup",
    cpkLSub: "Biaya kepemilikan total − nilai pemulihan ÷ jarak tempuh kumulatif",
    priceUnset: "Harga satuan belum pasti",
    priceUnsetHelp: "Perlu harga per ban dulu. Sedang dikonfirmasi (laporan bab 9 ⑦).",
    missingLabel: "Parameter yang ditunggu",
    basisSample: "Sampel",
    basisTires: "ban",
    basisKm: "Jarak tempuh kumulatif",
    basisCosted: "Dapat dihitung",
    kmIncomplete: "Segmen tidak lengkap",
    kmIncompleteHelp:
      "Ada segmen yang jarak tempuh sebelum pemasangan tidak diketahui, jadi jarak kumulatif adalah batas bawah. Penyebut mengecil sehingga CPK tampak lebih tinggi dari sebenarnya.",

    costTitle: "Komposisi biaya",
    costSub: "Intinya: berapa besar porsi harga beli terhadap total biaya.",
    costWaiting: "Komposisi tampil setelah parameter biaya diisi.",
    cPurchase: "Harga beli",
    cExtra: "Biaya tambahan",
    cDowntime: "Waktu henti",
    cRecovery: "Nilai pemulihan",

    reasonTitle: "Umur menurut alasan pelepasan",
    reasonSub: "Klasifikasi mengikuti damage_codes.tco_category.",
    reasonNone: "Belum ada riwayat penggantian dengan alasan pelepasan.",
    reasonUnlogged: "Alasan belum diisi",
    colCount: "Jumlah",
    colAvgKm: "Umur rata-rata",
    colAvgTread: "Tapak saat dilepas (rata-rata)",
    colWearRate: "Laju keausan nyata (rata-rata)",

    ledgerTitle: "Buku besar ban",
    ledgerSub: "Jarak kumulatif per nomor seri. Ban yang berpindah unit dicetak tebal.",
    colSerial: "Nomor seri",
    colMounts: "Pasang",
    colVehicles: "Unit",
    colFirst: "Pasang pertama",
    colLast: "Catatan terakhir",
    colCumKm: "Jarak kumulatif",
    colStatus: "Status",
    stInService: "Terpakai",
    stRemoved: "Dilepas",
    flagLowerBound: "batas bawah",

    retreadTitle: "Skenario vulkanisir",
    retreadSub: "Membandingkan CPK bila batas pelepasan dan vulkanisir diubah.",
    retreadWaiting: "Aktif setelah parameter vulkanisir ditetapkan.",
    retreadOffTitle: "Kebijakan: tidak memakai ban vulkanisir.",
    retreadOffBody: "Skenario vulkanisir dimatikan di pengaturan biaya (cost_params.retread_allowed). Aktifkan bila unit Anda memakai ban vulkanisir.",
    thLabel: "Batas pelepasan",
    retreadOn: "Dengan 1× vulkanisir",
    retreadOff: "Ban baru saja",
    scExpectedKm: "Perkiraan umur",
    scTotalCost: "Total biaya",
    scCpk: "CPK",
    scDelta: "vs. dasar",
  },
  en: {
    loading: "Loading TCO indicators…",
    loadFail: "Could not load TCO indicators.",

    cpkTitle: "Cost per Kilometre (CPK)",
    cpkG: "CPK-G · purchase price basis",
    cpkGSub: "Purchase price ÷ cumulative distance",
    cpkT: "CPK-T · total cost of ownership basis",
    cpkTSub: "Purchase + ancillary + downtime ÷ cumulative distance",
    cpkL: "CPK-L · lifecycle basis",
    cpkLSub: "Total ownership cost − recovery value ÷ cumulative distance",
    priceUnset: "Unit price not set",
    priceUnsetHelp: "Requires the per-tire price. Confirmation pending (report ch. 9 ⑦).",
    missingLabel: "Parameters awaited",
    basisSample: "Sample",
    basisTires: "tires",
    basisKm: "Cumulative distance",
    basisCosted: "Costable",
    kmIncomplete: "Incomplete segments",
    kmIncompleteHelp:
      "Some segments have unknown pre-mount distance, so cumulative distance is a lower bound. The smaller denominator makes CPK read higher than it is.",

    costTitle: "Cost composition",
    costSub: "The point of this view is what share of total cost the purchase price is.",
    costWaiting: "Composition appears once cost parameters are entered.",
    cPurchase: "Purchase",
    cExtra: "Ancillary",
    cDowntime: "Downtime",
    cRecovery: "Recovery",

    reasonTitle: "Service life by removal reason",
    reasonSub: "Classification follows damage_codes.tco_category.",
    reasonNone: "No replacement records carry a removal reason yet.",
    reasonUnlogged: "Reason not entered",
    colCount: "Count",
    colAvgKm: "Mean life",
    colAvgTread: "Mean removal tread",
    colWearRate: "Mean realised wear rate",

    ledgerTitle: "Tire ledger",
    ledgerSub: "Cumulative distance per serial. Tires that moved between vehicles are bold.",
    colSerial: "Serial",
    colMounts: "Mounts",
    colVehicles: "Vehicles",
    colFirst: "First mounted",
    colLast: "Last record",
    colCumKm: "Cumulative distance",
    colStatus: "Status",
    stInService: "In service",
    stRemoved: "Removed",
    flagLowerBound: "lower bound",

    retreadTitle: "Retread scenario",
    retreadSub: "Compares CPK across removal thresholds and retreading.",
    retreadWaiting: "Enabled once retread parameters are set.",
    retreadOffTitle: "Retreading is not used by policy.",
    retreadOffBody: "The retread scenario is switched off in the cost settings (cost_params.retread_allowed). Turn it on where retreads are in use and the panel works as-is.",
    thLabel: "Removal threshold",
    retreadOn: "With one retread",
    retreadOff: "New tire only",
    scExpectedKm: "Expected life",
    scTotalCost: "Total cost",
    scCpk: "CPK",
    scDelta: "vs. baseline",
  },
} as const;

/** 사유 분류의 표시명. 코드 자체는 언어와 무관하게 그대로 둔다. */
const CAT_LABEL: Record<"ko" | "id" | "en", Record<TcoCategory, string>> = {
  ko: {
    PRODUCT: "제품", OPERATION: "운전·취급", MAINTENANCE: "정비",
    SURFACE: "노면", MANUFACTURE: "제조 결함",
  },
  id: {
    PRODUCT: "Produk", OPERATION: "Operasi", MAINTENANCE: "Perawatan",
    SURFACE: "Permukaan jalan", MANUFACTURE: "Cacat produksi",
  },
  en: {
    PRODUCT: "Product", OPERATION: "Operation", MAINTENANCE: "Maintenance",
    SURFACE: "Surface", MANUFACTURE: "Manufacturing",
  },
};

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

export default function TcoTab() {
  const { lang } = useLang();
  const tx = TX[lang];
  const catLabel = CAT_LABEL[lang];
  const [category, setCategory] = useState<TcoCategory | "UNLOGGED">(DEFAULT_CATEGORY);
  const [threshold, setThreshold] = useState<number>(5.0);
  const [withRetread, setWithRetread] = useState(true);

  const units = useQuery<TcoUnitRow[]>({ queryKey: ["v_tco_unit"], queryFn: listTcoUnits });
  const fleet = useQuery<TcoFleetRow[]>({ queryKey: ["v_tco_fleet"], queryFn: listTcoFleet });
  const removals = useQuery<RemovalAnalysisRow[]>({
    queryKey: ["v_removal_analysis"], queryFn: listRemovalAnalysis,
  });
  const ledger = useQuery<TireLedgerTotalRow[]>({
    queryKey: ["v_tire_ledger_total"], queryFn: listTireLedgerTotals,
  });
  const params = useQuery<CostParamsRow | null>({
    queryKey: ["cost_params", "current"], queryFn: getCurrentCostParams,
  });

  const loading =
    units.isLoading || fleet.isLoading || removals.isLoading ||
    ledger.isLoading || params.isLoading;
  const failed =
    units.isError || fleet.isError || removals.isError ||
    ledger.isError || params.isError;

  /** 플릿 전체(scope='ALL') 1행. grouping sets 의 () 묶음이 여기로 온다. */
  const all = useMemo(
    () => (fleet.data ?? []).find((r) => r.scope === "ALL") ?? null,
    [fleet.data],
  );

  /** 아직 못 채운 파라미터의 합집합. 개체마다 같은 것이 빠지므로 중복을 없앤다. */
  const missing = useMemo(() => {
    const s = new Set<string>();
    for (const u of units.data ?? []) for (const m of u.params_missing ?? []) s.add(m);
    return [...s].sort();
  }, [units.data]);

  /** 비용 구성 — 차량별 합계. 전 항목 null 이면 빈 배열이라 차트를 그리지 않는다. */
  const costByCh = useMemo(() => {
    const acc = new Map<string, { ch: string; purchase: number; extra: number; downtime: number; recovery: number }>();
    for (const u of units.data ?? []) {
      if (!u.ch) continue;
      const purchase = u.unit_price ?? 0;
      const extra = (u.freight_per_tire ?? 0) + (u.mount_cost ?? 0)
        + (u.repair_cost ?? 0) + (u.pressure_cost ?? 0);
      const downtime = u.downtime_cost ?? 0;
      const recovery = u.recovery ?? 0;
      if (purchase + extra + downtime + recovery === 0) continue;
      const cur = acc.get(u.ch) ?? { ch: u.ch, purchase: 0, extra: 0, downtime: 0, recovery: 0 };
      cur.purchase += purchase; cur.extra += extra;
      cur.downtime += downtime; cur.recovery += recovery;
      acc.set(u.ch, cur);
    }
    // 회수가치는 총비용을 깎으므로 음수 방향으로 쌓는다.
    return [...acc.values()]
      .sort((a, b) => a.ch.localeCompare(b.ch))
      .map((r) => ({ ...r, recovery: -r.recovery }));
  }, [units.data]);

  /** 사유 분류별 집계. 사유 미입력분(UNLOGGED)도 한 줄로 남긴다 — 안 보이면 안 고친다. */
  const byCategory = useMemo(() => {
    const rows = removals.data ?? [];
    const bucket = (r: RemovalAnalysisRow): TcoCategory | "UNLOGGED" =>
      r.tco_category ?? "UNLOGGED";
    const keys: (TcoCategory | "UNLOGGED")[] = [...CATEGORIES, "UNLOGGED"];
    return keys.map((k) => {
      const rs = rows.filter((r) => bucket(r) === k);
      const num = (f: (r: RemovalAnalysisRow) => number | null) =>
        rs.map(f).filter((v): v is number => v != null);
      return {
        key: k,
        label: k === "UNLOGGED" ? tx.reasonUnlogged : catLabel[k],
        count: rs.length,
        avgKm: mean(num((r) => r.cumulative_km)),
        avgTread: mean(num((r) => r.removal_tread_min)),
        avgWear: mean(num((r) => r.realized_wear_rate)),
      };
    });
  }, [removals.data, catLabel, tx.reasonUnlogged]);

  const selectedCat = byCategory.find((c) => c.key === category) ?? null;
  const hasAnyReason = byCategory.some((c) => c.key !== "UNLOGGED" && c.count > 0);

  /**
   * 재생 시나리오. DB 에 넣을 수 없는 "만약" 계산이라 여기서 한다.
   * 필요한 것: 원가 4종 + 재생 2종 + 마모율. 하나라도 없으면 패널 전체가 비활성이다.
   * 마모율은 실제 탈착 실적(realized_wear_rate)의 평균만 쓴다 — 추정치를 섞지 않는다.
   */
  const wearRate = useMemo(
    () => mean((removals.data ?? [])
      .map((r) => r.realized_wear_rate)
      .filter((v): v is number => v != null && v > 0)),
    [removals.data],
  );

  /**
   * 재생 사용 여부는 고객사 정책이라 원가 설정(cost_params)이 정본이다.
   * 현재 고객사(PT. Trasindo Murni Perkasa)는 재생을 쓰지 않아 false 지만, 기능은
   * 지운 것이 아니라 꺼둔 것이다 — 켜면 아래 시나리오 계산이 그대로 동작한다.
   * 컬럼이 없는 환경에서는 undefined 이므로 `=== true` 로만 켠다.
   */
  const retreadAllowed = params.data?.retread_allowed === true;

  const retreadMissing = useMemo(() => {
    const p = params.data;
    const out: string[] = [];
    if (!p) return ["cost_params"];
    if (p.unit_price == null) out.push("unit_price");
    if (p.freight_per_tire == null) out.push("freight_per_tire");
    if (p.mount_cost == null) out.push("mount_cost");
    if (p.casing_value == null) out.push("casing_value");
    if (p.retread_cost == null) out.push("retread_cost");
    if (p.retread_life_km == null) out.push("retread_life_km");
    if (wearRate == null) out.push("realized_wear_rate");
    return out;
  }, [params.data, wearRate]);

  const scenario = useMemo(() => {
    const p = params.data;
    if (retreadMissing.length > 0 || !p || wearRate == null) return null;
    const newTread = (removals.data ?? []).find((r) => r.new_tread != null)?.new_tread ?? null;
    if (newTread == null) return null;

    // 마모율은 mm/1,000km 이므로 1 mm 당 주행거리는 1,000 ÷ 마모율.
    const kmPerMm = 1000 / wearRate;
    const build = (th: number, retread: boolean) => {
      const newLifeKm = Math.max(0, newTread - th) * kmPerMm;
      const baseCost = p.unit_price! + p.freight_per_tire! + p.mount_cost!;
      if (!retread) return { km: newLifeKm, cost: baseCost, cpk: newLifeKm > 0 ? baseCost / newLifeKm : null };
      // 재생 시 케이싱은 팔지 않고 되쓰므로 회수가치가 아니라 재생비가 든다.
      const km = newLifeKm + p.retread_life_km!;
      const cost = baseCost + p.retread_cost! + p.mount_cost!;
      return { km, cost, cpk: km > 0 ? cost / km : null };
    };
    const base = build(threshold, false);
    const cur = build(threshold, withRetread);
    return { base, cur, kmPerMm, newTread };
  }, [params.data, retreadMissing, wearRate, removals.data, threshold, withRetread]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {tx.loading}
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
        <p className="text-sm text-destructive">{tx.loadFail}</p>
      </div>
    );
  }

  const ledgerRows = ledger.data ?? [];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* ── 1. CPK 3종 ───────────────────────────────────────── */}
      <motion.section variants={staggerItem}>
        <SectionHead title={tx.cpkTitle} sub={
          `${tx.basisSample} ${fmtInt(all?.sample_size ?? 0)} ${tx.basisTires} · ` +
          `${tx.basisKm} ${fmtDistanceKm(all?.total_km ?? null)} · ` +
          `${tx.basisCosted} ${fmtInt(all?.costed_count ?? 0)}`
        } />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CpkCard label={tx.cpkG} sub={tx.cpkGSub} value={all?.cpk_gross_avg ?? null} tx={tx} missing={missing} />
          <CpkCard label={tx.cpkT} sub={tx.cpkTSub} value={all?.cpk_tco_avg ?? null} tx={tx} missing={missing} />
          <CpkCard label={tx.cpkL} sub={tx.cpkLSub} value={all?.cpk_lifecycle_avg ?? null} tx={tx} missing={missing} />
        </div>
        {(all?.km_incomplete_count ?? 0) > 0 && (
          <Note tone="warn">
            <span className="font-bold">{tx.kmIncomplete} {fmtInt(all!.km_incomplete_count)} / {fmtInt(all!.sample_size)}</span>
            {" — "}{tx.kmIncompleteHelp}
          </Note>
        )}
      </motion.section>

      {/* ── 2. 비용 구성 ─────────────────────────────────────── */}
      <motion.section variants={staggerItem}>
        <SectionHead title={tx.costTitle} sub={tx.costSub} />
        {costByCh.length === 0 ? (
          <Note tone="info">{tx.costWaiting}</Note>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={costByCh} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke={HEX.band} />
                <XAxis dataKey="ch" tick={{ fontSize: 11, fill: HEX.ink }} />
                <YAxis tick={{ fontSize: 11, fill: HEX.ink }} width={80}
                  tickFormatter={(v: number) => fmtCurrencyDoc(v).split(" (")[0]} />
                <Tooltip formatter={(v: number, n) => [fmtCurrencyDoc(v), String(n)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="purchase" stackId="c" name={tx.cPurchase} fill={HEX.blue} stroke={HEX.ink} />
                <Bar dataKey="extra" stackId="c" name={tx.cExtra} fill={HEX.band} stroke={HEX.ink} />
                <Bar dataKey="downtime" stackId="c" name={tx.cDowntime} fill={HEX.ink} />
                <Bar dataKey="recovery" stackId="c" name={tx.cRecovery} fill={HEX.sage} stroke={HEX.ink} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.section>

      {/* ── 3. 사유별 수명 ───────────────────────────────────── */}
      <motion.section variants={staggerItem}>
        <SectionHead title={tx.reasonTitle} sub={tx.reasonSub} />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {byCategory.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                category === c.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {c.label} <span className="font-mono">{c.count}</span>
            </button>
          ))}
        </div>
        {!hasAnyReason && <Note tone="warn">{tx.reasonNone}</Note>}
        {selectedCat && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label={tx.colCount} value={`${fmtInt(selectedCat.count)} ${tx.basisTires}`} />
            <Kpi label={tx.colAvgKm} value={fmtDistanceKm(selectedCat.avgKm)} />
            <Kpi label={tx.colAvgTread} value={fmtTread(selectedCat.avgTread)} />
            <Kpi label={tx.colWearRate} value={fmtWearRate(selectedCat.avgWear)} />
          </div>
        )}
      </motion.section>

      {/* ── 4. 개체 원장 ─────────────────────────────────────── */}
      <motion.section variants={staggerItem}>
        <SectionHead title={tx.ledgerTitle} sub={tx.ledgerSub} />
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full min-w-200 text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th scope="col" className={HEAD_CLS}>{tx.colSerial}</th>
                <th scope="col" className={`${HEAD_CLS} text-right`}>{tx.colMounts}</th>
                <th scope="col" className={`${HEAD_CLS} text-right`}>{tx.colVehicles}</th>
                <th scope="col" className={HEAD_CLS}>{tx.colFirst}</th>
                <th scope="col" className={HEAD_CLS}>{tx.colLast}</th>
                <th scope="col" className={`${HEAD_CLS} text-right`}>{tx.colCumKm}</th>
                <th scope="col" className={HEAD_CLS}>{tx.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((r) => {
                const travelled = r.vehicle_count > 1;
                return (
                  <tr key={r.serial} className="border-b border-border/40 hover:bg-muted/20">
                    <td className={`px-3 py-2 font-mono text-xs ${travelled ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                      {r.serial}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{fmtInt(r.mount_count)}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs ${travelled ? "font-bold" : ""}`}>
                      {fmtInt(r.vehicle_count)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{fmtDateWIB(r.first_mounted_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{fmtDateWIB(r.last_date)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtDistanceKm(r.cumulative_km)}
                      {/* 구간이 끊긴 개체는 누적값이 하한값이다. 숫자만 보면 알 수 없어 표기한다. */}
                      {r.invalid_segments > 0 && (
                        <span className="ml-1 text-[10px]" style={{ color: HEX.warn }}>
                          ({tx.flagLowerBound})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.in_service ? tx.stInService : tx.stRemoved}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* ── 5. 재생 시나리오 ─────────────────────────────────── */}
      <motion.section variants={staggerItem}>
        <SectionHead title={tx.retreadTitle} sub={tx.retreadSub} />
        {!retreadAllowed ? (
          <div className="rounded-xl border border-border bg-muted/20 p-5">
            <div className="flex items-start gap-2">
              <Layers className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-bold text-foreground">{tx.retreadOffTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tx.retreadOffBody}</p>
              </div>
            </div>
          </div>
        ) : scenario === null ? (
          <div className="rounded-xl border border-border bg-card p-5 opacity-60">
            <div className="flex items-start gap-2">
              <Layers className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-bold text-foreground">{tx.retreadWaiting}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tx.missingLabel}</p>
                <p className="mt-1 font-mono text-xs" style={{ color: HEX.warn }}>
                  {retreadMissing.join(" · ")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                {tx.thLabel}
                <select
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5 font-mono font-semibold text-foreground"
                >
                  {REMOVAL_THRESHOLDS.map((th) => (
                    <option key={th} value={th}>{fmtTread(th)}</option>
                  ))}
                </select>
              </label>
              <div className="flex gap-1.5">
                {[false, true].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    onClick={() => setWithRetread(on)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      withRetread === on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/30 border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {on ? tx.retreadOn : tx.retreadOff}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label={tx.scExpectedKm} value={fmtDistanceKm(scenario.cur.km)} />
              <Kpi label={tx.scTotalCost} value={fmtCurrencyDoc(scenario.cur.cost)} />
              <Kpi label={tx.scCpk} value={fmtCpk(scenario.cur.cpk)} strong />
              <Kpi
                label={tx.scDelta}
                value={
                  scenario.cur.cpk != null && scenario.base.cpk != null && scenario.base.cpk !== 0
                    ? fmtPercent(((scenario.cur.cpk - scenario.base.cpk) / scenario.base.cpk) * 100)
                    : EMPTY
                }
              />
            </div>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}

const HEAD_CLS = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap";

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-primary" />
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      {sub && <p className="mt-1 ml-3 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Note({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tone === "warn" ? HEX.warn : HEX.ink }} />
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono ${strong ? "text-lg font-bold text-foreground" : "text-sm font-semibold text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * CPK 카드. 값이 null 이면 **금액 자리를 비우지 않고** «단가 미확정» 과
 * 대기 중인 파라미터를 쓴다. 빈칸은 "0" 으로도 "누락" 으로도 읽혀서 못 쓴다.
 */
function CpkCard({
  label, sub, value, tx, missing,
}: {
  label: string;
  sub: string;
  value: number | null;
  // TX 는 as const 라 로케일마다 리터럴 타입이 갈린다. 여기서 쓰는 3개만 구조로 받는다.
  tx: { priceUnset: string; priceUnsetHelp: string; missingLabel: string };
  missing: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" style={{ borderTopColor: HEX.blue, borderTopWidth: 3 }}>
      <p className="text-xs font-bold text-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
      {value != null ? (
        <p className="mt-3 font-mono text-xl font-bold text-foreground">{fmtCpk(value)}</p>
      ) : (
        <>
          <p className="mt-3 text-sm font-bold" style={{ color: HEX.warn }}>{tx.priceUnset}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{tx.priceUnsetHelp}</p>
          {missing.length > 0 && (
            <>
              <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{tx.missingLabel}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{missing.join(" · ")}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
