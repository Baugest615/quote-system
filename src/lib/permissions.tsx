'use client'

import { useEffect, useState, createContext, useContext, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import {
  UserRole,
  PageConfig,
  PAGE_PERMISSIONS
} from '@/types/custom.types'

// ===== 權限檢查工具函數（靜態版，用於 server-side 或非 hook 場景） =====

/**
 * 檢查用戶是否有存取特定頁面的權限（靜態常量版，建議改用 usePermission hook）
 */
export function checkPageAccess(pageKey: string, userRole?: UserRole): boolean {
  const pageConfig = PAGE_PERMISSIONS[pageKey]
  if (!pageConfig || !userRole) return false

  return pageConfig.allowedRoles.includes(userRole)
}

/**
 * 檢查用戶是否有執行特定功能的權限（靜態常量版）
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
 * 取得用戶可存取的所有頁面（靜態常量版）
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

// ===== Permission Context (全局快取) =====

interface PermissionContextType {
  userRole: UserRole | null
  userId: string | null
  loading: boolean
  error: string | null
  pagePermissions: Record<string, PageConfig>
}

const PermissionContext = createContext<PermissionContextType>({
  userRole: null,
  userId: null,
  loading: true,
  error: null,
  pagePermissions: PAGE_PERMISSIONS,
})

/**
 * PermissionProvider - 在 layout 層級包裹
 * 查詢用戶角色 + 從 DB 讀取頁面權限配置
 */
export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<{
    userRole: UserRole | null
    userId: string | null
    loading: boolean
    error: string | null
  }>({
    userRole: null,
    userId: null,
    loading: true,
    error: null,
  })

  // 1. 查詢用戶角色
  useEffect(() => {
    async function fetchUserRole() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError

        if (!user) {
          setAuthState({ userRole: null, userId: null, loading: false, error: null })
          return
        }

        const { data: profile, error: profileError } = await supabase
          .rpc('get_my_profile')
          .single()

        if (profileError) throw profileError

        setAuthState({
          userRole: (profile as { role: UserRole; user_id: string } | null)?.role || null,
          userId: user.id,
          loading: false,
          error: null,
        })
      } catch (err) {
        console.error('Error fetching user role:', err)
        setAuthState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : '取得用戶權限失敗',
        }))
      }
    }

    fetchUserRole()
  }, [])

  // 2. 從 DB 查詢頁面權限配置
  const { data: dbPagePermissions } = useQuery({
    queryKey: queryKeys.pagePermissions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_permissions')
        .select('*')
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  // 3. 合併 DB 與靜態常量（DB 覆蓋 allowedRoles/allowedFunctions，靜態常量提供 route/icon）
  const pagePermissions = useMemo(() => {
    const merged = { ...PAGE_PERMISSIONS }
    if (dbPagePermissions) {
      for (const row of dbPagePermissions) {
        merged[row.page_key] = {
          key: row.page_key,
          name: row.page_name,
          allowedRoles: row.allowed_roles as UserRole[],
          allowedFunctions: row.allowed_functions || [],
          route: PAGE_PERMISSIONS[row.page_key]?.route || `/dashboard/${row.page_key.replace(/_/g, '-')}`,
          icon: PAGE_PERMISSIONS[row.page_key]?.icon,
        }
      }
    }
    return merged
  }, [dbPagePermissions])

  // 4. 組合 Context 值
  const contextValue = useMemo<PermissionContextType>(() => ({
    ...authState,
    pagePermissions,
  }), [authState, pagePermissions])

  return (
    <PermissionContext.Provider value={contextValue}>
      {children}
    </PermissionContext.Provider>
  )
}

// ===== React Hook =====

/**
 * usePermission Hook - 從 Context 讀取快取的權限（DB 驅動）
 */
export function usePermission() {
  const { userRole, userId, loading, error, pagePermissions } = useContext(PermissionContext)

  const checkPageAccessFn = useCallback(
    (pageKey: string) => {
      const config = pagePermissions[pageKey]
      if (!config || !userRole) return false
      return config.allowedRoles.includes(userRole)
    },
    [userRole, pagePermissions]
  )

  const checkFunctionAccessFn = useCallback(
    (pageKey: string, functionName: string) => {
      if (!checkPageAccessFn(pageKey)) return false
      const config = pagePermissions[pageKey]
      return config?.allowedFunctions?.includes(functionName) ?? false
    },
    [checkPageAccessFn, pagePermissions]
  )

  const getAllowedPagesFn = useCallback(
    () => userRole
      ? Object.values(pagePermissions).filter(p => p.allowedRoles.includes(userRole))
      : [],
    [userRole, pagePermissions]
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
    pagePermissions,
    checkPageAccess: checkPageAccessFn,
    checkFunctionAccess: checkFunctionAccessFn,
    getAllowedPages: getAllowedPagesFn,
    hasRole: hasRoleFn,
    getRoleDisplayName: getRoleDisplayNameFn,
  }), [userRole, userId, loading, error, pagePermissions, checkPageAccessFn, checkFunctionAccessFn, getAllowedPagesFn, hasRoleFn, getRoleDisplayNameFn])
}

/**
 * usePagePermission Hook - 檢查特定頁面權限
 */
export function usePagePermission(pageKey: string) {
  const { userRole, loading, checkPageAccess, checkFunctionAccess, pagePermissions } = usePermission()

  const hasAccess = checkPageAccess(pageKey)
  const pageConfig = pagePermissions[pageKey]

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
