// Custom hook for merge operations

import { useState, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PendingPaymentItem } from '@/lib/payments/types'

const MERGE_COLORS = ['bg-red-100', 'bg-blue-100', 'bg-green-100', 'bg-yellow-100', 'bg-purple-100', 'bg-pink-100']

export function useMergeOperations(
    items: PendingPaymentItem[],
    setItems: React.Dispatch<React.SetStateAction<PendingPaymentItem[]>>
) {
    const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
    const [selectedMergeType, setSelectedMergeType] = useState<'account' | null>(null)

    const handleMergeTypeChange = useCallback(() => {
        setSelectedMergeType(prev => prev ? null : 'account')
        setSelectedForMerge([])
    }, [])

    const handleMergeSelection = useCallback((itemId: string, checked: boolean) => {
        if (checked) {
            setSelectedForMerge(prev => [...prev, itemId])
        } else {
            setSelectedForMerge(prev => prev.filter(id => id !== itemId))
        }
    }, [])

    const canMergeWith = useCallback((item: PendingPaymentItem) => {
        if (!selectedMergeType || selectedForMerge.length === 0) return true

        const firstSelectedItem = items.find(i => i.id === selectedForMerge[0])
        if (!firstSelectedItem) return true

        const firstBankInfo = firstSelectedItem.kols?.bank_info
        const currentBankInfo = item.kols?.bank_info

        if (!firstBankInfo || !currentBankInfo) return false

        return JSON.stringify(firstBankInfo) === JSON.stringify(currentBankInfo)
    }, [items, selectedForMerge, selectedMergeType])

    const handleMerge = useCallback(() => {
        if (selectedForMerge.length < 2) {
            toast.error('請選擇至少兩筆資料進行合併')
            return
        }

        if (!window.confirm('你是否確認合併申請？')) return

        const groupId = `merge-${Date.now()}`
        const colorIndex = items
            .filter(i => i.merge_group_id)
            .map(i => i.merge_group_id)
            .filter((v, i, a) => a.indexOf(v) === i).length
        const mergeColor = MERGE_COLORS[colorIndex % MERGE_COLORS.length]

        setItems(prev => prev.map(item => {
            if (selectedForMerge.includes(item.id)) {
                return {
                    ...item,
                    merge_type: 'account',
                    merge_group_id: groupId,
                    is_merge_leader: item.id === selectedForMerge[0],
                    merge_color: mergeColor
                }
            }
            return item
        }))

        setSelectedForMerge([])
        setSelectedMergeType(null)
        toast.success(`已合併 ${selectedForMerge.length} 筆資料`)
    }, [items, selectedForMerge, setItems])

    const handleUnmerge = useCallback(async (groupId: string) => {
        const groupItems = items.filter(i => i.merge_group_id === groupId)

        if (!window.confirm(`確定要解除合併嗎？這將影響 ${groupItems.length} 個項目。`)) return

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
                    }
                }
                return item
            }))

            toast.success(`已解除合併`)
        } catch (error: any) {
            toast.error("解除合併失敗: " + error.message)
        }
    }, [items, setItems])

    return {
        selectedForMerge,
        selectedMergeType,
        handleMergeTypeChange,
        handleMergeSelection,
        canMergeWith,
        handleMerge,
        handleUnmerge
    }
}
