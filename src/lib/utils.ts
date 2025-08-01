import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'TWD'): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function generateQuoteNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).substr(2, 4).toUpperCase()
  
  return `Q${year}${month}${day}-${random}`
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 驗證函數
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidTaiwanPhone(phone: string): boolean {
  // 台灣手機號碼格式：09XX-XXX-XXX 或 09XXXXXXXX
  const mobileRegex = /^09\d{8}$|^09\d{2}-\d{3}-\d{3}$/
  // 台灣市話格式：0X-XXXX-XXXX 或 0XXXXXXXXX
  const landlineRegex = /^0\d{1,2}-\d{3,4}-\d{4}$|^0\d{8,9}$/
  
  const cleanPhone = phone.replace(/[-\s]/g, '')
  return mobileRegex.test(cleanPhone) || landlineRegex.test(cleanPhone)
}

export function isValidTaiwanTaxId(taxId: string): boolean {
  // 台灣統一編號格式：8位數字
  const taxIdRegex = /^\d{8}$/
  return taxIdRegex.test(taxId)
}

export function formatTaiwanPhone(phone: string): string {
  const cleaned = phone.replace(/[-\s]/g, '')
  if (cleaned.length === 10 && cleaned.startsWith('09')) {
    // 手機號碼格式化為 09XX-XXX-XXX
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  } else if (cleaned.length >= 8 && cleaned.startsWith('0')) {
    // 市話號碼保持原格式或添加適當分隔符
    return cleaned
  }
  return phone
}

export function exportToCSV(data: any[], fileName: string) {
  // 檢查是否有資料
  if (!data || data.length === 0) {
    alert("沒有可匯出的資料");
    return;
  }

  // 將 null 或 undefined 的值轉換為空字串
  const replacer = (key: string, value: any) => value === null ? '' : value;
  
  // 取得表頭 (根據第一筆資料的 key)
  const header = Object.keys(data[0]);
  
  // 組成 CSV 字串
  const csv = [
    // 1. 表頭行
    header.join(','),
    // 2. 資料行
    ...data.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
  ].join('\r\n'); // 用換行符號分隔每一行

  // 建立 Blob 物件並觸發下載
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