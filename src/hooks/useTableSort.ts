'use client'

import { useState, useCallback } from 'react'

export interface SortState<K extends string = string> {
  key: K | null
  direction: 'asc' | 'desc' | null
}

/**
 * Generic table sort hook.
 * Click toggles: asc → desc → none (reset).
 *
 * K = sort key type (default string). Use `keyof T` for strict field matching
 * or plain `string` for computed / virtual columns.
 */
export function useTableSort<K extends string = string>(initialKey?: K, initialDir?: 'asc' | 'desc') {
  const [sortState, setSortState] = useState<SortState<K>>({
    key: initialKey ?? null,
    direction: initialDir ?? null,
  })

  const toggleSort = useCallback((key: K) => {
    setSortState(prev => {
      if (prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return { key: null, direction: null }
    })
  }, [])

  /**
   * Convenience sort for flat objects where K = keyof T.
   * For computed or nested columns, sort manually using `sortState`.
   */
  const sortData = useCallback(
    <T extends Record<string, unknown>>(data: T[]): T[] => {
      if (!sortState.key || !sortState.direction) return data

      const key = sortState.key
      const dir = sortState.direction === 'asc' ? 1 : -1

      return [...data].sort((a, b) => {
        const aVal = a[key]
        const bVal = b[key]

        // null / undefined always last
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1

        // number
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * dir
        }

        // string (includes date strings YYYY-MM-DD)
        const aStr = String(aVal)
        const bStr = String(bVal)
        return aStr.localeCompare(bStr, 'zh-Hant') * dir
      })
    },
    [sortState.key, sortState.direction]
  )

  const resetSort = useCallback(() => {
    setSortState({ key: null, direction: null })
  }, [])

  return { sortState, toggleSort, sortData, resetSort } as const
}
