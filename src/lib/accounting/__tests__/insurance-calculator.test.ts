import {
  calculateNetSalary,
  calculateCompanyTotal,
  formatCurrency,
  formatRate,
  calculateInsurance,
  type InsuranceCalculation,
} from '../insurance-calculator'

// ==================== Mock Insurance 資料 ====================

/** 建立一般員工的保費計算結果 */
function makeRegularInsurance(overrides: Partial<InsuranceCalculation> = {}): InsuranceCalculation {
  return {
    insuranceGrade: 13,
    insuranceSalary: 36300,
    laborInsuranceEmployee: 835,
    laborInsuranceCompany: 2920,
    laborInsuranceGovernment: 417,
    employmentInsuranceEmployee: 73,
    employmentInsuranceCompany: 254,
    employmentInsuranceGovernment: 36,
    healthInsuranceEmployee: 530,
    healthInsuranceCompany: 1060,
    healthInsuranceGovernment: 353,
    retirementFund: 2178,
    retirementFundEmployee: 0,
    occupationalInjuryFee: 73,
    employmentStabilizationFee: 0,
    laborRate: 0.023,
    employmentInsuranceRate: 0.01,
    healthRate: 0.0146,
    pensionRate: 0.06,
    isEmployer: false,
    averageDependents: null,
    ...overrides,
  }
}

/** 建立雇主的保費計算結果 */
function makeEmployerInsurance(overrides: Partial<InsuranceCalculation> = {}): InsuranceCalculation {
  return {
    insuranceGrade: 25,
    insuranceSalary: 45800,
    laborInsuranceEmployee: 5267, // 全額自付
    laborInsuranceCompany: 0,
    laborInsuranceGovernment: 0,
    employmentInsuranceEmployee: 0, // 雇主無就保
    employmentInsuranceCompany: 0,
    employmentInsuranceGovernment: 0,
    healthInsuranceEmployee: 4500, // 含眷屬
    healthInsuranceCompany: 0,
    healthInsuranceGovernment: 0,
    retirementFund: 0, // 雇主無勞退
    retirementFundEmployee: 0,
    occupationalInjuryFee: 92,
    employmentStabilizationFee: 0,
    laborRate: 0.115,
    employmentInsuranceRate: 0,
    healthRate: 0.0517,
    pensionRate: 0,
    isEmployer: true,
    averageDependents: 0.58,
    ...overrides,
  }
}

// ==================== calculateNetSalary ====================

describe('calculateNetSalary — 實領薪資計算', () => {
  it('基本薪資計算', () => {
    const insurance = makeRegularInsurance()
    // grossSalary = 36300 + 2400 + 0 = 38700
    // personalInsurance = 835 + 73 + 530 = 1438
    // net = 38700 - 0 - 1438 = 37262
    const net = calculateNetSalary(36300, 2400, 0, 0, insurance)
    expect(net).toBe(37262)
  })

  it('含獎金和代扣', () => {
    const insurance = makeRegularInsurance()
    // grossSalary = 36300 + 2400 + 5000 = 43700
    // personalInsurance = 1438
    // net = 43700 - 1000 - 1438 = 41262
    const net = calculateNetSalary(36300, 2400, 5000, 1000, insurance)
    expect(net).toBe(41262)
  })

  it('雇主薪資計算（健保+勞保全額自付）', () => {
    const insurance = makeEmployerInsurance()
    // grossSalary = 45800 + 2400 + 0 = 48200
    // personalInsurance = 5267 + 0 + 4500 = 9767
    // net = 48200 - 0 - 9767 = 38433
    const net = calculateNetSalary(45800, 2400, 0, 0, insurance)
    expect(net).toBe(38433)
  })

  it('零薪資', () => {
    const insurance = makeRegularInsurance({
      laborInsuranceEmployee: 0,
      employmentInsuranceEmployee: 0,
      healthInsuranceEmployee: 0,
    })
    expect(calculateNetSalary(0, 0, 0, 0, insurance)).toBe(0)
  })
})

// ==================== calculateCompanyTotal ====================

describe('calculateCompanyTotal — 公司總支出', () => {
  it('一般員工公司負擔', () => {
    const insurance = makeRegularInsurance()
    // company = 2920 + 254 + 1060 + 2178 + 73 + 0 = 6485
    const total = calculateCompanyTotal(insurance)
    expect(total).toBe(6485)
  })

  it('雇主公司負擔為 0（全部算個人）', () => {
    const insurance = makeEmployerInsurance()
    // company = 0 + 0 + 0 + 0 + 92 + 0 = 92
    const total = calculateCompanyTotal(insurance)
    expect(total).toBe(92)
  })

  it('所有費用為 0', () => {
    const insurance = makeRegularInsurance({
      laborInsuranceCompany: 0,
      employmentInsuranceCompany: 0,
      healthInsuranceCompany: 0,
      retirementFund: 0,
      occupationalInjuryFee: 0,
      employmentStabilizationFee: 0,
    })
    expect(calculateCompanyTotal(insurance)).toBe(0)
  })
})

// ==================== formatCurrency ====================

describe('formatCurrency — 金額格式化', () => {
  it('千分位格式', () => {
    const result = formatCurrency(1234567)
    // TWD 格式：$1,234,567 或 NT$1,234,567
    expect(result).toMatch(/1,234,567/)
  })

  it('零元', () => {
    expect(formatCurrency(0)).toMatch(/0/)
  })

  it('負數', () => {
    const result = formatCurrency(-5000)
    expect(result).toMatch(/5,000/)
  })
})

// ==================== formatRate ====================

describe('formatRate — 費率格式化', () => {
  it('小數轉百分比', () => {
    expect(formatRate(0.10)).toBe('10.00%')
    expect(formatRate(0.0211)).toBe('2.11%')
    expect(formatRate(0.06)).toBe('6.00%')
  })

  it('零費率', () => {
    expect(formatRate(0)).toBe('0.00%')
  })

  it('100%', () => {
    expect(formatRate(1.0)).toBe('100.00%')
  })
})

// ==================== calculateInsurance (with mocked Supabase) ====================

describe('calculateInsurance — Supabase 整合測試', () => {
  const mockSupabase = jest.requireMock('@/lib/supabase/client').default

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('員工未設定投保級距 → 返回 null', async () => {
    // Mock: employee 有資料但 insurance_grade = null
    mockSupabase.from.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          insurance_grade: null,
          base_salary: 36300,
          name: '測試員工',
          has_labor_insurance: true,
          has_health_insurance: true,
          is_employer: false,
          dependents_count: null,
        },
        error: null,
      }),
    }))

    const result = await calculateInsurance('emp-1')
    expect(result).toBeNull()
  })

  it('員工不存在 → 返回 null', async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      }),
    }))

    const result = await calculateInsurance('nonexistent')
    expect(result).toBeNull()
  })
})
