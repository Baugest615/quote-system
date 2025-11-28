// Custom hook for payment submission logic

import { useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PendingPaymentItem } from '@/lib/payments/types'

export function usePaymentSubmission(
    items: PendingPaymentItem[],
    fetchPendingItems: () => Promise<void>
) {
    const handleConfirmUpload = useCallback(async (setLoading: (loading: boolean) => void) => {
        const selectedItems = items.filter(item => item.is_selected)

        if (selectedItems.length === 0) {
            toast.error('請選擇要申請付款的項目')
            return
        }

        const invalidCostItem = selectedItems.find(item => item.cost_amount_input <= 0)
        if (invalidCostItem) {
            toast.error(`項目 "${invalidCostItem.service}" 的成本金額必須大於 0`)
            return
        }

        setLoading(true)

        try {
            const operations = selectedItems.map(item => {
                const leaderItem = item.merge_group_id
                    ? items.find(i => i.merge_group_id === item.merge_group_id && i.is_merge_leader) || item
                    : item

                const requestData = {
                    quotation_item_id: item.id,
                    request_date: new Date().toISOString(),
                    verification_status: 'pending' as const,
                    cost_amount: item.cost_amount_input,
                    merge_type: item.merge_type,
                    merge_group_id: item.merge_group_id,
                    is_merge_leader: item.is_merge_leader,
                    merge_color: item.merge_color,
                    attachment_file_path: leaderItem.attachments.length > 0
                        ? JSON.stringify(leaderItem.attachments)
                        : null,
                    invoice_number: leaderItem.invoice_number_input?.trim() || null,
                    rejection_reason: null,
                    rejected_by: null,
                    rejected_at: null,
                }

                if (item.payment_request_id) {
                    return supabase
                        .from('payment_requests')
                        .update(requestData)
                        .eq('id', item.payment_request_id)
                } else {
                    return supabase
                        .from('payment_requests')
                        .insert(requestData)
                }
            })

            const results = await Promise.all(operations)
            const hasError = results.some(res => res.error)

            if (hasError) {
                const firstError = results.find(res => res.error)?.error
                throw new Error(`部分項目提交失敗: ${firstError?.message}`)
            }

            toast.success(`✅ 已成功提交 ${selectedItems.length} 筆請款申請`)
            await fetchPendingItems()
        } catch (error: any) {
            toast.error(error.message || '提交請款申請失敗')
        } finally {
            setLoading(false)
        }
    }, [items, fetchPendingItems])

    return {
        handleConfirmUpload
    }
}
