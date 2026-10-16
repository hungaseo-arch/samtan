// @section: admin-users-panel
// 관리자 페이지 › 사용자 권한관리.
//
// 실제 권한 검사는 Edge Function(admin-users)에서 수행한다 — 이 화면은 UX 층일 뿐이며,
// 화면을 우회해 직접 호출해도 admin 이 아니면 403 이다.
// 목록 자체는 상위(AdminTab)가 들고 있다 — 로그 탭의 사용자 필터도 같은 목록을 쓴다.
import { useState } from "react";
import { Loader2, UserPlus, Trash2, KeyRound, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import type { Role } from "@/auth/AuthProvider";
import {
  setUserRole, createUser, deleteUser, resetUserPassword,
  INITIAL_PASSWORD, type ManagedUser,
} from "@/api/adminUsers";
import { friendlyAuthError } from "@/lib/authErrors";
import { fmtDateWIB } from "@/lib/format";

const TX = {
  ko: {
    colEmail: "사용자", colRole: "권한", colLastSignIn: "최근 로그인",
    never: "―", pending: "미확인", noName: "이름 미설정", me: "나",
    invite: "사용자 추가", invitePh: "이메일 주소", inviteBtn: "추가",
    inviteOk: "계정을 만들었습니다", cancel: "취소",
    roleChanged: "권한을 변경했습니다",
    saveFail: "변경 실패: ", inviteFail: "생성 실패: ",
    initialPw: "초기 비밀번호",
    initialPwNote: "첫 로그인 시 비밀번호 변경 화면이 표시됩니다.",
    selfDemote: "자신의 관리자 권한은 해제할 수 없습니다.",
    reloginNote: "권한 변경은 해당 사용자가 로그아웃 후 재로그인해야 적용됩니다.",
    empty: "사용자가 없습니다.",
    del: "계정 삭제",
    delConfirm: "계정을 삭제하시겠습니까?\n되돌릴 수 없습니다. 이 사용자가 입력한 점검 데이터는 그대로 남습니다.",
    delOk: "계정을 삭제했습니다", delFail: "삭제 실패: ",
    selfDelete: "자기 자신의 계정은 삭제할 수 없습니다.",
    pwReset: "비밀번호 초기화",
    pwResetConfirm: "비밀번호를 초기값으로 되돌리시겠습니까?\n해당 사용자는 다음 로그인에서 새 비밀번호를 정해야 합니다.",
    pwResetOk: "비밀번호를 초기화했습니다", pwResetFail: "초기화 실패: ",
    viewLog: "이 사용자의 로그 보기",
  },
  id: {
    colEmail: "Pengguna", colRole: "Izin", colLastSignIn: "Masuk terakhir",
    never: "―", pending: "Belum dikonfirmasi", noName: "Nama belum diatur", me: "Saya",
    invite: "Tambah pengguna", invitePh: "Alamat email", inviteBtn: "Tambah",
    inviteOk: "Akun dibuat", cancel: "Batal",
    roleChanged: "Izin diubah",
    saveFail: "Gagal mengubah: ", inviteFail: "Gagal membuat: ",
    initialPw: "Kata sandi awal",
    initialPwNote: "Layar ubah kata sandi muncul saat login pertama.",
    selfDemote: "Anda tidak dapat mencabut izin admin sendiri.",
    reloginNote: "Perubahan izin berlaku setelah pengguna keluar dan masuk kembali.",
    empty: "Tidak ada pengguna.",
    del: "Hapus akun",
    delConfirm: "Hapus akun ini?\nTidak dapat dibatalkan. Data inspeksi yang diinput tetap tersimpan.",
    delOk: "Akun dihapus", delFail: "Gagal menghapus: ",
    selfDelete: "Anda tidak dapat menghapus akun sendiri.",
    pwReset: "Reset kata sandi",
    pwResetConfirm: "Kembalikan kata sandi ke nilai awal?\nPengguna harus menetapkan kata sandi baru saat login berikutnya.",
    pwResetOk: "Kata sandi direset", pwResetFail: "Gagal mereset: ",
    viewLog: "Lihat log pengguna ini",
  },
  en: {
    colEmail: "User", colRole: "Permission", colLastSignIn: "Last sign-in",
    never: "―", pending: "Unconfirmed", noName: "No name set", me: "Me",
    invite: "Add user", invitePh: "Email address", inviteBtn: "Add",
    inviteOk: "Account created", cancel: "Cancel",
    roleChanged: "Permission changed",
    saveFail: "Change failed: ", inviteFail: "Creation failed: ",
    initialPw: "Initial password",
    initialPwNote: "The password change screen appears at first sign-in.",
    selfDemote: "You cannot revoke your own admin permission.",
    reloginNote: "Permission changes apply after the user signs out and signs back in.",
    empty: "No users.",
    del: "Delete account",
    delConfirm: "Delete this account?\nThis cannot be undone. Inspection data entered by this user is kept.",
    delOk: "Account deleted", delFail: "Delete failed: ",
    selfDelete: "You cannot delete your own account.",
    pwReset: "Reset password",
    pwResetConfirm: "Reset this password to the initial value?\nThe user must set a new password at next sign-in.",
    pwResetOk: "Password reset", pwResetFail: "Reset failed: ",
    viewLog: "View this user's log",
  },
} as const;

// 역할 배지 배경 — 프로젝트 팔레트(연한 배경 + 어두운 청회색 텍스트)
const ROLE_BADGE_BG: Record<Role, string> = {
  admin: "#E3F2FD",
  inspector: "#E8F5E9",
  viewer: "#ECEFF1",
};

const ROLES: Role[] = ["admin", "inspector", "viewer"];

interface Props {
  users: ManagedUser[];
  callerId: string;
  loading: boolean;
  /** 서버 상태를 다시 읽는다 — 생성 직후처럼 낙관적 갱신으로 못 채우는 값이 있을 때. */
  reload: () => Promise<void>;
  /** 목록을 화면에서만 갱신 — 역할 변경·삭제처럼 결과가 확정된 조작. */
  patch: (fn: (list: ManagedUser[]) => ManagedUser[]) => void;
  onViewLog: (userId: string) => void;
}

export default function UsersPanel({ users, callerId, loading, reload, patch, onViewLog }: Props) {
  const { lang, t } = useLang();
  const tx = TX[lang];

  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("inspector");
  const [inviteBusy, setInviteBusy] = useState(false);

  const changeRole = async (u: ManagedUser, role: Role) => {
    if (role === u.role) return;
    setBusyId(u.id);
    patch((list) => list.map((x) => (x.id === u.id ? { ...x, role } : x))); // 낙관적 갱신
    try {
      await setUserRole(u.id, role);
      toast.success(`${tx.roleChanged} — ${u.email}`);
    } catch (e) {
      patch((list) => list.map((x) => (x.id === u.id ? { ...x, role: u.role } : x))); // 롤백
      const msg = e instanceof Error && e.message === "self_demote"
        ? tx.selfDemote
        : tx.saveFail + friendlyAuthError(e, lang);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPw = async (u: ManagedUser) => {
    if (!confirm(`${tx.pwResetConfirm}\n\n${u.email}`)) return;
    setBusyId(u.id);
    try {
      await resetUserPassword(u.id);
      toast.success(`${tx.pwResetOk} — ${u.email} · ${tx.initialPw}: ${INITIAL_PASSWORD}`);
    } catch (e) {
      toast.error(tx.pwResetFail + friendlyAuthError(e, lang));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u: ManagedUser) => {
    if (!confirm(`${tx.delConfirm}\n\n${u.email}`)) return;
    setBusyId(u.id);
    try {
      await deleteUser(u.id);
      patch((list) => list.filter((x) => x.id !== u.id));
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
      await createUser(email, newRole);
      toast.success(`${tx.inviteOk} — ${email} · ${tx.initialPw}: ${INITIAL_PASSWORD}`);
      setNewEmail(""); setAdding(false);
      await reload();
    } catch (e) {
      toast.error(tx.inviteFail + friendlyAuthError(e, lang));
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs font-bold text-primary uppercase tracking-widest">
          {t("admin.users")}
        </span>
        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-full">{users.length}</span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" /> {tx.invite}
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
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

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{tx.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-2 py-2 text-left font-semibold">{tx.colEmail}</th>
                <th className="px-2 py-2 text-left font-semibold w-32">{tx.colRole}</th>
                <th className="px-2 py-2 text-right font-semibold w-28">{tx.colLastSignIn}</th>
                <th className="px-2 py-2 w-24" aria-label={tx.del} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === callerId;
                return (
                  <tr key={u.id} className="border-b border-border/40">
                    <td className="px-2 py-2.5">
                      <span className={`font-medium ${u.name ? "" : "text-muted-foreground italic"}`}>
                        {u.name || tx.noName}
                      </span>
                      {isMe && (
                        <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: ROLE_BADGE_BG.viewer, color: "#546E7A" }}>
                          {tx.me}
                        </span>
                      )}
                      {!u.confirmed && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">({tx.pending})</span>
                      )}
                      <span className="block text-[11px] text-muted-foreground truncate">{u.email}</span>
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
                      {u.lastSignInAt ? fmtDateWIB(u.lastSignInAt) : tx.never}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {/* 이 사용자의 활동 로그로 바로 넘어간다 */}
                      <button
                        onClick={() => onViewLog(u.id)}
                        title={tx.viewLog}
                        aria-label={tx.viewLog}
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ScrollText className="w-3.5 h-3.5" />
                      </button>
                      {/* 비밀번호 초기화 — 메일 발송이 불가하므로 관리자가 대신 되돌린다 */}
                      <button
                        onClick={() => handleResetPw(u)}
                        disabled={busyId === u.id}
                        title={tx.pwReset}
                        aria-label={tx.pwReset}
                        className="p-1 text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
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
        </div>
      )}

      {/* 새 계정 발급 시 관리자가 그대로 전달해야 하는 값이라 항상 보이게 둔다 */}
      <div className="mt-4 pt-3 border-t border-border space-y-1">
        <p className="text-[11px] text-muted-foreground">
          🔑 {tx.initialPw}: <span className="font-mono font-bold text-foreground">{INITIAL_PASSWORD}</span>
          {" · "}{tx.initialPwNote}
        </p>
        <p className="text-[11px] text-muted-foreground">⚠ {tx.reloginNote}</p>
      </div>
    </div>
  );
}
