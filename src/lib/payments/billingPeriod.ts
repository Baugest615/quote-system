/**
 * 帳務期間 10 日切點規則
 *
 * - 當月 10 日（含）前核准 → 歸入當月帳務期間
 * - 當月 10 日後核准 → 歸入次月帳務期間
 */
export function getBillingPeriod(approvedDate: Date | string): {
  year: number
  month: number
  label: string
} {
  const d = new Date(approvedDate)
  let year = d.getFullYear()
  let month = d.getMonth() + 1 // 1-12

  if (d.getDate() > 10) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return { year, month, label: `${year}年${month}月` }
}

/** 回傳 YYYY-MM 格式的帳務期間 key（用於下拉選單和群組比對） */
export function getBillingMonthKey(approvedDate: Date | string): string {
  const { year, month } = getBillingPeriod(approvedDate)
  return `${year}-${String(month).padStart(2, '0')}`
}
