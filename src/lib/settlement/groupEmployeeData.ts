import type {
  AccountingExpense,
  AccountingPayroll,
  Employee,
  ExpenseClaim,
} from '@/types/custom.types'
import type { EmployeeSettlementGroup } from '@/hooks/useMonthlySettlement'

/**
 * 員工分組輸入資料
 */
export interface GroupEmployeeDataInput {
  expenses: AccountingExpense[]
  payroll: AccountingPayroll[]
  employees: Employee[]
  withholdingClaims: ExpenseClaim[]
}

/**
 * 員工分組輸出結果
 */
export interface GroupEmployeeDataResult {
  employeeGroups: EmployeeSettlementGroup[]
  externalExpenses: AccountingExpense[]
}

/**
 * 將原始資料依員工分組，產生 EmployeeSettlementGroup 與外部支出清單。
 *
 * 純函式 — 無副作用，可直接用於單元測試。
 *
 * 分組邏輯：
 * 1. 建立 user_id -> Employee 與 employee_id -> Employee 映射
 * 2. 將支出分為「員工相關」與「外部廠商」
 * 3. 依序將薪資、員工報帳、代扣代繳報帳歸入對應員工群組
 * 4. 計算各群組的 grandTotal 與 allPaid 狀態
 */
export function groupEmployeeData(input: GroupEmployeeDataInput): GroupEmployeeDataResult {
  const { expenses, payroll, employees, withholdingClaims } = input

  // 建立 user_id -> Employee 映射（用於支出與報帳的 submitted_by 對照）
  const userIdToEmployee = new Map<string, Employee>()
  // 建立 employee_id -> Employee 映射（用於薪資的 employee_id 對照）
  const employeeIdToEmployee = new Map<string, Employee>()
  // 建立 name -> Employee 映射（第三層 fallback，僅限名字唯一時使用）
  const employeeNameToEmployee = new Map<string, Employee | null>()
  for (const emp of employees) {
    if (emp.user_id) userIdToEmployee.set(emp.user_id, emp)
    employeeIdToEmployee.set(emp.id, emp)
    if (employeeNameToEmployee.has(emp.name)) {
      employeeNameToEmployee.set(emp.name, null) // 重複名字標記為不可用
    } else {
      employeeNameToEmployee.set(emp.name, emp)
    }
  }

  // 區分員工相關支出與外部支出
  // 第一層：payment_target_type === 'employee'
  // 第二層 fallback：vendor_name 匹配到員工姓名（處理外部導入資料未設定 payment_target_type 的情況）
  const employeeExpenses: AccountingExpense[] = []
  const externalExpenses: AccountingExpense[] = []
  for (const e of expenses) {
    if (e.payment_target_type === 'employee') {
      employeeExpenses.push(e)
    } else if (e.vendor_name && employeeNameToEmployee.has(e.vendor_name) && employeeNameToEmployee.get(e.vendor_name) !== null) {
      employeeExpenses.push(e)
    } else {
      externalExpenses.push(e)
    }
  }

  // 以 empId 為鍵的分組 Map
  const groupMap = new Map<string, EmployeeSettlementGroup>()

  /** 取得或建立員工群組 */
  const getOrCreateGroup = (empId: string, empName: string): EmployeeSettlementGroup => {
    const existing = groupMap.get(empId)
    if (existing) return existing
    const group: EmployeeSettlementGroup = {
      employeeId: empId,
      employeeName: empName,
      payroll: null,
      expenses: [],
      withholdingClaims: [],
      salaryTotal: 0,
      expenseTotal: 0,
      withholdingClaimTotal: 0,
      grandTotal: 0,
      allPaid: true,
    }
    groupMap.set(empId, group)
    return group
  }

  /** 透過名字 fallback 查找員工（僅限名字唯一） */
  const resolveByName = (name: string | null | undefined): Employee | null => {
    if (!name) return null
    const emp = employeeNameToEmployee.get(name)
    return emp ?? null // null 表示重複名字，不可用
  }

  // 1) 加入薪資
  for (const p of payroll) {
    let emp = p.employee_id ? employeeIdToEmployee.get(p.employee_id) : null
    if (!emp) emp = resolveByName(p.employee_name) // fallback: 用姓名匹配
    const empId = emp?.id || p.employee_id || `unknown-payroll-${p.id}`
    const group = getOrCreateGroup(empId, emp?.name || p.employee_name || '未知')
    group.payroll = p
    group.salaryTotal = p.net_salary || 0
    if (p.payment_status !== 'paid') group.allPaid = false
  }

  // 2) 加入員工報帳（非代扣代繳）
  for (const e of employeeExpenses) {
    let emp = e.submitted_by ? userIdToEmployee.get(e.submitted_by) : null
    if (!emp) emp = resolveByName(e.vendor_name) // fallback: 用廠商名匹配員工名
    const empId = emp?.id || `unknown-${e.submitted_by || e.id}`
    const group = getOrCreateGroup(empId, emp?.name || e.vendor_name || '未知')
    group.expenses.push(e)
    group.expenseTotal += e.total_amount || 0
    if (e.payment_status !== 'paid') group.allPaid = false
  }

  // 3) 加入代扣代繳報帳
  for (const c of withholdingClaims) {
    let emp = c.submitted_by ? userIdToEmployee.get(c.submitted_by) : null
    if (!emp) emp = resolveByName(c.vendor_name) // fallback: 用廠商名匹配員工名
    const empId = emp?.id || `unknown-${c.submitted_by || c.id}`
    const group = getOrCreateGroup(empId, emp?.name || c.vendor_name || '未知')
    group.withholdingClaims.push(c)
    group.withholdingClaimTotal += c.total_amount || 0
    if (c.payment_status !== 'paid') group.allPaid = false
  }

  // 計算各群組的 grandTotal
  const employeeGroups = Array.from(groupMap.values()).map(g => ({
    ...g,
    grandTotal: g.salaryTotal + g.expenseTotal + g.withholdingClaimTotal,
  }))

  return { employeeGroups, externalExpenses }
}
