// @section: admin-tab
// 관리자 페이지 — 두 개의 절로 나뉜다.
//   · 사용자 권한관리 (UsersPanel)
//   · 사용자별 로그기록 (ActivityPanel)
//
// 사용자 목록은 여기서 한 번만 읽어 두 절이 함께 쓴다. 로그 화면은 audit_log 의
// actor(uuid)만 갖고 있어 이름을 붙이려면 같은 목록이 필요하다.
//
// 이 화면이 보이는 것 자체는 admin 에게만 허용되지만(Index 에서 차단), 실제 방어선은
// 서버다 — Edge Function 의 admin 검사와 audit_log 의 RLS.
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ScrollText, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { listUsers, type ManagedUser } from "@/api/adminUsers";
import { friendlyAuthError } from "@/lib/authErrors";
import UsersPanel from "@/components/admin/UsersPanel";
import ActivityPanel from "@/components/admin/ActivityPanel";

const TX = {
  ko: {
    title: "관리자",
    secUsers: "사용자 권한관리",
    secLogs: "사용자별 로그기록",
    desc: "계정·권한을 관리하고, 사용자가 남긴 변경·접속 기록을 확인합니다.",
    loadFail: "목록을 불러오지 못했습니다: ",
    retry: "다시 시도",
  },
  id: {
    title: "Administrator",
    secUsers: "Manajemen Izin Pengguna",
    secLogs: "Log Aktivitas Pengguna",
    desc: "Kelola akun dan izin, serta periksa riwayat perubahan dan akses pengguna.",
    loadFail: "Gagal memuat daftar: ",
    retry: "Coba lagi",
  },
  en: {
    title: "Administration",
    secUsers: "User Permissions",
    secLogs: "User Activity Log",
    desc: "Manage accounts and permissions, and review each user's changes and sign-ins.",
    loadFail: "Failed to load the list: ",
    retry: "Retry",
  },
} as const;

type Section = "users" | "logs";

export default function AdminTab() {
  const { lang } = useLang();
  const tx = TX[lang];

  const [section, setSection] = useState<Section>("users");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [callerId, setCallerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // 로그 절의 사용자 필터. 권한 절의 "로그 보기" 버튼이 여기에 값을 넣고 절을 바꾼다.
  const [logUserId, setLogUserId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listUsers();
      setUsers(r.users);
      setCallerId(r.callerId);
      setFailed(false);
    } catch (e) {
      setFailed(true);
      toast.error(tx.loadFail + friendlyAuthError(e, lang));
    } finally {
      setLoading(false);
    }
  }, [tx, lang]);

  useEffect(() => { load(); }, [load]);

  const viewLog = (userId: string) => {
    setLogUserId(userId);
    setSection("logs");
  };

  const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "users", label: tx.secUsers, icon: <Users className="w-3.5 h-3.5" /> },
    { id: "logs", label: tx.secLogs, icon: <ScrollText className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight">{tx.title}</h2>
          <p className="text-xs text-muted-foreground">{tx.desc}</p>
        </div>
      </div>

      {/* 절 전환 */}
      <div className="flex flex-wrap gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            aria-pressed={section === s.id}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              section === s.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {/* 목록 조회 자체가 실패하면(권한 상실·네트워크) 두 절 모두 쓸 수 없다 */}
      {failed ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{tx.loadFail}</p>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
          >
            <RefreshCw className="w-4 h-4" /> {tx.retry}
          </button>
        </div>
      ) : section === "users" ? (
        <UsersPanel
          users={users}
          callerId={callerId}
          loading={loading}
          reload={load}
          patch={setUsers}
          onViewLog={viewLog}
        />
      ) : (
        <ActivityPanel users={users} focusUserId={logUserId} onFocusUser={setLogUserId} />
      )}
    </div>
  );
}
