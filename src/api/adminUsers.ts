// @section: admin-users-api
// 사용자·역할 관리 (admin 전용) — Edge Function `admin-users` 호출 래퍼.
// 역할은 auth.users.app_metadata 에 있어 service_role 로만 수정 가능하므로
// 클라이언트는 직접 쓰지 않고 이 함수를 통해서만 요청한다(권한 검사도 서버에서).
import { supabase } from "@/lib/supabase";
import type { Role } from "@/auth/AuthProvider";

export interface ManagedUser {
  id: string;
  email: string;
  role: Role;
  lastSignInAt: string | null;
  createdAt: string;
  confirmed: boolean;
}

/** Edge Function 호출 — 함수가 반환한 error 문자열을 Error 로 승격. */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(
    "admin-users",
    { body }
  );
  if (error) {
    // 비-2xx 응답은 본문에 상세 사유가 있다(FunctionsHttpError) — "forbidden" 등.
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const raw = await ctx.text().catch((): string => "");
      let detail: { error?: string } | null = null;
      try {
        detail = JSON.parse(raw) as { error?: string };
      } catch {
        detail = null; // 본문이 JSON 이 아니면 원래 error 를 던진다
      }
      if (detail?.error) throw new Error(detail.error);
    }
    throw error;
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

/** 전체 사용자 목록 + 호출자 자신의 id(자기 행 표시용). */
export function listUsers(): Promise<{ users: ManagedUser[]; callerId: string }> {
  return call({ action: "list" });
}

/** 역할 변경. 자기 자신의 admin 해제는 서버에서 거부(self_demote). */
export function setUserRole(userId: string, role: Role): Promise<{ ok: true }> {
  return call({ action: "setRole", userId, role });
}

/**
 * 초대 메일 발송 + 역할 부여.
 * redirectTo: 초대 수락 후 돌아올 주소. 현재 앱 주소를 그대로 넘겨 dev(8080)·배포(gh-pages)
 *   양쪽에서 동작하게 한다. 지정하지 않으면 Supabase 의 Site URL 로 가버린다.
 *   ⚠ 이 주소는 Supabase 대시보드의 Redirect URLs 허용목록에 있어야 적용된다.
 */
export function inviteUser(email: string, role: Role): Promise<{ ok: true; userId: string | null }> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return call({ action: "invite", email, role, redirectTo });
}

/**
 * 계정 삭제(되돌릴 수 없음). 자기 자신은 서버에서 거부(self_delete).
 * 이 사용자가 입력한 점검 데이터는 남으며, 기록된 입력자 이메일도 그대로 보존된다.
 */
export function deleteUser(userId: string): Promise<{ ok: true }> {
  return call({ action: "delete", userId });
}
