import { createClient } from '@supabase/supabase-js'

/**
 * Supabase Admin Client — 使用 service_role key，繞過 RLS
 * 僅限 server-side API Route 使用，絕不暴露到前端
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
