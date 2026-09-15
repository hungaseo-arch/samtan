// @section: number-format
//
// 작업지시서 §6 숫자 표기 규칙의 단일 구현.
//
// 화면·문서·PDF의 모든 숫자 출력은 이 모듈을 경유한다. 다른 곳에서 toLocaleString()을
// 직접 호출하지 않는다 (§3.1-8). 규칙이 바뀌면 여기만 고치면 전체가 따라온다.
//
// 표기 체계는 로케일과 무관하게 영미식으로 고정한다 — 천 단위 콤마, 소수점 마침표.
// 인도네시아어 화면도 동일하다. 현장에서 1.234,56 과 1,234.56 이 섞이면 압력·트레드
// 값을 1000배로 오독할 수 있어, 언어별 표기를 쓰지 않는다 (§6.1).
const LOCALE = "en-US";

/** 값이 없을 때 표에 찍는 문자. 0 과 구분된다. */
export const EMPTY = "—";

function isBlank(v: number | null | undefined): v is null | undefined {
  return v === null || v === undefined || Number.isNaN(v);
}

function fixed(v: number, digits: number): string {
  return v.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ── §6.2 자리수 규칙 ──────────────────────────────────────────────

/** 기본 정수 — 천 단위 콤마. `1,250,000` */
export function fmtInt(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : fixed(Math.round(v), 0);
}

/**
 * 자리수 규칙이 따로 정해지지 않은 일반 숫자 — 천 단위 콤마만 붙이고 소수부는 원값을
 * 따른다. 자리수가 규정된 값(트레드·공기압·HM/KM·퍼센트·단가)에는 전용 함수를 쓸 것.
 */
export function fmtNumber(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : v.toLocaleString(LOCALE);
}

/** 퍼센트 — 소수점 1자리 고정. `12.5%`, `3.0%` */
export function fmtPercent(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(v, 1)}%`;
}

/** 퍼센트 — 정수. `10%`, `78%`
 *  하중 탭(분배율·부하율·근거 문단) 전용 — 사용자 결정 2026-09-12. 하중 탭의 퍼센트는 전부 정수로 표시한다.
 *  그 밖의 화면(트레드 마모율·CV 등)은 CLAUDE.md §숫자 표기대로 fmtPercent 의 1자리를 쓴다. */
export function fmtPercentInt(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(v, 0)}%`;
}

/** 구매단가 (FOB/CIF/C&F/EXW) — 소수점 2자리. `USD 84.25/EA` */
export function fmtUnitPrice(
  v: number | null | undefined,
  currency = "USD",
  unit = "EA",
): string {
  return isBlank(v) ? EMPTY : `${currency} ${fixed(v, 2)}/${unit}`;
}

/** 중량 — 소수점 1자리. `62.5 kg`, `18.3 ton` */
export function fmtWeight(v: number | null | undefined, unit = "kg"): string {
  return isBlank(v) ? EMPTY : `${fixed(v, 1)} ${unit}`;
}

/** 수량 — 정수. `1,200 EA` */
export function fmtQty(v: number | null | undefined, unit = "EA"): string {
  return isBlank(v) ? EMPTY : `${fixed(Math.round(v), 0)} ${unit}`;
}

/**
 * 트레드 — 소수점 1자리. `11.2 mm`
 * 현장 측정 분해능이 0.1 mm 이고 지시서 표기 규약이 1자리라 여기서 반올림한다.
 * DB 원값(2자리)이 필요하면 이 함수를 거치지 말고 값 자체를 쓸 것.
 */
export function fmtTread(v: number | null | undefined, withUnit = true): string {
  if (isBlank(v)) return EMPTY;
  return withUnit ? `${fixed(v, 1)} mm` : fixed(v, 1);
}

/**
 * 트레드 통계 평균 — 소수점 2자리. `11.30 mm`
 * 개별 측정값(1자리)과 달리 4점 평균은 0.25 mm 단위 차이가 성능 비교의 핵심이라
 * 지시서 v3 §E-2 표기 규약대로 2자리를 유지한다. 운용 판정용 최소값은 fmtTread.
 */
export function fmtTreadAvg(v: number | null | undefined, withUnit = true): string {
  if (isBlank(v)) return EMPTY;
  return withUnit ? `${fixed(v, 2)} mm` : fixed(v, 2);
}

/** 표본표준편차(n-1) — 소수점 3자리. `1.577 mm` */
export function fmtTreadSd(v: number | null | undefined, withUnit = true): string {
  if (isBlank(v)) return EMPTY;
  return withUnit ? `${fixed(v, 3)} mm` : fixed(v, 3);
}

/**
 * 편마모 비율(S/C · O/I) — 소수점 3자리, 무단위. `0.776`
 * 1.000 에서 얼마나 떨어졌는지가 판정이라 반올림 자리수를 줄이면 안 된다.
 */
export function fmtRatio(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : fixed(v, 3);
}

/**
 * 공기압 — 정수. `117 psi`
 * 표처럼 단위가 열 머리에 이미 적혀 있는 자리에서는 withUnit=false 로 숫자만 받는다.
 * 자리수 규칙을 컴포넌트로 흘리지 않기 위한 것이지 표기 규칙의 예외가 아니다.
 */
export function fmtPressure(v: number | null | undefined, withUnit = true): string {
  if (isBlank(v)) return EMPTY;
  return withUnit ? `${fixed(Math.round(v), 0)} psi` : fixed(Math.round(v), 0);
}

/**
 * 가동시간·주행거리 — 소수점 1자리. `5,188.4 HM`
 * `5,188.4 → 6,718.8 HM` 처럼 단위를 한 번만 붙이는 자리에서는 withUnit=false 로
 * 숫자만 받는다. 자리수 규칙을 컴포넌트로 흘리지 않기 위한 것이다.
 */
export function fmtMeter(
  v: number | null | undefined,
  unit: "HM" | "KM" = "HM",
  withUnit = true,
): string {
  if (isBlank(v)) return EMPTY;
  return withUnit ? `${fixed(v, 1)} ${unit}` : fixed(v, 1);
}

// ── §6.3 통화 ────────────────────────────────────────────────────

const IDR_SCALES: ReadonlyArray<readonly [number, string]> = [
  [1_000_000_000_000, "triliun"],
  [1_000_000_000, "miliar"],
  [1_000_000, "juta"],
];

/** IDR 대금액의 단위 표기. 1 juta 미만이면 null. `1.25 miliar` */
function idrScaled(v: number): string | null {
  const abs = Math.abs(v);
  for (const [factor, name] of IDR_SCALES) {
    if (abs >= factor) return `${fixed(v / factor, 2)} ${name}`;
  }
  return null;
}

/**
 * 사내 내부 화면·요약용 금액. 통화 코드를 금액 앞에 둔다.
 * IDR 대금액은 단위 표기만 쓴다. `IDR 1.25 miliar`, `USD 12,500`
 */
export function fmtCurrency(
  v: number | null | undefined,
  currency = "IDR",
): string {
  if (isBlank(v)) return EMPTY;
  if (currency === "IDR") {
    const scaled = idrScaled(v);
    if (scaled) return `IDR ${scaled}`;
  }
  return `${currency} ${fixed(Math.round(v), 0)}`;
}

/**
 * 거래처 발송 문서용 금액 — 견적서·인보이스·계약서·정산서·공문·대외 이메일·
 * 고객사 포털 PDF. 전체 자리수를 먼저 쓰고 단위를 괄호로 병기한다 (§6.3).
 * 소수점 오독으로 자릿수가 1000배 틀리는 사고를 막기 위한 필수 규칙이다.
 * `IDR 1,250,000,000 (1.25 miliar)`
 */
export function fmtCurrencyDoc(
  v: number | null | undefined,
  currency = "IDR",
): string {
  if (isBlank(v)) return EMPTY;
  const full = `${currency} ${fixed(Math.round(v), 0)}`;
  if (currency !== "IDR") return full;
  const scaled = idrScaled(v);
  return scaled ? `${full} (${scaled})` : full;
}

// ── TCO ──────────────────────────────────────────────────────────

/**
 * 주행거리당 원가(CPK) — 소수점 2자리, 통화 코드 선행. `IDR 118.91/km`
 * 지시서 WO-TMS-2026-09-TCO T-9 표기 규약. 재생 반영 전후 차이가 IDR 0.54/km
 * 수준이라 자리수를 줄이면 시나리오 비교 자체가 무의미해진다.
 *
 * **null 은 그대로 EMPTY 로 돌려준다.** 단가 미확정 상태에서 0 으로 채우면
 * 화면에 `IDR 0.00/km` 가 찍혀 "원가가 없다"로 읽힌다.
 */
export function fmtCpk(
  v: number | null | undefined,
  currency = "IDR",
): string {
  return isBlank(v) ? EMPTY : `${currency} ${fixed(v, 2)}/km`;
}

// ── §6.4 예외: 콤마를 쓰지 않는 항목 ───────────────────────────────

/**
 * 연도·문서번호처럼 자릿수 구분을 하지 않는 숫자. `2026`
 * 타이어 규격·차량번호·시리얼·전화번호는 애초에 문자열이므로 포맷하지 않는다.
 */
export function fmtPlain(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : String(v);
}

/** 차량번호 표시형. DB에는 `824` 로 저장되고 화면에는 `CH 824` 로 보인다. */
export function fmtVehicle(ch: string | null | undefined): string {
  return ch ? `CH ${ch}` : EMPTY;
}

// ── 날짜·시각 ─────────────────────────────────────────────────────
//
// 저장은 UTC. 표시·입력은 시간대가 **둘로 갈린다** — 사용자 결정 2026-09-15.
//
//   WIB  = Asia/Jakarta  (UTC+7) — 시스템 운영지. 감사로그·로그인 등 *시각* 표시.
//   WITA = Asia/Makassar (UTC+8) — 현장(발릭빠빤, 동칼리만탄). 점검일 등 *날짜* 판정.
//
// 시각을 읽는 사람은 자카르타 운영자(관리자 화면 전용)이고, 날짜를 만드는 사람은
// 발릭빠빤 점검자다. 한쪽으로 통일하면 반드시 다른 쪽이 어긋난다.
// 발릭빠빤은 WIT(UTC+9, 파푸아·말루쿠)가 아니라 WITA 다 — 혼동 주의.
//
// 표기는 화면 언어와 무관하게 ISO 순서(YYYY-MM-DD)로 고정한다. 로케일마다
// 월/일 순서가 뒤바뀌면 감사 로그의 "입력 시각"과 점검일을 대조할 때 오독이 난다.
const WIB = "Asia/Jakarta";
const WITA = "Asia/Makassar";

/** 시각 표시에 병기하는 시간대 라벨. 현장과 통화하며 로그를 읽을 때 1시간 오해를 막는다. */
export const TZ_LABEL = "WIB";

const WITA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: WITA, year: "numeric", month: "2-digit", day: "2-digit",
});

const WIB_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: WIB, year: "numeric", month: "2-digit", day: "2-digit",
});
const WIB_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: WIB, hour: "2-digit", minute: "2-digit", hour12: false,
});

function asDate(v: string | Date | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 날짜만 — 현장 시간대 기준. `2026-08-26` */
export function fmtDateWIB(v: string | Date | null | undefined): string {
  const d = asDate(v);
  return d ? WIB_DATE.format(d) : EMPTY;
}

/** 날짜+시각 — 운영지(WIB) 기준. `2026-08-26 14:03` */
export function fmtDateTimeWIB(v: string | Date | null | undefined): string {
  const d = asDate(v);
  return d ? `${WIB_DATE.format(d)} ${WIB_TIME.format(d)}` : EMPTY;
}

/**
 * 오늘 날짜(YYYY-MM-DD) — **현장(WITA) 기준**. 점검일 기본값은 여기서만 만든다.
 *
 * `new Date().toISOString().slice(0,10)` 은 UTC 날짜라 쓰면 안 된다. 발릭빠빤
 * 00:00~08:00 에 저장하면 점검일이 하루 전으로 들어가는데, 그 구간이 오전 점검
 * 시간대를 그대로 덮는다. 단말의 로컬 시간대에 기대는 것도 같은 이유로 안 된다 —
 * 자카르타에서 대신 입력하는 경우가 있다.
 */
export function todayInField(): string {
  return WITA_DATE.format(new Date());
}

/**
 * 방금 지난 시각의 상대 표기 — 감사 로그처럼 "얼마 전인지"가 먼저 읽혀야 하는 곳에 쓴다.
 * 하루가 넘으면 절대 시각(fmtDateTimeWIB)이 더 정확하므로 그쪽으로 넘긴다.
 */
export function fmtRelative(v: string | Date | null | undefined, lang: "ko" | "id" | "en"): string {
  const d = asDate(v);
  if (!d) return EMPTY;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 0 || min >= 1440) return fmtDateTimeWIB(d);
  const U = {
    ko: { now: "방금", m: "분 전", h: "시간 전" },
    id: { now: "baru saja", m: " menit lalu", h: " jam lalu" },
    en: { now: "just now", m: "m ago", h: "h ago" },
  }[lang];
  if (min < 1) return U.now;
  if (min < 60) return `${min}${U.m}`;
  return `${Math.floor(min / 60)}${U.h}`;
}

// ── 마모율 ───────────────────────────────────────────────────────

/**
 * 마모율 — 소수점 3자리. `0.554 mm/1,000km`
 * 실차보고서가 3자리로 보고하므로(4대 평균 0.554) 같은 자리수로 맞춘다.
 * 2자리로 줄이면 차량 간 차이(0.487 vs 0.493)가 뭉개진다.
 */
export function fmtWearRate(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(v, 3)} mm/1,000km`;
}

/** 1 mm 마모당 주행거리 — 정수 km. `1,805 km/mm` */
export function fmtKmPerMm(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(Math.round(v), 0)} km/mm`;
}

/** 시험 주행거리 — 정수 km, 천 단위 콤마. `34,300 km` (지시서 v3 §E-2 표기 규약) */
export function fmtDistanceKm(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(Math.round(v), 0)} km`;
}

/** 결정계수 R² — 소수점 2자리, 무단위. `0.94` */
export function fmtR2(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : fixed(v, 2);
}
