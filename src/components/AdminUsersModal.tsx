// @section: admin-users-modal
// 사용자·역할 관리 화면 (admin 전용).
// 실제 권한 검사는 Edge Function(admin-users)에서 수행한다 — 이 화면은 UX 층일 뿐이며,
// 화면을 우회해 직접 호출해도 admin 이 아니면 403 이다.
import { useCallback, useEffect, useState } from "react";
import { X, RefreshCw, Loader2, UserPlus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import type { Role } from "@/auth/AuthProvider";
import { listUsers, setUserRole, inviteUser, deleteUser, type ManagedUser } from "@/api/adminUsers";
import { friendlyAuthError } from "@/lib/authErrors";

const TX = {
  ko: {
    title: "사용자 관리",
    colEmail: "이메일",
    colRole: "권한",
    colLastSignIn: "최근 로그인",
    never: "―",
    pending: "초대 대기",
    me: "나",
    invite: "사용자 초대",
    invitePh: "이메일 주소",
    inviteBtn: "초대",
    inviteOk: "초대 메일을 보냈습니다",
    cancel: "취소",
    roleChanged: "권한을 변경했습니다",
    loadFail: "목록을 불러오지 못했습니다: ",
    saveFail: "변경 실패: ",
    inviteFail: "초대 실패: ",
    selfDemote: "자신의 관리자 권한은 해제할 수 없습니다.",
    reloginNote: "권한 변경은 해당 사용자가 로그아웃 후 재로그인해야 적용됩니다.",
    empty: "사용자가 없습니다.",
    refresh: "새로고침",
    del: "계정 삭제",
    delConfirm: "계정을 삭제하시겠습니까?\n되돌릴 수 없습니다. 이 사용자가 입력한 점검 데이터는 그대로 남습니다.",
    delOk: "계정을 삭제했습니다",
    delFail: "삭제 실패: ",
    selfDelete: "자기 자신의 계정은 삭제할 수 없습니다.",
  },
  id: {
    title: "Manajemen Pengguna",
    colEmail: "Email",
    colRole: "Izin",
    colLastSignIn: "Masuk terakhir",
    never: "―",
    pending: "Menunggu undangan",
    me: "Saya",
    invite: "Undang pengguna",
    invitePh: "Alamat email",
    inviteBtn: "Undang",
    inviteOk: "Email undangan terkirim",
    cancel: "Batal",
    roleChanged: "Izin diubah",
    loadFail: "Gagal memuat daftar: ",
    saveFail: "Gagal mengubah: ",
    inviteFail: "Gagal mengundang: ",
    selfDemote: "Anda tidak dapat mencabut izin admin sendiri.",
    reloginNote: "Perubahan izin berlaku setelah pengguna keluar dan masuk kembali.",
    empty: "Tidak ada pengguna.",
    refresh: "Muat ulang",
    del: "Hapus akun",
    delConfirm: "Hapus akun ini?\nTidak dapat dibatalkan. Data inspeksi yang diinput tetap tersimpan.",
    delOk: "Akun dihapus",
    delFail: "Gagal menghapus: ",
    selfDelete: "Anda tidak dapat menghapus akun sendiri.",
  },
} as const;

const ROLE_BADGE_BG: Record<Role, string> = {
  admin: "#E3F2FD",
  staff: "#E8F5E9",
  user: "#ECEFF1",
};

const ROLES: Role[] = ["admin", "staff", "user"];

export default function AdminUsersModal({ onClose }: { onClose: () => void }) {
  const { lang, t } = useLang();
  const tx = TX[lang];

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [callerId, setCallerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("staff");
  const [inviteBusy, setInviteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listUsers();
      setUsers(r.users);
      setCallerId(r.callerId);
    } catch (e) {
      toast.error(tx.loadFail + friendlyAuthError(e, lang));
    } finally {
      setLoading(false);
    }
  }, [tx, lang]);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (u: ManagedUser, role: Role) => {
    if (role === u.role) return;
    setBusyId(u.id);
    const prev = users;
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role } : x))); // 낙관적 갱신
    try {
      await setUserRole(u.id, role);
      toast.success(`${tx.roleChanged} — ${u.email}`);
    } catch (e) {
      setUsers(prev); // 롤백
      const msg = e instanceof Error && e.message === "self_demote" ? tx.selfDemote : tx.saveFail + friendlyAuthError(e, lang);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u: ManagedUser) => {
    if (!confirm(`${tx.delConfirm}\n\n${u.email}`)) return;
    setBusyId(u.id);
    try {
      await deleteUser(u.id);
      setUsers((list) => list.filter((x) => x.id !== u.id));
      toast.success(`${tx.delOk} — ${u.email}`);
    } catch (e) {
      const msg = e instanceof Error && e.message === "self_delete"
        ? tx.selfDelete
        : tx.delFail + friendlyAuthError(e, lang);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleInvite = async () => {
    const email = newEmail.trim();
    if (!email) return;
    setInviteBusy(true);
    try {
      await inviteUser(email, newRole);
      toast.success(`${tx.inviteOk} — ${email}`);
      setNewEmail(""); setAdding(false);
      await load();
    } catch (e) {
      toast.error(tx.inviteFail + friendlyAuthError(e, lang));
    } finally {
      setInviteBusy(false);
    }
  };

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(lang === "ko" ? "ko-KR" : "id-ID") : tx.never;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute -top-3 -right-3 z-10 p-1.5 rounded-full bg-card border border-border shadow hover:bg-muted/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">{tx.title}</h2>
          <button
            onClick={load}
            title={tx.refresh}
            className="ml-auto p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" /> {tx.invite}
            </button>
          )}
        </div>

        {adding && (
          <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={tx.invitePh}
              className="flex-1 min-w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </select>
            <button
              onClick={handleInvite}
              disabled={inviteBusy || !newEmail.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {inviteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {tx.inviteBtn}
            </button>
            <button
              onClick={() => { setAdding(false); setNewEmail(""); }}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              {tx.cancel}
            </button>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto px-5">
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{tx.empty}</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">{tx.colEmail}</th>
                  <th className="px-2 py-2 text-left font-semibold w-32">{tx.colRole}</th>
                  <th className="px-2 py-2 text-right font-semibold w-28">{tx.colLastSignIn}</th>
                  <th className="px-2 py-2 w-10" aria-label={tx.del} />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === callerId;
                  return (
                    <tr key={u.id} className="border-b border-border/40">
                      <td className="px-2 py-2.5">
                        <span className="font-medium">{u.email}</span>
                        {isMe && (
                          <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: ROLE_BADGE_BG.user, color: "#546E7A" }}>
                            {tx.me}
                          </span>
                        )}
                        {!u.confirmed && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">({tx.pending})</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <select
                          value={u.role}
                          disabled={busyId === u.id || isMe}
                          onChange={(e) => changeRole(u, e.target.value as Role)}
                          title={isMe ? tx.selfDemote : undefined}
                          className="rounded-lg border border-border px-2 py-1 text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                          style={{ backgroundColor: ROLE_BADGE_BG[u.role], color: "#546E7A" }}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                        {fmtDate(u.lastSignInAt)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {/* 자기 자신은 삭제 불가(서버에서도 거부) */}
                        {!isMe && (
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={busyId === u.id}
                            title={tx.del}
                            aria-label={tx.del}
                            className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
                          >
                            {busyId === u.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="px-5 py-3 text-[11px] text-muted-foreground border-t border-border mt-3">
          ⚠ {tx.reloginNote}
        </p>
      </div>
    </div>
  );
}
