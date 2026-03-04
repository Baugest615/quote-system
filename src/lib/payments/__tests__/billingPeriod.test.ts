import { getBillingPeriod, getBillingMonthKey } from '../billingPeriod'

// ==================== getBillingPeriod ====================

describe('getBillingPeriod — 10 日切點規則', () => {
  it('10 日（含）前核准 → 歸入當月', () => {
    expect(getBillingPeriod('2026-03-01')).toEqual({ year: 2026, month: 3, label: '2026年3月' })
    expect(getBillingPeriod('2026-03-10')).toEqual({ year: 2026, month: 3, label: '2026年3月' })
  })

  it('10 日後核准 → 歸入次月', () => {
    expect(getBillingPeriod('2026-03-11')).toEqual({ year: 2026, month: 4, label: '2026年4月' })
    expect(getBillingPeriod('2026-03-31')).toEqual({ year: 2026, month: 4, label: '2026年4月' })
  })

  it('12 月 10 日後 → 跨年歸入隔年 1 月', () => {
    expect(getBillingPeriod('2026-12-15')).toEqual({ year: 2027, month: 1, label: '2027年1月' })
    expect(getBillingPeriod('2026-12-31')).toEqual({ year: 2027, month: 1, label: '2027年1月' })
  })

  it('12 月 10 日（含）前 → 歸入當月', () => {
    expect(getBillingPeriod('2026-12-10')).toEqual({ year: 2026, month: 12, label: '2026年12月' })
  })

  it('接受 Date 物件', () => {
    expect(getBillingPeriod(new Date('2026-01-05'))).toEqual({ year: 2026, month: 1, label: '2026年1月' })
  })
})

// ==================== getBillingMonthKey ====================

describe('getBillingMonthKey — YYYY-MM 格式', () => {
  it('10 日前 → 當月 key', () => {
    expect(getBillingMonthKey('2026-03-10')).toBe('2026-03')
  })

  it('10 日後 → 次月 key', () => {
    expect(getBillingMonthKey('2026-03-11')).toBe('2026-04')
  })

  it('月份補零', () => {
    expect(getBillingMonthKey('2026-01-01')).toBe('2026-01')
    expect(getBillingMonthKey('2026-09-10')).toBe('2026-09')
  })

  it('跨年', () => {
    expect(getBillingMonthKey('2026-12-25')).toBe('2027-01')
  })
})
