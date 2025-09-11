import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Contact } from '@/types/custom.types'  // 🆕 引入自定義類型

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化數字為貨幣字串 (新台幣)
 * @param amount 金額
 * @returns 格式化後的字串, e.g., "NT$ 1,234"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) {
    return 'NT$ 0';
  }
  return amount.toLocaleString('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * 格式化日期字串或 Date 物件
 * @param date 日期
 * @returns 格式化後的字串, e.g., "2025/08/02"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) {
    return 'N/A';
  }
  try {
    return new Date(date).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (error) {
    return 'Invalid Date';
  }
}

/**
 * 將陣列資料匯出成 CSV 檔案並觸發下載
 * @param data 要匯出的資料陣列
 * @param fileName 下載的檔案名稱 (不需包含 .csv)
 */
export function exportToCSV(data: any[], fileName: string) {
  if (!data || data.length === 0) {
    // 使用 alert 或 toast 通知使用者
    alert("No data to export");
    return;
  }

  const replacer = (key: string, value: any) => value === null ? '' : value;
  const header = Object.keys(data[0]);
  const csv = [
    header.join(','), // header row
    ...data.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
  ].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// ===== 🆕 新增的業務邏輯工具函式 =====

/**
 * 解析聯絡人資料
 * @param rawData 原始資料
 * @returns 解析後的聯絡人陣列
 */
export function parseContacts(rawData: any[]): Contact[] {
  if (!Array.isArray(rawData)) {
    return []
  }
  
  return rawData.map(item => ({
    id: item.id || crypto.randomUUID(),
    name: item.name || '',
    email: item.email || undefined,
    phone: item.phone || undefined,
    company: item.company || undefined,
    role: item.role || undefined,
  })).filter(contact => contact.name.trim() !== '')
}

/**
 * 驗證電子郵件格式
 * @param email 電子郵件
 * @returns 是否有效
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

/**
 * 驗證台灣手機號碼格式
 * @param phone 手機號碼
 * @returns 是否有效
 */
export function isValidTaiwanPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false
  // 台灣手機號碼格式：09xxxxxxxx
  const phoneRegex = /^09\d{8}$/
  return phoneRegex.test(phone.replace(/\s+/g, ''))
}

/**
 * 格式化台灣手機號碼
 * @param phone 原始手機號碼
 * @returns 格式化後的手機號碼 (09xx-xxx-xxx)
 */
export function formatTaiwanPhone(phone: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10 && cleaned.startsWith('09')) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

/**
 * 生成唯一ID
 * @returns UUID字串
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 驗證統一編號格式
 * @param taxId 統一編號
 * @returns 是否有效
 */
export function isValidTaxId(taxId: string): boolean {
  if (!taxId || typeof taxId !== 'string') return false
  const cleaned = taxId.replace(/\s+/g, '')
  return /^\d{8}$/.test(cleaned)
}

/**
 * 格式化統一編號
 * @param taxId 原始統一編號
 * @returns 格式化後的統一編號
 */
export function formatTaxId(taxId: string): string {
  if (!taxId) return ''
  const cleaned = taxId.replace(/\D/g, '')
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
  }
  return taxId
}

/**
 * 計算文字長度（中文字符計為2個字符）
 * @param text 文字內容
 * @returns 字符長度
 */
export function getTextLength(text: string): number {
  if (!text) return 0
  // 中文字符正則
  const chineseRegex = /[\u4e00-\u9fff]/g
  const chineseMatches = text.match(chineseRegex) || []
  const otherChars = text.replace(chineseRegex, '').length
  return chineseMatches.length * 2 + otherChars
}

/**
 * 截斷文字到指定長度
 * @param text 原始文字
 * @param maxLength 最大長度
 * @param suffix 後綴 (預設為 '...')
 * @returns 截斷後的文字
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (!text || getTextLength(text) <= maxLength) return text
  
  let result = ''
  let currentLength = 0
  
  for (const char of text) {
    const charLength = /[\u4e00-\u9fff]/.test(char) ? 2 : 1
    if (currentLength + charLength > maxLength - suffix.length) break
    result += char
    currentLength += charLength
  }
  
  return result + suffix
}

/**
 * 深度複製物件
 * @param obj 要複製的物件
 * @returns 複製後的物件
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as T
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T
  if (typeof obj === 'object') {
    const cloned = {} as T
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned
  }
  return obj
}

/**
 * 防抖函數
 * @param func 要執行的函數
 * @param delay 延遲時間（毫秒）
 * @returns 防抖後的函數
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

/**
 * 節流函數
 * @param func 要執行的函數
 * @param limit 時間間隔（毫秒）
 * @returns 節流後的函數
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

/**
 * 將檔案大小轉換為人類可讀格式
 * @param bytes 檔案大小（bytes）
 * @param decimals 小數位數
 * @returns 格式化後的檔案大小
 */
export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * 將物件轉換為查詢字串
 * @param obj 物件
 * @returns 查詢字串
 */
export function objectToQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams()
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.append(key, String(value))
    }
  })
  
  return params.toString()
}

/**
 * 檢查字串是否為有效的 URL
 * @param string 要檢查的字串
 * @returns 是否為有效 URL
 */
export function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch (_) {
    return false
  }
}