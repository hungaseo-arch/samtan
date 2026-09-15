// @section: load-tab
import { LOAD_UNITS, LOAD_GROUPS, LOAD_GROSS_KG, HEAD_GROUP_SHARE, HEAD_VEHICLE, HEAD_STEER_SHARE, HEAD_DRIVE_SHARE, groupTotal } from "@/data/loadData";
import type { LoadUnit, LoadUnitKey } from "@/data/loadData";
import { loadPerTire, loadRatio, ratedByMount } from "@/data/tmsUtils";
import { fmtInt, fmtPercentInt } from "@/lib/format";
import { Weight, AlertTriangle } from "lucide-react";
import { Fragment } from "react";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    statusOk: "정상",
    statusWarn: "주의",
    statusDanger: "과적",
    mountSingle: "단륜",
    mountDual: "복륜",
    bannerTitle: "하중 계산",
    bannerGross: "연결차량 총중량(GCW)",
    bannerRated: "최대하중(kg/본)",
    overTitle: "과적 경고 (최대하중 초과)",
    overBody: "복륜 최대하중 초과 — 적재중량 조정·축하중 재분배 필요",
    unitStatusTitle: "유닛별 축하중 현황",
    thUnit: "유닛",
    thSpec: "타이어 규격",
    thMount: "장착방식",
    thCount: "수량",
    thGroup: "그룹",
    thTare: "공차중량",
    thPayload: "적재중량",
    thDist: "하중 분배율",
    thRated: "최대하중",
    thActual: "축하중",
    thPerTire: "타이어당 하중",
    thLoad: "부하율",
    thStatus: "판정",
    total: "합계",
    subtotal: "소계",
    groupPrefix: "그룹 ",
    noteSource: "출처",
    noteSourceBody: " · 하중지수(LI) 표 · 제조사 데이터",
    noteRated: "최대하중",
    noteRatedBody: "장착방식 기준 적용. 복륜 장착은 단륜 하중지수(LI) 대신 복륜 LI(단륜 −2단계) 적용",
    noteRatedHeadDrive: "Techking ETCrane 은 단륜 LI 만 공표 — 트레일러와 같은 규칙을 적용한 잠정치",
    noteFormula: "계산식",
    noteFormulaBody: "축하중 = 기준중량 × 하중 분배율 · 타이어당 하중 = 축하중 ÷ 수량 · 부하율 = 타이어당 하중 ÷ 최대하중(장착방식 적용)",
    noteDist: "하중 분배율 기준",
    noteDist1: "트레일러·돌리 = 그룹 총중량 기준 · Head 조향축/구동축 = Head 하중 기준(그룹 1의 ",
    noteDist2: " = ",
    noteDist3: " kg)",
    noteHead1: "Head 하중 = 조향축 ",
    noteHead2: " + 구동축 ",
    tires: "본",
    noteAxle1: " — ",
    noteAxle2: " 축 정격 비율 · 전축 ",
    noteAxle3: " lb · 후축 탠덤 ",
    noteAxle4: " lb",
    noteJudge: "판정",
    noteJudgeBody: "정상 <90% · 주의 90~100% · 과적 >100%",
    liSingle: "단륜 LI ",
    liDual: "복륜 LI ",
    uNames: { headSteer: "Head 조향축", headDrive: "Head 구동축", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
  },
  id: {
    statusOk: "Normal",
    statusWarn: "Perhatian",
    statusDanger: "Kelebihan beban",
    mountSingle: "Tunggal",
    mountDual: "Ganda",
    bannerTitle: "Perhitungan beban",
    bannerGross: "Berat total kombinasi (GCW)",
    bannerRated: "Beban maksimum (kg/ban)",
    overTitle: "Peringatan kelebihan beban (melebihi beban maksimum)",
    overBody: "Melebihi beban maksimum ganda — perlu penyesuaian muatan & distribusi beban poros",
    unitStatusTitle: "Beban poros per unit",
    thUnit: "Unit",
    thSpec: "Ukuran ban",
    thMount: "Pemasangan",
    thCount: "Jumlah",
    thGroup: "Grup",
    thTare: "Berat kosong",
    thPayload: "Muatan",
    thDist: "Distribusi beban",
    thRated: "Beban maks.",
    thActual: "Beban poros",
    thPerTire: "Beban per ban",
    thLoad: "Rasio beban",
    thStatus: "Penilaian",
    total: "Total",
    subtotal: "Subtotal",
    groupPrefix: "Grup ",
    noteSource: "Sumber",
    noteSourceBody: " · tabel indeks beban (LI) · data pabrikan",
    noteRated: "Beban maksimum",
    noteRatedBody: "Menurut cara pemasangan. Pemasangan ganda memakai LI ganda (LI tunggal −2 tingkat), bukan LI tunggal",
    noteRatedHeadDrive: "Techking ETCrane hanya memublikasikan LI tunggal — nilai sementara dengan aturan yang sama seperti trailer",
    noteFormula: "Rumus",
    noteFormulaBody: "Beban poros = berat acuan × distribusi beban · beban per ban = beban poros ÷ jumlah ban · rasio beban = beban per ban ÷ beban maksimum (menurut pemasangan)",
    noteDist: "Dasar distribusi beban",
    noteDist1: "Trailer·dolly = berat total grup · poros kemudi/penggerak Head = beban Head (",
    noteDist2: " grup 1 = ",
    noteDist3: " kg)",
    noteHead1: "Beban Head = poros kemudi ",
    noteHead2: " + poros penggerak ",
    tires: "ban",
    noteAxle1: " — rasio rating poros ",
    noteAxle2: " · poros depan ",
    noteAxle3: " lb · tandem belakang ",
    noteAxle4: " lb",
    noteJudge: "Penilaian",
    noteJudgeBody: "Normal <90% · Perhatian 90~100% · Kelebihan beban >100%",
    liSingle: "LI tunggal ",
    liDual: "LI ganda ",
    uNames: { headSteer: "Head poros kemudi", headDrive: "Head poros penggerak", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
  },
  en: {
    statusOk: "Normal",
    statusWarn: "Caution",
    statusDanger: "Overload",
    mountSingle: "Single",
    mountDual: "Dual",
    bannerTitle: "Load calculation",
    bannerGross: "Gross combination weight (GCW)",
    bannerRated: "Max load (kg/tire)",
    overTitle: "Overload warning (max load exceeded)",
    overBody: "Exceeds dual max load — payload adjustment and axle load redistribution required",
    unitStatusTitle: "Axle load by unit",
    thUnit: "Unit",
    thSpec: "Tire size",
    thMount: "Mounting",
    thCount: "Qty",
    thGroup: "Group",
    thTare: "Tare",
    thPayload: "Payload",
    thDist: "Load distribution",
    thRated: "Max load",
    thActual: "Axle load",
    thPerTire: "Load per tire",
    thLoad: "Load ratio",
    thStatus: "Verdict",
    total: "Total",
    subtotal: "Subtotal",
    groupPrefix: "Group ",
    noteSource: "Source",
    noteSourceBody: " · load index (LI) table · manufacturer data",
    noteRated: "Max load",
    noteRatedBody: "Applied by mounting type. Dual mounting uses the dual LI (single LI −2 steps) instead of the single LI",
    noteRatedHeadDrive: "Techking ETCrane publishes the single LI only — provisional value using the same rule as the trailers",
    noteFormula: "Formula",
    noteFormulaBody: "Axle load = reference weight × load distribution · load per tire = axle load ÷ qty · load ratio = load per tire ÷ max load (by mounting type)",
    noteDist: "Load distribution basis",
    noteDist1: "Trailer·dolly = group gross weight · Head steer/drive axles = Head load (",
    noteDist2: " of group 1 = ",
    noteDist3: " kg)",
    noteHead1: "Head load = steer axle ",
    noteHead2: " + drive axle ",
    tires: "tires",
    noteAxle1: " — axle rating ratio of ",
    noteAxle2: " · front axle ",
    noteAxle3: " lb · rear tandem ",
    noteAxle4: " lb",
    noteJudge: "Verdict",
    noteJudgeBody: "Normal <90% · Caution 90~100% · Overload >100%",
    liSingle: "single LI ",
    liDual: "dual LI ",
    uNames: { headSteer: "Head steer axle", headDrive: "Head drive axle", trailer1: "Trailer 1", trailer2: "Trailer 2", dolly: "Dolly" },
  },
} as const;

/** 중량 3열(공차중량·적재중량·축하중)의 공통 스타일 — 입력 중량과 계산 결과를 눈으로 가른다. 토큰 색만 쓴다. */
const WEIGHT_COL = "bg-primary/5 text-foreground border-x border-primary/15";
/** 소계 행의 중량 3열 — 데이터 행 틴트보다 한 단계 진하게 */
const SUM_WEIGHT_COL = "bg-primary/10 text-foreground border-x border-primary/20";

/** 규격·장착·정격이 같은 유닛을 묶는다 — 트레일러 1·2·돌리는 정격 근거가 한 줄로 충분하다. */
function ratedGroups(): { keys: LoadUnitKey[]; u: LoadUnit }[] {
  return LOAD_UNITS.reduce<{ keys: LoadUnitKey[]; u: LoadUnit }[]>((acc, u) => {
    const hit = acc.find((g) =>
      g.u.spec === u.spec && g.u.mount === u.mount &&
      g.u.ratedSingle === u.ratedSingle && g.u.ratedDual === u.ratedDual);
    if (hit) hit.keys.push(u.key); else acc.push({ keys: [u.key], u });
    return acc;
  }, []);
}

export default function LoadTab() {
  const { lang } = useLang();
  const tx = TX[lang];
  const headLoad = groupTotal(1) * HEAD_GROUP_SHARE; // Head 하중(조향+구동 기준중량)
  const rows = LOAD_UNITS.map((u) => {
    // Head 축 분할 행은 Head 하중 대비, 그 외는 그룹 총중량 대비로 분배
    const total = u.axleOfHead ? headLoad : groupTotal(u.group);
    const rated = ratedByMount(u.mount, u.ratedSingle, u.ratedDual); // 장착방식 정격
    const perTire = loadPerTire(total, u.dist, u.count);     // 타이어당 하중
    const load = loadRatio(perTire, rated);                  // 부하율
    const status: "ok" | "warn" | "danger" = load > 1 ? "danger" : load >= 0.9 ? "warn" : "ok";
    return { ...u, total, rated, perTire, load, status };
  });
  const groups = ratedGroups();
  const steerCount = LOAD_UNITS.find((u) => u.key === "headSteer")!.count;
  const driveCount = LOAD_UNITS.find((u) => u.key === "headDrive")!.count;
  const groupName = (g: { keys: LoadUnitKey[] }) => g.keys.map((k) => tx.uNames[k]).join("·");

  const overUnits = rows.filter((r) => r.status === "danger");
  const STATUS = {
    ok: { label: tx.statusOk, cls: "text-level-ok", bar: "bg-level-ok" },
    warn: { label: tx.statusWarn, cls: "text-level-warn", bar: "bg-level-warn" },
    danger: { label: tx.statusDanger, cls: "text-destructive", bar: "bg-destructive" },
  };
  const mountLabel = (m: "single" | "dual") => (m === "dual" ? tx.mountDual : tx.mountSingle);
  const mountRated = (u: LoadUnit) => ratedByMount(u.mount, u.ratedSingle, u.ratedDual);

  return (
    <div className="stagger-in space-y-6">
      {/* 안내 배너 */}
      <div>
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 flex items-start gap-3">
          <Weight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-primary">{tx.bannerTitle}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {tx.bannerGross} <strong className="text-foreground font-mono">{fmtInt(LOAD_GROSS_KG)} kg</strong>
              {" · "}{tx.bannerRated}:{" "}
              {groups.map((g, i) => (
                <Fragment key={g.u.key}>
                  {i > 0 && " · "}
                  {groupName(g)} <strong className="text-foreground font-mono">{fmtInt(mountRated(g.u))}</strong>({mountLabel(g.u.mount)})
                </Fragment>
              ))}
            </p>
          </div>
        </div>
      </div>

      {/* 과적 경고 (정격 초과 시에만 표시) */}
      {overUnits.length > 0 && (
        <div>
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-destructive">{tx.overTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {overUnits.map((u) => `${tx.uNames[u.key]} (${fmtPercentInt(u.load * 100)})`).join(" · ")}: {tx.overBody}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 하중 표 */}
      <div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <span className="text-sm font-bold text-foreground">{tx.unitStatusTitle}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-240 table-fixed text-xs border-collapse">
              {/* 열 순서: 그룹·유닛·규격·장착·수량 | 공차중량·적재중량·축하중(중량 3열 — 색상 구분) | 분배율·타이어당·최대하중·부하율·판정 */}
              <colgroup>
                {["6.5%", "10%", "12%", "7%", "4.5%", "7%", "7%", "6.5%", "8.5%", "11%", "7%", "7%", "6%"].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                {/* 제목 행 — secondary 배경으로 본문과 구분. 중량 3열은 데이터 행 틴트(WEIGHT_COL)를 이어 받는다. */}
                <tr className="border-b-2 border-border bg-secondary">
                  {[
                    { label: tx.thGroup, align: "center" },
                    { label: tx.thUnit, align: "left" },
                    { label: tx.thSpec, align: "left" },
                    { label: tx.thMount, align: "center" },
                    { label: tx.thCount, align: "right" },
                    { label: tx.thTare, align: "right", weight: true, unit: "kg" },
                    { label: tx.thPayload, align: "right", weight: true, unit: "kg" },
                    { label: tx.thActual, align: "right", weight: true, unit: "kg" },
                    { label: tx.thDist, align: "right" },
                    { label: tx.thPerTire, align: "right", unit: "kg" },
                    { label: tx.thRated, align: "right", unit: "kg" },
                    { label: tx.thLoad, align: "right" },
                    { label: tx.thStatus, align: "center" },
                  ].map((h) => (
                    /* 제목셀은 두 줄 구조 — 1행 명칭, 2행 단위(kg). 단위 없는 열은 1행만. 명칭은 단어 단위로만 줄바꿈(break-keep). */
                    <th key={h.label} className={`px-2 py-2 font-semibold leading-tight align-top break-keep ${h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"} ${h.weight ? SUM_WEIGHT_COL : "text-foreground"}`}>
                      <span className="block">{h.label}</span>
                      {h.unit && <span className="block text-[10px] font-normal text-muted-foreground">({h.unit})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...new Set(rows.map((r) => r.group))].map((gid) => {
                  // 그룹 단위로 데이터 행을 그린 뒤, 그룹마다 소계 행을 이어 붙인다(행이 그룹 순으로 연속).
                  const grp = rows.filter((r) => r.group === gid);
                  const tireSum = grp.reduce((s, r) => s + r.count, 0);
                  const tareSum = grp.reduce((s, r) => s + r.unitWeight, 0);
                  const payload = LOAD_GROUPS.find((x) => x.id === gid)!.payload; // 적재중량은 그룹 단위 값(병합 표시)
                  const axleSum = grp.reduce((s, r) => s + r.total * r.dist, 0); // 그룹 축하중 합 = 그룹 총중량
                  // Head 조향축·구동축은 한 차량을 축으로 나눈 행이다 — 공차중량은 차량 단위 값이므로 합산해 병합 표시.
                  const headRows = grp.filter((r) => r.axleOfHead);
                  const headTare = headRows.reduce((s, r) => s + r.unitWeight, 0);
                  return (
                  <Fragment key={gid}>
                    {grp.map((r, i) => (
                      <tr key={r.name} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        {i === 0 && (
                          <td rowSpan={grp.length} className="px-2 py-2 text-center align-middle text-[11px] font-semibold border-r border-border/40 bg-muted/10">{tx.groupPrefix}{gid}</td>
                        )}
                        <td className="px-2 py-2 font-bold text-primary">{tx.uNames[r.key]}</td>
                        <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.spec}</td>
                        <td className="px-2 py-2 text-center text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded-full border ${r.mount === "dual" ? "border-primary/40 text-primary bg-primary/5" : "border-border text-muted-foreground bg-muted/30"}`}>{mountLabel(r.mount)}</span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono">{r.count}</td>
                        {/* 중량 3열 — 공차중량·적재중량·축하중 */}
                        {r.axleOfHead
                          ? r === headRows[0] && (
                            <td rowSpan={headRows.length} className={`px-2 py-2 text-right align-middle font-mono ${WEIGHT_COL}`}>{fmtInt(headTare)}</td>
                          )
                          : <td className={`px-2 py-2 text-right font-mono ${WEIGHT_COL}`}>{fmtInt(r.unitWeight)}</td>}
                        {i === 0 && (
                          <td rowSpan={grp.length} className={`px-2 py-2 text-right align-middle font-mono ${WEIGHT_COL}`}>{fmtInt(payload)}</td>
                        )}
                        <td className={`px-2 py-2 text-right font-mono font-semibold ${WEIGHT_COL}`}>{fmtInt(r.total * r.dist)}</td>
                        {/* 분배율은 그룹 총중량 기준으로 표시. Head 축의 dist(조향 20%·구동 80%)는
                            Head 하중 기준이므로 HEAD_GROUP_SHARE(50%)를 곱해 그룹 기준으로 환산한다.
                            → 조향 10%, 구동 40%, 트레일러1 50% (그룹1 합계 100%). 열 표시는 정수(fmtPercentInt — 하중 탭의 퍼센트는 전부 정수, 사용자 결정 2026-09-12). */}
                        <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmtPercentInt((r.axleOfHead ? HEAD_GROUP_SHARE * r.dist : r.dist) * 100)}</td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-primary">{fmtInt(r.perTire)}</td>
                        <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmtInt(r.rated)}</td>
                        <td className={`px-2 py-2 text-right font-mono font-bold ${STATUS[r.status].cls}`}>{fmtPercentInt(r.load * 100)}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`text-[10px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                        </td>
                      </tr>
                    ))}
                    {/* 그룹 소계 — 수량·공차중량·적재중량·축하중 합산 */}
                    {/* 소계 — secondary 배경 + foreground 글자로 데이터 행과 구분 */}
                    <tr className="border-b border-border bg-secondary text-foreground font-semibold">
                      <td />
                      <td className="px-2 py-2 text-left text-[11px]">{tx.subtotal}</td>
                      <td colSpan={2} />
                      <td className="px-2 py-2 text-right font-mono">{tireSum}</td>
                      <td className={`px-2 py-2 text-right font-mono ${SUM_WEIGHT_COL}`}>{fmtInt(tareSum)}</td>
                      <td className={`px-2 py-2 text-right font-mono ${SUM_WEIGHT_COL}`}>{fmtInt(payload)}</td>
                      <td className={`px-2 py-2 text-right font-mono ${SUM_WEIGHT_COL}`}>{fmtInt(axleSum)}</td>
                      <td colSpan={5} />
                    </tr>
                  </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                {/* 합계 — 수량·공차중량·적재중량·축하중 합산(분배율·최대하중·부하율은 합이 무의미). */}
                {/* 합계 — primary 배경 + primary-foreground 글자(가장 강조) */}
                <tr className="border-t-2 border-primary bg-primary text-primary-foreground font-bold">
                  <td />
                  <td className="px-2 py-2.5 text-left text-[11px]">{tx.total}</td>
                  <td colSpan={2} />
                  <td className="px-2 py-2.5 text-right font-mono">{rows.reduce((s, r) => s + r.count, 0)}</td>
                  <td className="px-2 py-2.5 text-right font-mono border-x border-primary-foreground/20">{fmtInt(rows.reduce((s, r) => s + r.unitWeight, 0))}</td>
                  <td className="px-2 py-2.5 text-right font-mono border-x border-primary-foreground/20">{fmtInt(LOAD_GROUPS.reduce((s, g) => s + g.payload, 0))}</td>
                  <td className="px-2 py-2.5 text-right font-mono border-x border-primary-foreground/20">{fmtInt(rows.reduce((s, r) => s + r.total * r.dist, 0))}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* 근거 — 개조체 목록. 정격 줄은 LOAD_UNITS 에서 파생한다(숫자 하드코딩 금지). */}
      <div>
        <ul className="text-[11px] text-muted-foreground leading-relaxed list-disc pl-4 space-y-0.5">
          <li>
            <strong className="text-foreground">{tx.noteSource}:</strong>{" "}
            Techking — Load Distribution Road Train unit{tx.noteSourceBody}
          </li>
          <li>
            <strong className="text-foreground">{tx.noteRated}:</strong> {tx.noteRatedBody}
            <ul className="list-[circle] pl-4">
              {groups.map((g) => (
                <li key={g.u.key}>
                  {groupName(g)} <span className="font-mono">{g.u.spec}</span> · {mountLabel(g.u.mount)} ·{" "}
                  {tx.liSingle}{g.u.liSingle}(<span className="font-mono">{fmtInt(g.u.ratedSingle)}</span> kg)
                  {g.u.mount === "dual" && (
                    <> → <strong className="text-foreground">{tx.liDual}{g.u.liDual}(<span className="font-mono">{fmtInt(g.u.ratedDual)}</span> kg)</strong></>
                  )}
                  {g.u.key === "headDrive" && <> — {tx.noteRatedHeadDrive}</>}
                </li>
              ))}
            </ul>
          </li>
          <li>
            <strong className="text-foreground">{tx.noteFormula}:</strong> {tx.noteFormulaBody}
          </li>
          <li>
            <strong className="text-foreground">{tx.noteDist}:</strong>{" "}
            {tx.noteDist1}{fmtPercentInt(HEAD_GROUP_SHARE * 100)}{tx.noteDist2}<span className="font-mono">{fmtInt(headLoad)}</span>{tx.noteDist3}
            <ul className="list-[circle] pl-4">
              <li>
                {tx.noteHead1}<span className="font-mono">{fmtPercentInt(HEAD_STEER_SHARE * 100)}</span>({steerCount} {tx.tires})
                {tx.noteHead2}<span className="font-mono">{fmtPercentInt(HEAD_DRIVE_SHARE * 100)}</span>({driveCount} {tx.tires})
                {tx.noteAxle1}<strong className="text-foreground">{HEAD_VEHICLE.model}</strong>{tx.noteAxle2}
                <span className="font-mono">{fmtInt(HEAD_VEHICLE.steerAxleLb)}</span>{tx.noteAxle3}
                <span className="font-mono">{fmtInt(HEAD_VEHICLE.driveTandemLb)}</span>{tx.noteAxle4}
              </li>
            </ul>
          </li>
          <li>
            <strong className="text-foreground">{tx.noteJudge}:</strong> {tx.noteJudgeBody}
          </li>
        </ul>
      </div>
    </div>
  );
}
