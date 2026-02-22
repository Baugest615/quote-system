import { groupEmployeeData } from '../groupEmployeeData'
import type { GroupEmployeeDataInput } from '../groupEmployeeData'
import type {
  AccountingExpense,
  AccountingPayroll,
  Employee,
  ExpenseClaim,
} from '@/types/custom.types'

// ==================== 測試用工廠函式 ====================

/** 建立最小化的 Employee 物件 */
function makeEmployee(overrides: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    user_id: null,
    id_number: null,
    birth_date: null,
    gender: null,
    phone: null,
    email: null,
    address: null,
    emergency_contact: null,
    emergency_phone: null,
    employee_number: null,
    hire_date: '2026-01-01',
    resignation_date: null,
    position: null,
    department: null,
    employment_type: '全職',
    status: '在職',
    base_salary: 0,
    meal_allowance: 0,
    insurance_grade: null,
    has_labor_insurance: true,
    has_health_insurance: true,
    bank_name: null,
    bank_branch: null,
    bank_account: null,
    note: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Employee
}

/** 建立最小化的 AccountingPayroll 物件 */
function makePayroll(overrides: Partial<AccountingPayroll> & { id: string }): AccountingPayroll {
  return {
    year: 2026,
    payment_date: null,
    salary_month: '2026-01',
    employee_id: null,
    employee_name: '未知',
    base_salary: 0,
    meal_allowance: 0,
    bonus: 0,
    deduction: 0,
    labor_insurance_personal: 0,
    health_insurance_personal: 0,
    personal_total: 0,
    net_salary: 0,
    labor_insurance_company: 0,
    health_insurance_company: 0,
    severance_fund: 0,
    retirement_fund: 0,
    company_total: 0,
    insurance_grade: null,
    insurance_salary: null,
    labor_rate: null,
    health_rate: null,
    pension_rate: null,
    note: null,
    payment_status: 'unpaid',
    paid_at: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AccountingPayroll
}

/** 建立最小化的 AccountingExpense 物件 */
function makeExpense(overrides: Partial<AccountingExpense> & { id: string }): AccountingExpense {
  return {
    year: 2026,
    expense_month: '2026-01',
    expense_type: '營運費用',
    accounting_subject: null,
    amount: 0,
    tax_amount: 0,
    total_amount: 0,
    vendor_name: null,
    payment_date: null,
    invoice_date: null,
    invoice_number: null,
    project_name: null,
    note: null,
    payment_request_id: null,
    expense_claim_id: null,
    payment_confirmation_id: null,
    payment_target_type: null,
    payment_status: 'unpaid',
    paid_at: null,
    submitted_by: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AccountingExpense
}

/** 建立最小化的 ExpenseClaim 物件 */
function makeClaim(overrides: Partial<ExpenseClaim> & { id: string }): ExpenseClaim {
  return {
    year: 2026,
    claim_month: '2026-01',
    withholding_month: null,
    expense_type: '代扣代繳',
    accounting_subject: null,
    amount: 0,
    tax_amount: 0,
    total_amount: 0,
    vendor_name: null,
    project_name: null,
    invoice_number: null,
    invoice_date: null,
    note: null,
    status: 'approved',
    payment_target_type: null,
    submitted_by: null,
    submitted_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    attachment_file_path: null,
    payment_status: 'unpaid',
    paid_at: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as ExpenseClaim
}

// ==================== 測試案例 ====================

describe('groupEmployeeData — 員工分組邏輯', () => {
  const emptyInput: GroupEmployeeDataInput = {
    expenses: [],
    payroll: [],
    employees: [],
    withholdingClaims: [],
  }

  describe('空資料處理', () => {
    it('全空資料應回傳空分組與空外部支出', () => {
      const result = groupEmployeeData(emptyInput)
      expect(result.employeeGroups).toHaveLength(0)
      expect(result.externalExpenses).toHaveLength(0)
    })
  })

  describe('依 employee_id 分組', () => {
    it('薪資應依 employee_id 正確分組', () => {
      const emp1 = makeEmployee({ id: 'emp-1', name: '張三' })
      const emp2 = makeEmployee({ id: 'emp-2', name: '李四' })
      const p1 = makePayroll({ id: 'p-1', employee_id: 'emp-1', employee_name: '張三', net_salary: 50000 })
      const p2 = makePayroll({ id: 'p-2', employee_id: 'emp-2', employee_name: '李四', net_salary: 60000 })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp1, emp2],
        payroll: [p1, p2],
      })

      expect(result.employeeGroups).toHaveLength(2)

      const group1 = result.employeeGroups.find(g => g.employeeId === 'emp-1')
      expect(group1).toBeDefined()
      expect(group1!.employeeName).toBe('張三')
      expect(group1!.salaryTotal).toBe(50000)
      expect(group1!.payroll).toBe(p1)

      const group2 = result.employeeGroups.find(g => g.employeeId === 'emp-2')
      expect(group2).toBeDefined()
      expect(group2!.employeeName).toBe('李四')
      expect(group2!.salaryTotal).toBe(60000)
    })

    it('員工支出應依 submitted_by 對照 user_id 歸入正確員工', () => {
      const emp1 = makeEmployee({ id: 'emp-1', name: '張三', user_id: 'user-A' })
      const expense = makeExpense({
        id: 'e-1',
        payment_target_type: 'employee',
        submitted_by: 'user-A',
        total_amount: 2000,
      })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp1],
        expenses: [expense],
      })

      expect(result.employeeGroups).toHaveLength(1)
      expect(result.employeeGroups[0].employeeId).toBe('emp-1')
      expect(result.employeeGroups[0].expenses).toHaveLength(1)
      expect(result.employeeGroups[0].expenseTotal).toBe(2000)
    })

    it('薪資和支出應歸入同一員工群組', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三', user_id: 'user-A' })
      const p = makePayroll({ id: 'p-1', employee_id: 'emp-1', net_salary: 50000 })
      const expense = makeExpense({
        id: 'e-1',
        payment_target_type: 'employee',
        submitted_by: 'user-A',
        total_amount: 3000,
      })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
        payroll: [p],
        expenses: [expense],
      })

      expect(result.employeeGroups).toHaveLength(1)
      const group = result.employeeGroups[0]
      expect(group.salaryTotal).toBe(50000)
      expect(group.expenseTotal).toBe(3000)
      expect(group.grandTotal).toBe(53000)
    })
  })

  describe('外部支出歸類', () => {
    it('非員工類型的支出應歸為外部支出', () => {
      const vendorExpense = makeExpense({ id: 'e-1', payment_target_type: 'vendor', total_amount: 10000 })
      const kolExpense = makeExpense({ id: 'e-2', payment_target_type: 'kol', total_amount: 20000 })

      const result = groupEmployeeData({
        ...emptyInput,
        expenses: [vendorExpense, kolExpense],
      })

      expect(result.externalExpenses).toHaveLength(2)
      expect(result.employeeGroups).toHaveLength(0)
    })

    it('null payment_target_type 的支出也應歸為外部支出', () => {
      const expense = makeExpense({ id: 'e-1', payment_target_type: null, total_amount: 5000 })

      const result = groupEmployeeData({
        ...emptyInput,
        expenses: [expense],
      })

      expect(result.externalExpenses).toHaveLength(1)
      expect(result.employeeGroups).toHaveLength(0)
    })
  })

  describe('代扣代繳報帳歸類', () => {
    it('代扣代繳報帳應依 submitted_by 歸入對應員工', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三', user_id: 'user-A' })
      const claim = makeClaim({
        id: 'c-1',
        submitted_by: 'user-A',
        total_amount: 1500,
      })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
        withholdingClaims: [claim],
      })

      expect(result.employeeGroups).toHaveLength(1)
      expect(result.employeeGroups[0].withholdingClaims).toHaveLength(1)
      expect(result.employeeGroups[0].withholdingClaimTotal).toBe(1500)
    })
  })

  describe('grandTotal 計算', () => {
    it('grandTotal 應為 salaryTotal + expenseTotal + withholdingClaimTotal', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三', user_id: 'user-A' })
      const p = makePayroll({ id: 'p-1', employee_id: 'emp-1', net_salary: 50000 })
      const expense = makeExpense({
        id: 'e-1',
        payment_target_type: 'employee',
        submitted_by: 'user-A',
        total_amount: 3000,
      })
      const claim = makeClaim({
        id: 'c-1',
        submitted_by: 'user-A',
        total_amount: 1500,
      })

      const result = groupEmployeeData({
        employees: [emp],
        payroll: [p],
        expenses: [expense],
        withholdingClaims: [claim],
      })

      expect(result.employeeGroups).toHaveLength(1)
      const group = result.employeeGroups[0]
      expect(group.salaryTotal).toBe(50000)
      expect(group.expenseTotal).toBe(3000)
      expect(group.withholdingClaimTotal).toBe(1500)
      expect(group.grandTotal).toBe(54500)
    })

    it('只有薪資時 grandTotal 等於 salaryTotal', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三' })
      const p = makePayroll({ id: 'p-1', employee_id: 'emp-1', net_salary: 45000 })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
        payroll: [p],
      })

      expect(result.employeeGroups[0].grandTotal).toBe(45000)
    })
  })

  describe('allPaid 狀態判斷', () => {
    it('所有項目皆已付款時 allPaid 應為 true', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三', user_id: 'user-A' })
      const p = makePayroll({ id: 'p-1', employee_id: 'emp-1', net_salary: 50000, payment_status: 'paid' })
      const expense = makeExpense({
        id: 'e-1',
        payment_target_type: 'employee',
        submitted_by: 'user-A',
        total_amount: 3000,
        payment_status: 'paid',
      })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
        payroll: [p],
        expenses: [expense],
      })

      expect(result.employeeGroups[0].allPaid).toBe(true)
    })

    it('有任一項目未付款時 allPaid 應為 false', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三', user_id: 'user-A' })
      const p = makePayroll({ id: 'p-1', employee_id: 'emp-1', net_salary: 50000, payment_status: 'paid' })
      const expense = makeExpense({
        id: 'e-1',
        payment_target_type: 'employee',
        submitted_by: 'user-A',
        total_amount: 3000,
        payment_status: 'unpaid',
      })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
        payroll: [p],
        expenses: [expense],
      })

      expect(result.employeeGroups[0].allPaid).toBe(false)
    })

    it('薪資未付款時 allPaid 應為 false', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三' })
      const p = makePayroll({ id: 'p-1', employee_id: 'emp-1', net_salary: 50000, payment_status: 'unpaid' })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
        payroll: [p],
      })

      expect(result.employeeGroups[0].allPaid).toBe(false)
    })

    it('代扣代繳未付款時 allPaid 應為 false', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三', user_id: 'user-A' })
      const claim = makeClaim({
        id: 'c-1',
        submitted_by: 'user-A',
        total_amount: 1000,
        payment_status: 'unpaid',
      })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
        withholdingClaims: [claim],
      })

      expect(result.employeeGroups[0].allPaid).toBe(false)
    })

    it('空分組（僅有員工無資料）不會產生群組', () => {
      const emp = makeEmployee({ id: 'emp-1', name: '張三' })

      const result = groupEmployeeData({
        ...emptyInput,
        employees: [emp],
      })

      // 沒有薪資也沒有支出，不應產生群組
      expect(result.employeeGroups).toHaveLength(0)
    })
  })

  describe('找不到員工的支出', () => {
    it('submitted_by 找不到對應員工時應用 fallback ID', () => {
      const expense = makeExpense({
        id: 'e-1',
        payment_target_type: 'employee',
        submitted_by: 'unknown-user',
        total_amount: 5000,
        vendor_name: '不明員工',
      })

      const result = groupEmployeeData({
        ...emptyInput,
        expenses: [expense],
      })

      expect(result.employeeGroups).toHaveLength(1)
      expect(result.employeeGroups[0].employeeId).toBe('unknown-unknown-user')
      expect(result.employeeGroups[0].expenseTotal).toBe(5000)
    })
  })
})
