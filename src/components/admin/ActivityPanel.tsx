// @section: admin-activity-panel
// 관리자 페이지 › 사용자별 로그기록.
//
// 두 갈래를 한 화면에서 전환해 본다.
//   · 데이터 변경 — public.audit_log (누가 어느 행의 무엇을 어떻게 바꿨는가)
//   · 로그인 기록 — auth.audit_log_entries (누가 언제 접속했는가)
//
// 두 자료 모두 admin 만 읽을 수 있다(RLS · security definer 내부 검사). 화면은 UX 층일 뿐이다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, LogIn, LogOut, Pencil, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useLang } from "@/i18n";
import type { ManagedUser } from "@/api/adminUsers";
import {
  listAuditLog, listAuthEvents, AUDIT_TABLES, RPC_MISSING,
  type AuditEntry, type AuditTable, type AuthEvent, type FieldChange,
} from "@/api/adminLogs";
import { fmtDateTimeWIB, fmtRelative, fmtPressure, fmtTread, fmtMeter, EMPTY, TZ_LABEL } from "@/lib/format";

const TX = {
  ko: {
    title: "사용자별 로그기록",
    viewData: "데이터 변경", viewAuth: "로그인 기록",
    fUser: "사용자", fTable: "대상", fRange: "기간",
    all: "전체", anon: "시스템·미상",
    d7: "최근 7일", d30: "최근 30일", d90: "최근 90일", dAll: "전체 기간",
    refresh: "새로고침", more: "더 보기",
    colWhen: "시각", colWho: "사용자", colWhat: "작업", colTarget: "대상", colDetail: "변경 내용",
    colAction: "이벤트", colIp: "IP",
    empty: "해당 조건의 기록이 없습니다.",
    loadFail: "기록을 불러오지 못했습니다: ",
    rpcMissing: "로그인 기록 조회 함수가 아직 배포되지 않았습니다. 마이그레이션 20260826120000_admin_activity_log 를 적용하십시오.",
    opINSERT: "추가", opUPDATE: "수정", opDELETE: "삭제", opNone: "정정",
    softDelete: "소프트 삭제", restore: "삭제 취소",
    created: "신규 등록", removed: "행 삭제",
    noDiff: "값 변경 없음",
    actLogin: "로그인", actLogout: "로그아웃", actFail: "로그인 실패",
    actUserModified: "계정 정보 변경", actUserUpdated: "비밀번호·정보 갱신",
    actUserDeleted: "계정 삭제", actUserSignedUp: "계정 생성",
    actRecovery: "비밀번호 재설정 요청",
    srcMigration: "마이그레이션",
    note: "기록은 트리거가 자동으로 남기며 수정·삭제할 수 없습니다. 시각은 운영지 자카르타(WIB, UTC+7) 기준입니다. 현장 발릭빠빤(WITA)은 1시간 빠릅니다.",
  },
  id: {
    title: "Log Aktivitas Pengguna",
    viewData: "Perubahan data", viewAuth: "Riwayat login",
    fUser: "Pengguna", fTable: "Objek", fRange: "Periode",
    all: "Semua", anon: "Sistem·tidak diketahui",
    d7: "7 hari terakhir", d30: "30 hari terakhir", d90: "90 hari terakhir", dAll: "Seluruh periode",
    refresh: "Muat ulang", more: "Muat lagi",
    colWhen: "Waktu", colWho: "Pengguna", colWhat: "Aksi", colTarget: "Objek", colDetail: "Perubahan",
    colAction: "Peristiwa", colIp: "IP",
    empty: "Tidak ada catatan untuk filter ini.",
    loadFail: "Gagal memuat catatan: ",
    rpcMissing: "Fungsi riwayat login belum di-deploy. Terapkan migrasi 20260826120000_admin_activity_log.",
    opINSERT: "Tambah", opUPDATE: "Ubah", opDELETE: "Hapus", opNone: "Koreksi",
    softDelete: "Hapus (soft)", restore: "Batal hapus",
    created: "Data baru", removed: "Baris dihapus",
    noDiff: "Tidak ada perubahan nilai",
    actLogin: "Masuk", actLogout: "Keluar", actFail: "Gagal masuk",
    actUserModified: "Akun diubah", actUserUpdated: "Kata sandi·info diperbarui",
    actUserDeleted: "Akun dihapus", actUserSignedUp: "Akun dibuat",
    actRecovery: "Permintaan reset kata sandi",
    srcMigration: "Migrasi",
    note: "Catatan dibuat otomatis oleh trigger dan tidak dapat diubah. Waktu dalam zona operasional Jakarta (WIB, UTC+7). Lapangan Balikpapan (WITA) 1 jam lebih awal.",
  },
  en: {
    title: "User Activity Log",
    viewData: "Data changes", viewAuth: "Sign-in history",
    fUser: "User", fTable: "Target", fRange: "Period",
    all: "All", anon: "System · unknown",
    d7: "Last 7 days", d30: "Last 30 days", d90: "Last 90 days", dAll: "All time",
    refresh: "Refresh", more: "Load more",
    colWhen: "Time", colWho: "User", colWhat: "Action", colTarget: "Target", colDetail: "Change",
    colAction: "Event", colIp: "IP",
    empty: "No records for this filter.",
    loadFail: "Failed to load records: ",
    rpcMissing: "The sign-in history function is not deployed yet. Apply migration 20260826120000_admin_activity_log.",
    opINSERT: "Insert", opUPDATE: "Update", opDELETE: "Delete", opNone: "Correction",
    softDelete: "Soft delete", restore: "Undelete",
    created: "New record", removed: "Row deleted",
    noDiff: "No value changed",
    actLogin: "Sign-in", actLogout: "Sign-out", actFail: "Sign-in failed",
    actUserModified: "Account modified", actUserUpdated: "Password/info updated",
    actUserDeleted: "Account deleted", actUserSignedUp: "Account created",
    actRecovery: "Password reset requested",
    srcMigration: "Migration",
    note: "Records are written automatically by triggers and cannot be edited. Times are Jakarta operations time (WIB, UTC+7). The Balikpapan site (WITA) is 1 hour ahead.",
  },
} as const;

/** 세 로케일이 같은 키를 갖는 문구 묶음 — 하위 컴포넌트에 넘길 때 리터럴 타입을 푼다. */
type Tx = { [K in keyof (typeof TX)["ko"]]: string };

type View = "data" | "auth";
type Range = "7" | "30" | "90" | "all";
const PAGE = 50;

// 컬럼명 → 화면 표시. 목록에 없는 컬럼은 원래 이름을 그대로 쓴다(감사 자료라 누락보다 낫다).
const FIELD_LABEL: Record<string, { ko: string; id: string; en: string }> = {
  pressure:        { ko: "공기압",   id: "Tekanan",     en: "Pressure" },
  tread:           { ko: "트레드",   id: "Alur",        en: "Tread" },
  hm:              { ko: "HM",       id: "HM",          en: "HM" },
  km:              { ko: "KM",       id: "KM",          en: "KM" },
  serial:          { ko: "시리얼",   id: "Serial",      en: "Serial" },
  new_serial:      { ko: "새 시리얼", id: "Serial baru", en: "New serial" },
  remark:          { ko: "비고",     id: "Catatan",     en: "Remark" },
  note:            { ko: "비고",     id: "Catatan",     en: "Note" },
  ch:              { ko: "차량",     id: "Unit",        en: "Vehicle" },
  pos:             { ko: "포지션",   id: "Posisi",      en: "Position" },
  inspection_date: { ko: "점검일",   id: "Tgl inspeksi", en: "Inspection date" },
  date:            { ko: "일자",     id: "Tanggal",     en: "Date" },
  install:         { ko: "장착일",   id: "Tgl pasang",  en: "Install" },
  scrap:           { ko: "폐기일",   id: "Tgl scrap",   en: "Scrap" },
  lifetime:        { ko: "수명",     id: "Umur",        en: "Lifetime" },
  damage:          { ko: "손상",     id: "Kerusakan",   en: "Damage" },
  status:          { ko: "상태",     id: "Status",      en: "Status" },
  driver:          { ko: "운전자",   id: "Pengemudi",   en: "Driver" },
  deleted_at:      { ko: "삭제",     id: "Dihapus",     en: "Deleted" },
};

// 자리수가 규정된 값은 전용 포맷터를 태운다 (§6.2). 그 밖은 원값 그대로.
function fmtVal(field: string, v: unknown): string {
  if (v == null || v === "") return EMPTY;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isNaN(n) && typeof v !== "boolean") {
    if (field === "pressure") return fmtPressure(n);
    if (field === "tread") return fmtTread(n);
    if (field === "hm") return fmtMeter(n, "HM");
    if (field === "km") return fmtMeter(n, "KM");
  }
  if (field === "deleted_at") return fmtDateTimeWIB(String(v));
  return String(v);
}

const OP_STYLE: Record<string, string> = {
  INSERT: "bg-accent text-foreground",
  UPDATE: "bg-primary/10 text-primary",
  DELETE: "bg-destructive/10 text-destructive",
};

/** GoTrue action → 표시 문구. 목록에 없으면 원래 액션명을 보여준다. */
function authLabel(action: string, tx: Tx): string {
  switch (action) {
    case "login": return tx.actLogin;
    case "logout": return tx.actLogout;
    case "login_failed": return tx.actFail;
    case "user_modified": return tx.actUserModified;
    case "user_updated_password": return tx.actUserUpdated;
    case "user_deleted": return tx.actUserDeleted;
    case "user_signedup": return tx.actUserSignedUp;
    case "user_recovery_requested": return tx.actRecovery;
    default: return action;
  }
}

interface Props {
  users: ManagedUser[];
  /** 권한 탭에서 "로그 보기"로 넘어올 때 미리 선택되는 사용자. */
  focusUserId: string;
  onFocusUser: (id: string) => void;
}

export default function ActivityPanel({ users, focusUserId, onFocusUser }: Props) {
  const { lang } = useLang();
  const tx = TX[lang];

  const [view, setView] = useState<View>("data");
  const [table, setTable] = useState<AuditTable | "">("");
  const [range, setRange] = useState<Range>("30");

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 사용자 id → 표시 이름. audit_log 에는 이메일 스냅샷만 있어 이름은 여기서 붙인다.
  const nameOf = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name || u.email]));
    return (id: string | null, emailFallback: string | null): string =>
      (id && m.get(id)) || emailFallback || tx.anon;
  }, [users, tx.anon]);

  const since = useMemo(() => {
    if (range === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - Number(range));
    return d.toISOString();
  }, [range]);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    setErr(null);
    // 첫 페이지를 다시 읽을 때는 두 목록을 모두 비운다. 자료원을 전환한 직후
    // 이전 목록이 잠깐 남아 있으면 다른 자료를 보고 있는 것처럼 읽힌다.
    if (offset === 0) { setEntries([]); setEvents([]); setHasMore(false); }
    try {
      if (view === "data") {
        const r = await listAuditLog({
          actor: focusUserId || null,
          tableName: table || null,
          since,
          limit: PAGE,
          offset,
        });
        setEntries((prev) => (offset === 0 ? r.entries : [...prev, ...r.entries]));
        setHasMore(r.hasMore);
      } else {
        // 인증 이벤트는 오프셋 페이지네이션이 없다 — 한 번에 최대 200건만 보여준다.
        const r = await listAuthEvents({ userId: focusUserId || null, limit: 200 });
        setEvents(since ? r.filter((e) => e.occurredAt >= since) : r);
        setHasMore(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg === RPC_MISSING ? tx.rpcMissing : tx.loadFail + msg);
    } finally {
      setLoading(false);
    }
  }, [view, focusUserId, table, since, tx]);

  // 필터가 바뀌면 항상 첫 페이지부터 다시 읽는다.
  useEffect(() => { load(0); }, [load]);

  const busy = loading && entries.length === 0 && events.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs font-bold text-primary uppercase tracking-widest">{tx.title}</span>

        {/* 자료원 전환 */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden" role="group">
          {(["data", "auth"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "data" ? <Pencil className="w-3 h-3" /> : <LogIn className="w-3 h-3" />}
              {v === "data" ? tx.viewData : tx.viewAuth}
            </button>
          ))}
        </div>

        <button
          onClick={() => load(0)}
          title={tx.refresh}
          aria-label={tx.refresh}
          className="ml-auto p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{tx.fUser}</span>
          <select
            value={focusUserId}
            onChange={(e) => onFocusUser(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 font-semibold max-w-52"
          >
            <option value="">{tx.all}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
        </label>

        {view === "data" && (
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{tx.fTable}</span>
            <select
              value={table}
              onChange={(e) => setTable(e.target.value as AuditTable | "")}
              className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 font-semibold"
            >
              <option value="">{tx.all}</option>
              {AUDIT_TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{tx.fRange}</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 font-semibold"
          >
            <option value="7">{tx.d7}</option>
            <option value="30">{tx.d30}</option>
            <option value="90">{tx.d90}</option>
            <option value="all">{tx.dAll}</option>
          </select>
        </label>
      </div>

      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-destructive" />
          <span>{err}</span>
        </div>
      )}

      {busy ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : view === "data" ? (
        <DataTable entries={entries} tx={tx} lang={lang} nameOf={nameOf} />
      ) : (
        <AuthTable events={events} tx={tx} nameOf={nameOf} />
      )}

      {view === "data" && hasMore && !busy && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => load(entries.length)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {tx.more}
          </button>
        </div>
      )}

      <p className="mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground">{tx.note}</p>
    </div>
  );
}

// ── 데이터 변경 표 ────────────────────────────────────────────

function ChangeList({ e, tx, lang }: { e: AuditEntry; tx: Tx; lang: "ko" | "id" | "en" }) {
  if (e.op === "INSERT") return <span className="text-muted-foreground">{tx.created}</span>;
  if (e.op === "DELETE") return <span className="text-muted-foreground">{tx.removed}</span>;
  if (e.changes.length === 0) {
    return <span className="text-muted-foreground">{e.note || tx.noDiff}</span>;
  }
  // deleted_at 만 바뀐 UPDATE 는 실제로는 소프트 삭제/복구다 — 컬럼 나열보다 뜻을 보여준다.
  const only = e.changes.length === 1 ? e.changes[0] : null;
  if (only?.field === "deleted_at") {
    return (
      <span className={only.after ? "text-destructive font-semibold" : "text-muted-foreground"}>
        {only.after ? tx.softDelete : tx.restore}
      </span>
    );
  }
  const label = (c: FieldChange) => FIELD_LABEL[c.field]?.[lang] ?? c.field;
  return (
    <ul className="space-y-0.5">
      {e.changes.map((c) => (
        <li key={c.field} className="flex flex-wrap items-baseline gap-1">
          <span className="text-muted-foreground">{label(c)}</span>
          <span className="tabular-nums line-through text-muted-foreground/70">{fmtVal(c.field, c.before)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="tabular-nums font-semibold text-foreground">{fmtVal(c.field, c.after)}</span>
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  entries, tx, lang, nameOf,
}: {
  entries: AuditEntry[];
  tx: Tx;
  lang: "ko" | "id" | "en";
  nameOf: (id: string | null, email: string | null) => string;
}) {
  if (entries.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{tx.empty}</p>;
  }
  const opIcon = { INSERT: Plus, UPDATE: Pencil, DELETE: Trash2 } as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-2 text-left font-semibold w-36">
              {tx.colWhen} <span className="font-normal text-muted-foreground">({TZ_LABEL})</span>
            </th>
            <th className="px-2 py-2 text-left font-semibold w-36">{tx.colWho}</th>
            <th className="px-2 py-2 text-left font-semibold w-24">{tx.colWhat}</th>
            <th className="px-2 py-2 text-left font-semibold w-48">{tx.colTarget}</th>
            <th className="px-2 py-2 text-left font-semibold">{tx.colDetail}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const Icon = e.op ? opIcon[e.op] : Pencil;
            const opText = e.op ? tx[`op${e.op}`] : tx.opNone;
            // 마이그레이션이 남긴 행은 실행자가 없다 — 사람과 구분해 표시한다.
            const byMigration = e.source.startsWith("migration");
            return (
              <tr key={e.id} className="border-b border-border/40 align-top">
                <td className="px-2 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                  <span title={fmtDateTimeWIB(e.changedAt)}>{fmtRelative(e.changedAt, lang)}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="font-medium">{byMigration ? tx.srcMigration : nameOf(e.actor, e.actorEmail)}</span>
                  {e.actorEmail && !byMigration && (
                    <span className="block text-[10px] text-muted-foreground truncate max-w-36">{e.actorEmail}</span>
                  )}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold ${e.op ? OP_STYLE[e.op] : "bg-muted text-muted-foreground"}`}>
                    <Icon className="w-3 h-3" />{opText}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className="font-medium">{e.target}</span>
                  <span className="block text-[10px] text-muted-foreground font-mono">{e.tableName}</span>
                </td>
                <td className="px-2 py-2">
                  <ChangeList e={e} tx={tx} lang={lang} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 로그인 기록 표 ────────────────────────────────────────────

function AuthTable({
  events, tx, nameOf,
}: {
  events: AuthEvent[];
  tx: Tx;
  nameOf: (id: string | null, email: string | null) => string;
}) {
  if (events.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{tx.empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-2 text-left font-semibold w-40">
              {tx.colWhen} <span className="font-normal text-muted-foreground">({TZ_LABEL})</span>
            </th>
            <th className="px-2 py-2 text-left font-semibold">{tx.colWho}</th>
            <th className="px-2 py-2 text-left font-semibold w-40">{tx.colAction}</th>
            <th className="px-2 py-2 text-right font-semibold w-32">{tx.colIp}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const out = e.action === "logout";
            return (
              <tr key={e.id} className="border-b border-border/40">
                <td className="px-2 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                  {fmtDateTimeWIB(e.occurredAt)}
                </td>
                <td className="px-2 py-2">
                  <span className="font-medium">{nameOf(e.actorId, e.actorEmail)}</span>
                  {e.actorEmail && (
                    <span className="block text-[10px] text-muted-foreground truncate">{e.actorEmail}</span>
                  )}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold ${out ? "bg-muted text-muted-foreground" : "bg-accent text-foreground"}`}>
                    {out ? <LogOut className="w-3 h-3" /> : <LogIn className="w-3 h-3" />}
                    {authLabel(e.action, tx)}
                  </span>
                </td>
                <td className="px-2 py-2 text-right font-mono text-muted-foreground">{e.ip ?? EMPTY}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
