// @section: supabase-client
import { createClient } from "@supabase/supabase-js";

// publishable 키는 브라우저 노출용 공개 키이므로 클라이언트에 포함되어도 안전합니다.
// 값은 .env (VITE_*) 에서 주입하며, 누락 시 프로젝트 기본값으로 폴백합니다.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://vndbzanhoumhhuneufni.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_dMes33hg0Q7CuyNe2oIQBA_rGvkYCt8";

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // 로그인 세션을 브라우저에 유지(점검 입력 등 쓰기 작업은 인증 필요).
  auth: { persistSession: true, autoRefreshToken: true },
});
