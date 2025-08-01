'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileModal } from '@/components/quotes/FileModal'
import { PlusCircle, Edit, Trash2, Search, UploadCloud } from 'lucide-react'

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
  
  const handleStatusChange = async (id: string, newStatus: string) => {
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
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">報價單管理</h1>
          <Link href="/dashboard/quotes/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> 新增報價單
            </Button>
          </Link>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="搜尋報價單 ID、專案名稱或客戶..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案名稱</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客戶</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredQuotations.map((quote) => {
                const total = quote.has_discount ? quote.discounted_price : quote.grand_total_taxed
                return (
                  <tr key={quote.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 text-sm font-mono text-indigo-600">{quote.id}</td>
                    <td className="p-4 text-sm font-semibold">{quote.project_name}</td>
                    <td className="p-4 text-sm">{quote.clients?.name || 'N/A'}</td>
                    <td className="p-4 text-sm">NT$ {total?.toLocaleString() || 0}</td>
                    <td className="p-4">
                        <select 
                            value={quote.status || ''}
                            onChange={(e) => handleStatusChange(quote.id, e.target.value)}
                            className="form-input text-xs"
                        >
                            <option value="草稿">草稿</option>
                            <option value="待簽約">待簽約</option>
                            <option value="已簽約">已簽約</option>
                            <option value="已歸檔">已歸檔</option>
                        </select>
                    </td>
                    <td className="p-4 text-center space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openFileModal(quote)}>
                        <UploadCloud className="mr-1 h-3 w-3" /> 附件
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/quotes/view/${quote.id}`)}>
                        <Edit className="mr-1 h-3 w-3" /> 檢視
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(quote.id, quote.attachments)}>
                        <Trash2 className="mr-1 h-3 w-3" /> 刪除
                      </Button>
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
      </div>

      <FileModal 
        isOpen={fileModalOpen}
        onClose={handleFileModalClose}
        quote={selectedQuote}
        onUpdate={handleFileModalUpdate}
      />
    </>
  )
}