'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { Plus, Search, TrendingDown, Pencil, Trash2, ChevronLeft, Table2 } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import SpreadsheetEditor from '@/components/accounting/SpreadsheetEditor'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'
import type { AccountingExpense, PaymentTargetType, ExpenseType, PaymentStatus } from '@/types/custom.types'
import { PAYMENT_TARGET_LABELS, PAYMENT_TARGET_TYPES, PAYMENT_STATUS, PAYMENT_STATUS_LABELS } from '@/types/custom.types'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import { CURRENT_YEAR, MONTH_OPTIONS } from '@/lib/constants'
import { PaymentStatusBadge } from '@/components/accounting/monthly-settlement/PaymentStatusBadge'
import type { SpreadsheetColumn, BatchSaveResult, RowError } from '@/lib/spreadsheet-utils'
import { useProjectNames } from '@/hooks/useProjectNames'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useConfirm } from '@/components/ui/ConfirmDialog'

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
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
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
  const { data: projectNames = [] } = useProjectNames()
  const projectNameOptions = useMemo(
    () => projectNames.map(name => ({ label: name, value: name })),
    [projectNames]
  )

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
    { key: 'project_name', label: '專案名稱', type: 'autocomplete', suggestions: projectNames, width: 'w-36' },
    { key: 'payment_date', label: '匯款日', type: 'date', width: 'w-28' },
    { key: 'invoice_number', label: '發票號碼', type: 'text', autoCalcTrigger: true, width: 'w-28' },
    { key: 'invoice_date', label: '發票日期', type: 'date', width: 'w-28' },
    { key: 'note', label: '備註', type: 'text', width: 'w-40' },
  ], [year, projectNames, expenseTypeNames, accountingSubjectNames])

  const currentQueryKey = queryKeys.accountingExpenses(year)

  /** 失效進項快取 + 月結總覽快取 */
  const invalidateExpenseCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
    // 月結總覽也查 accounting_expenses，需同步失效
    queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
  }, [queryClient, currentQueryKey])

  const { data: records = [], isLoading: loading } = useQuery({
    queryKey: [...currentQueryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_expenses')
        .select('*, payment_requests(merge_group_id, merge_color)')
        .eq('year', year)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ExpenseWithMerge[]
    },
    enabled: !permLoading && isAdmin,
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

    if (toInsert.length > 0) {
      const payload = toInsert.map(r => ({ ...r, year, created_by: user?.id }))
      const { error } = await supabase.from('accounting_expenses').insert(payload)
      if (error) toInsert.forEach((_, i) => errors.push({ tempId: `insert-${i}`, message: error.message }))
      else successCount += toInsert.length
    }

    for (const { id, data } of toUpdate) {
      const { error } = await supabase.from('accounting_expenses').update({ ...data, created_by: user?.id }).eq('id', id)
      if (error) errors.push({ tempId: id, message: error.message })
      else successCount++
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
    return records.filter(r => {
      const matchesType = typeFilter === 'all' || r.expense_type === typeFilter
      const matchesTarget = targetFilter === 'all' || r.payment_target_type === targetFilter
      const matchesPaymentStatus = paymentStatusFilter === 'all' || r.payment_status === paymentStatusFilter
      const matchesSearch = !q ||
        (r.project_name || '').toLowerCase().includes(q) ||
        (r.vendor_name || '').toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.accounting_subject || '').toLowerCase().includes(q)
      return matchesType && matchesTarget && matchesPaymentStatus && matchesSearch
    })
  }, [search, typeFilter, targetFilter, paymentStatusFilter, records])

  // 合併群組標籤映射（A, B, C...）
  const mergeGroupLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    let index = 0
    filtered.forEach(r => {
      const mgId = r.payment_requests?.merge_group_id
      if (mgId && !map.has(mgId)) {
        map.set(mgId, String.fromCharCode(65 + index))
        index++
      }
    })
    return map
  }, [filtered])

  const handleAmountChange = (value: number) => {
    const hasInvoice = !!(form.invoice_number?.trim())
    const tax = hasInvoice ? Math.round(value * 0.05 * 100) / 100 : 0
    const total = Math.round((value + tax) * 100) / 100
    setForm(f => ({ ...f, amount: value, tax_amount: tax, total_amount: total }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, created_by: user?.id }
      if (editing) {
        const { error } = await supabase.from('accounting_expenses').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('accounting_expenses').insert(payload)
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

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)
  const totalWithTax = filtered.reduce((s, r) => s + (r.total_amount || 0), 0)

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
            placeholder="搜尋專案、廠商、發票號碼..."
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
                  <th className="text-left px-4 py-3">支出月份</th>
                  <th className="text-left px-4 py-3">支出種類</th>
                  <th className="text-left px-4 py-3">會計科目</th>
                  <th className="text-left px-4 py-3">廠商/對象</th>
                  <th className="text-right px-4 py-3">實付金額</th>
                  <th className="text-left px-4 py-3">專案名稱</th>
                  <th className="text-left px-4 py-3">備註</th>
                  <th className="text-left px-4 py-3">匯款日</th>
                  <th className="text-center px-4 py-3">付款狀態</th>
                  <th className="text-center px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState type="no-data" icon={TrendingDown} title="尚無支出記錄" description="新增第一筆支出記錄開始追蹤" /></td></tr>
                ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => {
                  const mgId = r.payment_requests?.merge_group_id
                  const mgColor = r.payment_requests?.merge_color
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
                      {r.payment_request_id && <span className="ml-1.5 text-[10px] text-destructive bg-destructive/10 px-1 py-0.5 rounded" title="由請款核准自動建立">自動</span>}
                      {mgId && mgLabel && <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${mgBadgeClass}`}>合併 {mgLabel}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      NT$ {fmt(r.total_amount || 0)}
                      {(r.remittance_fee || 0) > 0 && (
                        <span className="block text-[10px] text-warning" title={`含匯費扣除 NT$${fmt(r.remittance_fee)}`}>
                          匯費 -{fmt(r.remittance_fee)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-32 truncate">{r.project_name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-40 truncate" title={r.note || ''}>{r.note || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.payment_date || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <PaymentStatusBadge status={r.payment_status || 'unpaid'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setEditing(r); setForm({ ...r }); setIsModalOpen(true) }} className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
          totalPages={Math.ceil(filtered.length / PAGE_SIZE)}
          totalItems={filtered.length}
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
                  placeholder="搜尋專案名稱..."
                  clearable
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">匯款日</label>
                  <input type="date" value={form.payment_date || ''} onChange={(e) => setForm(f => ({ ...f, payment_date: e.target.value }))}
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
                <input type="date" value={form.invoice_date || ''} onChange={(e) => setForm(f => ({ ...f, invoice_date: e.target.value }))}
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
