// src/lib/payments/remittee.ts
// 共用匯款對象推導函數 — 工作台和確認清單共用
// spec: 005-remittance-grouping-refactor

import { type KolBankInfo, parseKolBankInfo } from '@/types/schemas'

/** 統一推導結果 */
export interface RemitteeInfo {
  groupKey: string
  displayName: string
  bankName: string
  branchName: string
  accountNumber: string
  isCompanyAccount: boolean
  isWithholdingExempt: boolean
}

/**
 * 從 KOL 和 bank_info 推導匯款對象資訊
 * 工作台和確認清單都必須呼叫此函數，確保分組 key 一致
 */
export function deriveRemitteeInfo(
  kol: {
    id?: string
    name: string
    real_name?: string | null
    bank_info?: unknown
    withholding_exempt?: boolean | null
  } | null | undefined,
  rawBankInfo?: unknown
): RemitteeInfo {
  const bankInfo = parseKolBankInfo(rawBankInfo ?? kol?.bank_info)

  const isCompanyAccount = bankInfo.bankType === 'company'
  const isWithholdingExempt = kol?.withholding_exempt === true

  // displayName：公司戶用 companyAccountName，個人戶用 personalAccountName / real_name
  let displayName: string
  if (kol) {
    if (isCompanyAccount) {
      displayName = bankInfo.companyAccountName || kol.name
    } else {
      displayName = bankInfo.personalAccountName || kol.real_name || kol.name
    }
  } else {
    displayName = '未知匯款戶名'
  }

  // groupKey 三級 fallback：帳號 → kol_id → 名稱
  const groupKey = makeGroupKey(bankInfo.accountNumber, kol?.id, displayName)

  return {
    groupKey,
    displayName,
    bankName: bankInfo.bankName || '',
    branchName: bankInfo.branchName || '',
    accountNumber: bankInfo.accountNumber || '',
    isCompanyAccount,
    isWithholdingExempt,
  }
}

/**
 * 產生分組 key：帳號 → kol_id → 名稱（三級 fallback）
 */
export function makeGroupKey(
  accountNumber: string | undefined,
  kolId: string | undefined,
  displayName: string
): string {
  if (accountNumber) return `acct_${accountNumber}`
  if (kolId) return `kol_${kolId}`
  return `name_${displayName}`
}

/**
 * 為個人報帳項目產生 groupKey 和 displayName
 */
export function derivePersonalClaimInfo(
  submitterName: string | null,
  vendorName: string | null,
  submittedBy: string | null
): { groupKey: string; displayName: string } {
  const isExternalVendor = vendorName && submitterName && vendorName !== submitterName
  const displayName = isExternalVendor
    ? vendorName
    : (submitterName || vendorName || '個人報帳')
  const groupKey = isExternalVendor
    ? `vendor_${vendorName}`
    : `personal_${submittedBy || displayName}`
  return { groupKey, displayName }
}
