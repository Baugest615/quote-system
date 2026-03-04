'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { FileText } from 'lucide-react'
import { FileModal } from '@/components/quotes/FileModal'
import { toast } from 'sonner'
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
import { QuoteRow } from './data-grid/QuoteRow'
import { type QuoteSortKey, getSortValue } from './data-grid/helpers'

interface QuotesDataGridProps {
    data: QuotationWithClient[]
    clients: Database['public']['Tables']['clients']['Row'][]
    onRefresh: () => void
}

export function QuotesDataGrid({ data, clients, onRefresh }: QuotesDataGridProps) {
    const router = useRouter()
    const { userId, hasRole } = usePermission()
    const confirm = useConfirm()
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [fileModalOpen, setFileModalOpen] = useState(false)
    const [selectedQuote, setSelectedQuote] = useState<QuotationWithClient | null>(null)

    const { sortState, toggleSort } = useTableSort<QuoteSortKey>()
    const { filters, setFilter, activeCount: filterActiveCount } = useColumnFilters<Record<QuoteSortKey, unknown>>()

    const statusOptions = [
        { value: '草稿', label: '草稿', color: 'bg-secondary/50 text-foreground' },
        { value: '待簽約', label: '待簽約', color: 'bg-warning/15 text-warning' },
        { value: '已簽約', label: '已簽約', color: 'bg-success/15 text-success' },
        { value: '已歸檔', label: '已歸檔', color: 'bg-info/15 text-info' }
    ]

    const clientOptions = clients.map(c => ({ label: c.name, value: c.id }))

    const clientNames = useMemo(() =>
        Array.from(new Set(data.map(q => q.clients?.name).filter((n): n is string => !!n))), [data])
    const kolNames = useMemo(() =>
        Array.from(new Set(data.flatMap(q => q.quotation_items?.map(i => i.kols?.name) ?? []).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b, 'zh-Hant')), [data])
    const serviceNames = useMemo(() =>
        Array.from(new Set(data.flatMap(q => q.quotation_items?.map(i => i.service) ?? []).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b, 'zh-Hant')), [data])

    // 篩選 + 排序
    const processedData = useMemo(() => {
        let result = [...data]
        if (filters.size > 0) {
            result = result.filter(q => {
                let pass = true
                filters.forEach((fv, key) => {
                    if (!pass) return
                    const sortKey = String(key) as QuoteSortKey
                    if (sortKey === 'kol_names' && fv.type === 'select') {
                        if (fv.selected.length === 0) return
                        const itemKols = q.quotation_items?.map(i => i.kols?.name).filter(Boolean) ?? []
                        if (!fv.selected.some(s => itemKols.includes(s))) pass = false
                        return
                    }
                    if (sortKey === 'services' && fv.type === 'select') {
                        if (fv.selected.length === 0) return
                        const itemServices = q.quotation_items?.map(i => i.service).filter(Boolean) ?? []
                        if (!fv.selected.some(s => itemServices.includes(s))) pass = false
                        return
                    }
                    const val = getSortValue(q, sortKey)
                    switch (fv.type) {
                        case 'text': {
                            if (!fv.value) return
                            if (!String(val ?? '').toLowerCase().includes(fv.value.toLowerCase())) pass = false
                            break
                        }
                        case 'select': {
                            if (fv.selected.length === 0) return
                            if (!fv.selected.includes(String(val ?? ''))) pass = false
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
                            const str = String(val ?? '')
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
        if (sortState.key && sortState.direction) {
            const sortKey = sortState.key, dir = sortState.direction === 'asc' ? 1 : -1
            result.sort((a, b) => {
                const aVal = getSortValue(a, sortKey), bVal = getSortValue(b, sortKey)
                if (aVal == null && bVal == null) return 0
                if (aVal == null) return 1
                if (bVal == null) return -1
                if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
                return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
            })
        }
        return result
    }, [data, filters, sortState])

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows)
        newExpanded.has(id) ? newExpanded.delete(id) : newExpanded.add(id)
        setExpandedRows(newExpanded)
    }

    const hasAttachment = (attachments: any): boolean =>
        attachments && Array.isArray(attachments) && attachments.length > 0

    const handleUpdateQuotation = async (id: string, field: keyof QuotationWithClient, value: any) => {
        if (field === 'status' && value === '已簽約') {
            const quote = data.find(q => q.id === id)
            if (quote && !hasAttachment(quote.attachments)) {
                toast.error('無法更改狀態：請先上傳雙方用印的委刊報價單')
                onRefresh(); return
            }
        }
        const { error } = await supabase.from('quotations').update({ [field]: value }).eq('id', id)
        if (error) { toast.error('更新失敗: ' + error.message); return }
        toast.success('已更新')
        if (field === 'status') {
            const oldStatus = data.find(q => q.id === id)?.status
            await handleQuotationAccountingSync(id, value as string, oldStatus)
            await handleKolPriceSync(id, value as string, oldStatus)
        }
        onRefresh()
    }

    const handleDelete = async (id: string) => {
        const ok = await confirm({ title: '確認刪除', description: '確定要刪除此報價單嗎？', confirmLabel: '刪除', variant: 'destructive' })
        if (!ok) return
        const { error } = await supabase.from('quotations').delete().eq('id', id)
        if (error) { toast.error('刪除失敗') } else { toast.success('已刪除'); onRefresh() }
    }

    const canEditQuote = (quote: QuotationWithClient) =>
        hasRole('Editor') || quote.created_by == null || quote.created_by === userId

    const getFilter = (key: QuoteSortKey): FilterValue | null => filters.get(key as keyof Record<QuoteSortKey, unknown>) ?? null
    const setFilterByKey = (key: QuoteSortKey, value: FilterValue | null) => setFilter(key as keyof Record<QuoteSortKey, unknown>, value)

    // 表頭欄位定義
    const headerColumns: { key: QuoteSortKey; label: string; width: string; filterType: 'text' | 'date' | 'select' | 'number'; options?: string[]; className?: string }[] = [
        { key: 'quote_number', label: '編號', width: 'w-28', filterType: 'text' },
        { key: 'created_at', label: '日期', width: 'w-28', filterType: 'date' },
        { key: 'project_name', label: '專案名稱', width: 'w-[280px] flex-1', filterType: 'text' },
        { key: 'client_name', label: '客戶', width: 'w-56', filterType: 'select', options: clientNames },
        { key: 'kol_names', label: 'KOL/服務', width: 'w-40', filterType: 'select', options: kolNames },
        { key: 'services', label: '執行內容', width: 'w-40', filterType: 'select', options: serviceNames },
        { key: 'budget_total', label: '專案預算（含稅）', width: 'w-36', filterType: 'number', className: 'justify-end' },
        { key: 'status', label: '狀態', width: 'w-24', filterType: 'select', options: statusOptions.map(s => s.value) },
    ]

    return (
        <div className="h-full flex flex-col overflow-auto bg-card border rounded-lg shadow">
            {/* 表頭 */}
            <div className="flex bg-secondary/50 border-b font-medium text-sm text-muted-foreground sticky top-0 z-10 min-w-max">
                <div className="w-10 p-3 flex-shrink-0"></div>
                {headerColumns.map(col => (
                    <div key={col.key} className={`${col.width} p-3 flex-shrink-0 ${col.key === 'budget_total' ? 'text-right' : ''}`}>
                        <SortableHeader<QuoteSortKey>
                            label={col.label} sortKey={col.key} sortState={sortState} onToggleSort={toggleSort}
                            className={col.className}
                            filterContent={
                                <ColumnFilterPopover filterType={col.filterType} options={col.options}
                                    value={getFilter(col.key)} onChange={(v) => setFilterByKey(col.key, v)} />
                            }
                        />
                    </div>
                ))}
                <div className="w-28 p-3 flex-shrink-0 text-center">操作</div>
            </div>

            {/* 表格內容 */}
            <div className="min-w-max">
                {processedData.map((quote) => (
                    <QuoteRow
                        key={quote.id}
                        quote={quote}
                        isExpanded={expandedRows.has(quote.id)}
                        onToggleRow={toggleRow}
                        canEdit={canEditQuote(quote)}
                        clientOptions={clientOptions}
                        statusOptions={statusOptions}
                        onUpdate={handleUpdateQuotation}
                        onDelete={handleDelete}
                        onOpenFileModal={(q) => { setSelectedQuote(q); setFileModalOpen(true) }}
                        onViewDetail={(id) => router.push(`/dashboard/quotes/view/${id}`)}
                        onRefresh={onRefresh}
                        hasAttachment={hasAttachment}
                    />
                ))}

                {processedData.length === 0 && (
                    <EmptyState type="no-data" icon={FileText} title="沒有報價單"
                        description={filterActiveCount > 0 ? "沒有符合篩選條件的報價單" : "新增第一筆報價單開始使用"} />
                )}
            </div>

            <FileModal isOpen={fileModalOpen}
                onClose={() => { setFileModalOpen(false); setSelectedQuote(null) }}
                quote={selectedQuote} onUpdate={onRefresh} />
        </div>
    )
}
