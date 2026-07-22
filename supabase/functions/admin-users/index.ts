// @section: admin-users-function
// 사용자·역할 관리 (admin 전용) — Supabase Edge Function.
//
// 왜 Edge Function인가:
//   역할은 auth.users.app_metadata.role 에 저장되고, 이 필드는 service_role 키로만
//   수정할 수 있다. service_role 키는 클라이언트에 두면 안 되므로(RLS 전체 우회)
//   서버 측 시크릿으로 두고 이 함수에서만 사용한다.
//
// 요청: POST { action: "list" }
//            { action: "create",  email, role, password? }
//            { action: "setRole", userId, role }
//            { action: "delete",  userId }
// 인증: Authorization: Bearer <호출자 JWT> — app_metadata.role === "admin" 이어야 함.
import { createClient } from "npm:@supabase/supabase-js@2";

type Role = "admin" | "inspector" | "viewer";
const ROLES: Role[] = ["admin", "inspector", "viewer"];

// 구 명칭 호환 — 아직 옛 값이 남은 계정이 있을 수 있다(마이그레이션 0010).
const LEGACY: Record<string, Role> = { staff: "inspector", user: "viewer" };

// 관리자가 계정을 만들 때 부여하는 공통 초기 비밀번호.
// 공유값이므로 첫 로그인 시 변경을 강제한다(user_metadata.must_change_password).
const DEFAULT_PASSWORD = "Ascendo123";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const roleOf = (u: { app_metadata?: Record<string, unknown> } | null): Role => {
  const r = u?.app_metadata?.role;
  const n = typeof r === "string" && LEGACY[r] ? LEGACY[r] : r;
  return n === "admin" || n === "inspector" ? n : "viewer";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "server_misconfigured" }, 500);

  // 1) 호출자 신원 확인 — 전달된 JWT로 조회(서비스 키 아님).
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me?.user) return json({ error: "unauthenticated" }, 401);

  // 2) admin 권한 확인 — 이 함수의 유일한 방어선이므로 여기서 반드시 막는다.
  if (roleOf(me.user) !== "admin") return json({ error: "forbidden" }, 403);

  // 3) 여기서부터 service_role 사용 (RLS 우회 — admin 확인 이후에만).
  const admin = createClient(url, service, { auth: { persistSession: false } });

  let body: { action?: string; email?: string; userId?: string; role?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const { action, email, userId, role, password } = body;

  if (action === "list") {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return json({ error: error.message }, 500);
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      role: roleOf(u),
      lastSignInAt: u.last_sign_in_at ?? null,
      createdAt: u.created_at,
      confirmed: Boolean(u.email_confirmed_at),
    }));
    return json({ users, callerId: me.user.id });
  }

  if (action === "setRole") {
    if (!userId || !ROLES.includes(role as Role)) return json({ error: "invalid_args" }, 400);
    // 잠금 방지 — 자신의 admin 권한을 스스로 내리면 관리 화면에 다시 못 들어온다.
    if (userId === me.user.id && role !== "admin") return json({ error: "self_demote" }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role },
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "create") {
    if (!email || !ROLES.includes(role as Role)) return json({ error: "invalid_args" }, 400);
    // 메일 인증 없이 바로 쓰는 계정 — email_confirm 으로 확인 절차를 건너뛴다.
    // 초기 비밀번호는 모든 계정이 공통이므로, 첫 로그인 때 변경하도록 표시를 남긴다.
    // (user_metadata 는 본인이 수정할 수 있어야 하므로 app_metadata 가 아닌 여기에 둔다)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: password || DEFAULT_PASSWORD,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { must_change_password: true },
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, userId: data.user?.id ?? null });
  }

  if (action === "resetPassword") {
    if (!userId) return json({ error: "invalid_args" }, 400);
    // 메일 발송(SMTP)이 없으므로 관리자가 초기 비밀번호로 되돌려 직접 전달한다.
    // 되돌린 뒤에는 계정 생성 때와 마찬가지로 첫 로그인에서 변경을 강제한다.
    // user_metadata 는 통째로 대체되므로 기존 값(display_name 등)을 먼저 읽어 병합한다.
    const { data: cur, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr) return json({ error: getErr.message }, 500);
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: DEFAULT_PASSWORD,
      user_metadata: { ...(cur.user?.user_metadata ?? {}), must_change_password: true },
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "delete") {
    if (!userId) return json({ error: "invalid_args" }, 400);
    // 자기 자신은 지울 수 없다 — 마지막 admin 이 사라지면 관리 화면에 아무도 못 들어간다.
    if (userId === me.user.id) return json({ error: "self_delete" }, 400);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
