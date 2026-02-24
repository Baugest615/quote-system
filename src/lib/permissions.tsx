'use client'

import { useEffect, useState, createContext, useContext, useCallback, useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import {
  UserRole,
  PageConfig,
  PAGE_PERMISSIONS
} from '@/types/custom.types'

// ===== 權限檢查工具函數 =====

/**
 * 檢查用戶是否有存取特定頁面的權限
 */
export function checkPageAccess(pageKey: string, userRole?: UserRole): boolean {
  const pageConfig = PAGE_PERMISSIONS[pageKey]
  if (!pageConfig || !userRole) return false

  return pageConfig.allowedRoles.includes(userRole)
}

/**
 * 檢查用戶是否有執行特定功能的權限
 */
export function checkFunctionAccess(
  pageKey: string,
  functionName: string,
  userRole?: UserRole
): boolean {
  if (!checkPageAccess(pageKey, userRole)) return false

  const pageConfig = PAGE_PERMISSIONS[pageKey]
  return pageConfig.allowedFunctions.includes(functionName)
}

/**
 * 取得用戶可存取的所有頁面
 */
export function getAllowedPages(userRole: UserRole): PageConfig[] {
  return Object.values(PAGE_PERMISSIONS).filter(page =>
    page.allowedRoles.includes(userRole)
  )
}

/**
 * 檢查用戶是否擁有特定角色或更高權限
 */
export function hasRole(requiredRole: UserRole, userRole?: UserRole): boolean {
  if (!userRole) return false

  // 角色階層 — 小寫 'admin'/'member' 和 'Reader' 是 DB enum 歷史遺留值，
  // 已透過 get_my_role() 正規化為大寫，實際不會出現，但 Record<UserRole> 要求完整列出
  const roleHierarchy: Record<UserRole, number> = {
    'Reader': 0,
    'member': 1,
    'Member': 1,
    'Editor': 2,
    'admin': 3,
    'Admin': 3,
  }

  return (roleHierarchy[userRole] || 0) >= (roleHierarchy[requiredRole] || 0)
}

/**
 * 取得角色的中文顯示名稱
 */
export function getRoleDisplayName(role: UserRole): string {
  // 小寫值為 DB enum 歷史遺留，實際已全部正規化為大寫
  const roleNames: Record<UserRole, string> = {
    'admin': '管理員',
    'Admin': '管理員',
    'Editor': '編輯者',
    'member': '成員',
    'Member': '成員',
    'Reader': '唯讀',
  }

  return roleNames[role] || '未知角色'
}

// ===== Permission Context (全局快取，只查一次 DB) =====

interface PermissionContextType {
  userRole: UserRole | null
  userId: string | null
  loading: boolean
  error: string | null
}

const PermissionContext = createContext<PermissionContextType>({
  userRole: null,
  userId: null,
  loading: true,
  error: null,
})

/**
 * PermissionProvider - 在 layout 層級包裹，整個 session 只查一次角色
 */
export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PermissionContextType>({
    userRole: null,
    userId: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    async function fetchUserRole() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError

        if (!user) {
          setState({ userRole: null, userId: null, loading: false, error: null })
          return
        }

        const { data: profile, error: profileError } = await supabase
          .rpc('get_my_profile')
          .single() as { data: { role: UserRole; user_id: string } | null; error: any }

        if (profileError) throw profileError

        setState({
          userRole: (profile as any)?.role || null,
          userId: user.id,
          loading: false,
          error: null,
        })
      } catch (err) {
        console.error('Error fetching user role:', err)
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : '取得用戶權限失敗',
        }))
      }
    }

    fetchUserRole()
  }, [])

  return (
    <PermissionContext.Provider value={state}>
      {children}
    </PermissionContext.Provider>
  )
}

// ===== React Hook =====

/**
 * usePermission Hook - 從 Context 讀取快取的權限（不再每次查 DB）
 */
export function usePermission() {
  const { userRole, userId, loading, error } = useContext(PermissionContext)

  const checkPageAccessFn = useCallback(
    (pageKey: string) => checkPageAccess(pageKey, userRole || undefined),
    [userRole]
  )
  const checkFunctionAccessFn = useCallback(
    (pageKey: string, functionName: string) => checkFunctionAccess(pageKey, functionName, userRole || undefined),
    [userRole]
  )
  const getAllowedPagesFn = useCallback(
    () => userRole ? getAllowedPages(userRole) : [],
    [userRole]
  )
  const hasRoleFn = useCallback(
    (requiredRole: UserRole) => hasRole(requiredRole, userRole || undefined),
    [userRole]
  )
  const getRoleDisplayNameFn = useCallback(
    () => userRole ? getRoleDisplayName(userRole) : '未登入',
    [userRole]
  )

  return useMemo(() => ({
    userRole,
    userId,
    loading,
    error,
    checkPageAccess: checkPageAccessFn,
    checkFunctionAccess: checkFunctionAccessFn,
    getAllowedPages: getAllowedPagesFn,
    hasRole: hasRoleFn,
    getRoleDisplayName: getRoleDisplayNameFn,
  }), [userRole, userId, loading, error, checkPageAccessFn, checkFunctionAccessFn, getAllowedPagesFn, hasRoleFn, getRoleDisplayNameFn])
}

/**
 * usePagePermission Hook - 檢查特定頁面權限
 */
export function usePagePermission(pageKey: string) {
  const { userRole, loading, checkPageAccess, checkFunctionAccess } = usePermission()

  const hasAccess = checkPageAccess(pageKey)
  const pageConfig = PAGE_PERMISSIONS[pageKey]

  return {
    hasAccess,
    loading,
    userRole,
    allowedFunctions: hasAccess ? pageConfig?.allowedFunctions || [] : [],
    checkFunction: (functionName: string) => checkFunctionAccess(pageKey, functionName),
    pageConfig,
  }
}

// ===== 導出所有工具 =====
export const PermissionUtils = {
  checkPageAccess,
  checkFunctionAccess,
  getAllowedPages,
  hasRole,
  getRoleDisplayName,
}