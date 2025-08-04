import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"

// 若你有自己定義的 Supabase Database 型別，可取消以下註解
// import type { Database } from "@/types/supabase"

export const createServerClient = () => {
  const cookieStore = cookies()

  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  })

  return supabase
}
