// 請款系統分組工具函數
// 包含專案分組、帳戶分組、合併分組等

import type {
    ProjectGroup,
    AccountGroup,
    PendingPaymentItem,
    PaymentConfirmationItem
} from './types'
import { isItemReady } from './validation'

// ==================== 專案分組 ====================

/**
 * 按專案分組項目
 * @param items 項目列表
 * @returns 專案分組列表
 */
export function groupItemsByProject<T extends {
    quotation_id: string | null
    quotations: {
        project_name: string
        clients: { name: string } | null
    } | null
    cost_amount_input?: number
    price?: number
    quantity?: number
    rejection_reason?: string | null
    attachments?: any[]
    invoice_number_input?: string | null
}>(items: T[]): ProjectGroup<T>[] {
    const projectMap = new Map<string, ProjectGroup<T>>()

    items.forEach(item => {
        const projectId = item.quotation_id || 'unknown'
        const projectName = item.quotations?.project_name || '未命名專案'
        const clientName = item.quotations?.clients?.name || null

        if (!projectMap.has(projectId)) {
            projectMap.set(projectId, {
                projectId,
                projectName,
                clientName,
                items: [],
                totalCost: 0,
                totalItems: 0,
                readyItems: 0,
                isExpanded: true,
                hasRejected: false,
                status: 'pending'
            })
        }

        const group = projectMap.get(projectId)!
        group.items.push(item)

        // 計算總成本
        const itemCost = item.cost_amount_input ||
            (item.price && item.quantity ? item.price * item.quantity : 0)
        group.totalCost += itemCost
        group.totalItems += 1

        // 檢查是否備妥
        if (isItemReady(item)) {
            group.readyItems += 1
        }

        // 檢查是否有駁回
        if (item.rejection_reason) {
            group.hasRejected = true
        }
    })

    // 計算狀態並排序
    return Array.from(projectMap.values())
        .map(group => ({
            ...group,
            status: getProjectStatus(group)
        }))
        .sort((a, b) => {
            // 有駁回的優先
            if (a.hasRejected && !b.hasRejected) return -1
            if (!a.hasRejected && b.hasRejected) return 1
            // 按專案名稱排序
            return a.projectName.localeCompare(b.projectName)
        })
}

/**
 * 取得專案狀態
 * @param group 專案分組
 * @returns 狀態
 */
function getProjectStatus<T>(group: ProjectGroup<T>): 'pending' | 'partial' | 'complete' | 'rejected' {
    if (group.hasRejected) return 'rejected'
    if (group.readyItems === 0) return 'pending'
    if (group.readyItems === group.totalItems) return 'complete'
    return 'partial'
}

/**
 * 計算完成百分比
 * @param group 專案分組
 * @returns 百分比（0-100）
 */
export function getCompletionPercentage<T>(group: ProjectGroup<T>): number {
    if (group.totalItems === 0) return 0
    return Math.round((group.readyItems / group.totalItems) * 100)
}

// ==================== 帳戶分組 ====================

/**
 * 按銀行帳戶分組項目
 * @param items 已確認請款項目
 * @returns 帳戶分組列表
 */
export function groupItemsByAccount(items: PaymentConfirmationItem[]): AccountGroup[] {
    const accountMap = new Map<string, AccountGroup>()

    items.forEach(item => {
        const paymentRequest = item.payment_requests
        if (!paymentRequest) return

        const quotationItem = paymentRequest.quotation_items
        if (!quotationItem) return

        const kol = quotationItem.kols
        if (!kol || !kol.bank_info) return

        const bankInfo = kol.bank_info
        const accountKey = `${bankInfo.bank_name}_${bankInfo.account_number}`

        if (!accountMap.has(accountKey)) {
            accountMap.set(accountKey, {
                accountKey,
                accountName: kol.name || '未知',
                bankName: bankInfo.bank_name || '未知銀行',
                branchName: bankInfo.branch_name || '',
                accountNumber: bankInfo.account_number || '',
                items: [],
                totalAmount: 0
            })
        }

        const group = accountMap.get(accountKey)!
        group.items.push(item)
        group.totalAmount += item.amount || 0
    })

    return Array.from(accountMap.values()).sort((a, b) =>
        b.totalAmount - a.totalAmount
    )
}

// ==================== 匯款戶名分組 ====================

/**
 * 按匯款戶名分組項目
 * @param items 已確認請款項目
 * @returns 匯款戶名分組列表
 */
export function groupItemsByRemittance(items: PaymentConfirmationItem[]): import('./types').RemittanceGroup[] {
    const remittanceMap = new Map<string, import('./types').RemittanceGroup>()

    items.forEach(item => {
        const paymentRequest = item.payment_requests
        if (!paymentRequest) return

        const quotationItem = paymentRequest.quotation_items
        if (!quotationItem) return

        const kol = quotationItem.kols
        const bankInfo = kol?.bank_info || {}

        let remittanceName = quotationItem.remittance_name?.trim()

        // Treat '未知匯款戶名' or empty as missing to trigger fallback
        if (!remittanceName || remittanceName === '未知匯款戶名' || remittanceName === 'Unknown Remittance Name') {
            remittanceName = undefined
        }

        if (!remittanceName && kol) {
            if (bankInfo.bankType === 'company') {
                // Fallback to KOL name if company account name is missing
                remittanceName = bankInfo.companyAccountName || kol.name
            } else {
                // Default to individual if not specified or explicit individual
                remittanceName = bankInfo.personalAccountName || kol.real_name || kol.name
            }
        }

        remittanceName = remittanceName || '未知匯款戶名'
        const groupKey = remittanceName

        if (!remittanceMap.has(groupKey)) {
            remittanceMap.set(groupKey, {
                remittanceName,
                bankName: bankInfo.bankName || '',
                branchName: bankInfo.branchName || '',
                accountNumber: bankInfo.accountNumber || '',
                items: [],
                totalAmount: 0
            })
        }

        const group = remittanceMap.get(groupKey)!
        group.items.push(item)

        // Fallback to cost_amount if amount is 0
        const amount = item.amount || paymentRequest.cost_amount || 0
        group.totalAmount += amount
    })

    return Array.from(remittanceMap.values()).sort((a, b) =>
        b.totalAmount - a.totalAmount
    )
}

// ==================== 合併分組（保留原有功能）====================

/**
 * 取得合併群組的主項目
 * @param items 項目列表
 * @param groupId 群組ID
 * @returns 主項目或 null
 */
export function getMergeLeader<T extends {
    merge_group_id: string | null
    is_merge_leader: boolean
}>(items: T[], groupId: string): T | null {
    return items.find(item =>
        item.merge_group_id === groupId && item.is_merge_leader
    ) || null
}

/**
 * 取得合併群組的所有項目
 * @param items 項目列表
 * @param groupId 群組ID
 * @returns 群組項目列表
 */
export function getMergeGroupItems<T extends {
    merge_group_id: string | null
}>(items: T[], groupId: string): T[] {
    return items.filter(item => item.merge_group_id === groupId)
}

/**
 * 計算合併群組的總金額
 * @param items 群組項目
 * @returns 總金額
 */
export function calculateMergeGroupTotal<T extends {
    cost_amount_input?: number
    price?: number
    quantity?: number
}>(items: T[]): number {
    return items.reduce((sum, item) => {
        const amount = item.cost_amount_input ||
            (item.price && item.quantity ? item.price * item.quantity : 0)
        return sum + amount
    }, 0)
}

/**
 * 檢查項目是否在合併群組中
 * @param item 項目
 * @returns 是否在群組中
 */
export function isInMergeGroup<T extends {
    merge_group_id: string | null
}>(item: T): boolean {
    return !!item.merge_group_id
}

/**
 * 生成新的合併群組ID
 * @returns 群組ID
 */
export function generateMergeGroupId(): string {
    return `merge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ==================== 狀態分組 ====================

/**
 * 按狀態分組項目
 * @param items 項目列表
 * @returns 狀態分組 Map
 */
export function groupItemsByStatus<T extends {
    verification_status?: string
    rejection_reason?: string | null
}>(items: T[]): Map<string, T[]> {
    const statusMap = new Map<string, T[]>()

    items.forEach(item => {
        let status = 'unknown'

        if (item.verification_status) {
            status = item.verification_status
        } else if (item.rejection_reason) {
            status = 'rejected'
        } else {
            status = 'pending'
        }

        if (!statusMap.has(status)) {
            statusMap.set(status, [])
        }
        statusMap.get(status)!.push(item)
    })

    return statusMap
}

// ==================== 日期分組 ====================

/**
 * 按日期分組項目
 * @param items 項目列表
 * @param dateField 日期欄位名稱
 * @returns 日期分組 Map
 */
export function groupItemsByDate<T extends Record<string, any>>(
    items: T[],
    dateField: keyof T
): Map<string, T[]> {
    const dateMap = new Map<string, T[]>()

    items.forEach(item => {
        const dateValue = item[dateField]
        if (!dateValue) return

        const date = new Date(dateValue as string)
        const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD

        if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, [])
        }
        dateMap.get(dateKey)!.push(item)
    })

    return new Map(Array.from(dateMap.entries()).sort((a, b) =>
        b[0].localeCompare(a[0]) // 降序排列
    ))
}

// ==================== KOL 分組 ====================

/**
 * 按 KOL 分組項目
 * @param items 項目列表
 * @returns KOL 分組 Map
 */
export function groupItemsByKOL<T extends {
    kol_id: string | null
    kols: { id: string; name: string } | null
}>(items: T[]): Map<string, { kol: { id: string; name: string }, items: T[] }> {
    const kolMap = new Map<string, { kol: { id: string; name: string }, items: T[] }>()

    items.forEach(item => {
        const kolId = item.kol_id || 'custom'
        const kolName = item.kols?.name || '自訂項目'

        if (!kolMap.has(kolId)) {
            kolMap.set(kolId, {
                kol: { id: kolId, name: kolName },
                items: []
            })
        }
        kolMap.get(kolId)!.items.push(item)
    })

    return kolMap
}

// ==================== 客戶分組 ====================

/**
 * 按客戶分組項目
 * @param items 項目列表
 * @returns 客戶分組 Map
 */
export function groupItemsByClient<T extends {
    quotations: {
        client_id: string | null
        clients: { name: string } | null
    } | null
}>(items: T[]): Map<string, { client: { id: string; name: string }, items: T[] }> {
    const clientMap = new Map<string, { client: { id: string; name: string }, items: T[] }>()

    items.forEach(item => {
        const clientId = item.quotations?.client_id || 'unknown'
        const clientName = item.quotations?.clients?.name || '未知客戶'

        if (!clientMap.has(clientId)) {
            clientMap.set(clientId, {
                client: { id: clientId, name: clientName },
                items: []
            })
        }
        clientMap.get(clientId)!.items.push(item)
    })

    return clientMap
}

// ==================== 工具函數 ====================

/**
 * 展開所有分組
 * @param groups 分組列表
 * @returns 更新後的分組列表
 */
export function expandAllGroups<T>(groups: ProjectGroup<T>[]): ProjectGroup<T>[] {
    return groups.map(group => ({ ...group, isExpanded: true }))
}

/**
 * 收合所有分組
 * @param groups 分組列表
 * @returns 更新後的分組列表
 */
export function collapseAllGroups<T>(groups: ProjectGroup<T>[]): ProjectGroup<T>[] {
    return groups.map(group => ({ ...group, isExpanded: false }))
}

/**
 * 切換分組展開狀態
 * @param groups 分組列表
 * @param projectId 專案ID
 * @returns 更新後的分組列表
 */
export function toggleGroupExpansion<T>(
    groups: ProjectGroup<T>[],
    projectId: string
): ProjectGroup<T>[] {
    return groups.map(group =>
        group.projectId === projectId
            ? { ...group, isExpanded: !group.isExpanded }
            : group
    )
}
