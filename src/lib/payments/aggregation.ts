import type {
  PaymentConfirmation,
  MergedRemittanceGroup,
  WithholdingApplicability,
} from './types'
import type { WithholdingSettings } from '@/types/custom.types'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'
import { groupItemsByRemittance } from './grouping'
import { downloadCsv } from './withholding-export'

/**
 * 從確認清單提取所有可用月份（YYYY-MM 降序）
 */
export function getAvailableMonths(confirmations: PaymentConfirmation[]): string[] {
  const months = new Set<string>()
  confirmations.forEach(c => months.add(c.confirmation_date.slice(0, 7)))
  return Array.from(months).sort().reverse()
}

/**
 * 跨清單彙總：將指定月份所有確認清單的項目，
 * 按匯款戶名歸戶合併，計算代扣與匯費。
 */
export function aggregateMonthlyRemittanceGroups(
  confirmations: PaymentConfirmation[],
  month: string,
  rates: WithholdingSettings | null | undefined
): MergedRemittanceGroup[] {
  const taxRate = rates?.income_tax_rate ?? DEFAULT_WITHHOLDING.income_tax_rate
  const nhiRate = rates?.nhi_supplement_rate ?? DEFAULT_WITHHOLDING.nhi_supplement_rate

  const mergedMap = new Map<string, MergedRemittanceGroup>()

  const monthConfirmations = confirmations.filter(c =>
    c.confirmation_date.startsWith(month)
  )

  for (const confirmation of monthConfirmations) {
    const groups = groupItemsByRemittance(confirmation.payment_confirmation_items)
    const savedSettings = confirmation.remittance_settings || {}

    for (const group of groups) {
      const settings = savedSettings[group.remittanceName] || {
        hasRemittanceFee: false,
        remittanceFeeAmount: 30,
        hasTax: false,
        hasInsurance: false,
      }

      const subtotal = group.totalAmount
      const tax = settings.hasTax ? Math.floor(subtotal * taxRate) : 0
      const insurance = settings.hasInsurance ? Math.floor(subtotal * nhiRate) : 0
      const fee = settings.hasRemittanceFee ? settings.remittanceFeeAmount : 0

      const isPersonalClaim = group.items.some(
        item => item.source_type === 'personal' || item.expense_claim_id
      )

      if (!mergedMap.has(group.remittanceName)) {
        mergedMap.set(group.remittanceName, {
          remittanceName: group.remittanceName,
          bankName: group.bankName,
          branchName: group.branchName,
          accountNumber: group.accountNumber,
          isCompanyAccount: group.isCompanyAccount,
          isWithholdingExempt: group.isWithholdingExempt,
          isPersonalClaim,
          items: [],
          confirmationBreakdowns: [],
          totalAmount: 0,
          totalTax: 0,
          totalInsurance: 0,
          totalFee: 0,
          netTotal: 0,
        })
      }

      const merged = mergedMap.get(group.remittanceName)!
      merged.items.push(...group.items)
      merged.confirmationBreakdowns.push({
        confirmationId: confirmation.id,
        confirmationDate: confirmation.confirmation_date,
        subtotal,
        tax,
        insurance,
        fee,
      })
      merged.totalAmount += subtotal
      merged.totalTax += tax
      merged.totalInsurance += insurance
      merged.totalFee += fee
    }
  }

  // 計算 netTotal
  const result = Array.from(mergedMap.values())
  result.forEach(group => {
    group.netTotal = group.totalAmount - group.totalTax - group.totalInsurance - group.totalFee
  })

  return result.sort((a, b) => b.totalAmount - a.totalAmount)
}

/**
 * 將合併群組分為個人/公司
 */
export function splitRemittanceGroups(groups: MergedRemittanceGroup[]): {
  personalGroups: MergedRemittanceGroup[]
  companyGroups: MergedRemittanceGroup[]
} {
  const personalGroups: MergedRemittanceGroup[] = []
  const companyGroups: MergedRemittanceGroup[] = []

  for (const group of groups) {
    if (group.isCompanyAccount) {
      companyGroups.push(group)
    } else {
      personalGroups.push(group)
    }
  }

  return { personalGroups, companyGroups }
}

/**
 * 判斷匯款群組是否需要顯示代扣設定
 */
export function checkWithholdingApplicability(
  group: {
    isCompanyAccount: boolean
    isWithholdingExempt: boolean
    totalAmount: number
    isPersonalClaim?: boolean
  },
  rates: WithholdingSettings | null | undefined
): WithholdingApplicability {
  if (group.isPersonalClaim) {
    return { showWithholding: false, reason: 'personal_claim' }
  }
  if (group.isCompanyAccount) {
    return { showWithholding: false, reason: 'company_account' }
  }
  if (group.isWithholdingExempt) {
    return { showWithholding: false, reason: 'exempt' }
  }
  const taxThreshold = rates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold
  if (group.totalAmount < taxThreshold) {
    return { showWithholding: false, reason: 'below_threshold' }
  }
  return { showWithholding: true, reason: 'applicable' }
}

/**
 * 匯出銀行匯款明細 CSV
 */
export function exportBankTransferCsv(
  groups: MergedRemittanceGroup[],
  month: string
) {
  const rows: string[][] = [
    ['匯款戶名', '銀行', '分行', '帳號', '帳戶類型', '給付金額', '代扣所得稅', '代扣健保', '匯費', '實付金額']
  ]

  for (const group of groups) {
    rows.push([
      group.remittanceName,
      group.bankName,
      group.branchName,
      group.accountNumber,
      group.isCompanyAccount ? '公司戶' : '個人戶',
      group.totalAmount.toString(),
      group.totalTax.toString(),
      group.totalInsurance.toString(),
      group.totalFee.toString(),
      group.netTotal.toString(),
    ])
  }

  const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n')
  downloadCsv(csv, `匯款明細_${month}.csv`)
}
