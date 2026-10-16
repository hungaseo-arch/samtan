// @section: dq-detail
// v_data_quality 한 행의 상세 문구를 로케일별로 조립한다.
//
// 뷰의 detail 컬럼은 한국어 고정 문장이라 id·en 화면에서도 한국어가 그대로 보였다.
// 20260829100000 마이그레이션이 뷰 맨 뒤에 params(jsonb) 를 붙였으므로, 값은 DB 가
// 문장은 여기가 담당한다. params 가 없는 환경(마이그레이션 전)에서는 detail 을
// 그대로 돌려준다 — 목록이 통째로 비는 것보다 낫다.
//
// 숫자는 전부 format.ts 헬퍼를 거친다. HM/KM 1자리·트레드 2자리 규칙이 여기서
// 어긋나면 같은 값이 표와 배지에서 다르게 보인다.
import type { Lang } from "@/i18n";
import type { DataQualityRow } from "@/api/tires";
import { EMPTY, fmtInt, fmtMeter, fmtNumber, fmtTread, fmtTreadAvg } from "@/lib/format";

type Params = Record<string, unknown>;

const num = (p: Params, k: string): number | null => {
  const v = p[k];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
};
const str = (p: Params, k: string): string => {
  const v = p[k];
  return v === null || v === undefined || v === "" ? EMPTY : String(v);
};

/** 급증·감소 공통 — "2026-07-05 → 2026-07-26 · 5,188.4 → 6,718.8 HM · 21일 · 72.9 h/일" */
function jump(p: Params, lang: Lang, unit: "HM" | "KM", rate: string): string {
  const days = num(p, "days");
  const dayWord = { ko: "일", id: "hari", en: days === 1 ? "day" : "days" }[lang];
  return [
    `${str(p, "from_date")} → ${str(p, "to_date")}`,
    `${fmtMeter(num(p, "from"), unit, false)} → ${fmtMeter(num(p, "to"), unit)}`,
    `${fmtInt(days)}${lang === "ko" ? "" : " "}${dayWord}`,
    `${fmtNumber(num(p, "per_day"))} ${rate}`,
  ].join(" · ");
}

const RATE = {
  km: { ko: "km/일", id: "km/hari", en: "km/day" },
  hm: { ko: "h/일", id: "h/hari", en: "h/day" },
} as const;

type Builder = (p: Params, lang: Lang) => string;

const BUILDERS: Record<string, Record<Lang, Builder>> = {
  zero_tread_unverified: {
    ko: (p) => `트레드 0 · 중앙 평균 ${fmtTread(num(p, "center_avg"))} · 상태 ${str(p, "status")}`,
    id: (p) => `Tapak 0 · rata-rata tengah ${fmtTread(num(p, "center_avg"))} · status ${str(p, "status")}`,
    en: (p) => `Tread 0 · center avg ${fmtTread(num(p, "center_avg"))} · status ${str(p, "status")}`,
  },
  km_missing: {
    ko: (p) => (p.kind === "null" ? "주행거리 미입력" : "주행거리 0"),
    id: (p) => (p.kind === "null" ? "Jarak tempuh tidak diisi" : "Jarak tempuh 0"),
    en: (p) => (p.kind === "null" ? "Distance not entered" : "Distance 0"),
  },
  km_jump: {
    ko: (p, l) => jump(p, l, "KM", RATE.km.ko),
    id: (p, l) => jump(p, l, "KM", RATE.km.id),
    en: (p, l) => jump(p, l, "KM", RATE.km.en),
  },
  hm_jump: {
    ko: (p, l) => jump(p, l, "HM", RATE.hm.ko),
    id: (p, l) => jump(p, l, "HM", RATE.hm.id),
    en: (p, l) => jump(p, l, "HM", RATE.hm.en),
  },
  groove_missing: {
    ko: (p) => `측정점 ${fmtInt(num(p, "points"))}개 (4 또는 16 이어야 함)`,
    id: (p) => `${fmtInt(num(p, "points"))} titik ukur (harus 4 atau 16)`,
    en: (p) => `${fmtInt(num(p, "points"))} measurement points (must be 4 or 16)`,
  },
  serial_break_unlogged: {
    ko: (p) => `${str(p, "prev")} → ${str(p, "next")} · 교체 원장 미등록`,
    id: (p) => `${str(p, "prev")} → ${str(p, "next")} · tidak ada di buku penggantian`,
    en: (p) => `${str(p, "prev")} → ${str(p, "next")} · not in replacement ledger`,
  },
  tread_min_avg_conflict: {
    ko: (p) => `최소 0.0 mm · 4점 평균 ${fmtTreadAvg(num(p, "avg"))} — 입력 오류 의심`,
    id: (p) => `Minimum 0.0 mm · rata-rata 4 titik ${fmtTreadAvg(num(p, "avg"))} — diduga salah input`,
    en: (p) => `Min 0.0 mm · 4-point average ${fmtTreadAvg(num(p, "avg"))} — suspected input error`,
  },
  inner_position_unmeasured: {
    ko: () => "복륜 내측 공기압 미입력",
    id: () => "Tekanan angin ban dalam tidak diisi",
    en: () => "Inner dual-wheel pressure not recorded",
  },
  removal_reason_missing: {
    ko: (p) => `${str(p, "serial")} 교체 · 탈착 사유 미입력`,
    id: (p) => `Ganti ${str(p, "serial")} · alasan pelepasan tidak diisi`,
    en: (p) => `${str(p, "serial")} replacement · removal reason missing`,
  },
};

/** 품질 경고 한 행의 상세 문구. params 가 없으면 뷰가 만든 한국어 문장으로 물러난다. */
export function dqDetail(row: DataQualityRow, lang: Lang): string {
  const build = BUILDERS[row.check_key]?.[lang];
  if (!build || !row.params) return row.detail ?? "";
  return build(row.params as Params, lang);
}
