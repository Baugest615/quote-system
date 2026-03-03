'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type {
  WorkbenchItem,
  WorkbenchItemRaw,
  WorkbenchItemStatus,
  WorkbenchFilters,
  RemitteeGroup,
  MergeGroupInfo,
} from './types'

/** 推導項目的請款狀態 */
function deriveStatus(item: WorkbenchItemRaw): WorkbenchItemStatus {
  if (item.rejected_at) return 'rejected'
  if (item.requested_at) return 'requested'
  return 'pending'
}

/** 將原始資料轉為 WorkbenchItem（附加 UI 狀態） */
function toWorkbenchItem(raw: WorkbenchItemRaw): WorkbenchItem {
  return {
    ...raw,
    status: deriveStatus(raw),
    is_selected: false,
  }
}

/** 按匯款對象分組 */
function groupByRemittee(items: WorkbenchItem[]): RemitteeGroup[] {
  const groups = new Map<string, WorkbenchItem[]>()

  for (const item of items) {
    const key = item.remittance_name || item.kol_name || '未指定匯款對象'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  return Array.from(groups.entries()).map(([name, groupItems]) => {
    // 找出合併組
    const mergeGroupMap = new Map<string, WorkbenchItem[]>()
    for (const item of groupItems) {
      if (item.merge_group_id) {
        if (!mergeGroupMap.has(item.merge_group_id)) {
          mergeGroupMap.set(item.merge_group_id, [])
        }
        mergeGroupMap.get(item.merge_group_id)!.push(item)
      }
    }

    const merge_groups: MergeGroupInfo[] = Array.from(
      mergeGroupMap.entries()
    ).map(([groupId, mgItems]) => {
      const leader = mgItems.find((i) => i.is_merge_leader) || mgItems[0]
      const members = mgItems.filter((i) => !i.is_merge_leader)
      return {
        group_id: groupId,
        leader_item: leader,
        member_items: members,
        merge_color: leader.merge_color,
        total_amount: mgItems.reduce(
          (sum, i) => sum + (i.cost_amount || 0),
          0
        ),
        item_count: mgItems.length,
        status: leader.status,
      }
    })

    return {
      remittance_name: name,
      bank_info: groupItems[0]?.kol_bank_info || null,
      items: groupItems,
      merge_groups,
      total_amount: groupItems.reduce(
        (sum, i) => sum + (i.cost_amount || 0),
        0
      ),
      item_count: groupItems.length,
    }
  })
}

/** 篩選項目 */
function filterItems(
  items: WorkbenchItem[],
  filters: WorkbenchFilters
): WorkbenchItem[] {
  return items.filter((item) => {
    // 狀態篩選
    if (filters.status !== 'all' && item.status !== filters.status) return false

    // 專案篩選
    if (
      filters.project !== 'all' &&
      item.project_name !== filters.project
    )
      return false

    // 月份篩選
    if (
      filters.month !== 'all' &&
      item.expected_payment_month !== filters.month
    )
      return false

    // 關鍵字搜尋
    if (filters.search) {
      const term = filters.search.toLowerCase()
      const searchable = [
        item.remittance_name,
        item.kol_name,
        item.project_name,
        item.service,
        item.invoice_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!searchable.includes(term)) return false
    }

    return true
  })
}

export function useWorkbenchItems() {
  const queryClient = useQueryClient()

  const [filters, setFilters] = useState<WorkbenchFilters>({
    search: '',
    status: 'all',
    project: 'all',
    month: 'all',
  })

  // 從 RPC 取得工作台項目
  const {
    data: rawItems = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.workbenchItems,
    queryFn: async (): Promise<WorkbenchItem[]> => {
      const { data, error } = await supabase.rpc('get_workbench_items')
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data as any[]) || []).map((raw) => toWorkbenchItem(raw as WorkbenchItemRaw))
    },
  })

  // 篩選後的項目
  const filteredItems = useMemo(
    () => filterItems(rawItems, filters),
    [rawItems, filters]
  )

  // 按匯款對象分組
  const remitteeGroups = useMemo(
    () => groupByRemittee(filteredItems),
    [filteredItems]
  )

  // 按狀態分類
  const pendingItems = useMemo(
    () => rawItems.filter((i) => i.status === 'pending'),
    [rawItems]
  )
  const requestedItems = useMemo(
    () => rawItems.filter((i) => i.status === 'requested'),
    [rawItems]
  )
  const rejectedItems = useMemo(
    () => rawItems.filter((i) => i.status === 'rejected'),
    [rawItems]
  )

  // 可用的篩選選項
  const projectOptions = useMemo(() => {
    const projects = new Set(rawItems.map((i) => i.project_name).filter(Boolean))
    return Array.from(projects).sort() as string[]
  }, [rawItems])

  const monthOptions = useMemo(() => {
    const months = new Set(
      rawItems.map((i) => i.expected_payment_month).filter(Boolean)
    )
    return Array.from(months).sort() as string[]
  }, [rawItems])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
  }

  return {
    // 資料
    items: rawItems,
    filteredItems,
    remitteeGroups,
    pendingItems,
    requestedItems,
    rejectedItems,

    // 狀態
    isLoading,
    error,

    // 篩選
    filters,
    setFilters,
    projectOptions,
    monthOptions,

    // 操作
    invalidate,
  }
}
