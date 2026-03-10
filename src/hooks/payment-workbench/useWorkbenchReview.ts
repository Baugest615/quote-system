'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'

export function useWorkbenchReview() {
  const queryClient = useQueryClient()

  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
    await queryClient.invalidateQueries({ queryKey: queryKeys.confirmedPayments })
    await queryClient.invalidateQueries({ queryKey: queryKeys.quotations })
    // 帳務相關快取也需失效（核准會建立 accounting_expenses）
    await queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].startsWith('accounting-'),
    })
  }, [queryClient])

  /** 核准合併組（團進） */
  const approveMergeGroup = useCallback(
    async (groupId: string, paymentDate: string) => {
      setIsApproving(true)
      try {
        const { error } = await supabase.rpc('approve_merge_group', {
          p_group_id: groupId,
          p_payment_date: paymentDate,
        })

        if (error) throw error

        toast.success('合併組已核准')
        await invalidateAll()
      } catch (err) {
        const message = (err as { message?: string })?.message || '核准失敗'
        toast.error(message)
      } finally {
        setIsApproving(false)
      }
    },
    [invalidateAll]
  )

  /** 核准單筆項目 */
  const approveSingleItem = useCallback(
    async (itemId: string, paymentDate: string) => {
      setIsApproving(true)
      try {
        const { error } = await supabase.rpc('approve_quotation_item', {
          p_item_id: itemId,
          p_payment_date: paymentDate,
        })

        if (error) throw error

        toast.success('已核准請款')
        await invalidateAll()
      } catch (err) {
        const message = (err as { message?: string })?.message || '核准失敗'
        toast.error(message)
      } finally {
        setIsApproving(false)
      }
    },
    [invalidateAll]
  )

  /** 駁回合併組（團出） */
  const rejectMergeGroup = useCallback(
    async (groupId: string, reason: string) => {
      setIsRejecting(true)
      try {
        const { error } = await supabase.rpc('reject_merge_group', {
          p_group_id: groupId,
          p_reason: reason,
        })

        if (error) throw error

        toast.success('合併組已駁回')
        await invalidateAll()
      } catch (err) {
        const message = (err as { message?: string })?.message || '駁回失敗'
        toast.error(message)
      } finally {
        setIsRejecting(false)
      }
    },
    [invalidateAll]
  )

  /** 駁回單筆項目 */
  const rejectSingleItem = useCallback(
    async (itemId: string, reason: string) => {
      setIsRejecting(true)
      try {
        const { error } = await supabase.rpc('reject_quotation_item', {
          p_item_id: itemId,
          p_reason: reason,
        })

        if (error) throw error

        toast.success('已駁回請款')
        await invalidateAll()
      } catch (err) {
        const message = (err as { message?: string })?.message || '駁回失敗'
        toast.error(message)
      } finally {
        setIsRejecting(false)
      }
    },
    [invalidateAll]
  )

  return {
    approveMergeGroup,
    approveSingleItem,
    rejectMergeGroup,
    rejectSingleItem,
    isApproving,
    isRejecting,
  }
}
