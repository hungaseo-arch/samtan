// @section: round-issue-text
// validateRound() 이슈 문구 (§A-8). 컴포넌트 파일과 분리 — fast refresh 규칙.
import type { Lang } from "@/i18n";
import { fmtMeter, fmtPercent, fmtPressure, fmtTread } from "@/lib/format";
import {
  PSI_DEV_WARN_RATIO, PSI_INPUT_MAX, PSI_INPUT_MIN, TREAD_INPUT_MAX, TREAD_RISE_WARN_MM, type RoundIssue,
} from "@/lib/roundValidate";

const DEV = fmtPercent(PSI_DEV_WARN_RATIO * 100);

export const ISSUE_TX = {
  ko: {
    km_back: "KM 이 직전 회차보다 작습니다 ({ref} → {v}). 계기 교체·리셋이 아니면 오타입니다.",
    hm_back: "HM 이 직전 회차보다 작습니다 ({ref} → {v}). 계기 교체·리셋이 아니면 오타입니다.",
    tread_rise: `트레드가 직전 회차보다 ${TREAD_RISE_WARN_MM} mm 넘게 늘었습니다 ({ref} → {v} mm).`,
    pressure_range: `공기압 {v} psi — ${PSI_INPUT_MIN} ~ ${PSI_INPUT_MAX} psi 만 저장됩니다.`,
    pressure_dev: `공기압 {v} psi — 권장 {ref} psi 에서 ${DEV} 넘게 벗어났습니다.`,
    tread_range: `트레드 {v} mm — 0 ~ ${TREAD_INPUT_MAX} mm 만 저장됩니다.`,
    tread_precision: "트레드 {v} mm — 소수 1자리까지만 입력합니다.",
    future_date: "점검일 {v} 이 오늘({ref}, 현장 WITA)보다 뒤입니다.",
    backdated: "점검일 {v} 이 이 차량의 최근 회차({ref})보다 앞입니다. 날짜를 확인하세요.",
    serial_mismatch: "교체 미등록 — 장착 시리얼 {ref} 와 다릅니다 (입력 {v}). 교체를 먼저 등록하세요.",
    replace: "교체 등록",
    confirmHead: "다음 경고를 확인했습니까? 확인하면 그대로 저장합니다.",
  },
  id: {
    km_back: "KM lebih kecil dari Pemeriksaan sebelumnya ({ref} → {v}). Salah ketik kecuali meter diganti/reset.",
    hm_back: "HM lebih kecil dari Pemeriksaan sebelumnya ({ref} → {v}). Salah ketik kecuali meter diganti/reset.",
    tread_rise: `Kedalaman alur naik lebih dari ${TREAD_RISE_WARN_MM} mm dari Pemeriksaan sebelumnya ({ref} → {v} mm).`,
    pressure_range: `Tekanan angin {v} psi — hanya ${PSI_INPUT_MIN} s.d. ${PSI_INPUT_MAX} psi yang disimpan.`,
    pressure_dev: `Tekanan angin {v} psi — menyimpang lebih dari ${DEV} dari rekomendasi {ref} psi.`,
    tread_range: `Kedalaman alur {v} mm — hanya 0 s.d. ${TREAD_INPUT_MAX} mm yang disimpan.`,
    tread_precision: "Kedalaman alur {v} mm — isi maksimal 1 angka desimal.",
    future_date: "Tgl Pemeriksaan {v} melewati hari ini ({ref}, WITA lapangan).",
    backdated: "Tgl Pemeriksaan {v} lebih awal dari pemeriksaan terakhir Unit ini ({ref}). Periksa tanggalnya.",
    serial_mismatch: "Penggantian belum dicatat — berbeda dengan serial terpasang {ref} (input {v}). Catat Penggantian dulu.",
    replace: "Catat Penggantian",
    confirmHead: "Sudah memeriksa peringatan berikut? Jika ya, data disimpan apa adanya.",
  },
  en: {
    km_back: "KM is lower than the previous round ({ref} → {v}). A typo unless the meter was replaced/reset.",
    hm_back: "HM is lower than the previous round ({ref} → {v}). A typo unless the meter was replaced/reset.",
    tread_rise: `Tread rose by more than ${TREAD_RISE_WARN_MM} mm since the previous round ({ref} → {v} mm).`,
    pressure_range: `Pressure {v} psi — only ${PSI_INPUT_MIN} to ${PSI_INPUT_MAX} psi is saved.`,
    pressure_dev: `Pressure {v} psi — more than ${DEV} off the recommended {ref} psi.`,
    tread_range: `Tread {v} mm — only 0 to ${TREAD_INPUT_MAX} mm is saved.`,
    tread_precision: "Tread {v} mm — enter at most 1 decimal place.",
    future_date: "Inspection date {v} is after today ({ref}, field WITA).",
    backdated: "Inspection date {v} is earlier than this vehicle's latest round ({ref}). Check the date.",
    serial_mismatch: "Replacement not registered — differs from installed serial {ref} (entered {v}). Register the replacement first.",
    replace: "Register replacement",
    confirmHead: "Have you checked these warnings? If so, the data is saved as entered.",
  },
} as const;

function fmtVal(code: RoundIssue["code"], v: string | number | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (code === "tread_rise") return fmtTread(v, false);
  if (code === "pressure_range" || code === "pressure_dev") return fmtPressure(v, false);
  // 자리수 오류는 반올림하면 무엇이 틀렸는지 안 보인다 — 입력 그대로
  if (code === "tread_precision") return String(v);
  if (code === "tread_range") return fmtTread(v, false);
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
