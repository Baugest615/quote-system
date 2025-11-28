// 項目操作 Hook
// 統一的項目更新、刪除等操作邏輯

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

export interface UsePaymentActionsReturn<T extends { id: string }> {
    // 項目更新
    updateItem: (itemId: string, updates: Partial<T>) => void
    updateItems: (itemIds: string[], updates: Partial<T>) => void
    removeItem: (itemId: string) => void
    removeItems: (itemIds: string[]) => void

    // 選擇狀態
    selectedItems: Set<string>
    toggleSelection: (itemId: string) => void
    selectAll: () => void
    deselectAll: () => void

    // 批量操作
    isProcessing: boolean
    handleBatchAction: (
        action: (items: T[]) => Promise<void>,
        options?: {
            onSuccess?: () => void
            onError?: (error: Error) => void
        }
    ) => Promise<void>
}

export function usePaymentActions<T extends { id: string }>(
    items: T[],
    setItems?: React.Dispatch<React.SetStateAction<T[]>>
): UsePaymentActionsReturn<T> {
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
    const [isProcessing, setIsProcessing] = useState(false)

    // 更新單一項目
    const updateItem = useCallback((itemId: string, updates: Partial<T>) => {
        if (!setItems) return
        setItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, ...updates } : item
        ))
    }, [setItems])

    // 更新多個項目
    const updateItems = useCallback((itemIds: string[], updates: Partial<T>) => {
        if (!setItems) return
        setItems(prev => prev.map(item =>
            itemIds.includes(item.id) ? { ...item, ...updates } : item
        ))
    }, [setItems])

    // 刪除單一項目
    const removeItem = useCallback((itemId: string) => {
        if (!setItems) return
        setItems(prev => prev.filter(item => item.id !== itemId))
        setSelectedItems(prev => {
            const next = new Set(prev)
            next.delete(itemId)
            return next
        })
    }, [setItems])

    // 刪除多個項目
    const removeItems = useCallback((itemIds: string[]) => {
        if (!setItems) return
        setItems(prev => prev.filter(item => !itemIds.includes(item.id)))
        setSelectedItems(prev => {
            const next = new Set(prev)
            itemIds.forEach(id => next.delete(id))
            return next
        })
    }, [setItems])

    // 切換選擇
    const toggleSelection = useCallback((itemId: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev)
            if (next.has(itemId)) {
                next.delete(itemId)
            } else {
                next.add(itemId)
            }
            return next
        })
    }, [])

    // 全選
    const selectAll = useCallback(() => {
        setSelectedItems(new Set(items.map(item => item.id)))
    }, [items])

    // 取消全選
    const deselectAll = useCallback(() => {
        setSelectedItems(new Set())
    }, [])

    // 批量操作處理
    const handleBatchAction = useCallback(async (
        action: (items: T[]) => Promise<void>,
        options?: {
            onSuccess?: () => void
            onError?: (error: Error) => void
        }
    ) => {
        if (selectedItems.size === 0) {
            toast.warning('請先選擇項目')
            return
        }

        setIsProcessing(true)
        try {
            const selectedItemsList = items.filter(item => selectedItems.has(item.id))
            await action(selectedItemsList)
            options?.onSuccess?.()
        } catch (error: any) {
            console.error('Batch action failed:', error)
            options?.onError?.(error)
        } finally {
            setIsProcessing(false)
        }
    }, [items, selectedItems])

    return {
        updateItem,
        updateItems,
        removeItem,
        removeItems,
        selectedItems,
        toggleSelection,
        selectAll,
        deselectAll,
        isProcessing,
        handleBatchAction
    }
}
