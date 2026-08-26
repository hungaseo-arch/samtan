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

/** 퍼센트 — 소수점 1자리 고정. `12.5%`, `3.0%` */
export function fmtPercent(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(v, 1)}%`;
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
export function fmtTread(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(v, 1)} mm`;
}

/** 공기압 — 정수. `117 psi` */
export function fmtPressure(v: number | null | undefined): string {
  return isBlank(v) ? EMPTY : `${fixed(Math.round(v), 0)} psi`;
}

/** 가동시간·주행거리 — 소수점 1자리. `5,188.4 HM` */
export function fmtMeter(
  v: number | null | undefined,
  unit: "HM" | "KM" = "HM",
): string {
  return isBlank(v) ? EMPTY : `${fixed(v, 1)} ${unit}`;
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
