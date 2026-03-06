// src/hooks/payment-workbench/grouping.ts
// 工作台共用分組邏輯（v1.2: 帳戶類型分組 + 含稅計算）

import { parseKolBankInfo } from '@/types/schemas'
import { deriveRemitteeInfo } from '@/lib/payments/remittee'
import type { WorkbenchItem, MergeGroupInfo, RemitteeGroup, AccountCategory, CategorySection } from './types'

/** 固定營業稅率 5% */
const TAX_RATE = 0.05

/** 計算單筆項目的含稅金額（公司行號加 5% 營業稅，個人戶不加） */
export function calcItemTaxInfo(item: { cost_amount: number | null; kol_bank_info: { bankType?: string } | null }) {
  const cost = item.cost_amount || 0
  const isCompany = item.kol_bank_info?.bankType === 'company'
  const tax = isCompany ? Math.round(cost * TAX_RATE) : 0
  return { cost, tax, total: cost + tax, isCompany }
}

/** 從工作台項目推導帳戶類型、戶名與 groupKey（改用共用 deriveRemitteeInfo） */
export function deriveAccountInfo(bankInfo: unknown, kolName?: string | null, kolId?: string | null): {
  category: AccountCategory
  accountName: string
  groupKey: string
} {
  const kol = kolName ? { id: kolId || undefined, name: kolName } : null
  const info = deriveRemitteeInfo(kol, bankInfo)
  const parsed = parseKolBankInfo(bankInfo)
  // category 判斷：有 bankType 才能分類，否則 unknown
  let category: AccountCategory = 'unknown'
  if (parsed.bankType === 'company' && parsed.companyAccountName) {
    category = 'company'
  } else if (parsed.bankType === 'individual' && parsed.personalAccountName) {
    category = 'individual'
  }
  return { category, accountName: info.displayName, groupKey: info.groupKey }
}

/** 將項目清單提取合併組 */
export function extractMergeGroups(items: WorkbenchItem[], parentName?: string): MergeGroupInfo[] {
  const mergeGroupMap = new Map<string, WorkbenchItem[]>()
  for (const item of items) {
    if (item.merge_group_id) {
      if (!mergeGroupMap.has(item.merge_group_id)) {
        mergeGroupMap.set(item.merge_group_id, [])
      }
      mergeGroupMap.get(item.merge_group_id)!.push(item)
    }
  }

  return Array.from(mergeGroupMap.entries()).map(([groupId, mgItems]) => {
    const leader = mgItems.find((i) => i.is_merge_leader) || mgItems[0]
    const members = mgItems.filter((i) => !i.is_merge_leader)
    return {
      group_id: groupId,
      remittance_name: parentName || leader.remittance_name || leader.kol_name || '未指定',
      leader_item: leader,
      member_items: members,
      merge_color: leader.merge_color,
      total_cost: mgItems.reduce((sum, i) => sum + calcItemTaxInfo(i).cost, 0),
      total_tax: mgItems.reduce((sum, i) => sum + calcItemTaxInfo(i).tax, 0),
      total_amount: mgItems.reduce((sum, i) => sum + calcItemTaxInfo(i).total, 0),
      item_count: mgItems.length,
      status: leader.status,
    }
  })
}

/** 按帳戶類型 + 戶名分組（使用共用 groupKey，與確認清單一致） */
export function groupByRemittee(items: WorkbenchItem[]): RemitteeGroup[] {
  const groups = new Map<string, { items: WorkbenchItem[]; category: AccountCategory; displayName: string }>()

  for (const item of items) {
    const { category, accountName, groupKey } = deriveAccountInfo(item.kol_bank_info, item.kol_name, item.kol_id)
    if (!groups.has(groupKey)) groups.set(groupKey, { items: [], category, displayName: accountName })
    groups.get(groupKey)!.items.push(item)
  }

  return Array.from(groups.entries()).map(([_key, group]) => {
    const merge_groups = extractMergeGroups(group.items, group.displayName)

    return {
      remittance_name: group.displayName,
      bank_info: group.items[0]?.kol_bank_info || null,
      items: group.items,
      merge_groups,
      total_amount: group.items.reduce((sum, i) => sum + calcItemTaxInfo(i).total, 0),
      item_count: group.items.length,
      category: group.category,
    }
  })
}

const CATEGORY_CONFIG: { key: AccountCategory; label: string }[] = [
  { key: 'individual', label: '勞報（個人戶）' },
  { key: 'company', label: '公司行號' },
  { key: 'unknown', label: '未填寫資料' },
]

/** 將 RemitteeGroup[] 歸類為三大區塊 */
export function groupByCategory(groups: RemitteeGroup[]): CategorySection[] {
  const sections: CategorySection[] = []

  for (const { key, label } of CATEGORY_CONFIG) {
    const catGroups = groups.filter((g) => g.category === key)
    if (catGroups.length === 0) continue
    sections.push({
      category: key,
      label,
      groups: catGroups,
      total_amount: catGroups.reduce((sum, g) => sum + g.total_amount, 0),
      item_count: catGroups.reduce((sum, g) => sum + g.item_count, 0),
    })
  }

  return sections
}

/** 將項目直接分為 CategorySection（便利函數） */
export function itemsToCategorySections(items: WorkbenchItem[]): CategorySection[] {
  return groupByCategory(groupByRemittee(items))
}
