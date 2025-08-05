'use client'

import { ReactNode } from 'react'
import { usePermission } from '@/lib/permissions'

interface PermissionGuardProps {
  pageKey: string
  functionName?: string
  fallback?: ReactNode
  children: ReactNode
}

/**
 * 權限保護組件 - 根據權限顯示/隱藏內容
 */
export function PermissionGuard({ 
  pageKey, 
  functionName, 
  fallback = null, 
  children 
}: PermissionGuardProps) {
  const { checkPageAccess, checkFunctionAccess, loading } = usePermission()
  
  if (loading) {
    return <div className="animate-pulse bg-gray-200 h-4 w-full rounded"></div>
  }
  
  const hasAccess = functionName 
    ? checkFunctionAccess(pageKey, functionName)
    : checkPageAccess(pageKey)
  
  return hasAccess ? <>{children}</> : <>{fallback}</>
}

export default PermissionGuard