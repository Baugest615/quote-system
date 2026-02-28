// Rejection Reason Display Component

import { AlertCircle, Unlink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PendingPaymentItem } from '@/lib/payments/types'

interface RejectionReasonDisplayProps {
    item: PendingPaymentItem
    onClear: (paymentRequestId: string) => void
    onUnmerge: (groupId: string) => void
}

export function RejectionReasonDisplay({ item, onClear, onUnmerge }: RejectionReasonDisplayProps) {
    const shouldShowControls = !item.merge_group_id || item.is_merge_leader

    if (!item.rejection_reason || !shouldShowControls) return null

    return (
        <div className="mt-2 bg-destructive/15 border border-destructive/25 rounded-md p-3">
            <div className="flex items-start justify-between">
                <div className="flex items-start flex-1">
                    <AlertCircle className="h-4 w-4 text-destructive mr-2 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-xs font-semibold text-destructive">
                            {item.merge_group_id ? '合併群組駁回原因' : '駁回原因'}
                        </p>
                        <p className="text-xs text-destructive/80 whitespace-pre-wrap mt-1">
                            {item.rejection_reason}
                        </p>
                    </div>
                </div>
                <div className="flex space-x-1 ml-2">
                    {item.merge_group_id && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onUnmerge(item.merge_group_id!)}
                            className="h-6 w-6 p-0 text-warning hover:text-warning/80 hover:bg-warning/15"
                            title="解除合併"
                        >
                            <Unlink className="h-3 w-3" />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onClear(item.payment_request_id!)}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive/80 hover:bg-destructive/15"
                        title="清除駁回原因"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
