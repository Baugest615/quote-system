import { createServerClient } from '@/lib/supabase/server'
import {
  PermissionCheckResult,
  PAGE_PERMISSIONS,
  UserRole
} from '@/types/custom.types'

/**
 * 伺服器端權限檢查
 */
export async function checkServerPermission(
  pageKey: string,
  functionName?: string
): Promise<PermissionCheckResult> {
  try {
    const supabase = await createServerClient()

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

    // 使用 SECURITY DEFINER RPC 取得角色，避免直查 profiles 觸發 RLS 遞迴
    const { data: profile } = await supabase
      .rpc('get_my_profile')
      .single()

    const userRole = (profile as { role: UserRole; user_id: string } | null)?.role || null
    const pageConfig = PAGE_PERMISSIONS[pageKey]

    return {
      hasAccess: hasAccess || false,
      allowedFunctions: hasAccess ? pageConfig?.allowedFunctions || [] : [],
      userRole,
    }
  } catch (error) {
    console.error('Server permission check failed:', error)
    return {
      hasAccess: false,
      allowedFunctions: [],
      userRole: null,
    }
  }
}

/**
 * 快速權限檢查（僅檢查頁面存取權）
 */
export async function quickPermissionCheck(pageKey: string): Promise<boolean> {
  const result = await checkServerPermission(pageKey)
  return result.hasAccess
}

/**
 * 取得當前用戶角色
 */
export async function getCurrentUserRole(): Promise<UserRole | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile } = await supabase
      .rpc('get_my_profile')
      .single()

    return (profile as { role: UserRole; user_id: string } | null)?.role || null
  } catch (error) {
    console.error('Error getting current user role:', error)
    return null
  }
}
