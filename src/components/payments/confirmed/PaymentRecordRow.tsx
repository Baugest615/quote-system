import { PaymentConfirmationItem } from '@/lib/payments/types'
import { type KolBankInfo } from '@/types/schemas'

// merge_color → border-left HSL color (same mapping as RequestItemRow)
const MERGE_BORDER_COLORS: Record<string, string> = {
    'bg-chart-1/15': 'hsl(var(--chart-1))',
    'bg-chart-2/15': 'hsl(var(--chart-2))',
    'bg-chart-3/15': 'hsl(var(--chart-3))',
    'bg-chart-4/15': 'hsl(var(--chart-4))',
    'bg-chart-5/15': 'hsl(var(--chart-5))',
    'bg-destructive/15': 'hsl(var(--destructive))',
}

const MERGE_BADGE_COLORS: Record<string, string> = {
    'bg-chart-1/15': 'bg-[hsl(var(--chart-1))]/20 text-[hsl(var(--chart-1))]',
    'bg-chart-2/15': 'bg-[hsl(var(--chart-2))]/20 text-[hsl(var(--chart-2))]',
    'bg-chart-3/15': 'bg-[hsl(var(--chart-3))]/20 text-[hsl(var(--chart-3))]',
    'bg-chart-4/15': 'bg-[hsl(var(--chart-4))]/20 text-[hsl(var(--chart-4))]',
    'bg-chart-5/15': 'bg-[hsl(var(--chart-5))]/20 text-[hsl(var(--chart-5))]',
    'bg-destructive/15': 'bg-destructive/20 text-destructive',
}

interface PaymentRecordRowProps {
    item: PaymentConfirmationItem
    groupLabel?: string
}

export function PaymentRecordRow({ item, groupLabel }: PaymentRecordRowProps) {
    // 個人報帳項目
    if (item.source_type === 'personal' || item.expense_claim_id) {
        const claim = item.expense_claims
        const submitterName = claim?.submitter?.full_name || null
        return (
            <tr className="text-sm hover:bg-secondary">
                <td className="px-4 py-3 text-foreground">
                    <div>
                        {claim?.project_name || '—'}
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-chart-5/20 text-chart-5">
                            個人
                        </span>
                    </div>
                    {claim?.note && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-48" title={claim.note}>
                            {claim.note}
                        </p>
                    )}
                </td>
                <td className="px-4 py-3 text-foreground/70">{claim?.vendor_name || '—'}</td>
                <td className="px-4 py-3 text-foreground/70">{claim?.expense_type || '—'}</td>
                <td className="px-4 py-3 text-foreground/70">{submitterName || claim?.vendor_name || '—'}</td>
                <td className="px-4 py-3 text-foreground/70 max-w-40 truncate" title={claim?.note || ''}>{claim?.note || '—'}</td>
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
    const remark = quotationItem?.remark || null

    // 合併群組視覺標記
    const mergeGroupId = request?.merge_group_id
    const mergeColor = request?.merge_color
    const borderColor = mergeGroupId && mergeColor
        ? MERGE_BORDER_COLORS[mergeColor] || 'hsl(var(--info))'
        : undefined
    const badgeClass = mergeGroupId && mergeColor
        ? MERGE_BADGE_COLORS[mergeColor] || 'bg-info/15 text-info'
        : 'bg-info/15 text-info'

    return (
        <tr
            className="text-sm hover:bg-secondary"
            style={borderColor ? { borderLeft: `4px solid ${borderColor}` } : undefined}
        >
            <td className="px-4 py-3 text-foreground">
                {projectName}
                {mergeGroupId && groupLabel && (
                    <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}>
                        合併 {groupLabel}
                    </span>
                )}
            </td>
            <td className="px-4 py-3 text-foreground/70">{kolName}</td>
            <td className="px-4 py-3 text-foreground/70">{service}</td>
            <td className="px-4 py-3 text-foreground/70">{remittanceName}</td>
            <td className="px-4 py-3 text-foreground/70 max-w-40 truncate" title={remark || ''}>{remark || '—'}</td>
            <td className="px-4 py-3 text-right font-medium text-foreground">
                NT$ {amount.toLocaleString()}
            </td>
        </tr>
    )
}
