import { useMemo } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { PaymentConfirmation } from '@/lib/payments/types'
import { ConfirmationDetails } from './ConfirmationDetails'
import { ExportControls } from './ExportControls'
import { useRemittanceSettings } from '@/hooks/payments/useRemittanceSettings'
import type { WithholdingSettings } from '@/types/custom.types'

interface ConfirmationRowProps {
    confirmation: PaymentConfirmation
    onToggleExpansion: (id: string) => void
    withholdingRates?: WithholdingSettings | null
}

export function ConfirmationRow({ confirmation, onToggleExpansion, withholdingRates }: ConfirmationRowProps) {
    const { settings, getSettings } = useRemittanceSettings(
        confirmation.id,
        confirmation.remittance_settings,
    )

    // 計算匯費合計
    const totalFee = useMemo(() => {
        if (!settings) return 0
        return Object.values(settings).reduce(
            (sum, s) => sum + (s.hasRemittanceFee ? (s.remittanceFeeAmount || 0) : 0), 0
        )
    }, [settings])

    return (
        <div className="bg-card shadow-none border border-border rounded-lg overflow-hidden">
            {/* 清單標題列 */}
            <div
                className="flex items-center justify-between cursor-pointer hover:bg-secondary p-4 border-b bg-secondary"
                onClick={() => onToggleExpansion(confirmation.id)}
            >
                <div className="flex items-center space-x-3">
                    {confirmation.isExpanded ?
                        <ChevronDown className="h-5 w-5 text-muted-foreground" /> :
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    }
                    <FileText className="h-5 w-5 text-info" />
                    <div>
                        <div className="font-medium text-foreground">請款清單 - {confirmation.confirmation_date}</div>
                        <div className="text-sm text-muted-foreground">
                            {confirmation.total_items} 筆項目 | 總成本 NT$ {(confirmation.total_amount || 0).toLocaleString()}
                            {totalFee > 0 && (
                                <span className="text-warning ml-1">
                                    （匯費 -{totalFee.toLocaleString()} → 實付 NT$ {((confirmation.total_amount || 0) - totalFee).toLocaleString()}）
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                    <ExportControls confirmation={confirmation} settingsMap={settings} />
                </div>
            </div>

            {/* 展開內容（唯讀模式） */}
            {confirmation.isExpanded && (
                <ConfirmationDetails
                    confirmation={confirmation}
                    settings={settings}
                    getSettings={getSettings}
                    withholdingRates={withholdingRates}
                />
            )}
        </div>
    )
}
