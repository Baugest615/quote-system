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
} from './types'
import {
  groupByRemittee as groupByRemitteeUtil,
  groupByCategory as groupByCategoryUtil,
} from './grouping'
import { expenseMonthToYYYYMM, yyyymmToChinese } from '@/lib/payments/aggregation'

/** 推導項目的請款狀態（被駁回/撤回的項目歸入 pending，由 UI 顯示駁回原因） */
function deriveStatus(item: WorkbenchItemRaw): WorkbenchItemStatus {
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

    // 月份篩選（正規化比對，支援中文/ISO 混合格式）
    if (
      filters.month !== 'all' &&
      expenseMonthToYYYYMM(item.expected_payment_month || '') !== expenseMonthToYYYYMM(filters.month)
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
    () => groupByRemitteeUtil(filteredItems),
    [filteredItems]
  )

  // v1.1: 按帳戶類型歸類
  const categorySections = useMemo(
    () => groupByCategoryUtil(remitteeGroups),
    [remitteeGroups]
  )

  // 按狀態分類（使用篩選後資料，讓 Tab 計數與內容一致）
  const pendingItems = useMemo(
    () => filteredItems.filter((i) => i.status === 'pending'),
    [filteredItems]
  )
  const requestedItems = useMemo(
    () => filteredItems.filter((i) => i.status === 'requested'),
    [filteredItems]
  )


  // 可用的篩選選項
  const projectOptions = useMemo(() => {
    const projects = new Set(rawItems.map((i) => i.project_name).filter(Boolean))
    return Array.from(projects).sort() as string[]
  }, [rawItems])

  const monthOptions = useMemo(() => {
    const seen = new Map<string, string>()
    rawItems.forEach(i => {
      if (!i.expected_payment_month) return
      const key = expenseMonthToYYYYMM(i.expected_payment_month)
      if (key && !seen.has(key)) {
        seen.set(key, yyyymmToChinese(key) || i.expected_payment_month)
      }
    })
    return Array.from(seen.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, display]) => display)
  }, [rawItems])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
  }

  return {
    // 資料
    items: rawItems,
    filteredItems,
    remitteeGroups,
    categorySections,
    pendingItems,
    requestedItems,

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
