// @section: auth-errors
// Supabase/PostgREST 오류를 사용자 언어 메시지로 변환.
// RLS 거부(42501)·미인증(401/403)은 raw SQL 문구 대신 안내 문구로 바꾸고,
// 그 외 오류는 원문을 유지해 디버깅 정보를 잃지 않는다.
import type { Lang } from "@/i18n";

const MSG = {
  denied: {
    ko: "권한이 없습니다. 관리자에게 문의하세요.",
    id: "Anda tidak memiliki izin. Hubungi administrator.",
  },
  auth: {
    ko: "로그인이 필요합니다.",
    id: "Perlu masuk (login).",
  },
  generic: {
    ko: "오류가 발생했습니다.",
    id: "Terjadi kesalahan.",
  },
} as const;

/** PostgREST/GoTrue 오류 객체에서 code·status·message를 최대한 끌어낸다. */
function parts(e: unknown): { code: string; status: number; message: string } {
  const o = (e ?? {}) as Record<string, unknown>;
  return {
    code: typeof o.code === "string" ? o.code : "",
    status: typeof o.status === "number" ? o.status : 0,
    message: e instanceof Error ? e.message : typeof o.message === "string" ? o.message : "",
  };
}

/** RLS 정책 위반(권한 부족)인가 — 코드 우선, 문구는 보조 판정. */
function isDenied(code: string, status: number, msg: string): boolean {
  if (code === "42501") return true;                 // insufficient_privilege
  if (status === 403) return true;
  return /row-level security|violates row-level|permission denied/i.test(msg);
}

/** 세션 없음·만료 등 인증 자체가 없는 경우. */
function isUnauthenticated(code: string, status: number, msg: string): boolean {
  if (status === 401) return true;
  if (code === "PGRST301") return true;              // JWT expired
  return /jwt|not authenticated|no api key|invalid token|session/i.test(msg);
}

/**
 * 오류를 사용자 언어 메시지로 변환.
 * 권한거부·미인증만 치환하고 나머지는 원문(e.message)을 그대로 돌려준다.
 */
export function friendlyAuthError(e: unknown, lang: Lang): string {
  const { code, status, message } = parts(e);
  // 권한거부를 먼저 본다 — 403은 인증은 됐으나 역할이 부족한 경우다.
  if (isDenied(code, status, message)) return MSG.denied[lang];
  if (isUnauthenticated(code, status, message)) return MSG.auth[lang];
  return message || MSG.generic[lang];
}
