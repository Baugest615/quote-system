'use client'

// 統一管理所有 React Query 快取鍵
export const queryKeys = {
  // 核心業務
  clients: ['clients'] as const,
  client: (id: string) => ['clients', id] as const,
  kols: ['kols'] as const,
  kol: (id: string) => ['kols', id] as const,
  kolTypes: ['kol-types'] as const,
  serviceTypes: ['service-types'] as const,
  quoteCategories: ['quote-categories'] as const,
  expenseTypes: ['expense-types'] as const,
  accountingSubjects: ['accounting-subjects'] as const,

  // 專案進度
  projects: ['projects'] as const,
  projectNotes: (projectId: string) => ['project-notes', projectId] as const,
  projectNotesCounts: ['project-notes-counts'] as const,

  // 報價單
  quotations: ['quotations'] as const,
  quotationsList: (page: number, pageSize: number) => ['quotations', 'list', page, pageSize] as const,
  quotation: (id: string) => ['quotations', id] as const,

  // 請款流程
  pendingPayments: ['pending-payments'] as const,
  paymentRequests: ['payment-requests'] as const,
  confirmedPayments: ['confirmed-payments'] as const,

  // 儀表板 + 報表
  dashboardStats: ['dashboard-stats'] as const,
  reports: (startDate: string, endDate: string) => ['reports', startDate, endDate] as const,

  // 設定 + 權限
  profiles: ['profiles'] as const,

  // 個人
  myEmployee: (userId: string) => ['my-employee', userId] as const,

  // 個人請款申請
  expenseClaims: (year: number) => ['expense-claims', year] as const,
  expenseClaimsPending: ['expense-claims-pending'] as const,
  projectNames: ['project-names'] as const,

  // 使用者管理
  userManagement: ['user-management'] as const,
  unlinkedEmployees: ['unlinked-employees'] as const,

  // 會計模組
  accountingSales: (year: number) => ['accounting-sales', year] as const,
  accountingExpenses: (year: number) => ['accounting-expenses', year] as const,
  accountingPayroll: (year: number) => ['accounting-payroll', year] as const,
  accountingOverview: (year: number) => ['accounting-overview', year] as const,
  accountingProjects: (year: number) => ['accounting-projects', year] as const,
  accountingReports: ['accounting-reports'] as const,
  monthlySettlement: (year: number, month: string) => ['monthly-settlement', year, month] as const,
  employees: ['employees'] as const,
  insuranceRates: ['insurance-rates'] as const,
  withholdingSettings: ['withholding-settings'] as const,
  withholdingSettlements: ['withholding-settlements'] as const,
} as const
