// @section: auth
// Supabase Auth(이메일/비밀번호) 경량 래퍼 — 세션 추적 + 로그인/로그아웃.
import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// 계정 권한 등급 — Supabase app_metadata.role 에 저장(관리자만 설정, JWT 포함).
//  admin: 모든 권한 / staff: 입력·수정·다운로드 / user(기본): 읽기만
export type Role = "admin" | "staff" | "user";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  role: Role;
  canWrite: boolean;    // 입력·수정 (staff, admin)
  canDelete: boolean;   // 삭제 (admin)
  canDownload: boolean; // 다운로드 (staff, admin)
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const user = session?.user ?? null;
  const raw = user?.app_metadata?.role;
  const role: Role = raw === "admin" || raw === "staff" ? raw : "user"; // 비로그인/미지정 = user(읽기)
  const canWrite = role === "admin" || role === "staff";
  const canDelete = role === "admin";
  const canDownload = role === "admin" || role === "staff";

  return (
    <Ctx.Provider value={{ user, loading, role, canWrite, canDelete, canDownload, isAdmin: role === "admin", signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
