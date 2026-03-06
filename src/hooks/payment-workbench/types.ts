// src/hooks/payment-workbench/types.ts
// 請款工作台專用型別

import type { KolBankInfo } from '@/types/schemas'
import type { PaymentAttachment } from '@/lib/payments/types'

/** 工作台項目的請款狀態 */
export type WorkbenchItemStatus = 'pending' | 'requested'

/** RPC get_workbench_items() 回傳的原始型別 */
export interface WorkbenchItemRaw {
  id: string
  quotation_id: string
  kol_id: string | null
  category: string | null
  service: string
  quantity: number
  price: number
  cost: number | null
  cost_amount: number | null
  invoice_number: string | null
  attachments: PaymentAttachment[]
  expense_type: string | null
  accounting_subject: string | null
  expected_payment_month: string | null
  remittance_name: string | null
  remark: string | null
  requested_at: string | null
  requested_by: string | null
  approved_at: string | null
  approved_by: string | null
  rejected_at: string | null
  rejected_by: string | null
  rejection_reason: string | null
  merge_group_id: string | null
  is_merge_leader: boolean
  merge_color: string | null
  created_at: string
  // 關聯資訊
  project_name: string | null
  client_name: string | null
  kol_name: string | null
  kol_bank_info: KolBankInfo | null
}

/** 加上 UI 狀態的工作台項目 */
export interface WorkbenchItem extends WorkbenchItemRaw {
  /** 推導的請款狀態 */
  status: WorkbenchItemStatus
  /** UI 勾選狀態 */
  is_selected: boolean
}

/** 帳戶類型分類 */
export type AccountCategory = 'individual' | 'company' | 'unknown'

/** 按匯款對象分組 */
export interface RemitteeGroup {
  remittance_name: string
  bank_info: KolBankInfo | null
  items: WorkbenchItem[]
  merge_groups: MergeGroupInfo[]
  total_amount: number
  item_count: number
  /** 帳戶類型分類（v1.1） */
  category: AccountCategory
}

/** 按帳戶類型歸類的區塊 */
export interface CategorySection {
  category: AccountCategory
  label: string
  groups: RemitteeGroup[]
  total_amount: number
  item_count: number
}

/** 合併組資訊 */
export interface MergeGroupInfo {
  group_id: string
  /** 統一顯示名稱（繼承自父層 RemitteeGroup.remittance_name） */
  remittance_name: string
  leader_item: WorkbenchItem
  member_items: WorkbenchItem[]
  merge_color: string | null
  /** 成本小計（未稅） */
  total_cost: number
  /** 稅金小計（公司行號 5%） */
  total_tax: number
  /** 含稅總金額 */
  total_amount: number
  item_count: number
  status: WorkbenchItemStatus
}

/** 篩選條件 */
export interface WorkbenchFilters {
  search: string
  status: WorkbenchItemStatus | 'all'
  project: string | 'all'
  client: string | 'all'
  month: string | 'all'
}
