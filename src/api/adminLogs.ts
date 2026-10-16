// @section: admin-logs-api
// 관리자 화면의 "사용자별 로그기록" 자료원 두 가지.
//
//   1) 데이터 변경 이력 — public.audit_log 를 그대로 조회한다.
//      RLS 가 admin 만 SELECT 를 허용하므로(T-101) 별도 Edge Function 이 필요 없다.
//      admin 이 아닌 계정이 호출하면 오류가 아니라 빈 배열이 온다 — RLS 의 동작이다.
//
//   2) 로그인·로그아웃 이력 — auth.audit_log_entries.
//      auth 스키마는 PostgREST 로 열리지 않아 security definer RPC 를 경유한다
//      (마이그레이션 20260826120000_admin_activity_log).
import { supabase } from "@/lib/supabase";

/** 감사 대상 테이블 — audit_log.table_name 에 들어가는 값 (T-103 트리거 기준). */
export const AUDIT_TABLES = [
  "inspections",
  "replacements",
  "vehicles",
  "vehicle_positions",
  "lifetimes",
] as const;
export type AuditTable = (typeof AUDIT_TABLES)[number];

export type AuditOp = "INSERT" | "UPDATE" | "DELETE";

/** 한 행에서 실제로 달라진 컬럼 하나. */
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditEntry {
  id: number;
  tableName: string;
  /** T-101 이 직접 넣은 초기 행은 op 가 없다. */
  op: AuditOp | null;
  /** 변경된 행의 식별자 — 테이블마다 컬럼 구성이 다르다. */
  recordPk: Record<string, unknown>;
  actor: string | null;
  actorEmail: string | null;
  /** 변경 경로 — `trigger` / `migration:<version>` 등. */
  source: string;
  note: string | null;
  changedAt: string;
  /** 사람이 읽을 대상 표시 — `CH 824 · L1 · 2026-08-20`. */
  target: string;
  /** UPDATE 일 때 달라진 컬럼들. INSERT/DELETE 는 빈 배열. */
  changes: FieldChange[];
}

// 감사 컬럼 자체는 "무엇이 바뀌었나"에서 제외한다. 매 UPDATE 마다 트리거가 새로
// 쓰므로 그대로 두면 모든 변경이 updated_at 하나로 뒤덮인다.
const AUDIT_COLUMNS = new Set([
  "created_at", "updated_at",
  "created_by", "updated_by",
  "created_by_email", "updated_by_email",
]);

type Row = Record<string, unknown> | null;

/** 변경 전/후 행을 비교해 달라진 컬럼만 뽑는다. */
function diff(before: Row, after: Row): FieldChange[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (AUDIT_COLUMNS.has(k)) continue;
    // jsonb 로 저장되며 숫자·날짜는 표현이 일정하다. 문자열 비교로 충분하다.
    if (JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null)) continue;
    out.push({ field: k, before: before[k] ?? null, after: after[k] ?? null });
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * 대상 행을 한 줄로 식별한다.
 * record_pk 는 대개 uuid 라 화면에서 아무 의미가 없어, 행 본문에서 사람이 아는
 * 키(차량·포지션·날짜·시리얼)를 끌어와 표시한다. 없으면 record_pk 로 되돌아간다.
 */
function targetOf(tableName: string, pk: Record<string, unknown>, row: Row): string {
  const v = (k: string): string | null => {
    const x = row?.[k] ?? pk[k];
    return x == null || x === "" ? null : String(x);
  };
  const parts: (string | null)[] =
    tableName === "inspections"       ? [v("ch") && `CH ${v("ch")}`, v("pos"), v("inspection_date")]
    : tableName === "replacements"    ? [v("ch") && `CH ${v("ch")}`, v("pos"), v("date")]
    : tableName === "vehicle_positions" ? [v("ch") && `CH ${v("ch")}`, v("pos"), v("serial")]
    : tableName === "vehicles"        ? [v("ch") && `CH ${v("ch")}`]
    : tableName === "lifetimes"       ? [v("serial"), v("no") && `#${v("no")}`]
    : [];
  const label = parts.filter(Boolean).join(" · ");
  return label || Object.values(pk).map(String).join(" · ") || "—";
}

export interface AuditFilter {
  /** auth.users.id — 지정하면 이 사용자가 만든 변경만. */
  actor?: string | null;
  tableName?: AuditTable | null;
  /** ISO 문자열. 이 시각 이후(포함). */
  since?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * 데이터 변경 이력 조회.
 * `hasMore` 는 limit+1 을 읽어 판정한다 — 전체 건수(count)는 감사 테이블이 커질수록
 * 매 조회마다 풀 스캔을 부르므로 쓰지 않는다.
 */
export async function listAuditLog(
  f: AuditFilter = {}
): Promise<{ entries: AuditEntry[]; hasMore: boolean }> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;

  let q = supabase
    .from("audit_log")
    .select("id, table_name, record_pk, old_value, new_value, actor, actor_email, source, note, op, changed_at")
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false }) // 같은 트랜잭션 내 동시각 행의 순서 고정
    .range(offset, offset + limit); // limit+1 행

  if (f.actor) q = q.eq("actor", f.actor);
  if (f.tableName) q = q.eq("table_name", f.tableName);
  if (f.since) q = q.gte("changed_at", f.since);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hasMore = rows.length > limit;

  const entries = rows.slice(0, limit).map((r): AuditEntry => {
    const pk = (r.record_pk ?? {}) as Record<string, unknown>;
    const before = (r.old_value ?? null) as Row;
    const after = (r.new_value ?? null) as Row;
    const op = (r.op ?? null) as AuditOp | null;
    return {
      id: r.id as number,
      tableName: String(r.table_name),
      op,
      recordPk: pk,
      actor: (r.actor as string | null) ?? null,
      actorEmail: (r.actor_email as string | null) ?? null,
      source: String(r.source ?? ""),
      note: (r.note as string | null) ?? null,
      changedAt: String(r.changed_at),
      target: targetOf(String(r.table_name), pk, after ?? before),
      changes: op === "UPDATE" ? diff(before, after) : [],
    };
  });

  return { entries, hasMore };
}

// ── 인증 이벤트(로그인·로그아웃) ───────────────────────────────

export interface AuthEvent {
  id: string;
  /** GoTrue 액션 — `login` · `logout` · `user_modified` · `user_recovery_requested` 등. */
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  ip: string | null;
  occurredAt: string;
}

/** RPC 가 아직 배포되지 않았을 때 던지는 표식 — 화면에서 안내로 바꿔 보여준다. */
export const RPC_MISSING = "admin_auth_events_missing";

/**
 * 로그인·로그아웃 이력.
 * 마이그레이션이 아직 적용되지 않은 환경에서는 RPC_MISSING 을 던진다.
 */
export async function listAuthEvents(
  p: { userId?: string | null; limit?: number; before?: string | null } = {}
): Promise<AuthEvent[]> {
  const { data, error } = await supabase.rpc("admin_auth_events", {
    p_user: p.userId ?? null,
    p_limit: p.limit ?? 100,
    p_before: p.before ?? null,
  });

  if (error) {
    // PGRST202 = 스키마 캐시에 함수가 없음 (마이그레이션 미적용)
    if (error.code === "PGRST202") throw new Error(RPC_MISSING);
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((r): AuthEvent => ({
    id: String(r.id),
    action: String(r.action ?? ""),
    actorId: (r.actor_id as string | null) ?? null,
    actorEmail: (r.actor_email as string | null) ?? null,
    ip: (r.ip_address as string | null) ?? null,
    occurredAt: String(r.occurred_at),
  }));
}
