// 統一的資料管理 Hook（React Query 版本）
// 用於所有請款頁面的資料獲取與狀態管理

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface UsePaymentDataOptions {
    /** React Query 快取鍵 */
    queryKey?: readonly unknown[]
    autoRefresh?: boolean
    refreshInterval?: number
    onSuccess?: () => void
    onError?: (error: Error) => void
}

export interface UsePaymentDataReturn<T> {
    data: T[]
    setData: React.Dispatch<React.SetStateAction<T[]>>
    loading: boolean
    setLoading: React.Dispatch<React.SetStateAction<boolean>>
    error: Error | null
    refetch: () => Promise<void>
    isRefreshing: boolean
}

/**
 * 統一的資料管理 Hook（內部使用 React Query 快取）
 * @param fetchFunction 資料獲取函數
 * @param options 配置選項（含 queryKey）
 * @returns 資料狀態和操作函數
 */
export function usePaymentData<T>(
    fetchFunction: () => Promise<T[]>,
    options: UsePaymentDataOptions = {}
): UsePaymentDataReturn<T> {
    const queryClient = useQueryClient()

    // 使用 React Query 管理遠端資料
    const {
        data: queryData,
        isLoading: queryLoading,
        error: queryError,
        isFetching,
    } = useQuery({
        queryKey: options.queryKey || ['payment-data'],
        queryFn: async () => {
            const result = await fetchFunction()
            options.onSuccess?.()
            return result
        },
        refetchInterval: options.autoRefresh && options.refreshInterval
            ? options.refreshInterval
            : undefined,
    })

    // 保持 local state 供頁面直接修改（如 expand/collapse）
    const [data, setData] = useState<T[]>([])
    const [loading, setLoading] = useState(true)

    // 同步 React Query 資料到 local state
    useEffect(() => {
        if (queryData) {
            setData(queryData)
        }
    }, [queryData])

    useEffect(() => {
        setLoading(queryLoading)
    }, [queryLoading])

    const error = queryError instanceof Error ? queryError : queryError ? new Error(String(queryError)) : null

    // 顯示錯誤 toast
    useEffect(() => {
        if (error) {
            toast.error('載入資料失敗: ' + error.message)
            options.onError?.(error)
        }
    }, [error])

    const refetch = useCallback(async () => {
        if (options.queryKey) {
            await queryClient.invalidateQueries({ queryKey: options.queryKey })
        } else {
            await queryClient.invalidateQueries({ queryKey: ['payment-data'] })
        }
    }, [queryClient, options.queryKey])

    return {
        data,
        setData,
        loading,
        setLoading,
        error,
        refetch,
        isRefreshing: isFetching && !queryLoading
    }
}
