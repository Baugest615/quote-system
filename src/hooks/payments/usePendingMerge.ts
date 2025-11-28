// 合併操作 Hook（保留原有功能）
// 統一的合併邏輯，包含選擇、驗證、執行合併、解除合併等

import { useState, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    generateMergeGroupId,
    getMergeGroupItems
} from '@/lib/payments/grouping'
import {
    canMergeItems,
    validateMergeOperation
} from '@/lib/payments/validation'
import { PAYMENT_COLORS, CONFIRM_MESSAGES, SUCCESS_MESSAGES } from '@/lib/payments/constants'

export interface UsePendingMergeReturn<T> {
    // 狀態
    selectedForMerge: string[]
    selectedMergeType: 'account' | null

    // 操作
    handleMergeTypeChange: () => void
    handleMergeSelection: (itemId: string, checked: boolean) => void
    canMergeWith: (item: T) => boolean
    handleMerge: () => void
    handleUnmerge: (groupId: string) => Promise<void>
    clearSelection: () => void
}

/**
 * 合併操作 Hook（保留原有功能）
 * @param items 項目列表
 * @param setItems 更新函數
 * @returns 合併操作函數集合
 */
export function usePendingMerge<T extends {
    id: string
    kols?: { bank_info: any } | null
    merge_group_id?: string | null
    is_merge_leader?: boolean
    merge_color?: string
    payment_request_id?: string | null
    attachments?: any[]
    invoice_number_input?: string | null
}>(
    items: T[],
    setItems: React.Dispatch<React.SetStateAction<T[]>>
): UsePendingMergeReturn<T> {
    const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
    const [selectedMergeType, setSelectedMergeType] = useState<'account' | null>(null)

    // 切換合併模式
    const handleMergeTypeChange = useCallback(() => {
        setSelectedMergeType(prev => prev ? null : 'account')
        setSelectedForMerge([])
    }, [])

    // 選擇/取消選擇項目
    const handleMergeSelection = useCallback((itemId: string, checked: boolean) => {
        if (checked) {
            setSelectedForMerge(prev => [...prev, itemId])
        } else {
            setSelectedForMerge(prev => prev.filter(id => id !== itemId))
        }
    }, [])

    // 檢查項目是否可以與已選項目合併
    const canMergeWith = useCallback((item: T) => {
        if (!selectedMergeType || selectedForMerge.length === 0) return true

        const firstSelectedItem = items.find(i => i.id === selectedForMerge[0])
        if (!firstSelectedItem) return true

        return canMergeItems(firstSelectedItem, item)
    }, [items, selectedForMerge, selectedMergeType])

    // 執行合併
    const handleMerge = useCallback(() => {
        const selectedItems = items.filter(item => selectedForMerge.includes(item.id))

        // 驗證
        const error = validateMergeOperation(selectedItems)
        if (error) {
            toast.error(error)
            return
        }

        if (!window.confirm(CONFIRM_MESSAGES.merge)) return

        // 生成群組ID和顏色
        const groupId = generateMergeGroupId()
        const existingGroups = items
            .filter(i => i.merge_group_id)
            .map(i => i.merge_group_id)
            .filter((v, i, a) => a.indexOf(v) === i)
        const colorIndex = existingGroups.length
        const mergeColor = PAYMENT_COLORS.merge[colorIndex % PAYMENT_COLORS.merge.length]

        // 更新項目
        setItems(prev => prev.map(item => {
            if (selectedForMerge.includes(item.id)) {
                return {
                    ...item,
                    merge_type: 'account' as const,
                    merge_group_id: groupId,
                    is_merge_leader: item.id === selectedForMerge[0],
                    merge_color: mergeColor
                }
            }
            return item
        }))

        setSelectedForMerge([])
        setSelectedMergeType(null)
        toast.success(`${SUCCESS_MESSAGES.merge}（${selectedForMerge.length} 筆資料）`)
    }, [items, selectedForMerge, setItems])

    const handleUnmerge = useCallback(async (groupId: string) => {
        const groupItems = getMergeGroupItems(items as any[], groupId)

        if (!window.confirm(CONFIRM_MESSAGES.unmerge(groupItems.length))) return

        const leaderItem = groupItems.find(item => item.is_merge_leader)
        if (!leaderItem) {
            toast.error("找不到群組主導項，無法解除合併")
            return
        }

        const updatesForNonLeaders = {
            merge_group_id: null,
            merge_type: null,
            is_merge_leader: false,
            merge_color: '',
            attachment_file_path: null,
            invoice_number: null,
        }

        const updatesForLeader = {
            merge_group_id: null,
            merge_type: null,
            is_merge_leader: false,
            merge_color: '',
        }

        try {
            const nonLeaderIds = groupItems
                .filter(item => !item.is_merge_leader && item.payment_request_id)
                .map(item => item.payment_request_id!)

            if (nonLeaderIds.length > 0) {
                const { error: nonLeaderError } = await supabase
                    .from('payment_requests')
                    .update(updatesForNonLeaders)
                    .in('id', nonLeaderIds)

                if (nonLeaderError) throw nonLeaderError
            }

            if (leaderItem.payment_request_id) {
                const { error: leaderError } = await supabase
                    .from('payment_requests')
                    .update(updatesForLeader)
                    .eq('id', leaderItem.payment_request_id)

                if (leaderError) throw leaderError
            }

            // 更新本地狀態
            setItems(prev => prev.map(item => {
                if (item.merge_group_id === groupId) {
                    const isLeader = item.id === leaderItem.id
                    return {
                        ...item,
                        merge_type: null,
                        merge_group_id: null,
                        is_merge_leader: false,
                        merge_color: '',
                        attachments: isLeader ? item.attachments : [],
                        invoice_number_input: isLeader ? item.invoice_number_input : null,
                    } as T
                }
                return item
            }))

            toast.success(SUCCESS_MESSAGES.unmerge)
        } catch (error: any) {
            toast.error("解除合併失敗: " + error.message)
        }
    }, [items, setItems])

    // 清除選擇
    const clearSelection = useCallback(() => {
        setSelectedForMerge([])
        setSelectedMergeType(null)
    }, [])

    return {
        selectedForMerge,
        selectedMergeType,
        handleMergeTypeChange,
        handleMergeSelection,
        canMergeWith,
        handleMerge,
        handleUnmerge,
        clearSelection
    }
}
