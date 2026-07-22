// @section: auth
// Supabase Auth(이메일/비밀번호) 경량 래퍼 — 세션 추적 + 로그인/로그아웃.
import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// 계정 권한 등급 — Supabase app_metadata.role 에 저장(관리자만 설정, JWT 포함).
//  admin: 모든 권한 / inspector: 입력·수정 / viewer(기본): 조회
//  엑셀 다운로드는 등급과 무관하게 로그인한 모든 사용자에게 허용한다.
export type Role = "admin" | "inspector" | "viewer";

// 구 명칭 호환 — 이미 로그인한 사용자의 JWT 에는 옛 값이 남아 있을 수 있다.
// (DB 쪽도 app_role() 에서 동일하게 정규화한다 — 마이그레이션 0010)
const LEGACY: Record<string, Role> = { staff: "inspector", user: "viewer" };

interface AuthCtx {
  user: User | null;
  loading: boolean;
  role: Role;
  canWrite: boolean;    // 입력·수정 (staff, admin)
  canDelete: boolean;   // 삭제 (admin)
  canDownload: boolean; // 다운로드 (로그인한 모든 사용자)
  isAdmin: boolean;
  /** 초대 수락·비밀번호 재설정 링크로 들어온 상태 — 비밀번호를 정해야 로그인이 완성된다. */
  needsPassword: boolean;
  dismissNeedsPassword: () => void;
  /** 표시용 이름(user_metadata.display_name). 없으면 이메일로 대체된다. */
  displayName: string;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updatePassword: (password: string, name: string) => Promise<{ error?: string }>;
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
  const updatePassword = async (password: string, name: string) => {
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false, display_name: name.trim() },
    });
    if (!error) setNeedsPassword(false);
    return { error: error?.message };
  };

  // 자가 재설정(resetPasswordForEmail)은 두지 않는다 — 메일(SMTP) 미구성으로 실패하고,
  // 본인 확인 없이 공개 화면에서 되돌리면 계정 탈취가 된다.
  // 분실 시에는 관리자가 사용자 관리 화면에서 초기화한다(admin-users: resetPassword).
  // SMTP 를 붙이면 되살릴 수 있다 — docs/과제_커스텀SMTP.md 참고.

  const user = session?.user ?? null;
  // 관리자가 만든 계정은 공통 초기 비밀번호를 쓰므로 첫 로그인 때 변경을 요구한다.
  const mustChange = user?.user_metadata?.must_change_password === true;
  // 헤더에는 이메일 대신 이름을 쓴다. 아직 이름을 정하지 않은 계정은 이메일로 대체.
  const displayName = (user?.user_metadata?.display_name as string | undefined)?.trim() || user?.email || "";
  const rawRole = user?.app_metadata?.role as string | undefined;
  const raw = rawRole && LEGACY[rawRole] ? LEGACY[rawRole] : rawRole;
  const role: Role = raw === "admin" || raw === "inspector" ? raw : "viewer"; // 비로그인/미지정 = viewer(조회)
  const canWrite = role === "admin" || role === "inspector";
  const canDelete = role === "admin";
  // 다운로드는 조회 권한(user)까지 허용 — 앱 자체가 로그인 뒤에 있으므로 외부 노출은 없다.
  const canDownload = Boolean(user);

  return (
    <Ctx.Provider value={{
      user, loading, role, canWrite, canDelete, canDownload, isAdmin: role === "admin",
      displayName,
      needsPassword: needsPassword || mustChange,
      dismissNeedsPassword: () => setNeedsPassword(false),
      signIn, signOut, updatePassword,
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
