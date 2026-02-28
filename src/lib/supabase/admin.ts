import { createClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'

/**
 * Supabase Admin Client — 使用 service_role key，繞過 RLS
 * 僅限 server-side API Route 使用，絕不暴露到前端
 */
export function createAdminClient() {
  if (!serverEnv.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
