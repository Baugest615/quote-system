'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { Plus, Search, TrendingDown, Pencil, Trash2, ChevronLeft, Table2, Lock } from 'lucide-react'
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
import type { AccountingExpense, PaymentTargetType, ExpenseType } from '@/types/custom.types'
import { PAYMENT_TARGET_LABELS, PAYMENT_TARGET_TYPES, PAYMENT_STATUS, PAYMENT_STATUS_LABELS } from '@/types/custom.types'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import { CURRENT_YEAR, MONTH_OPTIONS } from '@/lib/constants'
import { AccountingPaymentBadge } from '@/components/accounting/monthly-settlement/AccountingPaymentBadge'
import type { SpreadsheetColumn, BatchSaveResult, RowError } from '@/lib/spreadsheet-utils'
import { useQuotationOptions } from '@/hooks/useQuotationOptions'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { getMergeLabel } from '@/lib/mergeLabel'

const PAGE_SIZE = 20

// 合併群組視覺標記
const MERGE_BORDER_COLORS: Record<string, string> = {
  'bg-chart-1/15': 'hsl(var(--chart-1))',
  'bg-chart-2/15': 'hsl(var(--chart-2))',
  'bg-chart-3/15': 'hsl(var(--chart-3))',
  'bg-chart-4/15': 'hsl(var(--chart-4))',
  'bg-chart-5/15': 'hsl(var(--chart-5))',
  'bg-destructive/15': 'hsl(var(--destructive))',
}
const MERGE_BADGE_COLORS: Record<string, string> = {
  'bg-chart-1/15': 'bg-[hsl(var(--chart-1))]/20 text-[hsl(var(--chart-1))]',
  'bg-chart-2/15': 'bg-[hsl(var(--chart-2))]/20 text-[hsl(var(--chart-2))]',
  'bg-chart-3/15': 'bg-[hsl(var(--chart-3))]/20 text-[hsl(var(--chart-3))]',
  'bg-chart-4/15': 'bg-[hsl(var(--chart-4))]/20 text-[hsl(var(--chart-4))]',
  'bg-chart-5/15': 'bg-[hsl(var(--chart-5))]/20 text-[hsl(var(--chart-5))]',
  'bg-destructive/15': 'bg-destructive/20 text-destructive',
}

type ExpenseWithMerge = AccountingExpense & {
  payment_requests: { merge_group_id: string | null; merge_color: string | null } | null
  quotation_items: { merge_group_id: string | null; merge_color: string | null; is_merge_leader: boolean | null } | null
}

type ExpenseSortKey = 'expense_month' | 'expense_type' | 'accounting_subject' | 'vendor_name' | 'total_amount' | 'project_name' | 'note' | 'payment_date' | 'payment_status'

function getExpenseSortValue(r: ExpenseWithMerge, key: ExpenseSortKey): string | number | null {
  switch (key) {
    case 'expense_month': return r.expense_month ?? null
    case 'expense_type': return r.expense_type ?? null
    case 'accounting_subject': return r.accounting_subject ?? null
    case 'vendor_name': return r.vendor_name ?? null
    case 'total_amount': return r.total_amount ?? 0
    case 'project_name': return r.project_name ?? null
    case 'note': return r.note ?? null
    case 'payment_date': return r.payment_date ?? null
    case 'payment_status': return r.payment_status ?? 'unpaid'
  }
}

const EXPENSE_TYPE_COLORS: Record<string, string> = {
  '勞務報酬': 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  '外包服務': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',
  '專案費用': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  '員工代墊': 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
  '營運費用': 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  '其他支出': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
  '沖帳免付': 'bg-muted text-muted-foreground',
}

const emptyForm = (): Partial<AccountingExpense> => ({
  year: CURRENT_YEAR,
  expense_month: '',
  expense_type: '勞務報酬',
  accounting_subject: '',
  amount: 0,
  tax_amount: 0,
  total_amount: 0,
  remittance_fee: 0,
  vendor_name: '',
  payment_date: null,
  invoice_date: null,
  invoice_number: '',
  project_name: '',
  note: '',
  payment_target_type: null,
  payment_status: 'unpaid' as const,
})

export default function AccountingExpensesPage() {
  const confirm = useConfirm()
  const { loading: permLoading, hasRole } = usePermission()
  const hasAccess = hasRole('Editor')
  const queryClient = useQueryClient()
  const { expenseTypeNames, accountingSubjectNames, defaultSubjectsMap } = useExpenseDefaults()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [targetFilter, setTargetFilter] = useState<string>('all')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccountingExpense | null>(null)
  const [form, setForm] = useState<Partial<AccountingExpense>>(emptyForm())
  const [currentPage, setCurrentPage] = useState(1)
  const [isSpreadsheetMode, setIsSpreadsheetMode] = useState(false)
  const { projectNameOptions, suggestionOptions: quotationSuggestionOptions, quotationMap } = useQuotationOptions()
  const { sortState, toggleSort } = useTableSort<ExpenseSortKey>()
  const { filters, setFilter } = useColumnFilters<Record<ExpenseSortKey, unknown>>()
  const getFilter = (key: ExpenseSortKey): FilterValue | null => filters.get(key as keyof Record<ExpenseSortKey, unknown>) ?? null
  const setFilterByKey = (key: ExpenseSortKey, value: FilterValue | null) => setFilter(key as keyof Record<ExpenseSortKey, unknown>, value)

  const spreadsheetColumns = useMemo<SpreadsheetColumn<AccountingExpense>[]>(() => [
    { key: 'expense_month', label: '支出月份', type: 'select',
      options: MONTH_OPTIONS.map(m => `${year}年${m}`), width: 'w-28' },
    { key: 'expense_type', label: '支出種類', type: 'select',
      options: [...expenseTypeNames], required: true, width: 'w-28' },
    { key: 'accounting_subject', label: '會計科目', type: 'select',
      options: ['', ...accountingSubjectNames], width: 'w-28' },
    { key: 'vendor_name', label: '廠商/對象', type: 'text', width: 'w-32' },
    { key: 'amount', label: '金額（未稅）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'tax_amount', label: '稅額', type: 'number', readOnly: true, width: 'w-24' },
    { key: 'total_amount', label: '實付金額', type: 'number', readOnly: true, width: 'w-28' },
    { key: 'project_name', label: '專案名稱', type: 'autocomplete', suggestionOptions: quotationSuggestionOptions, width: 'w-36' },
    { key: 'payment_date', label: '匯款日', type: 'date', width: 'w-28' },
    { key: 'invoice_number', label: '發票號碼', type: 'text', autoCalcTrigger: true, width: 'w-28' },
    { key: 'invoice_date', label: '發票日期', type: 'date', width: 'w-28' },
    { key: 'note', label: '備註', type: 'text', width: 'w-40' },
  ], [year, quotationSuggestionOptions, expenseTypeNames, accountingSubjectNames])

  const currentQueryKey = queryKeys.accountingExpenses(year)

  /** 失效進項快取 + 月結總覽 + 已確認請款清單快取 */
  const invalidateExpenseCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['accounting-expenses'] })
    queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.confirmedPayments] })
  }, [queryClient])

  const { data: records = [], isLoading: loading } = useQuery({
    queryKey: [...currentQueryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_expenses')
        .select('*, payment_requests(merge_group_id, merge_color), quotation_items!accounting_expenses_quotation_item_id_fkey(merge_group_id, merge_color, is_merge_leader, quotations(quote_number)), expense_claims!accounting_expenses_expense_claim_id_fkey(quotation_id, quotations:quotation_id(quote_number))')
        .eq('year', year)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ExpenseWithMerge[]
    },
    enabled: !permLoading && hasAccess,
  })

  const handleAutoCalcExpenses = (row: Partial<AccountingExpense>) => {
    const amount = row.amount || 0
    const hasInvoice = !!(row.invoice_number?.trim())
    const tax = hasInvoice ? Math.round(amount * 0.05 * 100) / 100 : 0
    const total = Math.round((amount + tax) * 100) / 100
    return { tax_amount: tax, total_amount: total } as Partial<AccountingExpense>
  }

  const handleBatchSave = async (
    toInsert: Partial<AccountingExpense>[],
    toUpdate: { id: string; data: Partial<AccountingExpense> }[],
    toDelete: string[]
  ): Promise<BatchSaveResult> => {
    const { data: { user } } = await supabase.auth.getUser()
    const errors: RowError[] = []
    let successCount = 0

    // 自動根據匯款日設定付款狀態
    const autoPaymentStatus = (row: Partial<AccountingExpense>) => ({
      ...row,
      payment_status: row.payment_date ? 'paid' : (row.payment_status || 'unpaid'),
      paid_at: row.payment_date && !row.paid_at ? new Date().toISOString() : row.paid_at,
    })

    if (toInsert.length > 0) {
      const payload = toInsert.map(r => autoPaymentStatus({ ...r, year, created_by: user?.id }))
      const { error } = await supabase.from('accounting_expenses').insert(payload)
      if (error) toInsert.forEach((_, i) => errors.push({ tempId: `insert-${i}`, message: error.message }))
      else successCount += toInsert.length
    }

    for (const { id, data } of toUpdate) {
      // 移除關聯物件與自動管理欄位，避免 PostgREST 400
      const { payment_requests: _pr, id: _id, created_at: _ca, updated_at: _ua, ...updateData } = data as Record<string, unknown>
      const patched = autoPaymentStatus(updateData as Partial<AccountingExpense>)
      const { error } = await supabase.from('accounting_expenses').update({ ...patched, created_by: user?.id }).eq('id', id)
      if (error) errors.push({ tempId: id, message: error.message })
      else successCount++
    }

    // 同步金額變更到 payment_confirmation_items（即時連動）
    for (const { id, data } of toUpdate) {
      if (data.total_amount === undefined) continue
      const original = records.find(r => r.id === id)
      if (!original) continue

      const fkColumn = original.quotation_item_id ? 'quotation_item_id'
        : original.expense_claim_id ? 'expense_claim_id'
        : original.payment_request_id ? 'payment_request_id'
        : null
      const fkValue = original.quotation_item_id || original.expense_claim_id || original.payment_request_id

      if (fkColumn && fkValue) {
        await supabase
          .from('payment_confirmation_items')
          .update({ amount_at_confirmation: data.total_amount })
          .eq(fkColumn, fkValue)
      }
    }

    if (toDelete.length > 0) {
      const { error } = await supabase.from('accounting_expenses').delete().in('id', toDelete)
      if (error) errors.push({ tempId: 'batch-delete', message: error.message })
      else successCount += toDelete.length
    }

    await invalidateExpenseCaches()
    return { successCount, errors }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = records.filter(r => {
      const matchesType = typeFilter === 'all' || r.expense_type === typeFilter
      const matchesTarget = targetFilter === 'all' || r.payment_target_type === targetFilter
      const matchesPaymentStatus = paymentStatusFilter === 'all' || r.payment_status === paymentStatusFilter
      // 從 join 的資料取得 quote_number
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ra = r as any
      const quoteNumber: string = ra.quotation_items?.quotations?.quote_number || ra.expense_claims?.quotations?.quote_number || ''
      const matchesSearch = !q ||
        (r.project_name || '').toLowerCase().includes(q) ||
        (r.vendor_name || '').toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.accounting_subject || '').toLowerCase().includes(q) ||
        quoteNumber.toLowerCase().includes(q)
      return matchesType && matchesTarget && matchesPaymentStatus && matchesSearch
    })
    // 欄位篩選
    if (filters.size > 0) {
      result = result.filter(r => {
        let pass = true
        filters.forEach((fv, key) => {
          if (!pass) return
          const val = getExpenseSortValue(r, String(key) as ExpenseSortKey)
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
    return result
  }, [search, typeFilter, targetFilter, paymentStatusFilter, records, filters])

  // 排序：有排序鍵時依欄位排序，否則合併群組排序
  const sorted = useMemo(() => {
    if (sortState.key && sortState.direction) {
      const dir = sortState.direction === 'asc' ? 1 : -1
      return [...filtered].sort((a, b) => {
        const aVal = getExpenseSortValue(a, sortState.key as ExpenseSortKey)
        const bVal = getExpenseSortValue(b, sortState.key as ExpenseSortKey)
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
        return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
      })
    }
    return [...filtered].sort((a, b) => {
      const aGroup = a.quotation_items?.merge_group_id || a.payment_requests?.merge_group_id
      const bGroup = b.quotation_items?.merge_group_id || b.payment_requests?.merge_group_id
      if (aGroup && bGroup && aGroup === bGroup) return 0
      if (aGroup && !bGroup) return -1
      if (!aGroup && bGroup) return 1
      return 0
    })
  }, [filtered, sortState])

  // 合併群組標籤映射（A, B, ..., Z, AA, AB...）
  const mergeGroupLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    let index = 0
    sorted.forEach(r => {
      const mgId = r.quotation_items?.merge_group_id || r.payment_requests?.merge_group_id
      if (mgId && !map.has(mgId)) {
        map.set(mgId, getMergeLabel(index))
        index++
      }
    })
    return map
  }, [sorted])

  const handleAmountChange = (value: number) => {
    const hasInvoice = !!(form.invoice_number?.trim())
    const tax = hasInvoice ? Math.round(value * 0.05 * 100) / 100 : 0
    const total = Math.round((value + tax) * 100) / 100
    setForm(f => ({ ...f, amount: value, tax_amount: tax, total_amount: total }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      // 白名單：只送可編輯的資料庫欄位
      const payload: Record<string, unknown> = {
        year: form.year,
        expense_month: form.expense_month,
        expense_type: form.expense_type,
        accounting_subject: form.accounting_subject,
        amount: form.amount,
        tax_amount: form.tax_amount,
        total_amount: form.total_amount,
        remittance_fee: form.remittance_fee,
        vendor_name: form.vendor_name,
        payment_target_type: form.payment_target_type,
        payment_date: form.payment_date || null,
        invoice_date: form.invoice_date || null,
        invoice_number: form.invoice_number,
        project_name: form.project_name,
        note: form.note,
        payment_status: form.payment_date ? 'paid' : (form.payment_status || 'unpaid'),
        paid_at: form.payment_date ? (form.paid_at || new Date().toISOString()) : null,
      }
      if (editing) {
        const { error } = await supabase.from('accounting_expenses').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('accounting_expenses').insert({ ...payload, created_by: user?.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidateExpenseCaches()
      toast.success(editing ? '已更新進項記錄' : '已新增進項記錄')
      setIsModalOpen(false)
    },
    onError: () => toast.error('儲存失敗，請重試'),
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ id, cascadeClaimId }: { id: string; cascadeClaimId?: string }) => {
      if (cascadeClaimId) {
        // 連動刪除：清除整條資料鏈
        // 1. 刪除 payment_confirmation_items
        const { data: pciItems } = await supabase
          .from('payment_confirmation_items')
          .select('id, payment_confirmation_id')
          .eq('expense_claim_id', cascadeClaimId)
        if (pciItems && pciItems.length > 0) {
          const confirmationIds = Array.from(new Set(pciItems.map(i => i.payment_confirmation_id)))
          await supabase.from('payment_confirmation_items').delete().eq('expense_claim_id', cascadeClaimId)
          // 更新或刪除空的 payment_confirmations
          for (const cid of confirmationIds) {
            const { data: remaining } = await supabase
              .from('payment_confirmation_items')
              .select('id')
              .eq('payment_confirmation_id', cid)
              .limit(1)
            if (!remaining || remaining.length === 0) {
              await supabase.from('accounting_expenses').delete().eq('payment_confirmation_id', cid)
              await supabase.from('payment_confirmations').delete().eq('id', cid)
            }
          }
        }
        // 2. 刪除 withholding_settlements
        await supabase.from('withholding_settlements').delete().eq('expense_claim_id', cascadeClaimId)
        // 3. 刪除 accounting_expenses（本筆）
        const { error: aeError } = await supabase.from('accounting_expenses').delete().eq('id', id)
        if (aeError) throw aeError
        // 4. 刪除 expense_claims
        const { error: ecError } = await supabase.from('expense_claims').delete().eq('id', cascadeClaimId)
        if (ecError) throw ecError
      } else {
        const { error } = await supabase.from('accounting_expenses').delete().eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: (_data, variables) => {
      invalidateExpenseCaches()
      if (variables.cascadeClaimId) {
        queryClient.invalidateQueries({ queryKey: ['expense-claims'] })
        queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
        queryClient.invalidateQueries({ queryKey: [...queryKeys.confirmedPayments] })
        queryClient.invalidateQueries({ queryKey: ['my-employee'] })
        queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
        toast.success('已刪除進項記錄及關聯的個人請款')
      } else {
        toast.success('已刪除')
      }
    },
    onError: () => toast.error('刪除失敗'),
  })

  const handleSave = async () => {
    if (!form.expense_type?.trim()) return toast.error('請選擇支出種類')
    saveMutation.mutate()
  }

  const handleDelete = async (id: string) => {
    const record = records.find(r => r.id === id)
    const hasClaimLink = !!record?.expense_claim_id

    const ok = await confirm({
      title: hasClaimLink ? '連動刪除確認' : '確認刪除',
      description: hasClaimLink
        ? '此記錄由個人報帳核准自動建立，刪除後將同時移除：\n• 對應的個人請款申請\n• 已確認請款清單中的項目\n確定要刪除嗎？'
        : '確定要刪除這筆記錄嗎？',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate({ id, cascadeClaimId: record?.expense_claim_id || undefined })
  }

  const saving = saveMutation.isPending

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  // 判斷進項記錄是否由系統自動建立（有來源 FK）
  const hasSourceLink = (r: AccountingExpense) =>
    !!(r.payment_request_id || r.expense_claim_id || r.quotation_item_id)

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} hasAccess={true} />
  if (!hasRole('Editor')) return <AccountingLoadingGuard loading={false} hasAccess={false} />

  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-muted-foreground/60 hover:text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <TrendingDown className="w-7 h-7 text-destructive" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">進項管理</h1>
          <p className="text-sm text-muted-foreground">各類支出記錄</p>
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
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">所有類型</option>
          {expenseTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">所有對象</option>
          {PAYMENT_TARGET_TYPES.map(t => <option key={t} value={t}>{PAYMENT_TARGET_LABELS[t]}</option>)}
        </select>
        <select
          value={paymentStatusFilter}
          onChange={(e) => setPaymentStatusFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">所有狀態</option>
          {PAYMENT_STATUS.map(s => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}
        </select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="搜尋編號、專案、廠商、發票號碼..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {!isSpreadsheetMode && (
          <button
            onClick={() => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true) }}
            className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增進項
          </button>
        )}
        <button
          onClick={() => setIsSpreadsheetMode(!isSpreadsheetMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSpreadsheetMode
              ? 'bg-destructive/10 text-destructive border border-destructive/30'
              : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          <Table2 className="w-4 h-4" />
          {isSpreadsheetMode ? '表格模式' : '試算表模式'}
        </button>
      </div>

      {isSpreadsheetMode ? (
        <SpreadsheetEditor<AccountingExpense>
          columns={spreadsheetColumns}
          initialRows={records}
          year={year}
          emptyRow={emptyForm}
          onAutoCalc={handleAutoCalcExpenses}
          onBatchSave={handleBatchSave}
          canDelete={(r) => !hasSourceLink(r)}
          accentColor="red"
          onClose={() => setIsSpreadsheetMode(false)}
        />
      ) : (
      <>
      {/* 統計 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
        {expenseTypeNames.map(t => {
          const sub = records.filter(r => r.expense_type === t)
          const total = sub.reduce((s, r) => s + (r.amount || 0), 0)
          return (
            <div
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              className={`rounded-xl p-3 text-center cursor-pointer transition-all border-2 ${
                typeFilter === t ? 'border-destructive/40' : 'border-transparent'
              } ${EXPENSE_TYPE_COLORS[t] || 'bg-muted text-muted-foreground'}`}
            >
              <p className="text-xs font-medium mb-1">{t}</p>
              <p className="text-sm font-bold">{fmt(total)}</p>
            </div>
          )
        })}
        <div className="rounded-xl p-3 text-center bg-chart-3/10">
          <p className="text-xs font-medium text-chart-3 mb-1">顯示筆數</p>
          <p className="text-sm font-bold text-chart-3">{filtered.length} 筆 / NT$ {fmt(totalAmount)}</p>
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
                    <SortableHeader<ExpenseSortKey> label="支出月份" sortKey="expense_month" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={MONTH_OPTIONS.map(m => `${year}年${m}`)} value={getFilter('expense_month')} onChange={v => setFilterByKey('expense_month', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="支出種類" sortKey="expense_type" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={expenseTypeNames} value={getFilter('expense_type')} onChange={v => setFilterByKey('expense_type', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="會計科目" sortKey="accounting_subject" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={accountingSubjectNames} value={getFilter('accounting_subject')} onChange={v => setFilterByKey('accounting_subject', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="廠商/對象" sortKey="vendor_name" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('vendor_name')} onChange={v => setFilterByKey('vendor_name', v)} />} />
                  </th>
                  <th className="text-right px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="實付金額" sortKey="total_amount" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('total_amount')} onChange={v => setFilterByKey('total_amount', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="專案名稱" sortKey="project_name" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('project_name')} onChange={v => setFilterByKey('project_name', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="備註" sortKey="note" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('note')} onChange={v => setFilterByKey('note', v)} />} />
                  </th>
                  <th className="text-left px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="匯款日" sortKey="payment_date" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="date" value={getFilter('payment_date')} onChange={v => setFilterByKey('payment_date', v)} />} />
                  </th>
                  <th className="text-center px-4 py-2">
                    <SortableHeader<ExpenseSortKey> label="付款狀態" sortKey="payment_status" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={['paid', 'unpaid']} value={getFilter('payment_status')} onChange={v => setFilterByKey('payment_status', v)} />} />
                  </th>
                  <th className="text-center px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState type="no-data" icon={TrendingDown} title="尚無支出記錄" description="新增第一筆支出記錄開始追蹤" /></td></tr>
                ) : sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => {
                  const mgId = r.quotation_items?.merge_group_id || r.payment_requests?.merge_group_id
                  const mgColor = r.quotation_items?.merge_color || r.payment_requests?.merge_color
                  const isLeader = r.quotation_items?.is_merge_leader === true
                  const mgBorderColor = mgId && mgColor ? MERGE_BORDER_COLORS[mgColor] || 'hsl(var(--info))' : undefined
                  const mgBadgeClass = mgId && mgColor ? MERGE_BADGE_COLORS[mgColor] || 'bg-info/15 text-info' : ''
                  const mgLabel = mgId ? mergeGroupLabelMap.get(mgId) : undefined
                  return (
                  <tr key={r.id} className="border-t border-border/50 hover:bg-accent" style={mgBorderColor ? { borderLeft: `4px solid ${mgBorderColor}` } : undefined}>
                    <td className="px-4 py-3 text-muted-foreground">{r.expense_month || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${EXPENSE_TYPE_COLORS[r.expense_type] || 'bg-muted text-muted-foreground'}`}>
                        {r.expense_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.accounting_subject || '-'}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {r.vendor_name || '-'}
                      {r.quotation_item_id && <span className="ml-1.5 text-[10px] text-info bg-info/10 px-1 py-0.5 rounded" title="由報價單核准自動建立">報價</span>}
                      {r.payment_request_id && !r.quotation_item_id && <span className="ml-1.5 text-[10px] text-chart-4 bg-chart-4/10 px-1 py-0.5 rounded" title="由專案請款核准自動建立">請款</span>}
                      {r.expense_claim_id && <span className="ml-1.5 text-[10px] text-warning bg-warning/10 px-1 py-0.5 rounded" title="由個人報帳核准自動建立">報帳</span>}
                      {mgId && mgLabel && <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${mgBadgeClass}`}>合併 {mgLabel}</span>}
                      {mgId && isLeader && <span className="ml-1 text-[10px] text-warning">★主項</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      NT$ {fmt(r.total_amount || 0)}
                      {(r.remittance_fee || 0) > 0 && (
                        <span className="block text-[10px] text-warning" title={`含匯費扣除 NT$${fmt(r.remittance_fee)}`}>
                          匯費 -{fmt(r.remittance_fee)}
                        </span>
                      )}
                      {(r.withholding_tax || 0) > 0 && (
                        <span className="block text-[10px] text-warning" title={`代扣所得稅 NT$${fmt(r.withholding_tax)}`}>
                          所得稅 -{fmt(r.withholding_tax)}
                        </span>
                      )}
                      {(r.withholding_nhi || 0) > 0 && (
                        <span className="block text-[10px] text-warning" title={`代扣二代健保 NT$${fmt(r.withholding_nhi)}`}>
                          健保 -{fmt(r.withholding_nhi)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-40 truncate">
                      {quotationMap.get(r.project_name || '') && <span className="text-xs font-mono text-muted-foreground/70 mr-1">{quotationMap.get(r.project_name || '')}</span>}
                      {r.project_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-40 truncate" title={r.note || ''}>{r.note || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.payment_date || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <AccountingPaymentBadge status={r.payment_status || 'unpaid'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setEditing(r); setForm({ ...r }); setIsModalOpen(true) }} className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {hasSourceLink(r) ? (
                          <span className="p-1.5 text-muted-foreground/30 cursor-not-allowed" title="此記錄由系統自動建立，如需移除請至已確認請款頁面進行駁回">
                            <Lock className="w-4 h-4" />
                          </span>
                        ) : (
                          <button onClick={() => handleDelete(r.id)} className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(sorted.length / PAGE_SIZE)}
          totalItems={sorted.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modal */}
      <AccountingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? '編輯進項記錄' : '新增進項記錄'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">年度</label>
                  <select value={form.year} onChange={(e) => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">支出月份</label>
                  <select value={form.expense_month || ''} onChange={(e) => setForm(f => ({ ...f, expense_month: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">-- 選擇月份 --</option>
                    {MONTH_OPTIONS.map(m => <option key={m} value={`${form.year}年${m}`}>{form.year}年{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">支出種類 *</label>
                  <select value={form.expense_type || ''} onChange={(e) => {
                    const newType = e.target.value as ExpenseType
                    const suggestedSubject = defaultSubjectsMap[newType] || ''
                    setForm(f => ({
                      ...f,
                      expense_type: newType,
                      accounting_subject: f.accounting_subject || suggestedSubject,
                    }))
                  }}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    {expenseTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">會計科目</label>
                  <select value={form.accounting_subject || ''} onChange={(e) => setForm(f => ({ ...f, accounting_subject: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">-- 選擇科目 --</option>
                    {accountingSubjectNames.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">廠商/付款對象</label>
                  <input type="text" value={form.vendor_name || ''} onChange={(e) => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="廠商或個人姓名" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">付款對象類型</label>
                  <select value={form.payment_target_type || ''} onChange={(e) => setForm(f => ({ ...f, payment_target_type: (e.target.value || null) as PaymentTargetType | null }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">-- 選擇 --</option>
                    {PAYMENT_TARGET_TYPES.map(t => <option key={t} value={t}>{PAYMENT_TARGET_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">金額（未稅）</label>
                  <input type="number" value={form.amount || ''} onChange={(e) => handleAmountChange(Number(e.target.value))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">稅額</label>
                  <input type="number" value={form.tax_amount || ''} onChange={(e) => setForm(f => ({ ...f, tax_amount: Number(e.target.value), total_amount: (f.amount || 0) + Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">總額（含稅）</label>
                  <input type="number" value={form.total_amount || ''} onChange={(e) => setForm(f => ({ ...f, total_amount: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">專案名稱</label>
                <SearchableSelect
                  value={form.project_name || null}
                  onChange={(val) => setForm(f => ({ ...f, project_name: val }))}
                  options={projectNameOptions}
                  placeholder="搜尋編號或專案名稱..."
                  clearable
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    匯款日
                    {form.payment_date
                      ? <span className="ml-2 text-green-500 text-[10px]">已付</span>
                      : <span className="ml-2 text-yellow-500 text-[10px]">未付</span>}
                  </label>
                  <input type="date" value={form.payment_date || ''} onChange={(e) => setForm(f => ({ ...f, payment_date: e.target.value || null }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">發票號碼</label>
                  <input type="text" value={form.invoice_number || ''} onChange={(e) => {
                    const invoiceNumber = e.target.value
                    const hasInvoice = !!(invoiceNumber.trim())
                    const amount = form.amount || 0
                    const tax = hasInvoice ? Math.round(amount * 0.05 * 100) / 100 : 0
                    const total = Math.round((amount + tax) * 100) / 100
                    setForm(f => ({ ...f, invoice_number: invoiceNumber, tax_amount: tax, total_amount: total }))
                  }}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如 AB-12345678" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">發票日期</label>
                <input type="date" value={form.invoice_date || ''} onChange={(e) => setForm(f => ({ ...f, invoice_date: e.target.value || null }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">備註</label>
                <textarea value={form.note || ''} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="選填備註" />
              </div>
        </div>
      </AccountingModal>
      </>
      )}
    </div>
  )
}
