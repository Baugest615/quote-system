// 集中管理所有環境變數存取，提供型別安全的存取介面

// === 客戶端環境變數（瀏覽器可存取） ===
export const clientEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
} as const

// === 伺服器端環境變數（僅限 server-side） ===
export const serverEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
} as const

// === 環境判斷 ===
export const isDev = process.env.NODE_ENV === 'development'
export const isProd = process.env.NODE_ENV === 'production'
