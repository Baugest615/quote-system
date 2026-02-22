// 統一的請款系統類型定義
// 所有請款相關頁面共用的類型

import { Database, Json } from '@/types/database.types'

// ==================== 基礎類型 ====================

export interface PaymentAttachment {
    name: string
    url: string
    path: string
    uploadedAt: string
    size: number
}

export type PendingPaymentAttachment = PaymentAttachment;

export interface BasePaymentItem {
    id: string
    quotation_id: string | null
    quotations: {
        project_name: string
        client_id: string | null
        clients: { name: string } | null
    } | null
    kol_id: string | null
    kols: {
        id: string
        name: string
        real_name: string | null
        bank_info: Json
    } | null
    service: string
    quantity: number
    price: number
    cost: number | null
    remittance_name: string | null
    remark: string | null
    created_at: string | null
}

// ==================== 待請款相關 ====================

export interface PendingPaymentItem extends BasePaymentItem {
    // 合併相關（保留原有功能）
    merge_type: 'account' | null
    merge_group_id: string | null
    is_merge_leader: boolean
    merge_color: string

    // 駁回相關
    rejection_reason: string | null
    rejected_by: string | null
    rejected_at: string | null

    // UI 狀態
    is_selected: boolean

    // 輸入欄位
    invoice_number_input: string | null
    cost_amount_input: number
    original_cost: number // 頁面載入時的原始成本，用於比對
    remittance_name_input: string | null
    expense_type_input: string // 支出種類（申請人選擇）
    accounting_subject_input: string // 會計科目（申請人預設，核准者可覆蓋）
    expected_payment_month_input: string // 預計支付月份（如 "2026年3月"）

    // 附件
    attachments: PaymentAttachment[]

    // 關聯
    payment_request_id: string | null
}

// ==================== 請款申請相關 ====================

export interface PaymentRequestItem extends BasePaymentItem {
    // 請款申請資訊
    payment_request_id: string
    request_date: string
    verification_status: 'pending' | 'approved' | 'rejected'

    // 金額與發票
    cost_amount: number
    invoice_number: string | null

    // 帳務分類（申請人填寫，核准者可覆蓋）
    expense_type: string | null
    accounting_subject: string | null

    // 附件
    attachments: PaymentAttachment[]
    attachment_file_path: string | null

    // 合併資訊（保留）
    merge_type: 'account' | null
    merge_group_id: string | null
    is_merge_leader: boolean
    merge_color: string | null

    // 審核資訊
    rejection_reason: string | null
    verified_by: string | null
    verified_at: string | null

    // UI 狀態
    is_editing?: boolean
    parsed_attachments?: PaymentAttachment[]
}

// ==================== 已確認請款相關 ====================

export interface PaymentConfirmationItem {
    id: string
    payment_confirmation_id: string
    payment_request_id: string | null
    expense_claim_id: string | null
    source_type: 'project' | 'personal'
    amount: number
    created_at: string

    // 關聯資料（專案請款）
    payment_requests: {
        quotation_item_id: string
        cost_amount: number
        invoice_number: string | null
        quotation_items: BasePaymentItem
    } | null

    // 關聯資料（個人報帳）
    expense_claims: {
        id: string
        expense_type: string
        vendor_name: string | null
        project_name: string | null
        amount: number
        tax_amount: number
        total_amount: number
        invoice_number: string | null
        claim_month: string | null
        note: string | null
        submitted_by: string | null
        submitter: { full_name: string | null } | null
    } | null
}

export interface RemittanceSettings {
    [key: string]: {
        hasRemittanceFee: boolean
        remittanceFeeAmount: number
        hasTax: boolean
        hasInsurance: boolean
    }
}

export interface PaymentConfirmation {
    id: string
    confirmation_date: string
    total_amount: number
    total_items: number
    created_by: string
    created_at: string | null

    // 關聯項目
    payment_confirmation_items: PaymentConfirmationItem[]

    // 設定
    remittance_settings: RemittanceSettings | null

    // UI 狀態
    isExpanded?: boolean
}

// ==================== 分組相關 ====================

export interface ProjectGroup<T = PendingPaymentItem> {
    projectId: string
    projectName: string
    clientName: string | null
    items: T[]
    totalCost: number
    totalItems: number
    readyItems: number
    isExpanded: boolean
    hasRejected: boolean
    status: 'pending' | 'partial' | 'complete' | 'rejected'
}

export interface AccountGroup {
    accountKey: string
    accountName: string
    bankName: string
    branchName: string
    accountNumber: string
    items: PaymentConfirmationItem[]
    totalAmount: number
}

export interface RemittanceGroup {
    remittanceName: string
    bankName: string
    branchName: string
    accountNumber: string
    items: PaymentConfirmationItem[]
    totalAmount: number
    isCompanyAccount: boolean
    isWithholdingExempt: boolean
}

// ==================== 跨清單彙總（匯款總覽 Tab） ====================

export interface ConfirmationBreakdown {
    confirmationId: string
    confirmationDate: string
    subtotal: number
    tax: number
    insurance: number
    fee: number
}

export interface MergedRemittanceGroup {
    remittanceName: string
    bankName: string
    branchName: string
    accountNumber: string
    isCompanyAccount: boolean
    isWithholdingExempt: boolean
    isPersonalClaim: boolean
    items: PaymentConfirmationItem[]
    confirmationBreakdowns: ConfirmationBreakdown[]
    totalAmount: number
    totalTax: number
    totalInsurance: number
    totalFee: number
    netTotal: number
}

export interface WithholdingApplicability {
    showWithholding: boolean
    reason: 'personal_claim' | 'company_account' | 'exempt' | 'below_threshold' | 'applicable'
}

// ==================== 篩選與排序 ====================

export type PaymentStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'ready' | 'incomplete'

export interface PaymentFilters {
    searchTerm: string
    status: PaymentStatus
    dateRange: {
        start: Date | null
        end: Date | null
    }
    clientId: string | null
    kolId: string | null
}

export type SortField = 'date' | 'amount' | 'project' | 'kol'
export type SortOrder = 'asc' | 'desc'

export interface SortConfig {
    field: SortField
    order: SortOrder
}

// ==================== 操作相關 ====================

export type VerificationAction = 'approve' | 'reject' | 'revert'

export interface BatchOperation<T> {
    items: T[]
    action: string
    metadata?: Record<string, unknown>
}

// ==================== 統計相關 ====================

export interface PaymentStats {
    total: number
    pending: number
    approved: number
    rejected: number
    totalAmount: number
    averageAmount: number
}

// ==================== 匯出相關 ====================

export type ExportFormat = 'csv' | 'excel' | 'pdf'

export interface ExportOptions {
    format: ExportFormat
    includeHeaders: boolean
    dateFormat: string
    filename?: string
}
