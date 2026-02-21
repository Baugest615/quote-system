'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, FileText, DollarSign, Calendar, RefreshCw, X, Shield } from 'lucide-react'
import { toast } from 'sonner'
import supabase from '@/lib/supabase/client'

// Permissions
import { usePermission } from '@/lib/permissions'

// Hooks
import { usePaymentData } from '@/hooks/payments/usePaymentData'
import { queryKeys } from '@/lib/queryKeys'

// Types
import { PaymentConfirmation } from '@/lib/payments/types'

// Components
import { LoadingState, EmptyState } from '@/components/payments/shared'
import { ConfirmationRow } from '@/components/payments/confirmed/ConfirmationRow'
import { PaymentStats } from '@/components/payments/confirmed/PaymentStats'

export default function ConfirmedPaymentsPage() {
  const { loading: permLoading, checkPageAccess } = usePermission()
  const hasAccess = checkPageAccess('confirmed_payments')

  const queryClient = useQueryClient()
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
            quotation_items (
              id,
              quotation_id,
              quotations ( project_name, client_id, clients ( name ) ),
              kol_id,
              kols ( id, name, real_name, bank_info ),
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

    // 初始化展開狀態
    return (data || []).map(item => ({
      ...item,
      isExpanded: false
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

  // 2. 本地狀態 (篩選與排序)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'date' | 'amount' | 'items'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })

  // 3. 篩選邏輯
  const filteredConfirmations = useMemo(() => {
    let result = confirmations.filter((confirmation) => {
      const searchLower = searchTerm.toLowerCase()
      const confirmationDate = confirmation.confirmation_date

      // 日期範圍篩選
      if (dateRange.start && confirmationDate < dateRange.start) return false
      if (dateRange.end && confirmationDate > dateRange.end) return false

      // 搜尋關聯項目
      const hasMatchingItem = confirmation.payment_confirmation_items.some(item => {
        // 個人報帳項目搜尋
        if (item.source_type === 'personal' || item.expense_claim_id) {
          const claim = item.expense_claims
          return (
            (claim?.project_name || '').toLowerCase().includes(searchLower) ||
            (claim?.vendor_name || '').toLowerCase().includes(searchLower) ||
            (claim?.expense_type || '').toLowerCase().includes(searchLower)
          )
        }

        // 專案請款項目搜尋
        const request = item.payment_requests
        const quotationItem = request?.quotation_items
        const quotation = quotationItem?.quotations
        const kol = quotationItem?.kols

        return (
          (quotation?.project_name || '').toLowerCase().includes(searchLower) ||
          (kol?.name || '').toLowerCase().includes(searchLower) ||
          (quotationItem?.service || '').toLowerCase().includes(searchLower)
        )
      })

      return (confirmationDate || '').includes(searchTerm) || hasMatchingItem
    })

    // 排序邏輯
    result.sort((a, b) => {
      let aValue = 0, bValue = 0
      switch (sortField) {
        case 'date':
          aValue = new Date(a.confirmation_date).getTime()
          bValue = new Date(b.confirmation_date).getTime()
          break
        case 'amount':
          aValue = a.total_amount
          bValue = b.total_amount
          break
        case 'items':
          aValue = a.total_items
          bValue = b.total_items
          break
        default: return 0
      }
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })

    return result
  }, [confirmations, searchTerm, sortField, sortDirection, dateRange])

  // 4. 操作函數
  const handleSort = (field: 'date' | 'amount' | 'items') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const toggleExpansion = (id: string) => {
    setConfirmations(prev => prev.map(item =>
      item.id === id ? { ...item, isExpanded: !item.isExpanded } : item
    ))
  }

  const handleRevert = async (confirmation: PaymentConfirmation) => {
    const itemsToRevert = confirmation.payment_confirmation_items

    if (!itemsToRevert || itemsToRevert.length === 0) {
      toast.error('此確認清單沒有項目可退回。')
      return
    }

    if (!confirm('確定要將此清單中的 ' + itemsToRevert.length + ' 筆項目退回到「請款申請」頁面嗎？')) return

    try {
      // 區分專案請款與個人報帳項目
      const projectItems = itemsToRevert.filter(item => item.payment_request_id && item.source_type !== 'personal')
      const personalItems = itemsToRevert.filter(item => item.expense_claim_id || item.source_type === 'personal')

      // 1. 刪除確認項目
      const { error: itemsError } = await supabase
        .from('payment_confirmation_items')
        .delete()
        .eq('payment_confirmation_id', confirmation.id)
      if (itemsError) throw new Error('刪除確認項目失敗: ' + itemsError.message)

      // 2. 刪除確認主記錄
      const { error: confirmationError } = await supabase
        .from('payment_confirmations')
        .delete()
        .eq('id', confirmation.id)
      if (confirmationError) throw new Error('刪除確認主記錄失敗: ' + confirmationError.message)

      // 3a. 退回專案請款項目
      if (projectItems.length > 0) {
        const requestIds = projectItems.map(item => item.payment_request_id).filter(Boolean) as string[]
        if (requestIds.length > 0) {
          const { error: updateError } = await supabase
            .from('payment_requests')
            .update({ verification_status: 'pending' })
            .in('id', requestIds)
          if (updateError) throw new Error('退回專案請款狀態失敗: ' + updateError.message)
        }
      }

      // 3b. 退回個人報帳項目（狀態改回 submitted）
      if (personalItems.length > 0) {
        const claimIds = personalItems.map(item => item.expense_claim_id).filter(Boolean) as string[]
        if (claimIds.length > 0) {
          const { error: claimError } = await supabase
            .from('expense_claims')
            .update({ status: 'submitted', approved_by: null, approved_at: null })
            .in('id', claimIds)
          if (claimError) throw new Error('退回個人報帳狀態失敗: ' + claimError.message)

          // 刪除自動建立的進項記錄
          const { error: expenseError } = await supabase
            .from('accounting_expenses')
            .delete()
            .in('expense_claim_id', claimIds)
          if (expenseError) console.warn('清理進項記錄失敗:', expenseError.message)
        }
      }

      toast.success('清單已退回，相關項目已回到「請款申請」頁面。')
      refresh()
      // 跨頁快取失效
      queryClient.invalidateQueries({ queryKey: [...queryKeys.paymentRequests] })
      if (personalItems.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['expense-claims'] })  // 前綴匹配，會失效所有 expense-claims 相關 key
        queryClient.invalidateQueries({ queryKey: [...queryKeys.expenseClaimsPending] })
        queryClient.invalidateQueries({ queryKey: ['accounting-expenses'] })  // 前綴匹配，會失效所有 accounting-expenses 相關 key
      }

    } catch (error: unknown) {
      console.error('退回請款清單失敗:', error)
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
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">已確認請款清單</h1>
          <p className="text-muted-foreground mt-1">檢視和管理已確認的請款清單</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => refresh()} variant="outline" disabled={loading} className="text-info hover:text-info/80">
            <RefreshCw className="h-4 w-4 mr-2" />重新載入
          </Button>
        </div>
      </div>

      {/* 統計面板 */}
      <PaymentStats confirmations={filteredConfirmations} />

      {/* 控制列 */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg shadow-none border border-border">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="搜尋日期、專案名稱、KOL/服務或執行內容..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* 日期篩選 */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <div className="flex items-center space-x-2 bg-secondary p-1 rounded-md border">
            <Calendar className="h-4 w-4 text-muted-foreground ml-2" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="bg-transparent border-none text-sm focus:ring-0 p-1 text-muted-foreground"
              placeholder="開始日期"
            />
            <span className="text-muted-foreground">-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="bg-transparent border-none text-sm focus:ring-0 p-1 text-muted-foreground"
              placeholder="結束日期"
            />
            {(dateRange.start || dateRange.end) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-full hover:bg-muted"
                onClick={() => setDateRange({ start: '', end: '' })}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 排序按鈕 */}
      <div className="flex space-x-2">
        <Button variant={sortField === 'date' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('date')}>
          <Calendar className="h-4 w-4 mr-1" /> 日期 {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
        </Button>
        <Button variant={sortField === 'amount' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('amount')}>
          <DollarSign className="h-4 w-4 mr-1" /> 金額 {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
        </Button>
        <Button variant={sortField === 'items' ? 'default' : 'outline'} size="sm" onClick={() => handleSort('items')}>
          <FileText className="h-4 w-4 mr-1" /> 項目數 {sortField === 'items' && (sortDirection === 'asc' ? '↑' : '↓')}
        </Button>
      </div>

      {/* 列表內容 */}
      {filteredConfirmations.length > 0 ? (
        <div className="space-y-4">
          {filteredConfirmations.map((confirmation) => (
            <ConfirmationRow
              key={confirmation.id}
              confirmation={confirmation}
              onToggleExpansion={toggleExpansion}
              onRevert={handleRevert}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          type={searchTerm || dateRange.start || dateRange.end ? 'no-results' : 'no-data'}
          title={searchTerm || dateRange.start || dateRange.end ? '沒有找到符合的清單' : '目前沒有已確認的請款記錄'}
          description={searchTerm || dateRange.start || dateRange.end ? '請嘗試其他搜尋關鍵字或日期範圍' : '所有請款都還在處理中'}
        />
      )}
    </div>
  )
}