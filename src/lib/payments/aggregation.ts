import type {
  PaymentConfirmation,
  MergedRemittanceGroup,
  WithholdingApplicability,
} from './types'
import type { WithholdingSettings, AccountingExpense, AccountingPayroll } from '@/types/custom.types'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'
import { groupItemsByRemittance } from './grouping'
import { downloadCsv } from './withholding-export'
import { getBillingMonthKey } from './billingPeriod'

/** 將 expense_month（"2026年2月" 或 "2026年02月"）轉換為 YYYY-MM 格式 */
function expenseMonthToYYYYMM(expenseMonth: string): string | null {
  const match = expenseMonth?.match(/(\d{4})年(\d{1,2})月/)
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, '0')}`
}

/**
 * 從確認清單提取所有可用帳務期間（YYYY-MM 降序）
 * 使用 10 日切點規則：10 日（含）前 → 當月，10 日後 → 次月
 */
export function getAvailableMonths(
  confirmations: PaymentConfirmation[],
  expenses?: AccountingExpense[],
  payrollData?: { payment_date: string | null }[]
): string[] {
  const months = new Set<string>()
  confirmations.forEach(c => months.add(getBillingMonthKey(c.confirmation_date)))
  expenses?.forEach(e => {
    const m = expenseMonthToYYYYMM(e.expense_month || '')
    if (m) months.add(m)
  })
  payrollData?.forEach(p => {
    if (p.payment_date) months.add(getBillingMonthKey(p.payment_date))
  })
  return Array.from(months).sort().reverse()
}

/**
 * 跨清單彙總：將指定月份所有確認清單的項目，
 * 按匯款戶名歸戶合併，計算代扣與匯費。
 */
export function aggregateMonthlyRemittanceGroups(
  confirmations: PaymentConfirmation[],
  month: string,
  rates: WithholdingSettings | null | undefined,
  expenses?: AccountingExpense[],
  payroll?: AccountingPayroll[]
): MergedRemittanceGroup[] {
  const taxRate = rates?.income_tax_rate ?? DEFAULT_WITHHOLDING.income_tax_rate
  const nhiRate = rates?.nhi_supplement_rate ?? DEFAULT_WITHHOLDING.nhi_supplement_rate

  const mergedMap = new Map<string, MergedRemittanceGroup>()

  // --- 1. 處理 payment_confirmation_items ---
  const monthConfirmations = confirmations.filter(c =>
    getBillingMonthKey(c.confirmation_date) === month
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
          expenseItems: [],
          payrollItems: [],
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

  // --- 2. 處理 accounting_expenses（進項管理手動新增的） ---
  if (expenses) {
    // 過濾：只取該月份、且非自動產生的紀錄（避免重複計算）
    // - payment_confirmation_id: 確認清單自動產生
    // - quotation_item_id: 報價單核准自動產生
    // - expense_claim_id: 個人報帳核准自動產生（已有對應 confirmation_item）
    const monthExpenses = expenses.filter(e => {
      if (e.payment_confirmation_id || e.quotation_item_id || e.expense_claim_id) return false
      const m = expenseMonthToYYYYMM(e.expense_month || '')
      return m === month
    })

    for (const expense of monthExpenses) {
      const vendorName = expense.vendor_name || '未命名支出'
      const isCompany = expense.payment_target_type === 'vendor'

      if (!mergedMap.has(vendorName)) {
        mergedMap.set(vendorName, {
          remittanceName: vendorName,
          bankName: '',
          branchName: '',
          accountNumber: '',
          isCompanyAccount: isCompany,
          isWithholdingExempt: false,
          isPersonalClaim: false,
          items: [],
          expenseItems: [],
          payrollItems: [],
          confirmationBreakdowns: [],
          totalAmount: 0,
          totalTax: 0,
          totalInsurance: 0,
          totalFee: 0,
          netTotal: 0,
        })
      }

      const group = mergedMap.get(vendorName)!
      group.expenseItems.push(expense)
      group.totalAmount += expense.total_amount || expense.amount || 0
      group.totalFee += expense.remittance_fee || 0
    }
  }

  // --- 3. 處理 accounting_payroll（人事薪資）---
  if (payroll) {
    const monthPayroll = payroll.filter(p => {
      if (!p.payment_date) return false
      return getBillingMonthKey(p.payment_date) === month
    })

    for (const p of monthPayroll) {
      const employeeName = p.employee_name || '未命名員工'

      if (!mergedMap.has(employeeName)) {
        mergedMap.set(employeeName, {
          remittanceName: employeeName,
          bankName: '',
          branchName: '',
          accountNumber: '',
          isCompanyAccount: false,
          isWithholdingExempt: false,
          isPersonalClaim: false,
          items: [],
          expenseItems: [],
          payrollItems: [],
          confirmationBreakdowns: [],
          totalAmount: 0,
          totalTax: 0,
          totalInsurance: 0,
          totalFee: 0,
          netTotal: 0,
        })
      }

      const group = mergedMap.get(employeeName)!
      group.payrollItems.push(p)
      group.totalAmount += p.net_salary || 0
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
    ['匯款戶名', '銀行', '分行', '帳號', '帳戶類型', '給付金額', '匯費', '實付金額']
  ]

  for (const group of groups) {
    rows.push([
      group.remittanceName,
      group.bankName,
      group.branchName,
      group.accountNumber,
      group.isCompanyAccount ? '公司戶' : '個人戶',
      group.totalAmount.toString(),
      group.totalFee.toString(),
      group.netTotal.toString(),
    ])
  }

  const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n')
  downloadCsv(csv, `匯款明細_${month}.csv`)
}
