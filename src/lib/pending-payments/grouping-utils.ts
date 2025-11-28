import { PendingPaymentItem } from '@/lib/payments/types'

export interface ProjectGroup<T = PendingPaymentItem> {
    projectId: string
    projectName: string
    clientName: string | null
    items: T[]
    totalCost: number
    readyItems: number
    totalItems: number
    isExpanded: boolean
    hasRejected: boolean
}

// Helper function to check if an item is ready for payment
export const isItemReady = (item: PendingPaymentItem): boolean => {
    const hasAttachments = item.attachments && item.attachments.length > 0
    const hasValidInvoice = item.invoice_number_input && /^[A-Za-z]{2}-\d{8}$/.test(item.invoice_number_input)
    return !!(hasAttachments || hasValidInvoice)
}

// Group items by project
export const groupItemsByProject = (items: PendingPaymentItem[]): ProjectGroup[] => {
    const projectMap = new Map<string, ProjectGroup>()

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
                readyItems: 0,
                totalItems: 0,
                isExpanded: true, // Default to expanded
                hasRejected: false
            })
        }

        const group = projectMap.get(projectId)!
        group.items.push(item)
        group.totalCost += item.cost_amount_input || 0
        group.totalItems += 1

        if (isItemReady(item)) {
            group.readyItems += 1
        }

        if (item.rejection_reason) {
            group.hasRejected = true
        }
    })

    // Convert map to array and sort by project name
    return Array.from(projectMap.values()).sort((a, b) => {
        // Rejected projects first
        if (a.hasRejected && !b.hasRejected) return -1
        if (!a.hasRejected && b.hasRejected) return 1
        // Then by project name
        return a.projectName.localeCompare(b.projectName)
    })
}

// Calculate completion percentage
export const getCompletionPercentage = (group: ProjectGroup): number => {
    if (group.totalItems === 0) return 0
    return Math.round((group.readyItems / group.totalItems) * 100)
}

// Get status color based on completion
export const getStatusColor = (group: ProjectGroup): string => {
    if (group.hasRejected) return 'bg-red-50 border-red-200'
    const percentage = getCompletionPercentage(group)
    if (percentage === 100) return 'bg-green-50 border-green-200'
    if (percentage > 0) return 'bg-yellow-50 border-yellow-200'
    return 'bg-gray-50 border-gray-200'
}

// Get status badge color
export const getStatusBadgeColor = (group: ProjectGroup): string => {
    if (group.hasRejected) return 'bg-red-100 text-red-800'
    const percentage = getCompletionPercentage(group)
    if (percentage === 100) return 'bg-green-100 text-green-800'
    if (percentage > 0) return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-800'
}
