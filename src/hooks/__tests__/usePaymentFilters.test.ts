/**
 * usePaymentFilters Hook 整合測試
 * 測試篩選狀態管理、搜尋、狀態過濾、日期範圍過濾等邏輯
 */
import { renderHook, act } from '@testing-library/react'
import { usePaymentFilters } from '@/hooks/payments/usePaymentFilters'

// ---- 測試用資料結構 ----
interface SimpleItem {
  id: string
  name: string
  project_name: string
  rejection_reason?: string | null
  attachments?: { url: string }[]
  invoice_number_input?: string | null
  created_at?: string | null
}

const makeItems = (): SimpleItem[] => [
  { id: '1', name: 'Alice KOL', project_name: 'ProjectA', rejection_reason: null, attachments: [], invoice_number_input: null, created_at: '2026-01-01T00:00:00Z' },
  { id: '2', name: 'Bob Service', project_name: 'ProjectB', rejection_reason: 'wrong amount', attachments: [], invoice_number_input: null, created_at: '2026-02-01T00:00:00Z' },
  { id: '3', name: 'Charlie KOL', project_name: 'ProjectA', rejection_reason: null, attachments: [{ url: 'https://a.com/file.pdf' }], invoice_number_input: null, created_at: '2026-03-01T00:00:00Z' },
  { id: '4', name: 'Dave Service', project_name: 'ProjectC', rejection_reason: null, attachments: [], invoice_number_input: 'AB-12345678', created_at: '2026-03-15T00:00:00Z' },
]

const defaultOptions = {
  searchFields: ['name', 'project_name'] as (keyof SimpleItem)[],
}

// ===== 初始狀態 =====

describe('usePaymentFilters — initial state', () => {
  test('returns all items when no filters applied', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))
    expect(result.current.filteredItems).toHaveLength(4)
  })

  test('initial values are empty/all', () => {
    const { result } = renderHook(() => usePaymentFilters([], defaultOptions))
    expect(result.current.searchTerm).toBe('')
    expect(result.current.statusFilter).toBe('all')
    expect(result.current.dateRange).toEqual({ start: null, end: null })
    expect(result.current.clientFilter).toBeNull()
    expect(result.current.kolFilter).toBeNull()
    expect(result.current.hasActiveFilters).toBe(false)
  })

  test('defaultStatus option sets initial statusFilter', () => {
    const { result } = renderHook(() =>
      usePaymentFilters([], { ...defaultOptions, defaultStatus: 'rejected' })
    )
    expect(result.current.statusFilter).toBe('rejected')
  })
})

// ===== 搜尋篩選 =====

describe('usePaymentFilters — search', () => {
  test('filters by searchTerm (case insensitive)', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setSearchTerm('alice'))
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe('1')
  })

  test('filters by project_name', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setSearchTerm('ProjectA'))
    expect(result.current.filteredItems).toHaveLength(2)
    expect(result.current.filteredItems.map(i => i.id)).toEqual(['1', '3'])
  })

  test('returns no results for non-matching search', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setSearchTerm('zzzzz'))
    expect(result.current.filteredItems).toHaveLength(0)
  })

  test('hasActiveFilters is true when searchTerm set', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setSearchTerm('alice'))
    expect(result.current.hasActiveFilters).toBe(true)
  })

  test('empty searchTerm shows all items', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setSearchTerm('alice'))
    act(() => result.current.setSearchTerm(''))
    expect(result.current.filteredItems).toHaveLength(4)
  })
})

// ===== 狀態過濾（rejection_reason 判斷邏輯） =====

describe('usePaymentFilters — status filter (rejection_reason logic)', () => {
  test('rejected filter returns only rejected items', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setStatusFilter('rejected'))
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe('2')
  })

  test('ready filter returns items with attachments or valid invoice', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setStatusFilter('ready'))
    const ids = result.current.filteredItems.map(i => i.id)
    // Item 3 has attachments, item 4 has valid invoice
    expect(ids).toContain('3')
    expect(ids).toContain('4')
    // Item 1 has no attachments and no invoice
    expect(ids).not.toContain('1')
  })

  test('incomplete filter returns items without attachments and without valid invoice', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setStatusFilter('incomplete'))
    const ids = result.current.filteredItems.map(i => i.id)
    expect(ids).toContain('1')
    expect(ids).not.toContain('3')
    expect(ids).not.toContain('4')
  })

  test('invalid invoice format does not trigger "ready" status', () => {
    const items: SimpleItem[] = [
      { id: '5', name: 'Eve', project_name: 'P', rejection_reason: null, attachments: [], invoice_number_input: 'invalid-format', created_at: null },
    ]
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => result.current.setStatusFilter('ready'))
    expect(result.current.filteredItems).toHaveLength(0)
  })
})

// ===== 日期範圍過濾 =====

describe('usePaymentFilters — date range filter', () => {
  const optionsWithDate = {
    ...defaultOptions,
    enableDateFilter: true,
  }

  test('start date filters out earlier items', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, optionsWithDate))

    act(() =>
      result.current.setDateRange({
        start: new Date('2026-02-01T00:00:00Z'),
        end: null,
      })
    )
    // Items created on/after Feb 1: items 2, 3, 4
    expect(result.current.filteredItems.length).toBeGreaterThanOrEqual(3)
    expect(result.current.filteredItems.map(i => i.id)).not.toContain('1')
  })

  test('end date filters out later items', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, optionsWithDate))

    act(() =>
      result.current.setDateRange({
        start: null,
        end: new Date('2026-01-31T23:59:59Z'),
      })
    )
    // Only item 1 (Jan 1)
    expect(result.current.filteredItems).toHaveLength(1)
    expect(result.current.filteredItems[0].id).toBe('1')
  })

  test('date range with both start and end', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, optionsWithDate))

    act(() =>
      result.current.setDateRange({
        start: new Date('2026-02-01T00:00:00Z'),
        end: new Date('2026-03-01T23:59:59Z'),
      })
    )
    // Items 2 (Feb 1) and 3 (Mar 1)
    const ids = result.current.filteredItems.map(i => i.id)
    expect(ids).toContain('2')
    expect(ids).toContain('3')
    expect(ids).not.toContain('1')
  })

  test('date filter not applied when enableDateFilter is false', () => {
    const items = makeItems()
    const { result } = renderHook(() =>
      usePaymentFilters(items, { ...defaultOptions, enableDateFilter: false })
    )

    act(() =>
      result.current.setDateRange({
        start: new Date('2030-01-01'),
        end: null,
      })
    )
    // Date filter disabled: all items pass
    expect(result.current.filteredItems).toHaveLength(4)
  })
})

// ===== clearFilters =====

describe('usePaymentFilters — clearFilters', () => {
  test('resets all filters to defaults', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => {
      result.current.setSearchTerm('alice')
      result.current.setStatusFilter('rejected')
      result.current.setDateRange({ start: new Date('2026-01-01'), end: null })
    })
    expect(result.current.hasActiveFilters).toBe(true)

    act(() => result.current.clearFilters())

    expect(result.current.searchTerm).toBe('')
    expect(result.current.statusFilter).toBe('all')
    expect(result.current.dateRange).toEqual({ start: null, end: null })
    expect(result.current.clientFilter).toBeNull()
    expect(result.current.kolFilter).toBeNull()
    expect(result.current.hasActiveFilters).toBe(false)
    expect(result.current.filteredItems).toHaveLength(4)
  })
})

// ===== 組合篩選 =====

describe('usePaymentFilters — combined filters', () => {
  test('search + status can narrow down to zero results', () => {
    const items = makeItems()
    const { result } = renderHook(() => usePaymentFilters(items, defaultOptions))

    act(() => {
      result.current.setSearchTerm('alice')
      result.current.setStatusFilter('rejected')
    })
    // Alice is not rejected
    expect(result.current.filteredItems).toHaveLength(0)
  })
})
