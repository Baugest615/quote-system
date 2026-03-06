'use client'

import { useState } from 'react'
import { Shield, Wallet, ClipboardList, Clock, Loader2 } from 'lucide-react'
import { usePermission } from '@/lib/permissions'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useWorkbenchItems } from '@/hooks/payment-workbench'
import { PendingSection } from '@/components/payment-workbench/PendingSection'
import { ReviewSection } from '@/components/payment-workbench/ReviewSection'
import { WorkbenchFilters } from '@/components/payment-workbench/WorkbenchFilters'

type TabKey = 'pending' | 'review'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'pending', label: '待處理', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'review', label: '審核中', icon: <Clock className="h-4 w-4" /> },
]

export default function PaymentWorkbenchPage() {
  const { loading: permLoading, checkPageAccess, hasRole } = usePermission()
  const hasAccess = checkPageAccess('payment_workbench')
  const isReviewer = hasRole('Editor')

  const [activeTab, setActiveTab] = useState<TabKey>('pending')

  const {
    filteredItems,
    remitteeGroups,
    pendingItems,
    requestedItems,
    pendingTotal,
    requestedTotal,
    isLoading,
    filters,
    setFilters,
    projectOptions,
    clientOptions,
    monthOptions,
  } = useWorkbenchItems()

  if (permLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>載入中...</p>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Shield className="w-16 h-16 mb-4 text-muted-foreground/50" />
        <p className="text-lg font-medium">此頁面僅限授權角色存取</p>
      </div>
    )
  }

  return (
    <ErrorBoundary module="請款工作台">
      <div className="space-y-6">
        {/* 頁面標題 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="text-xl font-bold text-foreground">請款工作台</h1>
              <p className="text-sm text-muted-foreground">
                統一管理所有請款項目 — 合併、送出、審核
              </p>
            </div>
          </div>

          {/* 統計摘要 */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">待處理 {pendingItems.length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-muted-foreground">審核中 {requestedItems.length}</span>
            </div>
          </div>
        </div>

        {/* 篩選列 */}
        <WorkbenchFilters
          filters={filters}
          onFiltersChange={setFilters}
          projectOptions={projectOptions}
          clientOptions={clientOptions}
          monthOptions={monthOptions}
          filteredTotal={activeTab === 'pending' ? pendingTotal : requestedTotal}
          filteredCount={activeTab === 'pending' ? pendingItems.length : requestedItems.length}
        />

        {/* Tab 切換 */}
        <div className="border-b border-border">
          <div className="flex space-x-1">
            {TABS.map((tab) => {
              const count =
                tab.key === 'pending'
                  ? pendingItems.length
                  : requestedItems.length
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-info text-info'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.key
                        ? 'bg-info/20 text-info'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab 內容 */}
        {activeTab === 'pending' && (
          <PendingSection
            items={filteredItems.filter((i) => i.status === 'pending')}
            isReviewer={isReviewer}
          />
        )}
        {activeTab === 'review' && (
          <ReviewSection
            items={filteredItems.filter((i) => i.status === 'requested')}
            isReviewer={isReviewer}
          />
        )}
      </div>
    </ErrorBoundary>
  )
}
