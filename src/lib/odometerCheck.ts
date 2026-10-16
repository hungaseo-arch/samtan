// @section: odometer-check
// 주행계(KM·HM) 회차 간 증분 이상치 판정 — WO-TMS-2026-10-LIFE T-3.
//
// 근거: CH 847 2026-07-12 회차 km 89,100.0 → 07-26 135,397.1 (14일 46,297 km, 환산 176 km/h).
// 한 칸의 오기가 장착 10본의 주행 km·예상수명을 전부 허수로 만들었다.
//
// 같은 규칙이 두 군데 있다. DB 뷰 v_odometer_anomaly(기존 데이터 일괄 점검)와 이 모듈
// (점검 입력 폼의 저장 전 경고 · 뷰 미적용 환경의 폴백). 규칙을 바꾸면 둘 다 고칠 것.
//
// 감지만 한다. 경고는 저장을 막지 않는다 — 계기 리셋·장기 정비 같은 정상 사유가 있다.
// 임계값은 tire_config(odo_*) 에서 온다. 여기서는 받기만 한다.

export type OdoFlag = "KM_DECREASE" | "KM_DAILY" | "SPEED" | "HM_DAILY";

export interface OdoLimits {
  /** 일평균 주행 상한 (km/일) */
  dailyKmMax: number;
  /** 환산 속도 상한 (Δkm/Δhm, km/h) */
  speedKmhMax: number;
  /** 일평균 가동 상한 (hr/일) */
  dailyHmMax: number;
}

export interface OdoReading {
  date: string; // YYYY-MM-DD
  km: number | null;
  hm: number | null;
}

export interface OdoCheck {
  flags: OdoFlag[];
  days: number;
  kmDelta: number | null;
  hmDelta: number | null;
  kmPerDay: number | null;
  hmPerDay: number | null;
  kmPerHm: number | null;
}

export interface OdoAnomaly extends OdoCheck {
  ch: string;
  datePrev: string;
  dateCurr: string;
  kmPrev: number | null;
  kmCurr: number | null;
  hmPrev: number | null;
  hmCurr: number | null;
}

const DAY_MS = 86_400_000;

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * 직전 회차 대비 판정. v_odometer_anomaly 와 같은 규칙:
 *   KM_DECREASE  km < 직전 km
 *   KM_DAILY     Δkm / 일수 > dailyKmMax
 *   SPEED        Δkm > 0 이고 Δkm / Δhm > speedKmhMax (Δhm > 0 일 때만)
 *   HM_DAILY     Δhm / 일수 > dailyHmMax
 * 일수가 0 이하(같은 날·역순 입력)면 일평균 판정은 건너뛴다.
 */
export function checkOdometer(prev: OdoReading, curr: OdoReading, lim: OdoLimits): OdoCheck {
  const days = dayDiff(prev.date, curr.date);
  const kmDelta = isNum(prev.km) && isNum(curr.km) ? curr.km - prev.km : null;
  const hmDelta = isNum(prev.hm) && isNum(curr.hm) ? curr.hm - prev.hm : null;
  const kmPerDay = kmDelta != null && days > 0 ? kmDelta / days : null;
  const hmPerDay = hmDelta != null && days > 0 ? hmDelta / days : null;
  const kmPerHm = kmDelta != null && hmDelta != null && hmDelta > 0 ? kmDelta / hmDelta : null;

  const flags: OdoFlag[] = [];
  if (kmDelta != null && kmDelta < 0) flags.push("KM_DECREASE");
  if (kmPerDay != null && kmPerDay > lim.dailyKmMax) flags.push("KM_DAILY");
  if (kmDelta != null && kmDelta > 0 && kmPerHm != null && kmPerHm > lim.speedKmhMax) flags.push("SPEED");
  if (hmPerDay != null && hmPerDay > lim.dailyHmMax) flags.push("HM_DAILY");

  return { flags, days, kmDelta, hmDelta, kmPerDay, hmPerDay, kmPerHm };
}

/**
 * 차량 1대의 회차열을 일자순으로 훑어 이상 구간만 돌려준다.
 * 회차는 날짜 중복 없이 들어온다고 본다 (같은 날 여러 행은 호출 측에서 최대값으로 접는다).
 */
export function scanOdometer(ch: string, rounds: OdoReading[], lim: OdoLimits): OdoAnomaly[] {
  const sorted = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const out: OdoAnomaly[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1];
    const c = sorted[i];
    const r = checkOdometer(p, c, lim);
    if (!r.flags.length) continue;
    out.push({
      ...r, ch, datePrev: p.date, dateCurr: c.date,
      kmPrev: p.km, kmCurr: c.km, hmPrev: p.hm, hmCurr: c.hm,
    });
  }
  return out;
}

/**
 * 입력 폼용 직전 회차 — `date` 보다 앞선 회차 중 KM 이나 HM 이 하나라도 있는 마지막 것.
 * 같은 날 회차는 지금 고쳐 쓰는 그 회차일 수 있어 제외한다.
 */
export function previousReading(rounds: OdoReading[], date: string): OdoReading | null {
  let hit: OdoReading | null = null;
  for (const r of rounds) {
    if (r.date >= date) continue;
    if (!isNum(r.km) && !isNum(r.hm)) continue;
    if (!hit || r.date > hit.date) hit = r;
  }
  return hit;
}

/** 구간이 [from, to] 기간과 겹치는가 — 마모 분석 결과 요약의 데이터 품질 줄 */
export function anomalyOverlaps(a: Pick<OdoAnomaly, "datePrev" | "dateCurr">, from: string | null, to: string | null): boolean {
  if (from && a.dateCurr <= from) return false;
  if (to && a.datePrev >= to) return false;
  return true;
}

/** 저장 시 remark 앞에 붙이는 표지. 이미 붙어 있으면 그대로 둔다 */
export const ODO_WARN_TAG = "[ODO-WARN]";

export function tagRemark(remark: string | null | undefined, flags: OdoFlag[], note?: string | null): string {
  const body = (remark ?? "").trim();
  if (body.startsWith(ODO_WARN_TAG)) return body;
  const head = `${ODO_WARN_TAG} ${flags.join(",")}${note?.trim() ? ` — ${note.trim()}` : ""}`;
  return body ? `${head} | ${body}` : head;
}
