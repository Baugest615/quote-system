import {
  generateNhiDetailCsv,
  generateTaxWithholdingCsv,
  generateFullWithholdingCsv,
  type WithholdingPersonSummary,
} from '../withholding-export'

// ==================== Mock 資料 ====================

function makeSummary(overrides: Partial<WithholdingPersonSummary> = {}): WithholdingPersonSummary {
  return {
    remittanceName: '王大明',
    kolName: 'KOL王',
    realName: '王大明',
    isCompanyAccount: false,
    isExempt: false,
    totalPayment: 30000,
    incomeTaxWithheld: 3000,
    nhiSupplement: 633,
    confirmationDates: ['2026-03-05'],
    ...overrides,
  }
}

// ==================== generateNhiDetailCsv ====================

describe('generateNhiDetailCsv', () => {
  it('產生正確的 CSV 標頭', () => {
    const csv = generateNhiDetailCsv([], '2026-03')
    const lines = csv.split('\n')
    expect(lines[0]).toContain('投保單位代號')
    expect(lines[0]).toContain('給付年月')
    expect(lines[0]).toContain('扣費金額')
  })

  it('有健保扣繳 → 產生資料列', () => {
    const csv = generateNhiDetailCsv([makeSummary()], '2026-03')
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2) // header + 1 row
    expect(lines[1]).toContain('11503') // 2026-1911=115, 03月
    expect(lines[1]).toContain('王大明')
    expect(lines[1]).toContain('30000')
    expect(lines[1]).toContain('633')
  })

  it('無健保扣繳 → 不產生資料列', () => {
    const csv = generateNhiDetailCsv([makeSummary({ nhiSupplement: 0 })], '2026-03')
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1) // header only
  })

  it('民國年轉換正確', () => {
    const csv = generateNhiDetailCsv([makeSummary()], '2026-01')
    expect(csv).toContain('11501') // 2026-1911=115, 01月
  })

  it('多筆資料正確', () => {
    const summaries = [
      makeSummary({ remittanceName: 'A', nhiSupplement: 100 }),
      makeSummary({ remittanceName: 'B', nhiSupplement: 200 }),
    ]
    const csv = generateNhiDetailCsv(summaries, '2026-03')
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3) // header + 2 rows
  })
})

// ==================== generateTaxWithholdingCsv ====================

describe('generateTaxWithholdingCsv', () => {
  it('產生正確的 CSV 標頭', () => {
    const csv = generateTaxWithholdingCsv([], '2026-03')
    const lines = csv.split('\n')
    expect(lines[0]).toContain('所得格式代號')
    expect(lines[0]).toContain('扣繳稅額')
  })

  it('有所得稅扣繳 → 產生資料列', () => {
    const csv = generateTaxWithholdingCsv([makeSummary()], '2026-03')
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('9A') // 執行業務報酬
    expect(lines[1]).toContain('11503')
    expect(lines[1]).toContain('王大明')
    expect(lines[1]).toContain('30000')
    expect(lines[1]).toContain('3000')
  })

  it('無所得稅 → 不產生資料列', () => {
    const csv = generateTaxWithholdingCsv([makeSummary({ incomeTaxWithheld: 0 })], '2026-03')
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
  })
})

// ==================== generateFullWithholdingCsv ====================

describe('generateFullWithholdingCsv', () => {
  it('產生完整明細（含所有匯款戶名）', () => {
    const csv = generateFullWithholdingCsv([makeSummary()], '2026-03')
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('2026-03')
    expect(lines[1]).toContain('個人戶')
    expect(lines[1]).toContain('已扣')
  })

  it('公司戶標記正確', () => {
    const csv = generateFullWithholdingCsv(
      [makeSummary({ isCompanyAccount: true })],
      '2026-03'
    )
    expect(csv).toContain('公司戶')
  })

  it('免扣狀態正確', () => {
    const csv = generateFullWithholdingCsv(
      [makeSummary({ isExempt: true, incomeTaxWithheld: 0, nhiSupplement: 0 })],
      '2026-03'
    )
    expect(csv).toContain('免扣')
  })

  it('未達門檻狀態', () => {
    const csv = generateFullWithholdingCsv(
      [makeSummary({ isExempt: false, incomeTaxWithheld: 0, nhiSupplement: 0 })],
      '2026-03'
    )
    expect(csv).toContain('未達門檻')
  })

  it('多個確認日期以分號串接', () => {
    const csv = generateFullWithholdingCsv(
      [makeSummary({ confirmationDates: ['2026-03-05', '2026-03-10'] })],
      '2026-03'
    )
    expect(csv).toContain('2026-03-05; 2026-03-10')
  })
})
