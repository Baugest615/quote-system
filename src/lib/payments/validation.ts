// 請款系統驗證工具函數

import { VALIDATION_RULES, ERROR_MESSAGES } from './constants'
import type { PaymentAttachment } from './types'

// ==================== 發票號碼驗證 ====================

/**
 * 驗證發票號碼格式
 * @param invoiceNumber 發票號碼
 * @returns 是否有效
 */
export function isValidInvoiceFormat(invoiceNumber: string | null | undefined): boolean {
    if (!invoiceNumber) return false
    return VALIDATION_RULES.invoiceNumber.pattern.test(invoiceNumber)
}

/**
 * 取得發票號碼錯誤訊息
 * @param invoiceNumber 發票號碼
 * @returns 錯誤訊息或 null
 */
export function getInvoiceError(invoiceNumber: string | null | undefined): string | null {
    if (!invoiceNumber) return ERROR_MESSAGES.validation.required
    if (!isValidInvoiceFormat(invoiceNumber)) {
        return VALIDATION_RULES.invoiceNumber.message
    }
    return null
}

// ==================== 成本金額驗證 ====================

/**
 * 驗證成本金額
 * @param amount 金額
 * @returns 是否有效
 */
export function isValidCostAmount(amount: number | null | undefined): boolean {
    if (amount === null || amount === undefined) return false
    return amount >= VALIDATION_RULES.costAmount.min && amount <= VALIDATION_RULES.costAmount.max
}

/**
 * 取得成本金額錯誤訊息
 * @param amount 金額
 * @returns 錯誤訊息或 null
 */
export function getCostAmountError(amount: number | null | undefined): string | null {
    if (amount === null || amount === undefined) return ERROR_MESSAGES.validation.required
    if (!isValidCostAmount(amount)) {
        return VALIDATION_RULES.costAmount.message
    }
    if (amount <= 0) {
        return '成本金額必須大於 0'
    }
    return null
}

// ==================== 附件驗證 ====================

/**
 * 驗證檔案大小
 * @param size 檔案大小（bytes）
 * @returns 是否有效
 */
export function isValidFileSize(size: number): boolean {
    return size <= VALIDATION_RULES.attachment.maxSize
}

/**
 * 驗證檔案類型
 * @param type MIME type
 * @returns 是否有效
 */
export function isValidFileType(type: string): boolean {
    return (VALIDATION_RULES.attachment.allowedTypes as readonly string[]).includes(type)
}

/**
 * 驗證附件數量
 * @param count 附件數量
 * @returns 是否有效
 */
export function isValidAttachmentCount(count: number): boolean {
    return count <= VALIDATION_RULES.attachment.maxCount
}

/**
 * 驗證單個附件
 * @param file File 物件
 * @returns 錯誤訊息或 null
 */
export function validateAttachment(file: File): string | null {
    if (!isValidFileSize(file.size)) {
        return ERROR_MESSAGES.file.tooLarge
    }
    if (!isValidFileType(file.type)) {
        return ERROR_MESSAGES.file.invalidType
    }
    return null
}

/**
 * 驗證附件列表
 * @param files File 列表
 * @param existingCount 現有附件數量
 * @returns 錯誤訊息或 null
 */
export function validateAttachments(files: File[], existingCount: number = 0): string | null {
    const totalCount = files.length + existingCount

    if (!isValidAttachmentCount(totalCount)) {
        return `最多只能上傳 ${VALIDATION_RULES.attachment.maxCount} 個檔案`
    }

    for (const file of files) {
        const error = validateAttachment(file)
        if (error) return error
    }

    return null
}

// ==================== 項目驗證 ====================

/**
 * 檢查項目是否已備妥（有附件或有效發票）
 * @param item 項目
 * @returns 是否已備妥
 */
export function isItemReady(item: {
    attachments?: PaymentAttachment[]
    invoice_number_input?: string | null
}): boolean {
    const hasAttachments = item.attachments && item.attachments.length > 0
    const hasValidInvoice = isValidInvoiceFormat(item.invoice_number_input)
    return !!(hasAttachments || hasValidInvoice)
}

/**
 * 檢查項目是否可以選擇付款
 * @param item 項目
 * @returns 是否可選擇
 */
export function canSelectForPayment(item: {
    attachments?: PaymentAttachment[]
    invoice_number_input?: string | null
    merge_group_id?: string | null
    is_merge_leader?: boolean
}): boolean {
    // 如果是合併項目，只有主項目可以選擇
    if (item.merge_group_id && !item.is_merge_leader) {
        return false
    }

    return isItemReady(item)
}

/**
 * 驗證項目是否可以提交
 * @param item 項目
 * @returns 錯誤訊息或 null
 */
export function validateItemForSubmission(item: {
    cost_amount_input?: number
    attachments?: PaymentAttachment[]
    invoice_number_input?: string | null
}): string | null {
    // 檢查成本
    const costError = getCostAmountError(item.cost_amount_input)
    if (costError) return costError

    // 檢查是否備妥
    if (!isItemReady(item)) {
        return '請檢附文件或填入正確格式的發票號碼'
    }

    return null
}

// ==================== 合併驗證（保留原有功能）====================

/**
 * 檢查兩個項目是否可以合併（銀行帳戶相同）
 * @param item1 項目1
 * @param item2 項目2
 * @returns 是否可合併
 */
export function canMergeItems(
    item1: { kols?: { bank_info: any } | null },
    item2: { kols?: { bank_info: any } | null }
): boolean {
    const bankInfo1 = item1.kols?.bank_info
    const bankInfo2 = item2.kols?.bank_info

    if (!bankInfo1 || !bankInfo2) return false

    return JSON.stringify(bankInfo1) === JSON.stringify(bankInfo2)
}

/**
 * 驗證合併操作
 * @param items 要合併的項目
 * @returns 錯誤訊息或 null
 */
export function validateMergeOperation(items: Array<{ kols?: { bank_info: any } | null }>): string | null {
    if (items.length < 2) {
        return '請選擇至少兩筆資料進行合併'
    }

    const firstItem = items[0]
    for (let i = 1; i < items.length; i++) {
        if (!canMergeItems(firstItem, items[i])) {
            return '所選項目的銀行帳戶不一致，無法合併'
        }
    }

    return null
}

// ==================== 批量操作驗證 ====================

/**
 * 驗證批量審核操作
 * @param items 項目列表
 * @param action 操作類型
 * @returns 錯誤訊息或 null
 */
export function validateBatchVerification(
    items: any[],
    action: 'approve' | 'reject'
): string | null {
    if (items.length === 0) {
        return ERROR_MESSAGES.operation.noSelection
    }

    if (action === 'reject') {
        // 駁回需要填寫原因，這個在 UI 層處理
        return null
    }

    return null
}

// ==================== 通用驗證 ====================

/**
 * 檢查必填欄位
 * @param value 值
 * @returns 錯誤訊息或 null
 */
export function validateRequired(value: any): string | null {
    if (value === null || value === undefined || value === '') {
        return ERROR_MESSAGES.validation.required
    }
    return null
}

/**
 * 檢查數字範圍
 * @param value 值
 * @param min 最小值
 * @param max 最大值
 * @returns 錯誤訊息或 null
 */
export function validateNumberRange(
    value: number,
    min: number,
    max: number
): string | null {
    if (value < min || value > max) {
        return `數值必須在 ${min} 到 ${max} 之間`
    }
    return null
}

/**
 * 檢查字串長度
 * @param value 字串
 * @param minLength 最小長度
 * @param maxLength 最大長度
 * @returns 錯誤訊息或 null
 */
export function validateStringLength(
    value: string,
    minLength: number,
    maxLength: number
): string | null {
    if (value.length < minLength) {
        return `長度不得少於 ${minLength} 個字元`
    }
    if (value.length > maxLength) {
        return `長度不得超過 ${maxLength} 個字元`
    }
    return null
}
