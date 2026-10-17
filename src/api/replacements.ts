// @section: replacements-api
// 교체이력 조회 + 탈착 시점 정보 입력 (WO-TMS-2026-09-TCO T-2·T-10).
//
// T-2 이전의 replacements 27건에는 **날짜와 새 시리얼밖에 없다.** 왜 뺐는지,
// 뺀 타이어가 어떻게 됐는지가 없어 TCO 산출이 불가능하다. 이 모듈은 그 결손을
// 소급 입력하는 통로다.
//
// 쓰기는 UPDATE 뿐이다. 교체 행 자체를 만들거나 지우지 않는다 —
// ch·pos·date·new_serial 은 장착 이력의 정본이고 v_position_history ·
// v_current_tire · v_tire_ledger 가 전부 여기에 매달려 있다.
//
// **NULL 을 지우지 않는다.** patch 에 없는 키는 건드리지 않고, 값이 null 이면
// 그 칸을 비운다. 사유 미입력 상태로 저장하는 것을 허용해야 하기 때문이다
// (지시서 T-10 — 미입력 배지로 소급 입력을 유도하되 저장 자체는 막지 않는다).
import { normalizeSerial } from "@/lib/serial";
import { supabase } from "@/lib/supabase";
import type { CasingGrade, TcoCategory } from "@/api/tco";

/** damage_codes 1행. 드롭다운에 코드 + 한/인니 설명을 병기한다. */
export interface DamageCodeRow {
  code: string;
  /** 한국어 설명 */
  description: string | null;
  /** 인니어 설명 (T-1 에서 추가) */
  description_id: string | null;
  /** TCO 귀속 분류. 미분류(OTH 등)는 null */
  tco_category: TcoCategory | null;
  seq: number | null;
}

/** replacements 1행 — T-2 로 붙은 탈착 시점 정보 포함. */
export interface ReplacementRow {
  id: string;
  ch: string;
  pos: string;
  /** 교체일 = 새 타이어 장착일 = 이전 타이어 탈거일 */
  date: string;
  new_serial: string | null;
  old_serial: string | null;
  removal_code: string | null;
  removal_tread_min: number | null;
  casing_grade: CasingGrade | null;
  retreadable: boolean | null;
  downtime_minutes: number | null;
  removal_note: string | null;
}

/** UPDATE 로 보낼 탈착 정보. 전 필드 nullable — 비우는 것도 유효한 입력이다. */
export interface RemovalPatch {
  old_serial: string | null;
  removal_code: string | null;
  removal_tread_min: number | null;
  casing_grade: CasingGrade | null;
  retreadable: boolean | null;
  downtime_minutes: number | null;
  removal_note: string | null;
}

const COLS =
  "id,ch,pos,date,new_serial,old_serial,removal_code,removal_tread_min," +
  "casing_grade,retreadable,downtime_minutes,removal_note";

/** 소프트 삭제되지 않은 교체이력 전건. 최신 교체일이 앞에 온다. */
export async function listReplacements(): Promise<ReplacementRow[]> {
  const { data, error } = await supabase
    .from("replacements")
    .select(COLS)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("ch", { ascending: true })
    .order("pos", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ReplacementRow[];
}

/** 손상 코드 마스터. seq 순 — 현장 코드표와 같은 차례다. */
export async function listDamageCodes(): Promise<DamageCodeRow[]> {
  const { data, error } = await supabase
    .from("damage_codes")
    .select("code,description,description_id,tco_category,seq")
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DamageCodeRow[];
}

/**
 * DB CHECK 제약과 같은 범위를 클라이언트에서 먼저 본다.
 * 400 을 받고 나서 알려주는 것보다 저장 버튼 옆에서 막는 편이 낫다.
 * 반환값은 위반한 필드 키 목록 — 빈 배열이면 통과.
 */
export function validateRemoval(p: RemovalPatch): (keyof RemovalPatch)[] {
  const bad: (keyof RemovalPatch)[] = [];
  const t = p.removal_tread_min;
  if (t !== null && (!Number.isFinite(t) || t < 0 || t > 60)) bad.push("removal_tread_min");
  const d = p.downtime_minutes;
  if (d !== null && (!Number.isInteger(d) || d < 0)) bad.push("downtime_minutes");
  return bad;
}

/**
 * 교체 1건의 탈착 정보를 갱신한다. 사유(removal_code)가 null 이어도 저장한다.
 * updated_by·updated_at 은 set_audit_fields() 트리거가 채운다.
 */
export async function updateReplacementRemoval(
  id: string,
  patch: RemovalPatch,
): Promise<ReplacementRow> {
  const bad = validateRemoval(patch);
  if (bad.length > 0) throw new Error(`invalid removal fields: ${bad.join(", ")}`);
  const { data, error } = await supabase
    .from("replacements")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select(COLS)
    .single();
  if (error) throw error;
  return data as unknown as ReplacementRow;
}

// ── 교체 등록 (지시서 2026-10-16 §A-1) ─────────────────────────
// 위의 "쓰기는 UPDATE 뿐" 원칙의 유일한 예외다. 행 생성은 RPC register_replacement 한 곳에서만 하며,
// 장착 이력 뷰들이 매달린 트리거(lifetimes 생성·구 타이어 Spare·serial2 동기화)가 같은 트랜잭션에서 돈다.

export interface ReplacementEntry {
  ch: string;
  pos: string;
  /** YYYY-MM-DD (현장 WITA 날짜) */
  date: string;
  newSerial: string;
  /** damage_codes.code. 로테이션은 'ROT'. 미입력 null */
  reason: string | null;
  treadAtRemoval: number | null;
  km: number | null;
  hm: number | null;
  /** 탈착한 구 타이어의 처리 — 폐기 또는 예비 */
  oldStatus: "Scrap" | "Spare";
}

/** RPC 가 던지는 'code:detail' 의 code. 화면이 문구를 고르는 키다. */
export type ReplacementErrorCode =
  | "forbidden" | "serial_required" | "date_required" | "bad_old_status" | "rot_cannot_scrap"
  | "bad_reason" | "position_not_found" | "same_serial" | "serial_installed"
  | "serial_scrapped" | "date_before_last";

export class ReplacementEntryError extends Error {
  constructor(public code: ReplacementErrorCode | "unknown", public detail: string, message: string) {
    super(message);
  }
}

const KNOWN_CODES: ReplacementErrorCode[] = [
  "forbidden", "serial_required", "date_required", "bad_old_status", "rot_cannot_scrap",
  "bad_reason", "position_not_found", "same_serial", "serial_installed",
  "serial_scrapped", "date_before_last",
];

/**
 * 교체 1건 등록. 성공 시 새 replacements.id.
 * 저장 후 호출부는 loadData() 를 다시 돌려야 배치도·교체이력·수명 DB 가 바뀐다.
 * ⚠ 호출부는 반드시 canWrite/canDelete로 게이팅 + RLS가 최종 방어선
 */
export async function registerReplacement(e: ReplacementEntry): Promise<string> {
  const { data, error } = await supabase.rpc("register_replacement", {
    p_ch: e.ch,
    p_pos: e.pos,
    p_date: e.date,
    p_new_serial: normalizeSerial(e.newSerial),
    p_reason: e.reason,
    p_tread: e.treadAtRemoval,
    p_km: e.km,
    p_hm: e.hm,
    p_old_status: e.oldStatus,
  });
  if (error) {
    const [head, ...rest] = (error.message ?? "").split(":");
    const code = (KNOWN_CODES as string[]).includes(head) ? (head as ReplacementErrorCode) : "unknown";
    throw new ReplacementEntryError(code, rest.join(":").trim(), error.message);
  }
  return data as string;
}
