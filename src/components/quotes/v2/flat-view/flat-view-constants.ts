import type { FlatQuotationItem } from '@/hooks/useQuotationItemsFlat'
import { PAYMENT_STATUS_CONFIG, getPaymentStatus } from '../shared/payment-status'

// ─── 欄位定義 ───────────────────────────────────────────────
// 對齊明細表欄位順序：..., 小計, 發票號碼, 附件, 狀態, 檢核, 請款, 審核
export type ColumnKey =
  | 'checkbox' | 'quote_number' | 'project_name' | 'client_name'
  | 'quotation_status' | 'category' | 'kol_name' | 'service'
  | 'quantity' | 'price' | 'cost' | 'subtotal'
  | 'invoice_number' | 'attachments'
  | 'payment_status' | 'verification' | 'payment_request' | 'approval'

export type FlatSortKey = Exclude<ColumnKey, 'checkbox' | 'attachments' | 'verification' | 'payment_request' | 'approval'>

export const COLUMN_DEFS: { key: ColumnKey; label: string; hideable: boolean }[] = [
  { key: 'checkbox', label: '選取', hideable: false },
  { key: 'quote_number', label: '報價編號', hideable: false },
  { key: 'project_name', label: '專案名稱', hideable: false },
  { key: 'client_name', label: '客戶', hideable: true },
  { key: 'quotation_status', label: '報價狀態', hideable: true },
  { key: 'category', label: '類別', hideable: true },
  { key: 'kol_name', label: 'KOL/服務', hideable: true },
  { key: 'service', label: '執行內容', hideable: true },
  { key: 'quantity', label: '數量', hideable: true },
  { key: 'price', label: '單價', hideable: true },
  { key: 'cost', label: '成本', hideable: true },
  { key: 'subtotal', label: '小計', hideable: true },
  { key: 'invoice_number', label: '發票號碼', hideable: true },
  { key: 'attachments', label: '附件', hideable: true },
  { key: 'payment_status', label: '狀態', hideable: true },
  { key: 'verification', label: '檢核', hideable: true },
  { key: 'payment_request', label: '請款', hideable: true },
  { key: 'approval', label: '審核', hideable: true },
]

// ─── 排序值提取 ─────────────────────────────────────────────

export function getSortValue(item: FlatQuotationItem, key: FlatSortKey): string | number | null {
  switch (key) {
    case 'quote_number': return item.quotations?.quote_number ?? null
    case 'project_name': return item.quotations?.project_name ?? null
    case 'client_name': return item.quotations?.clients?.name ?? null
    case 'quotation_status': return item.quotations?.status ?? null
    case 'category': return item.category ?? null
    case 'kol_name': return item.kols?.name ?? null
    case 'service': return item.service ?? null
    case 'quantity': return item.quantity ?? 0
    case 'price': return Number(item.price) || 0
    case 'cost': return Number(item.cost) || 0
    case 'subtotal': return (item.quantity || 0) * (Number(item.price) || 0)
    case 'payment_status': return PAYMENT_STATUS_CONFIG[getPaymentStatus(item)].label
    case 'invoice_number': return item.invoice_number ?? null
  }
}

// ─── Sticky column offsets ──────────────────────────────────
// checkbox(40px) + quote_number(96px) + project_name(176px)
export const STICKY_LEFT = { checkbox: '0px', quote_number: '40px', project_name: '136px' } as const
export const STICKY_COLS = new Set<ColumnKey>(['checkbox', 'quote_number', 'project_name'])
