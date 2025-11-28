import { PaymentConfirmationItem } from '@/lib/payments/types'

interface PaymentRecordRowProps {
    item: PaymentConfirmationItem
}

export function PaymentRecordRow({ item }: PaymentRecordRowProps) {
    // 安全地存取巢狀資料
    const request = item.payment_requests
    const quotationItem = request?.quotation_items
    const quotation = quotationItem?.quotations
    const kol = quotationItem?.kols

    const projectName = quotation?.project_name || '未命名專案'
    const kolName = kol?.name || '未知 KOL'
    const service = quotationItem?.service || '未知服務'
    let remittanceName = quotationItem?.remittance_name?.trim()

    // Treat '未知匯款戶名' or empty as missing to trigger fallback
    if (!remittanceName || remittanceName === '未知匯款戶名' || remittanceName === 'Unknown Remittance Name') {
        remittanceName = undefined
    }

    if (!remittanceName && kol) {
        const bankInfo = kol.bank_info || {}
        if (bankInfo.bankType === 'company') {
            // Fallback to KOL name if company account name is missing
            remittanceName = bankInfo.companyAccountName || kol.name
        } else {
            // Default to individual if not specified or explicit individual
            remittanceName = bankInfo.personalAccountName || kol.real_name || kol.name
        }
    }

    remittanceName = remittanceName || '未知匯款戶名'

    // Fix cost display: use item.amount or fallback to cost_amount
    const amount = item.amount || request?.cost_amount || 0

    return (
        <tr className="text-sm hover:bg-gray-50">
            <td className="px-4 py-3 text-gray-900">{projectName}</td>
            <td className="px-4 py-3 text-gray-700">{kolName}</td>
            <td className="px-4 py-3 text-gray-700">{service}</td>
            <td className="px-4 py-3 text-gray-700">{remittanceName}</td>
            <td className="px-4 py-3 text-right font-medium text-gray-900">
                NT$ {amount.toLocaleString()}
            </td>
        </tr>
    )
}
