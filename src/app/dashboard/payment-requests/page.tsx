'use client'

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Link as LinkIcon, Eye, Download, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import supabase from '@/lib/supabase/client'

// Hooks
import { usePaymentData } from '@/hooks/payments/usePaymentData'
import { usePaymentFilters } from '@/hooks/payments/usePaymentFilters'
import { usePaymentActions } from '@/hooks/payments/usePaymentActions'

// Components
import { LoadingState, EmptyState } from '@/components/payments/shared'
import { RequestItemRow, ApprovalControls } from '@/components/payments/requests'
import type { PaymentRequestItem } from '@/lib/payments/types'

// --- 檔案檢視 Modal ---
const FileViewerModal = ({ isOpen, onClose, request }: {
  isOpen: boolean
  onClose: () => void
  request: PaymentRequestItem | null
}) => {
  if (!request) return null
  const [downloadError, setDownloadError] = useState<string | null>(null)

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
    } catch (error: any) {
      setDownloadError(error.message)
      toast.error(`檔案操作失敗: ${error.message}`)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`檢視附件 - ${request.quotations?.project_name || '未命名專案'}`}>
      <div className="space-y-4">
        {downloadError && <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{downloadError}</div>}
        {request.attachments && request.attachments.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {request.attachments.map((file, index) => (
              <div key={index} className="bg-gray-50 p-3 rounded-lg border flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate text-sm" title={file.name}>
                    <LinkIcon className="h-3 w-3 inline-block mr-2" />{file.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
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
          <div className="text-center py-8 text-gray-500">
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
  // 1. 資料管理 Hook
  const fetchPaymentRequests = useCallback(async () => {
    // 自定義獲取邏輯
    const { data, error } = await supabase
      .from('payment_requests_with_details')
      .select('*')
      .eq('verification_status', 'pending')
      .order('request_date', { ascending: false })

    if (error) throw error

    // 轉換資料格式
    return (data || []).map(item => ({
      ...item,
      id: item.quotation_item_id, // 使用 quotation_item_id 作為主要 ID
      payment_request_id: item.id,
      quotations: {
        project_name: item.project_name || '',
        client_id: null,
        clients: { name: item.client_name || '' }
      },
      kols: {
        id: item.kol_id || '',
        name: item.kol_name || '',
        real_name: null,
        bank_info: null
      },
      service: item.service_item || '',
      price: 0,
      quantity: 1,
      cost: item.cost_amount,
      remark: null,
      created_at: item.request_date,
      attachments: item.attachment_file_path ? JSON.parse(item.attachment_file_path) : [],
      parsed_attachments: item.attachment_file_path ? JSON.parse(item.attachment_file_path) : []
    })) as PaymentRequestItem[]
  }, [])

  const paymentDataOptions = useMemo(() => ({
    autoRefresh: false
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

  // 2. 篩選 Hook
  const {
    searchTerm,
    setSearchTerm,
    filteredItems
  } = usePaymentFilters(items, {
    searchFields: ['quotations', 'kols', 'service']
  })

  // 3. 操作 Hook
  const {
    selectedItems,
    isProcessing,
    toggleSelection,
    selectAll,
    deselectAll,
    handleBatchAction
  } = usePaymentActions(items, setData)

  // 4. 本地狀態
  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequestItem | null>(null)

  // 處理核准
  const handleApprove = async (item: PaymentRequestItem) => {
    if (!confirm(`確定要核准 "${item.quotations?.project_name} - ${item.service}" 的請款申請嗎？`)) return

    try {
      const { error } = await supabase.rpc('approve_payment_request', {
        request_id: item.payment_request_id,
        verifier_id: (await supabase.auth.getUser()).data.user?.id
      })

      if (error) {
        console.error('RPC error details:', error)
        throw error
      }

      toast.success('已核准請款申請')
      refresh()
    } catch (error: any) {
      toast.error('核准失敗: ' + error.message)
    }
  }

  // 處理駁回
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
    } catch (error: any) {
      toast.error('駁回失敗: ' + error.message)
    }
  }

  // 批量核准
  const handleBatchApprove = async () => {
    if (!confirm(`確定要核准選中的 ${selectedItems.size} 筆申請嗎？`)) return

    await handleBatchAction(
      async (items) => {
        const user = (await supabase.auth.getUser()).data.user

        // 使用 Promise.all 並行處理
        const promises = items.map(item =>
          supabase.rpc('approve_payment_request', {
            request_id: item.payment_request_id,
            verifier_id: user?.id
          })
        )

        const results = await Promise.all(promises)
        const errors = results.filter(r => r.error)

        if (errors.length > 0) {
          // Log detailed error information
          console.error('RPC errors:', errors.map(e => ({
            error: e.error,
            message: e.error?.message,
            details: e.error?.details,
            hint: e.error?.hint,
            code: e.error?.code
          })))
          throw new Error(`${errors.length} 筆項目處理失敗`)
        }
      },
      {
        onSuccess: () => {
          toast.success(`成功核准 ${selectedItems.size} 筆申請`)
          refresh()
          deselectAll()
        },
        onError: (error) => toast.error('批量核准失敗: ' + error.message)
      }
    )
  }

  // 批量駁回
  const handleBatchReject = async () => {
    const reason = prompt('請輸入批量駁回原因：')
    if (!reason) return

    await handleBatchAction(
      async (items) => {
        const user = (await supabase.auth.getUser()).data.user
        const ids = items.map(i => i.payment_request_id)

        const { error } = await supabase
          .from('payment_requests')
          .update({
            verification_status: 'rejected',
            rejection_reason: reason,
            rejected_by: user?.id,
            rejected_at: new Date().toISOString()
          })
          .in('id', ids)

        if (error) throw error
      },
      {
        onSuccess: () => {
          toast.success(`成功駁回 ${selectedItems.size} 筆申請`)
          refresh()
          deselectAll()
        },
        onError: (error) => toast.error('批量駁回失敗: ' + error.message)
      }
    )
  }

  // 開啟檔案檢視
  const handleViewFiles = (item: PaymentRequestItem) => {
    setSelectedRequest(item)
    setIsFileViewerOpen(true)
  }

  if (loading) return <LoadingState message="載入請款申請..." />

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">請款申請審核</h1>
          <p className="text-gray-500 mt-1">審核來自待請款清單的申請項目</p>
        </div>
      </div>

      {/* 控制列 */}
      <div className="flex flex-col space-y-4">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              id="search-requests"
              name="search"
              placeholder="搜尋專案、KOL、服務項目..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="text-sm text-gray-500">
            共 {filteredItems.length} 筆申請
          </div>
        </div>

        {/* 批量操作列 */}
        <ApprovalControls
          selectedCount={selectedItems.size}
          onBatchApprove={handleBatchApprove}
          onBatchReject={handleBatchReject}
          onRefresh={refresh}
          isProcessing={isProcessing}
        />
      </div>

      {/* 列表內容 */}
      {filteredItems.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedItems.size > 0 && selectedItems.size === filteredItems.length}
                    onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案資訊</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KOL / 服務</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">附件 / 發票</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
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
          title={searchTerm ? '沒有找到符合的申請' : '目前沒有待審核的申請'}
          description={searchTerm ? '請嘗試其他搜尋關鍵字' : '所有申請都已處理完畢'}
        />
      )}

      {/* 檔案檢視 Modal */}
      <FileViewerModal
        isOpen={isFileViewerOpen}
        onClose={() => {
          setIsFileViewerOpen(false)
          setSelectedRequest(null)
        }}
        request={selectedRequest}
      />
    </div>
  )
}