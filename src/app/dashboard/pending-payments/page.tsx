'use client'

import { useState, useEffect } from 'react'
import supabase from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PendingPaymentFileModal } from '@/components/pending-payments/PendingPaymentFileModal'
import { 
  Search, Paperclip, Receipt, CheckCircle, Trash2, AlertCircle, 
  FileText, DollarSign, Users, Eye, X, ExternalLink 
} from 'lucide-react'
import { toast } from 'sonner' // 使用 sonner 而不是 react-hot-toast

// 類型定義
interface PendingPaymentAttachment { 
  name: string; 
  url: string; 
  path: string; 
  uploadedAt: string;
  size: number;
}

interface PendingPaymentItem {
  id: string
  service: string
  price: number
  quantity: number
  quotations: { 
    id: string
    project_name: string
    status: string
    clients: { name: string } | null 
  } | null
  kols: {
    id: string
    name: string
    real_name: string
    bank_info: any
  } | null
  merge_type: 'account' | null
  merge_group_id: string | null
  is_merge_leader: boolean
  merge_color: string
  rejection_reason: string | null
  is_selected: boolean
  invoice_number_input: string | null
  attachments: PendingPaymentAttachment[]
}

const MERGE_COLORS = ['bg-red-100', 'bg-blue-100', 'bg-green-100', 'bg-yellow-100', 'bg-purple-100', 'bg-pink-100']

export default function PendingPaymentsPage() {
  const [items, setItems] = useState<PendingPaymentItem[]>([])
  const [filteredItems, setFilteredItems] = useState<PendingPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
  const [selectedMergeType, setSelectedMergeType] = useState<'account' | null>(null)
  
  // 檔案管理相關狀態
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [selectedItemForFile, setSelectedItemForFile] = useState<PendingPaymentItem | null>(null)

  // 載入待請款項目
  const fetchPendingItems = async () => {
    setLoading(true)
    try {
      // 第一步：查詢已經提交的 payment_requests，取得所有的 quotation_item_id
      const { data: existingRequests, error: requestError } = await supabase
        .from('payment_requests')
        .select('quotation_item_id')
        .in('verification_status', ['pending', 'approved', 'confirmed'])

      if (requestError) throw requestError

      // 取得已提交的項目 ID
      const submittedItemIds = existingRequests?.map(req => req.quotation_item_id) || []

      // 第二步：查詢所有已簽約的 quotation_items
      const { data, error } = await supabase
        .from('quotation_items')
        .select(`
          id, service, price, quantity,
          quotations!inner (
            id, project_name, status,
            clients (name)
          ),
          kols (id, name, real_name, bank_info)
        `)
        .eq('quotations.status', '已簽約')

      if (error) throw error

      // 在前端過濾掉已提交的項目
      const filteredData = (data || []).filter(item => 
        !submittedItemIds.includes(item.id)
      )

      // 從 localStorage 載入已保存的附件、發票號碼和駁回原因
      const savedAttachments = JSON.parse(localStorage.getItem('pendingPaymentAttachments') || '{}')
      const savedInvoiceNumbers = JSON.parse(localStorage.getItem('pendingPaymentInvoiceNumbers') || '{}')
      const savedRejectionReasons = JSON.parse(localStorage.getItem('rejectionReasons') || '{}')

      const processedItems: PendingPaymentItem[] = filteredData.map(item => ({
        ...item,
        quotations: Array.isArray(item.quotations) 
          ? {
              ...item.quotations[0],
              clients: Array.isArray(item.quotations[0]?.clients) 
                ? item.quotations[0].clients[0] || null
                : item.quotations[0]?.clients || null
            }
          : item.quotations && typeof item.quotations === 'object'
          ? {
              ...item.quotations,
              clients: Array.isArray(item.quotations.clients) 
                ? item.quotations.clients[0] || null
                : item.quotations.clients || null
            }
          : null,
        merge_type: null,
        merge_group_id: null,
        is_merge_leader: false,
        merge_color: '',
        rejection_reason: null,
        is_selected: false,
        invoice_number_input: savedInvoiceNumbers[item.id] || null,
        attachments: savedAttachments[item.id] || []
      }))

      setItems(processedItems)
      setFilteredItems(processedItems)
    } catch (error: any) {
      console.error('載入待請款項目失敗:', error)
      toast.error('載入資料失敗: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingItems()
  }, [])

  // 搜尋功能
  useEffect(() => {
    const filtered = items.filter(item =>
      (item.quotations?.project_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.kols?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.quotations?.clients?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredItems(filtered)
  }, [searchTerm, items])

  // 檢查項目是否可以勾選申請付款
  const canSelectForPayment = (item: PendingPaymentItem): boolean => {
    const hasAttachments = item.attachments && item.attachments.length > 0
    const hasInvoiceNumber = item.invoice_number_input && item.invoice_number_input.trim().length > 0
    return hasAttachments || hasInvoiceNumber
  }

  // 申請付款勾選處理，加入驗證
  const handlePaymentSelection = (itemId: string, isSelected: boolean) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return

    // 如果要勾選，先檢查是否符合條件
    if (isSelected && !canSelectForPayment(item)) {
      toast.error('申請付款請檢附文件或填入發票號碼')
      return
    }

    if (item.merge_group_id) {
      setItems(prev => prev.map(i => 
        i.merge_group_id === item.merge_group_id 
          ? { ...i, is_selected: isSelected } 
          : i
      ))
    } else {
      setItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, is_selected: isSelected } 
          : i
      ))
    }
  }

  // 檔案管理相關函數
  const openFileModal = (item: PendingPaymentItem) => {
    setSelectedItemForFile(item)
    setFileModalOpen(true)
  }

  const handleFileModalClose = () => {
    setFileModalOpen(false)
    setSelectedItemForFile(null)
  }

  // 清除駁回原因
  const clearRejectionReason = (itemId: string) => {
    const savedRejectionReasons = JSON.parse(localStorage.getItem('rejectionReasons') || '{}')
    delete savedRejectionReasons[itemId]
    localStorage.setItem('rejectionReasons', JSON.stringify(savedRejectionReasons))
    
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, rejection_reason: null }
        : item
    ))
    
    toast.success('已清除駁回原因')
  }

  const handleFileUpdate = (itemId: string, attachments: PendingPaymentAttachment[]) => {
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, attachments } 
        : item
    ))
    
    // 保存到 localStorage
    const savedAttachments = JSON.parse(localStorage.getItem('pendingPaymentAttachments') || '{}')
    savedAttachments[itemId] = attachments
    localStorage.setItem('pendingPaymentAttachments', JSON.stringify(savedAttachments))
  }

  // 發票號碼變更處理
  const handleInvoiceNumberChange = (itemId: string, invoiceNumber: string) => {
    setItems(prev => prev.map(item => {
      if (item.merge_group_id) {
        if (item.merge_group_id === items.find(i => i.id === itemId)?.merge_group_id) {
          return { ...item, invoice_number_input: invoiceNumber }
        }
        return item
      } else if (item.id === itemId) {
        return { ...item, invoice_number_input: invoiceNumber }
      }
      return item
    }))
    
    // 保存到 localStorage
    const savedInvoiceNumbers = JSON.parse(localStorage.getItem('pendingPaymentInvoiceNumbers') || '{}')
    savedInvoiceNumbers[itemId] = invoiceNumber
    localStorage.setItem('pendingPaymentInvoiceNumbers', JSON.stringify(savedInvoiceNumbers))
  }

  // 銀行資訊處理函數（簡化版，只用於帳戶合併）
  const getBankInfo = (kol: any) => {
    if (!kol) return null
    
    const bankInfo = kol.bank_info
    if (!bankInfo || typeof bankInfo !== 'object') return null
    
    // 統一處理為帳戶資訊，用於合併比對
    return {
      accountName: bankInfo.companyAccountName || kol.real_name || kol.name,
      bankName: bankInfo.bankName,
      branchName: bankInfo.branchName,
      accountNumber: bankInfo.accountNumber
    }
  }

  // 合併功能
  const handleMergeTypeChange = () => {
    if (selectedMergeType === 'account') {
      setSelectedMergeType(null)
      setSelectedForMerge([])
    } else {
      setSelectedMergeType('account')
      setSelectedForMerge([])
    }
  }

  const handleMergeSelection = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedForMerge(prev => [...prev, itemId])
    } else {
      setSelectedForMerge(prev => prev.filter(id => id !== itemId))
    }
  }

  const canMergeWith = (item: PendingPaymentItem) => {
    if (!selectedMergeType || selectedForMerge.length === 0) return true
    
    const firstSelectedItem = items.find(i => i.id === selectedForMerge[0])
    if (!firstSelectedItem) return true
    
    const firstBankInfo = getBankInfo(firstSelectedItem.kols)
    const currentBankInfo = getBankInfo(item.kols)
    
    if (!firstBankInfo || !currentBankInfo) return false
    
    // 只保留帳戶合併邏輯
    return firstBankInfo.accountName === currentBankInfo.accountName && 
           firstBankInfo.bankName === currentBankInfo.bankName && 
           firstBankInfo.accountNumber === currentBankInfo.accountNumber
  }

  const handleMerge = () => {
    if (selectedForMerge.length < 2) {
      toast.error('請選擇至少兩筆資料進行合併')
      return
    }
    
    if (!window.confirm('你是否確認合併申請？')) return
    
    const groupId = Date.now().toString()
    const colorIndex = items.filter(i => i.merge_group_id).length % MERGE_COLORS.length
    const mergeColor = MERGE_COLORS[colorIndex]
    
    setItems(prev => prev.map(item => {
      if (selectedForMerge.includes(item.id)) {
        return {
          ...item,
          merge_type: 'account',
          merge_group_id: groupId,
          is_merge_leader: item.id === selectedForMerge[0],
          merge_color: mergeColor
        }
      }
      return item
    }))
    
    setSelectedForMerge([])
    setSelectedMergeType(null)
    toast.success(`已合併 ${selectedForMerge.length} 筆資料`)
  }

  const handleUnmerge = (groupId: string) => {
    if (!window.confirm('確定要解除合併嗎？此操作將一併清除駁回原因。')) return
    
    // 從 localStorage 清除相關資料
    const rejectionReasons = JSON.parse(localStorage.getItem('rejectionReasons') || '{}')
    const savedAttachments = JSON.parse(localStorage.getItem('pendingPaymentAttachments') || '{}')
    const savedInvoiceNumbers = JSON.parse(localStorage.getItem('pendingPaymentInvoiceNumbers') || '{}')
    
    const itemsToClean = items.filter(i => i.merge_group_id === groupId)
    itemsToClean.forEach(item => {
      delete rejectionReasons[item.id]
      delete savedAttachments[item.id]
      delete savedInvoiceNumbers[item.id]
    })
    
    localStorage.setItem('rejectionReasons', JSON.stringify(rejectionReasons))
    localStorage.setItem('pendingPaymentAttachments', JSON.stringify(savedAttachments))
    localStorage.setItem('pendingPaymentInvoiceNumbers', JSON.stringify(savedInvoiceNumbers))

    // 更新當前頁面狀態
    setItems(prev => prev.map(item => {
      if (item.merge_group_id === groupId) {
        return { 
          ...item, 
          merge_type: null, 
          merge_group_id: null, 
          is_merge_leader: false, 
          merge_color: '',
          rejection_reason: null,
          attachments: [],
          invoice_number_input: null
        }
      }
      return item
    }))
    toast.success('已解除合併')
  }

  // 提交請款申請，包含附件處理
  const handleConfirmUpload = async () => {
    const initiallySelectedItems = items.filter(item => item.is_selected)
    if (initiallySelectedItems.length === 0) {
      toast.error('請選擇要申請付款的項目')
      return
    }
    
    // 驗證所有選中項目都符合條件
    const invalidItems = initiallySelectedItems.filter(item => !canSelectForPayment(item))
    if (invalidItems.length > 0) {
      toast.error('部分選中項目缺少檢核文件或發票號碼，請補齊後再提交')
      return
    }
    
    const itemsToSubmitMap = new Map<string, PendingPaymentItem>()
    initiallySelectedItems.forEach(item => {
      if (item.merge_group_id) {
        items.forEach(member => {
          if (member.merge_group_id === item.merge_group_id) {
            itemsToSubmitMap.set(member.id, member)
          }
        })
      } else {
        itemsToSubmitMap.set(item.id, item)
      }
    })
    const finalItemsToSubmit = Array.from(itemsToSubmitMap.values())
    
    if (finalItemsToSubmit.length === 0) {
      toast.error('請選擇有效的項目')
      return
    }

    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('無法獲取使用者資訊')
      
      const itemIds = finalItemsToSubmit.map(item => item.id)
      const { data: existingRequests, error: checkError } = await supabase
        .from('payment_requests')
        .select('quotation_item_id')
        .in('quotation_item_id', itemIds)
      
      if (checkError) throw new Error('檢查重複申請失敗: ' + checkError.message)
      if (existingRequests && existingRequests.length > 0) {
        toast.error('部分項目已提交過，請重新整理')
        await fetchPendingItems()
        setUploading(false)
        return
      }

      const currentDate = new Date().toISOString().split('T')[0]
      const paymentRequestsData = finalItemsToSubmit.map(item => ({
        quotation_item_id: item.id,
        verification_status: 'pending' as const,
        request_date: currentDate,
        merge_type: item.merge_type || null,
        merge_group_id: item.merge_group_id || null,
        is_merge_leader: item.is_merge_leader || false,
        merge_color: item.merge_color || null,
        // 處理附件：將附件陣列轉為JSON存儲
        attachment_file_path: item.attachments && item.attachments.length > 0 
          ? JSON.stringify(item.attachments) 
          : null,
        invoice_number: item.invoice_number_input?.trim() || null
      }))

      const { data: insertedData, error: insertError } = await supabase
        .from('payment_requests')
        .insert(paymentRequestsData)
        .select()
      
      if (insertError) throw new Error('插入請款申請失敗: ' + insertError.message)
      if (!insertedData || insertedData.length !== finalItemsToSubmit.length) {
        throw new Error('插入操作返回資料量與預期不符')
      }

      // 清理 localStorage 的駁回原因和暫存資料
      const rejectionReasons = JSON.parse(localStorage.getItem('rejectionReasons') || '{}')
      const savedAttachments = JSON.parse(localStorage.getItem('pendingPaymentAttachments') || '{}')
      const savedInvoiceNumbers = JSON.parse(localStorage.getItem('pendingPaymentInvoiceNumbers') || '{}')
      
      let reasonsChanged = false
      let attachmentsChanged = false
      let invoiceNumbersChanged = false
      
      finalItemsToSubmit.forEach(item => {
        if (rejectionReasons[item.id]) {
          delete rejectionReasons[item.id]
          reasonsChanged = true
        }
        if (savedAttachments[item.id]) {
          delete savedAttachments[item.id]
          attachmentsChanged = true
        }
        if (savedInvoiceNumbers[item.id]) {
          delete savedInvoiceNumbers[item.id]
          invoiceNumbersChanged = true
        }
      })
      
      if (reasonsChanged) {
        localStorage.setItem('rejectionReasons', JSON.stringify(rejectionReasons))
      }
      if (attachmentsChanged) {
        localStorage.setItem('pendingPaymentAttachments', JSON.stringify(savedAttachments))
      }
      if (invoiceNumbersChanged) {
        localStorage.setItem('pendingPaymentInvoiceNumbers', JSON.stringify(savedInvoiceNumbers))
      }

      setSelectedForMerge([])
      setSelectedMergeType(null)
      await fetchPendingItems()
      toast.success(`✅ 已成功提交 ${finalItemsToSubmit.length} 筆請款申請`)
    } catch (error: any) {
      toast.error(error.message || '提交請款申請失敗')
    } finally {
      setUploading(false)
    }
  }

  const shouldShowControls = (item: PendingPaymentItem) => !item.merge_group_id || item.is_merge_leader

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 頁面標頭 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">待請款管理</h1>
          <p className="text-gray-500 mt-1">管理已簽約專案的請款項目</p>
        </div>
        <Button 
          onClick={handleConfirmUpload} 
          disabled={uploading || !items.some(item => item.is_selected)} 
          className="bg-green-600 hover:bg-green-700"
        >
          {uploading ? '上傳中...' : <>
            <DollarSign className="mr-2 h-4 w-4" />
            申請付款
          </>}
        </Button>
      </div>

      {/* 搜尋和合併控制 */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="搜尋專案名稱、KOL名稱或服務項目..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant={selectedMergeType === 'account' ? 'default' : 'outline'}
            size="sm"
            onClick={handleMergeTypeChange}
          >
            合併申請
          </Button>
          {selectedForMerge.length >= 2 && (
            <Button variant="default" size="sm" onClick={handleMerge}>
              確認合併 ({selectedForMerge.length})
            </Button>
          )}
        </div>
        
        <div className="text-sm text-gray-500">
          共 {filteredItems.length} 筆資料
        </div>
      </div>

      {/* 資料表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  專案名稱
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  KOL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  合作項目
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  金額
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  合併
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  檢核文件
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  申請付款
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const bankInfo = getBankInfo(item.kols)
                const canSelect = canSelectForPayment(item)
                
                return (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-gray-50 ${item.merge_color}`}
                  >
                    {/* 專案名稱 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                      <div>
                        <div className="font-medium text-gray-900">
                          {item.quotations?.project_name || 'N/A'}
                        </div>
                        {/* 駁回原因提醒 */}
                        {item.rejection_reason && shouldShowControls(item) && (
                          <div className="mt-2 bg-red-50 border border-red-200 rounded-md p-2">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start">
                                <AlertCircle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs font-semibold text-red-800">
                                    {item.merge_group_id ? '群組駁回原因' : '駁回原因'}
                                  </p>
                                  <p className="text-xs text-red-700 whitespace-pre-wrap">
                                    {item.rejection_reason}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => clearRejectionReason(item.id)}
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                title="清除駁回原因"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* KOL */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                      <div className="font-medium text-gray-900">{item.kols?.name || '自訂項目'}</div>
                    </td>

                    {/* 合作項目 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                      <div>{item.service}</div>
                    </td>

                    {/* 金額 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                      <div className="font-medium text-gray-900">
                        NT$ {((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                      </div>
                    </td>

                    {/* 合併 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                      <div className="flex flex-col space-y-2">
                        {selectedMergeType && canMergeWith(item) && !item.merge_group_id && (
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedForMerge.includes(item.id)}
                              onChange={(e) => handleMergeSelection(item.id, e.target.checked)}
                              className="mr-1"
                            />
                            <span className="text-xs">選擇合併</span>
                          </label>
                        )}
                        {item.merge_group_id && (
                          <div className="text-xs">
                            <span className="bg-blue-100 px-2 py-1 rounded">
                              合併申請
                              {item.is_merge_leader && ' (主)'}
                            </span>
                            {item.is_merge_leader && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnmerge(item.merge_group_id!)}
                                className="text-red-600 mt-1"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                解除
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 檢核文件 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                      {shouldShowControls(item) && (
                        <div className="flex items-center space-x-3">
                          {/* 附件管理 */}
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openFileModal(item)}
                              className="text-xs"
                            >
                              <Paperclip className="h-3 w-3 mr-1" />
                              附件
                            </Button>
                            {item.attachments && item.attachments.length > 0 && (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                          </div>
                          
                          {/* 發票號碼 */}
                          <div className="flex items-center space-x-1">
                            <Receipt className="h-3 w-3 text-gray-400" />
                            <Input
                              placeholder="發票號碼"
                              className="w-20 text-xs h-7"
                              value={item.invoice_number_input || ''}
                              onChange={(e) => handleInvoiceNumberChange(item.id, e.target.value)}
                            />
                            {item.invoice_number_input?.trim() && (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 申請付款 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                      {shouldShowControls(item) && (
                        <div className="flex flex-col items-center space-y-1">
                          <input
                            type="checkbox"
                            checked={item.is_selected || false}
                            onChange={(e) => handlePaymentSelection(item.id, e.target.checked)}
                            className="h-4 w-4 text-indigo-600"
                            disabled={!canSelect} // 不符合條件時禁用
                          />
                          {/* 簡化的驗證狀態指示 */}
                          {!canSelect && (
                            <div className="text-xs text-red-600">
                              需檢附
                            </div>
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

        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">沒有待請款項目</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? '沒有符合搜尋條件的資料' : '所有已簽約項目皆已進入請款流程'}
            </p>
          </div>
        )}
      </div>

      {/* 檔案管理對話框 */}
      {selectedItemForFile && (
        <PendingPaymentFileModal
          isOpen={fileModalOpen}
          onClose={handleFileModalClose}
          itemId={selectedItemForFile.id}
          projectName={selectedItemForFile.quotations?.project_name || '未知專案'}
          currentAttachments={selectedItemForFile.attachments || []}
          onUpdate={handleFileUpdate}
        />
      )}
    </div>
  )
}