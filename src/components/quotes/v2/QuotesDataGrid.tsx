'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown, Trash2, ExternalLink, CheckCircle, UploadCloud, FileText } from 'lucide-react'
import { EditableCell } from './EditableCell'
import { QuotationItemsList } from './QuotationItemsList'
import { FileModal } from '@/components/quotes/FileModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePermission } from '@/lib/permissions'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { handleQuotationAccountingSync } from '@/lib/accounting/sync-quote-accounting'
import { handleKolPriceSync } from '@/lib/kol/sync-kol-prices'
import { EmptyState } from '@/components/ui/EmptyState'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover'
import { useTableSort } from '@/hooks/useTableSort'
import { useColumnFilters, type FilterValue } from '@/hooks/useColumnFilters'
import type { QuotationWithClient } from '@/app/dashboard/quotes/page'

// Sort key type for QuotesDataGrid (includes computed columns)
type QuoteSortKey = 'created_at' | 'project_name' | 'client_name' | 'budget_total' | 'status'

interface QuotesDataGridProps {
    data: QuotationWithClient[]
    clients: Database['public']['Tables']['clients']['Row'][]
    onRefresh: () => void
}

// Helper: compute budget total for a quote
function getQuoteTotal(q: QuotationWithClient): number {
    return q.has_discount && q.discounted_price
        ? q.discounted_price + Math.round(q.discounted_price * 0.05)
        : (q.grand_total_taxed || 0)
}

// Helper: get sortable value from quote by key
function getSortValue(q: QuotationWithClient, key: QuoteSortKey): string | number | null {
    switch (key) {
        case 'created_at': return q.created_at ?? null
        case 'project_name': return q.project_name ?? null
        case 'client_name': return q.clients?.name ?? null
        case 'budget_total': return getQuoteTotal(q)
        case 'status': return q.status ?? null
    }
}

export function QuotesDataGrid({ data, clients, onRefresh }: QuotesDataGridProps) {
    const router = useRouter()
    const { userId, hasRole } = usePermission()
    const confirm = useConfirm()
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    // 檔案上傳 Modal 狀態
    const [fileModalOpen, setFileModalOpen] = useState(false)
    const [selectedQuote, setSelectedQuote] = useState<QuotationWithClient | null>(null)

    // ------ Sorting ------
    const { sortState, toggleSort } = useTableSort<QuoteSortKey>()

    // ------ Inline Filters ------
    const { filters, setFilter, activeCount: filterActiveCount } = useColumnFilters<Record<QuoteSortKey, unknown>>()

    // Status options
    const statusOptions = [
        { value: '草稿', label: '草稿', color: 'bg-secondary/50 text-foreground' },
        { value: '待簽約', label: '待簽約', color: 'bg-warning/15 text-warning' },
        { value: '已簽約', label: '已簽約', color: 'bg-success/15 text-success' },
        { value: '已歸檔', label: '已歸檔', color: 'bg-info/15 text-info' }
    ]

    // 客戶選項
    const clientOptions = clients.map(c => ({
        label: c.name,
        value: c.id
    }))

    // Unique client names for filter
    const clientNames = useMemo(() =>
        Array.from(new Set(data.map(q => q.clients?.name).filter((n): n is string => !!n))),
        [data]
    )

    // ------ Apply filters + sort ------
    const processedData = useMemo(() => {
        let result = [...data]

        // Apply inline filters
        if (filters.size > 0) {
            result = result.filter(q => {
                let pass = true
                filters.forEach((fv, key) => {
                    if (!pass) return
                    const sortKey = String(key) as QuoteSortKey
                    const val = getSortValue(q, sortKey)

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
                        case 'date': {
                            if (!fv.start && !fv.end) return
                            const str = val == null ? '' : String(val)
                            if (!str) { pass = false; return }
                            if (fv.start && str < fv.start) pass = false
                            if (fv.end && str > fv.end + 'T23:59:59') pass = false
                            break
                        }
                    }
                })
                return pass
            })
        }

        // Apply sort
        if (sortState.key && sortState.direction) {
            const sortKey = sortState.key
            const dir = sortState.direction === 'asc' ? 1 : -1
            result.sort((a, b) => {
                const aVal = getSortValue(a, sortKey)
                const bVal = getSortValue(b, sortKey)
                if (aVal == null && bVal == null) return 0
                if (aVal == null) return 1
                if (bVal == null) return -1
                if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
                return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
            })
        }

        return result
    }, [data, filters, sortState])

    // 切換展開/收合
    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    // 輔助函數：檢查附件
    const hasAttachment = (attachments: any): boolean => {
        return attachments && Array.isArray(attachments) && attachments.length > 0
    }

    // 更新報價單
    const handleUpdateQuotation = async (id: string, field: keyof QuotationWithClient, value: any) => {
        // 狀態驗證邏輯
        if (field === 'status' && value === '已簽約') {
            const quote = data.find(q => q.id === id)
            if (quote && !hasAttachment(quote.attachments)) {
                toast.error('無法更改狀態：請先上傳雙方用印的委刊報價單')
                onRefresh()
                return
            }
        }

        const { error } = await supabase
            .from('quotations')
            .update({ [field]: value })
            .eq('id', id)

        if (error) {
            toast.error('更新失敗: ' + error.message)
        } else {
            toast.success('已更新')

            // 狀態變更時自動同步帳務記錄 + KOL 服務價格
            if (field === 'status') {
                const oldStatus = data.find(q => q.id === id)?.status
                await handleQuotationAccountingSync(id, value as string, oldStatus)
                await handleKolPriceSync(id, value as string, oldStatus)
            }

            onRefresh()
        }
    }

    // 刪除報價單
    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: '確認刪除',
            description: '確定要刪除此報價單嗎？',
            confirmLabel: '刪除',
            variant: 'destructive',
        })
        if (!ok) return

        const { error } = await supabase
            .from('quotations')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('刪除失敗')
        } else {
            toast.success('已刪除')
            onRefresh()
        }
    }

    // 渲染附件按鈕
    const renderAttachmentButton = (quote: QuotationWithClient) => {
        const hasFile = hasAttachment(quote.attachments)
        return (
            <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0", hasFile ? "text-success" : "text-muted-foreground")}
                onClick={(e) => {
                    e.stopPropagation()
                    setSelectedQuote(quote)
                    setFileModalOpen(true)
                }}
                title={hasFile ? "已上傳 (點擊管理)" : "上傳檔案"}
            >
                {hasFile ? <CheckCircle className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
            </Button>
        )
    }

    // Helper: get filter value for a specific key
    const getFilter = (key: QuoteSortKey): FilterValue | null => {
        return filters.get(key as keyof Record<QuoteSortKey, unknown>) ?? null
    }
    const setFilterByKey = (key: QuoteSortKey, value: FilterValue | null) => {
        setFilter(key as keyof Record<QuoteSortKey, unknown>, value)
    }

    return (
        <div className="h-full flex flex-col overflow-auto bg-card border rounded-lg shadow">
            {/* 表頭 */}
            <div className="flex bg-secondary/50 border-b font-medium text-sm text-muted-foreground sticky top-0 z-10 min-w-max">
                <div className="w-10 p-3 flex-shrink-0"></div>
                <div className="w-28 p-3 flex-shrink-0">ID</div>
                <div className="w-28 p-3 flex-shrink-0">
                    <SortableHeader<QuoteSortKey>
                        label="日期"
                        sortKey="created_at"
                        sortState={sortState}
                        onToggleSort={toggleSort}
                        filterContent={
                            <ColumnFilterPopover
                                filterType="date"
                                value={getFilter('created_at')}
                                onChange={(v) => setFilterByKey('created_at', v)}
                            />
                        }
                    />
                </div>
                <div className="w-[280px] flex-1 p-3">
                    <SortableHeader<QuoteSortKey>
                        label="專案名稱"
                        sortKey="project_name"
                        sortState={sortState}
                        onToggleSort={toggleSort}
                        filterContent={
                            <ColumnFilterPopover
                                filterType="text"
                                value={getFilter('project_name')}
                                onChange={(v) => setFilterByKey('project_name', v)}
                            />
                        }
                    />
                </div>
                <div className="w-56 p-3 flex-shrink-0">
                    <SortableHeader<QuoteSortKey>
                        label="客戶"
                        sortKey="client_name"
                        sortState={sortState}
                        onToggleSort={toggleSort}
                        filterContent={
                            <ColumnFilterPopover
                                filterType="select"
                                options={clientNames}
                                value={getFilter('client_name')}
                                onChange={(v) => setFilterByKey('client_name', v)}
                            />
                        }
                    />
                </div>
                <div className="w-36 p-3 flex-shrink-0 text-right">
                    <SortableHeader<QuoteSortKey>
                        label="專案預算（含稅）"
                        sortKey="budget_total"
                        sortState={sortState}
                        onToggleSort={toggleSort}
                        filterContent={
                            <ColumnFilterPopover
                                filterType="number"
                                value={getFilter('budget_total')}
                                onChange={(v) => setFilterByKey('budget_total', v)}
                            />
                        }
                        className="justify-end"
                    />
                </div>
                <div className="w-24 p-3 flex-shrink-0">
                    <SortableHeader<QuoteSortKey>
                        label="狀態"
                        sortKey="status"
                        sortState={sortState}
                        onToggleSort={toggleSort}
                        filterContent={
                            <ColumnFilterPopover
                                filterType="select"
                                options={statusOptions.map(s => s.value)}
                                value={getFilter('status')}
                                onChange={(v) => setFilterByKey('status', v)}
                            />
                        }
                    />
                </div>
                <div className="w-28 p-3 flex-shrink-0 text-center">操作</div>
            </div>

            {/* 表格內容 */}
            <div className="min-w-max">
                {processedData.map((quote) => {
                    const isExpanded = expandedRows.has(quote.id)
                    const total = getQuoteTotal(quote)

                    return (
                        <div key={quote.id} className="border-b last:border-b-0">
                            {/* 主行 */}
                            <div className={cn(
                                "flex items-center hover:bg-accent/50 transition-colors group",
                                isExpanded && "bg-accent/30"
                            )}>
                                {/* 展開按鈕 */}
                                <div className="w-10 p-3 flex justify-center flex-shrink-0 cursor-pointer" onClick={() => toggleRow(quote.id)}>
                                    {isExpanded ?
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" /> :
                                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground" />
                                    }
                                </div>

                                {/* ID (唯讀) */}
                                <div className="w-28 p-3 flex-shrink-0 text-xs font-mono text-muted-foreground truncate" title={quote.id}>
                                    {quote.id.slice(0, 8)}...
                                </div>

                                {/* 日期 (唯讀) */}
                                <div className="w-28 p-3 flex-shrink-0 text-sm text-muted-foreground">
                                    {new Date(quote.created_at || '').toLocaleDateString('zh-TW')}
                                </div>

                                {/* 專案名稱 */}
                                <div className="w-[280px] flex-1 p-2">
                                    {(hasRole('Editor') || quote.created_by == null || quote.created_by === userId) ? (
                                        <EditableCell
                                            value={quote.project_name}
                                            onChange={(val) => handleUpdateQuotation(quote.id, 'project_name', val)}
                                            className="font-medium text-foreground"
                                        />
                                    ) : (
                                        <div className="font-medium text-foreground px-2 min-h-[2rem] flex items-center text-sm truncate">
                                            {quote.project_name}
                                        </div>
                                    )}
                                </div>

                                {/* 客戶 */}
                                <div className="w-56 p-2 flex-shrink-0">
                                    {(hasRole('Editor') || quote.created_by == null || quote.created_by === userId) ? (
                                        <EditableCell
                                            value={quote.client_id}
                                            type="select"
                                            options={clientOptions}
                                            onChange={(val) => handleUpdateQuotation(quote.id, 'client_id', val)}
                                        />
                                    ) : (
                                        <div className="text-sm text-foreground px-2 min-h-[2rem] flex items-center truncate">
                                            {clients.find(c => c.id === quote.client_id)?.name || '-'}
                                        </div>
                                    )}
                                </div>

                                {/* 專案預算（含稅）(唯讀 - 自動計算) */}
                                <div className="w-36 p-3 flex-shrink-0 text-right font-mono font-medium text-foreground/70">
                                    {total.toLocaleString()}
                                </div>

                                {/* 狀態 */}
                                <div className="w-24 p-2 flex-shrink-0">
                                    {(hasRole('Editor') || quote.created_by == null || quote.created_by === userId) ? (
                                        <EditableCell
                                            value={quote.status}
                                            type="select"
                                            options={statusOptions}
                                            onChange={(val) => handleUpdateQuotation(quote.id, 'status', val)}
                                            className="text-xs"
                                        />
                                    ) : (
                                        <div className="text-xs text-foreground px-2 min-h-[2rem] flex items-center">
                                            {quote.status}
                                        </div>
                                    )}
                                </div>

                                {/* 操作 */}
                                <div className="w-28 p-2 flex-shrink-0 flex justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {renderAttachmentButton(quote)}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => router.push(`/dashboard/quotes/view/${quote.id}`)}
                                        title="檢視詳情"
                                    >
                                        <ExternalLink className="h-4 w-4 text-info" />
                                    </Button>
                                    {(hasRole('Editor') || (quote.created_by != null && quote.created_by === userId)) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() => handleDelete(quote.id)}
                                            title="刪除"
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* 展開內容 (成本明細) */}
                            {isExpanded && (
                                <div className="bg-muted/20 border-t border-border/50 p-4 pl-14 shadow-inner overflow-x-auto">
                                    <QuotationItemsList
                                        quotationId={quote.id}
                                        onUpdate={onRefresh}
                                        readOnly={!(hasRole('Editor') || quote.created_by == null || quote.created_by === userId)}
                                        quotationStatus={quote.status ?? undefined}
                                    />
                                </div>
                            )}
                        </div>
                    )
                })}

                {processedData.length === 0 && (
                    <EmptyState
                        type="no-data"
                        icon={FileText}
                        title="沒有報價單"
                        description={filterActiveCount > 0 ? "沒有符合篩選條件的報價單" : "新增第一筆報價單開始使用"}
                    />
                )}
            </div>

            {/* 檔案上傳 Modal */}
            <FileModal
                isOpen={fileModalOpen}
                onClose={() => {
                    setFileModalOpen(false)
                    setSelectedQuote(null)
                }}
                quote={selectedQuote}
                onUpdate={onRefresh}
            />
        </div>
    )
}
