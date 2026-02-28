/**
 * 勞健保計算工具
 * 根據員工投保級距與費率表，自動計算勞保、健保、勞退費用
 */

import supabase from '@/lib/supabase/client'

/**
 * 勞健保計算結果
 */
export interface InsuranceCalculation {
  // 投保資料
  insuranceGrade: number          // 投保級距
  insuranceSalary: number         // 投保薪資

  // 勞保
  laborInsuranceEmployee: number  // 勞保個人負擔
  laborInsuranceCompany: number   // 勞保公司負擔
  laborInsuranceGovernment: number // 勞保政府負擔

  // 健保
  healthInsuranceEmployee: number  // 健保個人負擔
  healthInsuranceCompany: number   // 健保公司負擔
  healthInsuranceGovernment: number // 健保政府負擔

  // 勞退
  retirementFund: number          // 勞退（公司提繳 6%）
  retirementFundEmployee: number  // 勞退（員工自提，通常為 0）

  // 其他
  occupationalInjuryFee: number   // 職災保險
  employmentStabilizationFee: number // 就業安定費

  // 費率快照（用於記錄到 accounting_payroll）
  laborRate: number               // 勞保費率
  healthRate: number              // 健保費率
  pensionRate: number             // 勞退費率
}

/**
 * 費率表資料結構
 */
interface InsuranceRateTable {
  id: string
  grade: number
  monthly_salary: number
  labor_rate_total: number
  labor_rate_employee: number
  labor_rate_company: number
  labor_rate_government: number
  health_rate_total: number
  health_rate_employee: number
  health_rate_company: number
  health_rate_government: number
  supplementary_rate: number
  pension_rate_company: number
  pension_rate_employee: number
  occupational_injury_rate: number
  employment_stabilization_rate: number
  effective_date: string
  expiry_date: string | null
  note: string | null
}

/**
 * 計算勞健保費用
 * @param employeeId 員工 ID
 * @param targetDate 目標日期（用於查詢歷史費率）預設為今天
 * @returns 勞健保計算結果
 */
export async function calculateInsurance(
  employeeId: string,
  targetDate: string = new Date().toISOString().split('T')[0]
): Promise<InsuranceCalculation | null> {
  try {
    // 1. 取得員工投保級距及投保狀態
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('insurance_grade, base_salary, name, has_labor_insurance, has_health_insurance')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      console.error('查詢員工失敗:', empError)
      return null
    }

    if (!employee.insurance_grade) {
      console.error('員工尚未設定投保級距:', employee.name)
      return null
    }

    // 2. 查詢費率表（依級距與生效日期）
    const { data: rateTable, error: rateError } = await supabase
      .from('insurance_rate_tables')
      .select('*')
      .eq('grade', employee.insurance_grade)
      .lte('effective_date', targetDate)
      .or(`expiry_date.is.null,expiry_date.gte.${targetDate}`)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single()

    if (rateError || !rateTable) {
      console.error('查詢費率表失敗:', rateError)
      return null
    }

    // 3. 計算各項費用（根據投保狀態決定是否計算）
    const insuranceSalary = rateTable.monthly_salary
    const rt = rateTable as InsuranceRateTable

    // 勞保費用 = 投保薪資 × 費率（四捨五入）
    // 如果員工未投保勞保，費用為 0
    const hasLabor = employee.has_labor_insurance ?? true
    const laborInsuranceEmployee = hasLabor ? Math.round(insuranceSalary * rt.labor_rate_employee) : 0
    const laborInsuranceCompany = hasLabor ? Math.round(insuranceSalary * rt.labor_rate_company) : 0
    const laborInsuranceGovernment = hasLabor ? Math.round(insuranceSalary * rt.labor_rate_government) : 0

    // 健保費用
    // 如果員工未投保健保，費用為 0
    const hasHealth = employee.has_health_insurance ?? true
    const healthInsuranceEmployee = hasHealth ? Math.round(insuranceSalary * rt.health_rate_employee) : 0
    const healthInsuranceCompany = hasHealth ? Math.round(insuranceSalary * rt.health_rate_company) : 0
    const healthInsuranceGovernment = hasHealth ? Math.round(insuranceSalary * rt.health_rate_government) : 0

    // 勞退（僅在有投保勞保時計算）
    const retirementFund = hasLabor ? Math.round(insuranceSalary * rt.pension_rate_company) : 0
    const retirementFundEmployee = hasLabor ? Math.round(insuranceSalary * rt.pension_rate_employee) : 0

    // 職災 + 就安（僅在有投保勞保時計算）
    const occupationalInjuryFee = hasLabor ? Math.round(insuranceSalary * rt.occupational_injury_rate) : 0
    const employmentStabilizationFee = hasLabor ? Math.round(insuranceSalary * rt.employment_stabilization_rate) : 0

    return {
      insuranceGrade: employee.insurance_grade,
      insuranceSalary,

      laborInsuranceEmployee,
      laborInsuranceCompany,
      laborInsuranceGovernment,

      healthInsuranceEmployee,
      healthInsuranceCompany,
      healthInsuranceGovernment,

      retirementFund,
      retirementFundEmployee,

      occupationalInjuryFee,
      employmentStabilizationFee,

      // 費率快照
      laborRate: rt.labor_rate_employee,
      healthRate: rt.health_rate_employee,
      pensionRate: rt.pension_rate_company,
    }
  } catch (error) {
    console.error('計算勞健保失敗:', error)
    return null
  }
}

/**
 * 計算薪資總額（實領薪資）
 * @param baseSalary 本薪
 * @param mealAllowance 伙食津貼
 * @param bonus 獎金
 * @param deduction 代扣
 * @param insurance 勞健保計算結果
 * @returns 實領薪資
 */
export function calculateNetSalary(
  baseSalary: number,
  mealAllowance: number,
  bonus: number,
  deduction: number,
  insurance: InsuranceCalculation
): number {
  const grossSalary = baseSalary + mealAllowance + bonus
  const personalInsurance = insurance.laborInsuranceEmployee + insurance.healthInsuranceEmployee
  return grossSalary - deduction - personalInsurance
}

/**
 * 計算公司總支出
 * @param insurance 勞健保計算結果
 * @returns 公司總支出（勞健保 + 勞退 + 職災 + 就安）
 */
export function calculateCompanyTotal(insurance: InsuranceCalculation): number {
  return (
    insurance.laborInsuranceCompany +
    insurance.healthInsuranceCompany +
    insurance.retirementFund +
    insurance.occupationalInjuryFee +
    insurance.employmentStabilizationFee
  )
}

/**
 * 格式化金額（加上千分位）
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
  }).format(amount)
}

/**
 * 格式化費率（百分比）
 */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}
