'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileModal } from '@/components/quotes/FileModal'
import { 
  PlusCircle, Edit, Trash2, Search, UploadCloud, Paperclip, CheckCircle, 
  ChevronUp, ChevronDown, Filter, X, Calendar, DollarSign 
} from 'lucide-react'

// 類型定義
type Quotation = Database['public']['Tables']['quotations']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type QuotationWithClient = Quotation & { clients: Client | null }

// 排序方向類型
type SortDirection = 'asc' | 'desc' | null
type SortField = 'created_at' | 'project_name' | 'client_name' | 'total_amount' | 'status'

// 篩選器類型
interface FilterState {
  status: string[]
  clientIds: string[]
  dateRange: {
    start: string
    end: string
  }
  amountRange: {
    min: string
    max: string
  }
}

export default function QuotesPage() {
  const [quotations, setQuotations] = useState<QuotationWithClient[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState<QuotationWithClient | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  
  // 🆕 排序狀態
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  
  // 🆕 篩選狀態
  const [filters, setFilters] = useState<FilterState>({
    status: [],
    clientIds: [],
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' }
  })

  const router = useRouter()

  // 🆕 狀態選項
  const statusOptions = [
    { value: '草稿', label: '草稿', color: 'bg-gray-100 text-gray-800' },
    { value: '待簽約', label: '待簽約', color: 'bg-yellow-100 text-yellow-800' },
    { value: '已簽約', label: '已簽約', color: 'bg-green-100 text-green-800' },
    { value: '已歸檔', label: '已歸檔', color: 'bg-blue-100 text-blue-800' }
  ]

  // 輔助函數
  const hasAttachment = (attachments: any): boolean => {
    return attachments && Array.isArray(attachments) && attachments.length > 0
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('zh-TW')
  }

  // 渲染附件按鈕
  const renderAttachmentButton = (quote: QuotationWithClient) => {
    const hasFile = hasAttachment(quote.attachments)
    
    if (hasFile) {
      return (
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            setSelectedQuote(quote)
            setFileModalOpen(true)
          }}
          className="text-green-600 border-green-300 hover:bg-green-50"
        >
          <CheckCircle className="mr-1 h-3 w-3" /> 已上傳
        </Button>
      )
    } else {
      return (
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            setSelectedQuote(quote)
            setFileModalOpen(true)
          }}
          className="text-gray-500 border-gray-300 hover:bg-gray-50"
        >
          <UploadCloud className="mr-1 h-3 w-3" /> 上傳檔案
        </Button>
      )
    }
  }

  // 🆕 排序處理函數
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // 同一欄位：昇序 → 降序 → 無排序
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortDirection(null)
        setSortField('created_at') // 回到預設排序
      } else {
        setSortDirection('asc')
      }
    } else {
      // 不同欄位：直接設為昇序
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // 🆕 排序圖標組件
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <div className="w-4 h-4" />
    if (sortDirection === 'asc') return <ChevronUp className="w-4 h-4" />
    if (sortDirection === 'desc') return <ChevronDown className="w-4 h-4" />
    return <div className="w-4 h-4" />
  }

  // 🆕 篩選器重置
  const resetFilters = () => {
    setFilters({
      status: [],
      clientIds: [],
      dateRange: { start: '', end: '' },
      amountRange: { min: '', max: '' }
    })
  }

  // 🆕 檢查是否有啟用的篩選
  const hasActiveFilters = useMemo(() => {
    return (
      filters.status.length > 0 ||
      filters.clientIds.length > 0 ||
      filters.dateRange.start ||
      filters.dateRange.end ||
      filters.amountRange.min ||
      filters.amountRange.max
    )
  }, [filters])

  // 數據獲取
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [quotationsRes, clientsRes] = await Promise.all([
      supabase
        .from('quotations')
        .select('*, clients(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('clients')
        .select('*')
        .order('name')
    ])

    if (quotationsRes.error) {
      console.error('Error fetching quotations:', quotationsRes.error)
    } else {
      setQuotations(quotationsRes.data as QuotationWithClient[])
    }

    if (clientsRes.error) {
      console.error('Error fetching clients:', clientsRes.error)
    } else {
      setClients(clientsRes.data || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 🆕 篩選和排序邏輯
  const filteredAndSortedQuotations = useMemo(() => {
    let result = [...quotations]

    // 1. 基本搜尋
    if (searchTerm) {
      result = result.filter((quote) =>
        quote.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.clients?.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // 2. 狀態篩選
    if (filters.status.length > 0) {
      result = result.filter((quote) => 
        quote.status && filters.status.includes(quote.status)
      )
    }

    // 3. 客戶篩選
    if (filters.clientIds.length > 0) {
      result = result.filter((quote) => 
        quote.client_id && filters.clientIds.includes(quote.client_id)
      )
    }

    // 4. 日期範圍篩選
    if (filters.dateRange.start) {
      result = result.filter((quote) => 
        quote.created_at && quote.created_at >= filters.dateRange.start
      )
    }
    if (filters.dateRange.end) {
      result = result.filter((quote) => 
        quote.created_at && quote.created_at <= filters.dateRange.end + 'T23:59:59'
      )
    }

    // 5. 金額範圍篩選
    if (filters.amountRange.min) {
      const minAmount = parseFloat(filters.amountRange.min)
      result = result.filter((quote) => {
        const total = quote.has_discount ? 
          (quote.discounted_price || 0) : 
          (quote.grand_total_taxed || 0)
        return total >= minAmount
      })
    }
    if (filters.amountRange.max) {
      const maxAmount = parseFloat(filters.amountRange.max)
      result = result.filter((quote) => {
        const total = quote.has_discount ? 
          (quote.discounted_price || 0) : 
          (quote.grand_total_taxed || 0)
        return total <= maxAmount
      })
    }

    // 6. 排序
    if (sortDirection && sortField) {
      result.sort((a, b) => {
        let aValue: any
        let bValue: any

        switch (sortField) {
          case 'created_at':
            aValue = new Date(a.created_at || 0).getTime()
            bValue = new Date(b.created_at || 0).getTime()
            break
          case 'project_name':
            aValue = a.project_name.toLowerCase()
            bValue = b.project_name.toLowerCase()
            break
          case 'client_name':
            aValue = (a.clients?.name || '').toLowerCase()
            bValue = (b.clients?.name || '').toLowerCase()
            break
          case 'total_amount':
            aValue = a.has_discount ? (a.discounted_price || 0) : (a.grand_total_taxed || 0)
            bValue = b.has_discount ? (b.discounted_price || 0) : (b.grand_total_taxed || 0)
            break
          case 'status':
            aValue = a.status || ''
            bValue = b.status || ''
            break
          default:
            return 0
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [quotations, searchTerm, filters, sortField, sortDirection])

  // 渲染狀態標籤
  const renderStatusBadge = (status: string | null) => {
    const statusOption = statusOptions.find(opt => opt.value === status)
    if (!statusOption) return <span className="text-gray-500">未設定</span>
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusOption.color}`}>
        {statusOption.label}
      </span>
    )
  }

  // 刪除報價單
  const handleDelete = async (id: string) => {
    if (window.confirm('確定要刪除這個報價單嗎？此操作無法復原。')) {
      const { error } = await supabase.from('quotations').delete().eq('id', id)
      if (error) {
        alert('刪除失敗: ' + error.message)
      } else {
        await fetchData()
      }
    }
  }

  if (loading) return <div>讀取中...</div>

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* 標題與主要操作 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">報價單管理</h1>
        <div className="flex items-center space-x-4">
          {/* 基本搜尋 */}
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
          
          {/* 篩選按鈕 */}
          <Button 
            variant="outline" 
            onClick={() => setShowFilters(!showFilters)}
            className={hasActiveFilters ? 'border-blue-500 text-blue-600' : ''}
          >
            <Filter className="mr-2 h-4 w-4" />
            篩選 {hasActiveFilters && `(${Object.values(filters).flat().filter(Boolean).length})`}
          </Button>
          
          <Link href="/dashboard/quotes/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> 新增報價單
            </Button>
          </Link>
        </div>
      </div>

      {/* 🆕 篩選面板 */}
      {showFilters && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 狀態篩選 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">狀態</label>
              <div className="space-y-2">
                {statusOptions.map((option) => (
                  <label key={option.value} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(option.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({
                            ...prev,
                            status: [...prev.status, option.value]
                          }))
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            status: prev.status.filter(s => s !== option.value)
                          }))
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 客戶篩選 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">客戶</label>
              <div className="max-h-32 overflow-y-auto space-y-2">
                {clients.map((client) => (
                  <label key={client.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.clientIds.includes(client.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({
                            ...prev,
                            clientIds: [...prev.clientIds, client.id]
                          }))
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            clientIds: prev.clientIds.filter(id => id !== client.id)
                          }))
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm truncate">{client.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 日期範圍 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline w-4 h-4 mr-1" />
                建立日期
              </label>
              <div className="space-y-2">
                <Input
                  type="date"
                  placeholder="開始日期"
                  value={filters.dateRange.start}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, start: e.target.value }
                  }))}
                  className="text-sm"
                />
                <Input
                  type="date"
                  placeholder="結束日期"
                  value={filters.dateRange.end}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, end: e.target.value }
                  }))}
                  className="text-sm"
                />
              </div>
            </div>

            {/* 金額範圍 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="inline w-4 h-4 mr-1" />
                金額範圍
              </label>
              <div className="space-y-2">
                <Input
                  type="number"
                  placeholder="最小金額"
                  value={filters.amountRange.min}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    amountRange: { ...prev.amountRange, min: e.target.value }
                  }))}
                  className="text-sm"
                />
                <Input
                  type="number"
                  placeholder="最大金額"
                  value={filters.amountRange.max}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    amountRange: { ...prev.amountRange, max: e.target.value }
                  }))}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* 篩選操作按鈕 */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <X className="mr-1 h-3 w-3" /> 清除篩選
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(false)}>
              收起
            </Button>
          </div>
        </div>
      )}

      {/* 結果統計 */}
      <div className="mb-4 text-sm text-gray-600">
        顯示 {filteredAndSortedQuotations.length} / {quotations.length} 個報價單
        {hasActiveFilters && (
          <span className="text-blue-600 ml-2">
            (已套用篩選)
          </span>
        )}
      </div>

      {/* 🆕 可排序的表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left table-auto">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium text-sm whitespace-nowrap">ID</th>
              
              {/* 可排序的委刊日期 */}
              <th 
                className="p-4 font-medium text-sm whitespace-nowrap w-28 cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center justify-between">
                  委刊日期
                  <SortIcon field="created_at" />
                </div>
              </th>
              
              {/* 可排序的專案名稱 */}
              <th 
                className="p-4 font-medium text-sm whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('project_name')}
              >
                <div className="flex items-center justify-between">
                  專案名稱
                  <SortIcon field="project_name" />
                </div>
              </th>
              
              {/* 可排序的客戶 */}
              <th 
                className="p-4 font-medium text-sm whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('client_name')}
              >
                <div className="flex items-center justify-between">
                  客戶
                  <SortIcon field="client_name" />
                </div>
              </th>
              
              {/* 可排序的金額 */}
              <th 
                className="p-4 font-medium text-sm whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('total_amount')}
              >
                <div className="flex items-center justify-between">
                  金額
                  <SortIcon field="total_amount" />
                </div>
              </th>
              
              {/* 可排序的狀態 */}
              <th 
                className="p-4 font-medium text-sm whitespace-nowrap w-24 cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center justify-between">
                  狀態
                  <SortIcon field="status" />
                </div>
              </th>
              
              <th className="p-4 font-medium text-sm text-center whitespace-nowrap w-48">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedQuotations.map((quote) => {
              const total = quote.has_discount ?
                (quote.discounted_price || 0) :
                (quote.grand_total_taxed || 0)

              return (
                <tr key={quote.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 text-sm font-mono text-gray-600">
                    {quote.id.slice(-8)}
                  </td>
                  <td className="p-4 text-sm">{formatDate(quote.created_at)}</td>
                  <td className="p-4 text-sm font-semibold text-indigo-700">
                    {quote.project_name}
                  </td>
                  <td className="p-4 text-sm">{quote.clients?.name || 'N/A'}</td>
                  <td className="p-4 text-sm font-semibold">
                    NT$ {total.toLocaleString()}
                  </td>
                  <td className="p-4">{renderStatusBadge(quote.status)}</td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center space-x-1">
                      {renderAttachmentButton(quote)}
                      <Link href={`/dashboard/quotes/view/${quote.id}`}>
                        <Button variant="outline" size="sm">
                          <CheckCircle className="mr-1 h-3 w-3" /> 檢視
                        </Button>
                      </Link>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => handleDelete(quote.id)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> 刪除
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 空狀態顯示 */}
      {filteredAndSortedQuotations.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-2">
            {hasActiveFilters || searchTerm ? '沒有符合條件的報價單' : '尚無報價單資料'}
          </div>
          {(hasActiveFilters || searchTerm) && (
            <Button variant="outline" onClick={() => {
              setSearchTerm('')
              resetFilters()
            }}>
              清除所有篩選
            </Button>
          )}
        </div>
      )}

      {/* 檔案上傳 Modal */}
      <FileModal
        isOpen={fileModalOpen}
        onClose={() => {
          setFileModalOpen(false)
          setSelectedQuote(null)
        }}
        quote={selectedQuote}
        onUpdate={fetchData}
      />
    </div>
  )
}