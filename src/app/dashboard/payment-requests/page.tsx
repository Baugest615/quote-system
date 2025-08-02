'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, CheckCircle, XCircle, Edit3, ChevronDown, ChevronRight, FileText, Trash2, Building2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

// 類型定義
type PaymentRequest = Database['public']['Tables']['payment_requests']['Row']
type PaymentConfirmation = Database['public']['Tables']['payment_confirmations']['Row']
type PaymentConfirmationItem = Database['public']['Tables']['payment_confirmation_items']['Row']

// 使用視圖的資料類型
type PaymentRequestWithDetails = Database['public']['Views']['payment_requests_with_details']['Row']

type PaymentRequestItem = PaymentRequestWithDetails & {
  is_editing?: boolean
}

// 確認項目的顯示類型
type ConfirmationDisplayItem = {
  id: string
  project_name: string
  kol_name: string
  service: string
  quantity: number
  price: number
  merge_color?: string
}

type PaymentConfirmationWithItems = PaymentConfirmation & {
  payment_confirmation_items: PaymentConfirmationItem[]
  isExpanded?: boolean
}

type AccountGroup = {
  accountName: string
  bankName: string
  branchName: string
  accountNumber: string
  items: ConfirmationDisplayItem[]
  totalAmount: number
  isExpanded?: boolean
}

export default function PaymentRequestsPage() {
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestItem[]>([])
  const [filteredRequests, setFilteredRequests] = useState<PaymentRequestItem[]>([])
  const [confirmedPayments, setConfirmedPayments] = useState<PaymentConfirmationWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<string>('project_name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // 載入請款申請資料
  const fetchPaymentRequests = useCallback(async () => {
    setLoading(true)
    try {
      console.log('=== 開始載入請款申請資料 ===')
      
      // 使用視圖載入請款申請詳細資料
      const { data: requests, error: requestsError } = await supabase
        .from('payment_requests_with_details')
        .select('*')
        .order('request_date', { ascending: false })

      if (requestsError) {
        console.error('載入請款申請失敗:', requestsError)
        // 如果視圖查詢失敗，嘗試基本查詢
        const { data: basicRequests, error: basicError } = await supabase
          .from('payment_requests')
          .select('*')
          .order('request_date', { ascending: false })
        
        if (basicError) {
          throw basicError
        }
        
        setPaymentRequests([])
        setFilteredRequests([])
      } else {
        const requestsWithEditState = (requests || []).map(request => ({
          ...request,
          is_editing: false
        })) as PaymentRequestItem[]

        console.log('載入請款申請成功:', requestsWithEditState.length, '筆')
        setPaymentRequests(requestsWithEditState)
        setFilteredRequests(requestsWithEditState)
      }

      // 載入已確認的請款記錄
      await fetchPaymentConfirmations()
      
    } catch (error: any) {
      console.error('Error fetching payment requests:', error)
      toast.error('載入請款申請失敗: ' + error.message)
      setPaymentRequests([])
      setFilteredRequests([])
      setConfirmedPayments([])
    } finally {
      setLoading(false)
    }
  }, [])

  // 📚 單獨的載入確認記錄方法
  const fetchPaymentConfirmations = async () => {
    try {
      console.log('=== 開始載入確認記錄 ===')
      
      // 檢查認證狀態
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      console.log('當前使用者:', user?.id, userError)
      
      // 1. 載入所有確認記錄
      const { data: confirmations, error: confirmError } = await supabase
        .from('payment_confirmations')
        .select('*')
        .order('confirmation_date', { ascending: false })
      
      if (confirmError) {
        console.error('載入確認記錄失敗:', confirmError)
        throw confirmError
      }
      
      console.log('載入到的確認記錄:', confirmations?.length || 0, '筆')
      console.log('確認記錄詳細:', confirmations)
      
      if (!confirmations || confirmations.length === 0) {
        console.log('沒有確認記錄')
        setConfirmedPayments([])
        return
      }
      
      // 2. 為每個確認記錄載入相關項目
      const confirmationsWithItems = []
      
      for (const conf of confirmations) {
        console.log(`=== 處理確認記錄 ${conf.id} ===`)
        console.log('確認記錄詳細:', conf)
        
        // 載入關聯項目
        const { data: items, error: itemsError } = await supabase
          .from('payment_confirmation_items')
          .select('*')
          .eq('payment_confirmation_id', conf.id)
          .order('created_at', { ascending: true })
        
        if (itemsError) {
          console.error(`載入確認記錄 ${conf.id} 項目失敗:`, itemsError)
          confirmationsWithItems.push({
            ...conf,
            payment_confirmation_items: [],
            isExpanded: false
          })
        } else {
          console.log(`確認記錄 ${conf.id} 項目數量:`, items?.length || 0)
          console.log(`項目詳細:`, items)
          
          confirmationsWithItems.push({
            ...conf,
            payment_confirmation_items: items || [],
            isExpanded: false
          })
        }
      }
      
      console.log('=== 最終確認記錄處理結果 ===')
      console.log('處理完成的確認記錄數:', confirmationsWithItems.length)
      confirmationsWithItems.forEach((conf, index) => {
        console.log(`確認記錄 ${index + 1}:`, {
          id: conf.id,
          date: conf.confirmation_date,
          total_items: conf.total_items,
          actual_items: conf.payment_confirmation_items.length
        })
      })
      
      setConfirmedPayments(confirmationsWithItems as PaymentConfirmationWithItems[])
      
    } catch (error: any) {
      console.error('載入請款確認記錄過程中發生錯誤:', error)
      setConfirmedPayments([])
    }
  }

  useEffect(() => {
    fetchPaymentRequests()
  }, [fetchPaymentRequests])

  // 搜尋功能
  useEffect(() => {
    const filtered = paymentRequests.filter((item) => {
      const projectName = item.project_name || ''
      const kolName = item.kol_name || ''
      const service = item.service || ''
      
      return projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             kolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             service.toLowerCase().includes(searchTerm.toLowerCase())
    })
    setFilteredRequests(filtered)
  }, [paymentRequests, searchTerm])

  // 排序功能（保持合併群組一起）
  const handleSort = (field: string) => {
    const direction = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortField(field)
    setSortDirection(direction)
    
    const sorted = [...filteredRequests].sort((a, b) => {
      // 先按合併群組排序
      if (a.merge_group_id && b.merge_group_id && a.merge_group_id === b.merge_group_id) {
        return a.is_merge_leader ? -1 : 1
      }
      
      let aValue: any = ''
      let bValue: any = ''
      
      switch (field) {
        case 'project_name':
          aValue = a.project_name || ''
          bValue = b.project_name || ''
          break
        case 'kol_name':
          aValue = a.kol_name || ''
          bValue = b.kol_name || ''
          break
        case 'service':
          aValue = a.service || ''
          bValue = b.service || ''
          break
        case 'amount':
          aValue = (a.price || 0) * (a.quantity || 1)
          bValue = (b.price || 0) * (b.quantity || 1)
          break
        default:
          return 0
      }
      
      if (direction === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })
    
    setFilteredRequests(sorted)
  }

  // 取得銀行帳戶資訊
  const getBankAccountInfo = (kolBankInfo: any, kolRealName: string | null) => {
    if (!kolBankInfo) {
      return {
        accountName: '-',
        bankName: '-',
        branchName: '-',
        accountNumber: '-'
      }
    }

    const bankInfo = kolBankInfo as any
    const isCompany = bankInfo.bankType === 'company'
    
    return {
      accountName: isCompany ? (bankInfo.companyAccountName || '-') : (kolRealName || '-'),
      bankName: bankInfo.bankName || '-',
      branchName: bankInfo.branchName || '-',
      accountNumber: bankInfo.accountNumber || '-'
    }
  }

  // 處理拒絕申請
  const handleReject = async (itemId: string) => {
    if (!window.confirm('確定要拒絕這筆請款申請嗎？')) return

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('無法獲取使用者資訊')
      }

      const item = paymentRequests.find(r => r.id === itemId)
      if (!item) return

      // 如果是合併群組的領導者，整個群組都要被拒絕
      if (item.merge_group_id && item.is_merge_leader) {
        const { error } = await supabase
          .from('payment_requests')
          .delete()
          .eq('merge_group_id', item.merge_group_id)

        if (error) throw error
        toast.success('已拒絕合併群組請款申請，項目已移回待請款管理')
      } else {
        const { error } = await supabase
          .from('payment_requests')
          .delete()
          .eq('id', itemId)

        if (error) throw error
        toast.success('已拒絕請款申請，項目已移回待請款管理')
      }

      // 重新載入資料
      await fetchPaymentRequests()
    } catch (error: any) {
      console.error('拒絕申請失敗:', error)
      toast.error('操作失敗: ' + error.message)
    }
  }

  // 處理通過申請
  const handleApprove = async (itemId: string) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('無法獲取使用者資訊')
      }

      const item = paymentRequests.find(r => r.id === itemId)
      if (!item) return

      // 如果是合併群組的領導者，整個群組都要通過
      if (item.merge_group_id && item.is_merge_leader) {
        const { error } = await supabase
          .from('payment_requests')
          .update({
            verification_status: 'approved',
            approved_by: user.id,
            approved_at: new Date().toISOString()
          })
          .eq('merge_group_id', item.merge_group_id)

        if (error) throw error
        toast.success('合併群組請款申請已全部通過')
      } else {
        const { error } = await supabase
          .from('payment_requests')
          .update({
            verification_status: 'approved',
            approved_by: user.id,
            approved_at: new Date().toISOString()
          })
          .eq('id', itemId)

        if (error) throw error
        toast.success('請款申請已通過')
      }

      // 重新載入資料
      await fetchPaymentRequests()
    } catch (error: any) {
      console.error('通過申請失敗:', error)
      toast.error('操作失敗: ' + error.message)
    }
  }

  // 處理編輯模式切換
  const handleEdit = (itemId: string) => {
    const item = paymentRequests.find(r => r.id === itemId)
    if (!item) return

    // 如果是合併群組的領導者，整個群組的編輯狀態都要同步
    if (item.merge_group_id && item.is_merge_leader) {
      setPaymentRequests(prev => prev.map(request => 
        request.merge_group_id === item.merge_group_id
          ? { ...request, is_editing: !request.is_editing }
          : request
      ))
    } else {
      setPaymentRequests(prev => prev.map(request => 
        request.id === itemId 
          ? { ...request, is_editing: !request.is_editing }
          : request
      ))
    }
  }

  // 🔧 改進的請款確認方法
  const handlePaymentConfirmation = async () => {
    const approvedItems = paymentRequests.filter(item => item.verification_status === 'approved')
    
    if (approvedItems.length === 0) {
      toast.error('沒有已通過的請款項目')
      return
    }

    // 驗證必要資料
    const invalidItems = approvedItems.filter(item => 
      !item.kol_name || !item.project_name || !item.service
    )
    
    if (invalidItems.length > 0) {
      console.error('發現無效項目:', invalidItems)
      toast.error('部分項目缺少必要資訊，請檢查資料完整性')
      return
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('無法獲取使用者資訊')
      }

      // 計算總金額
      const totalAmount = approvedItems.reduce((sum, item) => 
        sum + (item.price || 0) * (item.quantity || 1), 0
      )

      console.log('=== 開始請款確認 ===')
      console.log('準備確認的項目:', approvedItems.length, '筆')
      console.log('總金額:', totalAmount)

      // 🎯 使用事務性處理
      await handlePaymentConfirmationWithTransaction(approvedItems, totalAmount, user.id)

    } catch (error: any) {
      console.error('請款確認失敗:', error)
      toast.error('請款確認失敗: ' + error.message)
    }
  }

  // 🚀 改進的事務性請款確認方法
  const handlePaymentConfirmationWithTransaction = async (
    approvedItems: PaymentRequestItem[], 
    totalAmount: number, 
    userId: string
  ) => {
    let confirmationId: string | null = null
    
    try {
      console.log('=== 步驟1: 創建確認記錄 ===')
      
      // 1. 創建請款確認記錄
      const { data: newConfirmation, error: confirmationError } = await supabase
        .from('payment_confirmations')
        .insert({
          confirmation_date: new Date().toISOString().split('T')[0],
          total_amount: totalAmount,
          total_items: approvedItems.length,
          created_by: userId
        })
        .select()
        .single()

      if (confirmationError) {
        console.error('創建確認記錄失敗:', confirmationError)
        throw confirmationError
      }

      confirmationId = newConfirmation.id
      console.log('✅ 確認記錄創建成功:', newConfirmation)

      console.log('=== 步驟2: 創建確認項目 ===')
      
      // 2. 逐一創建確認項目（避免批次插入失敗）
      const insertedItems = []
      for (let i = 0; i < approvedItems.length; i++) {
        const item = approvedItems[i]
        
        console.log(`插入項目 ${i + 1}/${approvedItems.length}:`, {
          kol_name: item.kol_name,
          project_name: item.project_name,
          service: item.service,
          amount: (item.price || 0) * (item.quantity || 1)
        })

        const itemData = {
          payment_confirmation_id: confirmationId!,
          payment_request_id: item.id,
          amount_at_confirmation: (item.price || 0) * (item.quantity || 1),
          kol_name_at_confirmation: item.kol_name || '未知KOL',
          project_name_at_confirmation: item.project_name || '未知專案',
          service_at_confirmation: item.service || '未知服務'
        }

        const { data: insertedItem, error: itemError } = await supabase
          .from('payment_confirmation_items')
          .insert(itemData)
          .select()
          .single()

        if (itemError) {
          console.error(`插入確認項目 ${i + 1} 失敗:`, itemError)
          console.error('項目資料:', itemData)
          throw new Error(`插入確認項目失敗: ${itemError.message}`)
        }

        insertedItems.push(insertedItem)
        console.log(`✅ 項目 ${i + 1} 插入成功:`, insertedItem.id)
      }

      console.log('=== 步驟3: 刪除已確認申請 ===')
      
      // 3. 刪除已確認的請款申請
      const approvedItemIds = approvedItems.map(item => item.id)
      const { error: deleteError } = await supabase
        .from('payment_requests')
        .delete()
        .in('id', approvedItemIds)

      if (deleteError) {
        console.error('刪除已確認申請失敗:', deleteError)
        throw deleteError
      }

      console.log('✅ 已確認申請刪除成功')
      console.log('=== 請款確認完成 ===')

      // 重新載入資料
      await fetchPaymentRequests()
      toast.success(`✅ 已確認 ${approvedItems.length} 筆請款項目`)

    } catch (error: any) {
      console.error('❌ 事務性確認失敗:', error)
      
      // 🔄 錯誤回滾：清理無效的確認記錄
      if (confirmationId) {
        console.log('🔄 開始回滾操作...')
        try {
          await supabase.from('payment_confirmation_items').delete().eq('payment_confirmation_id', confirmationId)
          await supabase.from('payment_confirmations').delete().eq('id', confirmationId)
          console.log('✅ 回滾完成')
        } catch (rollbackError) {
          console.error('❌ 回滾失敗:', rollbackError)
        }
      }
      
      throw error
    }
  }

  // 強制刷新確認記錄
  const forceRefreshConfirmations = async () => {
    console.log('=== 🔄 強制刷新確認記錄 ===')
    setLoading(true)
    
    try {
      await fetchPaymentConfirmations()
      toast.success('🔄 強制刷新完成')
    } catch (error) {
      console.error('強制刷新失敗:', error)
      toast.error('強制刷新失敗')
    }
    
    setLoading(false)
  }

  // 切換確認清單展開狀態
  const toggleConfirmedExpansion = (index: number) => {
    setConfirmedPayments(prev => prev.map((confirmation, i) => 
      i === index 
        ? { ...confirmation, isExpanded: !confirmation.isExpanded }
        : confirmation
    ))
  }

  // 刪除已確認清單
  const deleteConfirmedPayment = async (confirmationId: string, index: number) => {
    if (!window.confirm('確定要刪除這個請款清單嗎？此操作無法復原。')) return
    
    try {
      // 先刪除關聯項目，再刪除主記錄（因為外鍵約束）
      const { error: itemsError } = await supabase
        .from('payment_confirmation_items')
        .delete()
        .eq('payment_confirmation_id', confirmationId)

      if (itemsError) throw itemsError

      const { error: confirmationError } = await supabase
        .from('payment_confirmations')
        .delete()
        .eq('id', confirmationId)

      if (confirmationError) throw confirmationError

      // 重新載入資料
      await fetchPaymentRequests()
      toast.success('已刪除請款清單')
    } catch (error: any) {
      console.error('刪除請款清單失敗:', error)
      toast.error('刪除失敗: ' + error.message)
    }
  }

  // 按戶名分組項目
  const groupItemsByAccount = (confirmationItems: PaymentConfirmationItem[]): AccountGroup[] => {
    console.log('🔄 處理確認項目分組:', confirmationItems.length, '筆')
    const groups = new Map<string, AccountGroup>()
    
    confirmationItems.forEach(item => {
      // 使用 KOL 名稱作為分組鍵（因為確認時已保存快照）
      const key = item.kol_name_at_confirmation
      
      if (!groups.has(key)) {
        groups.set(key, {
          accountName: item.kol_name_at_confirmation,
          bankName: '銀行資訊', // 快照中沒有銀行詳細資訊，顯示佔位符
          branchName: '分行資訊',
          accountNumber: '帳戶資訊',
          items: [],
          totalAmount: 0,
          isExpanded: false
        })
      }
      
      const group = groups.get(key)!
      
      // 創建顯示項目
      const displayItem: ConfirmationDisplayItem = {
        id: item.payment_request_id,
        project_name: item.project_name_at_confirmation,
        kol_name: item.kol_name_at_confirmation,
        service: item.service_at_confirmation,
        quantity: 1, // 快照中金額已經是總計
        price: item.amount_at_confirmation,
        merge_color: '' // 確認後不需要顯示合併顏色
      }
      
      group.items.push(displayItem)
      group.totalAmount += item.amount_at_confirmation
    })
    
    const result = Array.from(groups.values())
    console.log('✅ 分組結果:', result.length, '個群組')
    return result
  }

  // 檢查項目是否應該顯示操作欄位
  const shouldShowControls = (item: PaymentRequestItem) => {
    return !item.merge_group_id || item.is_merge_leader
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 頁面標題 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">請款申請</h1>
          <p className="text-gray-500 mt-1">審核和管理請款申請</p>
        </div>
        <div className="flex space-x-2">
          <Button 
            onClick={forceRefreshConfirmations}
            variant="outline"
            disabled={loading}
            className="text-blue-600 hover:text-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            強制刷新
          </Button>
          <Button 
            onClick={handlePaymentConfirmation}
            disabled={!paymentRequests.some(item => item.verification_status === 'approved')}
            className="bg-green-600 hover:bg-green-700"
          >
            請款確認
          </Button>
        </div>
      </div>

      {/* 搜尋欄 */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="搜尋專案名稱、KOL名稱或服務項目..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-gray-500">
          待審核 {paymentRequests.filter(r => r.verification_status === 'pending').length} 筆 | 
          已通過 {paymentRequests.filter(r => r.verification_status === 'approved').length} 筆
        </div>
      </div>

      {/* 待審核項目表格 */}
      {filteredRequests.length > 0 && (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b">
            <h3 className="text-lg font-medium">待審核項目</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    專案名稱
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    KOL名稱
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    合作項目
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    數量
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    金額
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    檢核文件
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    檢核
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRequests.map((item) => {
                  const isApproved = item.verification_status === 'approved'
                  const isRejected = item.verification_status === 'rejected'
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-gray-50 ${item.merge_color || ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.project_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.kol_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.service || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.quantity || 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        NT$ {((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          {item.attachment_file_path && (
                            <span className="text-green-600 text-xs">附件</span>
                          )}
                          {item.invoice_number && (
                            <span className="text-blue-600 text-xs">
                              發票: {item.invoice_number}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {shouldShowControls(item) && (
                          <div className="flex items-center space-x-2">
                            {!isApproved && !item.is_editing && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReject(item.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  拒絕
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleApprove(item.id)}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  通過
                                </Button>
                              </>
                            )}
                            
                            {isApproved && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(item.id)}
                                className={item.is_editing ? "bg-blue-50 text-blue-600" : ""}
                              >
                                <Edit3 className="h-4 w-4 mr-1" />
                                {item.is_editing ? '完成編輯' : '編輯'}
                              </Button>
                            )}
                            
                            {isApproved && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                已通過
                              </span>
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
        </div>
      )}

      {/* 已確認請款清單 */}
      {confirmedPayments.length > 0 && (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b">
            <h3 className="text-lg font-medium">
              已確認請款清單 
              <span className="ml-2 text-sm text-gray-500">
                ({confirmedPayments.length} 份清單)
              </span>
            </h3>
          </div>
          <div className="divide-y divide-gray-200">
            {confirmedPayments.map((confirmation, confirmationIndex) => {
              const confirmationItems = confirmation.payment_confirmation_items || []
              const accountGroups = groupItemsByAccount(confirmationItems)
              
              return (
                <div key={confirmation.id} className="p-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded"
                    onClick={() => toggleConfirmedExpansion(confirmationIndex)}
                  >
                    <div className="flex items-center space-x-3">
                      {confirmation.isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                      <FileText className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">請款清單 - {confirmation.confirmation_date}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-sm text-gray-500">
                        {confirmation.total_items} 筆項目 | 
                        實際項目 {confirmationItems.length} 筆 |
                        總金額 NT$ {confirmation.total_amount.toLocaleString()}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConfirmedPayment(confirmation.id, confirmationIndex)
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {confirmation.isExpanded && (
                    <div className="mt-4 space-y-4">
                      {confirmationItems.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                          <p>此確認記錄沒有關聯的項目</p>
                          <p className="text-sm">可能在創建時發生錯誤</p>
                        </div>
                      ) : (
                        accountGroups.map((group, groupIndex) => (
                          <div key={groupIndex} className="border rounded-lg">
                            {/* 戶名標題列 */}
                            <div className="bg-blue-50 p-3 border-b">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <Building2 className="h-5 w-5 text-blue-600" />
                                  <div>
                                    <div className="font-medium text-gray-900">{group.accountName}</div>
                                    <div className="text-sm text-gray-600">
                                      {group.bankName} {group.branchName} | {group.accountNumber}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium text-lg text-blue-600">
                                    NT$ {group.totalAmount.toLocaleString()}
                                  </div>
                                  <div className="text-sm text-gray-500">{group.items.length} 筆項目</div>
                                </div>
                              </div>
                            </div>
                            
                            {/* 項目詳細列表 */}
                            <div className="overflow-x-auto">
                              <table className="min-w-full">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">專案</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">KOL</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">項目</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">數量</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">金額</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {group.items.map((item) => (
                                    <tr key={item.id} className={`text-sm ${item.merge_color || ''}`}>
                                      <td className="px-4 py-2">{item.project_name}</td>
                                      <td className="px-4 py-2">{item.kol_name}</td>
                                      <td className="px-4 py-2">{item.service}</td>
                                      <td className="px-4 py-2">{item.quantity}</td>
                                      <td className="px-4 py-2">NT$ {(item.price || 0).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 空狀態 */}
      {filteredRequests.length === 0 && confirmedPayments.length === 0 && (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">沒有請款申請</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? '沒有符合搜尋條件的資料' : '目前沒有待審核的請款申請'}
          </p>
        </div>
      )}
    </div>
  )
}