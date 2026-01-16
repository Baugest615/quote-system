import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少 Supabase 環境變數')
}

// 使用 createBrowserClient 確保在 Next.js App Router 中正確處理 cookie
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export default supabase