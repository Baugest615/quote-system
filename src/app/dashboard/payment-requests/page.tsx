'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Link as LinkIcon, Eye, Download, AlertCircle, Shield, Receipt, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import supabase from '@/lib/supabase/client'

// Permissions
import { usePermission } from '@/lib/permissions'

// Hooks
import { usePaymentData } from '@/hooks/payments/usePaymentData'
import { queryKeys } from '@/lib/queryKeys'
import { usePaymentFilters } from '@/hooks/payments/usePaymentFilters'
import { usePaymentActions } from '@/hooks/payments/usePaymentActions'

// Components
import { LoadingState } from '@/components/payments/shared'
import { EmptyState } from '@/components/ui/EmptyState'
import { RequestItemRow, ApprovalControls } from '@/components/payments/requests'
import type { PaymentRequestItem } from '@/lib/payments/types'
import type { ExpenseClaim } from '@/types/custom.types'
import { CLAIM_STATUS_LABELS, CLAIM_STATUS_COLORS } from '@/types/custom.types'
import { ModuleErrorBoundary } from '@/components/ModuleErrorBoundary'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type TabType = 'project' | 'personal'

// --- 檔案檢視 Modal ---
const FileViewerModal = ({ isOpen, onClose, request }: {
  isOpen: boolean
  onClose: () => void
  request: PaymentRequestItem | null
}) => {
  const [downloadError, setDownloadError] = useState<string | null>(null)
  if (!request) return null

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleFileAction = async (path: string, download = false) => {
    setDownloadError(null)
    try {
      const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 60)
      if (error) throw new Error(`無法生成安全連結: ${error.message}`)
      if (!data?.signedUrl) throw new Error("無法取得檔案連結")
      if (download) {
        const link = document.createElement('a')
        link.href = data.signedUrl
        link.download = path.split('/').pop() || 'download'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        window.open(data.signedUrl, '_blank')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setDownloadError(message)
      toast.error(`檔案操作失敗: ${message}`)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`檢視附件 - ${request.quotations?.project_name || '未命名專案'}`}>
      <div className="space-y-4">
        {downloadError && <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">{downloadError}</div>}
        {request.attachments && request.attachments.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {request.attachments.map((file, index) => (
              <div key={index} className="bg-secondary p-3 rounded-lg border flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate text-sm" title={file.name}>
                    <LinkIcon className="h-3 w-3 inline-block mr-2" />{file.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {file.size ? `${formatFileSize(file.size)} • ` : ''}{new Date(file.uploadedAt).toLocaleString('zh-TW')}
                  </p>
                </div>
                <div className="flex space-x-2 ml-3">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleFileAction(file.path)} title="預覽">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleFileAction(file.path, true)} title="下載">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="mx-auto h-8 w-8 mb-2" />
            <p>沒有可檢視的附件</p>
          </div>
        )}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function PaymentRequestsPage() {
  const confirm = useConfirm()
  const { loading: permLoading, checkPageAccess } = usePermission()
  const hasAccess = checkPageAccess('payment_requests')

  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('project')

  // ==========================================
  // 專案請款 Tab
  // ==========================================
  const fetchPaymentRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_requests')
      .select(`
        *,
        quotation_items:quotation_item_id (
          *,
          quotations:quotation_id (
            project_name,
            client_id,
            clients:client_id (name)
          ),
          kols:kol_id (
            id,
            name,
            real_name,
            bank_info
          )
        )
      `)
      .eq('verification_status', 'pending')
      .not('request_date', 'is', null)
      .order('request_date', { ascending: true })

    if (error) throw error

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((req: Record<string, any>) => {
      const qItem = req.quotation_items;
      const quotation = qItem?.quotations;
      const client = quotation?.clients;
      const kol = qItem?.kols;

      return {
        ...req,
        id: req.quotation_item_id,
        payment_request_id: req.id,
        quotations: {
          project_name: quotation?.project_name || '',
          client_id: quotation?.client_id,
          clients: { name: client?.name || '' }
        },
        kols: {
          id: kol?.id || '',
          name: kol?.name || '',
          real_name: kol?.real_name,
          bank_info: kol?.bank_info
        },
        service: qItem?.service_item || '',
        price: 0,
        quantity: 1,
        cost: req.cost_amount,
        remark: null,
        created_at: req.request_date,
        expense_type: req.expense_type || null,
        accounting_subject: req.accounting_subject || null,
        attachments: req.attachment_file_path ? JSON.parse(req.attachment_file_path) : [],
        parsed_attachments: req.attachment_file_path ? JSON.parse(req.attachment_file_path) : []
      } as PaymentRequestItem
    })
  }, [])

  const paymentDataOptions = useMemo(() => ({
    autoRefresh: false,
    queryKey: [...queryKeys.paymentRequests],
  }), [])

  const {
    data: items,
    setData,
    loading,
    refetch: refresh
  } = usePaymentData<PaymentRequestItem>(
    fetchPaymentRequests,
    paymentDataOptions
  )

  const {
    searchTerm,
    setSearchTerm,
    filteredItems
  } = usePaymentFilters(items, {
    searchFields: ['quotations', 'kols', 'service']
  })

  const {
    selectedItems,
    isProcessing,
    toggleSelection,
    selectAll,
    deselectAll,
    handleBatchAction
  } = usePaymentActions(items, setData)

  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequestItem | null>(null)

  // ==========================================
  // 個人報帳 Tab
  // ==========================================
  const { data: expenseClaims = [], isLoading: claimsLoading, refetch: refreshClaims } = useQuery({
    queryKey: [...queryKeys.expenseClaimsPending],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_claims')
        .select('*')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true })
      if (error) throw error
      return (data || []) as ExpenseClaim[]
    },
    enabled: !permLoading && hasAccess,
  })

  const [claimSearchTerm, setClaimSearchTerm] = useState('')
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set())
  const [claimProcessing, setClaimProcessing] = useState(false)

  const filteredClaims = useMemo(() => {
    const q = claimSearchTerm.toLowerCase()
    return expenseClaims.filter(r => {
      if (!q) return true
      return (
        (r.project_name || '').toLowerCase().includes(q) ||
        (r.vendor_name || '').toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.expense_type || '').toLowerCase().includes(q)
      )
    })
  }, [expenseClaims, claimSearchTerm])

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  // 專案請款操作
  const handleApprove = async (item: PaymentRequestItem, overrideExpenseType?: string, overrideSubject?: string) => {
    const ok = await confirm({
      title: '確認核准',
      description: `確定要核准 "${item.quotations?.project_name} - ${item.service}" 的請款申請嗎？`,
      confirmLabel: '核准',
    })
    if (!ok) return
    try {
      const { error } = await supabase.rpc('approve_payment_request', {
        request_id: item.payment_request_id,
        verifier_id: (await supabase.auth.getUser()).data.user?.id,
        p_expense_type: overrideExpenseType || null,
        p_accounting_subject: overrideSubject || null,
      })
      if (error) { console.error('RPC error details:', error); throw error }
      toast.success('已核准請款申請')
      refresh()
      queryClient.invalidateQueries({ queryKey: [...queryKeys.confirmedPayments] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.pendingPayments] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
    } catch (error: unknown) {
      toast.error('核准失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const handleReject = async (item: PaymentRequestItem, reason: string) => {
    try {
      const { error } = await supabase
        .from('payment_requests')
        .update({
          verification_status: 'rejected',
          rejection_reason: reason,
          rejected_by: (await supabase.auth.getUser()).data.user?.id,
          rejected_at: new Date().toISOString()
        })
        .eq('id', item.payment_request_id)
      if (error) throw error
      toast.success('已駁回請款申請')
      refresh()
      queryClient.invalidateQueries({ queryKey: [...queryKeys.pendingPayments] })
    } catch (error: unknown) {
      toast.error('駁回失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const handleBatchApprove = async () => {
    const ok = await confirm({
      title: '確認批量核准',
      description: `確定要核准選中的 ${selectedItems.size} 筆申請嗎？`,
      confirmLabel: '批量核准',
    })
    if (!ok) return
    await handleBatchAction(
      async (items) => {
        const user = (await supabase.auth.getUser()).data.user
        const promises = items.map(item =>
          supabase.rpc('approve_payment_request', {
            request_id: item.payment_request_id,
            verifier_id: user?.id
          })
        )
        const results = await Promise.all(promises)
        const errors = results.filter(r => r.error)
        if (errors.length > 0) {
          console.error('RPC errors:', errors.map(e => ({ error: e.error, message: e.error?.message })))
          throw new Error(`${errors.length} 筆項目處理失敗`)
        }
      },
      {
        onSuccess: () => {
          toast.success(`成功核准 ${selectedItems.size} 筆申請`)
          refresh(); deselectAll()
          queryClient.invalidateQueries({ queryKey: [...queryKeys.confirmedPayments] })
          queryClient.invalidateQueries({ queryKey: [...queryKeys.pendingPayments] })
          queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
        },
        onError: (error) => toast.error('批量核准失敗: ' + error.message)
      }
    )
  }

  const handleBatchReject = async () => {
    const reason = prompt('請輸入批量駁回原因：')
    if (!reason) return
    await handleBatchAction(
      async (items) => {
        const user = (await supabase.auth.getUser()).data.user
        const ids = items.map(i => i.payment_request_id)
        const { error } = await supabase
          .from('payment_requests')
          .update({ verification_status: 'rejected', rejection_reason: reason, rejected_by: user?.id, rejected_at: new Date().toISOString() })
          .in('id', ids)
        if (error) throw error
      },
      {
        onSuccess: () => {
          toast.success(`成功駁回 ${selectedItems.size} 筆申請`)
          refresh(); deselectAll()
          queryClient.invalidateQueries({ queryKey: [...queryKeys.pendingPayments] })
        },
        onError: (error) => toast.error('批量駁回失敗: ' + error.message)
      }
    )
  }

  // 個人報帳操作
  const handleClaimApprove = async (claim: ExpenseClaim) => {
    const ok = await confirm({
      title: '確認核准',
      description: `確定要核准「${claim.vendor_name || claim.expense_type} - NT$ ${fmt(claim.total_amount)}」的報帳申請嗎？`,
      confirmLabel: '核准',
    })
    if (!ok) return
    try {
      const { error } = await supabase.rpc('approve_expense_claim', {
        claim_id: claim.id,
        approver_id: (await supabase.auth.getUser()).data.user?.id
      })
      if (error) throw error
      toast.success('已核准個人報帳')
      refreshClaims()
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] })
      queryClient.invalidateQueries({ queryKey: ['my-employee'] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.confirmedPayments] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
    } catch (error: unknown) {
      toast.error('核准失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const handleClaimReject = async (claim: ExpenseClaim) => {
    const reason = prompt('請輸入駁回原因：')
    if (!reason) return
    try {
      const { error } = await supabase.rpc('reject_expense_claim', {
        claim_id: claim.id,
        rejector_id: (await supabase.auth.getUser()).data.user?.id,
        reason,
      })
      if (error) throw error
      toast.success('已駁回個人報帳')
      refreshClaims()
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] })
      queryClient.invalidateQueries({ queryKey: ['my-employee'] })
    } catch (error: unknown) {
      toast.error('駁回失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const handleClaimBatchApprove = async () => {
    if (selectedClaimIds.size === 0) return
    const ok = await confirm({
      title: '確認批量核准',
      description: `確定要核准選中的 ${selectedClaimIds.size} 筆個人報帳嗎？`,
      confirmLabel: '批量核准',
    })
    if (!ok) return
    setClaimProcessing(true)
    try {
      const user = (await supabase.auth.getUser()).data.user
      const promises = Array.from(selectedClaimIds).map(id =>
        supabase.rpc('approve_expense_claim', { claim_id: id, approver_id: user?.id })
      )
      const results = await Promise.all(promises)
      const errors = results.filter(r => r.error)
      if (errors.length > 0) throw new Error(`${errors.length} 筆處理失敗`)
      toast.success(`成功核准 ${selectedClaimIds.size} 筆個人報帳`)
      setSelectedClaimIds(new Set())
      refreshClaims()
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] })
      queryClient.invalidateQueries({ queryKey: ['my-employee'] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.confirmedPayments] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
    } catch (error: unknown) {
      toast.error('批量核准失敗: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setClaimProcessing(false)
    }
  }

  const handleClaimBatchReject = async () => {
    if (selectedClaimIds.size === 0) return
    const reason = prompt('請輸入批量駁回原因：')
    if (!reason) return
    setClaimProcessing(true)
    try {
      const user = (await supabase.auth.getUser()).data.user
      const promises = Array.from(selectedClaimIds).map(id =>
        supabase.rpc('reject_expense_claim', { claim_id: id, rejector_id: user?.id, reason })
      )
      const results = await Promise.all(promises)
      const errors = results.filter(r => r.error)
      if (errors.length > 0) throw new Error(`${errors.length} 筆處理失敗`)
      toast.success(`成功駁回 ${selectedClaimIds.size} 筆個人報帳`)
      setSelectedClaimIds(new Set())
      refreshClaims()
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] })
      queryClient.invalidateQueries({ queryKey: ['my-employee'] })
    } catch (error: unknown) {
      toast.error('批量駁回失敗: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setClaimProcessing(false)
    }
  }

  const handleViewFiles = (item: PaymentRequestItem) => {
    setSelectedRequest(item)
    setIsFileViewerOpen(true)
  }

  if (permLoading || loading) return <LoadingState message="載入請款申請..." />

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Shield className="w-16 h-16 mb-4 text-muted-foreground/50" />
        <p className="text-lg font-medium">此頁面僅限管理員與編輯者存取</p>
      </div>
    )
  }

  return (
    <ModuleErrorBoundary module="請款審核">
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">請款申請審核</h1>
          <p className="text-muted-foreground mt-1">審核來自待請款清單與個人報帳的申請項目</p>
        </div>
      </div>

      {/* Tab 切換 */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('project')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'project'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          專案請款
          {filteredItems.length > 0 && (
            <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
              {filteredItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('personal')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'personal'
              ? 'border-info text-info'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="w-4 h-4" />
          個人報帳
          {expenseClaims.length > 0 && (
            <span className="bg-info/10 text-info text-xs font-bold px-2 py-0.5 rounded-full">
              {expenseClaims.length}
            </span>
          )}
        </button>
      </div>

      {/* 專案請款 Tab 內容 */}
      {activeTab === 'project' && (
        <>
          <div className="flex flex-col space-y-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  id="search-requests"
                  name="search"
                  placeholder="搜尋專案、KOL/服務、執行內容..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                共 {filteredItems.length} 筆申請
              </div>
            </div>
            <ApprovalControls
              selectedCount={selectedItems.size}
              onBatchApprove={handleBatchApprove}
              onBatchReject={handleBatchReject}
              onRefresh={refresh}
              isProcessing={isProcessing}
            />
          </div>

          {filteredItems.length > 0 ? (
            <div className="bg-card shadow overflow-hidden sm:rounded-lg border border-border">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedItems.size > 0 && selectedItems.size === filteredItems.length}
                        onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                        className="h-4 w-4 text-primary focus:ring-ring border-border rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">專案資訊</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">KOL / 服務</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">金額</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">附件 / 發票</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">狀態</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-200">
                  {filteredItems.map((item) => (
                    <RequestItemRow
                      key={item.id}
                      item={item}
                      isSelected={selectedItems.has(item.id)}
                      onSelect={() => toggleSelection(item.id)}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onViewFiles={handleViewFiles}
                      isProcessing={isProcessing}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              type={searchTerm ? 'no-results' : 'no-data'}
              title={searchTerm ? '沒有找到符合的申請' : '目前沒有待審核的專案請款'}
              description={searchTerm ? '請嘗試其他搜尋關鍵字' : '所有專案請款都已處理完畢'}
            />
          )}
        </>
      )}

      {/* 個人報帳 Tab 內容 */}
      {activeTab === 'personal' && (
        <>
          <div className="flex flex-col space-y-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="搜尋專案、廠商、發票號碼..."
                  value={claimSearchTerm}
                  onChange={(e) => setClaimSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                共 {filteredClaims.length} 筆報帳申請
              </div>
            </div>

            {/* 批量操作 */}
            {selectedClaimIds.size > 0 && (
              <div className="flex items-center gap-3 bg-info/10 border border-info/30 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-info">已選擇 {selectedClaimIds.size} 筆</span>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClaimBatchReject}
                  disabled={claimProcessing}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  批量駁回
                </Button>
                <Button
                  size="sm"
                  onClick={handleClaimBatchApprove}
                  disabled={claimProcessing}
                  className="bg-success text-white hover:bg-success/90"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  批量核准
                </Button>
              </div>
            )}
          </div>

          {claimsLoading ? (
            <LoadingState message="載入個人報帳..." />
          ) : filteredClaims.length > 0 ? (
            <div className="bg-card shadow overflow-hidden sm:rounded-lg border border-border">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedClaimIds.size > 0 && selectedClaimIds.size === filteredClaims.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedClaimIds(new Set(filteredClaims.map(c => c.id)))
                          else setSelectedClaimIds(new Set())
                        }}
                        className="h-4 w-4 text-primary focus:ring-ring border-border rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">報帳月份</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">支出種類</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">廠商/對象</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">專案名稱</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">金額</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">稅額</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">總額</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">發票號碼</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-200">
                  {filteredClaims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedClaimIds.has(claim.id)}
                          onChange={() => {
                            setSelectedClaimIds(prev => {
                              const next = new Set(prev)
                              if (next.has(claim.id)) next.delete(claim.id)
                              else next.add(claim.id)
                              return next
                            })
                          }}
                          className="h-4 w-4 text-primary focus:ring-ring border-border rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{claim.claim_month || '-'}</td>
                      <td className="px-4 py-3 text-sm">{claim.expense_type}</td>
                      <td className="px-4 py-3 text-sm font-medium">{claim.vendor_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-32 truncate">{claim.project_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right">NT$ {fmt(claim.amount || 0)}</td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">{fmt(claim.tax_amount || 0)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">NT$ {fmt(claim.total_amount || 0)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{claim.invoice_number || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleClaimApprove(claim)}
                            disabled={claimProcessing}
                            className="h-8 text-success hover:text-success hover:bg-success/10"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleClaimReject(claim)}
                            disabled={claimProcessing}
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              type={claimSearchTerm ? 'no-results' : 'no-data'}
              title={claimSearchTerm ? '沒有找到符合的報帳' : '目前沒有待審核的個人報帳'}
              description={claimSearchTerm ? '請嘗試其他搜尋關鍵字' : '所有個人報帳都已處理完畢'}
            />
          )}
        </>
      )}

      {/* 檔案檢視 Modal */}
      <FileViewerModal
        isOpen={isFileViewerOpen}
        onClose={() => { setIsFileViewerOpen(false); setSelectedRequest(null) }}
        request={selectedRequest}
      />
    </div>
    </ModuleErrorBoundary>
  )
}
