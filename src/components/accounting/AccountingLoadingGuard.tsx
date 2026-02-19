'use client'

import { Shield } from 'lucide-react'

interface Props {
  loading: boolean
  isAdmin: boolean
  children?: React.ReactNode
  skeletonRows?: number
}

/**
 * 帳務管理頁面的統一 Loading / 權限守衛
 * - 整合 permLoading + dataLoading 為單一狀態，避免雙重閃爍
 * - 使用全高 skeleton，防止背景透出
 */
export default function AccountingLoadingGuard({ loading, isAdmin, children, skeletonRows = 6 }: Props) {
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* 標題列 skeleton */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-muted rounded-lg" />
          <div>
            <div className="h-7 w-36 bg-muted rounded mb-1" />
            <div className="h-4 w-24 bg-muted/50 rounded" />
          </div>
        </div>
        {/* 統計卡片 skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
        {/* 表格 skeleton */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="h-10 bg-muted border-b border-border" />
          {[...Array(skeletonRows)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-border/50 last:border-0">
              <div className="h-4 bg-muted/50 rounded flex-1" />
              <div className="h-4 bg-muted/50 rounded w-24" />
              <div className="h-4 bg-muted/50 rounded w-20" />
              <div className="h-4 bg-muted/50 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Shield className="w-16 h-16 mb-4 text-muted-foreground/50" />
        <p className="text-lg font-medium">此頁面僅限管理員存取</p>
      </div>
    )
  }

  return <>{children}</>
}
