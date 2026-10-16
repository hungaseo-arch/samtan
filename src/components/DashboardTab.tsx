// @section: dashboard-tab
import { Fragment, useState } from "react";
import { TMS_DATA, NEW_TREAD, recPsi, treadThresholds, inspectionIntervalDays } from "@/data/tmsData";
import {
  getUnitAlerts, validDates, unitInspectionAge, unitStatusCounts,
  replacementPrepList, PREP_WINDOW_DAYS, PREP_URGENT_DAYS,
} from "@/data/tmsUtils";
import { EMPTY, fmtInt, fmtTread, todayInField } from "@/lib/format";
import { OVERDUE_FACTOR } from "@/lib/inspectionAge";
import { Truck, Circle, ChevronRight, X, CalendarClock } from "lucide-react";
import { useLang } from "@/i18n";

const buildTX = () => ({
  ko: {
    monitoringUnits: "모니터링 차량",
    testTires: "시험 타이어",
    normal: "정상",
    caution: "주의",
    orderTire: "발주",
    replaceScrap: "즉시교체",
    cumulativeScrap: "누적 폐기",
    installed: "장착 (DB)",
    spareTires: "예비 타이어",
    unitDae: "대",
    pcsHead: "본 (Head)",
    pcs: "본",
    summaryTitle: "시험 현황 요약",
    statusPerUnit: "차량(CH)별 현황",
    unit: "차량",
    firstInstallDate: "최초 장착일",
    lastInspectDate: "최근 점검일",
    drivenHm: "주행 HM",
    drivenKm: "주행 KM",
    replaceRecommend: "즉시교체",
    replaceHistory: "교체이력",
    totalAvg: "합계 · 평균",
    totalAvgNote: " (주행 HM·KM=평균)",
    times: "회",
    layoutTitle: "CH {ch} 배치도 보기",
    cautionAlertTitle: "CH {ch} 주의 알림 보기",
    orderAlertTitle: "CH {ch} 발주 알림 보기",
    replaceAlertTitle: "CH {ch} 즉시교체 알림 보기",
    footerLead: "주의·발주·즉시교체",
    footerRest: " 숫자를 클릭하면 해당 차량의 알림 상세가 모달로 표시됩니다.",
    footerSpec: `트레드 기준: 신품 ${NEW_TREAD}mm · 주의 <${treadThresholds().caution}mm · 발주 <${treadThresholds().order}mm · 즉시교체 <${treadThresholds().critical}mm | 권장 공기압: 조향축(L1/R1) ${recPsi(1)}psi / 구동축 ${recPsi(3)}psi`,
    approvalLine: "결재 라인",
    replaceDanger: "즉시교체",
    cases: "건",
    noItems: "해당 항목이 없습니다.",
    danger: "위험",
    prepTitle: "교체 준비 목록",
    prepSub: `예상 교체일 30일 이내 (발주 기준 ${treadThresholds().order}mm 도달)`,
    pDate: "예상 교체일",
    pPos: "포지션",
    pSerial: "시리얼",
    pTread: "최근 트레드",
    pRem: "잔여 KM",
    pDays: "{n}일",
    pOver: "{n}일 경과",
    pSummary: "30일 내 {a}본 · 60일 내 {b}본",
    pNone: "30일 이내 교체 예정 타이어가 없습니다.",
    pFoot: "마모 추세로 산출한 추정일입니다. 예측할 수 없는 타이어(회차 3개 미만·HM Reset 등)는 빠집니다 — 수명 DB 탭의 「30일 이내 교체」 필터와 같은 목록입니다.",
    overdueUnits: "점검 지연 차량",
    staleSub: "정상 미확인 {n}본",
    ageBadge: "+{n}일",
    ageTitle: "마지막 점검 후 {n}일 경과 (주기 {i}일 · 지연 기준 {o}일 초과)",
    staleTitle: "점검 지연 — 마지막 값은 정상이지만 확인되지 않은 타이어 {n}본",
    footerAge: `최근 점검일 옆 +N일 = 마지막 점검 후 경과일. 주기(${inspectionIntervalDays()}일) 초과 노랑, ${OVERDUE_FACTOR}배 초과 빨강(점검 지연). 지연 차량의 정상 타이어는 「정상」 대신 회색 ?N(미확인)으로 셉니다.`,
  },
  id: {
    monitoringUnits: "Unit dipantau",
    testTires: "Ban uji",
    normal: "Normal",
    caution: "Perhatian",
    orderTire: "Pesan ban",
    replaceScrap: "Ganti segera",
    cumulativeScrap: "Total afkir",
    installed: "Terpasang (DB)",
    spareTires: "Ban cadangan",
    unitDae: "unit",
    pcsHead: "pcs (Head)",
    pcs: "pcs",
    summaryTitle: "Ringkasan",
    statusPerUnit: "Status per Unit(CH)",
    unit: "Unit",
    firstInstallDate: "Tgl pasang awal",
    lastInspectDate: "Tgl inspeksi terakhir",
    drivenHm: "HM tempuh",
    drivenKm: "KM tempuh",
    replaceRecommend: "Ganti segera",
    replaceHistory: "Riwayat ganti",
    totalAvg: "Total · Rata-rata",
    totalAvgNote: " (HM·KM tempuh=Rata-rata)",
    times: "kali",
    layoutTitle: "Lihat tata letak CH {ch}",
    cautionAlertTitle: "Lihat peringatan Perhatian CH {ch}",
    orderAlertTitle: "Lihat peringatan Pesan ban CH {ch}",
    replaceAlertTitle: "Lihat peringatan Ganti segera CH {ch}",
    footerLead: "Perhatian·Pesan ban·Ganti segera",
    footerRest: " Klik angka untuk menampilkan detail peringatan unit dalam modal.",
    footerSpec: `Standar tapak: baru ${NEW_TREAD}mm · Perhatian <${treadThresholds().caution}mm · Pesan ban <${treadThresholds().order}mm · Ganti segera <${treadThresholds().critical}mm | Tekanan disarankan: Poros kemudi(L1/R1) ${recPsi(1)}psi / Poros penggerak ${recPsi(3)}psi`,
    approvalLine: "Jalur Persetujuan",
    replaceDanger: "Ganti segera",
    cases: "item",
    noItems: "Tidak ada item.",
    danger: "Bahaya",
    prepTitle: "Daftar Persiapan Penggantian",
    prepSub: `Prakiraan Penggantian ≤ 30 hari (mencapai batas pesan ${treadThresholds().order}mm)`,
    pDate: "Prakiraan tgl ganti",
    pPos: "Posisi",
    pSerial: "Serial",
    pTread: "Kedalaman alur terakhir",
    pRem: "Sisa KM",
    pDays: "{n} hari",
    pOver: "lewat {n} hari",
    pSummary: "≤ 30 hari {a} ban · ≤ 60 hari {b} ban",
    pNone: "Tidak ada ban yang dijadwalkan ganti dalam 30 hari.",
    pFoot: "Tanggal perkiraan dari tren Aus. Ban yang tidak dapat diprediksi (kurang dari 3 Pemeriksaan, HM Reset, dll.) tidak termasuk — sama dengan filter «Ganti ≤ 30 hari» di tab DB umur ban.",
    overdueUnits: "Unit terlambat Pemeriksaan",
    staleSub: "{n} ban normal belum dicek",
    ageBadge: "+{n} hr",
    ageTitle: "{n} hari sejak Pemeriksaan terakhir (siklus {i} hari · terlambat jika > {o} hari)",
    staleTitle: "Pemeriksaan terlambat — {n} ban dengan nilai terakhir normal tetapi belum dicek",
    footerAge: `+N hr di samping tgl inspeksi terakhir = hari sejak Pemeriksaan terakhir. Lewat siklus (${inspectionIntervalDays()} hari) kuning, lewat ${OVERDUE_FACTOR}× merah (terlambat). Ban normal pada unit terlambat dihitung sebagai ?N abu-abu (belum dicek), bukan «Normal».`,
  },
  en: {
    monitoringUnits: "Monitored vehicles",
    testTires: "Test tires",
    normal: "Normal",
    caution: "Caution",
    orderTire: "Order tire",
    replaceScrap: "Replace now",
    cumulativeScrap: "Cumulative scrap",
    installed: "Installed (DB)",
    spareTires: "Spare tires",
    unitDae: "units",
    pcsHead: "pcs (Head)",
    pcs: "pcs",
    summaryTitle: "Test status summary",
    statusPerUnit: "Status by vehicle (CH)",
    unit: "Vehicle",
    firstInstallDate: "First install date",
    lastInspectDate: "Last inspection date",
    drivenHm: "HM run",
    drivenKm: "KM run",
    replaceRecommend: "Replace now",
    replaceHistory: "Replacement history",
    totalAvg: "Total · Average",
    totalAvgNote: " (HM·KM run = average)",
    times: "times",
    layoutTitle: "View CH {ch} layout",
    cautionAlertTitle: "View CH {ch} caution alerts",
    orderAlertTitle: "View CH {ch} order alerts",
    replaceAlertTitle: "View CH {ch} replace-now alerts",
    footerLead: "Caution·Order·Replace now",
    footerRest: " Click a number to open the alert details for that vehicle in a modal.",
    footerSpec: `Tread spec: new ${NEW_TREAD}mm · Caution <${treadThresholds().caution}mm · Order <${treadThresholds().order}mm · Replace now <${treadThresholds().critical}mm | Recommended pressure: steer axle (L1/R1) ${recPsi(1)}psi / drive axle ${recPsi(3)}psi`,
    approvalLine: "Approval line",
    replaceDanger: "Replace now",
    cases: "cases",
    noItems: "No matching items.",
    danger: "Danger",
    prepTitle: "Replacement Prep List",
    prepSub: `Projected replacement within 30 days (reaching the ${treadThresholds().order}mm order threshold)`,
    pDate: "Projected date",
    pPos: "Position",
    pSerial: "Serial",
    pTread: "Latest tread",
    pRem: "Remaining KM",
    pDays: "{n} d",
    pOver: "{n} d overdue",
    pSummary: "{a} tires within 30 days · {b} within 60 days",
    pNone: "No tires are projected for replacement within 30 days.",
    pFoot: "Estimated from the wear trend. Tires that cannot be projected (fewer than 3 inspections, HM Reset, etc.) are left out — same list as the “Replace ≤ 30 days” filter in the Lifetime DB tab.",
    overdueUnits: "Overdue inspection",
    staleSub: "{n} normal tires unverified",
    ageBadge: "+{n} d",
    ageTitle: "{n} days since last inspection (interval {i} d · overdue after {o} d)",
    staleTitle: "Inspection overdue — {n} tires whose last reading was normal but are unverified",
    footerAge: `+N d next to the last inspection date = days since the last inspection. Yellow past the interval (${inspectionIntervalDays()} d), red past ${OVERDUE_FACTOR}× (overdue). Normal tires on overdue vehicles are counted as grey ?N (unverified) instead of “Normal”.`,
  },
} as const);

const STATUS_COLOR: Record<string, string> = {
  danger: "text-level-danger border-level-danger/50 bg-level-danger/10",
  order: "text-level-order border-level-order/50 bg-level-order/10",
  warn: "text-level-warn border-level-warn/50 bg-level-warn/10",
};

export default function DashboardTab({ onVehicleClick }: { onVehicleClick?: (ch: string) => void }) {
  const { lang } = useLang();
  // 문구에 임계치·권장 공기압이 들어가므로 DB 로드 후 렌더 시점에 만든다.
  const tx = buildTX()[lang];
  // ── KPI 계산 ──────────────────────────────────────────────
  // 점검 지연(§A-3) 차량의 정상 타이어는 stale 로 빠진다 — unitStatusCounts 참고.
  const today = todayInField();
  const counts = new Map(TMS_DATA.units.map((u) => [u.ch, unitStatusCounts(u, today)]));
  const ages = new Map(TMS_DATA.units.map((u) => [u.ch, unitInspectionAge(u, today)]));
  const overdueUnits = [...ages.values()].filter((a) => a.level === "overdue").length;
  let okCount = 0, warnCount = 0, orderCount = 0, dangerCount = 0, staleCount = 0;
  counts.forEach((c) => {
    okCount += c.ok; warnCount += c.warn; orderCount += c.order; dangerCount += c.danger; staleCount += c.stale;
  });

  const kpis = [
    { label: tx.monitoringUnits, value: TMS_DATA.units.length, unit: tx.unitDae, cls: "border-primary/40 bg-primary/5" },
    { label: tx.testTires, value: TMS_DATA.units.length * 10, unit: tx.pcsHead, cls: "border-primary/40 bg-primary/5" },
    { label: tx.normal, value: okCount, unit: tx.pcs, cls: "border-level-ok/40 bg-level-ok/10 text-level-ok" },
    { label: tx.caution, value: warnCount, unit: tx.pcs, cls: "border-level-warn/40 bg-level-warn/10 text-level-warn" },
    { label: tx.orderTire, value: orderCount, unit: tx.pcs, cls: "border-level-order/40 bg-level-order/10 text-level-order" },
    { label: tx.replaceScrap, value: dangerCount, unit: tx.pcs, cls: "border-level-danger/40 bg-level-danger/10 text-level-danger" },
    {
      label: tx.overdueUnits, value: overdueUnits, unit: tx.unitDae,
      sub: staleCount > 0 ? tx.staleSub.replace("{n}", fmtInt(staleCount)) : undefined,
      cls: overdueUnits > 0 ? "border-level-danger/40 bg-level-danger/10 text-level-danger" : "border-border bg-muted/30",
    },
    { label: tx.cumulativeScrap, value: TMS_DATA.summary["Scrap"] ?? 0, unit: tx.pcs, cls: "border-level-danger/40 bg-level-danger/10 text-level-danger" },
    { label: tx.installed, value: TMS_DATA.summary["Install"] ?? 0, unit: tx.pcs, cls: "border-border bg-muted/30" },
    { label: tx.spareTires, value: TMS_DATA.summary["Spare"] ?? 0, unit: tx.pcs, cls: "border-border bg-muted/30" },
  ];

  const approvers = [
    { name: "Ricky", role: "Admin Tire" },
    { name: "Nazar Fadlullah", role: "Foreman" },
    { name: "Jung Tae Hee", role: "Manager" },
    { name: "Sugeng Priyo M.", role: "PJO" },
    { name: "Hwang Tae Gi", role: "Pres. Director" },
  ];

  // 차량별 현황 합계 (주행 HM·KM / 정상·주의·교체권장·교체이력)
  const dashTotal = (() => {
    const acc = { hm: [0, 0], km: [0, 0], ok: 0, warn: 0, order: 0, danger: 0, stale: 0, rc: 0 };
    TMS_DATA.units.forEach((u) => {
      const vd = validDates(u);
      const hms = vd.map((x) => u.hm[x.i]).filter((v): v is number => typeof v === "number");
      const kms = vd.map((x) => u.km[x.i]).filter((v): v is number => typeof v === "number");
      const dh = hms.length >= 2 ? hms[hms.length - 1] - hms[0] : null;
      const dk = kms.length >= 2 ? kms[kms.length - 1] - kms[0] : null;
      if (dh != null) { acc.hm[0] += dh; acc.hm[1]++; }
      if (dk != null) { acc.km[0] += dk; acc.km[1]++; }
      const c = counts.get(u.ch)!;
      acc.ok += c.ok; acc.warn += c.warn; acc.order += c.order; acc.danger += c.danger; acc.stale += c.stale;
      acc.rc += TMS_DATA.repl.filter((r) => r.ch === u.ch).length;
    });
    return {
      hm: acc.hm[1] ? acc.hm[0] / acc.hm[1] : null,  // 주행 HM 평균
      km: acc.km[1] ? acc.km[0] / acc.km[1] : null,  // 주행 KM 평균
      ok: acc.ok, warn: acc.warn, order: acc.order, danger: acc.danger, stale: acc.stale, rc: acc.rc, // 상태·교체이력 합계
    };
  })();

  // 교체 준비 목록 (§A-2) — 60일 창으로 한 번 뽑고 30일분을 표에, 두 건수를 요약에 쓴다.
  const prep60 = replacementPrepList(PREP_WINDOW_DAYS * 2, today);
  const prep30 = prep60.filter((x) => x.daysLeft <= PREP_WINDOW_DAYS);

  // 주의·교체권장 카운트 클릭 → 해당 차량 알림 모달
  const [alertModal, setAlertModal] = useState<{ ch: string; lv: "warn" | "order" | "danger" } | null>(null);
  const alertItems = alertModal
    ? getUnitAlerts(TMS_DATA.units.find((u) => u.ch === alertModal.ch)!, lang).filter((a) => a.lv === alertModal.lv)
    : [];

  return (
    <div className="stagger-in space-y-6">
      {/* ── KPI 카드 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.summaryTitle}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-xl border p-4 text-center ${k.cls}`}>
              <div className="text-xs text-muted-foreground mb-1">{k.label}</div>
              <div className="font-mono text-2xl font-bold leading-none">
                {k.value}
                <span className="text-xs font-normal ml-1 opacity-70">{k.unit}</span>
              </div>
              {"sub" in k && k.sub && <div className="mt-1 text-[11px] opacity-80">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>


      {/* ── 차량별 현황 요약 테이블 ── */}
      <div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{tx.statusPerUnit}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 table-fixed text-sm border-collapse">
              <colgroup>
                {["9%","11%","15%","11%","11%","7%","7%","8%","10%","11%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: tx.unit, center: false },
                    { label: tx.firstInstallDate, center: false },
                    { label: tx.lastInspectDate, center: false },
                    { label: tx.drivenHm, center: true },
                    { label: tx.drivenKm, center: true },
                    { label: tx.normal, center: true },
                    { label: tx.caution, center: true },
                    { label: tx.orderTire, center: true },
                    { label: tx.replaceRecommend, center: true },
                    { label: tx.replaceHistory, center: true },
                  ].map((h) => (
                    <th key={h.label} className={`px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap ${h.center ? "text-center" : "text-left"}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TMS_DATA.units.map((u) => {
                  const vd = validDates(u);
                  const fd = vd.length ? vd[0].d : EMPTY;
                  const ld = vd.length ? vd[vd.length - 1].d : EMPTY;
                  // 실제 주행량 = 최신 − 최초 (수치 회차 기준)
                  const hms = vd.map((x) => u.hm[x.i]).filter((v): v is number => typeof v === "number");
                  const kms = vd.map((x) => u.km[x.i]).filter((v): v is number => typeof v === "number");
                  const drivenHm = hms.length >= 2 ? hms[hms.length - 1] - hms[0] : null;
                  const drivenKm = kms.length >= 2 ? kms[kms.length - 1] - kms[0] : null;
                  const { ok, warn, order, danger, stale } = counts.get(u.ch)!;
                  const age = ages.get(u.ch)!;
                  const rc = TMS_DATA.repl.filter((r) => r.ch === u.ch).length;
                  return (
                    <tr key={u.ch} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-primary">
                        <button className="hover:underline" title={tx.layoutTitle.replace("{ch}", u.ch)} onClick={() => onVehicleClick?.(u.ch)}>CH {u.ch}</button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{fd}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {ld}
                        {age.days != null && (
                          <span
                            className={`ml-1.5 text-[11px] ${age.level === "overdue" ? "font-bold text-level-danger" : age.level === "due" ? "font-bold text-level-warn" : "text-muted-foreground"}`}
                            title={tx.ageTitle.replace("{n}", fmtInt(age.days)).replace("{i}", fmtInt(inspectionIntervalDays())).replace("{o}", fmtInt(inspectionIntervalDays() * OVERDUE_FACTOR))}
                          >
                            {tx.ageBadge.replace("{n}", fmtInt(age.days))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-center">{fmtInt(drivenHm)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-center">{fmtInt(drivenKm)}</td>
                      <td className="px-3 py-2 text-center">
                        {ok > 0 && <span className="font-mono text-xs text-level-ok font-bold">{ok}</span>}
                        {stale > 0 && <span className="ml-1 font-mono text-xs text-muted-foreground" title={tx.staleTitle.replace("{n}", fmtInt(stale))}>?{stale}</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {warn > 0 && <button className="font-mono text-xs text-level-warn font-bold hover:underline" title={tx.cautionAlertTitle.replace("{ch}", u.ch)} onClick={() => setAlertModal({ ch: u.ch, lv: "warn" })}>{warn}</button>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {order > 0 && <button className="font-mono text-xs text-level-order font-bold hover:underline" title={tx.orderAlertTitle.replace("{ch}", u.ch)} onClick={() => setAlertModal({ ch: u.ch, lv: "order" })}>{order}</button>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {danger > 0 && <button className="font-mono text-xs text-level-danger font-bold hover:underline" title={tx.replaceAlertTitle.replace("{ch}", u.ch)} onClick={() => setAlertModal({ ch: u.ch, lv: "danger" })}>{danger}</button>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {rc > 0 && <span className="font-mono text-xs text-muted-foreground">{rc}{tx.times}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-bold text-xs">
                  <td className="px-3 py-2 text-muted-foreground" colSpan={3}>{tx.totalAvg}<span className="font-normal opacity-70">{tx.totalAvgNote}</span></td>
                  <td className="px-3 py-2 text-center font-mono">{fmtInt(dashTotal.hm)}</td>
                  <td className="px-3 py-2 text-center font-mono">{fmtInt(dashTotal.km)}</td>
                  <td className="px-3 py-2 text-center font-mono text-level-ok">
                    {dashTotal.ok}
                    {dashTotal.stale > 0 && <span className="ml-1 font-normal text-muted-foreground" title={tx.staleTitle.replace("{n}", fmtInt(dashTotal.stale))}>?{dashTotal.stale}</span>}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-level-warn">{dashTotal.warn}</td>
                  <td className="px-3 py-2 text-center font-mono text-level-order">{dashTotal.order}</td>
                  <td className="px-3 py-2 text-center font-mono text-level-danger">{dashTotal.danger}</td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">{dashTotal.rc}{tx.times}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <strong className="text-foreground">{tx.footerLead}</strong>{tx.footerRest}
            <br />
            {tx.footerSpec}
            <br />
            {tx.footerAge}
          </p>
        </div>
      </div>


      {/* ── 교체 준비 목록 (§A-2) ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <CalendarClock className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">{tx.prepTitle}</span>
          <span className="ml-auto font-mono text-xs bg-muted px-2 py-0.5 rounded-full">
            {tx.pSummary.replace("{a}", fmtInt(prep30.length)).replace("{b}", fmtInt(prep60.length))}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{tx.prepSub}</p>
        {prep30.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{tx.pNone}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-150 text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">{tx.pDate}</th>
                  <th className="px-2 py-2 text-left font-semibold">{tx.unit}</th>
                  <th className="px-2 py-2 text-left font-semibold">{tx.pPos}</th>
                  <th className="px-2 py-2 text-left font-semibold">{tx.pSerial}</th>
                  <th className="px-2 py-2 text-right font-semibold">{tx.pTread}</th>
                  <th className="px-2 py-2 text-right font-semibold">{tx.pRem}</th>
                </tr>
              </thead>
              <tbody>
                {prep30.map((x) => (
                  <tr key={x.serial} className="border-b border-border/30">
                    <td className="px-2 py-1.5 font-mono">
                      <span className={`font-bold ${x.daysLeft <= PREP_URGENT_DAYS ? "text-level-danger" : "text-level-warn"}`}>
                        {x.projectedDate}
                      </span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {x.daysLeft < 0
                          ? tx.pOver.replace("{n}", fmtInt(-x.daysLeft))
                          : tx.pDays.replace("{n}", fmtInt(x.daysLeft))}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono">CH {x.ch}</td>
                    <td className="px-2 py-1.5 font-mono">{x.pos}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{x.serial}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{fmtTread(x.latestTread)}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{fmtInt(x.remainingKm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">{tx.pFoot}</p>
      </div>

      {/* ── 결재 라인 ── */}
      <div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Circle className="w-3 h-3 text-primary fill-primary" />
            <span className="text-sm font-bold">{tx.approvalLine}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between mx-15 gap-6 text-center">
            {approvers.map((p, i) => (
              <Fragment key={p.name}>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-14 h-14 rounded-full border-2 border-border bg-muted/30 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{p.name[0]}</span>
                  </div>
                  <span className="text-xs font-semibold">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.role}</span>
                </div>
                {i < approvers.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-5" />
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* 주의·교체권장 클릭 → 해당 차량 알림 모달 */}
        {alertModal && (
          <div
            className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setAlertModal(null)}
          >
            <div
              className="modal-in bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary">CH {alertModal.ch}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[alertModal.lv]}`}>
                    {alertModal.lv === "danger" ? tx.replaceDanger : alertModal.lv === "order" ? tx.orderTire : tx.caution}
                  </span>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{alertItems.length}{tx.cases}</span>
                </div>
                <button onClick={() => setAlertModal(null)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {alertItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{tx.noItems}</p>
              ) : (
                <ul className="space-y-2">
                  {alertItems.map((a, i) => (
                    <li key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${STATUS_COLOR[a.lv]}`}>
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold border ${STATUS_COLOR[a.lv]}`}>
                        {a.lv === "danger" ? tx.danger : a.lv === "order" ? tx.orderTire : tx.caution}
                      </span>
                      <span className="font-mono">{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
