import type {
  PaymentConfirmation,
  PaymentConfirmationItem,
  MergedRemittanceGroup,
  WithholdingApplicability,
} from './types'
import type { WithholdingSettings, AccountingExpense, AccountingPayroll } from '@/types/custom.types'
import { DEFAULT_WITHHOLDING } from '@/hooks/useWithholdingSettings'
import { groupItemsByRemittance } from './grouping'
import { downloadCsv } from './withholding-export'
import { getBillingMonthKey } from './billingPeriod'

/** 將 expense_month（"2026年2月"、"2026年02月" 或 "2026-02"）轉換為 YYYY-MM 格式 */
export function expenseMonthToYYYYMM(expenseMonth: string): string | null {
  // 中文格式：2026年2月 or 2026年02月
  const cnMatch = expenseMonth?.match(/(\d{4})年(\d{1,2})月/)
  if (cnMatch) return `${cnMatch[1]}-${cnMatch[2].padStart(2, '0')}`
  // ISO 格式：2026-02 or 2026-2
  const isoMatch = expenseMonth?.match(/^(\d{4})-(\d{1,2})$/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}`
  return null
}

/**
 * 取得單一 confirmation_item 的帳務月份（YYYY-MM）
 * 混合模式：優先使用 expected_payment_month / claim_month，無則 fallback 到確認日期 + 10 日切點
 */
export function getItemBillingMonth(
  item: PaymentConfirmationItem,
  confirmationDate: string
): string {
  // 1. 報價單直接請款（新流程）
  if (item.quotation_items?.expected_payment_month) {
    const m = expenseMonthToYYYYMM(item.quotation_items.expected_payment_month)
    if (m) return m
  }
  // 2. 專案請款（舊流程）
  if (item.payment_requests?.quotation_items?.expected_payment_month) {
    const m = expenseMonthToYYYYMM(item.payment_requests.quotation_items.expected_payment_month)
    if (m) return m
  }
  // 3. 個人報帳
  if (item.expense_claims?.claim_month) {
    const m = expenseMonthToYYYYMM(item.expense_claims.claim_month)
    if (m) return m
  }
  // 4. Fallback: 確認日期 + 10 日切點
  return getBillingMonthKey(confirmationDate)
}

/**
 * 從確認清單提取所有可用帳務期間（YYYY-MM 降序）
 * 混合模式：優先取 item 的 expected_payment_month，否則用確認日期 + 10 日切點
 */
export function getAvailableMonths(
  confirmations: PaymentConfirmation[],
  expenses?: AccountingExpense[],
  payrollData?: { payment_date: string | null }[]
): string[] {
  const months = new Set<string>()
  confirmations.forEach(c => {
    // 從每個 item 取帳務月份
    c.payment_confirmation_items?.forEach(item => {
      months.add(getItemBillingMonth(item, c.confirmation_date))
    })
    // 若無 items，至少加上 confirmation 本身的月份
    if (!c.payment_confirmation_items?.length) {
      months.add(getBillingMonthKey(c.confirmation_date))
    }
  })
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
  const taxThreshold = rates?.income_tax_threshold ?? DEFAULT_WITHHOLDING.income_tax_threshold
  const nhiThreshold = rates?.nhi_threshold ?? DEFAULT_WITHHOLDING.nhi_threshold

  const mergedMap = new Map<string, MergedRemittanceGroup>()

  // --- 1. 處理 payment_confirmation_items ---
  // 混合模式：遍歷所有 confirmation，只取帳務月份 === month 的 items
  // 同一 confirmation 的 items 可能分屬不同月份（因 expected_payment_month 不同）
  const monthConfirmations: PaymentConfirmation[] = []

  for (const confirmation of confirmations) {
    const matchingItems = (confirmation.payment_confirmation_items || []).filter(
      item => getItemBillingMonth(item, confirmation.confirmation_date) === month
    )
    if (matchingItems.length > 0) {
      monthConfirmations.push(confirmation)
    }
  }

  for (const confirmation of confirmations) {
    // 只取該月份的 items
    const monthItems = (confirmation.payment_confirmation_items || []).filter(
      item => getItemBillingMonth(item, confirmation.confirmation_date) === month
    )
    if (monthItems.length === 0) continue

    const groups = groupItemsByRemittance(monthItems)
    const savedSettings = confirmation.remittance_settings || {}

    for (const group of groups) {
      const settings = savedSettings[group.remittanceName] || {
        hasRemittanceFee: false,
        remittanceFeeAmount: 30,
        hasTax: false,
        hasInsurance: false,
      }

      const subtotal = group.totalAmount
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
        tax: 0,
        insurance: 0,
        fee,
        paymentDate: settings.paymentDate,
      })
      merged.totalAmount += subtotal
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

  // 計算代扣代繳
  // 法規：不同日期的給付各自獨立判斷門檻（所得稅法§88、全民健康保險法§31）
  // 若同一人有多筆給付且 paymentDate 不同，按日分組各自判斷門檻
  const result = Array.from(mergedMap.values())
  result.forEach(group => {
    // 從 DB 設定中讀取（任一 confirmation 有設定即可）
    const savedSetting = monthConfirmations
      .map(c => c.remittance_settings?.[group.remittanceName])
      .find(s => s !== undefined)

    // 代扣只適用於有 KOL 確認項目的勞報帳戶（排除薪資、進項、公司戶、免扣）
    const hasKolItems = group.items.length > 0
    const isExempt = !hasKolItems || group.isCompanyAccount || group.isWithholdingExempt || group.isPersonalClaim

    // 若使用者已手動設定，以手動設定為準（不走分日邏輯）
    if (savedSetting) {
      group.totalTax = savedSetting.hasTax ? Math.floor(group.totalAmount * taxRate) : 0
      group.totalInsurance = savedSetting.hasInsurance ? Math.floor(group.totalAmount * nhiRate) : 0
    } else if (isExempt) {
      group.totalTax = 0
      group.totalInsurance = 0
    } else {
      // 自動判斷：按 paymentDate 分組計算門檻
      const breakdownsByDate = new Map<string, number>()
      for (const bd of group.confirmationBreakdowns) {
        const dateKey = bd.paymentDate || bd.confirmationDate
        breakdownsByDate.set(dateKey, (breakdownsByDate.get(dateKey) || 0) + bd.subtotal)
      }
      // 加上 expense items（手動進項，無 paymentDate，以 'manual' 歸類）
      const manualExpenseTotal = group.expenseItems.reduce(
        (sum, e) => sum + (e.total_amount || e.amount || 0), 0
      )
      if (manualExpenseTotal > 0) {
        breakdownsByDate.set('_manual_', (breakdownsByDate.get('_manual_') || 0) + manualExpenseTotal)
      }

      let totalTax = 0
      let totalInsurance = 0
      Array.from(breakdownsByDate.values()).forEach(dateTotal => {
        if (dateTotal >= taxThreshold) totalTax += Math.floor(dateTotal * taxRate)
        if (dateTotal >= nhiThreshold) totalInsurance += Math.floor(dateTotal * nhiRate)
      })
      group.totalTax = totalTax
      group.totalInsurance = totalInsurance
    }
    group.netTotal = group.totalAmount - group.totalTax - group.totalInsurance - group.totalFee
  })

  return result.sort((a, b) => b.totalAmount - a.totalAmount)
}

/**
 * 將合併群組分為勞報(個人戶)/公司行號/員工三類
 */
export function splitRemittanceGroups(groups: MergedRemittanceGroup[]): {
  individualGroups: MergedRemittanceGroup[]
  companyGroups: MergedRemittanceGroup[]
  employeeGroups: MergedRemittanceGroup[]
} {
  const individualGroups: MergedRemittanceGroup[] = []
  const companyGroups: MergedRemittanceGroup[] = []
  const employeeGroups: MergedRemittanceGroup[] = []

  for (const group of groups) {
    if (group.isCompanyAccount) {
      companyGroups.push(group)
    } else if (group.isPersonalClaim || (group.payrollItems.length > 0 && group.items.length === 0 && group.expenseItems.length === 0)) {
      // 個人報帳 或 純薪資群組 → 員工
      employeeGroups.push(group)
    } else {
      individualGroups.push(group)
    }
  }

  return { individualGroups, companyGroups, employeeGroups }
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
    ['匯款戶名', '銀行', '分行', '帳號', '帳戶類型', '給付金額', '匯費', '代扣所得稅', '代扣健保', '實付金額']
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
      group.totalTax.toString(),
      group.totalInsurance.toString(),
      group.netTotal.toString(),
    ])
  }

  const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n')
  downloadCsv(csv, `匯款明細_${month}.csv`)
}
