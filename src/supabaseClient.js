import { createClient } from '@supabase/supabase-js'

/**
 * Supabase 브라우저 클라이언트.
 * .env 에 다음을 설정하세요 (코드에 키를 넣지 마세요):
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client = null

try {
  if (supabaseUrl && supabaseAnonKey) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
} catch (err) {
  console.error('[supabaseClient] 초기화 실패:', err)
}

/** null 이면 환경변수 미설정 또는 초기화 실패 */
export const supabase = client

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey && client)
}
