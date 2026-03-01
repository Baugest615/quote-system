/**
 * 勞健保計算工具
 * 根據員工投保級距與費率表，自動計算勞保、健保、勞退費用
 * 支援一般員工與雇主（負責人）兩種計算模式
 */

import supabase from '@/lib/supabase/client'

/**
 * 勞健保計算結果
 */
export interface InsuranceCalculation {
  // 投保資料
  insuranceGrade: number          // 投保級距
  insuranceSalary: number         // 投保薪資

  // 勞保（普通事故）
  laborInsuranceEmployee: number  // 勞保個人負擔
  laborInsuranceCompany: number   // 勞保公司負擔
  laborInsuranceGovernment: number // 勞保政府負擔

  // 就業保險（僅一般員工適用，雇主不適用）
  employmentInsuranceEmployee: number  // 就保個人負擔
  employmentInsuranceCompany: number   // 就保公司負擔
  employmentInsuranceGovernment: number // 就保政府負擔

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
  laborRate: number               // 勞保費率（普通事故）
  employmentInsuranceRate: number // 就業保險費率
  healthRate: number              // 健保費率
  pensionRate: number             // 勞退費率

  // 雇主相關
  isEmployer: boolean             // 是否為雇主
  averageDependents: number | null // 健保眷屬口數（僅雇主）
}

/**
 * 費率表資料結構
 */
interface InsuranceRateTable {
  id: string
  grade: number
  monthly_salary: number
  labor_rate_total: number        // 勞保普通事故總費率 (11.5%)
  labor_rate_employee: number     // 勞保員工負擔 (11.5% × 20%)
  labor_rate_company: number      // 勞保公司負擔 (11.5% × 70%)
  labor_rate_government: number   // 勞保政府負擔 (11.5% × 10%)
  employment_insurance_rate: number // 就業保險費率 (1.0%)，同樣 20/70/10 分攤
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

/** 預設平均眷屬口數（當 DB 查詢失敗時使用） */
const DEFAULT_DEPENDENTS = 0.58

/**
 * 查詢保險設定（預設眷屬口數）
 */
async function getDefaultDependents(targetDate: string): Promise<number> {
  const { data, error } = await supabase
    .from('insurance_settings')
    .select('default_dependents')
    .lte('effective_date', targetDate)
    .or(`expiry_date.is.null,expiry_date.gte.${targetDate}`)
    .order('effective_date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    console.warn('查詢保險設定失敗，使用預設眷屬口數:', DEFAULT_DEPENDENTS)
    return DEFAULT_DEPENDENTS
  }

  return data.default_dependents
}

/**
 * 計算一般員工的勞健保費用
 *
 * 一般員工負擔：
 * - 勞保（普通事故 11.5%）：個人 20%、公司 70%、政府 10%
 * - 就業保險（1.0%）：個人 20%、公司 70%、政府 10%
 * - 健保：個人 30%、公司 60%、政府 10%（依費率表）
 * - 勞退：公司 6%
 * - 職災/就安：公司全額
 */
function calculateRegularInsurance(
  employee: { insurance_grade: number; has_labor_insurance: boolean; has_health_insurance: boolean },
  rt: InsuranceRateTable
): InsuranceCalculation {
  const insuranceSalary = rt.monthly_salary

  const hasLabor = employee.has_labor_insurance ?? true

  // 勞保（普通事故）
  const laborInsuranceEmployee = hasLabor ? Math.round(insuranceSalary * rt.labor_rate_employee) : 0
  const laborInsuranceCompany = hasLabor ? Math.round(insuranceSalary * rt.labor_rate_company) : 0
  const laborInsuranceGovernment = hasLabor ? Math.round(insuranceSalary * rt.labor_rate_government) : 0

  // 就業保險（同樣 20/70/10 分攤比例）
  const eiRate = rt.employment_insurance_rate ?? 0.01
  const employmentInsuranceEmployee = hasLabor ? Math.round(insuranceSalary * eiRate * 0.20) : 0
  const employmentInsuranceCompany = hasLabor ? Math.round(insuranceSalary * eiRate * 0.70) : 0
  const employmentInsuranceGovernment = hasLabor ? Math.round(insuranceSalary * eiRate * 0.10) : 0

  // 健保
  const hasHealth = employee.has_health_insurance ?? true
  const healthInsuranceEmployee = hasHealth ? Math.round(insuranceSalary * rt.health_rate_employee) : 0
  const healthInsuranceCompany = hasHealth ? Math.round(insuranceSalary * rt.health_rate_company) : 0
  const healthInsuranceGovernment = hasHealth ? Math.round(insuranceSalary * rt.health_rate_government) : 0

  // 勞退
  const retirementFund = hasLabor ? Math.round(insuranceSalary * rt.pension_rate_company) : 0
  const retirementFundEmployee = hasLabor ? Math.round(insuranceSalary * rt.pension_rate_employee) : 0

  // 職災 + 就安（公司全額）
  const occupationalInjuryFee = hasLabor ? Math.round(insuranceSalary * rt.occupational_injury_rate) : 0
  const employmentStabilizationFee = hasLabor ? Math.round(insuranceSalary * rt.employment_stabilization_rate) : 0

  return {
    insuranceGrade: employee.insurance_grade,
    insuranceSalary,
    laborInsuranceEmployee,
    laborInsuranceCompany,
    laborInsuranceGovernment,
    employmentInsuranceEmployee,
    employmentInsuranceCompany,
    employmentInsuranceGovernment,
    healthInsuranceEmployee,
    healthInsuranceCompany,
    healthInsuranceGovernment,
    retirementFund,
    retirementFundEmployee,
    occupationalInjuryFee,
    employmentStabilizationFee,
    laborRate: rt.labor_rate_employee,
    employmentInsuranceRate: eiRate,
    healthRate: rt.health_rate_employee,
    pensionRate: rt.pension_rate_company,
    isEmployer: false,
    averageDependents: null,
  }
}

/**
 * 計算雇主（負責人）的勞健保費用
 *
 * 雇主規則：
 * - 勞保（普通事故 11.5%）：個人 100% 全額自付
 * - 就業保險：不適用（雇主無就保）
 * - 健保：投保薪資 × 健保總費率 × (1 + 眷屬口數)
 * - 勞退：不適用
 * - 職災/就安：自付
 */
function calculateEmployerInsurance(
  employee: {
    insurance_grade: number
    has_labor_insurance: boolean
    has_health_insurance: boolean
    dependents_count: number | null
  },
  rt: InsuranceRateTable,
  defaultDependents: number
): InsuranceCalculation {
  const insuranceSalary = rt.monthly_salary
  const dependents = employee.dependents_count ?? defaultDependents

  // 雇主勞保：全額自付（投保薪資 × 勞保普通事故總費率 11.5%）
  // 注意：雇主不適用就業保險，故只算勞保普通事故
  const hasLabor = employee.has_labor_insurance ?? true
  const laborTotal = hasLabor ? Math.round(insuranceSalary * rt.labor_rate_total) : 0

  // 雇主健保：投保薪資 × 健保總費率 × (1 + 眷屬口數)
  const hasHealth = employee.has_health_insurance ?? true
  const healthTotal = hasHealth
    ? Math.round(insuranceSalary * rt.health_rate_total * (1 + dependents))
    : 0

  // 職災/就安：雇主自付
  const occupationalInjuryFee = hasLabor ? Math.round(insuranceSalary * rt.occupational_injury_rate) : 0
  const employmentStabilizationFee = hasLabor ? Math.round(insuranceSalary * rt.employment_stabilization_rate) : 0

  return {
    insuranceGrade: employee.insurance_grade,
    insuranceSalary,

    // 雇主：勞保全部算個人負擔，公司/政府為 0
    laborInsuranceEmployee: laborTotal,
    laborInsuranceCompany: 0,
    laborInsuranceGovernment: 0,

    // 雇主不適用就業保險
    employmentInsuranceEmployee: 0,
    employmentInsuranceCompany: 0,
    employmentInsuranceGovernment: 0,

    // 雇主：健保全部算個人負擔
    healthInsuranceEmployee: healthTotal,
    healthInsuranceCompany: 0,
    healthInsuranceGovernment: 0,

    // 勞退不適用
    retirementFund: 0,
    retirementFundEmployee: 0,

    // 職災/就安自付
    occupationalInjuryFee,
    employmentStabilizationFee,

    // 費率快照（雇主用總費率）
    laborRate: rt.labor_rate_total,
    employmentInsuranceRate: 0,   // 雇主不適用就保
    healthRate: rt.health_rate_total,
    pensionRate: 0,

    isEmployer: true,
    averageDependents: dependents,
  }
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
      .select('insurance_grade, base_salary, name, has_labor_insurance, has_health_insurance, is_employer, dependents_count')
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

    const rt = rateTable as InsuranceRateTable

    // 3. 根據雇主身份分流計算
    if (employee.is_employer) {
      const defaultDependents = await getDefaultDependents(targetDate)
      return calculateEmployerInsurance(employee, rt, defaultDependents)
    } else {
      return calculateRegularInsurance(employee, rt)
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
  const personalInsurance =
    insurance.laborInsuranceEmployee +
    insurance.employmentInsuranceEmployee +
    insurance.healthInsuranceEmployee
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
    insurance.employmentInsuranceCompany +
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
