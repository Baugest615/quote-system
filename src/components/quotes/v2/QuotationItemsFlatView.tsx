'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { BatchInvoicePopover } from './BatchInvoicePopover'
import { AttachmentUploader } from './AttachmentUploader'
import {
  useQuotationItemsFlat,
  useUpdateQuotationItem,
  useBatchUpdateInvoice,
  useRequestPayment,
  useApprovePayment,
  useRejectPayment,
  type FlatQuotationItem,
} from '@/hooks/useQuotationItemsFlat'
import { autoCreateKolIfNeeded, autoCreateServiceIfNeeded } from '@/lib/kol/auto-create-kol'
import { usePermission } from '@/lib/permissions'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Search, X, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaymentAttachment } from '@/lib/payments/types'
import { isVerificationPassed } from './shared/payment-status'
import { isDataLocked } from './shared/quotation-item-utils'
import { useReferenceData } from './shared/useReferenceData'
import { type FlatSortKey, STICKY_LEFT, STICKY_COLS, type ColumnKey } from './flat-view/flat-view-constants'
import { useFlatViewState } from './flat-view/useFlatViewState'
import { ColumnVisibilityPopover } from './flat-view/ColumnVisibilityPopover'
import { FlatViewRow } from './flat-view/FlatViewRow'

// ─── Sticky header helpers ──────────────────────────────────
const stickyThClass = (col: ColumnKey) => {
  if (!STICKY_COLS.has(col)) return ''
  return 'sticky z-30 bg-secondary/50'
}
const stickyThStyle = (col: ColumnKey): React.CSSProperties | undefined => {
  if (!STICKY_COLS.has(col)) return undefined
  return { left: STICKY_LEFT[col as keyof typeof STICKY_LEFT] }
}

// ─── Props ──────────────────────────────────────────────────
interface QuotationItemsFlatViewProps {
  onClose: () => void
}

// ═══════════════════════════════════════════════════════════════
// Main Component (Assembly Layer)
// ═══════════════════════════════════════════════════════════════
export function QuotationItemsFlatView({ onClose }: QuotationItemsFlatViewProps) {
  const { hasRole, userId } = usePermission()
  const isEditor = hasRole('Editor')
  const confirm = useConfirm()

  // 資料
  const { data: items = [], isLoading } = useQuotationItemsFlat()
  const updateItem = useUpdateQuotationItem()
  const batchUpdateInvoice = useBatchUpdateInvoice()
  const requestPayment = useRequestPayment()
  const approvePayment = useApprovePayment()
  const rejectPayment = useRejectPayment()
  const { getSmartDefaults } = useExpenseDefaults()

  // 參考資料
  const { kols, categoryOptions, kolOptions, getServiceOptionsForKol } = useReferenceData()

  // 狀態管理
  const state = useFlatViewState(items)

  // 附件 Modal
  const [attachmentItem, setAttachmentItem] = useState<FlatQuotationItem | null>(null)

  // 駁回 Modal
  const [rejectingItemId, setRejectingItemId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // 操作中 loading
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set())
  const setActionLoading = (id: string, loading: boolean) => {
    setActionLoadingIds(prev => {
      const next = new Set(prev)
      loading ? next.add(id) : next.delete(id)
      return next
    })
  }

  // ─── 選取邏輯 ────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    state.setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pageItemIds = state.paginatedItems.filter(i => !isDataLocked(i)).map(i => i.id)
    const allSelected = pageItemIds.every(id => state.selectedIds.has(id))
    if (allSelected) {
      state.setSelectedIds(prev => { const next = new Set(prev); pageItemIds.forEach(id => next.delete(id)); return next })
    } else {
      state.setSelectedIds(prev => { const next = new Set(prev); pageItemIds.forEach(id => next.add(id)); return next })
    }
  }

  const pageItemIds = state.paginatedItems.filter(i => !isDataLocked(i)).map(i => i.id)
  const allPageSelected = pageItemIds.length > 0 && pageItemIds.every(id => state.selectedIds.has(id))

  // ─── Handlers ────────────────────────────────────────────
  const handleUpdateField = useCallback((itemId: string, field: string, value: unknown) => {
    updateItem.mutate({ id: itemId, updates: { [field]: value } })
  }, [updateItem])

  const handleKolChange = useCallback(async (item: FlatQuotationItem, kolNameOrId: string) => {
    try {
      const resolvedId = await autoCreateKolIfNeeded(kolNameOrId, kols)
      updateItem.mutate({ id: item.id, updates: { kol_id: resolvedId } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新 KOL 失敗')
    }
  }, [kols, updateItem])

  const handleServiceChange = useCallback(async (item: FlatQuotationItem, serviceName: string) => {
    updateItem.mutate({ id: item.id, updates: { service: serviceName } })
    if (item.kol_id) {
      await autoCreateServiceIfNeeded(item.kol_id, serviceName, kols, Number(item.price) || 0, Number(item.cost) || 0)
    }
  }, [kols, updateItem])

  const handleBatchInvoice = useCallback((invoiceNumber: string) => {
    const ids = Array.from(state.selectedIds)
    batchUpdateInvoice.mutate({ ids, invoice_number: invoiceNumber })
    state.setSelectedIds(new Set())
  }, [state.selectedIds, batchUpdateInvoice, state.setSelectedIds])

  const handleAttachmentUpdate = useCallback((attachments: PaymentAttachment[]) => {
    if (!attachmentItem) return
    updateItem.mutate({ id: attachmentItem.id, updates: { attachments: JSON.parse(JSON.stringify(attachments)) } })
    setAttachmentItem(null)
  }, [attachmentItem, updateItem])

  const handleRequestPayment = useCallback(async (item: FlatQuotationItem) => {
    if (!isVerificationPassed(item)) {
      toast.error('請先完成文件檢核（上傳附件或輸入有效發票號碼）')
      return
    }
    if (!userId) return
    const costAmount = item.cost_amount ?? item.cost ?? 0
    const defaults = (!item.expense_type || item.expense_type === '勞務報酬') ? getSmartDefaults(item.kols) : undefined
    setActionLoading(item.id, true)
    requestPayment.mutate(
      { itemId: item.id, userId, costAmount: Number(costAmount), expenseType: defaults?.expenseType, accountingSubject: defaults?.accountingSubject },
      { onSettled: () => setActionLoading(item.id, false) }
    )
  }, [userId, requestPayment, getSmartDefaults])

  const handleApprovePayment = useCallback(async (item: FlatQuotationItem) => {
    if (!isEditor) { toast.error('僅 Editor 以上角色可審核'); return }
    const ok = await confirm({ title: '審核請款', description: `確定要核准「${item.service || '未命名服務'}」的請款嗎？核准後將自動建立進項記錄和確認記錄。` })
    if (!ok) return
    setActionLoading(item.id, true)
    approvePayment.mutate({ itemId: item.id }, { onSettled: () => setActionLoading(item.id, false) })
  }, [isEditor, confirm, approvePayment])

  const handleRejectPayment = useCallback(async () => {
    if (!rejectingItemId) return
    setActionLoading(rejectingItemId, true)
    rejectPayment.mutate(
      { itemId: rejectingItemId, reason: rejectionReason.trim() },
      { onSettled: () => { setActionLoading(rejectingItemId, false); setRejectingItemId(null); setRejectionReason('') } }
    )
  }, [rejectingItemId, rejectionReason, rejectPayment])

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col bg-card border rounded-lg shadow">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-secondary/30">
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜尋編號、專案、客戶、KOL、服務、發票..." value={state.searchTerm} onChange={(e) => state.setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <span className="text-sm text-muted-foreground">共 {state.totalCount} 筆項目</span>
        </div>
        <div className="flex items-center gap-2">
          {state.selectedIds.size > 0 && (
            <BatchInvoicePopover selectedCount={state.selectedIds.size} onApply={handleBatchInvoice} onCancel={() => state.setSelectedIds(new Set())} />
          )}
          <ColumnVisibilityPopover visible={state.visibleColumns} onToggle={state.toggleColumn} />
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1"><X className="h-4 w-4" /> 關閉試算表</Button>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">載入中...</div>
        ) : (
          <table className="w-full min-w-[2200px]">
            <thead className="border-b">
              <tr className="text-xs text-muted-foreground">
                {state.isColVisible('checkbox') && (
                  <th className={cn('w-10 p-2 text-center sticky top-0 bg-secondary/50', stickyThClass('checkbox'))} style={stickyThStyle('checkbox')}>
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="rounded" />
                  </th>
                )}
                {state.isColVisible('quote_number') && (
                  <th className={cn('w-24 p-2 sticky top-0 bg-secondary/50', stickyThClass('quote_number'))} style={stickyThStyle('quote_number')}>
                    <SortableHeader<FlatSortKey> label="報價編號" sortKey="quote_number" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={state.getFilter('quote_number')} onChange={(v) => state.setFilterByKey('quote_number', v)} />} />
                  </th>
                )}
                {state.isColVisible('project_name') && (
                  <th className={cn('w-44 p-2 sticky top-0 bg-secondary/50', stickyThClass('project_name'))} style={stickyThStyle('project_name')}>
                    <SortableHeader<FlatSortKey> label="專案名稱" sortKey="project_name" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={state.getFilter('project_name')} onChange={(v) => state.setFilterByKey('project_name', v)} />} />
                  </th>
                )}
                {state.isColVisible('client_name') && (
                  <th className="w-32 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="客戶" sortKey="client_name" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={state.uniqueClients} value={state.getFilter('client_name')} onChange={(v) => state.setFilterByKey('client_name', v)} />} />
                  </th>
                )}
                {state.isColVisible('quotation_status') && (
                  <th className="w-20 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="狀態" sortKey="quotation_status" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={state.uniqueStatuses} value={state.getFilter('quotation_status')} onChange={(v) => state.setFilterByKey('quotation_status', v)} />} />
                  </th>
                )}
                {state.isColVisible('category') && (
                  <th className="w-24 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="類別" sortKey="category" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={state.uniqueCategories} value={state.getFilter('category')} onChange={(v) => state.setFilterByKey('category', v)} />} />
                  </th>
                )}
                {state.isColVisible('kol_name') && (
                  <th className="w-32 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="KOL/服務" sortKey="kol_name" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={state.uniqueKolNames} value={state.getFilter('kol_name')} onChange={(v) => state.setFilterByKey('kol_name', v)} />} />
                  </th>
                )}
                {state.isColVisible('service') && (
                  <th className="w-36 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="執行內容" sortKey="service" sortState={state.sortState} onToggleSort={state.toggleSort} />
                  </th>
                )}
                {state.isColVisible('quantity') && (
                  <th className="w-16 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="數量" sortKey="quantity" sortState={state.sortState} onToggleSort={state.toggleSort} className="justify-end" />
                  </th>
                )}
                {state.isColVisible('price') && (
                  <th className="w-24 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="單價" sortKey="price" sortState={state.sortState} onToggleSort={state.toggleSort} className="justify-end"
                      filterContent={<ColumnFilterPopover filterType="number" value={state.getFilter('price')} onChange={(v) => state.setFilterByKey('price', v)} />} />
                  </th>
                )}
                {state.isColVisible('cost') && (
                  <th className="w-24 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="成本" sortKey="cost" sortState={state.sortState} onToggleSort={state.toggleSort} className="justify-end" />
                  </th>
                )}
                {state.isColVisible('subtotal') && (
                  <th className="w-24 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="小計" sortKey="subtotal" sortState={state.sortState} onToggleSort={state.toggleSort} className="justify-end" />
                  </th>
                )}
                {state.isColVisible('invoice_number') && (
                  <th className="w-28 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="發票號碼" sortKey="invoice_number" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={state.getFilter('invoice_number')} onChange={(v) => state.setFilterByKey('invoice_number', v)} />} />
                  </th>
                )}
                {state.isColVisible('attachments') && <th className="w-16 p-2 text-center sticky top-0 z-20 bg-secondary/50">附件</th>}
                {state.isColVisible('payment_status') && (
                  <th className="w-20 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="狀態" sortKey="payment_status" sortState={state.sortState} onToggleSort={state.toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={['待請款', '待審核', '已請款', '被駁回']} value={state.getFilter('payment_status')} onChange={(v) => state.setFilterByKey('payment_status', v)} />} />
                  </th>
                )}
                {state.isColVisible('verification') && <th className="w-12 p-2 text-center sticky top-0 z-20 bg-secondary/50">檢核</th>}
                {state.isColVisible('payment_request') && <th className="w-16 p-2 text-center sticky top-0 z-20 bg-secondary/50">請款</th>}
                {state.isColVisible('approval') && isEditor && <th className="w-20 p-2 text-center sticky top-0 z-20 bg-secondary/50">審核</th>}
              </tr>
            </thead>
            <tbody>
              {state.paginatedItems.map((item) => (
                <FlatViewRow
                  key={item.id}
                  item={item}
                  selected={state.selectedIds.has(item.id)}
                  isActionLoading={actionLoadingIds.has(item.id)}
                  isEditor={isEditor}
                  isColVisible={state.isColVisible}
                  onToggleSelect={toggleSelect}
                  onUpdateField={handleUpdateField}
                  onKolChange={handleKolChange}
                  onServiceChange={handleServiceChange}
                  onOpenAttachment={setAttachmentItem}
                  onRequestPayment={handleRequestPayment}
                  onApprovePayment={handleApprovePayment}
                  onOpenReject={setRejectingItemId}
                  categoryOptions={categoryOptions}
                  kolOptions={kolOptions}
                  getServiceOptionsForKol={getServiceOptionsForKol}
                />
              ))}
              {state.paginatedItems.length === 0 && (
                <tr>
                  <td colSpan={state.visibleColCount} className="p-8">
                    <EmptyState type="no-data" icon={FileText} title="沒有項目"
                      description={state.searchTerm || state.filterActiveCount > 0 ? '沒有符合條件的項目' : '報價單中尚無項目'} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 分頁 */}
      {state.totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t bg-secondary/20">
          <div className="text-xs text-muted-foreground">
            顯示 {((state.currentPage - 1) * state.pageSize) + 1} 至 {Math.min(state.currentPage * state.pageSize, state.totalCount)} 筆，共 {state.totalCount} 筆
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => state.setCurrentPage(p => Math.max(p - 1, 1))} disabled={state.currentPage === 1} className="h-7 text-xs">
              <ChevronLeft className="h-3 w-3" /> 上一頁
            </Button>
            <span className="text-xs text-muted-foreground">第 {state.currentPage} 頁 / 共 {state.totalPages} 頁</span>
            <Button variant="outline" size="sm" onClick={() => state.setCurrentPage(p => Math.min(p + 1, state.totalPages))} disabled={state.currentPage === state.totalPages} className="h-7 text-xs">
              下一頁 <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* 附件 Modal */}
      {attachmentItem && (
        <Modal isOpen={!!attachmentItem} onClose={() => setAttachmentItem(null)}
          title={`附件管理 — ${attachmentItem.kols?.name || '項目'} / ${attachmentItem.service || ''}`}>
          <div className="p-4">
            <AttachmentUploader itemId={attachmentItem.id}
              currentAttachments={(attachmentItem.attachments || []) as unknown as PaymentAttachment[]}
              onUpdate={handleAttachmentUpdate} readOnly={!!attachmentItem.approved_at} />
          </div>
        </Modal>
      )}

      {/* 駁回原因 Modal */}
      <Modal isOpen={!!rejectingItemId} onClose={() => { setRejectingItemId(null); setRejectionReason('') }} title="駁回請款">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">請輸入駁回原因，申請人可依據原因修改後重新送出請款。</p>
          <Textarea placeholder="駁回原因..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setRejectingItemId(null); setRejectionReason('') }}>取消</Button>
            <Button variant="destructive" onClick={handleRejectPayment}>確認駁回</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
