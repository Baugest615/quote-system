// 統一的資料管理 Hook
// 用於所有請款頁面的資料獲取與狀態管理

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

export interface UsePaymentDataOptions {
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
 * 統一的資料管理 Hook
 * @param fetchFunction 資料獲取函數
 * @param options 配置選項
 * @returns 資料狀態和操作函數
 */
export function usePaymentData<T>(
    fetchFunction: () => Promise<T[]>,
    options: UsePaymentDataOptions = {}
): UsePaymentDataReturn<T> {
    const [data, setData] = useState<T[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setIsRefreshing(true)
        } else {
            setLoading(true)
        }

        setError(null)

        try {
            const result = await fetchFunction()
            setData(result)
            options.onSuccess?.()
        } catch (err: any) {
            const error = err instanceof Error ? err : new Error(err.message || '未知錯誤')
            setError(error)
            toast.error('載入資料失敗: ' + error.message)
            options.onError?.(error)
        } finally {
            setLoading(false)
            setIsRefreshing(false)
        }
    }, [fetchFunction, options])

    // 初始載入
    useEffect(() => {
        fetchData()
    }, [fetchData])

    // 自動刷新
    useEffect(() => {
        if (!options.autoRefresh || !options.refreshInterval) return

        const interval = setInterval(() => {
            fetchData(true) // 標記為刷新，不顯示 loading
        }, options.refreshInterval)

        return () => clearInterval(interval)
    }, [options.autoRefresh, options.refreshInterval, fetchData])

    const refetch = useCallback(async () => {
        await fetchData(true)
    }, [fetchData])

    return {
        data,
        setData,
        loading,
        setLoading,
        error,
        refetch,
        isRefreshing
    }
}
