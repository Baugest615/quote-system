'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import type { WorkbenchItem } from './types'

export function useWorkbenchMerge() {
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isMerging, setIsMerging] = useState(false)

  /** 切換項目勾選 */
  const toggleSelection = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }, [])

  /** 全選 / 全取消 */
  const toggleAll = useCallback((items: WorkbenchItem[]) => {
    setSelectedIds((prev) => {
      const selectableIds = items
        .filter((i) => i.status === 'pending' && !i.merge_group_id)
        .map((i) => i.id)
      const allSelected = selectableIds.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(selectableIds)
    })
  }, [])

  /** 清除所有勾選 */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  /** 檢查是否可合併（同銀行帳戶） */
  const canMerge = useCallback(
    (items: WorkbenchItem[]): { valid: boolean; error?: string; hasCrossMonth?: boolean } => {
      const selected = items.filter((i) => selectedIds.has(i.id))
      if (selected.length < 2) {
        return { valid: false, error: '至少選擇 2 筆項目' }
      }

      // 檢查全部是 pending 且未在其他組
      const nonPending = selected.find(
        (i) => i.status !== 'pending' || i.merge_group_id
      )
      if (nonPending) {
        return {
          valid: false,
          error: '只能合併待請款且未加入其他組的項目',
        }
      }

      // 檢查銀行帳戶一致
      const firstBankInfo = JSON.stringify(selected[0].kol_bank_info)
      const mismatch = selected.find(
        (i) => JSON.stringify(i.kol_bank_info) !== firstBankInfo
      )
      if (mismatch) {
        return { valid: false, error: '所選項目的銀行帳戶不一致，無法合併' }
      }

      // 檢查是否跨月
      const months = new Set(
        selected.map((i) => i.expected_payment_month).filter(Boolean)
      )
      const hasCrossMonth = months.size > 1

      return { valid: true, hasCrossMonth }
    },
    [selectedIds]
  )

  /** 建立合併組 */
  const createMergeGroup = useCallback(
    async (leaderId: string, paymentMonth?: string) => {
      setIsMerging(true)
      try {
        const itemIds = Array.from(selectedIds)
        const { data, error } = await supabase.rpc(
          'create_quotation_merge_group',
          {
            p_item_ids: itemIds,
            p_leader_id: leaderId,
            ...(paymentMonth ? { p_payment_month: paymentMonth } : {}),
          }
        )

        if (error) throw error

        toast.success(`已建立合併組（${itemIds.length} 筆）`)
        clearSelection()
        queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
        return data as string
      } catch (err) {
        const message = err instanceof Error ? err.message : '合併失敗'
        toast.error(message)
        return null
      } finally {
        setIsMerging(false)
      }
    },
    [selectedIds, queryClient, clearSelection]
  )

  /** 拆分合併組 */
  const dissolveMergeGroup = useCallback(
    async (groupId: string) => {
      try {
        const { error } = await supabase.rpc(
          'dissolve_quotation_merge_group',
          { p_group_id: groupId }
        )

        if (error) throw error

        toast.success('合併組已拆分')
        queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
      } catch (err) {
        const message = err instanceof Error ? err.message : '拆分失敗'
        toast.error(message)
      }
    },
    [queryClient]
  )

  return {
    // 勾選狀態
    selectedIds,
    toggleSelection,
    toggleAll,
    clearSelection,

    // 合併操作
    canMerge,
    createMergeGroup,
    dissolveMergeGroup,
    isMerging,
  }
}
