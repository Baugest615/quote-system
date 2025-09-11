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
    name: 'KOL管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'export'],
    route: '/dashboard/kols',
    icon: 'Star'
  },
  [PAGE_KEYS.QUOTES]: {
    key: PAGE_KEYS.QUOTES,
    name: '報價單',
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
    name: '待請款管理',
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
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}