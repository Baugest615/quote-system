import { PaymentConfirmationItem } from '@/lib/payments/types'
import { type KolBankInfo } from '@/types/schemas'

interface PaymentRecordRowProps {
    item: PaymentConfirmationItem
}

export function PaymentRecordRow({ item }: PaymentRecordRowProps) {
    // 個人報帳項目
    if (item.source_type === 'personal' || item.expense_claim_id) {
        const claim = item.expense_claims
        const submitterName = claim?.submitter?.full_name || null
        return (
            <tr className="text-sm hover:bg-secondary">
                <td className="px-4 py-3 text-foreground">
                    {claim?.project_name || '—'}
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-chart-5/20 text-chart-5">
                        個人
                    </span>
                </td>
                <td className="px-4 py-3 text-foreground/70">{claim?.vendor_name || '—'}</td>
                <td className="px-4 py-3 text-foreground/70">{claim?.expense_type || '—'}</td>
                <td className="px-4 py-3 text-foreground/70">{submitterName || claim?.vendor_name || '—'}</td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                    NT$ {(item.amount || claim?.total_amount || 0).toLocaleString()}
                </td>
            </tr>
        )
    }

    // 專案請款項目（原有邏輯）
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
        const bankInfo = (kol.bank_info || {}) as KolBankInfo
        if (bankInfo.bankType === 'company') {
            remittanceName = bankInfo.companyAccountName || kol.name
        } else {
            remittanceName = bankInfo.personalAccountName || kol.real_name || kol.name
        }
    }

    remittanceName = remittanceName || '未知匯款戶名'

    const amount = item.amount || request?.cost_amount || 0

    return (
        <tr className="text-sm hover:bg-secondary">
            <td className="px-4 py-3 text-foreground">{projectName}</td>
            <td className="px-4 py-3 text-foreground/70">{kolName}</td>
            <td className="px-4 py-3 text-foreground/70">{service}</td>
            <td className="px-4 py-3 text-foreground/70">{remittanceName}</td>
            <td className="px-4 py-3 text-right font-medium text-foreground">
                NT$ {amount.toLocaleString()}
            </td>
        </tr>
    )
}
