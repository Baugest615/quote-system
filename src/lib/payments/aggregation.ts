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

/** 將 YYYY-MM 轉為中文格式（"2026年3月"，不補零，與 RPC 一致） */
export function yyyymmToChinese(month: string): string | null {
  const match = month.match(/^(\d{4})-(\d{1,2})$/)
  if (!match) return null
  return `${match[1]}年${parseInt(match[2], 10)}月`
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
      const groupKey = group.groupKey

      const settings =
        savedSettings[groupKey] ||
        savedSettings[group.remittanceName] || {
          hasRemittanceFee: false,
          remittanceFeeAmount: 30,
          hasTax: false,
          hasInsurance: false,
        }

      const rawSubtotal = group.items.reduce((s: number, i: PaymentConfirmationItem) => s + (i.amount_at_confirmation || 0), 0)
      // 公司行號：DB 存未稅成本，顯示時加 5% 營業稅（與工作台 calcItemTaxInfo 一致）
      const subtotal = group.isCompanyAccount ? Math.round(rawSubtotal * 1.05) : rawSubtotal
      const fee = settings.hasRemittanceFee ? settings.remittanceFeeAmount : 0

      const isPersonalClaim = group.items.some(
        (item: PaymentConfirmationItem) => item.source_type === 'personal' || item.expense_claim_id
      )

      if (!mergedMap.has(groupKey)) {
        mergedMap.set(groupKey, {
          groupKey,
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

      const merged = mergedMap.get(groupKey)!
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
    // - quotation_item_id: 報價單核准自動產生（approve_quotation_item）
    // - expense_claim_id: 個人報帳核准自動產生（approve_expense_claim）
    // - payment_request_id: 請款核准自動產生（approve_payment_request）
    const monthExpenses = expenses.filter(e => {
      if (e.payment_confirmation_id || e.quotation_item_id || e.expense_claim_id || e.payment_request_id) return false
      const m = expenseMonthToYYYYMM(e.expense_month || '')
      return m === month
    })

    for (const expense of monthExpenses) {
      const vendorName = expense.vendor_name || '未命名支出'
      const isCompany = expense.payment_target_type === 'vendor'
      const expenseKey = `vendor_${vendorName}`

      if (!mergedMap.has(expenseKey)) {
        mergedMap.set(expenseKey, {
          groupKey: expenseKey,
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

      const group = mergedMap.get(expenseKey)!
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
      const payrollKey = `payroll_${employeeName}`

      if (!mergedMap.has(payrollKey)) {
        mergedMap.set(payrollKey, {
          groupKey: payrollKey,
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

      const group = mergedMap.get(payrollKey)!
      group.payrollItems.push(p)
      group.totalAmount += p.net_salary || 0
    }
  }

  // --- 4. 員工合併：同名的 payroll / personal claim / KOL items 歸為一組 ---
  // 必須在代扣計算之前執行，確保合併後的金額用於門檻判斷
  consolidateEmployeeGroups(mergedMap)

  // 計算代扣代繳
  // 法規：不同日期的給付各自獨立判斷門檻（所得稅法§88、全民健康保險法§31）
  // 若同一人有多筆給付且 paymentDate 不同，按日分組各自判斷門檻
  const result = Array.from(mergedMap.values())
  result.forEach(group => {
    // 從同一確認清單的 settings 讀取（不跨清單汙染）
    // 優先用 groupKey 查詢，fallback 到 remittanceName（向下相容）
    const savedSetting = monthConfirmations
      .map(c => c.remittance_settings?.[group.groupKey] ?? c.remittance_settings?.[group.remittanceName])
      .find(s => s !== undefined)

    // 代扣判斷：
    // - 公司戶 / 個人報帳 / 純薪資進項 → 全免（不扣所得稅、不扣健保）
    // - 工會免扣 (isWithholdingExempt) → 只免二代健保，所得稅照扣
    const hasKolItems = group.items.length > 0
    const isFullExempt = !hasKolItems || group.isCompanyAccount || group.isPersonalClaim
    const isNhiExempt = isFullExempt || group.isWithholdingExempt

    if (isFullExempt) {
      group.totalTax = 0
      group.totalInsurance = 0
    } else if (savedSetting) {
      // 使用者已手動設定，但仍需尊重法定門檻（金額未達門檻不扣稅）
      const meetsThreshold = group.totalAmount >= taxThreshold
      const meetsNhiThreshold = group.totalAmount >= nhiThreshold
      group.totalTax = (savedSetting.hasTax && meetsThreshold) ? Math.floor(group.totalAmount * taxRate) : 0
      group.totalInsurance = isNhiExempt ? 0 : ((savedSetting.hasInsurance && meetsNhiThreshold) ? Math.floor(group.totalAmount * nhiRate) : 0)
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
        if (!isNhiExempt && dateTotal >= nhiThreshold) totalInsurance += Math.floor(dateTotal * nhiRate)
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
    } else if (group.isPersonalClaim || group.payrollItems.length > 0) {
      // 個人報帳 或 有薪資紀錄 → 員工（含有進項的員工，避免被舊 accounting_expenses 拉到勞報區）
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
  // 工會免扣只免二代健保，所得稅照扣 → 仍需顯示代扣設定
  // （isWithholdingExempt 不再阻擋 showWithholding）
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

/**
 * 員工合併：同一人在不同來源（KOL 項目 / 個人報帳 / 薪資）的群組
 * 合併為單一群組，避免同名員工在 UI 上出現多次。
 *
 * 辨識邏輯：
 * 1. 有 payrollItems 或 isPersonalClaim 的群組視為「已知員工」
 * 2. 其他群組的 remittanceName 若匹配已知員工，也併入
 * 3. 合併目標為同名的第一個群組（優先保留有銀行資訊的）
 *
 * 必須在代扣計算之前呼叫，確保合併後金額用於門檻判斷。
 */
function consolidateEmployeeGroups(
  mergedMap: Map<string, MergedRemittanceGroup>
): void {
  // 1. 找出所有已知員工名稱 → 對應的 primary groupKey
  const employeePrimaryKey = new Map<string, string>() // key: remittanceName
  mergedMap.forEach((group, key) => {
    if (group.payrollItems.length > 0 || group.isPersonalClaim) {
      if (!employeePrimaryKey.has(group.remittanceName)) {
        employeePrimaryKey.set(group.remittanceName, key)
      }
    }
  })

  if (employeePrimaryKey.size === 0) return

  // 2. 收集需要合併的 [sourceKey → targetKey]（同名合併）
  const merges: [string, string][] = []
  mergedMap.forEach((group, key) => {
    const targetKey = employeePrimaryKey.get(group.remittanceName)
    if (targetKey && targetKey !== key) {
      merges.push([key, targetKey])
    }
  })

  // 3. 執行合併
  for (const [sourceKey, targetKey] of merges) {
    const source = mergedMap.get(sourceKey)
    const target = mergedMap.get(targetKey)
    if (!source || !target) continue

    target.items.push(...source.items)
    target.expenseItems.push(...source.expenseItems)
    target.payrollItems.push(...source.payrollItems)
    target.confirmationBreakdowns.push(...source.confirmationBreakdowns)
    target.totalAmount += source.totalAmount
    target.totalFee += source.totalFee

    // 保留有銀行資訊的版本
    if (!target.bankName && source.bankName) {
      target.bankName = source.bankName
      target.branchName = source.branchName
      target.accountNumber = source.accountNumber
    }

    // 任一來源是個人報帳 → 標記（影響代扣判斷：員工免扣）
    if (source.isPersonalClaim) target.isPersonalClaim = true

    mergedMap.delete(sourceKey)
  }
}
