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
                'KOL',
                '服務項目',
                '原始金額',
                '小計',
                '代扣所得稅',
                '代扣二代健保',
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

                // 計算邏輯 (與 ConfirmationDetails 一致)
                const subtotal = group.totalAmount
                const tax = settings.hasTax ? Math.floor(subtotal * 0.1) : 0
                const insurance = settings.hasInsurance ? Math.floor(subtotal * 0.0211) : 0
                const fee = settings.hasRemittanceFee ? settings.remittanceFeeAmount : 0
                const netTotal = subtotal - tax - insurance - fee

                group.items.forEach(item => {
                    const request = item.payment_requests
                    const quotationItem = request?.quotation_items
                    const quotation = quotationItem?.quotations
                    const kol = quotationItem?.kols

                    // Fallback to cost_amount if amount is 0
                    const amount = item.amount || request?.cost_amount || 0

                    csvData.push([
                        confirmation.confirmation_date,
                        group.remittanceName,
                        bankInfo,
                        quotation?.project_name || '',
                        kol?.name || '',
                        quotationItem?.service || '',
                        amount,
                        subtotal,   // 小計 (整組相同)
                        tax,        // 稅額 (整組相同)
                        insurance,  // 健保 (整組相同)
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
        } catch (error: any) {
            toast.error('匯出失敗: ' + error.message)
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="text-green-600 hover:text-green-700"
        >
            <Download className="h-4 w-4 mr-1" />
            CSV
        </Button>
    )
}
