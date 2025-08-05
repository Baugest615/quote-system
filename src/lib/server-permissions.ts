import { createServerClient as createSupabaseServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { 
  PermissionCheckResult,
  PAGE_PERMISSIONS,
  UserRole 
} from '@/types/database.types'

/**
 * 創建服務器端 Supabase 客戶端
 */
async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * 伺服器端權限檢查
 */
export async function checkServerPermission(
  pageKey: string,
  functionName?: string
): Promise<PermissionCheckResult> {
  try {
    const supabase = await createServerSupabaseClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return {
        hasAccess: false,
        allowedFunctions: [],
        userRole: null,
      }
    }

    // 使用資料庫函數檢查權限
    const { data: hasAccess, error: permissionError } = await supabase.rpc(
      'check_page_permission',
      {
        user_id: user.id,
        page_key: pageKey,
        required_function: functionName || null,
      }
    )

    if (permissionError) {
      console.error('Permission check error:', permissionError)
      return {
        hasAccess: false,
        allowedFunctions: [],
        userRole: null,
      }
    }

    // 取得用戶角色
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role || null
    const pageConfig = PAGE_PERMISSIONS[pageKey]

    return {
      hasAccess: hasAccess || false,
      allowedFunctions: hasAccess ? (pageConfig?.allowedFunctions || []) : [],
      userRole,
    }
  } catch (error) {
    console.error('Server permission check error:', error)
    return {
      hasAccess: false,
      allowedFunctions: [],
      userRole: null,
    }
  }
}

/**
 * 取得服務器端用戶角色
 */
export async function getServerUserRole(): Promise<UserRole | null> {
  try {
    const supabase = await createServerSupabaseClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return null
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    return profile?.role || null
  } catch (error) {
    console.error('Error getting server user role:', error)
    return null
  }
}