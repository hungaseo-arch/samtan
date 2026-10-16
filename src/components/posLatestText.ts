// @section: pos-latest-text
// PosLatestRows 문구 — 상태 칩(LayoutTab · TireDetailModal)도 «측정 대기» 를 같이 쓴다.
export const POS_LATEST_TX = {
  ko: {
    latestPress: "최근 공기압", latestTread: "최근 트레드", newPrefix: "신품 ",
    awaiting: "측정 대기", awaitingHint: "교체 뒤 아직 측정 회차가 없습니다",
    stale: "오래된 값", staleHint: "측정일이 {n}일을 넘었습니다 — 판정·알림에서 제외",
    staleTreadHint: "측정일이 {n}일을 넘었습니다 — 정상 판정을 확정하지 않습니다",
    outlier: "이상점 제외", outlierHint: "4점 중 0 하나를 측정 누락으로 보고 나머지 3점으로 판정했습니다",
  },
  id: {
    latestPress: "Tekanan angin terkini", latestTread: "Kedalaman alur terkini", newPrefix: "baru ",
    awaiting: "Menunggu diukur", awaitingHint: "Belum ada Pemeriksaan setelah Penggantian",
    stale: "Data lama", staleHint: "Diukur lebih dari {n} hari lalu — tidak dinilai dan tidak memicu peringatan",
    staleTreadHint: "Diukur lebih dari {n} hari lalu — status normal tidak dikonfirmasi",
    outlier: "Titik anomali dikecualikan", outlierHint: "Satu nilai 0 dari 4 titik dianggap tidak terukur; dinilai dari 3 titik lainnya",
  },
  en: {
    latestPress: "Latest pressure", latestTread: "Latest tread", newPrefix: "new ",
    awaiting: "Awaiting measurement", awaitingHint: "No inspection since the replacement yet",
    stale: "Stale", staleHint: "Measured more than {n} days ago — left out of judgement and alerts",
    staleTreadHint: "Measured more than {n} days ago — a normal status is not confirmed",
    outlier: "Outlier excluded", outlierHint: "One 0 among the 4 points was treated as missing; judged from the other 3",
  },
} as const;

/** 상태 칩 문구 덮어쓰기 — 측정 대기 타이어는 «시험 외» 가 아니다 */
export function awaitingLabel(lang: keyof typeof POS_LATEST_TX): string {
  return POS_LATEST_TX[lang].awaiting;
}
