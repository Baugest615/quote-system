'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileModal } from '@/components/quotes/FileModal'
import { PlusCircle, Edit, Trash2, Search, UploadCloud, Paperclip, CheckCircle } from 'lucide-react'

// 類型定義
type Quotation = Database['public']['Tables']['quotations']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type QuotationWithClient = Quotation & { clients: Client | null }

export default function QuotesPage() {
  const [quotations, setQuotations] = useState<QuotationWithClient[]>([])
  const [filteredQuotations, setFilteredQuotations] = useState<QuotationWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState<QuotationWithClient | null>(null)
  const router = useRouter()

  // 檢查是否有附件的輔助函數
  const hasAttachment = (attachments: any): boolean => {
    return attachments && Array.isArray(attachments) && attachments.length > 0
  }

  // 格式化日期的輔助函數
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('zh-TW')
  }

  // 渲染附件按鈕的函數
  const renderAttachmentButton = (quote: QuotationWithClient) => {
    const hasFile = hasAttachment(quote.attachments)
    
    if (hasFile) {
      return (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => openFileModal(quote)}
          className="text-green-600 border-green-600 hover:bg-green-50"
        >
          <CheckCircle className="mr-1 h-3 w-3" />
          附件 ✓
        </Button>
      )
    } else {
      return (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => openFileModal(quote)}
          className="text-gray-500 border-gray-300 hover:bg-gray-50"
        >
          <Paperclip className="mr-1 h-3 w-3" />
          附件
        </Button>
      )
    }
  }

  // 使用 useCallback 來穩定 fetchQuotations 函數
  const fetchQuotations = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('quotations')
      .select('*, clients(*)')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching quotations:', error)
      alert('讀取報價單失敗')
    } else {
      const quotes = data as QuotationWithClient[]
      setQuotations(quotes)
      setFilteredQuotations(quotes)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchQuotations()
  }, [fetchQuotations])

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase()
    const filteredData = quotations.filter(item => {
      const idMatch = item.id && item.id.toLowerCase().includes(lowercasedFilter);
      const projectMatch = item.project_name && item.project_name.toLowerCase().includes(lowercasedFilter);
      const clientMatch = item.clients?.name && item.clients.name.toLowerCase().includes(lowercasedFilter);
      return idMatch || projectMatch || clientMatch;
    })
    setFilteredQuotations(filteredData)
  }, [searchTerm, quotations])

  const handleDelete = async (id: string, attachments: any) => {
    if (window.confirm('確定要刪除這份報價單嗎？所有相關資料和附件都將被永久刪除。')) {
      // 刪除附件
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        const filePath = attachments[0].path;
        if (filePath) {
          const { error: storageError } = await supabase.storage.from('attachments').remove([filePath]);
          if(storageError) console.error("刪除檔案失敗:", storageError.message);
        }
      }
      // 刪除項目
      await supabase.from('quotation_items').delete().eq('quotation_id', id);
      // 刪除主報價單
      await supabase.from('quotations').delete().eq('id', id);
      
      alert('報價單已刪除');
      await fetchQuotations()
    }
  }
  
  // 優化的狀態變更函數，加入附件檢測
  const handleStatusChange = async (id: string, newStatus: string) => {
    // 如果要變更為"已簽約"狀態，需要檢查是否有附件
    if (newStatus === '已簽約') {
      const quote = quotations.find(q => q.id === id)
      if (quote && !hasAttachment(quote.attachments)) {
        alert('需先上傳用印委刊單方可更改狀態為「已簽約」')
        return
      }
    }

    const { error } = await supabase.from('quotations').update({ status: newStatus }).eq('id', id);
    if(error) {
        alert('狀態更新失敗: ' + error.message);
    } else {
        await fetchQuotations();
    }
  }
  
  const openFileModal = (quote: QuotationWithClient) => {
    setSelectedQuote(quote);
    setFileModalOpen(true);
  }

  // 使用 useCallback 來穩定 handleFileModalUpdate 函數
  const handleFileModalUpdate = useCallback(() => {
    fetchQuotations(); // 重新載入資料以更新附件狀態
  }, [fetchQuotations])

  // 使用 useCallback 來穩定 handleFileModalClose 函數  
  const handleFileModalClose = useCallback(() => {
    setFileModalOpen(false);
    setSelectedQuote(null);
  }, [])

  if (loading) {
    return <div className="p-6">載入中...</div>
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">報價單管理</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="搜尋報價單 ID、專案名稱或客戶..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Link href="/dashboard/quotes/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> 新增報價單
            </Button>
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left table-auto">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium text-sm whitespace-nowrap">ID</th>
              <th className="p-4 font-medium text-sm whitespace-nowrap w-28">委刊日期</th>
              <th className="p-4 font-medium text-sm whitespace-nowrap">專案名稱</th>
              <th className="p-4 font-medium text-sm whitespace-nowrap">客戶</th>
              <th className="p-4 font-medium text-sm whitespace-nowrap">金額</th>
              <th className="p-4 font-medium text-sm whitespace-nowrap w-24">狀態</th>
              <th className="p-4 font-medium text-sm text-center whitespace-nowrap w-48">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotations.map((quote) => {
              const total = quote.has_discount ? quote.discounted_price : quote.grand_total_taxed
              return (
                <tr key={quote.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 text-sm font-mono text-indigo-600 whitespace-nowrap">{quote.id}</td>
                  <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(quote.created_at)}</td>
                  <td className="p-4 text-sm font-semibold text-gray-900 whitespace-nowrap">{quote.project_name}</td>
                  <td className="p-4 text-sm text-gray-700 whitespace-nowrap">{quote.clients?.name || 'N/A'}</td>
                  <td className="p-4 text-sm font-medium text-gray-900 whitespace-nowrap">NT$ {total?.toLocaleString() || 0}</td>
                  <td className="p-4">
                      <select 
                          value={quote.status || ''}
                          onChange={(e) => handleStatusChange(quote.id, e.target.value)}
                          className="form-input text-xs w-full"
                      >
                          <option value="草稿">草稿</option>
                          <option value="待簽約">待簽約</option>
                          <option value="已簽約">已簽約</option>
                          <option value="已歸檔">已歸檔</option>
                      </select>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center space-x-1 whitespace-nowrap">
                      {renderAttachmentButton(quote)}
                      <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/quotes/view/${quote.id}`)}>
                        <Edit className="mr-1 h-3 w-3" /> 檢視
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(quote.id, quote.attachments)}>
                        <Trash2 className="mr-1 h-3 w-3" /> 刪除
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredQuotations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {searchTerm ? '沒有找到符合搜尋條件的報價單' : '尚無報價單資料'}
            </p>
          </div>
        )}
      </div>

      <FileModal 
        isOpen={fileModalOpen}
        onClose={handleFileModalClose}
        quote={selectedQuote}
        onUpdate={handleFileModalUpdate}
      />
    </div>
  )
}