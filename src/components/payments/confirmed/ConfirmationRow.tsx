import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PaymentConfirmation } from '@/lib/payments/types'
import { ConfirmationDetails } from './ConfirmationDetails'
import { ExportControls } from './ExportControls'
import { useRemittanceSettings } from '@/hooks/payments/useRemittanceSettings'

interface ConfirmationRowProps {
    confirmation: PaymentConfirmation
    onToggleExpansion: (id: string) => void
    onRevert: (confirmation: PaymentConfirmation) => void
}

export function ConfirmationRow({ confirmation, onToggleExpansion, onRevert }: ConfirmationRowProps) {
    const { settings, updateSettings, getSettings } = useRemittanceSettings(
        confirmation.id,
        confirmation.remittance_settings
    )

    return (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
            {/* 清單標題列 */}
            <div
                className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-4 border-b bg-gray-50"
                onClick={() => onToggleExpansion(confirmation.id)}
            >
                <div className="flex items-center space-x-3">
                    {confirmation.isExpanded ?
                        <ChevronDown className="h-5 w-5 text-gray-400" /> :
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                    }
                    <FileText className="h-5 w-5 text-blue-500" />
                    <div>
                        <div className="font-medium text-gray-900">請款清單 - {confirmation.confirmation_date}</div>
                        <div className="text-sm text-gray-500">
                            {confirmation.total_items} 筆項目 | 總成本 NT$ {(confirmation.total_amount || 0).toLocaleString()}
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <ExportControls confirmation={confirmation} settingsMap={settings} />
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation()
                            onRevert(confirmation)
                        }}
                    >
                        <Trash2 className="h-4 w-4 mr-1" /> 退回申請
                    </Button>
                </div>
            </div>

            {/* 展開內容 */}
            {confirmation.isExpanded && (
                <ConfirmationDetails
                    confirmation={confirmation}
                    settings={settings}
                    updateSettings={updateSettings}
                    getSettings={getSettings}
                />
            )}
        </div>
    )
}
