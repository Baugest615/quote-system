import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from '@/lib/env'

if (!clientEnv.supabaseUrl || !clientEnv.supabaseAnonKey) {
  throw new Error('缺少 Supabase 環境變數')
}

// 使用 createBrowserClient 確保在 Next.js App Router 中正確處理 cookie
export const supabase = createBrowserClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey)

export default supabase