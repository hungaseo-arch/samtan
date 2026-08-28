// @section: integrity-badge
// 데이터 정합성 배지 — check_data_integrity() RPC 결과를 배치도 상단에 요약한다.
// 배지 색은 severity='error' 합계로만 정한다 (녹색 = 0건 / 주황 = N건).
// warning·info 는 펼침 목록에만 나온다 — 원장 확인 대기 건(예: install_but_unmounted)
// 때문에 배지가 상시 주황으로 물드는 것을 막기 위함이다.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  checkDataIntegrity, listDataQuality,
  type IntegrityCheck, type IntegritySeverity, type DataQualityRow,
} from "@/api/tires";
import { EMPTY, fmtInt } from "@/lib/format";
import { useLang } from "@/i18n";

const TX = {
  ko: {
    consistent: "데이터 정상",
    issues: "데이터 문제 {n}건",
    checking: "정합성 확인 중…",
    failed: "정합성 확인 실패",
    noIssue: "위반 없음",
    severityError: "오류",
    severityWarning: "주의",
    severityInfo: "참고",
    dqSuffix: "데이터 품질 경고 {n}건",
    keys: {
      missing_lifetime: "장착 중인데 수명 DB에 없음",
      serial2_out_of_sync: "캐시 시리얼(serial2) 불일치",
      install_but_unmounted: "상태 Install인데 장착 위치 없음",
      mounted_but_not_install: "장착 중인데 상태가 Install 아님",
      position_over_2_serials: "교체 2회 이상 포지션",
      zero_tread_unverified: "트레드 0인데 중앙이 남음",
      km_missing: "주행거리 미기록",
      km_jump: "주행거리 급증·감소",
      hm_jump: "가동시간 급증·감소",
      groove_missing: "측정점 수 이상 (4·16 아님)",
      serial_break_unlogged: "시리얼 변경이 교체 원장에 없음",
    } as Record<string, string>,
  },
  id: {
    consistent: "Data konsisten",
    issues: "{n} masalah data",
    checking: "Memeriksa konsistensi…",
    failed: "Pemeriksaan gagal",
    noIssue: "Tidak ada pelanggaran",
    severityError: "Error",
    severityWarning: "Perhatian",
    severityInfo: "Info",
    dqSuffix: "{n} peringatan kualitas data",
    keys: {
      missing_lifetime: "Terpasang tapi tidak ada di DB umur",
      serial2_out_of_sync: "Serial cache (serial2) tidak sinkron",
      install_but_unmounted: "Status Install tapi tidak terpasang",
      mounted_but_not_install: "Terpasang tapi status bukan Install",
      position_over_2_serials: "Posisi dengan ganti ≥ 2 kali",
      zero_tread_unverified: "Tapak 0 tapi bagian tengah masih ada",
      km_missing: "Jarak tempuh tidak tercatat",
      km_jump: "Lonjakan / penurunan jarak tempuh",
      hm_jump: "Lonjakan / penurunan jam operasi",
      groove_missing: "Jumlah titik ukur tidak wajar (bukan 4 / 16)",
      serial_break_unlogged: "Serial berubah tapi tidak ada di buku penggantian",
    } as Record<string, string>,
  },
  en: {
    consistent: "Data consistent",
    issues: "{n} data issues",
    checking: "Checking consistency…",
    failed: "Consistency check failed",
    noIssue: "No violations",
    severityError: "Error",
    severityWarning: "Warning",
    severityInfo: "Info",
    dqSuffix: "{n} data quality warnings",
    keys: {
      missing_lifetime: "Mounted but missing from lifetime DB",
      serial2_out_of_sync: "Cached serial (serial2) out of sync",
      install_but_unmounted: "Status Install but not mounted",
      mounted_but_not_install: "Mounted but status is not Install",
      position_over_2_serials: "Positions replaced 2+ times",
      zero_tread_unverified: "Tread 0 but center still remains",
      km_missing: "Distance not recorded",
      km_jump: "Distance jump / decrease",
      hm_jump: "Hour-meter jump / decrease",
      groove_missing: "Unexpected measurement point count (not 4 / 16)",
      serial_break_unlogged: "Serial changed but not in replacement ledger",
    } as Record<string, string>,
  },
} as const;

const SEVERITY_STYLE: Record<IntegritySeverity, string> = {
  error: "border-orange-500 bg-orange-50 text-orange-700",
  warning: "border-yellow-500 bg-yellow-50 text-yellow-700",
  info: "border-border bg-muted/30 text-muted-foreground",
};

/** detail(jsonb 배열)의 한 행을 "키 값 · 키 값" 형태로 납작하게 편다. */
function flatten(row: unknown): string {
  if (row == null) return "";
  if (typeof row !== "object") return String(row);
  return Object.entries(row as Record<string, unknown>)
    .map(([k, v]) => `${k} ${v ?? EMPTY}`)
    .join(" · ");
}

export default function IntegrityBadge() {
  const { lang } = useLang();
  const tx = TX[lang];
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<IntegrityCheck[]>({
    queryKey: ["data-integrity"],
    queryFn: checkDataIntegrity,
    staleTime: 5 * 60 * 1000,
  });

  // 점검값 자체의 품질 경고 (v3 §D-3). 실패해도 배지는 원장 정합성만으로 뜬다 —
  // 뷰가 아직 없는 환경에서 배지 전체가 "확인 실패"로 죽는 것을 막는다.
  const dq = useQuery<DataQualityRow[]>({
    queryKey: ["data-quality"],
    queryFn: listDataQuality,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <span className="text-xs text-muted-foreground px-3 py-1.5">{tx.checking}</span>
    );
  }
  if (isError || !data) {
    return (
      <span className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground">
        {tx.failed}
      </span>
    );
  }

  // 배지 색·문구는 error 만 본다 (§2-3).
  const errorCnt = data
    .filter((c) => c.severity === "error")
    .reduce((s, c) => s + (c.cnt ?? 0), 0);
  const ok = errorCnt === 0;

  // v_data_quality 를 check_key 별로 접어 IntegrityCheck 모양으로 맞춘다.
  // 전부 warning 이다 — 저장을 막는 항목이 하나도 없으므로 배지 색을 바꾸지 않는다
  // (km_missing 만 CH 849 전량 80건이라 error 로 두면 배지가 상시 주황이 된다).
  const dqChecks: IntegrityCheck[] = Object.entries(
    (dq.data ?? []).reduce<Record<string, DataQualityRow[]>>((acc, r) => {
      (acc[r.check_key] ??= []).push(r);
      return acc;
    }, {}),
  ).map(([check_key, rows]) => ({
    check_key,
    severity: "warning" as const,
    cnt: rows.length,
    // 목록이 길어지면 배지 팝오버가 화면을 덮는다 — 앞 5건만 싣는다.
    detail: rows.slice(0, 5).map((r) => ({
      ch: r.ch, pos: r.pos, date: r.inspection_date, detail: r.detail,
    })),
  }));

  const dqCnt = dqChecks.reduce((s, c) => s + c.cnt, 0);
  const listed = [...data.filter((c) => (c.cnt ?? 0) > 0), ...dqChecks];

  return (
    <div className="ml-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
          ok
            ? "border-green-600 bg-green-50 text-green-700"
            : "border-orange-500 bg-orange-50 text-orange-700"
        }`}
      >
        {ok ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
        {ok ? tx.consistent : tx.issues.replace("{n}", fmtInt(errorCnt))}
        {dqCnt > 0 && (
          <span className="font-normal text-muted-foreground">
            · {tx.dqSuffix.replace("{n}", fmtInt(dqCnt))}
          </span>
        )}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-90 max-w-[90vw] max-h-96 overflow-auto rounded-xl border border-border bg-card p-3 shadow-2xl">
          {listed.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tx.noIssue}</p>
          ) : (
            <ul className="space-y-2">
              {listed.map((c) => (
                <li key={c.check_key} className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${SEVERITY_STYLE[c.severity]}`}
                    >
                      {c.severity === "error"
                        ? tx.severityError
                        : c.severity === "warning"
                          ? tx.severityWarning
                          : tx.severityInfo}
                    </span>
                    <span className="font-semibold">{tx.keys[c.check_key] ?? c.check_key}</span>
                    <span className="ml-auto font-mono text-muted-foreground">{fmtInt(c.cnt)}</span>
                  </div>
                  {Array.isArray(c.detail) && c.detail.length > 0 && (
                    <ul className="mt-1 ml-1 space-y-0.5">
                      {(c.detail as unknown[]).map((row, i) => (
                        <li key={i} className="font-mono text-[10px] text-muted-foreground">
                          {flatten(row)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
