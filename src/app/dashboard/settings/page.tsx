'use client'

import { usePermission } from '@/lib/permissions'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Shield } from 'lucide-react'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import PasswordChangeCard from '@/components/settings/PasswordChangeCard'
import ReferenceDictCard from '@/components/settings/ReferenceDictCard'

export default function SettingsPage() {
  const { hasRole, loading } = usePermission()

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={4} />
    </div>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">系統設定</h1>

      {/* 帳號安全 — 所有角色 */}
      <PasswordChangeCard />

      {/* 資料字典管理 — Editor 以上 */}
      {hasRole('Editor') && <ReferenceDictCard />}

      {/* 權限管理 — Admin 限定 */}
      {hasRole('Admin') && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-destructive" />
                <h2 className="text-lg font-semibold">權限管理</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                管理使用者帳號的角色與系統存取權限。
              </p>
            </div>
            <span className="text-[10px] font-medium text-rose-400 bg-rose-400/15 px-1.5 py-0.5 rounded">
              A
            </span>
          </div>
          <div className="mt-4">
            <Link href="/dashboard/settings/permissions">
              <Button variant="outline" size="sm">
                前往設定
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
