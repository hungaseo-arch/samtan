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
  /** 초대 수락·비밀번호 재설정 링크로 들어온 상태 — 비밀번호를 정해야 로그인이 완성된다. */
  needsPassword: boolean;
  dismissNeedsPassword: () => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    // 초대(type=invite)·재설정(type=recovery) 링크로 들어오면 비밀번호를 정해야 한다.
    // supabase-js 가 URL 해시를 소비해 세션을 만들기 전에 먼저 확인한다.
    if (/type=(invite|recovery)/.test(window.location.hash)) setNeedsPassword(true);

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
      if (event === "SIGNED_OUT") setNeedsPassword(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  /**
   * 현재 로그인 세션의 비밀번호 변경(계정 생성 후 최초 설정도 동일 경로).
   * 관리자가 만든 계정은 공통 초기 비밀번호를 쓰므로 변경과 동시에 강제 표시를 해제한다.
   */
  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (!error) setNeedsPassword(false);
    return { error: error?.message };
  };

  /** 재설정 메일 발송 — 복귀 주소는 현재 앱 주소(Supabase 허용목록에 있어야 함). */
  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    });
    return { error: error?.message };
  };

  const user = session?.user ?? null;
  // 관리자가 만든 계정은 공통 초기 비밀번호를 쓰므로 첫 로그인 때 변경을 요구한다.
  const mustChange = user?.user_metadata?.must_change_password === true;
  const raw = user?.app_metadata?.role;
  const role: Role = raw === "admin" || raw === "staff" ? raw : "user"; // 비로그인/미지정 = user(읽기)
  const canWrite = role === "admin" || role === "staff";
  const canDelete = role === "admin";
  const canDownload = role === "admin" || role === "staff";

  return (
    <Ctx.Provider value={{
      user, loading, role, canWrite, canDelete, canDownload, isAdmin: role === "admin",
      needsPassword: needsPassword || mustChange,
      dismissNeedsPassword: () => setNeedsPassword(false),
      signIn, signOut, updatePassword, sendPasswordReset,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
