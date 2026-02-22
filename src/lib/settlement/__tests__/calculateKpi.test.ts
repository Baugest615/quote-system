import { calculateKpi } from '../calculateKpi'
import type { CalculateKpiInput } from '../calculateKpi'
import type { AccountingExpense, AccountingPayroll, ExpenseClaim } from '@/types/custom.types'

// ==================== 測試用工廠函式 ====================

/** 建立最小化的 AccountingPayroll 物件 */
function makePayroll(overrides: Partial<AccountingPayroll> & { id: string }): AccountingPayroll {
  return {
    year: 2026,
    payment_date: null,
    salary_month: '2026-01',
    employee_id: null,
    employee_name: '測試員工',
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

describe('calculateKpi — KPI 計算', () => {
  const emptyInput: CalculateKpiInput = {
    expenses: [],
    payroll: [],
    withholdingClaims: [],
  }

  describe('空資料處理', () => {
    it('全空資料應回傳全零 KPI', () => {
      const result = calculateKpi(emptyInput)
      expect(result.kpiSalaryTotal).toBe(0)
      expect(result.kpiEmployeeExpenseTotal).toBe(0)
      expect(result.kpiExternalTotal).toBe(0)
      expect(result.kpiGrandTotal).toBe(0)
      expect(result.kpiUnpaidTotal).toBe(0)
    })
  })

  describe('薪資合計計算', () => {
    it('應正確加總所有薪資的 net_salary', () => {
      const payroll = [
        makePayroll({ id: 'p-1', net_salary: 50000 }),
        makePayroll({ id: 'p-2', net_salary: 60000 }),
        makePayroll({ id: 'p-3', net_salary: 45000 }),
      ]

      const result = calculateKpi({ ...emptyInput, payroll })
      expect(result.kpiSalaryTotal).toBe(155000)
    })

    it('net_salary 為 null 時應視為 0', () => {
      const payroll = [
        makePayroll({ id: 'p-1', net_salary: 50000 }),
        makePayroll({ id: 'p-2', net_salary: 0 }),
      ]

      const result = calculateKpi({ ...emptyInput, payroll })
      expect(result.kpiSalaryTotal).toBe(50000)
    })
  })

  describe('員工支出合計計算', () => {
    it('應包含 employee 類型支出與代扣代繳報帳', () => {
      const expenses = [
        makeExpense({ id: 'e-1', payment_target_type: 'employee', total_amount: 3000 }),
        makeExpense({ id: 'e-2', payment_target_type: 'employee', total_amount: 2000 }),
      ]
      const claims = [
        makeClaim({ id: 'c-1', total_amount: 1500 }),
      ]

      const result = calculateKpi({ ...emptyInput, expenses, withholdingClaims: claims })
      expect(result.kpiEmployeeExpenseTotal).toBe(6500) // 3000 + 2000 + 1500
    })

    it('非 employee 類型支出不應計入員工支出', () => {
      const expenses = [
        makeExpense({ id: 'e-1', payment_target_type: 'vendor', total_amount: 10000 }),
      ]

      const result = calculateKpi({ ...emptyInput, expenses })
      expect(result.kpiEmployeeExpenseTotal).toBe(0)
    })
  })

  describe('外部廠商支出合計計算', () => {
    it('應包含非 employee 類型的支出', () => {
      const expenses = [
        makeExpense({ id: 'e-1', payment_target_type: 'vendor', total_amount: 10000 }),
        makeExpense({ id: 'e-2', payment_target_type: 'kol', total_amount: 20000 }),
        makeExpense({ id: 'e-3', payment_target_type: null, total_amount: 5000 }),
      ]

      const result = calculateKpi({ ...emptyInput, expenses })
      expect(result.kpiExternalTotal).toBe(35000) // 10000 + 20000 + 5000
    })

    it('employee 類型支出不應計入外部支出', () => {
      const expenses = [
        makeExpense({ id: 'e-1', payment_target_type: 'employee', total_amount: 3000 }),
      ]

      const result = calculateKpi({ ...emptyInput, expenses })
      expect(result.kpiExternalTotal).toBe(0)
    })
  })

  describe('總計計算', () => {
    it('kpiGrandTotal 應為薪資 + 員工支出 + 外部支出', () => {
      const payroll = [makePayroll({ id: 'p-1', net_salary: 50000 })]
      const expenses = [
        makeExpense({ id: 'e-1', payment_target_type: 'employee', total_amount: 3000 }),
        makeExpense({ id: 'e-2', payment_target_type: 'vendor', total_amount: 10000 }),
      ]
      const claims = [makeClaim({ id: 'c-1', total_amount: 1500 })]

      const result = calculateKpi({ payroll, expenses, withholdingClaims: claims })

      // 薪資=50000, 員工支出=3000+1500=4500, 外部=10000
      expect(result.kpiGrandTotal).toBe(64500)
    })
  })

  describe('未付款合計計算', () => {
    it('只計入 payment_status 非 paid 的金額', () => {
      const payroll = [
        makePayroll({ id: 'p-1', net_salary: 50000, payment_status: 'paid' }),
        makePayroll({ id: 'p-2', net_salary: 60000, payment_status: 'unpaid' }),
      ]
      const expenses = [
        makeExpense({ id: 'e-1', payment_target_type: 'vendor', total_amount: 10000, payment_status: 'paid' }),
        makeExpense({ id: 'e-2', payment_target_type: 'employee', total_amount: 5000, payment_status: 'unpaid' }),
      ]
      const claims = [
        makeClaim({ id: 'c-1', total_amount: 2000, payment_status: 'paid' }),
        makeClaim({ id: 'c-2', total_amount: 3000, payment_status: 'unpaid' }),
      ]

      const result = calculateKpi({ payroll, expenses, withholdingClaims: claims })

      // 未付：薪資 60000 + 支出 5000 + 代扣 3000 = 68000
      expect(result.kpiUnpaidTotal).toBe(68000)
    })

    it('全部已付款時未付款合計應為 0', () => {
      const payroll = [makePayroll({ id: 'p-1', net_salary: 50000, payment_status: 'paid' })]
      const expenses = [makeExpense({ id: 'e-1', total_amount: 10000, payment_status: 'paid' })]
      const claims = [makeClaim({ id: 'c-1', total_amount: 2000, payment_status: 'paid' })]

      const result = calculateKpi({ payroll, expenses, withholdingClaims: claims })
      expect(result.kpiUnpaidTotal).toBe(0)
    })

    it('全部未付款時未付款合計應等於總計', () => {
      const payroll = [makePayroll({ id: 'p-1', net_salary: 50000, payment_status: 'unpaid' })]
      const expenses = [
        makeExpense({ id: 'e-1', payment_target_type: 'employee', total_amount: 5000, payment_status: 'unpaid' }),
        makeExpense({ id: 'e-2', payment_target_type: 'vendor', total_amount: 10000, payment_status: 'unpaid' }),
      ]
      const claims = [makeClaim({ id: 'c-1', total_amount: 2000, payment_status: 'unpaid' })]

      const result = calculateKpi({ payroll, expenses, withholdingClaims: claims })
      expect(result.kpiUnpaidTotal).toBe(result.kpiGrandTotal)
    })
  })

  describe('邊界值測試', () => {
    it('single 薪資記錄應正確計算', () => {
      const payroll = [makePayroll({ id: 'p-1', net_salary: 1 })]
      const result = calculateKpi({ ...emptyInput, payroll })
      expect(result.kpiSalaryTotal).toBe(1)
      expect(result.kpiGrandTotal).toBe(1)
    })

    it('金額為 0 的記錄不應影響結果', () => {
      const payroll = [makePayroll({ id: 'p-1', net_salary: 0 })]
      const expenses = [makeExpense({ id: 'e-1', total_amount: 0 })]
      const claims = [makeClaim({ id: 'c-1', total_amount: 0 })]

      const result = calculateKpi({ payroll, expenses, withholdingClaims: claims })
      expect(result.kpiGrandTotal).toBe(0)
      expect(result.kpiUnpaidTotal).toBe(0)
    })

    it('大量記錄應正確加總', () => {
      const payroll = Array.from({ length: 100 }, (_, i) =>
        makePayroll({ id: `p-${i}`, net_salary: 1000, payment_status: 'unpaid' })
      )

      const result = calculateKpi({ ...emptyInput, payroll })
      expect(result.kpiSalaryTotal).toBe(100000)
      expect(result.kpiGrandTotal).toBe(100000)
      expect(result.kpiUnpaidTotal).toBe(100000)
    })
  })
})
