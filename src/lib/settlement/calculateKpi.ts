import type { AccountingExpense, AccountingPayroll, ExpenseClaim } from '@/types/custom.types'

/**
 * KPI 計算輸入資料
 */
export interface CalculateKpiInput {
  expenses: AccountingExpense[]
  payroll: AccountingPayroll[]
  withholdingClaims: ExpenseClaim[]
}

/**
 * KPI 計算結果
 */
export interface KpiResult {
  /** 薪資合計（所有薪資的 net_salary 總和） */
  kpiSalaryTotal: number
  /** 員工支出合計（員工相關支出 + 代扣代繳報帳） */
  kpiEmployeeExpenseTotal: number
  /** 外部廠商支出合計 */
  kpiExternalTotal: number
  /** 總計（薪資 + 員工支出 + 外部支出） */
  kpiGrandTotal: number
  /** 未付款合計（薪資 + 支出 + 代扣代繳中尚未付款的部分） */
  kpiUnpaidTotal: number
}

/**
 * 計算月結總覽的 KPI 指標。
 *
 * 純函式 — 無副作用，可直接用於單元測試。
 *
 * 計算邏輯：
 * - 薪資合計：所有薪資記錄的 net_salary 總和
 * - 員工支出：payment_target_type='employee' 的支出 + 代扣代繳報帳
 * - 外部支出：payment_target_type!='employee' 的支出
 * - 未付款：各類別中 payment_status!='paid' 的金額加總
 */
export function calculateKpi(input: CalculateKpiInput): KpiResult {
  const { expenses, payroll, withholdingClaims } = input

  // 區分員工相關支出與外部支出
  const employeeExpenses = expenses.filter(e => e.payment_target_type === 'employee')
  const externalExpenses = expenses.filter(e => e.payment_target_type !== 'employee')

  // 薪資合計
  const kpiSalaryTotal = payroll.reduce((sum, p) => sum + (p.net_salary || 0), 0)

  // 員工支出合計（含代扣代繳報帳）
  const kpiEmployeeExpenseTotal =
    employeeExpenses.reduce((sum, e) => sum + (e.total_amount || 0), 0) +
    withholdingClaims.reduce((sum, c) => sum + (c.total_amount || 0), 0)

  // 外部廠商支出合計
  const kpiExternalTotal = externalExpenses.reduce((sum, e) => sum + (e.total_amount || 0), 0)

  // 總計
  const kpiGrandTotal = kpiSalaryTotal + kpiEmployeeExpenseTotal + kpiExternalTotal

  // 未付款合計
  const unpaidSalary = payroll
    .filter(p => p.payment_status !== 'paid')
    .reduce((sum, p) => sum + (p.net_salary || 0), 0)
  const unpaidExpenses = expenses
    .filter(e => e.payment_status !== 'paid')
    .reduce((sum, e) => sum + (e.total_amount || 0), 0)
  const unpaidClaims = withholdingClaims
    .filter(c => c.payment_status !== 'paid')
    .reduce((sum, c) => sum + (c.total_amount || 0), 0)
  const kpiUnpaidTotal = unpaidSalary + unpaidExpenses + unpaidClaims

  return {
    kpiSalaryTotal,
    kpiEmployeeExpenseTotal,
    kpiExternalTotal,
    kpiGrandTotal,
    kpiUnpaidTotal,
  }
}
