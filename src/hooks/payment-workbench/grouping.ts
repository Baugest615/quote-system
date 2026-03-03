// src/hooks/payment-workbench/grouping.ts
// 工作台共用分組邏輯（v1.1: 帳戶類型分組）

import { parseKolBankInfo } from '@/types/schemas'
import type { WorkbenchItem, MergeGroupInfo, RemitteeGroup, AccountCategory, CategorySection } from './types'

/** 從 kol_bank_info 推導帳戶類型與戶名 */
export function deriveAccountInfo(bankInfo: unknown): {
  category: AccountCategory
  accountName: string
} {
  const info = parseKolBankInfo(bankInfo)
  if (info.bankType === 'individual' && info.personalAccountName) {
    return { category: 'individual', accountName: info.personalAccountName }
  }
  if (info.bankType === 'company' && info.companyAccountName) {
    return { category: 'company', accountName: info.companyAccountName }
  }
  return { category: 'unknown', accountName: '未填寫匯款資訊' }
}

/** 將項目清單提取合併組 */
export function extractMergeGroups(items: WorkbenchItem[]): MergeGroupInfo[] {
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
      leader_item: leader,
      member_items: members,
      merge_color: leader.merge_color,
      total_amount: mgItems.reduce((sum, i) => sum + (i.cost_amount || 0), 0),
      item_count: mgItems.length,
      status: leader.status,
    }
  })
}

/** 按帳戶類型 + 戶名分組 */
export function groupByRemittee(items: WorkbenchItem[]): RemitteeGroup[] {
  const groups = new Map<string, { items: WorkbenchItem[]; category: AccountCategory }>()

  for (const item of items) {
    const { category, accountName } = deriveAccountInfo(item.kol_bank_info)
    const key = `${category}::${accountName}`
    if (!groups.has(key)) groups.set(key, { items: [], category })
    groups.get(key)!.items.push(item)
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const name = key.split('::')[1]
    const merge_groups = extractMergeGroups(group.items)

    return {
      remittance_name: name,
      bank_info: group.items[0]?.kol_bank_info || null,
      items: group.items,
      merge_groups,
      total_amount: group.items.reduce((sum, i) => sum + (i.cost_amount || 0), 0),
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
