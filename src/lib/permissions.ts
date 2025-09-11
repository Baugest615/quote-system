'use client'

import { useEffect, useState } from 'react'
import supabase from '@/lib/supabase/client'
import { 
  UserRole, 
  PageConfig, 
  PermissionCheckResult,
  PAGE_PERMISSIONS,
  USER_ROLES 
} from '@/types/custom.types'  // 🔄 修改：從 custom.types 引入

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
  
  // 使用大寫版本匹配您的資料庫
  const roleHierarchy = {
    'Member': 1,
    'Editor': 2,
    'Admin': 3,
  }
  
  return (roleHierarchy[userRole] || 0) >= (roleHierarchy[requiredRole] || 0)
}

/**
 * 取得角色的中文顯示名稱
 */
export function getRoleDisplayName(role: UserRole): string {
  const roleNames = {
    'Admin': '管理員',
    'Editor': '編輯者',
    'Member': '成員',
  }
  
  return roleNames[role] || '未知角色'
}

// ===== React Hook =====

/**
 * usePermission Hook - 提供權限檢查功能
 */
export function usePermission() {
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUserRole() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError) {
          throw authError
        }
        
        if (!user) {
          setUserRole(null)
          setLoading(false)
          return
        }

        // 從資料庫取得用戶角色
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profileError) {
          throw profileError
        }

        setUserRole(profile?.role || null)
      } catch (err) {
        console.error('Error fetching user role:', err)
        setError(err instanceof Error ? err.message : '取得用戶權限失敗')
      } finally {
        setLoading(false)
      }
    }

    fetchUserRole()
  }, [])

  return {
    userRole,
    loading,
    error,
    // 權限檢查方法
    checkPageAccess: (pageKey: string) => checkPageAccess(pageKey, userRole || undefined),
    checkFunctionAccess: (pageKey: string, functionName: string) => 
      checkFunctionAccess(pageKey, functionName, userRole || undefined),
    getAllowedPages: () => userRole ? getAllowedPages(userRole) : [],
    hasRole: (requiredRole: UserRole) => hasRole(requiredRole, userRole || undefined),
    getRoleDisplayName: () => userRole ? getRoleDisplayName(userRole) : '未登入',
  }
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