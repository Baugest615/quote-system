// 請款系統格式化工具函數

import { DATE_FORMATS } from './constants'

// ==================== 數字格式化 ====================

/**
 * 格式化金額（加上千分位）
 * @param amount 金額
 * @param decimals 小數位數
 * @returns 格式化後的字串
 */
export function formatCurrency(amount: number | null | undefined, decimals: number = 0): string {
    if (amount === null || amount === undefined) return 'NT$ 0'
    return `NT$ ${amount.toLocaleString('zh-TW', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    })}`
}

/**
 * 格式化數字（加上千分位）
 * @param value 數值
 * @returns 格式化後的字串
 */
export function formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined) return '0'
    return value.toLocaleString('zh-TW')
}

/**
 * 格式化百分比
 * @param value 數值（0-1）
 * @param decimals 小數位數
 * @returns 格式化後的字串
 */
export function formatPercentage(value: number, decimals: number = 0): string {
    return `${(value * 100).toFixed(decimals)}%`
}

// ==================== 日期格式化 ====================

/**
 * 格式化日期
 * @param date 日期字串或 Date 物件
 * @param format 格式（可選）
 * @returns 格式化後的字串
 */
export function formatDate(
    date: string | Date | null | undefined,
    format: string = DATE_FORMATS.display
): string {
    if (!date) return '-'

    const d = typeof date === 'string' ? new Date(date) : date

    if (isNaN(d.getTime())) return '-'

    // 簡單的日期格式化（可以用 date-fns 或 dayjs 替代）
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')

    return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds)
}

/**
 * 格式化相對時間（例如：2小時前）
 * @param date 日期
 * @returns 相對時間字串
 */
export function formatRelativeTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diff = now.getTime() - d.getTime()

    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 7) return formatDate(date, DATE_FORMATS.displayShort)
    if (days > 0) return `${days} 天前`
    if (hours > 0) return `${hours} 小時前`
    if (minutes > 0) return `${minutes} 分鐘前`
    return '剛剛'
}

// ==================== 檔案格式化 ====================

/**
 * 格式化檔案大小
 * @param bytes 位元組數
 * @returns 格式化後的字串
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * 取得檔案副檔名
 * @param filename 檔案名稱
 * @returns 副檔名（含點）
 */
export function getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.')
    return lastDot === -1 ? '' : filename.substring(lastDot)
}

/**
 * 取得檔案名稱（不含副檔名）
 * @param filename 檔案名稱
 * @returns 檔案名稱
 */
export function getFileNameWithoutExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.')
    return lastDot === -1 ? filename : filename.substring(0, lastDot)
}

// ==================== 文字格式化 ====================

/**
 * 截斷文字
 * @param text 文字
 * @param maxLength 最大長度
 * @param suffix 後綴（預設為 ...）
 * @returns 截斷後的文字
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength - suffix.length) + suffix
}

/**
 * 首字母大寫
 * @param text 文字
 * @returns 首字母大寫的文字
 */
export function capitalize(text: string): string {
    if (!text) return ''
    return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * 駝峰轉蛇形
 * @param text 駝峰文字
 * @returns 蛇形文字
 */
export function camelToSnake(text: string): string {
    return text.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

/**
 * 蛇形轉駝峰
 * @param text 蛇形文字
 * @returns 駝峰文字
 */
export function snakeToCamel(text: string): string {
    return text.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

// ==================== 狀態格式化 ====================

/**
 * 格式化驗證狀態
 * @param status 狀態
 * @returns 中文標籤
 */
export function formatVerificationStatus(status: 'pending' | 'approved' | 'rejected'): string {
    const labels = {
        pending: '待審核',
        approved: '已核准',
        rejected: '已駁回'
    }
    return labels[status] || status
}

/**
 * 格式化合併類型
 * @param type 合併類型
 * @returns 中文標籤
 */
export function formatMergeType(type: 'account' | null): string {
    if (!type) return '-'
    return type === 'account' ? '帳戶合併' : type
}

// ==================== 銀行資訊格式化 ====================

/**
 * 格式化銀行帳號（隱藏部分數字）
 * @param accountNumber 帳號
 * @param visibleDigits 顯示的位數
 * @returns 格式化後的帳號
 */
export function formatBankAccount(accountNumber: string, visibleDigits: number = 4): string {
    if (!accountNumber) return '-'
    if (accountNumber.length <= visibleDigits) return accountNumber

    const visible = accountNumber.slice(-visibleDigits)
    const hidden = '*'.repeat(accountNumber.length - visibleDigits)
    return hidden + visible
}

/**
 * 格式化銀行資訊
 * @param bankInfo 銀行資訊物件
 * @returns 格式化後的字串
 */
export function formatBankInfo(bankInfo: any): string {
    if (!bankInfo) return '-'

    const parts = []
    if (bankInfo.bank_name) parts.push(bankInfo.bank_name)
    if (bankInfo.branch_name) parts.push(bankInfo.branch_name)
    if (bankInfo.account_number) parts.push(formatBankAccount(bankInfo.account_number))

    return parts.join(' - ')
}

// ==================== 列表格式化 ====================

/**
 * 格式化項目列表為字串
 * @param items 項目陣列
 * @param separator 分隔符
 * @param maxItems 最多顯示幾個
 * @returns 格式化後的字串
 */
export function formatList(items: string[], separator: string = ', ', maxItems?: number): string {
    if (!items || items.length === 0) return '-'

    const displayItems = maxItems ? items.slice(0, maxItems) : items
    const result = displayItems.join(separator)

    if (maxItems && items.length > maxItems) {
        return `${result} 等 ${items.length} 項`
    }

    return result
}

// ==================== 匯出檔名格式化 ====================

/**
 * 生成匯出檔名
 * @param prefix 前綴
 * @param extension 副檔名
 * @returns 檔名
 */
export function generateExportFilename(prefix: string, extension: string): string {
    const timestamp = formatDate(new Date(), DATE_FORMATS.export)
    return `${prefix}_${timestamp}${extension}`
}

// ==================== 顏色格式化 ====================

/**
 * 根據金額取得顏色類別
 * @param amount 金額
 * @param threshold 門檻
 * @returns Tailwind 顏色類別
 */
export function getAmountColorClass(amount: number, threshold: number = 10000): string {
    if (amount >= threshold * 10) return 'text-red-600 font-bold'
    if (amount >= threshold) return 'text-orange-600 font-semibold'
    return 'text-gray-900'
}

/**
 * 根據完成度取得顏色類別
 * @param percentage 百分比（0-100）
 * @returns Tailwind 顏色類別
 */
export function getCompletionColorClass(percentage: number): string {
    if (percentage === 100) return 'text-green-600'
    if (percentage >= 50) return 'text-yellow-600'
    return 'text-red-600'
}
