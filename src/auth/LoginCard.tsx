// @section: login-card
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useLang } from "@/i18n";
import { LogIn, Loader2 } from "lucide-react";

export default function LoginCard({ onSuccess, heading, className }: { onSuccess?: () => void; heading?: string; className?: string }) {
  const { signIn } = useAuth();
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await signIn(email.trim(), password);
    if (error) setErr(t("auth.failed"));
    else onSuccess?.();
    setBusy(false);
  };

  return (
    <div className={className ?? "max-w-sm mx-auto rounded-xl border border-border bg-card p-6 mt-6"}>
      <div className="flex items-center gap-2 mb-1">
        <LogIn className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">{heading ?? t("auth.required")}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t("auth.desc")}</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">{t("auth.email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">{t("auth.password")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground"
          />
        </div>
        {err && <p className="text-xs text-destructive font-semibold">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          {busy ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>
    </div>
  );
}
