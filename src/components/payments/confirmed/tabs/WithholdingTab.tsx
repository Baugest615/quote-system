'use client'

import type { PaymentConfirmation } from '@/lib/payments/types'
import type { WithholdingSettings } from '@/types/custom.types'
import { WithholdingReport } from '../WithholdingReport'

interface WithholdingTabProps {
    confirmations: PaymentConfirmation[]
    withholdingRates?: WithholdingSettings | null
}

export function WithholdingTab({ confirmations, withholdingRates }: WithholdingTabProps) {
    if (confirmations.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                目前沒有已確認的請款記錄，無法產生代扣報表
            </div>
        )
    }

    return (
        <WithholdingReport
            confirmations={confirmations}
            withholdingRates={withholdingRates}
            alwaysExpanded
        />
    )
}
