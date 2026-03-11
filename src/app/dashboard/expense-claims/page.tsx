'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import {
  Receipt, Search, Plus,
  Send, AlertCircle, CheckCircle, XCircle, FileEdit, Shield,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
// useProjectNames removed — ExpenseClaimModal now uses useQuotationOptions internally
import ExpenseClaimModal from '@/components/expense-claims/ExpenseClaimModal'
import type { ExpenseClaimFormData } from '@/components/expense-claims/ExpenseClaimModal'
import { ExpenseClaimGroups } from '@/components/expense-claims/ExpenseClaimGroups'
import type { ExpenseClaim } from '@/types/custom.types'
import {
  CLAIM_STATUS_COLORS,
  type ClaimStatus,
} from '@/types/custom.types'
import { CURRENT_YEAR } from '@/lib/constants'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function ExpenseClaimsPage() {
  const confirm = useConfirm()
  const { userRole, loading: permLoading, checkPageAccess, hasRole } = usePermission()
  const hasAccess = checkPageAccess('expense_claims')
  const isEditor = hasRole('Editor')
  const queryClient = useQueryClient()

  const [year, setYear] = useState(CURRENT_YEAR)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Modal 狀態
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<ExpenseClaim | null>(null)

  // projectNames removed — ExpenseClaimModal now uses useQuotationOptions internally

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

  // 載入報帳資料
  const { data: records = [], isLoading: loading } = useQuery({
    queryKey: [...currentQueryKey],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      let query = supabase
        .from('expense_claims')
        .select('*, quotations:quotation_id(quote_number)')
        .eq('year', year)
        .order('created_at', { ascending: false })

      if (userRole !== 'Admin' && userRole !== 'Editor') {
        query = query.eq('created_by', user?.id)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as (ExpenseClaim & { quotations?: { quote_number: string | null } | null })[]
    },
    enabled: !permLoading && hasAccess,
  })

  // 員工姓名映射（Admin/Editor 用，顯示群組標題中的申請人）
  const { data: nameMap = new Map<string, string>() } = useQuery({
    queryKey: ['employee-names-for-claims', year, records.length],
    queryFn: async () => {
      const creatorIds = new Set<string>()
      records.forEach(r => { if (r.created_by) creatorIds.add(r.created_by) })
      if (creatorIds.size === 0) return new Map<string, string>()

      const { data: employees } = await supabase
        .from('employees')
        .select('user_id, name')
        .in('user_id', Array.from(creatorIds))

      return new Map((employees || []).map(e => [e.user_id!, e.name]))
    },
    enabled: isEditor && records.length > 0,
  })

  // 快取失效（共用）
  const invalidateCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
    queryClient.invalidateQueries({ queryKey: ['my-employee'] })
    queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
  }, [queryClient, currentQueryKey])

  // ==================== Mutations ====================

  // 儲存（新增/編輯）
  const saveMutation = useMutation({
    mutationFn: async ({ data, id }: { data: ExpenseClaimFormData; id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('未登入，請重新登入')
      // 清理空字串 → null（避免 PostgreSQL date/uuid 型別錯誤）
      const cleanData = {
        ...data,
        vendor_name: data.vendor_name?.trim() || employeeName || null,
        invoice_date: data.invoice_date || null,
        quotation_id: data.quotation_id || null,
        claim_month: data.claim_month || null,
        withholding_month: data.withholding_month || null,
        invoice_number: data.invoice_number || null,
        note: data.note || null,
      }
      if (id) {
        const { error } = await supabase
          .from('expense_claims')
          .update(cleanData)
          .eq('id', id)
        if (error) throw error
      } else {
        const payload = {
          ...cleanData,
          year,
          status: 'draft' as const,
          created_by: user.id,
          submitted_by: user.id,
        }
        const { error } = await supabase.from('expense_claims').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidateCaches()
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
      invalidateCaches()
      toast.success('已刪除報帳項目')
    },
    onError: (err: Error) => toast.error(`刪除失敗：${err.message}`),
  })

  // 送出審核（草稿 → submitted）
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())
  const submitMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      setActionLoading(prev => { const next = new Set(Array.from(prev)); ids.forEach(id => next.add(id)); return next })
      const { error } = await supabase
        .from('expense_claims')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: (_data, ids) => {
      invalidateCaches()
      toast.success(`已送出 ${ids.length} 筆報帳項目`)
      setActionLoading(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next })
    },
    onError: (err: Error, ids) => {
      toast.error(`送出失敗：${err.message}`)
      setActionLoading(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next })
    },
  })

  // 核准（submitted → approved，呼叫 RPC 同時建立確認清單 + 進項帳務）
  const approveMutation = useMutation({
    mutationFn: async (claimId: string) => {
      setActionLoading(prev => { const next = new Set(Array.from(prev)); next.add(claimId); return next })
      const { error } = await supabase.rpc('approve_expense_claim', { claim_id: claimId })
      if (error) throw error
    },
    onSuccess: (_data, claimId) => {
      invalidateCaches()
      queryClient.invalidateQueries({ queryKey: [...queryKeys.confirmedPayments] })
      queryClient.invalidateQueries({ queryKey: ['accounting-expenses'] })
      toast.success('已核准，自動併入已確認請款清單')
      setActionLoading(prev => { const next = new Set(prev); next.delete(claimId); return next })
    },
    onError: (err: Error, claimId) => {
      toast.error(`核准失敗：${err.message}`)
      setActionLoading(prev => { const next = new Set(prev); next.delete(claimId); return next })
    },
  })

  // 駁回
  const rejectMutation = useMutation({
    mutationFn: async ({ claimId, reason }: { claimId: string; reason: string }) => {
      setActionLoading(prev => { const next = new Set(Array.from(prev)); next.add(claimId); return next })
      const { error } = await supabase.rpc('reject_expense_claim', {
        claim_id: claimId,
        rejector_id: null,
        reason,
      })
      if (error) throw error
    },
    onSuccess: (_data, { claimId }) => {
      invalidateCaches()
      toast.success('已駁回報帳項目')
      setActionLoading(prev => { const next = new Set(prev); next.delete(claimId); return next })
    },
    onError: (err: Error, { claimId }) => {
      toast.error(`駁回失敗：${err.message}`)
      setActionLoading(prev => { const next = new Set(prev); next.delete(claimId); return next })
    },
  })

  // ==================== Handlers ====================

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

  const handleSubmit = useCallback(async (ids: string[]) => {
    const ok = await confirm({
      title: '送出審核',
      description: `確定要送出 ${ids.length} 筆報帳項目嗎？送出後將無法編輯。`,
      confirmLabel: '送出',
    })
    if (!ok) return
    submitMutation.mutate(ids)
  }, [submitMutation, confirm])

  const handleApprove = useCallback(async (claimId: string) => {
    const ok = await confirm({
      title: '核准報帳',
      description: '核准後將自動建立已確認請款清單項目及進項帳務記錄。',
      confirmLabel: '核准',
    })
    if (!ok) return
    approveMutation.mutate(claimId)
  }, [approveMutation, confirm])

  const handleReject = useCallback((claimId: string, reason: string) => {
    rejectMutation.mutate({ claimId, reason })
  }, [rejectMutation])

  // ==================== Filtering ====================

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter
      const matchesSearch = !q ||
        (r.project_name || '').toLowerCase().includes(q) ||
        (r.vendor_name || '').toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.accounting_subject || '').toLowerCase().includes(q) ||
        (r.quotations?.quote_number || '').toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [search, statusFilter, records])

  // ==================== Render ====================

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  if (permLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
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
          <p className="text-sm text-muted-foreground">
            建立與編輯報帳項目，送出審核請至請款工作台操作
          </p>
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
            placeholder="搜尋編號、專案、廠商、發票號碼..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增報帳
        </button>
      </div>

      {/* 工作台提示 */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 text-info" />
        <span className="text-sm text-muted-foreground">
          送出審核、合併請款等操作請至請款工作台進行
        </span>
        <div className="flex-1" />
        <a
          href="/dashboard/payment-workbench"
          className="flex items-center gap-2 px-4 py-2 bg-info text-white rounded-lg text-sm font-medium hover:bg-info/90 transition-colors"
        >
          前往請款工作台
        </a>
      </div>

      {/* 手風琴群組 */}
      <ExpenseClaimGroups
        claims={filtered}
        isEditor={isEditor}
        nameMap={nameMap}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        onApprove={isEditor ? handleApprove : undefined}
        onReject={isEditor ? handleReject : undefined}
        actionLoading={actionLoading}
      />

      {/* Modal */}
      <ExpenseClaimModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingClaim(null) }}
        onSave={handleSave}
        claim={editingClaim}
        year={year}
      />
    </div>
  )
}
