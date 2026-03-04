'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTableSort } from '@/hooks/useTableSort'
import { useColumnFilters, type FilterValue } from '@/hooks/useColumnFilters'
import type { FlatQuotationItem } from '@/hooks/useQuotationItemsFlat'
import {
  type ColumnKey, type FlatSortKey,
  COLUMN_DEFS, getSortValue,
} from './flat-view-constants'

export function useFlatViewState(items: FlatQuotationItem[]) {
  // 搜尋
  const [searchTerm, setSearchTerm] = useState('')

  // 選取
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 欄位顯示/隱藏
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    () => new Set(COLUMN_DEFS.map(c => c.key))
  )
  const toggleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])
  const isColVisible = useCallback((key: ColumnKey) => visibleColumns.has(key), [visibleColumns])

  // 排序 & 篩選
  const { sortState, toggleSort } = useTableSort<FlatSortKey>()
  const { filters, setFilter, activeCount: filterActiveCount } = useColumnFilters<Record<FlatSortKey, unknown>>()

  // 分頁
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  // 搜尋變更時重置分頁和選取
  useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()) }, [searchTerm])

  // 篩選器 helpers
  const getFilter = (key: FlatSortKey): FilterValue | null =>
    filters.get(key as keyof Record<FlatSortKey, unknown>) ?? null
  const setFilterByKey = (key: FlatSortKey, value: FilterValue | null) =>
    setFilter(key as keyof Record<FlatSortKey, unknown>, value)

  // 唯一值（for select filters）
  const uniqueClients = useMemo(() =>
    Array.from(new Set(items.map(i => i.quotations?.clients?.name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [items]
  )
  const uniqueStatuses = ['草稿', '待簽約', '已簽約', '已歸檔']
  const uniqueKolNames = useMemo(() =>
    Array.from(new Set(items.map(i => i.kols?.name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [items]
  )
  const uniqueCategories = useMemo(() =>
    Array.from(new Set(items.map(i => i.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [items]
  )

  // ─── 篩選 + 排序 + 搜尋 ──────────────────────────────────
  const processedItems = useMemo(() => {
    let result = [...items]

    // 全文搜尋
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        (item.quotations?.quote_number || '').toLowerCase().includes(term) ||
        (item.quotations?.project_name || '').toLowerCase().includes(term) ||
        (item.quotations?.clients?.name || '').toLowerCase().includes(term) ||
        (item.kols?.name || '').toLowerCase().includes(term) ||
        (item.service || '').toLowerCase().includes(term) ||
        (item.invoice_number || '').toLowerCase().includes(term) ||
        (item.category || '').toLowerCase().includes(term)
      )
    }

    // 欄位篩選
    if (filters.size > 0) {
      result = result.filter(item => {
        let pass = true
        filters.forEach((fv, key) => {
          if (!pass) return
          const sortKey = String(key) as FlatSortKey
          const val = getSortValue(item, sortKey)

          switch (fv.type) {
            case 'text': {
              if (!fv.value) return
              const str = val == null ? '' : String(val)
              if (!str.toLowerCase().includes(fv.value.toLowerCase())) pass = false
              break
            }
            case 'select': {
              if (fv.selected.length === 0) return
              const str = val == null ? '' : String(val)
              if (!fv.selected.includes(str)) pass = false
              break
            }
            case 'number': {
              const num = typeof val === 'number' ? val : 0
              if (fv.min != null && num < fv.min) pass = false
              if (fv.max != null && num > fv.max) pass = false
              break
            }
          }
        })
        return pass
      })
    }

    // 排序
    if (sortState.key && sortState.direction) {
      const sk = sortState.key
      const dir = sortState.direction === 'asc' ? 1 : -1
      result.sort((a, b) => {
        const aVal = getSortValue(a, sk)
        const bVal = getSortValue(b, sk)
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
        return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
      })
    }

    return result
  }, [items, searchTerm, filters, sortState])

  // 分頁
  const totalCount = processedItems.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const paginatedItems = processedItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // 可見欄位數量（用於 colSpan）
  const visibleColCount = COLUMN_DEFS.filter(c => isColVisible(c.key)).length

  return {
    // 搜尋
    searchTerm, setSearchTerm,
    // 選取
    selectedIds, setSelectedIds,
    // 欄位顯示
    visibleColumns, toggleColumn, isColVisible, visibleColCount,
    // 排序 & 篩選
    sortState, toggleSort,
    filters, getFilter, setFilterByKey, filterActiveCount,
    // 唯一值
    uniqueClients, uniqueStatuses, uniqueKolNames, uniqueCategories,
    // 分頁
    currentPage, setCurrentPage, pageSize, totalCount, totalPages, paginatedItems,
  }
}
