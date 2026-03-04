'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'

export function useWorkbenchSubmission() {
  const queryClient = useQueryClient()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
    await queryClient.invalidateQueries({ queryKey: queryKeys.quotations })
  }, [queryClient])

  /** 送出合併組（團進） */
  const submitMergeGroup = useCallback(
    async (groupId: string) => {
      setIsSubmitting(true)
      try {
        const { error } = await supabase.rpc('submit_merge_group', {
          p_group_id: groupId,
        })

        if (error) throw error

        toast.success('合併組已送出請款')
        await invalidateAll()
      } catch (err) {
        const message = err instanceof Error ? err.message : '送出失敗'
        toast.error(message)
      } finally {
        setIsSubmitting(false)
      }
    },
    [invalidateAll]
  )

  /** 送出單筆項目 */
  const submitSingleItem = useCallback(
    async (itemId: string) => {
      setIsSubmitting(true)
      try {
        const { error } = await supabase.rpc('submit_single_item', {
          p_item_id: itemId,
        })

        if (error) throw error

        toast.success('已送出請款')
        await invalidateAll()
      } catch (err) {
        const message = err instanceof Error ? err.message : '送出失敗'
        toast.error(message)
      } finally {
        setIsSubmitting(false)
      }
    },
    [invalidateAll]
  )

  /** 撤回合併組 */
  const withdrawMergeGroup = useCallback(
    async (groupId: string) => {
      setIsWithdrawing(true)
      try {
        const { error } = await supabase.rpc('withdraw_merge_group', {
          p_group_id: groupId,
        })

        if (error) throw error

        toast.success('合併組已撤回')
        await invalidateAll()
      } catch (err) {
        const message = err instanceof Error ? err.message : '撤回失敗'
        toast.error(message)
      } finally {
        setIsWithdrawing(false)
      }
    },
    [invalidateAll]
  )

  /** 撤回單筆項目 */
  const withdrawSingleItem = useCallback(
    async (itemId: string) => {
      setIsWithdrawing(true)
      try {
        const { error } = await supabase.rpc('withdraw_single_item', {
          p_item_id: itemId,
        })

        if (error) throw error

        toast.success('已撤回請款')
        await invalidateAll()
      } catch (err) {
        const message = err instanceof Error ? err.message : '撤回失敗'
        toast.error(message)
      } finally {
        setIsWithdrawing(false)
      }
    },
    [invalidateAll]
  )

  return {
    submitMergeGroup,
    submitSingleItem,
    withdrawMergeGroup,
    withdrawSingleItem,
    isSubmitting,
    isWithdrawing,
  }
}
