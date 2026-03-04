/**
 * usePaymentGrouping Hook 整合測試
 * 測試專案分組、展開/收合狀態管理邏輯
 */
import { renderHook, act } from '@testing-library/react'
import { usePaymentGrouping } from '@/hooks/payments/usePaymentGrouping'
import type { PaymentAttachment } from '@/lib/payments/types'

// ---- 測試用資料結構 ----
interface TestItem {
  quotation_id: string | null
  quotations: {
    project_name: string
    clients: { name: string } | null
    created_at?: string | null
  } | null
  cost_amount_input?: number
  price?: number
  quantity?: number
  rejection_reason?: string | null
  attachments?: PaymentAttachment[]
  invoice_number_input?: string | null
}

function makeItem(projectId: string, projectName: string, clientName?: string): TestItem {
  return {
    quotation_id: projectId,
    quotations: {
      project_name: projectName,
      clients: clientName ? { name: clientName } : null,
      created_at: null,
    },
  }
}

// ===== 初始狀態 =====

describe('usePaymentGrouping — initial state', () => {
  test('empty items produces empty groups', () => {
    const { result } = renderHook(() => usePaymentGrouping([]))
    expect(result.current.projectGroups).toHaveLength(0)
    expect(result.current.isAllCollapsed).toBe(true)
    expect(result.current.isAllExpanded).toBe(false)
  })

  test('items grouped by quotation_id', () => {
    const items: TestItem[] = [
      makeItem('q1', 'Project Alpha'),
      makeItem('q1', 'Project Alpha'),
      makeItem('q2', 'Project Beta'),
    ]
    const { result } = renderHook(() => usePaymentGrouping(items))
    expect(result.current.projectGroups).toHaveLength(2)
  })

  test('all groups start collapsed', () => {
    const items: TestItem[] = [
      makeItem('q1', 'Alpha'),
      makeItem('q2', 'Beta'),
    ]
    const { result } = renderHook(() => usePaymentGrouping(items))
    for (const group of result.current.projectGroups) {
      expect(group.isExpanded).toBe(false)
    }
    expect(result.current.isAllCollapsed).toBe(true)
    expect(result.current.isAllExpanded).toBe(false)
  })
})

// ===== toggleProject =====

describe('usePaymentGrouping — toggleProject', () => {
  test('toggleProject expands a collapsed group', () => {
    const items: TestItem[] = [makeItem('q1', 'Alpha'), makeItem('q2', 'Beta')]
    const { result } = renderHook(() => usePaymentGrouping(items))

    act(() => result.current.toggleProject('q1'))

    const q1Group = result.current.projectGroups.find(g => g.projectId === 'q1')
    const q2Group = result.current.projectGroups.find(g => g.projectId === 'q2')
    expect(q1Group?.isExpanded).toBe(true)
    expect(q2Group?.isExpanded).toBe(false)
  })

  test('toggleProject collapses an expanded group', () => {
    const items: TestItem[] = [makeItem('q1', 'Alpha')]
    const { result } = renderHook(() => usePaymentGrouping(items))

    act(() => result.current.toggleProject('q1'))
    expect(result.current.projectGroups[0].isExpanded).toBe(true)

    act(() => result.current.toggleProject('q1'))
    expect(result.current.projectGroups[0].isExpanded).toBe(false)
  })

  test('toggling unknown projectId does not crash', () => {
    const items: TestItem[] = [makeItem('q1', 'Alpha')]
    const { result } = renderHook(() => usePaymentGrouping(items))

    expect(() => {
      act(() => result.current.toggleProject('nonexistent'))
    }).not.toThrow()
  })
})

// ===== expandAll / collapseAll =====

describe('usePaymentGrouping — expandAll / collapseAll', () => {
  function setup() {
    const items: TestItem[] = [
      makeItem('q1', 'Alpha'),
      makeItem('q2', 'Beta'),
      makeItem('q3', 'Gamma'),
    ]
    return renderHook(() => usePaymentGrouping(items))
  }

  test('expandAll expands every group', () => {
    const { result } = setup()

    act(() => result.current.expandAll())

    expect(result.current.isAllExpanded).toBe(true)
    expect(result.current.isAllCollapsed).toBe(false)
    for (const group of result.current.projectGroups) {
      expect(group.isExpanded).toBe(true)
    }
  })

  test('collapseAll collapses every group', () => {
    const { result } = setup()

    act(() => result.current.expandAll())
    act(() => result.current.collapseAll())

    expect(result.current.isAllCollapsed).toBe(true)
    expect(result.current.isAllExpanded).toBe(false)
    for (const group of result.current.projectGroups) {
      expect(group.isExpanded).toBe(false)
    }
  })

  test('isAllExpanded is false when only partial groups expanded', () => {
    const { result } = setup()

    act(() => result.current.toggleProject('q1'))

    expect(result.current.isAllExpanded).toBe(false)
    expect(result.current.isAllCollapsed).toBe(false)
  })
})

// ===== 空狀態邊界 =====

describe('usePaymentGrouping — edge cases', () => {
  test('items with null quotation_id are grouped together', () => {
    const items: TestItem[] = [
      { ...makeItem('null_id', 'Unknown'), quotation_id: null, quotations: null },
      { ...makeItem('null_id', 'Unknown'), quotation_id: null, quotations: null },
    ]
    const { result } = renderHook(() => usePaymentGrouping(items))
    // null ids should collapse into a single group
    expect(result.current.projectGroups.length).toBeLessThanOrEqual(1)
  })

  test('single item creates one group', () => {
    const items: TestItem[] = [makeItem('q1', 'Solo')]
    const { result } = renderHook(() => usePaymentGrouping(items))
    expect(result.current.projectGroups).toHaveLength(1)
  })

  test('expandAll on empty list does not crash', () => {
    const { result } = renderHook(() => usePaymentGrouping([]))
    expect(() => {
      act(() => result.current.expandAll())
    }).not.toThrow()
    expect(result.current.isAllExpanded).toBe(false)
  })
})
