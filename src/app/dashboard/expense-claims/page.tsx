'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import {
  Receipt, Search, Plus, Pencil, Trash2,
  Send, AlertCircle, CheckCircle, XCircle, FileEdit, Shield, Table2,
} from 'lucide-react'
import Pagination from '@/components/accounting/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useProjectNames } from '@/hooks/useProjectNames'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import SpreadsheetEditor from '@/components/accounting/SpreadsheetEditor'
import type { SpreadsheetColumn, BatchSaveResult, RowError } from '@/lib/spreadsheet-utils'
import ExpenseClaimModal from '@/components/expense-claims/ExpenseClaimModal'
import type { ExpenseClaimFormData } from '@/components/expense-claims/ExpenseClaimModal'
import type { ExpenseClaim } from '@/types/custom.types'
import {
  CLAIM_STATUS_LABELS, CLAIM_STATUS_COLORS,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  type ClaimStatus,
} from '@/types/custom.types'
import { CURRENT_YEAR, MONTH_OPTIONS } from '@/lib/constants'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const PAGE_SIZE = 20

export default function ExpenseClaimsPage() {
  const confirm = useConfirm()
  const { userRole, loading: permLoading, checkPageAccess } = usePermission()
  const hasAccess = checkPageAccess('expense_claims')
  const queryClient = useQueryClient()

  const [year, setYear] = useState(CURRENT_YEAR)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modal 狀態
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<ExpenseClaim | null>(null)
  const [isSpreadsheetMode, setIsSpreadsheetMode] = useState(false)

  // 專案名稱建議 + 支出種類/會計科目
  const { data: projectNames = [] } = useProjectNames()
  const { expenseTypeNames, accountingSubjectNames } = useExpenseDefaults()

  // 取得目前登入者的員工姓名（用於 vendor_name 預設值）
  const { data: myEmployeeName } = useQuery({
    queryKey: ['my-employee-name'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return ''
      const { data } = await supabase
        .from('employees').select('name').eq('user_id', user.id).maybeSingle()
      return data?.name ?? ''
    },
  })
  const employeeName = myEmployeeName ?? ''

  const currentQueryKey = queryKeys.expenseClaims(year)

  // 試算表欄位定義
  const spreadsheetColumns = useMemo<SpreadsheetColumn<ExpenseClaim>[]>(() => [
    { key: 'claim_month', label: '報帳月份', type: 'select',
      options: MONTH_OPTIONS.map(m => `${year}年${m}`), width: 'w-28' },
    { key: 'expense_type', label: '支出種類', type: 'select',
      options: [...expenseTypeNames], required: true, width: 'w-28' },
    { key: 'accounting_subject', label: '會計科目', type: 'select',
      options: ['', ...accountingSubjectNames], width: 'w-28' },
    { key: 'vendor_name', label: '廠商/對象', type: 'text', width: 'w-32' },
    { key: 'amount', label: '金額（未稅）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'tax_amount', label: '稅額', type: 'number', readOnly: true, width: 'w-24' },
    { key: 'total_amount', label: '總額（含稅）', type: 'number', readOnly: true, width: 'w-28' },
    { key: 'project_name', label: '專案名稱', type: 'autocomplete', suggestions: projectNames, width: 'w-36' },
    { key: 'invoice_number', label: '發票號碼', type: 'text', autoCalcTrigger: true, width: 'w-28' },
    { key: 'invoice_date', label: '發票日期', type: 'date', width: 'w-28' },
    { key: 'note', label: '備註', type: 'text', width: 'w-40' },
  ], [year, projectNames, expenseTypeNames, accountingSubjectNames])

  const emptyClaimRow = useCallback((): Partial<ExpenseClaim> => ({
    claim_month: '',
    expense_type: '員工代墊' as ExpenseClaim['expense_type'],
    accounting_subject: '',
    vendor_name: employeeName || '',
    amount: 0,
    tax_amount: 0,
    total_amount: 0,
    project_name: '',
    invoice_number: '',
    invoice_date: null,
    note: '',
    status: 'draft' as const,
  }), [employeeName])

  const handleAutoCalcClaims = useCallback(
    (row: Partial<ExpenseClaim>): Partial<ExpenseClaim> => {
      const amount = row.amount || 0
      const hasInvoice = !!(row.invoice_number?.trim())
      const tax = hasInvoice ? Math.round(amount * 0.05 * 100) / 100 : 0
      const total = Math.round((amount + tax) * 100) / 100
      return { tax_amount: tax, total_amount: total }
    },
    []
  )

  // 載入資料
  const { data: records = [], isLoading: loading } = useQuery({
    queryKey: [...currentQueryKey],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      let query = supabase
        .from('expense_claims')
        .select('*')
        .eq('year', year)
        .order('created_at', { ascending: false })

      // 非 Admin/Editor 只看自己的
      if (userRole !== 'Admin' && userRole !== 'Editor') {
        query = query.eq('created_by', user?.id)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as ExpenseClaim[]
    },
    enabled: !permLoading && hasAccess,
  })

  // 儲存（新增/編輯）
  const saveMutation = useMutation({
    mutationFn: async ({ data, id }: { data: ExpenseClaimFormData; id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('未登入，請重新登入')
      if (id) {
        const { error } = await supabase
          .from('expense_claims')
          .update({
            ...data,
            vendor_name: data.vendor_name?.trim() || employeeName || undefined,
          })
          .eq('id', id)
        if (error) throw error
      } else {
        const payload = {
          ...data,
          vendor_name: data.vendor_name?.trim() || employeeName || undefined,
          year,
          status: 'draft' as const,
          created_by: user?.id,
          submitted_by: user?.id,
        }
        const { error } = await supabase.from('expense_claims').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
      queryClient.invalidateQueries({ queryKey: ['my-employee'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
      toast.success(editingClaim ? '已更新報帳項目' : '已新增報帳項目')
      setIsModalOpen(false)
      setEditingClaim(null)
    },
    onError: (err: Error) => toast.error(`儲存失敗：${err.message}`),
  })

  // 刪除
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('expense_claims')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
      queryClient.invalidateQueries({ queryKey: ['my-employee'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
      toast.success('已刪除報帳項目')
    },
    onError: (err: Error) => toast.error(`刪除失敗：${err.message}`),
  })

  // 送出審核
  const submitMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('未登入，請重新登入')
      const { error } = await supabase
        .from('expense_claims')
        .update({
          status: 'submitted',
          submitted_by: user?.id,
          submitted_at: new Date().toISOString(),
        })
        .in('id', ids)
        .in('status', ['draft', 'rejected'])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.paymentRequests] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
      queryClient.invalidateQueries({ queryKey: ['my-employee'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
      setSelectedIds(new Set())
      toast.success('已送出審核')
    },
    onError: () => toast.error('送出失敗，請重試'),
  })

  // 試算表批次儲存
  const handleBatchSave = useCallback(async (
    toInsert: Partial<ExpenseClaim>[],
    toUpdate: { id: string; data: Partial<ExpenseClaim> }[],
    toDelete: string[]
  ): Promise<BatchSaveResult> => {
    const { data: { user } } = await supabase.auth.getUser()
    const errors: RowError[] = []
    let successCount = 0

    if (toInsert.length > 0) {
      const payload = toInsert.map(r => ({
        ...r,
        vendor_name: (r.vendor_name as string)?.trim() || employeeName || undefined,
        year,
        status: 'draft' as const,
        created_by: user?.id,
        submitted_by: user?.id,
      }))
      const { error } = await supabase.from('expense_claims').insert(payload)
      if (error) toInsert.forEach((_, i) => errors.push({ tempId: `insert-${i}`, message: error.message }))
      else successCount += toInsert.length
    }

    for (const { id, data } of toUpdate) {
      const { error } = await supabase
        .from('expense_claims')
        .update({
          ...data,
          vendor_name: (data.vendor_name as string)?.trim() || employeeName || undefined,
        })
        .eq('id', id)
        .eq('status', 'draft')
      if (error) errors.push({ tempId: id, message: error.message })
      else successCount++
    }

    if (toDelete.length > 0) {
      const { error } = await supabase
        .from('expense_claims')
        .delete()
        .in('id', toDelete)
        .eq('status', 'draft')
      if (error) errors.push({ tempId: 'batch-delete', message: error.message })
      else successCount += toDelete.length
    }

    queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
    queryClient.invalidateQueries({ queryKey: ['my-employee'] })
    queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
    return { successCount, errors }
  }, [year, employeeName, queryClient, currentQueryKey])

  // 篩選
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter
      const matchesSearch = !q ||
        (r.project_name || '').toLowerCase().includes(q) ||
        (r.vendor_name || '').toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.accounting_subject || '').toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [search, statusFilter, records])

  // 可送出的項目（draft 或 rejected）
  const submittableItems = useMemo(() =>
    filtered.filter(r => r.status === 'draft' || r.status === 'rejected'),
    [filtered]
  )

  const handleOpenModal = useCallback((claim?: ExpenseClaim) => {
    setEditingClaim(claim || null)
    setIsModalOpen(true)
  }, [])

  const handleSave = useCallback(async (data: ExpenseClaimFormData, id?: string) => {
    await saveMutation.mutateAsync({ data, id })
  }, [saveMutation])

  const handleDelete = useCallback(async (id: string) => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除此報帳項目嗎？',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }, [deleteMutation, confirm])

  const handleSubmitSelected = async () => {
    const ids = Array.from(selectedIds).filter(id => submittableItems.some(item => item.id === id))
    if (ids.length === 0) {
      toast.error('請選擇要送出的項目')
      return
    }
    const ok = await confirm({
      title: '確認送出',
      description: `確定要送出 ${ids.length} 筆報帳申請進行審核嗎？`,
      confirmLabel: '送出',
    })
    if (!ok) return
    submitMutation.mutate(ids)
  }

  const handleSubmitAll = async () => {
    const ids = submittableItems.map(item => item.id)
    if (ids.length === 0) {
      toast.error('沒有可送出的項目')
      return
    }
    const ok = await confirm({
      title: '確認送出',
      description: `確定要送出全部 ${ids.length} 筆報帳申請進行審核嗎？`,
      confirmLabel: '全部送出',
    })
    if (!ok) return
    submitMutation.mutate(ids)
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  if (permLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Shield className="w-16 h-16 mb-4 text-muted-foreground/50" />
        <p className="text-lg font-medium">無法存取此頁面</p>
      </div>
    )
  }

  // 統計
  const draftCount = records.filter(r => r.status === 'draft').length
  const submittedCount = records.filter(r => r.status === 'submitted').length
  const approvedCount = records.filter(r => r.status === 'approved').length
  const rejectedCount = records.filter(r => r.status === 'rejected').length
  const totalAmount = filtered.reduce((s, r) => s + (r.total_amount || 0), 0)

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Receipt className="w-7 h-7 text-info" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">個人請款申請</h1>
          <p className="text-sm text-muted-foreground">員工報帳申請，送出後進入請款審核</p>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { label: '草稿', count: draftCount, status: 'draft' as ClaimStatus, icon: FileEdit },
          { label: '待審核', count: submittedCount, status: 'submitted' as ClaimStatus, icon: Send },
          { label: '已核准', count: approvedCount, status: 'approved' as ClaimStatus, icon: CheckCircle },
          { label: '已駁回', count: rejectedCount, status: 'rejected' as ClaimStatus, icon: XCircle },
        ]).map(({ label, count, status, icon: Icon }) => (
          <div
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            className={`rounded-xl p-3 cursor-pointer transition-all border-2 ${
              statusFilter === status ? 'border-info/40' : 'border-transparent'
            } ${CLAIM_STATUS_COLORS[status]}`}
          >
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4" />
              <p className="text-xs font-medium">{label}</p>
            </div>
            <p className="text-lg font-bold mt-1">{count}</p>
          </div>
        ))}
        <div className="rounded-xl p-3 bg-info/10">
          <p className="text-xs font-medium text-info">顯示總額</p>
          <p className="text-lg font-bold text-info mt-1">NT$ {fmt(totalAmount)}</p>
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">所有狀態</option>
          <option value="draft">草稿</option>
          <option value="submitted">已送出</option>
          <option value="approved">已核准</option>
          <option value="rejected">已駁回</option>
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
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增報帳
          </button>
        )}
        <button
          onClick={() => setIsSpreadsheetMode(!isSpreadsheetMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSpreadsheetMode
              ? 'bg-info/10 text-info border border-info/30'
              : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          <Table2 className="w-4 h-4" />
          {isSpreadsheetMode ? '表格模式' : '試算表模式'}
        </button>
      </div>

      {isSpreadsheetMode ? (
        <SpreadsheetEditor<ExpenseClaim>
          columns={spreadsheetColumns}
          initialRows={records.filter(r => r.status === 'draft')}
          year={year}
          emptyRow={emptyClaimRow}
          onAutoCalc={handleAutoCalcClaims}
          onBatchSave={handleBatchSave}
          accentColor="blue"
          onClose={() => setIsSpreadsheetMode(false)}
        />
      ) : (
      <>
      {/* 批量送出操作列 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-info/10 border border-info/30 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-info">
            已選擇 {selectedIds.size} 筆
          </span>
          <div className="flex-1" />
          <button
            onClick={handleSubmitSelected}
            disabled={submitMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-info text-white rounded-lg text-sm font-medium hover:bg-info/90 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            送出審核
          </button>
        </div>
      )}

      {/* 全部送出提示 */}
      {submittableItems.length > 0 && selectedIds.size === 0 && (
        <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-info" />
          <span className="text-sm text-muted-foreground">
            有 {submittableItems.length} 筆可送出的報帳項目
          </span>
          <div className="flex-1" />
          <button
            onClick={handleSubmitAll}
            disabled={submitMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-info text-white rounded-lg text-sm font-medium hover:bg-info/90 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? '送出中...' : `全部送出審核 (${submittableItems.length})`}
          </button>
        </div>
      )}

      {/* 表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs">
                <th className="text-center px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === submittableItems.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(submittableItems.map(i => i.id)))
                      } else {
                        setSelectedIds(new Set())
                      }
                    }}
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                <th className="text-left px-4 py-3">狀態</th>
                <th className="text-left px-4 py-3">報帳月份</th>
                <th className="text-left px-4 py-3">支出種類</th>
                <th className="text-left px-4 py-3">廠商/對象</th>
                <th className="text-right px-4 py-3">金額</th>
                <th className="text-right px-4 py-3">稅額</th>
                <th className="text-right px-4 py-3">總額</th>
                <th className="text-left px-4 py-3">專案名稱</th>
                <th className="text-left px-4 py-3">發票號碼</th>
                <th className="text-center px-3 py-3 w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11}>
                  <EmptyState
                    type="no-data"
                    icon={Receipt}
                    title="尚無報帳記錄"
                    description="點擊「新增報帳」開始新增報帳項目"
                  />
                </td></tr>
              ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => {
                const canSelect = r.status === 'draft' || r.status === 'rejected'
                const canEdit = r.status === 'draft' || r.status === 'rejected'
                const canDelete = r.status === 'draft' || r.status === 'rejected'
                return (
                  <tr key={r.id} className="border-t border-border/50 hover:bg-accent">
                    <td className="text-center px-3 py-3">
                      {canSelect && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelection(r.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CLAIM_STATUS_COLORS[r.status]}`}>
                          {CLAIM_STATUS_LABELS[r.status]}
                        </span>
                        {r.status === 'approved' && r.payment_status && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_STATUS_COLORS[r.payment_status]}`}>
                            {PAYMENT_STATUS_LABELS[r.payment_status]}
                          </span>
                        )}
                      </div>
                      {r.rejection_reason && (
                        <p className="text-[10px] text-destructive mt-0.5 max-w-24 truncate" title={r.rejection_reason}>
                          {r.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.claim_month || '-'}</td>
                    <td className="px-4 py-3">{r.expense_type}</td>
                    <td className="px-4 py-3 font-medium">{r.vendor_name || '-'}</td>
                    <td className="px-4 py-3 text-right">NT$ {fmt(r.amount || 0)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.tax_amount || 0)}</td>
                    <td className="px-4 py-3 text-right font-medium">NT$ {fmt(r.total_amount || 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-32">
                      <div className="truncate">{r.project_name || '-'}</div>
                      {r.note && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate" title={r.note}>
                          {r.note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.invoice_number || '-'}</td>
                    <td className="px-3 py-3">
                      {(canEdit || canDelete) && (
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenModal(r)}
                              className="p-1.5 text-muted-foreground hover:text-info hover:bg-info/10 rounded-md transition-colors"
                              title="編輯"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                              title="刪除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filtered.length / PAGE_SIZE)}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modal */}
      <ExpenseClaimModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingClaim(null) }}
        onSave={handleSave}
        claim={editingClaim}
        year={year}
        projectNames={projectNames}
      />
      </>
      )}
    </div>
  )
}
