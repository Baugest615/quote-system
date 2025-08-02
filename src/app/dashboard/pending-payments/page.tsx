'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusCircle, Search, Upload, Paperclip, Receipt, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

// 類型定義
type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type Quotation = Database['public']['Tables']['quotations']['Row']
type Kol = Database['public']['Tables']['kols']['Row']
type PaymentRequest = Database['public']['Tables']['payment_requests']['Row']

type PendingPaymentItem = QuotationItem & {
  quotations: Pick<Quotation, 'project_name' | 'id' | 'status'>
  kols: (Pick<Kol, 'name' | 'real_name' | 'bank_info'>) | null
  // 來自 payment_requests 的欄位
  payment_request?: PaymentRequest | null
  // 新增的請款相關欄位（用於前端狀態）
  attachment_file?: File | null
  invoice_number_input?: string
  is_selected?: boolean
  // 合併相關欄位（來自 payment_requests）
  merge_type?: 'company' | 'account' | null
  merge_group_id?: string | null
  is_merge_leader?: boolean
  merge_color?: string
}

// 預定義的合併顏色
const MERGE_COLORS = [
  'bg-blue-50',
  'bg-green-50', 
  'bg-yellow-50',
  'bg-purple-50',
  'bg-pink-50',
  'bg-indigo-50',
  'bg-gray-50',
  'bg-red-50'
]

export default function PendingPaymentsPage() {
  const [items, setItems] = useState<PendingPaymentItem[]>([])
  const [filteredItems, setFilteredItems] = useState<PendingPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<string>('project_name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [uploading, setUploading] = useState(false)
  const [selectedMergeType, setSelectedMergeType] = useState<'company' | 'account' | null>(null)
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])

  // 載入已簽約報價單的項目資料
  const fetchPendingItems = useCallback(async () => {
    setLoading(true)
    try {
      // 1. 載入已簽約但未申請請款的項目
      const { data: quotationItems, error: quotationError } = await supabase
        .from('quotation_items')
        .select(`
          *,
          quotations!inner (id, project_name, status),
          kols (name, real_name, bank_info)
        `)
        .eq('quotations.status', '已簽約')
        .order('created_at', { ascending: false })

      if (quotationError) throw quotationError

      // 2. 載入這些項目的請款申請狀態
      const itemIds = quotationItems?.map(item => item.id) || []
      const { data: paymentRequests, error: paymentError } = await supabase
        .from('payment_requests')
        .select('*')
        .in('quotation_item_id', itemIds)

      if (paymentError) throw paymentError

      // 3. 合併資料並過濾掉已申請的項目
      const requestedItemIds = new Set(paymentRequests?.map(req => req.quotation_item_id) || [])
      
      const pendingItems = (quotationItems || [])
        .filter(item => !requestedItemIds.has(item.id))
        .map(item => ({
          ...item,
          payment_request: null,
          is_selected: false,
          merge_type: null,
          merge_group_id: null,
          is_merge_leader: false,
          merge_color: '',
          invoice_number_input: ''
        })) as PendingPaymentItem[]

      setItems(pendingItems)
      setFilteredItems(pendingItems)
    } catch (error: any) {
      console.error('Error fetching pending items:', error)
      toast.error('載入待請款資料失敗: ' + error.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPendingItems()
  }, [fetchPendingItems])

  // 搜尋功能
  useEffect(() => {
    const filtered = items.filter((item) => {
      const projectName = item.quotations?.project_name || ''
      const kolName = item.kols?.name || ''
      const service = item.service || ''
      
      return projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             kolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             service.toLowerCase().includes(searchTerm.toLowerCase())
    })
    setFilteredItems(filtered)
  }, [items, searchTerm])

  // 排序功能
  const handleSort = (field: string) => {
    const direction = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortField(field)
    setSortDirection(direction)
    
    const sorted = [...filteredItems].sort((a, b) => {
      // 先按合併群組排序
      if (a.merge_group_id && b.merge_group_id && a.merge_group_id === b.merge_group_id) {
        return a.is_merge_leader ? -1 : 1
      }
      
      let aValue: any = ''
      let bValue: any = ''
      
      switch (field) {
        case 'project_name':
          aValue = a.quotations?.project_name || ''
          bValue = b.quotations?.project_name || ''
          break
        case 'kol_name':
          aValue = a.kols?.name || ''
          bValue = b.kols?.name || ''
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
    
    setFilteredItems(sorted)
  }

  // 取得銀行資訊
  const getBankInfo = (kol: PendingPaymentItem['kols']) => {
    if (!kol?.bank_info) return null
    const bankInfo = kol.bank_info as any
    return {
      bankType: bankInfo.bankType,
      companyName: bankInfo.companyAccountName,
      accountName: bankInfo.bankType === 'company' ? bankInfo.companyAccountName : kol.real_name,
      bankName: bankInfo.bankName,
      branchName: bankInfo.branchName,
      accountNumber: bankInfo.accountNumber
    }
  }

  // 處理合併類型選擇
  const handleMergeTypeChange = (type: 'company' | 'account') => {
    if (selectedMergeType === type) {
      setSelectedMergeType(null)
      setSelectedForMerge([])
    } else {
      setSelectedMergeType(type)
      setSelectedForMerge([])
    }
  }

  // 處理合併選擇
  const handleMergeSelection = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedForMerge(prev => [...prev, itemId])
    } else {
      setSelectedForMerge(prev => prev.filter(id => id !== itemId))
    }
  }

  // 檢查項目是否可以合併
  const canMergeWith = (item: PendingPaymentItem) => {
    if (!selectedMergeType || selectedForMerge.length === 0) return true
    
    const firstSelectedItem = items.find(i => i.id === selectedForMerge[0])
    if (!firstSelectedItem) return true
    
    const firstBankInfo = getBankInfo(firstSelectedItem.kols)
    const currentBankInfo = getBankInfo(item.kols)
    
    if (!firstBankInfo || !currentBankInfo) return false
    
    if (selectedMergeType === 'company') {
      return firstBankInfo.bankType === 'company' && 
             currentBankInfo.bankType === 'company' &&
             firstBankInfo.companyName === currentBankInfo.companyName
    } else {
      return firstBankInfo.accountName === currentBankInfo.accountName &&
             firstBankInfo.bankName === currentBankInfo.bankName &&
             firstBankInfo.accountNumber === currentBankInfo.accountNumber
    }
  }

  // 執行合併
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
        const isLeader = item.id === selectedForMerge[0]
        return {
          ...item,
          merge_group_id: groupId,
          merge_type: selectedMergeType,
          is_merge_leader: isLeader,
          merge_color: mergeColor
        }
      }
      return item
    }))

    setSelectedMergeType(null)
    setSelectedForMerge([])
    toast.success('合併成功')
  }

  // 解除合併
  const handleUnmerge = (groupId: string) => {
    setItems(prev => prev.map(item => {
      if (item.merge_group_id === groupId) {
        return {
          ...item,
          merge_group_id: null,
          merge_type: null,
          is_merge_leader: false,
          merge_color: '',
          is_selected: false
        } as PendingPaymentItem
      }
      return item
    }))
    toast.success('已解除合併')
  }

  // 檔案上傳處理
  const handleFileUpload = async (itemId: string, file: File) => {
    if (!file) return

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `payment-documents/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      setItems(prev => prev.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              attachment_file: file,
              payment_request: {
                ...item.payment_request,
                attachment_file_path: filePath
              } as any
            }
          : item
      ))

      toast.success('檔案上傳成功')
    } catch (error: any) {
      console.error('Upload error:', error)
      toast.error('檔案上傳失敗: ' + error.message)
    }
  }

  // 發票號碼輸入處理
  const handleInvoiceNumberChange = (itemId: string, invoiceNumber: string) => {
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            invoice_number_input: invoiceNumber
          }
        : item
    ))
  }

  // 申請付款勾選處理
  const handlePaymentSelection = (itemId: string, isSelected: boolean) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return

    // 如果是合併狀態且不是領導者，不允許操作
    if (item.merge_group_id && !item.is_merge_leader) {
      return
    }

    // 檢查是否有檢核文件
    const hasDocument = item.attachment_file || item.invoice_number_input?.trim()
    
    if (isSelected && !hasDocument) {
      toast.error('請確認請款資料已檢附')
      return
    }

    // 如果是合併的領導者，需要一起更新整個群組
    if (item.merge_group_id && item.is_merge_leader) {
      setItems(prev => prev.map(i => 
        i.merge_group_id === item.merge_group_id ? { ...i, is_selected: isSelected } : i
      ))
    } else {
      setItems(prev => prev.map(i => 
        i.id === itemId ? { ...i, is_selected: isSelected } : i
      ))
    }
  }

  // 確認上傳（送到請款申請）
  const handleConfirmUpload = async () => {
    const selectedItems = items.filter(item => item.is_selected)
    
    if (selectedItems.length === 0) {
      toast.error('請選擇要申請付款的項目')
      return
    }

    setUploading(true)
    try {
      // 獲取當前使用者ID
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('無法獲取使用者資訊')
      }

      // 準備請款申請資料
      const paymentRequestsData = selectedItems.map(item => ({
        quotation_item_id: item.id,
        verification_status: 'pending' as const,
        merge_type: item.merge_type,
        merge_group_id: item.merge_group_id,
        is_merge_leader: item.is_merge_leader || false,
        merge_color: item.merge_color,
        attachment_file_path: item.payment_request?.attachment_file_path || null,
        invoice_number: item.invoice_number_input?.trim() || null
      }))

      // 插入請款申請
      const { error: insertError } = await supabase
        .from('payment_requests')
        .insert(paymentRequestsData)

      if (insertError) throw insertError
      
      // 重新載入資料
      await fetchPendingItems()
      
      toast.success(`已成功送出 ${selectedItems.length} 筆請款申請`)
    } catch (error: any) {
      console.error('送出請款申請失敗:', error)
      toast.error('送出請款申請失敗: ' + error.message)
    }
    setUploading(false)
  }

  // 檢查項目是否應該顯示操作欄位
  const shouldShowControls = (item: PendingPaymentItem) => {
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
          <h1 className="text-3xl font-bold">待請款管理</h1>
          <p className="text-gray-500 mt-1">管理已簽約專案的請款項目</p>
        </div>
        <Button 
          onClick={handleConfirmUpload}
          disabled={uploading || !items.some(item => item.is_selected)}
          className="bg-green-600 hover:bg-green-700"
        >
          {uploading ? '上傳中...' : '確認上傳'}
        </Button>
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
          共 {filteredItems.length} 筆資料
        </div>
      </div>

      {/* 合併控制區域 */}
      {!selectedMergeType && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3">合併設定</h4>
          <div className="flex space-x-4">
            <Button
              variant="outline"
              onClick={() => handleMergeTypeChange('company')}
              className="bg-white"
            >
              同公司合併
            </Button>
            <Button
              variant="outline"
              onClick={() => handleMergeTypeChange('account')}
              className="bg-white"
            >
              同戶名合併
            </Button>
          </div>
        </div>
      )}

      {selectedMergeType && (
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">
                {selectedMergeType === 'company' ? '同公司合併模式' : '同戶名合併模式'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                已選擇 {selectedForMerge.length} 筆資料
              </p>
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={handleMerge}
                disabled={selectedForMerge.length < 2}
                className="bg-blue-600 hover:bg-blue-700"
              >
                合併
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedMergeType(null)}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 資料表格 */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('project_name')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                  >
                    <span>專案名稱</span>
                    {sortField === 'project_name' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('kol_name')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                  >
                    <span>KOL名稱</span>
                    {sortField === 'kol_name' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('service')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                  >
                    <span>合作項目</span>
                    {sortField === 'service' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  數量
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('amount')}
                    className="flex items-center space-x-1 hover:text-gray-700"
                  >
                    <span>金額</span>
                    {sortField === 'amount' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
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
              {filteredItems.map((item) => (
                <tr 
                  key={item.id} 
                  className={`hover:bg-gray-50 ${item.merge_color}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.quotations?.project_name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.kols?.name || '-'}
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
                    {shouldShowControls(item) && (
                      <div className="flex items-center space-x-2">
                        {!item.merge_group_id && selectedMergeType && (
                          <input
                            type="checkbox"
                            checked={selectedForMerge.includes(item.id)}
                            disabled={!canMergeWith(item)}
                            onChange={(e) => handleMergeSelection(item.id, e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50"
                          />
                        )}
                        {item.merge_group_id && item.is_merge_leader && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnmerge(item.merge_group_id!)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            解除
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {shouldShowControls(item) && (
                      <div className="flex items-center space-x-2">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleFileUpload(item.id, file)
                            }}
                          />
                          <Button variant="outline" size="sm" type="button">
                            <Paperclip className="h-4 w-4 mr-1" />
                            上傳附件
                          </Button>
                        </label>
                        
                        <div className="flex items-center space-x-1">
                          <Receipt className="h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="發票號碼"
                            className="w-24 text-xs"
                            value={item.invoice_number_input || ''}
                            onChange={(e) => handleInvoiceNumberChange(item.id, e.target.value)}
                          />
                        </div>
                        
                        {(item.attachment_file || item.invoice_number_input?.trim()) && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {shouldShowControls(item) && (
                      <input
                        type="checkbox"
                        checked={item.is_selected || false}
                        disabled={item.merge_group_id !== null && !item.is_merge_leader}
                        onChange={(e) => handlePaymentSelection(item.id, e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">沒有待請款項目</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? '沒有符合搜尋條件的資料' : '目前沒有已簽約的專案項目或項目已申請請款'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}