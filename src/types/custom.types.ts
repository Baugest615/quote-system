// src/types/custom.types.ts
// 自定義業務邏輯類型定義（與 Supabase 自動生成的類型分離）

import { Database } from './database.types'

// ===== 權限相關類型 =====
export type UserRole = Database["public"]["Enums"]["user_role"]
export type PagePermission = Database["public"]["Tables"]["page_permissions"]["Row"]

// 頁面權限配置
export interface PageConfig {
  key: string
  name: string
  allowedRoles: UserRole[]
  allowedFunctions: string[]
  route: string
  icon?: string
}

// 權限檢查結果
export interface PermissionCheckResult {
  hasAccess: boolean
  allowedFunctions: string[]
  userRole: UserRole | null
}

// 權限檢查輔助函數類型
export type PermissionChecker = {
  checkPageAccess: (pageKey: string, userRole?: UserRole) => boolean
  checkFunctionAccess: (pageKey: string, functionName: string, userRole?: UserRole) => boolean
  getAllowedPages: (userRole: UserRole) => PageConfig[]
  hasRole: (requiredRole: UserRole, userRole?: UserRole) => boolean
}

// ===== 常量定義 =====
export const USER_ROLES = {
  ADMIN: 'Admin' as const,
  EDITOR: 'Editor' as const,
  MEMBER: 'Member' as const,
} as const

export const PAGE_KEYS = {
  DASHBOARD: 'dashboard',
  CLIENTS: 'clients',
  KOLS: 'kols',
  QUOTES: 'quotes',
  REPORTS: 'reports',
  PENDING_PAYMENTS: 'pending_payments',
  PAYMENT_REQUESTS: 'payment_requests',
  CONFIRMED_PAYMENTS: 'confirmed_payments',
  SETTINGS: 'settings',
  PROJECTS: 'projects',
  EXPENSE_CLAIMS: 'expense_claims',
  ACCOUNTING: 'accounting',
  MY_SALARY: 'my_salary',
} as const

// 頁面權限配置
export const PAGE_PERMISSIONS: Record<string, PageConfig> = {
  [PAGE_KEYS.DASHBOARD]: {
    key: PAGE_KEYS.DASHBOARD,
    name: '儀表板',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['view_statistics', 'view_reports'],
    route: '/dashboard',
    icon: 'BarChart3'
  },
  [PAGE_KEYS.CLIENTS]: {
    key: PAGE_KEYS.CLIENTS,
    name: '客戶管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'export'],
    route: '/dashboard/clients',
    icon: 'Users'
  },
  [PAGE_KEYS.KOLS]: {
    key: PAGE_KEYS.KOLS,
    name: 'KOL/服務管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'export'],
    route: '/dashboard/kols',
    icon: 'Star'
  },
  [PAGE_KEYS.QUOTES]: {
    key: PAGE_KEYS.QUOTES,
    name: '報價單管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'export_pdf'],
    route: '/dashboard/quotes',
    icon: 'FileText'
  },
  [PAGE_KEYS.REPORTS]: {
    key: PAGE_KEYS.REPORTS,
    name: '報表分析',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['view', 'export', 'analysis'],
    route: '/dashboard/reports',
    icon: 'TrendingUp'
  },
  [PAGE_KEYS.PENDING_PAYMENTS]: {
    key: PAGE_KEYS.PENDING_PAYMENTS,
    name: '待請款專案管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'submit'],
    route: '/dashboard/pending-payments',
    icon: 'Clock'
  },
  [PAGE_KEYS.PAYMENT_REQUESTS]: {
    key: PAGE_KEYS.PAYMENT_REQUESTS,
    name: '請款申請',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR],
    allowedFunctions: ['review', 'approve', 'reject', 'batch_process'],
    route: '/dashboard/payment-requests',
    icon: 'CheckCircle'
  },
  [PAGE_KEYS.CONFIRMED_PAYMENTS]: {
    key: PAGE_KEYS.CONFIRMED_PAYMENTS,
    name: '已確認請款清單',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR],
    allowedFunctions: ['view', 'export', 'return'],
    route: '/dashboard/confirmed-payments',
    icon: 'FileCheck'
  },
  [PAGE_KEYS.SETTINGS]: {
    key: PAGE_KEYS.SETTINGS,
    name: '系統設定',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['view', 'update_profile', 'manage_users'],
    route: '/dashboard/settings',
    icon: 'Settings'
  },
  [PAGE_KEYS.PROJECTS]: {
    key: PAGE_KEYS.PROJECTS,
    name: '專案進度',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete'],
    route: '/dashboard/projects',
    icon: 'FolderKanban'
  },
  [PAGE_KEYS.EXPENSE_CLAIMS]: {
    key: PAGE_KEYS.EXPENSE_CLAIMS,
    name: '個人請款申請',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'submit'],
    route: '/dashboard/expense-claims',
    icon: 'Receipt'
  },
  [PAGE_KEYS.ACCOUNTING]: {
    key: PAGE_KEYS.ACCOUNTING,
    name: '帳務管理',
    allowedRoles: [USER_ROLES.ADMIN],
    allowedFunctions: ['view', 'create', 'update', 'delete', 'export'],
    route: '/dashboard/accounting',
    icon: 'BookOpen'
  },
  [PAGE_KEYS.MY_SALARY]: {
    key: PAGE_KEYS.MY_SALARY,
    name: '我的薪資',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['view'],
    route: '/dashboard/my-salary',
    icon: 'User'
  },
}

// ===== 業務邏輯相關類型 =====

// 聯絡人類型
export interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  role?: string
}

// 檔案附件類型
export interface FileAttachment {
  name: string
  url: string
  path: string
  uploadedAt: string
  size: number
  type?: string
}

// 常量定義（匹配資料庫枚舉值）
export const Constants = {
  public: {
    Enums: {
      payment_method: ["電匯", "ATM轉帳"],
      quotation_status: ["草稿", "待簽約", "已簽約", "已歸檔"],
      user_role: ["Admin", "Editor", "Member"],
    },
  },
} as const

// ===== 專案特定的組合類型 =====

// 帶有詳細資訊的客戶類型
export type ClientWithDetails = Database['public']['Tables']['clients']['Row'] & {
  quotations?: Database['public']['Tables']['quotations']['Row'][]
}

// 帶有服務的 KOL 類型
export type KolWithServices = Database['public']['Tables']['kols']['Row'] & {
  kol_services: (Database['public']['Tables']['kol_services']['Row'] & {
    service_types: Database['public']['Tables']['service_types']['Row'] | null
  })[]
}

// 帶有項目的報價單類型
export type QuotationWithItems = Database['public']['Tables']['quotations']['Row'] & {
  quotation_items: Database['public']['Tables']['quotation_items']['Row'][]
  clients: Database['public']['Tables']['clients']['Row'] | null
}

// 表單相關類型
export interface FormValidationResult {
  isValid: boolean
  errors: Record<string, string[]>
}

// API 回應類型
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ===== 專案進度管理相關類型 =====

export const PROJECT_TYPES = ['專案', '經紀'] as const
export type ProjectType = typeof PROJECT_TYPES[number]

export const PROJECT_STATUS = ['洽談中', '執行中', '結案中', '關案'] as const
export type ProjectStatus = typeof PROJECT_STATUS[number]

export interface Project {
  id: string
  client_id: string | null
  client_name: string
  project_name: string
  project_type: ProjectType
  budget_with_tax: number
  notes: string | null
  status: ProjectStatus
  quotation_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectNote {
  id: string
  project_id: string
  content: string
  created_by: string | null
  author_email: string
  created_at: string
}

// ===== 帳務管理相關類型 =====

export const EXPENSE_TYPES = [
  '勞務報酬', '外包服務', '專案費用', '員工代墊',
  '營運費用', '其他支出', '沖帳免付', '代扣代繳',
] as const
export type ExpenseType = typeof EXPENSE_TYPES[number]

export const ACCOUNTING_SUBJECTS = [
  '進貨', '薪資支出', '租金支出', '旅費支出', '運費支出',
  '文具用品', '餐費', '交通費用', '廣告費用', '郵電費用',
  '修繕費用', '職工福利', '勞健保', '交際費用', '伙食費',
  '其他費用', '匯費',
  '勞務成本', '外包費用', '軟體訂閱', '水電瓦斯', '保險費用', '稅捐規費', '折舊攤銷',
] as const
export type AccountingSubject = typeof ACCOUNTING_SUBJECTS[number]

// ===== 付款狀態 =====
export const PAYMENT_STATUS = ['unpaid', 'paid'] as const
export type PaymentStatus = typeof PAYMENT_STATUS[number]

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: '未付',
  paid: '已付',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: 'bg-warning/20 text-warning',
  paid: 'bg-success/20 text-success',
}

// ===== 付款對象類型 =====
export const PAYMENT_TARGET_TYPES = ['kol', 'vendor', 'employee', 'other'] as const
export type PaymentTargetType = typeof PAYMENT_TARGET_TYPES[number]

export const PAYMENT_TARGET_LABELS: Record<PaymentTargetType, string> = {
  kol: 'KOL/自由工作者',
  vendor: '廠商',
  employee: '員工',
  other: '其他',
}

// 支出種類 → 建議會計科目映射
export const EXPENSE_TYPE_DEFAULT_SUBJECTS: Record<ExpenseType, string> = {
  '勞務報酬': '勞務成本',
  '外包服務': '外包費用',
  '專案費用': '廣告費用',
  '員工代墊': '其他費用',
  '營運費用': '租金支出',
  '其他支出': '其他費用',
  '沖帳免付': '',
  '代扣代繳': '所得稅',
}

// 根據 KOL 資訊推算預設支出種類與會計科目
// - 無 KOL（非 KOL 項目）→ 專案費用 / 廣告費用
// - KOL 公司帳戶 → 外包服務 / 外包費用
// - KOL 個人帳戶或未設定 → 勞務報酬 / 勞務成本
export function getDefaultExpenseByBankType(kols: { bank_info: unknown } | null | undefined): { expenseType: ExpenseType; accountingSubject: string } {
  if (!kols) {
    return { expenseType: '專案費用', accountingSubject: EXPENSE_TYPE_DEFAULT_SUBJECTS['專案費用'] }
  }
  const info = kols.bank_info as Record<string, unknown> | null | undefined
  if (info?.bankType === 'company') {
    return { expenseType: '外包服務', accountingSubject: EXPENSE_TYPE_DEFAULT_SUBJECTS['外包服務'] }
  }
  return { expenseType: '勞務報酬', accountingSubject: EXPENSE_TYPE_DEFAULT_SUBJECTS['勞務報酬'] }
}

export interface AccountingSale {
  id: string
  year: number
  invoice_month: string | null
  project_name: string
  client_name: string | null
  sales_amount: number
  tax_amount: number
  total_amount: number
  invoice_number: string | null
  invoice_date: string | null
  actual_receipt_date: string | null
  note: string | null
  quotation_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AccountingExpense {
  id: string
  year: number
  expense_month: string | null
  expense_type: ExpenseType
  accounting_subject: string | null
  amount: number
  tax_amount: number
  total_amount: number
  remittance_fee: number
  vendor_name: string | null
  payment_date: string | null
  invoice_date: string | null
  invoice_number: string | null
  project_name: string | null
  note: string | null
  payment_request_id: string | null
  expense_claim_id: string | null
  payment_confirmation_id: string | null
  payment_target_type: PaymentTargetType | null
  payment_status: PaymentStatus
  paid_at: string | null
  submitted_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ===== 個人請款申請相關類型 =====

export const CLAIM_STATUS = ['draft', 'submitted', 'approved', 'rejected'] as const
export type ClaimStatus = typeof CLAIM_STATUS[number]

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: '草稿',
  submitted: '已送出',
  approved: '已核准',
  rejected: '已駁回',
}

export const CLAIM_STATUS_COLORS: Record<ClaimStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-info/20 text-info',
  approved: 'bg-success/20 text-success',
  rejected: 'bg-destructive/20 text-destructive',
}

export interface ExpenseClaim {
  id: string
  year: number
  claim_month: string | null
  withholding_month: string | null
  expense_type: ExpenseType
  accounting_subject: string | null
  amount: number
  tax_amount: number
  total_amount: number
  vendor_name: string | null
  project_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  note: string | null
  status: ClaimStatus
  payment_target_type: PaymentTargetType | null
  submitted_by: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  attachment_file_path: string | null
  payment_status: PaymentStatus | null
  paid_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AccountingPayroll {
  id: string
  year: number
  payment_date: string | null
  salary_month: string | null
  employee_id: string | null
  employee_name: string
  base_salary: number
  meal_allowance: number
  bonus: number
  deduction: number
  labor_insurance_personal: number
  health_insurance_personal: number
  personal_total: number
  net_salary: number
  labor_insurance_company: number
  health_insurance_company: number
  severance_fund: number
  retirement_fund: number
  company_total: number
  insurance_grade: number | null
  insurance_salary: number | null
  labor_rate: number | null
  health_rate: number | null
  pension_rate: number | null
  note: string | null
  payment_status: PaymentStatus
  paid_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ===== 員工管理相關類型 =====

export const EMPLOYMENT_TYPES = ['全職', '兼職', '約聘', '實習'] as const
export type EmploymentType = typeof EMPLOYMENT_TYPES[number]

export const EMPLOYEE_STATUS = ['在職', '留停', '離職'] as const
export type EmployeeStatus = typeof EMPLOYEE_STATUS[number]

export const GENDER_OPTIONS = ['男', '女', '其他'] as const
export type Gender = typeof GENDER_OPTIONS[number]

export interface Employee {
  id: string
  // 帳號綁定
  user_id: string | null
  // 基本資料
  name: string
  id_number: string | null
  birth_date: string | null
  gender: Gender | null
  phone: string | null
  email: string | null
  address: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  // 僱用資料
  employee_number: string | null
  hire_date: string
  resignation_date: string | null
  position: string | null
  department: string | null
  employment_type: EmploymentType
  status: EmployeeStatus
  // 薪資資料
  base_salary: number
  meal_allowance: number
  insurance_grade: number | null
  has_labor_insurance: boolean
  has_health_insurance: boolean
  // 銀行資料
  bank_name: string | null
  bank_branch: string | null
  bank_account: string | null
  // 備註
  note: string | null
  // 系統欄位
  created_by: string | null
  created_at: string
  updated_at: string
}

// ===== 代扣代繳費率設定 =====

export interface WithholdingSettings {
  id: string
  income_tax_rate: number
  nhi_supplement_rate: number
  income_tax_threshold: number
  nhi_threshold: number
  remittance_fee_default: number
  effective_date: string
  expiry_date: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface WithholdingSettlement {
  id: string
  month: string
  type: 'income_tax' | 'nhi_supplement'
  amount: number
  settlement_method: 'company_direct' | 'employee_advance'
  expense_claim_id: string | null
  note: string | null
  settled_by: string | null
  settled_at: string | null
  created_at: string | null
}

// ===== 勞健保費率相關類型 =====

export interface InsuranceRateTable {
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
  created_at: string
  updated_at: string
}