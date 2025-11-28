// 篩選與搜尋 Hook
// 統一的篩選邏輯，支援多欄位搜尋、狀態篩選、日期範圍等

import { useState, useMemo, useCallback } from 'react'
import type { PaymentStatus } from '@/lib/payments/types'

export interface UsePaymentFiltersOptions<T> {
    searchFields: (keyof T)[]
    defaultStatus?: PaymentStatus
    enableDateFilter?: boolean
    enableClientFilter?: boolean
    enableKOLFilter?: boolean
}

export interface UsePaymentFiltersReturn<T> {
    // 篩選狀態
    searchTerm: string
    setSearchTerm: (term: string) => void
    statusFilter: PaymentStatus
    setStatusFilter: (status: PaymentStatus) => void
    dateRange: { start: Date | null; end: Date | null }
    setDateRange: (range: { start: Date | null; end: Date | null }) => void
    clientFilter: string | null
    setClientFilter: (clientId: string | null) => void
    kolFilter: string | null
    setKOLFilter: (kolId: string | null) => void

    // 篩選結果
    filteredItems: T[]

    // 工具函數
    clearFilters: () => void
    hasActiveFilters: boolean
}

/**
 * 篩選與搜尋 Hook
 * @param items 原始項目列表
 * @param options 配置選項
 * @returns 篩選狀態和結果
 */
export function usePaymentFilters<T extends Record<string, any>>(
    items: T[],
    options: UsePaymentFiltersOptions<T>
): UsePaymentFiltersReturn<T> {
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<PaymentStatus>(
        options.defaultStatus || 'all'
    )
    const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
        start: null,
        end: null
    })
    const [clientFilter, setClientFilter] = useState<string | null>(null)
    const [kolFilter, setKOLFilter] = useState<string | null>(null)

    // 篩選邏輯
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            // 1. 搜尋過濾
            if (searchTerm) {
                const matchesSearch = options.searchFields.some(field => {
                    const value = item[field]
                    if (value === null || value === undefined) return false

                    // 處理巢狀物件（例如 quotations.project_name）
                    if (typeof value === 'object' && value !== null) {
                        return JSON.stringify(value).toLowerCase().includes(searchTerm.toLowerCase())
                    }

                    return String(value).toLowerCase().includes(searchTerm.toLowerCase())
                })
                if (!matchesSearch) return false
            }

            // 2. 狀態過濾
            if (statusFilter !== 'all') {
                if ('verification_status' in item) {
                    if (item.verification_status !== statusFilter) return false
                } else if ('rejection_reason' in item) {
                    // 待請款頁面的狀態判斷
                    const hasRejection = !!item.rejection_reason
                    const hasAttachments = item.attachments && item.attachments.length > 0
                    const hasInvoice = item.invoice_number_input &&
                        /^[A-Za-z]{2}-\d{8}$/.test(item.invoice_number_input)
                    const isReady = hasAttachments || hasInvoice

                    if (statusFilter === 'rejected' && !hasRejection) return false
                    if (statusFilter === 'ready' && !isReady) return false
                    if (statusFilter === 'incomplete' && isReady) return false
                }
            }

            // 3. 日期範圍過濾
            if (options.enableDateFilter && (dateRange.start || dateRange.end)) {
                const dateField = 'created_at' in item ? 'created_at' :
                    'request_date' in item ? 'request_date' :
                        'confirmation_date' in item ? 'confirmation_date' : null

                if (dateField && item[dateField]) {
                    const itemDate = new Date(item[dateField] as string)
                    if (dateRange.start && itemDate < dateRange.start) return false
                    if (dateRange.end && itemDate > dateRange.end) return false
                }
            }

            // 4. 客戶過濾
            if (options.enableClientFilter && clientFilter) {
                const clientId = item.quotations?.client_id
                if (clientId !== clientFilter) return false
            }

            // 5. KOL 過濾
            if (options.enableKOLFilter && kolFilter) {
                const kolId = item.kol_id
                if (kolId !== kolFilter) return false
            }

            return true
        })
    }, [items, searchTerm, statusFilter, dateRange, clientFilter, kolFilter, options])

    // 清除所有篩選
    const clearFilters = useCallback(() => {
        setSearchTerm('')
        setStatusFilter(options.defaultStatus || 'all')
        setDateRange({ start: null, end: null })
        setClientFilter(null)
        setKOLFilter(null)
    }, [options.defaultStatus])

    // 檢查是否有啟用的篩選
    const hasActiveFilters = useMemo(() => {
        return !!(
            searchTerm ||
            statusFilter !== 'all' ||
            dateRange.start ||
            dateRange.end ||
            clientFilter ||
            kolFilter
        )
    }, [searchTerm, statusFilter, dateRange, clientFilter, kolFilter])

    return {
        searchTerm,
        setSearchTerm,
        statusFilter,
        setStatusFilter,
        dateRange,
        setDateRange,
        clientFilter,
        setClientFilter,
        kolFilter,
        setKOLFilter,
        filteredItems,
        clearFilters,
        hasActiveFilters
    }
}
