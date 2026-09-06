// @section: supabase-client
import { createClient, type PostgrestError } from "@supabase/supabase-js";

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

/** PostgREST 는 한 요청에 `max_rows`(supabase/config.toml · 1,000행) 까지만 돌려주고
 *  나머지는 **오류 없이 잘라 낸다**. 점검·측정점처럼 회차마다 늘어나는 조회는 반드시 이 헬퍼로
 *  페이지를 끝까지 넘겨 받는다. 정렬 키가 유일하지 않으면 페이지 경계에서 행이 겹치거나
 *  빠질 수 있으니 호출부는 마지막 order 를 유일 키(또는 그에 준하는 조합)로 끝낼 것. */
export const PAGE_SIZE = 1000;

type PagedQuery<T> = {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

export async function fetchAll<T>(build: () => PagedQuery<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
