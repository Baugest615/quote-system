'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { Search, Receipt, Pencil, Trash2, ChevronLeft, Table2 } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import SpreadsheetEditor from '@/components/accounting/SpreadsheetEditor'
import { EmptyState } from '@/components/ui/EmptyState'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover'
import { useTableSort } from '@/hooks/useTableSort'
import { useColumnFilters, type FilterValue } from '@/hooks/useColumnFilters'
import Link from 'next/link'
import type { AccountingSale } from '@/types/custom.types'
import type { SpreadsheetColumn, BatchSaveResult, RowError } from '@/lib/spreadsheet-utils'
import { useQuotationOptions } from '@/hooks/useQuotationOptions'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { CURRENT_YEAR, MONTH_OPTIONS } from '@/lib/constants'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const PAGE_SIZE = 20

type SalesSortKey = 'invoice_month' | 'project_name' | 'client_name' | 'sales_amount' | 'tax_amount' | 'total_amount' | 'invoice_number' | 'actual_receipt_date' | 'receipt_status'

const getReceiptStatus = (r: AccountingSale) => r.actual_receipt_date ? '已收' : '未收'

function getSalesSortValue(r: AccountingSale, key: SalesSortKey): string | number | null {
  switch (key) {
    case 'invoice_month': return r.invoice_month ?? null
    case 'project_name': return r.project_name ?? null
    case 'client_name': return r.client_name ?? null
    case 'sales_amount': return r.sales_amount ?? 0
    case 'tax_amount': return r.tax_amount ?? 0
    case 'total_amount': return r.total_amount ?? 0
    case 'invoice_number': return r.invoice_number ?? null
    case 'actual_receipt_date': return r.actual_receipt_date ?? null
    case 'receipt_status': return getReceiptStatus(r)
  }
}

const emptyForm = (): Partial<AccountingSale> => ({
  year: CURRENT_YEAR,
  invoice_month: '',
  project_name: '',
  client_name: '',
  sales_amount: 0,
  tax_amount: 0,
  total_amount: 0,
  invoice_number: '',
  invoice_date: null,
  actual_receipt_date: null,
  note: '',
})

export default function AccountingSalesPage() {
  const confirm = useConfirm()
  const { loading: permLoading, hasRole } = usePermission()
  const hasAccess = hasRole('Editor')
  const queryClient = useQueryClient()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccountingSale | null>(null)
  const [form, setForm] = useState<Partial<AccountingSale>>(emptyForm())
  const [currentPage, setCurrentPage] = useState(1)
  const [isSpreadsheetMode, setIsSpreadsheetMode] = useState(false)
  const { options: quotationOptions, suggestionOptions: quotationSuggestionOptions } = useQuotationOptions()
  const { sortState, toggleSort } = useTableSort<SalesSortKey>()
  const { filters, setFilter } = useColumnFilters<Record<SalesSortKey, unknown>>()
  const getFilter = (key: SalesSortKey): FilterValue | null => filters.get(key as keyof Record<SalesSortKey, unknown>) ?? null
  const setFilterByKey = (key: SalesSortKey, value: FilterValue | null) => setFilter(key as keyof Record<SalesSortKey, unknown>, value)

  // 試算表欄位定義
  const spreadsheetColumns = useMemo<SpreadsheetColumn<AccountingSale>[]>(() => [
    { key: 'invoice_month', label: '報價年月', type: 'select',
      options: MONTH_OPTIONS.map(m => `${year}年${m}`), width: 'w-28' },
    { key: 'project_name', label: '案件名稱', type: 'autocomplete', suggestionOptions: quotationSuggestionOptions, required: true, width: 'w-40' },
    { key: 'client_name', label: '開立對象', type: 'text', width: 'w-32' },
    { key: 'sales_amount', label: '銷售額（未稅）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'tax_amount', label: '稅額', type: 'number', readOnly: true, width: 'w-24' },
    { key: 'total_amount', label: '發票總額', type: 'number', readOnly: true, width: 'w-28' },
    { key: 'invoice_number', label: '發票號碼', type: 'text', width: 'w-28' },
    { key: 'invoice_date', label: '發票開立日', type: 'date', width: 'w-28' },
    { key: 'actual_receipt_date', label: '實際入帳日', type: 'date', width: 'w-28' },
    { key: 'note', label: '備註', type: 'text', width: 'w-40' },
  ], [year, quotationSuggestionOptions])

  const currentQueryKey = queryKeys.accountingSales(year)

  const { data: records = [], isLoading: loading } = useQuery({
    queryKey: [...currentQueryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_sales')
        .select('*, quotations:quotation_id(quote_number)')
        .eq('year', year)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as (AccountingSale & { quotations: { quote_number: string } | null })[]
    },
    enabled: !permLoading && hasAccess,
  })

  const handleAutoCalcSales = (row: Partial<AccountingSale>) => {
    const tax = Math.round((row.sales_amount || 0) * 0.05 * 100) / 100
    const total = Math.round(((row.sales_amount || 0) + tax) * 100) / 100
    return { tax_amount: tax, total_amount: total } as Partial<AccountingSale>
  }

  const handleBatchSave = async (
    toInsert: Partial<AccountingSale>[],
    toUpdate: { id: string; data: Partial<AccountingSale> }[],
    toDelete: string[]
  ): Promise<BatchSaveResult> => {
    const { data: { user } } = await supabase.auth.getUser()
    const errors: RowError[] = []
    let successCount = 0

    if (toInsert.length > 0) {
      const payload = toInsert.map(r => ({ ...r, year, created_by: user?.id }))
      const { error } = await supabase.from('accounting_sales').insert(payload)
      if (error) toInsert.forEach((_, i) => errors.push({ tempId: `insert-${i}`, message: error.message }))
      else successCount += toInsert.length
    }

    for (const { id, data } of toUpdate) {
      const { error } = await supabase.from('accounting_sales').update({ ...data, created_by: user?.id }).eq('id', id)
      if (error) errors.push({ tempId: id, message: error.message })
      else successCount++
    }

    if (toDelete.length > 0) {
      const { error } = await supabase.from('accounting_sales').delete().in('id', toDelete)
      if (error) errors.push({ tempId: 'batch-delete', message: error.message })
      else successCount += toDelete.length
    }

    await queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
    return { successCount, errors }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = q
      ? records.filter(r =>
          r.project_name.toLowerCase().includes(q) ||
          (r.client_name || '').toLowerCase().includes(q) ||
          (r.invoice_number || '').toLowerCase().includes(q)
        )
      : [...records]
    // 欄位篩選
    if (filters.size > 0) {
      result = result.filter(r => {
        let pass = true
        filters.forEach((fv, key) => {
          if (!pass) return
          const val = getSalesSortValue(r, String(key) as SalesSortKey)
          if (fv.type === 'text') {
            if (!String(val ?? '').toLowerCase().includes(fv.value.toLowerCase())) pass = false
          } else if (fv.type === 'select') {
            if (!fv.selected.includes(String(val ?? ''))) pass = false
          } else if (fv.type === 'number') {
            const num = typeof val === 'number' ? val : parseFloat(String(val ?? ''))
            if (isNaN(num)) { if (fv.min != null || fv.max != null) pass = false; return }
            if (fv.min != null && num < fv.min) pass = false
            if (fv.max != null && num > fv.max) pass = false
          } else if (fv.type === 'date') {
            const str = String(val ?? '')
            if (!str) { pass = false; return }
            if (fv.start && str < fv.start) pass = false
            if (fv.end && str > fv.end) pass = false
          }
        })
        return pass
      })
    }
    // 排序
    if (sortState.key && sortState.direction) {
      const dir = sortState.direction === 'asc' ? 1 : -1
      result.sort((a, b) => {
        const aVal = getSalesSortValue(a, sortState.key as SalesSortKey)
        const bVal = getSalesSortValue(b, sortState.key as SalesSortKey)
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
        return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
      })
    }
    return result
  }, [search, records, filters, sortState])

  const openEdit = (record: AccountingSale) => {
    setEditing(record)
    setForm({ ...record })
    setIsModalOpen(true)
  }

  const handleSalesAmountChange = (value: number) => {
    const tax = Math.round(value * 0.05 * 100) / 100
    const total = Math.round((value + tax) * 100) / 100
    setForm(f => ({ ...f, sales_amount: value, tax_amount: tax, total_amount: total }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, created_by: user?.id }
      const { error } = await supabase.from('accounting_sales').update(payload).eq('id', editing.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
      toast.success('已更新銷項記錄')
      setIsModalOpen(false)
    },
    onError: () => toast.error('儲存失敗，請重試'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounting_sales').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
      toast.success('已刪除')
    },
    onError: () => toast.error('刪除失敗'),
  })

  const handleSave = async () => {
    if (!form.project_name?.trim()) return toast.error('請填寫案件名稱')
    saveMutation.mutate()
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除這筆記錄嗎？',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }

  const saving = saveMutation.isPending

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} hasAccess={true} />
  if (!hasRole('Editor')) return <AccountingLoadingGuard loading={false} hasAccess={false} />

  const totalSales = filtered.reduce((s, r) => s + (r.sales_amount || 0), 0)
  const totalTax = filtered.reduce((s, r) => s + (r.tax_amount || 0), 0)
  const totalAmount = filtered.reduce((s, r) => s + (r.total_amount || 0), 0)

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-muted-foreground/60 hover:text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Receipt className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">銷項管理</h1>
          <p className="text-sm text-muted-foreground">發票開立記錄</p>
        </div>
      </div>

      {/* 操作列 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
            <option key={y} value={y}>{y} 年</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="搜尋案件名稱、客戶、發票號碼..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => setIsSpreadsheetMode(!isSpreadsheetMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSpreadsheetMode
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          <Table2 className="w-4 h-4" />
          {isSpreadsheetMode ? '表格模式' : '試算表模式'}
        </button>
      </div>

      {isSpreadsheetMode ? (
        <SpreadsheetEditor<AccountingSale>
          columns={spreadsheetColumns}
          initialRows={records}
          year={year}
          emptyRow={emptyForm}
          onAutoCalc={handleAutoCalcSales}
          onBatchSave={handleBatchSave}
          allowInsert={false}
          accentColor="blue"
          onClose={() => setIsSpreadsheetMode(false)}
        />
      ) : (
      <>
      {/* 統計卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-chart-4/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-4/70 mb-1">銷售額（未稅）</p>
          <p className="text-lg font-bold text-chart-4">NT$ {fmt(totalSales)}</p>
        </div>
        <div className="bg-muted rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">稅額</p>
          <p className="text-lg font-bold text-foreground">NT$ {fmt(totalTax)}</p>
        </div>
        <div className="bg-chart-1/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-1/70 mb-1">發票總金額（含稅）</p>
          <p className="text-lg font-bold text-chart-1">NT$ {fmt(totalAmount)}</p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground/60">載入中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2">
                    <SortableHeader<SalesSortKey> label="報價年月" sortKey="invoice_month" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={MONTH_OPTIONS.map(m => `${year}年${m}`)} value={getFilter('invoice_month')} onChange={v => setFilterByKey('invoice_month', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<SalesSortKey> label="案件名稱" sortKey="project_name" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('project_name')} onChange={v => setFilterByKey('project_name', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<SalesSortKey> label="開立對象" sortKey="client_name" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('client_name')} onChange={v => setFilterByKey('client_name', v)} />} />
                  </th>
                  <th className="text-right px-4 py-2">
                    <SortableHeader<SalesSortKey> label="銷售額" sortKey="sales_amount" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('sales_amount')} onChange={v => setFilterByKey('sales_amount', v)} />} />
                  </th>
                  <th className="text-right px-4 py-2">
                    <SortableHeader<SalesSortKey> label="稅額" sortKey="tax_amount" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('tax_amount')} onChange={v => setFilterByKey('tax_amount', v)} />} />
                  </th>
                  <th className="text-right px-4 py-2">
                    <SortableHeader<SalesSortKey> label="發票總額" sortKey="total_amount" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('total_amount')} onChange={v => setFilterByKey('total_amount', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<SalesSortKey> label="發票號碼" sortKey="invoice_number" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('invoice_number')} onChange={v => setFilterByKey('invoice_number', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<SalesSortKey> label="實際入帳日" sortKey="actual_receipt_date" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="date" value={getFilter('actual_receipt_date')} onChange={v => setFilterByKey('actual_receipt_date', v)} />} />
                  </th>
                  <th className="text-center px-4 py-2">
                    <SortableHeader<SalesSortKey> label="收款狀態" sortKey="receipt_status" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={['已收', '未收']} value={getFilter('receipt_status')} onChange={v => setFilterByKey('receipt_status', v)} />} />
                  </th>
                  <th className="text-center px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState type="no-data" icon={Receipt} title="尚無銷售記錄" description="銷項記錄由報價單簽約時自動建立" /></td></tr>
                ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => (
                  <tr key={r.id} className="border-t border-border/50 hover:bg-accent">
                    <td className="px-4 py-3 text-muted-foreground">{r.invoice_month || '-'}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {r.quotations?.quote_number && <span className="text-xs font-mono text-muted-foreground mr-1.5">{r.quotations.quote_number}</span>}
                      {r.project_name}
                      {r.quotation_id && <span className="ml-1.5 text-[10px] text-primary bg-primary/10 px-1 py-0.5 rounded" title="由報價單自動建立">自動</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.client_name || '-'}</td>
                    <td className="px-4 py-3 text-right text-chart-4">NT$ {fmt(r.sales_amount || 0)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">NT$ {fmt(r.tax_amount || 0)}</td>
                    <td className="px-4 py-3 text-right font-medium text-success">NT$ {fmt(r.total_amount || 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.invoice_number || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.actual_receipt_date || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.actual_receipt_date
                          ? 'bg-success/15 text-success'
                          : 'bg-warning/15 text-warning'
                      }`}>
                        {getReceiptStatus(r)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(r)} className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filtered.length / PAGE_SIZE)}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* 新增/編輯 Modal */}
      <AccountingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="編輯銷項記錄"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">報價年份</label>
                  <select
                    value={form.year}
                    onChange={(e) => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">報價月份</label>
                  <select
                    value={form.invoice_month || ''}
                    onChange={(e) => setForm(f => ({ ...f, invoice_month: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">-- 選擇月份 --</option>
                    {MONTH_OPTIONS.map(m => <option key={m} value={`${form.year}年${m}`}>{form.year}年{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">案件名稱 *</label>
                <SearchableSelect
                  value={form.quotation_id || null}
                  onChange={(val, data) => setForm(f => ({ ...f, quotation_id: val || null, project_name: data?.project_name ?? f.project_name ?? '' }))}
                  options={quotationOptions}
                  placeholder="搜尋編號或案件名稱..."
                  clearable
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">開立對象（客戶名稱）</label>
                <input
                  type="text"
                  value={form.client_name || ''}
                  onChange={(e) => setForm(f => ({ ...f, client_name: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="請輸入客戶名稱"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">銷售額（未稅）</label>
                  <input
                    type="number"
                    value={form.sales_amount || ''}
                    onChange={(e) => handleSalesAmountChange(Number(e.target.value))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">稅額（自動計算 5%）</label>
                  <input
                    type="number"
                    value={form.tax_amount || ''}
                    onChange={(e) => setForm(f => ({ ...f, tax_amount: Number(e.target.value), total_amount: (f.sales_amount || 0) + Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">發票總金額（含稅）</label>
                  <input
                    type="number"
                    value={form.total_amount || ''}
                    onChange={(e) => setForm(f => ({ ...f, total_amount: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">發票號碼</label>
                  <input
                    type="text"
                    value={form.invoice_number || ''}
                    onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="如 AB-12345678"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">發票開立日</label>
                  <input
                    type="date"
                    value={form.invoice_date || ''}
                    onChange={(e) => setForm(f => ({ ...f, invoice_date: e.target.value || null }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  實際入帳日
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                    form.actual_receipt_date ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                  }`}>
                    {form.actual_receipt_date ? '已收' : '未收'}
                  </span>
                </label>
                <input
                  type="date"
                  value={form.actual_receipt_date || ''}
                  onChange={(e) => setForm(f => ({ ...f, actual_receipt_date: e.target.value || null }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">備註</label>
                <textarea
                  value={form.note || ''}
                  onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="選填備註"
                />
              </div>
        </div>
      </AccountingModal>
      </>
      )}
    </div>
  )
}
