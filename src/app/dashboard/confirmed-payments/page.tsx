'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { RefreshCw, Shield, Banknote, FileSpreadsheet, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import supabase from '@/lib/supabase/client'

// Permissions
import { usePermission } from '@/lib/permissions'

// Hooks
import { usePaymentData } from '@/hooks/payments/usePaymentData'
import { useWithholdingSettings } from '@/hooks/useWithholdingSettings'
import { queryKeys } from '@/lib/queryKeys'
import { CURRENT_YEAR } from '@/lib/constants'

// Types
import { PaymentConfirmation, RemittanceSettings } from '@/lib/payments/types'
import type { AccountingPayroll } from '@/types/custom.types'

// Components
import { LoadingState } from '@/components/payments/shared'
import { PaymentStats } from '@/components/payments/confirmed/PaymentStats'
import { PaymentOverviewTab } from '@/components/payments/confirmed/tabs/PaymentOverviewTab'
import { WithholdingTab } from '@/components/payments/confirmed/tabs/WithholdingTab'
import { ConfirmationHistoryTab } from '@/components/payments/confirmed/tabs/ConfirmationHistoryTab'
import { ModuleErrorBoundary } from '@/components/ModuleErrorBoundary'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type TabKey = 'overview' | 'withholding' | 'history'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '匯款總覽', icon: <Banknote className="h-4 w-4" /> },
  { key: 'withholding', label: '代扣代繳', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { key: 'history', label: '確認紀錄', icon: <ClipboardList className="h-4 w-4" /> },
]

export default function ConfirmedPaymentsPage() {
  const confirm = useConfirm()
  const { loading: permLoading, checkPageAccess } = usePermission()
  const hasAccess = checkPageAccess('confirmed_payments')

  const queryClient = useQueryClient()
  const { data: withholdingRates } = useWithholdingSettings()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // 薪資資料查詢（已付款的薪資，僅在匯款總覽中檢視）
  const { data: payrollData } = useQuery({
    queryKey: [...queryKeys.accountingPayroll(CURRENT_YEAR), 'confirmed-view'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_payroll')
        .select('*')
        .not('payment_date', 'is', null)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return (data || []) as AccountingPayroll[]
    },
  })

  // 1. 資料管理 Hook
  const fetchConfirmedPayments = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_confirmations')
      .select(`
        *,
        remittance_settings,
        payment_confirmation_items (
          *,
          payment_requests (
            quotation_item_id,
            cost_amount,
            invoice_number,
            merge_group_id,
            merge_color,
            quotation_items (
              id,
              quotation_id,
              quotations ( project_name, client_id, clients ( name ) ),
              kol_id,
              kols ( id, name, real_name, bank_info, withholding_exempt ),
              service,
              quantity,
              price,
              cost,
              remittance_name,
              remark,
              created_at
            )
          ),
          expense_claims (
            id,
            expense_type,
            vendor_name,
            project_name,
            amount,
            tax_amount,
            total_amount,
            invoice_number,
            claim_month,
            note,
            submitted_by
          )
        )
      `)
      .order('confirmation_date', { ascending: false })

    if (error) throw error

    // 收集所有 submitted_by UUID，透過 employees 取得提交人姓名
    // (profiles 有 RLS 限制只能讀自己，employees 允許所有認證使用者讀取)
    const submitterIds = new Set<string>()
    data?.forEach(c => c.payment_confirmation_items?.forEach((item: { expense_claims?: { submitted_by?: string | null } | null }) => {
      if (item.expense_claims?.submitted_by) submitterIds.add(item.expense_claims.submitted_by)
    }))

    let nameMap = new Map<string, string>()
    if (submitterIds.size > 0) {
      const { data: employees } = await supabase
        .from('employees')
        .select('user_id, name')
        .in('user_id', Array.from(submitterIds))
      if (employees) {
        nameMap = new Map(employees.map(e => [e.user_id!, e.name]))
      }
    }

    // 注入 submitter 到 expense_claims
    return (data || []).map(item => ({
      ...item,
      isExpanded: false,
      payment_confirmation_items: item.payment_confirmation_items?.map((pci: Record<string, unknown>) => {
        const claim = pci.expense_claims as { submitted_by?: string | null } | null
        if (claim?.submitted_by && nameMap.has(claim.submitted_by)) {
          return {
            ...pci,
            expense_claims: {
              ...claim,
              submitter: { full_name: nameMap.get(claim.submitted_by) || null }
            }
          }
        }
        return pci
      })
    })) as PaymentConfirmation[]
  }, [])

  const paymentDataOptions = useMemo(() => ({
    autoRefresh: false,
    queryKey: [...queryKeys.confirmedPayments],
  }), [])

  const {
    data: confirmations,
    setData: setConfirmations,
    loading,
    refetch: refresh
  } = usePaymentData<PaymentConfirmation>(
    fetchConfirmedPayments,
    paymentDataOptions
  )

  // 匯款設定跨 Tab 即時同步：確認紀錄 Tab 修改後同步到 parent state
  const handleSettingsChange = useCallback((confirmationId: string, newSettings: RemittanceSettings) => {
    setConfirmations(prev => prev.map(c =>
      c.id === confirmationId
        ? { ...c, remittance_settings: newSettings }
        : c
    ))
  }, [setConfirmations])

  // 操作函數
  const toggleExpansion = (id: string) => {
    setConfirmations(prev => prev.map(item =>
      item.id === id ? { ...item, isExpanded: !item.isExpanded } : item
    ))
  }

  const handleRevert = async (confirmation: PaymentConfirmation) => {
    const itemsToRevert = confirmation.payment_confirmation_items

    // 孤立記錄（無關聯項目）：直接刪除確認記錄
    if (!itemsToRevert || itemsToRevert.length === 0) {
      const ok = await confirm({
        title: '刪除空白清單',
        description: '此確認清單沒有關聯項目，是否直接刪除？',
        confirmLabel: '刪除',
        variant: 'destructive',
      })
      if (!ok) return
      try {
        await supabase.from('accounting_expenses').delete().eq('payment_confirmation_id', confirmation.id)
        await supabase.from('payment_confirmations').delete().eq('id', confirmation.id)
        toast.success('已刪除空白確認清單')
        refresh()
      } catch (error: unknown) {
        toast.error('刪除失敗: ' + (error instanceof Error ? error.message : String(error)))
      }
      return
    }

    const ok = await confirm({
      title: '確認退回',
      description: '確定要將此清單中的 ' + itemsToRevert.length + ' 筆項目退回到「請款申請」頁面嗎？',
      confirmLabel: '退回',
    })
    if (!ok) return

    try {
      const projectItems = itemsToRevert.filter(item => item.payment_request_id && item.source_type !== 'personal')
      const personalItems = itemsToRevert.filter(item => item.expense_claim_id || item.source_type === 'personal')

      const { error: itemsError } = await supabase
        .from('payment_confirmation_items')
        .delete()
        .eq('payment_confirmation_id', confirmation.id)
      if (itemsError) throw new Error('刪除確認項目失敗: ' + itemsError.message)

      // 清理匯費 accounting_expenses（必須在刪除 confirmation 之前，因為有 FK）
      const { error: feeError } = await supabase
        .from('accounting_expenses')
        .delete()
        .eq('payment_confirmation_id', confirmation.id)
      if (feeError) console.warn('清理匯費記錄失敗:', feeError.message)

      const { error: confirmationError } = await supabase
        .from('payment_confirmations')
        .delete()
        .eq('id', confirmation.id)
      if (confirmationError) throw new Error('刪除確認主記錄失敗: ' + confirmationError.message)

      if (projectItems.length > 0) {
        const requestIds = projectItems.map(item => item.payment_request_id).filter(Boolean) as string[]
        if (requestIds.length > 0) {
          // 清理專案請款對應的 accounting_expenses 記錄
          const { error: projExpenseError } = await supabase
            .from('accounting_expenses')
            .delete()
            .in('payment_request_id', requestIds)
          if (projExpenseError) console.warn('清理專案進項記錄失敗:', projExpenseError.message)

          const { error: updateError } = await supabase
            .from('payment_requests')
            .update({ verification_status: 'pending' })
            .in('id', requestIds)
          if (updateError) throw new Error('退回專案請款狀態失敗: ' + updateError.message)
        }
      }

      if (personalItems.length > 0) {
        const claimIds = personalItems.map(item => item.expense_claim_id).filter(Boolean) as string[]
        if (claimIds.length > 0) {
          const { error: claimError } = await supabase
            .from('expense_claims')
            .update({ status: 'submitted', approved_by: null, approved_at: null })
            .in('id', claimIds)
          if (claimError) throw new Error('退回個人報帳狀態失敗: ' + claimError.message)

          const { error: expenseError } = await supabase
            .from('accounting_expenses')
            .delete()
            .in('expense_claim_id', claimIds)
          if (expenseError) console.warn('清理進項記錄失敗:', expenseError.message)

          // 同時清理代扣代繳 settlement 記錄（避免重新核准時產生重複）
          const { error: settlementError } = await supabase
            .from('withholding_settlements')
            .delete()
            .in('expense_claim_id', claimIds)
          if (settlementError) console.warn('清理代扣繳納記錄失敗:', settlementError.message)
        }
      }

      toast.success('清單已退回，相關項目已回到「請款申請」頁面。')
      refresh()
      queryClient.invalidateQueries({ queryKey: [...queryKeys.paymentRequests] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.pendingPayments] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
      queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-expenses'] })
      if (personalItems.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['expense-claims'] })
        queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
        queryClient.invalidateQueries({ queryKey: ['my-employee'] })
        queryClient.invalidateQueries({ queryKey: [...queryKeys.withholdingSettlements] })
      }

    } catch (error: unknown) {
      console.error('退回請款清單失敗:', error)
      toast.error('操作失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // ====== 單筆退回 ======
  const handleRevertItem = async (itemId: string) => {
    const ok = await confirm({
      title: '確認退回此項目',
      description: '此項目將退回到「請款申請」頁面，是否繼續？',
      confirmLabel: '退回',
    })
    if (!ok) return

    try {
      // 1. 查詢 item 詳情
      const { data: item, error: fetchErr } = await supabase
        .from('payment_confirmation_items')
        .select('id, payment_confirmation_id, payment_request_id, expense_claim_id, source_type, amount_at_confirmation')
        .eq('id', itemId)
        .single()
      if (fetchErr || !item) throw new Error('找不到該確認項目')

      const confirmationId = item.payment_confirmation_id
      const amount = item.amount_at_confirmation || 0

      // 2. 刪除 confirmation item
      const { error: delErr } = await supabase
        .from('payment_confirmation_items')
        .delete()
        .eq('id', itemId)
      if (delErr) throw new Error('刪除確認項目失敗: ' + delErr.message)

      // 3. 更新父 confirmation 的 totals，若為空則刪除
      const { data: remaining } = await supabase
        .from('payment_confirmation_items')
        .select('id')
        .eq('payment_confirmation_id', confirmationId)

      if (!remaining || remaining.length === 0) {
        // 清理匯費
        await supabase.from('accounting_expenses').delete().eq('payment_confirmation_id', confirmationId)
        await supabase.from('payment_confirmations').delete().eq('id', confirmationId)
      } else {
        await supabase
          .from('payment_confirmations')
          .update({
            total_amount: remaining.length > 0 ? undefined : 0, // 讓 DB 自己計算
            total_items: remaining.length,
          })
          .eq('id', confirmationId)

        // 手動扣減金額
        const { data: conf } = await supabase
          .from('payment_confirmations')
          .select('total_amount')
          .eq('id', confirmationId)
          .single()
        if (conf) {
          await supabase
            .from('payment_confirmations')
            .update({ total_amount: (conf.total_amount || 0) - amount })
            .eq('id', confirmationId)
        }
      }

      // 4. 根據來源類型清理
      if (item.payment_request_id && item.source_type !== 'personal') {
        await supabase
          .from('accounting_expenses')
          .delete()
          .eq('payment_request_id', item.payment_request_id)

        await supabase
          .from('payment_requests')
          .update({
            verification_status: 'pending',
            approved_by: null,
            approved_at: null,
            rejection_reason: null,
            rejected_by: null,
            rejected_at: null,
          })
          .eq('id', item.payment_request_id)
      }

      if (item.expense_claim_id || item.source_type === 'personal') {
        const claimId = item.expense_claim_id
        if (claimId) {
          await supabase
            .from('expense_claims')
            .update({ status: 'submitted', approved_by: null, approved_at: null })
            .eq('id', claimId)

          await supabase
            .from('accounting_expenses')
            .delete()
            .eq('expense_claim_id', claimId)

          await supabase
            .from('withholding_settlements')
            .delete()
            .eq('expense_claim_id', claimId)
        }
      }

      // 5. 快取失效
      toast.success('已退回此項目')
      refresh()
      queryClient.invalidateQueries({ queryKey: [...queryKeys.paymentRequests] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.pendingPayments] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
      queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
    } catch (error: unknown) {
      console.error('單筆退回失敗:', error)
      toast.error('操作失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  if (permLoading || loading) return <LoadingState message="載入已確認請款記錄..." />

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Shield className="w-16 h-16 mb-4 text-muted-foreground/50" />
        <p className="text-lg font-medium">此頁面僅限管理員與編輯者存取</p>
      </div>
    )
  }

  return (
    <ModuleErrorBoundary module="已確認請款">
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">已確認請款清單</h1>
          <p className="text-muted-foreground mt-1">匯款總覽、代扣代繳管理與確認紀錄</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => refresh()} variant="outline" disabled={loading} className="text-info hover:text-info/80">
            <RefreshCw className="h-4 w-4 mr-2" />重新載入
          </Button>
        </div>
      </div>

      {/* 統計面板 */}
      <PaymentStats confirmations={confirmations} />

      {/* Tab 切換列 */}
      <div className="border-b border-border">
        <div className="flex space-x-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-info text-info'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 內容 */}
      {activeTab === 'overview' && (
        <PaymentOverviewTab
          confirmations={confirmations}
          withholdingRates={withholdingRates}
          payrollData={payrollData}
        />
      )}

      {activeTab === 'withholding' && (
        <WithholdingTab
          confirmations={confirmations}
          withholdingRates={withholdingRates}
        />
      )}

      {activeTab === 'history' && (
        <ConfirmationHistoryTab
          confirmations={confirmations}
          onToggleExpansion={toggleExpansion}
          onRevert={handleRevert}
          onRevertItem={handleRevertItem}
          onSettingsChange={handleSettingsChange}
          withholdingRates={withholdingRates}
        />
      )}
    </div>
    </ModuleErrorBoundary>
  )
}
