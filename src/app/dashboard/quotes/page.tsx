'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, PlusCircle, Filter, ChevronLeft, ChevronRight, Calendar, DollarSign } from 'lucide-react'
import { QuotesDataGrid } from '@/components/quotes/v2/QuotesDataGrid'

// 類型定義 (與 V1 保持一致)
type Quotation = Database['public']['Tables']['quotations']['Row']
type Client = Database['public']['Tables']['clients']['Row']
export type QuotationWithClient = Quotation & { clients: Client | null }

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

export default function QuotesV2Page() {
    const [quotations, setQuotations] = useState<QuotationWithClient[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [showFilters, setShowFilters] = useState(false)

    // 篩選狀態
    const [filters, setFilters] = useState<FilterState>({
        status: [],
        clientIds: [],
        dateRange: { start: '', end: '' },
        amountRange: { min: '', max: '' }
    })

    // 分頁狀態
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 50

    // 狀態選項
    const statusOptions = [
        { value: '草稿', label: '草稿', color: 'bg-gray-100 text-gray-800' },
        { value: '待簽約', label: '待簽約', color: 'bg-yellow-100 text-yellow-800' },
        { value: '已簽約', label: '已簽約', color: 'bg-green-100 text-green-800' },
        { value: '已歸檔', label: '已歸檔', color: 'bg-blue-100 text-blue-800' }
    ]

    // 資料獲取
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

    // 檢查是否有啟用的篩選
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

    // 篩選邏輯
    const filteredQuotations = useMemo(() => {
        let result = [...quotations]

        // 1. 基本搜尋
        if (searchTerm) {
            result = result.filter((quote) =>
                quote.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                quote.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (quote.clients?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
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
                const total = quote.has_discount && quote.discounted_price ?
                    quote.discounted_price + Math.round(quote.discounted_price * 0.05) :
                    (quote.grand_total_taxed || 0)
                return total >= minAmount
            })
        }
        if (filters.amountRange.max) {
            const maxAmount = parseFloat(filters.amountRange.max)
            result = result.filter((quote) => {
                const total = quote.has_discount && quote.discounted_price ?
                    quote.discounted_price + Math.round(quote.discounted_price * 0.05) :
                    (quote.grand_total_taxed || 0)
                return total <= maxAmount
            })
        }

        return result
    }, [quotations, searchTerm, filters])

    // 分頁邏輯
    const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage)
    const paginatedQuotations = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage
        return filteredQuotations.slice(startIndex, startIndex + itemsPerPage)
    }, [filteredQuotations, currentPage])

    // 當篩選條件改變時，重置回第一頁
    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, filters])

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col space-y-4 p-6 bg-gray-50">
            {/* 頂部工具列 */}
            <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center space-x-4">
                    <h1 className="text-2xl font-bold text-gray-800">報價單管理</h1>
                    <div className="text-sm text-gray-500">
                        共 {filteredQuotations.length} 筆專案
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {/* 搜尋 */}
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="搜尋專案、客戶..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
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

            {/* 篩選面板 */}
            {showFilters && (
                <div className="bg-white p-4 rounded-lg shadow-sm border space-y-4">
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
                                                    setFilters(prev => ({ ...prev, status: [...prev.status, option.value] }))
                                                } else {
                                                    setFilters(prev => ({ ...prev, status: prev.status.filter(s => s !== option.value) }))
                                                }
                                            }}
                                            className="mr-2 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm">{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* 客戶篩選 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">客戶</label>
                            <select
                                multiple
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md h-32"
                                value={filters.clientIds}
                                onChange={(e) => {
                                    const selectedOptions = Array.from(e.target.selectedOptions, option => option.value)
                                    setFilters(prev => ({ ...prev, clientIds: selectedOptions }))
                                }}
                            >
                                {clients.map((client) => (
                                    <option key={client.id} value={client.id}>{client.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">按住 Ctrl/Cmd 可多選</p>
                        </div>

                        {/* 日期範圍 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">建立日期</label>
                            <div className="space-y-2">
                                <div className="flex items-center">
                                    <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                                    <Input
                                        type="date"
                                        value={filters.dateRange.start}
                                        onChange={(e) => setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, start: e.target.value } }))}
                                        className="text-sm"
                                    />
                                </div>
                                <div className="flex items-center">
                                    <span className="text-gray-400 mr-2 text-sm">至</span>
                                    <Input
                                        type="date"
                                        value={filters.dateRange.end}
                                        onChange={(e) => setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, end: e.target.value } }))}
                                        className="text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 金額範圍 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">總金額 (含稅)</label>
                            <div className="space-y-2">
                                <div className="flex items-center">
                                    <DollarSign className="h-4 w-4 text-gray-400 mr-2" />
                                    <Input
                                        type="number"
                                        placeholder="最小值"
                                        value={filters.amountRange.min}
                                        onChange={(e) => setFilters(prev => ({ ...prev, amountRange: { ...prev.amountRange, min: e.target.value } }))}
                                        className="text-sm"
                                    />
                                </div>
                                <div className="flex items-center">
                                    <span className="text-gray-400 mr-2 text-sm">至</span>
                                    <Input
                                        type="number"
                                        placeholder="最大值"
                                        value={filters.amountRange.max}
                                        onChange={(e) => setFilters(prev => ({ ...prev, amountRange: { ...prev.amountRange, max: e.target.value } }))}
                                        className="text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilters({
                                status: [],
                                clientIds: [],
                                dateRange: { start: '', end: '' },
                                amountRange: { min: '', max: '' }
                            })}
                            className="text-gray-500"
                        >
                            清除篩選
                        </Button>
                    </div>
                </div>
            )}

            {/* Data Grid 區域 */}
            <div className="flex-1 overflow-hidden bg-white rounded-lg shadow-sm border">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-gray-500">讀取中...</div>
                    </div>
                ) : (
                    <QuotesDataGrid
                        data={paginatedQuotations}
                        clients={clients}
                        onRefresh={fetchData}
                    />
                )}
            </div>

            {/* 分頁控制 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
                    <div className="text-sm text-gray-500">
                        顯示 {((currentPage - 1) * itemsPerPage) + 1} 至 {Math.min(currentPage * itemsPerPage, filteredQuotations.length)} 筆，共 {filteredQuotations.length} 筆
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" /> 上一頁
                        </Button>
                        <div className="text-sm font-medium">
                            第 {currentPage} 頁 / 共 {totalPages} 頁
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                        >
                            下一頁 <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
