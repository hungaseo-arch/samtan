// @section: result-summary-card
// 마모 분석 › 결과 요약 — WO-TMS-2026-10-LIFE T-5.
//
// 차량·포지션 선택 줄 아래, KPI 카드 위. 네 줄(수명·예측·패턴·데이터 품질)과 배지 1개.
// 숫자는 새로 계산하지 않는다 — 수명·예측은 lifeCalc(수명 DB 와 같은 값), CV·S/C 는
// 마모 분석 뷰 값을 받아 서식만 입힌다. 배지 규칙은 src/lib/resultSummary.ts.
import { useLang, type Lang } from "@/i18n";
import { lifeCalc, ledgerOf, odometerAnomalies, PREP_WINDOW_DAYS } from "@/data/tmsUtils";
import { treadThresholds } from "@/data/tmsData";
import { daysBetween } from "@/lib/lifeProjection";
import { anomalyOverlaps, type OdoFlag } from "@/lib/odometerCheck";
import { judgeSummary, type SummaryLevel, type SummaryReason } from "@/lib/resultSummary";
import {
  EMPTY, fmtDistanceKm, fmtInt, fmtPercent, fmtR2, fmtRatio, fmtTread, todayInField,
} from "@/lib/format";

const TX = {
  ko: {
    title: "결과 요약",
    lvl: { ok: "정상", caution: "주의", check: "데이터 확인 필요" } as Record<SummaryLevel, string>,
    life: "수명", pred: "예측", pattern: "패턴", data: "데이터",
    driven: "주행", expected: "예상 (0 mm)", lower: "(하한값)", lowerTip: "장착일 이전 주행 미상",
    orderAt: (mm: string, date: string, d: number) =>
      d >= 0 ? `발주 기준 ${mm} 도달 예상 ${date} (${fmtInt(d)}일 후)` : `발주 기준 ${mm} 도달 예상 ${date} (${fmtInt(-d)}일 지남)`,
    projWhy: { few_rounds: "회차 3개 미만 — 예측 불가", no_trend: "마모 추세 없음 — 예측 불가", hm_reset: "HM Reset 차량 — 계기 보정 전 예측 불가", none: "측정 데이터 부족" },
    median: "플릿 중앙값", sc: "S/C",
    pat: { shoulder: "숄더 마모", center: "중앙 마모", even: "균일", insufficient: "판정 보류" } as Record<string, string>,
    clean: "주행계·원장 이상 없음",
    odo: (a: string, b: string, f: string) => `주행계 이상 ${a} → ${b} (${f}) — 원본 점검표 확인 후 정정`,
    odoFlag: { KM_DECREASE: "KM 감소", KM_DAILY: "일 주행 초과", SPEED: "환산 속도 초과", HM_DAILY: "일 가동 초과" } as Record<OdoFlag, string>,
    ledger: (f: string) => `원장 구간 km_flag ${f} — 장착 구간 km 산출 불가`,
    r2: (v: string) => `R² ${v} < 0.80 — 마모율 신뢰도 낮음`,
    structural: "최초 장착분 — 장착 전 주행 미상 (하한값)",
    approx: "일부 구간 km 근사(APPROX) — 앞 회차 값 사용",
    rOrder: (d: number) => (d >= 0 ? `발주 ${fmtInt(d)}일 이내` : "발주 시점 경과"),
    rCv: "CV 플릿 중앙값 1.5배 초과",
    rSc: "S/C 편마모",
  },
  id: {
    title: "Ringkasan hasil",
    lvl: { ok: "Normal", caution: "Waspada", check: "Perlu cek data" } as Record<SummaryLevel, string>,
    life: "Umur", pred: "Prediksi", pattern: "Pola", data: "Data",
    driven: "Jarak tempuh", expected: "Perkiraan (0 mm)", lower: "(batas bawah)", lowerTip: "Jarak sebelum tanggal pasang tidak diketahui",
    orderAt: (mm: string, date: string, d: number) =>
      d >= 0 ? `Mencapai batas pesan ${mm} sekitar ${date} (${fmtInt(d)} hari lagi)` : `Mencapai batas pesan ${mm} sekitar ${date} (lewat ${fmtInt(-d)} hari)`,
    projWhy: { few_rounds: "Kurang dari 3 Pemeriksaan — tidak dapat diprediksi", no_trend: "Tidak ada tren Aus — tidak dapat diprediksi", hm_reset: "Unit HM Reset — tidak dapat diprediksi sebelum koreksi meter", none: "Data pengukuran kurang" },
    median: "Median armada", sc: "S/C",
    pat: { shoulder: "Keausan bahu", center: "Keausan tengah", even: "Merata", insufficient: "Belum dapat dinilai" } as Record<string, string>,
    clean: "Odometer dan riwayat tidak ada kelainan",
    odo: (a: string, b: string, f: string) => `Kelainan odometer ${a} → ${b} (${f}) — koreksi setelah cek lembar asli`,
    odoFlag: { KM_DECREASE: "KM turun", KM_DAILY: "Jarak harian berlebih", SPEED: "Kecepatan rata-rata berlebih", HM_DAILY: "Jam harian berlebih" } as Record<OdoFlag, string>,
    ledger: (f: string) => `km_flag segmen ${f} — KM segmen tidak dapat dihitung`,
    r2: (v: string) => `R² ${v} < 0.80 — keandalan laju Aus rendah`,
    structural: "Pemasangan awal — jarak sebelum pasang tidak diketahui (batas bawah)",
    approx: "Sebagian KM segmen perkiraan (APPROX) — memakai nilai Pemeriksaan sebelumnya",
    rOrder: (d: number) => (d >= 0 ? `Pesan dalam ${fmtInt(d)} hari` : "Batas pesan terlewati"),
    rCv: "CV lebih dari 1.5× median armada",
    rSc: "Aus tidak merata S/C",
  },
  en: {
    title: "Result summary",
    lvl: { ok: "Normal", caution: "Caution", check: "Check data" } as Record<SummaryLevel, string>,
    life: "Life", pred: "Forecast", pattern: "Pattern", data: "Data",
    driven: "Driven", expected: "Expected (0 mm)", lower: "(lower bound)", lowerTip: "Distance before the mount date is unknown",
    orderAt: (mm: string, date: string, d: number) =>
      d >= 0 ? `Reaches order point ${mm} around ${date} (in ${fmtInt(d)} days)` : `Reached order point ${mm} around ${date} (${fmtInt(-d)} days ago)`,
    projWhy: { few_rounds: "Fewer than 3 inspections — cannot project", no_trend: "No wear trend — cannot project", hm_reset: "HM Reset vehicle — cannot project before meter correction", none: "Not enough measurement data" },
    median: "Fleet median", sc: "S/C",
    pat: { shoulder: "Shoulder wear", center: "Center wear", even: "Even", insufficient: "Not judged" } as Record<string, string>,
    clean: "No odometer or ledger issues",
    odo: (a: string, b: string, f: string) => `Odometer anomaly ${a} → ${b} (${f}) — correct after checking the original sheet`,
    odoFlag: { KM_DECREASE: "KM decrease", KM_DAILY: "Daily distance over limit", SPEED: "Average speed over limit", HM_DAILY: "Daily hours over limit" } as Record<OdoFlag, string>,
    ledger: (f: string) => `Ledger km_flag ${f} — segment KM cannot be computed`,
    r2: (v: string) => `R² ${v} < 0.80 — low wear-rate confidence`,
    structural: "Initial fitment — distance before mounting unknown (lower bound)",
    approx: "Some segment KM approximated (APPROX) — previous round value used",
    rOrder: (d: number) => (d >= 0 ? `Order within ${fmtInt(d)} days` : "Order point passed"),
    rCv: "CV over 1.5× fleet median",
    rSc: "Uneven S/C wear",
  },
} as const;

const BADGE: Record<SummaryLevel, string> = {
  ok: "border-level-ok bg-level-ok/10 text-level-ok",
  caution: "border-level-warn bg-level-warn/10 text-level-warn",
  check: "border-level-danger bg-level-danger/10 text-level-danger",
};

function reasonText(r: SummaryReason, tx: (typeof TX)[Lang]): string {
  switch (r.kind) {
    case "odo": return tx.odo(r.datePrev, r.dateCurr, r.flags.map((f) => tx.odoFlag[f]).join(", "));
    case "ledger": return tx.ledger(r.flag);
    case "r2": return tx.r2(fmtR2(r.r2));
    case "order": return tx.rOrder(r.days);
    case "cv": return tx.rCv;
    case "sc": return tx.rSc;
  }
}

export interface ResultSummaryProps {
  ch: string;
  serial: string | null;
  /** 이 타이어의 측정 회차 범위 — 주행계 이상 구간을 이 기간과 겹치는 것만 본다 */
  from: string | null;
  to: string | null;
  r2: number | null;
  cv: number | null;
  fleetCvMedian: number | null;
  scRatio: number | null;
  pattern: string | null;
}

export default function ResultSummaryCard(p: ResultSummaryProps) {
  const { lang } = useLang();
  const tx = TX[lang];
  const life = p.serial ? lifeCalc(p.serial) : null;
  const ledger = p.serial ? ledgerOf(p.serial) : [];
  const anomalies = odometerAnomalies(p.ch).filter((a) => anomalyOverlaps(a, p.from, p.to));
  const proj = life?.projection ?? null;
  const today = todayInField();
  const orderDaysLeft = proj?.projectedDate ? daysBetween(today, proj.projectedDate) : null;

  const res = judgeSummary({
    r2: p.r2,
    orderDaysLeft,
    orderWindowDays: PREP_WINDOW_DAYS,
    cv: p.cv,
    fleetCvMedian: p.fleetCvMedian,
    pattern: p.pattern,
    anomalies,
    ledger: ledger.map((g) => ({ kmFlag: g.kmFlag, seqNo: g.seqNo, mountedAt: g.mountedAt })),
  });

  // 데이터 줄 — 배지 사유가 아닌 안내(최초 장착 하한값·APPROX)도 함께 적는다
  const notes: string[] = [];
  if (ledger.some((g) => g.kmFlag === "NO_KM" && g.seqNo === 0 && g.mountedAt == null)) notes.push(tx.structural);
  if (ledger.some((g) => g.kmFlag === "APPROX")) notes.push(tx.approx);
  const dataLines = res.level === "check" ? res.reasons.map((r) => reasonText(r, tx)) : [];
  if (!dataLines.length && !notes.length) dataLines.push(tx.clean);

  const orderMm = fmtTread(treadThresholds().order);
  const predLine = proj?.projectedDate && orderDaysLeft != null
    ? tx.orderAt(orderMm, proj.projectedDate, orderDaysLeft)
    : tx.projWhy[proj?.reason ?? "none"];

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={tx.title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-foreground">{tx.title}</h3>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${BADGE[res.level]}`}>{tx.lvl[res.level]}</span>
        {res.level === "caution" && (
          <span className="text-xs text-level-warn">{res.reasons.map((r) => reasonText(r, tx)).join(" · ")}</span>
        )}
        {p.serial && <span className="ml-auto font-mono text-xs text-muted-foreground">{p.serial}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="font-semibold text-muted-foreground">{tx.life}</dt>
        <dd className="text-foreground tabular-nums">
          {tx.driven} {fmtDistanceKm(life?.km)}
          {life?.kmIsLowerBound && (
            <span className="ml-1 text-level-warn" title={tx.lowerTip}>{tx.lower}</span>
          )}
          {" · "}{tx.expected} {fmtDistanceKm(life?.expectedKm)}
        </dd>

        <dt className="font-semibold text-muted-foreground">{tx.pred}</dt>
        <dd className="text-foreground tabular-nums">{life ? predLine : EMPTY}</dd>

        <dt className="font-semibold text-muted-foreground">{tx.pattern}</dt>
        <dd className="text-foreground tabular-nums">
          CV {fmtPercent(p.cv)} ({tx.median} {fmtPercent(p.fleetCvMedian)})
          {" · "}{tx.sc} {fmtRatio(p.scRatio)}{p.pattern ? ` ${tx.pat[p.pattern] ?? p.pattern}` : ""}
        </dd>

        <dt className="font-semibold text-muted-foreground">{tx.data}</dt>
        <dd className="space-y-0.5">
          {dataLines.map((l) => (
            <p key={l} className={res.level === "check" ? "text-level-danger" : "text-foreground"}>{l}</p>
          ))}
          {notes.map((l) => <p key={l} className="text-muted-foreground">{l}</p>)}
        </dd>
      </dl>
    </section>
  );
}
