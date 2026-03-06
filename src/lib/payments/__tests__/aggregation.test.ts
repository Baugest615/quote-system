import {
  getAvailableMonths,
  aggregateMonthlyRemittanceGroups,
  splitRemittanceGroups,
  checkWithholdingApplicability,
} from '../aggregation'
import type { PaymentConfirmation, PaymentConfirmationItem, MergedRemittanceGroup } from '../types'
import type { WithholdingSettings, AccountingExpense, AccountingPayroll } from '@/types/custom.types'

// ==================== Mock 工廠 ====================

function makeConfirmation(overrides: Partial<PaymentConfirmation> = {}): PaymentConfirmation {
  return {
    id: 'pc-1',
    confirmation_date: '2026-03-05', // 5日 → 歸入 3 月
    total_amount: 10000,
    total_items: 1,
    created_by: 'user-1',
    created_at: '2026-03-05',
    payment_confirmation_items: [],
    remittance_settings: null,
    ...overrides,
  }
}

function makeConfirmationItem(overrides: Partial<PaymentConfirmationItem> = {}): PaymentConfirmationItem {
  return {
    id: 'ci-1',
    payment_confirmation_id: 'pc-1',
    payment_request_id: 'pr-1',
    expense_claim_id: null,
    quotation_item_id: null,
    source_type: 'project',
    amount_at_confirmation: 5000,
    created_at: '2026-03-05',
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
    payment_date: null,
    expense_claims: null,
    quotation_items: null,
    ...overrides,
  } as PaymentConfirmationItem
}

const defaultRates: WithholdingSettings = {
  id: 'ws-1',
  income_tax_rate: 0.10,
  nhi_supplement_rate: 0.0211,
  income_tax_threshold: 20010,
  nhi_threshold: 20000,
  remittance_fee_default: 30,
  effective_date: '2026-01-01',
  expiry_date: null,
  updated_at: '2026-01-01',
  updated_by: 'admin',
}

// ==================== getAvailableMonths ====================

describe('getAvailableMonths', () => {
  it('從確認清單提取帳務月份', () => {
    const confirmations = [
      makeConfirmation({ confirmation_date: '2026-03-05' }), // → 2026-03
      makeConfirmation({ confirmation_date: '2026-03-15' }), // → 2026-04
    ]
    const months = getAvailableMonths(confirmations)
    expect(months).toContain('2026-03')
    expect(months).toContain('2026-04')
  })

  it('降序排列', () => {
    const confirmations = [
      makeConfirmation({ confirmation_date: '2026-01-05' }),
      makeConfirmation({ confirmation_date: '2026-06-05' }),
    ]
    const months = getAvailableMonths(confirmations)
    expect(months[0]).toBe('2026-06')
    expect(months[1]).toBe('2026-01')
  })

  it('去重', () => {
    const confirmations = [
      makeConfirmation({ confirmation_date: '2026-03-01' }),
      makeConfirmation({ confirmation_date: '2026-03-10' }),
    ]
    const months = getAvailableMonths(confirmations)
    expect(months).toHaveLength(1)
    expect(months[0]).toBe('2026-03')
  })

  it('合併進項管理月份', () => {
    const confirmations: PaymentConfirmation[] = []
    const expenses = [
      { expense_month: '2026年3月' } as AccountingExpense,
    ]
    const months = getAvailableMonths(confirmations, expenses)
    expect(months).toContain('2026-03')
  })

  it('合併薪資月份', () => {
    const confirmations: PaymentConfirmation[] = []
    const payroll = [{ payment_date: '2026-04-05' }]
    const months = getAvailableMonths(confirmations, undefined, payroll)
    expect(months).toContain('2026-04')
  })

  it('空資料 → 空陣列', () => {
    expect(getAvailableMonths([])).toEqual([])
  })
})

// ==================== aggregateMonthlyRemittanceGroups ====================

describe('aggregateMonthlyRemittanceGroups', () => {
  it('基本彙總：同月份同匯款戶名合併', () => {
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [
          makeConfirmationItem({ amount_at_confirmation: 30000 }),
        ],
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates)
    expect(groups).toHaveLength(1)
    expect(groups[0].remittanceName).toBe('王大明')
    expect(groups[0].totalAmount).toBe(30000)
  })

  it('非指定月份的確認清單不計入', () => {
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-04-05', // → 2026-04
        payment_confirmation_items: [makeConfirmationItem()],
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates)
    expect(groups).toHaveLength(0)
  })

  it('超過門檻 → 自動代扣所得稅和健保', () => {
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [
          makeConfirmationItem({ amount_at_confirmation: 25000 }),
        ],
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates)
    expect(groups[0].totalAmount).toBe(25000)
    // 25000 >= 20010 → 所得稅 floor(25000 * 0.10) = 2500
    expect(groups[0].totalTax).toBe(2500)
    // 25000 >= 20000 → 健保 floor(25000 * 0.0211) = 527
    expect(groups[0].totalInsurance).toBe(527)
    expect(groups[0].netTotal).toBe(25000 - 2500 - 527 - 0)
  })

  it('低於門檻 → 不代扣', () => {
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [
          makeConfirmationItem({ amount_at_confirmation: 10000 }),
        ],
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates)
    expect(groups[0].totalTax).toBe(0)
    expect(groups[0].totalInsurance).toBe(0)
  })

  it('DB 已儲存設定覆蓋自動判斷', () => {
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [
          makeConfirmationItem({ amount_at_confirmation: 25000 }),
        ],
        remittance_settings: {
          '王大明': {
            hasRemittanceFee: true,
            remittanceFeeAmount: 30,
            hasTax: false, // 手動關閉
            hasInsurance: false, // 手動關閉
          },
        },
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates)
    expect(groups[0].totalTax).toBe(0)
    expect(groups[0].totalInsurance).toBe(0)
    expect(groups[0].totalFee).toBe(30)
  })

  it('合併進項管理手動新增的支出', () => {
    const confirmations: PaymentConfirmation[] = []
    const expenses: AccountingExpense[] = [
      {
        id: 'e-1',
        year: 2026,
        expense_month: '2026年3月',
        expense_type: '進項' as any,
        accounting_subject: null,
        amount: 5000,
        tax_amount: 0,
        total_amount: 5000,
        remittance_fee: 30,
        withholding_tax: 0,
        withholding_nhi: 0,
        vendor_name: '文具行',
        payment_date: null,
        invoice_date: null,
        invoice_number: null,
        project_name: null,
        note: null,
        payment_request_id: null,
        expense_claim_id: null,
        payment_confirmation_id: null, // 手動新增（非自動產生）
        quotation_item_id: null,
        payment_target_type: 'vendor',
        payment_status: 'pending' as any,
        paid_at: null,
        submitted_by: null,
        created_by: null,
        created_at: '2026-03-01',
        updated_at: '2026-03-01',
      },
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates, expenses)
    expect(groups).toHaveLength(1)
    expect(groups[0].remittanceName).toBe('文具行')
    expect(groups[0].totalAmount).toBe(5000)
    expect(groups[0].isCompanyAccount).toBe(true)
  })

  it('過濾自動產生的進項（有 payment_confirmation_id）', () => {
    const confirmations: PaymentConfirmation[] = []
    const expenses: AccountingExpense[] = [
      {
        id: 'e-auto',
        year: 2026,
        expense_month: '2026年3月',
        payment_confirmation_id: 'pc-1', // 自動產生 → 應被過濾
        quotation_item_id: null,
        expense_claim_id: null,
        vendor_name: '不應出現',
        amount: 999,
        total_amount: 999,
      } as AccountingExpense,
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates, expenses)
    expect(groups).toHaveLength(0)
  })

  it('rates 為 null → 使用預設值', () => {
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [
          makeConfirmationItem({ amount_at_confirmation: 25000 }),
        ],
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', null)
    // 預設 income_tax_rate = 0.10, nhi_supplement_rate = 0.0211
    expect(groups[0].totalTax).toBe(2500)
    expect(groups[0].totalInsurance).toBe(527)
  })

  it('按金額降序排序', () => {
    const ci1 = makeConfirmationItem({ id: 'ci-1', amount_at_confirmation: 3000 })
    const ci2 = makeConfirmationItem({
      id: 'ci-2',
      amount_at_confirmation: 8000,
      payment_requests: {
        ...makeConfirmationItem().payment_requests!,
        quotation_items: {
          ...makeConfirmationItem().payment_requests!.quotation_items,
          remittance_name: '李小華',
          kols: {
            id: 'k-2', name: 'KOL李', real_name: '李小華',
            bank_info: {
              bankType: 'individual',
              personalAccountName: '李小華',
              bankName: '中信', branchName: '', accountNumber: '999',
            },
          },
        },
      },
    })
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [ci1, ci2],
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates)
    expect(groups[0].totalAmount).toBeGreaterThanOrEqual(groups[1]?.totalAmount ?? 0)
  })

  it('公司行號：totalAmount 自動加 5% 營業稅', () => {
    const companyItem = makeConfirmationItem({
      id: 'ci-company',
      amount_at_confirmation: 10000,
      payment_requests: {
        ...makeConfirmationItem().payment_requests!,
        cost_amount: 10000,
        quotation_items: {
          ...makeConfirmationItem().payment_requests!.quotation_items,
          kol_id: 'k-corp',
          kols: {
            id: 'k-corp', name: '好棒公司', real_name: null,
            bank_info: {
              bankType: 'company',
              companyAccountName: '好棒有限公司',
              bankName: '台新銀行', branchName: '中山分行', accountNumber: '9999999999',
            },
          },
          remittance_name: '好棒有限公司',
        },
      },
    })
    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [companyItem],
      }),
    ]
    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates)
    const companyGroup = groups.find(g => g.remittanceName === '好棒有限公司')
    expect(companyGroup).toBeDefined()
    // 10000 * 1.05 = 10500
    expect(companyGroup!.totalAmount).toBe(10500)
    expect(companyGroup!.isCompanyAccount).toBe(true)
    // 公司戶免扣代繳
    expect(companyGroup!.totalTax).toBe(0)
    expect(companyGroup!.totalInsurance).toBe(0)
  })

  it('員工合併：同名的 KOL + 個人報帳 + 薪資歸為一組', () => {
    // KOL 項目（黃榆茜 as KOL）
    const kolItem = makeConfirmationItem({
      id: 'ci-kol',
      amount_at_confirmation: 15000,
      source_type: 'project',
      payment_requests: {
        ...makeConfirmationItem().payment_requests!,
        cost_amount: 15000,
        quotation_items: {
          ...makeConfirmationItem().payment_requests!.quotation_items,
          kol_id: 'k-emp',
          kols: {
            id: 'k-emp', name: '黃榆茜', real_name: '黃榆茜',
            bank_info: {
              bankType: 'individual',
              personalAccountName: '黃榆茜',
              bankName: '台新銀行', branchName: '中山分行', accountNumber: '5555555555',
            },
          },
          remittance_name: '黃榆茜',
        },
      },
    })

    // 個人報帳（黃榆茜 expense claim）
    const claimItem = makeConfirmationItem({
      id: 'ci-claim',
      amount_at_confirmation: 3000,
      source_type: 'personal',
      expense_claim_id: 'ec-1',
      payment_request_id: null,
      payment_requests: null,
      expense_claims: {
        id: 'ec-1',
        submitted_by: 'user-emp',
        submitter: { full_name: '黃榆茜' },
        vendor_name: null,
        claim_month: '2026年3月',
        total_amount: 3000,
      } as any,
    })

    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [kolItem, claimItem],
      }),
    ]

    // 加上薪資
    const payroll: AccountingPayroll[] = [{
      id: 'p-1',
      employee_name: '黃榆茜',
      payment_date: '2026-03-05',
      net_salary: 35000,
    } as any]

    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates, undefined, payroll)

    // 應該合併為一組
    const empGroups = groups.filter(g => g.remittanceName === '黃榆茜')
    expect(empGroups).toHaveLength(1)
    // 合併金額 = KOL 15000 + 個人報帳 3000 + 薪資 35000
    expect(empGroups[0].totalAmount).toBe(15000 + 3000 + 35000)
    // 員工免扣（isPersonalClaim → full exempt）
    expect(empGroups[0].totalTax).toBe(0)
    expect(empGroups[0].totalInsurance).toBe(0)
  })

  it('非員工的 KOL 不受合併影響', () => {
    const kolItem = makeConfirmationItem({
      id: 'ci-pure-kol',
      amount_at_confirmation: 25000,
    })

    const confirmations = [
      makeConfirmation({
        confirmation_date: '2026-03-05',
        payment_confirmation_items: [kolItem],
      }),
    ]

    const payroll: AccountingPayroll[] = [{
      id: 'p-other',
      employee_name: '其他員工',
      payment_date: '2026-03-05',
      net_salary: 30000,
    } as any]

    const groups = aggregateMonthlyRemittanceGroups(confirmations, '2026-03', defaultRates, undefined, payroll)
    // KOL 王大明和員工各一組
    expect(groups.length).toBe(2)
    const kol = groups.find(g => g.remittanceName === '王大明')
    expect(kol).toBeDefined()
    expect(kol!.totalTax).toBe(2500) // 照常扣稅
  })

  // ==================== Spec 007: 匯款日期逐筆管理（取代 Spec 006 日期分組） ====================

  it('同一匯款對象不同 payment_date → 仍合併為同一組（不再按日期拆分）', () => {
    const item1 = makeConfirmationItem({
      id: 'ci-1', amount_at_confirmation: 15000, payment_date: '2026-03-10',
    })
    const item2 = makeConfirmationItem({
      id: 'ci-2', amount_at_confirmation: 20000, payment_date: '2026-03-20',
    })
    const confirmation = makeConfirmation({
      confirmation_date: '2026-03-05',
      payment_confirmation_items: [item1, item2],
    })
    const groups = aggregateMonthlyRemittanceGroups([confirmation], '2026-03', defaultRates)
    // Spec 007: 不再按日期分組，同一匯款戶名合併為 1 組
    expect(groups).toHaveLength(1)
    expect(groups[0].groupKey).not.toContain('_d')
    expect(groups[0].totalAmount).toBe(35000)
  })

  it('無 payment_date 的項目維持原行為（按月合併）', () => {
    const item1 = makeConfirmationItem({ id: 'ci-1', amount_at_confirmation: 10000 })
    const item2 = makeConfirmationItem({ id: 'ci-2', amount_at_confirmation: 12000 })
    const confirmation = makeConfirmation({
      confirmation_date: '2026-03-05',
      payment_confirmation_items: [item1, item2],
    })
    const groups = aggregateMonthlyRemittanceGroups([confirmation], '2026-03', defaultRates)
    expect(groups).toHaveLength(1)
    expect(groups[0].totalAmount).toBe(22000)
  })
})

// ==================== splitRemittanceGroups ====================

describe('splitRemittanceGroups', () => {
  function makeGroup(overrides: Partial<MergedRemittanceGroup> = {}): MergedRemittanceGroup {
    return {
      groupKey: 'name_個人',
      remittanceName: '個人',
      bankName: '',
      branchName: '',
      accountNumber: '',
      isCompanyAccount: false,
      isWithholdingExempt: false,
      isPersonalClaim: false,
      items: [{} as PaymentConfirmationItem],
      expenseItems: [],
      payrollItems: [],
      confirmationBreakdowns: [],
      totalAmount: 10000,
      totalTax: 0,
      totalInsurance: 0,
      totalFee: 0,
      netTotal: 10000,
      ...overrides,
    }
  }

  it('公司戶 → companyGroups', () => {
    const { companyGroups } = splitRemittanceGroups([makeGroup({ isCompanyAccount: true })])
    expect(companyGroups).toHaveLength(1)
  })

  it('個人戶（有 KOL 項目）→ individualGroups', () => {
    const { individualGroups } = splitRemittanceGroups([makeGroup()])
    expect(individualGroups).toHaveLength(1)
  })

  it('個人報帳 → employeeGroups', () => {
    const { employeeGroups } = splitRemittanceGroups([
      makeGroup({ isPersonalClaim: true }),
    ])
    expect(employeeGroups).toHaveLength(1)
  })

  it('純薪資群組 → employeeGroups', () => {
    const { employeeGroups } = splitRemittanceGroups([
      makeGroup({
        items: [],
        expenseItems: [],
        payrollItems: [{} as any],
      }),
    ])
    expect(employeeGroups).toHaveLength(1)
  })

  it('混合分類正確', () => {
    const groups = [
      makeGroup({ remittanceName: 'A', isCompanyAccount: true }),
      makeGroup({ remittanceName: 'B' }),
      makeGroup({ remittanceName: 'C', isPersonalClaim: true }),
    ]
    const result = splitRemittanceGroups(groups)
    expect(result.companyGroups).toHaveLength(1)
    expect(result.individualGroups).toHaveLength(1)
    expect(result.employeeGroups).toHaveLength(1)
  })
})

// ==================== checkWithholdingApplicability ====================

describe('checkWithholdingApplicability', () => {
  it('個人報帳 → 不顯示', () => {
    const result = checkWithholdingApplicability(
      { isCompanyAccount: false, isWithholdingExempt: false, totalAmount: 50000, isPersonalClaim: true },
      defaultRates
    )
    expect(result.showWithholding).toBe(false)
    expect(result.reason).toBe('personal_claim')
  })

  it('公司戶 → 不顯示', () => {
    const result = checkWithholdingApplicability(
      { isCompanyAccount: true, isWithholdingExempt: false, totalAmount: 50000 },
      defaultRates
    )
    expect(result.showWithholding).toBe(false)
    expect(result.reason).toBe('company_account')
  })

  it('工會免扣 → 仍顯示（所得稅照扣，只免健保）', () => {
    const result = checkWithholdingApplicability(
      { isCompanyAccount: false, isWithholdingExempt: true, totalAmount: 50000 },
      defaultRates
    )
    expect(result.showWithholding).toBe(true)
    expect(result.reason).toBe('applicable')
  })

  it('低於門檻 → 不顯示', () => {
    const result = checkWithholdingApplicability(
      { isCompanyAccount: false, isWithholdingExempt: false, totalAmount: 10000 },
      defaultRates
    )
    expect(result.showWithholding).toBe(false)
    expect(result.reason).toBe('below_threshold')
  })

  it('超過門檻的個人戶 → 顯示', () => {
    const result = checkWithholdingApplicability(
      { isCompanyAccount: false, isWithholdingExempt: false, totalAmount: 25000 },
      defaultRates
    )
    expect(result.showWithholding).toBe(true)
    expect(result.reason).toBe('applicable')
  })

  it('rates 為 null → 使用預設門檻', () => {
    const result = checkWithholdingApplicability(
      { isCompanyAccount: false, isWithholdingExempt: false, totalAmount: 25000 },
      null
    )
    expect(result.showWithholding).toBe(true)
  })
})
