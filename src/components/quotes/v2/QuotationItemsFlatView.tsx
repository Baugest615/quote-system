'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useTableSort } from '@/hooks/useTableSort'
import { useColumnFilters, type FilterValue } from '@/hooks/useColumnFilters'
import { EditableCell } from './EditableCell'
import { SearchableSelectCell } from './SearchableSelectCell'
import { AttachmentUploader } from './AttachmentUploader'
import { BatchInvoicePopover } from './BatchInvoicePopover'
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
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Search, X, FileText, Paperclip, CheckCircle2, AlertTriangle, Lock,
  ChevronLeft, ChevronRight, Columns3, XCircle, Loader2,
} from 'lucide-react'
import type { PaymentAttachment } from '@/lib/payments/types'

type Kol = Database['public']['Tables']['kols']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']
type KolWithServices = Kol & { kol_services: (KolService & { service_types: ServiceType | null })[] }

// ─── 欄位定義 ───────────────────────────────────────────────
// 對齊明細表欄位順序：..., 小計, 發票號碼, 附件, 狀態, 檢核, 請款, 審核
type ColumnKey =
  | 'checkbox' | 'quote_number' | 'project_name' | 'client_name'
  | 'quotation_status' | 'category' | 'kol_name' | 'service'
  | 'quantity' | 'price' | 'cost' | 'subtotal'
  | 'invoice_number' | 'attachments'
  | 'payment_status' | 'verification' | 'payment_request' | 'approval'

type FlatSortKey = Exclude<ColumnKey, 'checkbox' | 'attachments' | 'verification' | 'payment_request' | 'approval'>

const COLUMN_DEFS: { key: ColumnKey; label: string; hideable: boolean }[] = [
  { key: 'checkbox', label: '選取', hideable: false },
  { key: 'quote_number', label: '報價編號', hideable: false },
  { key: 'project_name', label: '專案名稱', hideable: false },
  { key: 'client_name', label: '客戶', hideable: true },
  { key: 'quotation_status', label: '報價狀態', hideable: true },
  { key: 'category', label: '類別', hideable: true },
  { key: 'kol_name', label: 'KOL/服務', hideable: true },
  { key: 'service', label: '執行內容', hideable: true },
  { key: 'quantity', label: '數量', hideable: true },
  { key: 'price', label: '單價', hideable: true },
  { key: 'cost', label: '成本', hideable: true },
  { key: 'subtotal', label: '小計', hideable: true },
  { key: 'invoice_number', label: '發票號碼', hideable: true },
  { key: 'attachments', label: '附件', hideable: true },
  { key: 'payment_status', label: '狀態', hideable: true },
  { key: 'verification', label: '檢核', hideable: true },
  { key: 'payment_request', label: '請款', hideable: true },
  { key: 'approval', label: '審核', hideable: true },
]

// ─── 請款狀態 ───────────────────────────────────────────────
type PaymentStatus = 'pending' | 'requested' | 'approved' | 'rejected'

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: '待請款', className: 'bg-muted text-muted-foreground' },
  requested: { label: '待審核', className: 'bg-warning/20 text-warning' },
  approved: { label: '已請款', className: 'bg-success/20 text-success' },
  rejected: { label: '被駁回', className: 'bg-destructive/20 text-destructive' },
}

const INVOICE_REGEX = /^[A-Za-z]{2}-\d{8}$/

function getPaymentStatus(item: FlatQuotationItem): PaymentStatus {
  if (item.approved_at) return 'approved'
  if (item.requested_at) return 'requested'
  if (item.rejected_at && item.rejection_reason) return 'rejected'
  return 'pending'
}

function isVerificationPassed(item: FlatQuotationItem): boolean {
  const attachments = (item.attachments || []) as unknown as PaymentAttachment[]
  const hasAttachments = attachments.length > 0
  const invoiceNumber = item.invoice_number || ''
  const hasValidInvoice = INVOICE_REGEX.test(invoiceNumber)
  return hasAttachments || hasValidInvoice
}

// 資料欄位鎖定（類別、KOL、執行內容、數量、單價、成本）
function isDataLocked(item: FlatQuotationItem): boolean {
  return !!item.approved_at || (item.quotations?.status === '已簽約' && !item.is_supplement)
}

// 付款流程鎖定（發票、附件、請款、審核）— 僅已核准才鎖
function isPaymentLocked(item: FlatQuotationItem): boolean {
  return !!item.approved_at
}

function getSortValue(item: FlatQuotationItem, key: FlatSortKey): string | number | null {
  switch (key) {
    case 'quote_number': return item.quotations?.quote_number ?? null
    case 'project_name': return item.quotations?.project_name ?? null
    case 'client_name': return item.quotations?.clients?.name ?? null
    case 'quotation_status': return item.quotations?.status ?? null
    case 'category': return item.category ?? null
    case 'kol_name': return item.kols?.name ?? null
    case 'service': return item.service ?? null
    case 'quantity': return item.quantity ?? 0
    case 'price': return Number(item.price) || 0
    case 'cost': return Number(item.cost) || 0
    case 'subtotal': return (item.quantity || 0) * (Number(item.price) || 0)
    case 'payment_status': return PAYMENT_STATUS_CONFIG[getPaymentStatus(item)].label
    case 'invoice_number': return item.invoice_number ?? null
  }
}

// ─── Sticky column offsets ──────────────────────────────────
// checkbox(40px) + quote_number(96px) + project_name(176px)
const STICKY_LEFT = { checkbox: '0px', quote_number: '40px', project_name: '136px' } as const
const STICKY_COLS = new Set<ColumnKey>(['checkbox', 'quote_number', 'project_name'])

// ─── Column Visibility Popover ──────────────────────────────
function ColumnVisibilityPopover({
  visible,
  onToggle,
}: {
  visible: Set<ColumnKey>
  onToggle: (key: ColumnKey) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const open = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) })
    setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [isOpen])

  const hideableColumns = COLUMN_DEFS.filter(c => c.hideable)
  const hiddenCount = hideableColumns.filter(c => !visible.has(c.key)).length

  return (
    <>
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        onClick={open}
        className={cn('gap-1.5', hiddenCount > 0 && 'border-primary/30 text-primary')}
      >
        <Columns3 className="h-4 w-4" />
        欄位 {hiddenCount > 0 && <span className="text-xs">({hiddenCount} 隱藏)</span>}
      </Button>
      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 w-52 bg-card border rounded-lg shadow-xl p-3 space-y-1 max-h-80 overflow-y-auto"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-xs text-muted-foreground font-medium mb-2">顯示欄位</p>
          {hideableColumns.map(col => (
            <label key={col.key} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-muted rounded text-sm">
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="rounded border-border text-primary focus:ring-ring h-3.5 w-3.5"
              />
              <span className="truncate">{col.label}</span>
            </label>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Props ──────────────────────────────────────────────────
interface QuotationItemsFlatViewProps {
  onClose: () => void
}

// ═══════════════════════════════════════════════════════════════
// Main Component
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

  // 參考資料
  const [kols, setKols] = useState<KolWithServices[]>([])
  const [categories, setCategories] = useState<QuoteCategory[]>([])

  useEffect(() => {
    const fetch = async () => {
      const [kolsRes, catsRes] = await Promise.all([
        supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
        supabase.from('quote_categories').select('*').order('name'),
      ])
      if (kolsRes.data) setKols(kolsRes.data as KolWithServices[])
      if (catsRes.data) setCategories(catsRes.data)
    }
    fetch()
  }, [])

  // 搜尋
  const [searchTerm, setSearchTerm] = useState('')

  // 選取
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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

  // 欄位顯示/隱藏
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    () => new Set(COLUMN_DEFS.map(c => c.key))
  )
  const toggleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])
  const isColVisible = useCallback((key: ColumnKey) => visibleColumns.has(key), [visibleColumns])

  // 排序 & 篩選
  const { sortState, toggleSort } = useTableSort<FlatSortKey>()
  const { filters, setFilter, activeCount: filterActiveCount } = useColumnFilters<Record<FlatSortKey, unknown>>()

  // 分頁
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  // 搜尋變更時重置分頁和選取
  useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()) }, [searchTerm])

  // 類別選項
  const categoryOptions = useMemo(() =>
    categories.map(c => ({ label: c.name, value: c.name })),
    [categories]
  )

  // KOL 選項
  const kolOptions = useMemo(() =>
    kols.map(k => ({ label: k.name, value: k.id, subLabel: k.real_name || undefined })),
    [kols]
  )

  // 篩選器 helpers
  const getFilter = (key: FlatSortKey): FilterValue | null =>
    filters.get(key as keyof Record<FlatSortKey, unknown>) ?? null
  const setFilterByKey = (key: FlatSortKey, value: FilterValue | null) =>
    setFilter(key as keyof Record<FlatSortKey, unknown>, value)

  // 唯一值（for select filters）
  const uniqueClients = useMemo(() =>
    Array.from(new Set(items.map(i => i.quotations?.clients?.name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [items]
  )
  const uniqueStatuses = ['草稿', '待簽約', '已簽約', '已歸檔']
  const uniqueKolNames = useMemo(() =>
    Array.from(new Set(items.map(i => i.kols?.name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [items]
  )
  const uniqueCategories = useMemo(() =>
    Array.from(new Set(items.map(i => i.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [items]
  )

  // ─── 篩選 + 排序 + 搜尋 ──────────────────────────────────
  const processedItems = useMemo(() => {
    let result = [...items]

    // 全文搜尋
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        (item.quotations?.quote_number || '').toLowerCase().includes(term) ||
        (item.quotations?.project_name || '').toLowerCase().includes(term) ||
        (item.quotations?.clients?.name || '').toLowerCase().includes(term) ||
        (item.kols?.name || '').toLowerCase().includes(term) ||
        (item.service || '').toLowerCase().includes(term) ||
        (item.invoice_number || '').toLowerCase().includes(term) ||
        (item.category || '').toLowerCase().includes(term)
      )
    }

    // 欄位篩選
    if (filters.size > 0) {
      result = result.filter(item => {
        let pass = true
        filters.forEach((fv, key) => {
          if (!pass) return
          const sortKey = String(key) as FlatSortKey
          const val = getSortValue(item, sortKey)

          switch (fv.type) {
            case 'text': {
              if (!fv.value) return
              const str = val == null ? '' : String(val)
              if (!str.toLowerCase().includes(fv.value.toLowerCase())) pass = false
              break
            }
            case 'select': {
              if (fv.selected.length === 0) return
              const str = val == null ? '' : String(val)
              if (!fv.selected.includes(str)) pass = false
              break
            }
            case 'number': {
              const num = typeof val === 'number' ? val : 0
              if (fv.min != null && num < fv.min) pass = false
              if (fv.max != null && num > fv.max) pass = false
              break
            }
          }
        })
        return pass
      })
    }

    // 排序
    if (sortState.key && sortState.direction) {
      const sk = sortState.key
      const dir = sortState.direction === 'asc' ? 1 : -1
      result.sort((a, b) => {
        const aVal = getSortValue(a, sk)
        const bVal = getSortValue(b, sk)
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
        return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
      })
    }

    return result
  }, [items, searchTerm, filters, sortState])

  // 分頁
  const totalCount = processedItems.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const paginatedItems = processedItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // ─── 選取邏輯 ────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pageItemIds = paginatedItems.filter(i => !isDataLocked(i)).map(i => i.id)
    const allSelected = pageItemIds.every(id => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        pageItemIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        pageItemIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  const pageItemIds = paginatedItems.filter(i => !isDataLocked(i)).map(i => i.id)
  const allPageSelected = pageItemIds.length > 0 && pageItemIds.every(id => selectedIds.has(id))

  // ─── 欄位更新 ────────────────────────────────────────────
  const handleUpdateField = useCallback(async (
    itemId: string,
    field: string,
    value: unknown
  ) => {
    updateItem.mutate({ id: itemId, updates: { [field]: value } })
  }, [updateItem])

  const handleKolChange = useCallback(async (
    item: FlatQuotationItem,
    kolNameOrId: string
  ) => {
    try {
      const resolvedId = await autoCreateKolIfNeeded(kolNameOrId, kols)
      updateItem.mutate({ id: item.id, updates: { kol_id: resolvedId } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新 KOL 失敗')
    }
  }, [kols, updateItem])

  const handleServiceChange = useCallback(async (
    item: FlatQuotationItem,
    serviceName: string
  ) => {
    updateItem.mutate({ id: item.id, updates: { service: serviceName } })
    // 自動建立服務關聯
    if (item.kol_id) {
      await autoCreateServiceIfNeeded(item.kol_id, serviceName, kols, Number(item.price) || 0, Number(item.cost) || 0)
    }
  }, [kols, updateItem])

  // ─── 批量發票 ────────────────────────────────────────────
  const handleBatchInvoice = useCallback((invoiceNumber: string) => {
    const ids = Array.from(selectedIds)
    batchUpdateInvoice.mutate({ ids, invoice_number: invoiceNumber })
    setSelectedIds(new Set())
  }, [selectedIds, batchUpdateInvoice])

  // ─── 附件更新 ────────────────────────────────────────────
  const handleAttachmentUpdate = useCallback((attachments: PaymentAttachment[]) => {
    if (!attachmentItem) return
    updateItem.mutate({
      id: attachmentItem.id,
      updates: { attachments: JSON.parse(JSON.stringify(attachments)) }
    })
    setAttachmentItem(null)
  }, [attachmentItem, updateItem])

  // ─── 請款操作 ────────────────────────────────────────────
  const handleRequestPayment = useCallback(async (item: FlatQuotationItem) => {
    if (!isVerificationPassed(item)) {
      toast.error('請先完成文件檢核（上傳附件或輸入有效發票號碼）')
      return
    }
    if (!userId) return
    const costAmount = item.cost_amount ?? item.cost ?? 0
    setActionLoading(item.id, true)
    requestPayment.mutate(
      { itemId: item.id, userId, costAmount: Number(costAmount) },
      { onSettled: () => setActionLoading(item.id, false) }
    )
  }, [userId, requestPayment])

  const handleApprovePayment = useCallback(async (item: FlatQuotationItem) => {
    if (!isEditor) {
      toast.error('僅 Editor 以上角色可審核')
      return
    }
    const ok = await confirm({
      title: '審核請款',
      description: `確定要核准「${item.service || '未命名服務'}」的請款嗎？核准後將自動建立進項記錄和確認記錄。`,
    })
    if (!ok) return
    setActionLoading(item.id, true)
    approvePayment.mutate(
      { itemId: item.id },
      { onSettled: () => setActionLoading(item.id, false) }
    )
  }, [isEditor, confirm, approvePayment])

  const handleRejectPayment = useCallback(async () => {
    if (!rejectingItemId) return
    setActionLoading(rejectingItemId, true)
    rejectPayment.mutate(
      { itemId: rejectingItemId, reason: rejectionReason.trim() },
      {
        onSettled: () => {
          setActionLoading(rejectingItemId, false)
          setRejectingItemId(null)
          setRejectionReason('')
        },
      }
    )
  }, [rejectingItemId, rejectionReason, rejectPayment])

  // ─── KOL 的服務選項 ──────────────────────────────────────
  const getServiceOptionsForKol = useCallback((kolId: string | null) => {
    if (!kolId) return []
    const kol = kols.find(k => k.id === kolId)
    if (!kol) return []
    return kol.kol_services
      .filter(ks => ks.service_types)
      .map(ks => ({
        label: ks.service_types!.name,
        value: ks.service_types!.name,
      }))
  }, [kols])

  // ─── Sticky cell helper ──────────────────────────────────
  const stickyThClass = (col: ColumnKey) => {
    if (!STICKY_COLS.has(col)) return ''
    const left = STICKY_LEFT[col as keyof typeof STICKY_LEFT]
    return `sticky z-30 bg-secondary/50`
  }
  const stickyThStyle = (col: ColumnKey): React.CSSProperties | undefined => {
    if (!STICKY_COLS.has(col)) return undefined
    return { left: STICKY_LEFT[col as keyof typeof STICKY_LEFT] }
  }
  const stickyTdClass = (col: ColumnKey, selected: boolean) => {
    if (!STICKY_COLS.has(col)) return ''
    return cn('sticky z-20', selected ? 'bg-primary/5' : 'bg-card', 'group-hover:!bg-accent/30')
  }
  const stickyTdStyle = stickyThStyle // same left offsets

  // ─── 計算可見欄位數量（用於 colSpan） ────────────────────
  const visibleColCount = COLUMN_DEFS.filter(c => isColVisible(c.key)).length

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
            <Input
              placeholder="搜尋編號、專案、客戶、KOL、服務、發票..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            共 {totalCount} 筆項目
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <BatchInvoicePopover
              selectedCount={selectedIds.size}
              onApply={handleBatchInvoice}
              onCancel={() => setSelectedIds(new Set())}
            />
          )}
          <ColumnVisibilityPopover visible={visibleColumns} onToggle={toggleColumn} />
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
            <X className="h-4 w-4" /> 關閉試算表
          </Button>
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
                {/* ── Checkbox ── */}
                {isColVisible('checkbox') && (
                  <th className={cn('w-10 p-2 text-center sticky top-0 bg-secondary/50', stickyThClass('checkbox'))} style={stickyThStyle('checkbox')}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                )}
                {/* ── 報價編號 ── */}
                {isColVisible('quote_number') && (
                  <th className={cn('w-24 p-2 sticky top-0 bg-secondary/50', stickyThClass('quote_number'))} style={stickyThStyle('quote_number')}>
                    <SortableHeader<FlatSortKey>
                      label="報價編號"
                      sortKey="quote_number"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('quote_number')} onChange={(v) => setFilterByKey('quote_number', v)} />}
                    />
                  </th>
                )}
                {/* ── 專案名稱 ── */}
                {isColVisible('project_name') && (
                  <th className={cn('w-44 p-2 sticky top-0 bg-secondary/50', stickyThClass('project_name'))} style={stickyThStyle('project_name')}>
                    <SortableHeader<FlatSortKey>
                      label="專案名稱"
                      sortKey="project_name"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('project_name')} onChange={(v) => setFilterByKey('project_name', v)} />}
                    />
                  </th>
                )}
                {/* ── 客戶 ── */}
                {isColVisible('client_name') && (
                  <th className="w-32 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey>
                      label="客戶"
                      sortKey="client_name"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={uniqueClients} value={getFilter('client_name')} onChange={(v) => setFilterByKey('client_name', v)} />}
                    />
                  </th>
                )}
                {/* ── 報價狀態 ── */}
                {isColVisible('quotation_status') && (
                  <th className="w-20 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey>
                      label="狀態"
                      sortKey="quotation_status"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={uniqueStatuses} value={getFilter('quotation_status')} onChange={(v) => setFilterByKey('quotation_status', v)} />}
                    />
                  </th>
                )}
                {/* ── 類別 ── */}
                {isColVisible('category') && (
                  <th className="w-24 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey>
                      label="類別"
                      sortKey="category"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={uniqueCategories} value={getFilter('category')} onChange={(v) => setFilterByKey('category', v)} />}
                    />
                  </th>
                )}
                {/* ── KOL/服務 ── */}
                {isColVisible('kol_name') && (
                  <th className="w-32 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey>
                      label="KOL/服務"
                      sortKey="kol_name"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={uniqueKolNames} value={getFilter('kol_name')} onChange={(v) => setFilterByKey('kol_name', v)} />}
                    />
                  </th>
                )}
                {/* ── 執行內容 ── */}
                {isColVisible('service') && (
                  <th className="w-36 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey>
                      label="執行內容"
                      sortKey="service"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                    />
                  </th>
                )}
                {/* ── 數量 ── */}
                {isColVisible('quantity') && (
                  <th className="w-16 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="數量" sortKey="quantity" sortState={sortState} onToggleSort={toggleSort} className="justify-end" />
                  </th>
                )}
                {/* ── 單價 ── */}
                {isColVisible('price') && (
                  <th className="w-24 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="單價" sortKey="price" sortState={sortState} onToggleSort={toggleSort} className="justify-end"
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('price')} onChange={(v) => setFilterByKey('price', v)} />}
                    />
                  </th>
                )}
                {/* ── 成本 ── */}
                {isColVisible('cost') && (
                  <th className="w-24 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="成本" sortKey="cost" sortState={sortState} onToggleSort={toggleSort} className="justify-end" />
                  </th>
                )}
                {/* ── 小計 ── */}
                {isColVisible('subtotal') && (
                  <th className="w-24 p-2 text-right sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey> label="小計" sortKey="subtotal" sortState={sortState} onToggleSort={toggleSort} className="justify-end" />
                  </th>
                )}
                {/* ── 發票號碼 ── */}
                {isColVisible('invoice_number') && (
                  <th className="w-28 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey>
                      label="發票號碼"
                      sortKey="invoice_number"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('invoice_number')} onChange={(v) => setFilterByKey('invoice_number', v)} />}
                    />
                  </th>
                )}
                {/* ── 附件 ── */}
                {isColVisible('attachments') && (
                  <th className="w-16 p-2 text-center sticky top-0 z-20 bg-secondary/50">附件</th>
                )}
                {/* ── 狀態（請款狀態 badge） ── */}
                {isColVisible('payment_status') && (
                  <th className="w-20 p-2 sticky top-0 z-20 bg-secondary/50">
                    <SortableHeader<FlatSortKey>
                      label="狀態"
                      sortKey="payment_status"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={['待請款', '待審核', '已請款', '被駁回']} value={getFilter('payment_status')} onChange={(v) => setFilterByKey('payment_status', v)} />}
                    />
                  </th>
                )}
                {/* ── 檢核 ── */}
                {isColVisible('verification') && (
                  <th className="w-12 p-2 text-center sticky top-0 z-20 bg-secondary/50">檢核</th>
                )}
                {/* ── 請款 ── */}
                {isColVisible('payment_request') && (
                  <th className="w-16 p-2 text-center sticky top-0 z-20 bg-secondary/50">請款</th>
                )}
                {/* ── 審核（Editor+ only） ── */}
                {isColVisible('approval') && isEditor && (
                  <th className="w-20 p-2 text-center sticky top-0 z-20 bg-secondary/50">審核</th>
                )}
              </tr>
            </thead>

            <tbody>
              {paginatedItems.map((item) => {
                const locked = isDataLocked(item)
                const paymentLocked = isPaymentLocked(item)
                const paymentStatus = getPaymentStatus(item)
                const statusConfig = PAYMENT_STATUS_CONFIG[paymentStatus]
                const verified = isVerificationPassed(item)
                const attachments = (item.attachments || []) as unknown as PaymentAttachment[]
                const subtotal = (item.quantity || 0) * (Number(item.price) || 0)
                const selected = selectedIds.has(item.id)
                const isActionLoading = actionLoadingIds.has(item.id)

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'group border-b hover:bg-accent/30 transition-colors text-sm',
                      selected && 'bg-primary/5',
                      locked && 'opacity-70'
                    )}
                  >
                    {/* ── Checkbox ── */}
                    {isColVisible('checkbox') && (
                      <td className={cn('w-10 p-2 text-center', stickyTdClass('checkbox', selected))} style={stickyTdStyle('checkbox')}>
                        {locked ? (
                          <Lock className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelect(item.id)}
                            className="rounded"
                          />
                        )}
                      </td>
                    )}

                    {/* ── 報價編號 (唯讀) ── */}
                    {isColVisible('quote_number') && (
                      <td className={cn('w-24 p-2 font-mono text-xs text-muted-foreground', stickyTdClass('quote_number', selected))} style={stickyTdStyle('quote_number')}>
                        {item.quotations?.quote_number || '—'}
                      </td>
                    )}

                    {/* ── 專案名稱 (唯讀) ── */}
                    {isColVisible('project_name') && (
                      <td className={cn('w-44 p-2 text-xs truncate', stickyTdClass('project_name', selected))} style={stickyTdStyle('project_name')} title={item.quotations?.project_name || ''}>
                        {item.quotations?.project_name || '—'}
                      </td>
                    )}

                    {/* ── 客戶 (唯讀) ── */}
                    {isColVisible('client_name') && (
                      <td className="w-32 p-2 text-xs truncate">
                        {item.quotations?.clients?.name || '—'}
                      </td>
                    )}

                    {/* ── 報價狀態 (唯讀) ── */}
                    {isColVisible('quotation_status') && (
                      <td className="w-20 p-2">
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full', {
                          'bg-secondary/50 text-foreground': item.quotations?.status === '草稿',
                          'bg-warning/15 text-warning': item.quotations?.status === '待簽約',
                          'bg-success/15 text-success': item.quotations?.status === '已簽約',
                          'bg-info/15 text-info': item.quotations?.status === '已歸檔',
                        })}>
                          {item.quotations?.status || '—'}
                        </span>
                      </td>
                    )}

                    {/* ── 類別 (可編輯) ── */}
                    {isColVisible('category') && (
                      <td className="w-24 p-1">
                        {locked ? (
                          <span className="text-xs px-2">{item.category || '—'}</span>
                        ) : (
                          <SearchableSelectCell
                            value={item.category}
                            options={categoryOptions}
                            onChange={(val) => handleUpdateField(item.id, 'category', val)}
                            placeholder="類別"
                            allowCustomValue
                          />
                        )}
                      </td>
                    )}

                    {/* ── KOL/服務 (可編輯) ── */}
                    {isColVisible('kol_name') && (
                      <td className="w-32 p-1">
                        {locked ? (
                          <span className="text-xs px-2">{item.kols?.name || '—'}</span>
                        ) : (
                          <SearchableSelectCell
                            value={item.kol_id}
                            displayValue={item.kols?.name || undefined}
                            options={kolOptions}
                            onChange={(val) => handleKolChange(item, val)}
                            placeholder="KOL"
                            allowCustomValue
                          />
                        )}
                      </td>
                    )}

                    {/* ── 執行內容 (可編輯) ── */}
                    {isColVisible('service') && (
                      <td className="w-36 p-1">
                        {locked ? (
                          <span className="text-xs px-2">{item.service || '—'}</span>
                        ) : (
                          <SearchableSelectCell
                            value={item.service}
                            options={getServiceOptionsForKol(item.kol_id)}
                            onChange={(val) => handleServiceChange(item, val)}
                            placeholder="服務"
                            allowCustomValue
                          />
                        )}
                      </td>
                    )}

                    {/* ── 數量 (可編輯) ── */}
                    {isColVisible('quantity') && (
                      <td className="w-16 p-1 text-right">
                        {locked ? (
                          <span className="text-xs font-mono px-2">{item.quantity}</span>
                        ) : (
                          <EditableCell
                            value={item.quantity}
                            type="number"
                            onChange={(val) => handleUpdateField(item.id, 'quantity', Number(val))}
                            className="text-right text-xs"
                          />
                        )}
                      </td>
                    )}

                    {/* ── 單價 (可編輯) ── */}
                    {isColVisible('price') && (
                      <td className="w-24 p-1 text-right">
                        {locked ? (
                          <span className="text-xs font-mono px-2">{Number(item.price).toLocaleString()}</span>
                        ) : (
                          <EditableCell
                            value={item.price}
                            type="number"
                            onChange={(val) => handleUpdateField(item.id, 'price', Number(val))}
                            className="text-right text-xs"
                          />
                        )}
                      </td>
                    )}

                    {/* ── 成本 (可編輯) ── */}
                    {isColVisible('cost') && (
                      <td className="w-24 p-1 text-right">
                        {locked ? (
                          <span className="text-xs font-mono px-2">{Number(item.cost).toLocaleString()}</span>
                        ) : (
                          <EditableCell
                            value={item.cost}
                            type="number"
                            onChange={(val) => handleUpdateField(item.id, 'cost', Number(val))}
                            className="text-right text-xs"
                          />
                        )}
                      </td>
                    )}

                    {/* ── 小計 (唯讀) ── */}
                    {isColVisible('subtotal') && (
                      <td className="w-24 p-2 text-right font-mono text-xs text-foreground/70">
                        {subtotal.toLocaleString()}
                      </td>
                    )}

                    {/* ── 發票號碼 (可編輯) ── */}
                    {isColVisible('invoice_number') && (
                      <td className="w-28 p-1">
                        <EditableCell
                          value={item.invoice_number || ''}
                          onChange={(val) => {
                            const v = String(val).trim()
                            if (v && !INVOICE_REGEX.test(v)) {
                              toast.error('發票號碼格式不正確（範例：AB-12345678）')
                              return
                            }
                            handleUpdateField(item.id, 'invoice_number', v || null)
                          }}
                          className="text-xs font-mono"
                          placeholder="XX-12345678"
                        />
                      </td>
                    )}

                    {/* ── 附件 ── */}
                    {isColVisible('attachments') && (
                      <td className="w-16 p-2 text-center">
                        <button
                          onClick={() => setAttachmentItem(item)}
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors',
                            attachments.length > 0
                              ? 'text-success hover:bg-success/10'
                              : 'text-muted-foreground hover:bg-muted'
                          )}
                          title={attachments.length > 0 ? `${attachments.length} 個附件` : '上傳附件'}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {attachments.length > 0 && <span>{attachments.length}</span>}
                        </button>
                      </td>
                    )}

                    {/* ── 狀態（請款狀態 badge） ── */}
                    {isColVisible('payment_status') && (
                      <td className="w-20 p-2">
                        <span
                          className={cn('text-xs px-1.5 py-0.5 rounded-full', statusConfig.className)}
                          title={paymentStatus === 'rejected' ? (item.rejection_reason || '已駁回') : undefined}
                        >
                          {statusConfig.label}
                        </span>
                      </td>
                    )}

                    {/* ── 檢核 ── */}
                    {isColVisible('verification') && (
                      <td className="w-12 p-2 text-center">
                        {verified ? (
                          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </td>
                    )}

                    {/* ── 請款 ── */}
                    {isColVisible('payment_request') && (
                      <td className="w-16 p-2 text-center">
                        {paymentStatus === 'approved' ? (
                          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                        ) : paymentStatus === 'requested' ? (
                          <span title="已送出，待審核"><CheckCircle2 className="h-4 w-4 text-warning mx-auto" /></span>
                        ) : paymentStatus === 'rejected' ? (
                          <button
                            onClick={() => handleRequestPayment(item)}
                            disabled={isActionLoading || paymentLocked}
                            className="p-1 rounded hover:bg-accent transition-colors mx-auto flex items-center justify-center disabled:opacity-50"
                            title={`駁回原因：${item.rejection_reason || '未提供'}（點擊重新請款）`}
                          >
                            {isActionLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive/70" />
                            )}
                          </button>
                        ) : (
                          /* pending */
                          <button
                            onClick={() => handleRequestPayment(item)}
                            disabled={isActionLoading || paymentLocked}
                            className="p-1 rounded hover:bg-accent transition-colors mx-auto flex items-center justify-center disabled:opacity-50"
                            title="勾選送出請款"
                          >
                            {isActionLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <div className="h-4 w-4 border-2 border-muted-foreground/40 rounded" />
                            )}
                          </button>
                        )}
                      </td>
                    )}

                    {/* ── 審核（Editor+ only） ── */}
                    {isColVisible('approval') && isEditor && (
                      <td className="w-20 p-2 text-center">
                        {paymentStatus === 'approved' ? (
                          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                        ) : paymentStatus === 'requested' ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => handleApprovePayment(item)}
                              disabled={isActionLoading}
                              className="p-1 rounded hover:bg-success/10 transition-colors disabled:opacity-50"
                              title="核准"
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : (
                                <div className="h-4 w-4 border-2 border-muted-foreground/40 rounded" />
                              )}
                            </button>
                            <button
                              onClick={() => setRejectingItemId(item.id)}
                              disabled={isActionLoading}
                              className="p-0.5 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
                              title="駁回"
                            >
                              <XCircle className="h-3.5 w-3.5 text-destructive/70" />
                            </button>
                          </div>
                        ) : paymentStatus === 'rejected' ? (
                          <span className="text-[10px] text-destructive" title={item.rejection_reason || '已駁回'}>✗</span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}

              {paginatedItems.length === 0 && (
                <tr>
                  <td colSpan={visibleColCount} className="p-8">
                    <EmptyState
                      type="no-data"
                      icon={FileText}
                      title="沒有項目"
                      description={searchTerm || filterActiveCount > 0 ? '沒有符合條件的項目' : '報價單中尚無項目'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t bg-secondary/20">
          <div className="text-xs text-muted-foreground">
            顯示 {((currentPage - 1) * pageSize) + 1} 至 {Math.min(currentPage * pageSize, totalCount)} 筆，共 {totalCount} 筆
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="h-7 text-xs"
            >
              <ChevronLeft className="h-3 w-3" /> 上一頁
            </Button>
            <span className="text-xs text-muted-foreground">
              第 {currentPage} 頁 / 共 {totalPages} 頁
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="h-7 text-xs"
            >
              下一頁 <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* 附件 Modal */}
      {attachmentItem && (
        <Modal
          isOpen={!!attachmentItem}
          onClose={() => setAttachmentItem(null)}
          title={`附件管理 — ${attachmentItem.kols?.name || '項目'} / ${attachmentItem.service || ''}`}
        >
          <div className="p-4">
            <AttachmentUploader
              itemId={attachmentItem.id}
              currentAttachments={(attachmentItem.attachments || []) as unknown as PaymentAttachment[]}
              onUpdate={handleAttachmentUpdate}
              readOnly={isPaymentLocked(attachmentItem)}
            />
          </div>
        </Modal>
      )}

      {/* 駁回原因 Modal */}
      <Modal
        isOpen={!!rejectingItemId}
        onClose={() => { setRejectingItemId(null); setRejectionReason('') }}
        title="駁回請款"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            請輸入駁回原因，申請人可依據原因修改後重新送出請款。
          </p>
          <Textarea
            placeholder="駁回原因..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setRejectingItemId(null); setRejectionReason('') }}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleRejectPayment}>
              確認駁回
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
