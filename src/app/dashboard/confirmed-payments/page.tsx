'use client'

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, FileText, DollarSign, Calendar, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import supabase from '@/lib/supabase/client'

// Hooks
import { usePaymentData } from '@/hooks/payments/usePaymentData'

// Types
import { PaymentConfirmation } from '@/lib/payments/types'

// Components
import { LoadingState, EmptyState } from '@/components/payments/shared'
import { ConfirmationRow } from '@/components/payments/confirmed/ConfirmationRow'
import { PaymentStats } from '@/components/payments/confirmed/PaymentStats'

export default function ConfirmedPaymentsPage() {
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
          )
        )
      `)
      .order('confirmation_date', { ascending: false })

    if (error) throw error

    console.log('Fetched confirmations:', data)
    if (data && data.length > 0) {
      console.log('First confirmation settings:', data[0].remittance_settings)
    }

    // 初始化展開狀態
    return (data || []).map(item => ({
      ...item,
      isExpanded: false
    })) as PaymentConfirmation[]
  }, [])

  const paymentDataOptions = useMemo(() => ({
    autoRefresh: false
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
      let aValue: any, bValue: any
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
      const requestIdsToRevert = itemsToRevert.map(item => item.payment_request_id)

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

      // 3. 更新原始申請狀態
      const { error: updateError } = await supabase
        .from('payment_requests')
        .update({ verification_status: 'pending' })
        .in('id', requestIdsToRevert)
      if (updateError) throw new Error('退回項目狀態失敗: ' + updateError.message)

      toast.success('清單已退回，相關項目已回到「請款申請」頁面。')
      refresh()

    } catch (error: any) {
      console.error('退回請款清單失敗:', error)
      toast.error('操作失敗: ' + error.message)
    }
  }

  if (loading) return <LoadingState message="載入已確認請款記錄..." />

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">已確認請款清單</h1>
          <p className="text-gray-500 mt-1">檢視和管理已確認的請款清單</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => refresh()} variant="outline" disabled={loading} className="text-blue-600 hover:text-blue-700">
            <RefreshCw className="h-4 w-4 mr-2" />重新載入
          </Button>
        </div>
      </div>

      {/* 統計面板 */}
      <PaymentStats confirmations={filteredConfirmations} />

      {/* 控制列 */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="搜尋日期、專案名稱、KOL名稱或服務項目..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* 日期篩選 */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <div className="flex items-center space-x-2 bg-gray-50 p-1 rounded-md border">
            <Calendar className="h-4 w-4 text-gray-500 ml-2" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="bg-transparent border-none text-sm focus:ring-0 p-1 text-gray-600"
              placeholder="開始日期"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="bg-transparent border-none text-sm focus:ring-0 p-1 text-gray-600"
              placeholder="結束日期"
            />
            {(dateRange.start || dateRange.end) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-full hover:bg-gray-200"
                onClick={() => setDateRange({ start: '', end: '' })}
              >
                <X className="h-3 w-3 text-gray-500" />
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