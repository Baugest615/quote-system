'use client'

import { useState, useCallback, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Filter value types (per-column)
// ---------------------------------------------------------------------------

export type FilterValue =
  | { type: 'text'; value: string }
  | { type: 'select'; selected: string[] }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'date'; start?: string; end?: string }

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useColumnFilters<T>() {
  const [filters, setFilters] = useState<Map<keyof T, FilterValue>>(new Map())

  const setFilter = useCallback((key: keyof T, value: FilterValue | null) => {
    setFilters(prev => {
      const next = new Map(prev)
      if (value === null) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setFilters(new Map())
  }, [])

  const activeCount = useMemo(() => {
    let count = 0
    filters.forEach(v => {
      if (v.type === 'text' && v.value) count++
      else if (v.type === 'select' && v.selected.length > 0) count++
      else if (v.type === 'number' && (v.min != null || v.max != null)) count++
      else if (v.type === 'date' && (v.start || v.end)) count++
    })
    return count
  }, [filters])

  const filterData = useCallback(
    (data: T[]): T[] => {
      if (filters.size === 0) return data

      return data.filter(row => {
        let pass = true
        filters.forEach((fv, key) => {
          if (!pass) return
          const cellValue = (row as Record<string, unknown>)[key as string]

          switch (fv.type) {
            case 'text': {
              if (!fv.value) return
              const str = cellValue == null ? '' : String(cellValue)
              if (!str.toLowerCase().includes(fv.value.toLowerCase())) pass = false
              break
            }
            case 'select': {
              if (fv.selected.length === 0) return
              const str = cellValue == null ? '' : String(cellValue)
              if (!fv.selected.includes(str)) pass = false
              break
            }
            case 'number': {
              const num = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue ?? ''))
              if (isNaN(num)) {
                if (fv.min != null || fv.max != null) pass = false
                return
              }
              if (fv.min != null && num < fv.min) pass = false
              if (fv.max != null && num > fv.max) pass = false
              break
            }
            case 'date': {
              if (!fv.start && !fv.end) return
              const str = cellValue == null ? '' : String(cellValue)
              if (!str) { pass = false; return }
              if (fv.start && str < fv.start) pass = false
              if (fv.end && str > fv.end + 'T23:59:59') pass = false
              break
            }
          }
        })
        return pass
      })
    },
    [filters]
  )

  return { filters, setFilter, clearAll, filterData, activeCount } as const
}
