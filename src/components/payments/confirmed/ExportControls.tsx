import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { PaymentConfirmation, RemittanceSettings } from '@/lib/payments/types'
import { groupItemsByRemittance } from '@/lib/payments/grouping'

interface ExportControlsProps {
    confirmation: PaymentConfirmation
    settingsMap: RemittanceSettings
}

export function ExportControls({ confirmation, settingsMap }: ExportControlsProps) {
    const handleExport = (e: React.MouseEvent) => {
        e.stopPropagation()

        try {
            const remittanceGroups = groupItemsByRemittance(confirmation.payment_confirmation_items)
            const csvData: (string | number)[][] = []

            // CSV Header
            csvData.push([
                '確認日期',
                '匯款戶名',
                '銀行資訊',
                '專案名稱',
                'KOL/服務',
                '執行內容',
                '原始金額',
                '小計',
                '匯費',
                '實付金額'
            ])

            remittanceGroups.forEach(group => {
                const bankInfo = `${group.bankName} ${group.branchName} ${group.accountNumber}`.trim()
                const settings = settingsMap[group.remittanceName] || {
                    hasRemittanceFee: false,
                    remittanceFeeAmount: 30,
                    hasTax: false,
                    hasInsurance: false
                }

                // 計算邏輯（只計算匯費，代扣由 WithholdingTab 獨立處理）
                // 公司行號：DB 存未稅成本，匯出時加 5% 營業稅
                const subtotal = group.isCompanyAccount ? Math.round(group.totalAmount * 1.05) : group.totalAmount
                const fee = settings.hasRemittanceFee ? settings.remittanceFeeAmount : 0
                const netTotal = subtotal - fee

                group.items.forEach(item => {
                    const request = item.payment_requests
                    const quotationItem = request?.quotation_items
                    const quotation = quotationItem?.quotations
                    const kol = quotationItem?.kols

                    const rawAmount = item.amount_at_confirmation || request?.cost_amount || 0
                    const amount = group.isCompanyAccount ? Math.round(rawAmount * 1.05) : rawAmount

                    csvData.push([
                        confirmation.confirmation_date,
                        group.remittanceName,
                        bankInfo,
                        quotation?.project_name || item.project_name_at_confirmation || '',
                        kol?.name || item.kol_name_at_confirmation || '',
                        quotationItem?.service || item.service_at_confirmation || '',
                        amount,
                        subtotal,   // 小計 (整組相同)
                        fee,        // 匯費 (整組相同)
                        netTotal    // 實付金額 (整組相同)
                    ])
                })
            })

            const csvContent = csvData.map(row => row.join(',')).join('\n')
            const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
            const link = document.createElement('a')
            const url = URL.createObjectURL(blob)

            link.setAttribute('href', url)
            link.setAttribute('download', `請款清單_${confirmation.confirmation_date}.csv`)
            link.style.visibility = 'hidden'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

            toast.success('CSV檔案已下載')
        } catch (error: unknown) {
            toast.error('匯出失敗: ' + (error instanceof Error ? error.message : String(error)))
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="text-success hover:text-success/80"
        >
            <Download className="h-4 w-4 mr-1" />
            CSV
        </Button>
    )
}
