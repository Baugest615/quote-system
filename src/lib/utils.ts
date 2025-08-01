import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

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
