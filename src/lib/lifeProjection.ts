// @section: life-projection
// 예상 교체 시점 — 마모율·잔여 KM·예상 교체일 (지시서 2026-10-16 §A-2).
//
// 순수 함수만 둔다. TMS_DATA 를 읽어 점열을 만드는 일은 tmsUtils.lifeCalc() 가 하고,
// 여기서는 받은 점열로 계산만 한다 — 그래야 단위 테스트가 DB 없이 돈다.
//
// 기준선은 tread_order(발주, 초기 5 mm)다. 5 mm 는 폐기가 아니라 **발주 트리거**이고
// (사용자 결정 2026-08-01), 0 mm 외삽(expectedKm)은 lifeCalc 에 그대로 남는다.

const DAY_MS = 86_400_000;

/** 최소제곱 기울기. 점이 2개 미만이거나 x 가 전부 같으면 null */
export function regressionSlope(pairs: { x: number; y: number }[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;
  const xbar = pairs.reduce((s, p) => s + p.x, 0) / n;
  const ybar = pairs.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pairs) {
    num += (p.x - xbar) * (p.y - ybar);
    den += (p.x - xbar) ** 2;
  }
  return den > 0 ? num / den : null;
}

/** 마모율 mm / 1,000 km — 트레드 vs 누적 km 회귀 기울기 × −1,000. 마모 추세가 아니면 null */
export function wearRatePer1000Km(pts: { km: number; tread: number }[]): number | null {
  const slope = regressionSlope(pts.map((p) => ({ x: p.km, y: p.tread })));
  return slope != null && slope < 0 ? -slope * 1000 : null;
}

/** ISO 날짜(YYYY-MM-DD) → UTC 자정 epoch 일수. 날짜만 다루므로 타임존이 끼지 않는다. */
function dayNo(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;
}

/** 마모율 mm / 일 — 트레드 vs 날짜 회귀. KM 이 없는 차량의 예비 경로 */
export function wearRatePerDay(pts: { date: string; tread: number }[]): number | null {
  const slope = regressionSlope(pts.map((p) => ({ x: dayNo(p.date), y: p.tread })));
  return slope != null && slope < 0 ? -slope : null;
}

/** 현재 트레드에서 limit(mm)까지 남은 km. 이미 limit 이하면 0 */
export function remainingKmTo(tread: number, ratePer1000Km: number, limit: number): number {
  if (ratePer1000Km <= 0) return Infinity;
  return Math.max(0, ((tread - limit) / ratePer1000Km) * 1000);
}

/**
 * 최근 windowDays 일의 일평균 주행 km — (마지막 회차 km − 창 안 첫 회차 km) ÷ 일수.
 * 창 안에 회차가 하나뿐이면 바로 앞 회차까지 넓힌다. km 이 줄었거나(계기 리셋) 일수가 0 이면 null.
 */
export function dailyKm(rounds: { date: string; km: number }[], windowDays = 30): number | null {
  const rs = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  if (rs.length < 2) return null;
  const last = rs[rs.length - 1];
  const from = dayNo(last.date) - windowDays;
  let i = rs.findIndex((r) => dayNo(r.date) >= from);
  if (i >= rs.length - 1) i = rs.length - 2;
  const base = rs[i];
  const days = dayNo(last.date) - dayNo(base.date);
  const km = last.km - base.km;
  return days > 0 && km > 0 ? km / days : null;
}

/** ISO 날짜 + n 일. 소수 일은 올림 — 도달하는 그날을 예상일로 잡는다 */
export function addDays(iso: string, days: number): string {
  const d = new Date((dayNo(iso) + Math.ceil(days)) * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** 두 ISO 날짜의 일수 차 (b − a) */
export function daysBetween(a: string, b: string): number {
  return dayNo(b) - dayNo(a);
}

/** 예상 교체 시점을 못 내는 사유 — 화면 툴팁 키 */
export type ProjectionReason = "few_rounds" | "no_trend" | "hm_reset" | null;

export interface Projection {
  /** mm / 1,000 km */
  wearRateKm: number | null;
  /** mm / 일 */
  wearRateDay: number | null;
  /** tread_order 까지 잔여 km */
  remainingKm: number | null;
  remainingDays: number | null;
  /** YYYY-MM-DD */
  projectedDate: string | null;
  reason: ProjectionReason;
}

/** 예측에 필요한 최소 회차 수 (수용 기준: 회차 3개 이상) */
export const MIN_ROUNDS = 3;

/**
 * 한 타이어의 예상 교체 시점.
 * @param pts   마모 단조 점열 (누적 km · 날짜 · 트레드). 시간순
 * @param latestTread 최근 트레드 — 점열 마지막과 다를 수 있다(0 mm 회차는 점열에서 빠진다)
 * @param kmPerDay    차량 일평균 주행 km (없으면 mm/일 경로)
 * @param limit       기준 트레드 (tread_order)
 * @param latestDate  latestTread 의 측정일 — 이미 기준선 아래면 이 날이 예상 교체일이다
 */
export function projectReplacement(
  pts: { km: number; date: string; tread: number }[],
  latestTread: number,
  kmPerDay: number | null,
  limit: number,
  latestDate?: string | null,
): Projection {
  const none = (reason: ProjectionReason): Projection => ({
    wearRateKm: null, wearRateDay: null, remainingKm: null, remainingDays: null, projectedDate: null, reason,
  });
  const lastDate = latestDate ?? pts[pts.length - 1]?.date ?? null;
  // 이미 발주 기준선 이하 — 추세와 무관하게 즉시 교체 대상이다 (R-3 · LIFE-02).
  // 0 mm 타이어에 «잔여 km» 가 나오던 문제: 0 회차가 점열에서 빠져 앞 회차 값으로 외삽했다.
  if (latestTread <= limit && lastDate) {
    return {
      wearRateKm: pts.length >= 2 ? wearRatePer1000Km(pts) : null,
      wearRateDay: pts.length >= 2 ? wearRatePerDay(pts) : null,
      remainingKm: 0, remainingDays: 0, projectedDate: lastDate, reason: null,
    };
  }
  if (pts.length < MIN_ROUNDS) return none("few_rounds");

  const wearRateKm = wearRatePer1000Km(pts);
  const wearRateDay = wearRatePerDay(pts);

  const remainingKm = wearRateKm != null ? remainingKmTo(latestTread, wearRateKm, limit) : null;
  let remainingDays: number | null = null;
  if (remainingKm != null && kmPerDay != null) remainingDays = remainingKm / kmPerDay;
  else if (wearRateDay != null) remainingDays = Math.max(0, (latestTread - limit) / wearRateDay);

  if (remainingDays == null) return { ...none("no_trend"), wearRateKm, wearRateDay, remainingKm };
  return {
    wearRateKm, wearRateDay, remainingKm, remainingDays,
    projectedDate: addDays(lastDate as string, remainingDays),
    reason: null,
  };
}
