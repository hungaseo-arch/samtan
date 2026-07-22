// @section: admin-users-function
// 사용자·역할 관리 (admin 전용) — Supabase Edge Function.
//
// 왜 Edge Function인가:
//   역할은 auth.users.app_metadata.role 에 저장되고, 이 필드는 service_role 키로만
//   수정할 수 있다. service_role 키는 클라이언트에 두면 안 되므로(RLS 전체 우회)
//   서버 측 시크릿으로 두고 이 함수에서만 사용한다.
//
// 요청: POST { action: "list" }
//            { action: "invite",  email, role }
//            { action: "setRole", userId, role }
// 인증: Authorization: Bearer <호출자 JWT> — app_metadata.role === "admin" 이어야 함.
import { createClient } from "npm:@supabase/supabase-js@2";

type Role = "admin" | "staff" | "user";
const ROLES: Role[] = ["admin", "staff", "user"];

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
  return r === "admin" || r === "staff" ? r : "user";
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

  let body: { action?: string; email?: string; userId?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const { action, email, userId, role } = body;

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

  if (action === "invite") {
    if (!email || !ROLES.includes(role as Role)) return json({ error: "invalid_args" }, 400);
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
    if (error) return json({ error: error.message }, 500);
    // 초대 메일 발송 후 역할 부여 (invite 호출은 app_metadata 를 받지 않는다).
    if (data.user && role !== "user") {
      const { error: rErr } = await admin.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role },
      });
      if (rErr) return json({ error: rErr.message }, 500);
    }
    return json({ ok: true, userId: data.user?.id ?? null });
  }

  return json({ error: "unknown_action" }, 400);
});
