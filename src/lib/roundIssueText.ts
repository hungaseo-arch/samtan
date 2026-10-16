// @section: round-issue-text
// validateRound() 이슈 문구 (§A-8). 컴포넌트 파일과 분리 — fast refresh 규칙.
import type { Lang } from "@/i18n";
import { fmtMeter, fmtPressure, fmtTread } from "@/lib/format";
import { PSI_INPUT_MAX, TREAD_RISE_WARN_MM, type RoundIssue } from "@/lib/roundValidate";

export const ISSUE_TX = {
  ko: {
    km_back: "KM 이 직전 회차보다 작습니다 ({ref} → {v}). 계기 교체·리셋이 아니면 오타입니다.",
    hm_back: "HM 이 직전 회차보다 작습니다 ({ref} → {v}). 계기 교체·리셋이 아니면 오타입니다.",
    tread_rise: `트레드가 직전 회차보다 ${TREAD_RISE_WARN_MM} mm 넘게 늘었습니다 ({ref} → {v} mm).`,
    pressure_range: `공기압 {v} psi — 0 초과 ${PSI_INPUT_MAX} 이하만 저장됩니다.`,
    serial_mismatch: "교체 미등록 — 장착 시리얼 {ref} 와 다릅니다 (입력 {v}). 교체를 먼저 등록하세요.",
    replace: "교체 등록",
    confirmHead: "다음 경고를 확인했습니까? 확인하면 그대로 저장합니다.",
  },
  id: {
    km_back: "KM lebih kecil dari Pemeriksaan sebelumnya ({ref} → {v}). Salah ketik kecuali meter diganti/reset.",
    hm_back: "HM lebih kecil dari Pemeriksaan sebelumnya ({ref} → {v}). Salah ketik kecuali meter diganti/reset.",
    tread_rise: `Kedalaman alur naik lebih dari ${TREAD_RISE_WARN_MM} mm dari Pemeriksaan sebelumnya ({ref} → {v} mm).`,
    pressure_range: `Tekanan angin {v} psi — hanya > 0 s.d. ${PSI_INPUT_MAX} yang disimpan.`,
    serial_mismatch: "Penggantian belum dicatat — berbeda dengan serial terpasang {ref} (input {v}). Catat Penggantian dulu.",
    replace: "Catat Penggantian",
    confirmHead: "Sudah memeriksa peringatan berikut? Jika ya, data disimpan apa adanya.",
  },
  en: {
    km_back: "KM is lower than the previous round ({ref} → {v}). A typo unless the meter was replaced/reset.",
    hm_back: "HM is lower than the previous round ({ref} → {v}). A typo unless the meter was replaced/reset.",
    tread_rise: `Tread rose by more than ${TREAD_RISE_WARN_MM} mm since the previous round ({ref} → {v} mm).`,
    pressure_range: `Pressure {v} psi — only values above 0 and up to ${PSI_INPUT_MAX} are saved.`,
    serial_mismatch: "Replacement not registered — differs from installed serial {ref} (entered {v}). Register the replacement first.",
    replace: "Register replacement",
    confirmHead: "Have you checked these warnings? If so, the data is saved as entered.",
  },
} as const;

function fmtVal(code: RoundIssue["code"], v: string | number | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (code === "tread_rise") return fmtTread(v, false);
  if (code === "pressure_range") return fmtPressure(v, false);
  return fmtMeter(v, code === "km_back" ? "KM" : "HM", false);
}

/** 이슈 한 건의 문구. 포지션이 있으면 앞에 붙인다 */
export function issueText(x: RoundIssue, lang: Lang): string {
  const body = ISSUE_TX[lang][x.code].replace("{ref}", fmtVal(x.code, x.ref)).replace("{v}", fmtVal(x.code, x.value));
  return x.pos ? `${x.pos} · ${body}` : body;
}

/** 경고 확인 문구 (window.confirm 용) */
export function issueConfirmText(xs: RoundIssue[], lang: Lang): string {
  return [ISSUE_TX[lang].confirmHead, "", ...xs.map((x) => "· " + issueText(x, lang))].join("\n");
}
