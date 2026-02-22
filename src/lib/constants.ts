// 統一的時間相關常量（避免在 8+ 個檔案中重複定義）

export const CURRENT_YEAR = new Date().getFullYear()
export const CURRENT_MONTH = new Date().getMonth() + 1

// 月份選項：['1月', '2月', ..., '12月']
export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)

// 年份選項：最近 5 年
export const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)
