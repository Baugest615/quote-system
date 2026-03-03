import {
  groupItemsByProject,
  getCompletionPercentage,
  groupItemsByAccount,
  groupItemsByRemittance,
  getMergeLeader,
  getMergeGroupItems,
  calculateMergeGroupTotal,
  isInMergeGroup,
  generateMergeGroupId,
  groupItemsByStatus,
  groupItemsByDate,
  groupItemsByKOL,
  groupItemsByClient,
  expandAllGroups,
  collapseAllGroups,
  toggleGroupExpansion,
} from '../grouping'
import type { ProjectGroup, PaymentConfirmationItem } from '../types'

// ==================== Mock 工廠函數 ====================

/** 建立最小可用的待請款項目 */
function makePendingItem(overrides: Record<string, unknown> = {}) {
  return {
    quotation_id: 'q1',
    quotations: {
      project_name: '專案A',
      clients: { name: '客戶A' },
      created_at: '2026-01-01',
    },
    cost_amount_input: 1000,
    price: 1000,
    quantity: 1,
    rejection_reason: null,
    attachments: [{ name: 'f.pdf', url: 'u', path: 'p', uploadedAt: '2026-01-01', size: 100 }],
    invoice_number_input: 'AB-12345678',
    ...overrides,
  }
}

/** 建立最小可用的已確認請款項目 */
function makeConfirmationItem(overrides: Partial<PaymentConfirmationItem> = {}): PaymentConfirmationItem {
  return {
    id: 'ci-1',
    payment_confirmation_id: 'pc-1',
    payment_request_id: 'pr-1',
    expense_claim_id: null,
    quotation_item_id: null,
    source_type: 'project',
    amount: 5000,
    created_at: '2026-01-01',
    payment_requests: {
      quotation_item_id: 'qi-1',
      cost_amount: 5000,
      invoice_number: 'AB-12345678',
      merge_group_id: null,
      merge_color: null,
      quotation_items: {
        id: 'qi-1',
        quotation_id: 'q-1',
        quotations: {
          project_name: '專案A',
          quote_number: 'Q-001',
          client_id: 'c-1',
          clients: { name: '客戶A' },
          created_at: '2026-01-01',
        },
        kol_id: 'k-1',
        kols: {
          id: 'k-1',
          name: 'KOL王',
          real_name: '王大明',
          bank_info: {
            bankType: 'individual',
            personalAccountName: '王大明',
            bankName: '台新銀行',
            branchName: '信義分行',
            accountNumber: '1234567890',
          },
        },
        service: '業配',
        category: null,
        quantity: 1,
        price: 5000,
        cost: 5000,
        remittance_name: '王大明',
        remark: null,
        created_at: '2026-01-01',
      },
    },
    expense_claims: null,
    quotation_items: null,
    ...overrides,
  } as PaymentConfirmationItem
}

// ==================== groupItemsByProject ====================

describe('groupItemsByProject', () => {
  it('按專案分組', () => {
    const items = [
      makePendingItem({ quotation_id: 'q1' }),
      makePendingItem({ quotation_id: 'q1' }),
      makePendingItem({ quotation_id: 'q2', quotations: { project_name: '專案B', clients: { name: '客戶B' }, created_at: '2026-02-01' } }),
    ]
    const groups = groupItemsByProject(items)
    expect(groups).toHaveLength(2)
  })

  it('未知專案 ID 歸入 unknown', () => {
    const items = [makePendingItem({ quotation_id: null, quotations: null })]
    const groups = groupItemsByProject(items)
    expect(groups[0].projectId).toBe('unknown')
    expect(groups[0].projectName).toBe('未命名專案')
  })

  it('計算 totalCost 和 readyItems', () => {
    const items = [
      makePendingItem({ cost_amount_input: 1000 }),
      makePendingItem({ cost_amount_input: 2000 }),
    ]
    const groups = groupItemsByProject(items)
    expect(groups[0].totalCost).toBe(3000)
    expect(groups[0].readyItems).toBe(2) // 兩個都有附件和發票
  })

  it('無附件無發票 → readyItems 為 0', () => {
    const items = [
      makePendingItem({ attachments: [], invoice_number_input: null }),
    ]
    const groups = groupItemsByProject(items)
    expect(groups[0].readyItems).toBe(0)
    expect(groups[0].status).toBe('pending')
  })

  it('部分備妥 → status partial', () => {
    const items = [
      makePendingItem({}),
      makePendingItem({ attachments: [], invoice_number_input: null }),
    ]
    const groups = groupItemsByProject(items)
    expect(groups[0].status).toBe('partial')
  })

  it('有駁回 → status rejected 且排序優先', () => {
    const items = [
      makePendingItem({ quotation_id: 'q1', rejection_reason: null }),
      makePendingItem({ quotation_id: 'q2', rejection_reason: '格式錯誤', quotations: { project_name: '專案Z', clients: null, created_at: null } }),
    ]
    const groups = groupItemsByProject(items)
    expect(groups[0].status).toBe('rejected')
    expect(groups[0].projectName).toBe('專案Z')
  })

  it('cost_amount_input 為 0 不應 fallback', () => {
    const items = [makePendingItem({ cost_amount_input: 0 })]
    const groups = groupItemsByProject(items)
    expect(groups[0].totalCost).toBe(0)
  })
})

// ==================== getCompletionPercentage ====================

describe('getCompletionPercentage', () => {
  it('0 items → 0%', () => {
    expect(getCompletionPercentage({ totalItems: 0, readyItems: 0 } as ProjectGroup<unknown>)).toBe(0)
  })

  it('全部備妥 → 100%', () => {
    expect(getCompletionPercentage({ totalItems: 3, readyItems: 3 } as ProjectGroup<unknown>)).toBe(100)
  })

  it('部分備妥 → 四捨五入', () => {
    expect(getCompletionPercentage({ totalItems: 3, readyItems: 1 } as ProjectGroup<unknown>)).toBe(33)
  })
})

// ==================== groupItemsByAccount ====================

describe('groupItemsByAccount', () => {
  it('按銀行帳戶分組', () => {
    const items = [
      makeConfirmationItem({ amount: 3000 }),
      makeConfirmationItem({ id: 'ci-2', amount: 2000 }),
    ]
    const groups = groupItemsByAccount(items)
    expect(groups).toHaveLength(1) // 同一帳戶
    expect(groups[0].totalAmount).toBe(5000)
    expect(groups[0].bankName).toBe('台新銀行')
  })

  it('跳過無 payment_requests 的項目', () => {
    const items = [
      makeConfirmationItem({ payment_requests: null }),
    ]
    const groups = groupItemsByAccount(items)
    expect(groups).toHaveLength(0)
  })

  it('按金額降序排序', () => {
    const item1 = makeConfirmationItem({ id: 'ci-1', amount: 1000 })
    const item2 = makeConfirmationItem({
      id: 'ci-2',
      amount: 9000,
      payment_requests: {
        quotation_item_id: 'qi-2',
        cost_amount: 9000,
        invoice_number: null,
        merge_group_id: null,
        merge_color: null,
        quotation_items: {
          ...makeConfirmationItem().payment_requests!.quotation_items,
          kols: {
            id: 'k-2',
            name: 'KOL李',
            real_name: '李小華',
            bank_info: {
              bankType: 'individual',
              personalAccountName: '李小華',
              bankName: '中國信託',
              branchName: '敦南分行',
              accountNumber: '9876543210',
            },
          },
        },
      },
    })
    const groups = groupItemsByAccount([item1, item2])
    expect(groups).toHaveLength(2)
    expect(groups[0].accountName).toBe('KOL李') // 金額較高排前
  })
})

// ==================== groupItemsByRemittance ====================

describe('groupItemsByRemittance', () => {
  it('按匯款戶名分組（舊流程 project）', () => {
    const items = [
      makeConfirmationItem({ source_type: 'project' }),
    ]
    const groups = groupItemsByRemittance(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].remittanceName).toBe('王大明')
    expect(groups[0].bankName).toBe('台新銀行')
    expect(groups[0].isCompanyAccount).toBe(false)
  })

  it('公司帳戶正確標記', () => {
    const item = makeConfirmationItem({
      source_type: 'project',
      payment_requests: {
        ...makeConfirmationItem().payment_requests!,
        quotation_items: {
          ...makeConfirmationItem().payment_requests!.quotation_items,
          remittance_name: '好公司',
          kols: {
            id: 'k-1',
            name: 'KOL王',
            real_name: '王大明',
            bank_info: {
              bankType: 'company',
              companyAccountName: '好公司',
              bankName: '中國信託',
              branchName: '敦南分行',
              accountNumber: '111222333',
            },
          },
        },
      },
    })
    const groups = groupItemsByRemittance([item])
    expect(groups[0].isCompanyAccount).toBe(true)
  })

  it('個人報帳項目獨立分組', () => {
    const item = makeConfirmationItem({
      source_type: 'personal',
      expense_claim_id: 'ec-1',
      payment_requests: null,
      expense_claims: {
        id: 'ec-1',
        expense_type: '交通費',
        vendor_name: null,
        project_name: null,
        amount: 500,
        tax_amount: 0,
        total_amount: 500,
        invoice_number: null,
        claim_month: null,
        note: null,
        submitted_by: 'user-1',
        submitter: { full_name: '張三' },
      },
    })
    const groups = groupItemsByRemittance([item])
    expect(groups).toHaveLength(1)
    expect(groups[0].remittanceName).toBe('張三')
  })

  it('報價單直接請款 (source_type=quotation)', () => {
    const item = makeConfirmationItem({
      source_type: 'quotation',
      quotation_item_id: 'qi-1',
      payment_requests: null,
      amount_at_confirmation: 8000,
      quotation_items: {
        id: 'qi-1',
        quotation_id: 'q-1',
        quotations: {
          project_name: '專案X',
          quote_number: 'Q-100',
          client_id: 'c-1',
          clients: { name: '客戶X' },
          created_at: '2026-01-01',
        },
        kol_id: 'k-1',
        kols: {
          id: 'k-1',
          name: 'KOL陳',
          real_name: '陳大華',
          bank_info: {
            bankType: 'individual',
            personalAccountName: '陳大華',
            bankName: '玉山銀行',
            branchName: '南京分行',
            accountNumber: '5555555555',
          },
        },
        service: '開箱',
        category: null,
        quantity: 1,
        price: 8000,
        cost: 8000,
        remittance_name: '陳大華',
        remark: null,
        created_at: '2026-01-01',
        cost_amount: 8000,
        invoice_number: null,
        merge_group_id: null,
        merge_color: null,
      },
    })
    const groups = groupItemsByRemittance([item])
    expect(groups).toHaveLength(1)
    expect(groups[0].remittanceName).toBe('陳大華')
    expect(groups[0].totalAmount).toBe(8000)
  })

  it('多項同帳戶合併金額', () => {
    const items = [
      makeConfirmationItem({ id: 'ci-1', amount: 3000 }),
      makeConfirmationItem({ id: 'ci-2', amount: 7000 }),
    ]
    const groups = groupItemsByRemittance(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].totalAmount).toBe(10000)
    expect(groups[0].items).toHaveLength(2)
  })
})

// ==================== 合併分組工具 ====================

describe('getMergeLeader', () => {
  const items = [
    { merge_group_id: 'g1', is_merge_leader: true, id: 'a' },
    { merge_group_id: 'g1', is_merge_leader: false, id: 'b' },
    { merge_group_id: null, is_merge_leader: false, id: 'c' },
  ]

  it('找到主項目', () => {
    expect(getMergeLeader(items, 'g1')?.id).toBe('a')
  })

  it('不存在的群組 → null', () => {
    expect(getMergeLeader(items, 'nonexistent')).toBeNull()
  })
})

describe('getMergeGroupItems', () => {
  it('取得同群組項目', () => {
    const items = [
      { merge_group_id: 'g1' },
      { merge_group_id: 'g1' },
      { merge_group_id: 'g2' },
    ]
    expect(getMergeGroupItems(items, 'g1')).toHaveLength(2)
  })
})

describe('calculateMergeGroupTotal', () => {
  it('加總 cost_amount_input', () => {
    const items = [
      { cost_amount_input: 1000 },
      { cost_amount_input: 2000 },
    ]
    expect(calculateMergeGroupTotal(items)).toBe(3000)
  })

  it('缺少 cost_amount_input → 視為 0', () => {
    const items = [
      { cost_amount_input: undefined },
      { cost_amount_input: 500 },
    ]
    expect(calculateMergeGroupTotal(items)).toBe(500)
  })
})

describe('isInMergeGroup', () => {
  it('有 merge_group_id → true', () => {
    expect(isInMergeGroup({ merge_group_id: 'g1' })).toBe(true)
  })

  it('null → false', () => {
    expect(isInMergeGroup({ merge_group_id: null })).toBe(false)
  })
})

describe('generateMergeGroupId', () => {
  it('產生 merge- 開頭的 ID', () => {
    expect(generateMergeGroupId()).toMatch(/^merge-/)
  })

  it('每次產生不同 ID', () => {
    expect(generateMergeGroupId()).not.toBe(generateMergeGroupId())
  })
})

// ==================== 狀態分組 ====================

describe('groupItemsByStatus', () => {
  it('按 verification_status 分組', () => {
    const items = [
      { verification_status: 'approved' },
      { verification_status: 'approved' },
      { verification_status: 'rejected' },
    ]
    const groups = groupItemsByStatus(items)
    expect(groups.get('approved')).toHaveLength(2)
    expect(groups.get('rejected')).toHaveLength(1)
  })

  it('無 status 但有 rejection_reason → rejected', () => {
    const items = [{ rejection_reason: '格式錯誤' }]
    const groups = groupItemsByStatus(items)
    expect(groups.get('rejected')).toHaveLength(1)
  })

  it('無 status 無 rejection → pending', () => {
    const items = [{ rejection_reason: null }]
    const groups = groupItemsByStatus(items)
    expect(groups.get('pending')).toHaveLength(1)
  })
})

// ==================== 日期分組 ====================

describe('groupItemsByDate', () => {
  it('按日期欄位分組', () => {
    const items = [
      { created_at: '2026-01-15T10:00:00Z' },
      { created_at: '2026-01-15T15:00:00Z' },
      { created_at: '2026-02-01T10:00:00Z' },
    ]
    const groups = groupItemsByDate(items, 'created_at')
    expect(groups.size).toBe(2)
  })

  it('降序排列', () => {
    const items = [
      { d: '2026-01-01' },
      { d: '2026-03-01' },
    ]
    const groups = groupItemsByDate(items, 'd')
    const keys = Array.from(groups.keys())
    expect(keys[0] > keys[1]).toBe(true)
  })

  it('跳過缺少日期的項目', () => {
    const items = [
      { d: '2026-01-01' },
      { d: null },
    ]
    const groups = groupItemsByDate(items, 'd')
    expect(groups.size).toBe(1)
  })
})

// ==================== KOL 分組 ====================

describe('groupItemsByKOL', () => {
  it('按 KOL 分組', () => {
    const items = [
      { kol_id: 'k1', kols: { id: 'k1', name: 'Alice' } },
      { kol_id: 'k1', kols: { id: 'k1', name: 'Alice' } },
      { kol_id: 'k2', kols: { id: 'k2', name: 'Bob' } },
    ]
    const groups = groupItemsByKOL(items)
    expect(groups.size).toBe(2)
    expect(groups.get('k1')!.items).toHaveLength(2)
  })

  it('無 KOL → 歸入 custom', () => {
    const items = [{ kol_id: null, kols: null }]
    const groups = groupItemsByKOL(items)
    expect(groups.get('custom')!.kol.name).toBe('自訂項目')
  })
})

// ==================== 客戶分組 ====================

describe('groupItemsByClient', () => {
  it('按客戶分組', () => {
    const items = [
      { quotations: { client_id: 'c1', clients: { name: '客戶A' } } },
      { quotations: { client_id: 'c1', clients: { name: '客戶A' } } },
      { quotations: { client_id: 'c2', clients: { name: '客戶B' } } },
    ]
    const groups = groupItemsByClient(items)
    expect(groups.size).toBe(2)
  })

  it('無客戶 → unknown', () => {
    const items = [{ quotations: null }]
    const groups = groupItemsByClient(items)
    expect(groups.get('unknown')!.client.name).toBe('未知客戶')
  })
})

// ==================== 展開/收合工具 ====================

describe('expandAllGroups / collapseAllGroups / toggleGroupExpansion', () => {
  const groups: ProjectGroup<unknown>[] = [
    { projectId: 'p1', isExpanded: false } as ProjectGroup<unknown>,
    { projectId: 'p2', isExpanded: true } as ProjectGroup<unknown>,
  ]

  it('expandAllGroups → 全部展開', () => {
    const result = expandAllGroups(groups)
    expect(result.every(g => g.isExpanded)).toBe(true)
  })

  it('collapseAllGroups → 全部收合', () => {
    const result = collapseAllGroups(groups)
    expect(result.every(g => !g.isExpanded)).toBe(true)
  })

  it('toggleGroupExpansion → 切換指定分組', () => {
    const result = toggleGroupExpansion(groups, 'p1')
    expect(result[0].isExpanded).toBe(true)  // 原本 false → true
    expect(result[1].isExpanded).toBe(true)  // 不變
  })
})
