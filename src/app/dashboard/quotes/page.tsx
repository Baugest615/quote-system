'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { QuotesDataGrid } from '@/components/quotes/v2/QuotesDataGrid'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { useQuotations, type QuotationWithItemsSummary } from '@/hooks/useQuotations'
import { useClients } from '@/hooks/useClients'
import { queryKeys } from '@/lib/queryKeys'
import { ModuleErrorBoundary } from '@/components/ModuleErrorBoundary'

// 類型定義：使用含項目摘要的型別（支援 KOL/執行內容搜尋）
export type QuotationWithClient = QuotationWithItemsSummary

export default function QuotesV2Page() {
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('')

    // 分頁狀態
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 50

    // React Query 資料獲取（全量載入）
    const { data: quotations = [], isLoading: loading } = useQuotations()
    const { data: clients = [] } = useClients()

    // 重新整理回呼（含跨頁快取失效）
    const handleRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: [...queryKeys.quotations] })
        queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
    }, [queryClient])

    // 全文搜尋（ID、專案名稱、客戶名稱、KOL 名稱、執行內容）
    const filteredQuotations = useMemo(() => {
        if (!searchTerm) return quotations
        const term = searchTerm.toLowerCase()
        return quotations.filter((quote) =>
            quote.id.toLowerCase().includes(term) ||
            quote.project_name.toLowerCase().includes(term) ||
            (quote.clients?.name || '').toLowerCase().includes(term) ||
            quote.quotation_items?.some(item =>
                (item.kols?.name || '').toLowerCase().includes(term) ||
                (item.service || '').toLowerCase().includes(term)
            )
        )
    }, [quotations, searchTerm])

    // 搜尋改變時重置到第 1 頁
    useEffect(() => { setCurrentPage(1) }, [searchTerm])

    // 客戶端分頁
    const totalCount = filteredQuotations.length
    const totalPages = Math.ceil(totalCount / itemsPerPage)
    const paginatedQuotations = filteredQuotations.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page)
    }, [])

    return (
        <ModuleErrorBoundary module="報價單管理">
        <div className="h-[calc(100vh-4rem)] flex flex-col space-y-4 p-6 bg-secondary">
            {/* 頂部工具列 */}
            <div className="flex justify-between items-center bg-card p-4 rounded-lg shadow-sm border">
                <div className="flex items-center space-x-4">
                    <h1 className="text-2xl font-bold text-foreground">報價單管理</h1>
                    <div className="text-sm text-muted-foreground">
                        共 {totalCount} 筆專案
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {/* 搜尋 */}
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="搜尋專案、客戶、KOL、執行內容..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    <Link href="/dashboard/quotes/new">
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" /> 新增報價單
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Data Grid 區域（含排序 + 欄位篩選） */}
            <div className="flex-1 overflow-hidden bg-card rounded-lg shadow-sm border">
                {loading ? (
                    <div className="p-4">
                        <SkeletonTable rows={10} columns={7} />
                    </div>
                ) : (
                    <QuotesDataGrid
                        data={paginatedQuotations}
                        clients={clients}
                        onRefresh={handleRefresh}
                    />
                )}
            </div>

            {/* 分頁控制 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-card p-4 rounded-lg shadow-sm border">
                    <div className="text-sm text-muted-foreground">
                        顯示 {((currentPage - 1) * itemsPerPage) + 1} 至 {Math.min(currentPage * itemsPerPage, totalCount)} 筆，共 {totalCount} 筆
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
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
                            onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                            disabled={currentPage === totalPages}
                        >
                            下一頁 <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
        </ModuleErrorBoundary>
    )
}
