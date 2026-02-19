'use client'

import SettingsCard from '@/components/settings/SettingsCard'
import { usePermission } from '@/lib/permissions' // 步驟 1: 引入權限 Hook
import Link from 'next/link' // 步驟 2: 引入 Link 元件
import { Button } from '@/components/ui/button' // 步驟 2: 引入 Button 元件
import { Shield } from 'lucide-react' // 步驟 2: 引入圖示
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import {
  useServiceTypes,
  useQuoteCategories,
  useKolTypes,
  useCreateReferenceItem,
  useUpdateReferenceItem,
  useDeleteReferenceItem,
} from '@/hooks/useReferenceData'

export default function SettingsPage() {
  const { hasRole } = usePermission() // 步驟 3: 取得權限檢查函數

  // React Query: 取得參考資料
  const { data: serviceTypes = [], isLoading: isLoadingServiceTypes } = useServiceTypes()
  const { data: quoteCategories = [], isLoading: isLoadingQuoteCategories } = useQuoteCategories()
  const { data: kolTypes = [], isLoading: isLoadingKolTypes } = useKolTypes()

  const loading = isLoadingServiceTypes || isLoadingQuoteCategories || isLoadingKolTypes

  // CRUD mutations
  const createServiceType = useCreateReferenceItem('service_types')
  const updateServiceType = useUpdateReferenceItem('service_types')
  const deleteServiceType = useDeleteReferenceItem('service_types')

  const createQuoteCategory = useCreateReferenceItem('quote_categories')
  const updateQuoteCategory = useUpdateReferenceItem('quote_categories')
  const deleteQuoteCategory = useDeleteReferenceItem('quote_categories')

  const createKolType = useCreateReferenceItem('kol_types')
  const updateKolType = useUpdateReferenceItem('kol_types')
  const deleteKolType = useDeleteReferenceItem('kol_types')

  // Wrapper functions matching SettingsCard callback signatures
  const handleAddServiceType = async (name: string) => {
    await createServiceType.mutateAsync({ name })
  }
  const handleUpdateServiceType = async (id: string, name: string) => {
    await updateServiceType.mutateAsync({ id, name })
  }
  const handleDeleteServiceType = async (id: string) => {
    if (window.confirm('確定要刪除這個項目嗎？')) {
      await deleteServiceType.mutateAsync(id)
    }
  }

  const handleAddQuoteCategory = async (name: string) => {
    await createQuoteCategory.mutateAsync({ name })
  }
  const handleUpdateQuoteCategory = async (id: string, name: string) => {
    await updateQuoteCategory.mutateAsync({ id, name })
  }
  const handleDeleteQuoteCategory = async (id: string) => {
    if (window.confirm('確定要刪除這個項目嗎？')) {
      await deleteQuoteCategory.mutateAsync(id)
    }
  }

  const handleAddKolType = async (name: string) => {
    await createKolType.mutateAsync({ name })
  }
  const handleUpdateKolType = async (id: string, name: string) => {
    await updateKolType.mutateAsync({ id, name })
  }
  const handleDeleteKolType = async (id: string) => {
    if (window.confirm('確定要刪除這個項目嗎？')) {
      await deleteKolType.mutateAsync(id)
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
       <h1 className="text-2xl font-bold">系統設定</h1>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* 步驟 4: 新增權限管理區塊，並使用 hasRole 判斷式 */}
        {hasRole('Admin') && (
          <div className="bg-card rounded-lg shadow-none border border-border p-6 border-l-4 border-red-500">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold mb-2 flex items-center">
                  <Shield className="mr-2 h-5 w-5 text-destructive" />
                  權限管理
                </h2>
                <p className="text-sm text-muted-foreground">
                  管理使用者帳號的角色與系統存取權限。
                </p>
              </div>
              <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded-full">
                Admin Only
              </span>
            </div>
            <div className="mt-4 text-right">
              <Link href="/dashboard/settings/permissions">
                <Button variant="destructive">
                  前往設定
                </Button>
              </Link>
            </div>
          </div>
        )}

        <SettingsCard
          title="KOL 服務類型"
          items={serviceTypes}
          onAddItem={handleAddServiceType}
          onUpdateItem={handleUpdateServiceType}
          onDeleteItem={handleDeleteServiceType}
        />
        <SettingsCard
          title="報價單項目類別"
          items={quoteCategories}
          onAddItem={handleAddQuoteCategory}
          onUpdateItem={handleUpdateQuoteCategory}
          onDeleteItem={handleDeleteQuoteCategory}
        />
        <SettingsCard
          title="KOL 類型"
          items={kolTypes}
          onAddItem={handleAddKolType}
          onUpdateItem={handleUpdateKolType}
          onDeleteItem={handleDeleteKolType}
        />
       </div>
    </div>
  )
}
