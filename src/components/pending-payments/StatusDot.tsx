import { cn } from '@/lib/utils'
import type { PendingPaymentItem } from '@/lib/payments/types'
import { isItemReady } from '@/lib/pending-payments/grouping-utils'

export type ItemStatus = 'rejected' | 'incomplete' | 'ready' | 'not_started'

export function getItemStatus(item: PendingPaymentItem): ItemStatus {
    if (item.rejection_reason) return 'rejected'
    if (isItemReady(item)) return 'ready'
    if ((item.attachments && item.attachments.length > 0) || item.invoice_number_input) return 'incomplete'
    return 'not_started'
}

const STATUS_CONFIG: Record<ItemStatus, { color: string; label: string }> = {
    rejected: { color: 'bg-destructive', label: '已駁回' },
    incomplete: { color: 'bg-warning', label: '文件不完整' },
    ready: { color: 'bg-success', label: '已備妥' },
    not_started: { color: 'bg-muted-foreground/30', label: '未開始' },
}

interface StatusDotProps {
    status: ItemStatus
    rejectionReason?: string | null
    className?: string
}

export function StatusDot({ status, rejectionReason, className }: StatusDotProps) {
    const config = STATUS_CONFIG[status]
    const title = status === 'rejected' && rejectionReason
        ? `駁回：${rejectionReason.slice(0, 50)}${rejectionReason.length > 50 ? '...' : ''}`
        : config.label

    return (
        <span
            className={cn('inline-block w-2.5 h-2.5 rounded-full flex-shrink-0', config.color, className)}
            title={title}
        />
    )
}
