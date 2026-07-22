// @section: set-password-card
// 비밀번호 설정·변경 — 초대 수락(최초 설정)과 로그인 후 변경에 같은 폼을 쓴다.
// 초대 링크로 들어오면 이미 세션이 만들어져 있으므로 updateUser({password}) 로 끝난다.
import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useLang } from "@/i18n";

const MIN_LEN = 8;

export default function SetPasswordCard({
  heading,
  onDone,
  onCancel,
  className,
}: {
  heading?: string;
  onDone?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const { updatePassword, user } = useAuth();
  const { t } = useLang();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw.length < MIN_LEN) { setErr(t("pw.tooShort")); return; }
    if (pw !== pw2) { setErr(t("pw.mismatch")); return; }
    setBusy(true);
    const { error } = await updatePassword(pw);
    setBusy(false);
    if (error) { setErr(error); return; }
    onDone?.();
  };

  return (
    <div className={className ?? "max-w-sm mx-auto rounded-xl border border-border bg-card p-6"}>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">{heading ?? t("pw.setTitle")}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {user?.email ? `${user.email} · ` : ""}{t("pw.desc")}
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">{t("pw.new")}</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">{t("pw.confirm")}</label>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground"
          />
        </div>
        {err && <p className="text-xs text-destructive font-semibold">{err}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {t("pw.save")}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              {t("pw.cancel")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
