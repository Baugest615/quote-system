import type { WithholdingPersonSummary } from '@/lib/payments/withholding-export'

interface PersonRowProps {
    person: WithholdingPersonSummary
}

export function PersonRow({ person }: PersonRowProps) {
    const statusBadge = () => {
        if (person.isCompanyAccount) {
            return <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded">公司戶免扣</span>
        }
        if (person.isExempt) {
            return <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">免扣（公會）</span>
        }
        if (person.incomeTaxWithheld > 0 || person.nhiSupplement > 0) {
            return <span className="text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded">已扣</span>
        }
        return <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">未達門檻</span>
    }

    return (
        <tr className="hover:bg-muted/30">
            <td className="px-3 py-2 font-medium">{person.remittanceName}</td>
            <td className="px-3 py-2 text-muted-foreground">{person.realName || '-'}</td>
            <td className="px-3 py-2 text-center">{statusBadge()}</td>
            <td className="px-3 py-2 text-right">NT$ {person.totalPayment.toLocaleString()}</td>
            <td className="px-3 py-2 text-right text-destructive">
                {person.incomeTaxWithheld > 0 ? `NT$ ${person.incomeTaxWithheld.toLocaleString()}` : '-'}
            </td>
            <td className="px-3 py-2 text-right text-destructive">
                {person.nhiSupplement > 0 ? `NT$ ${person.nhiSupplement.toLocaleString()}` : '-'}
            </td>
            <td className="px-3 py-2 text-muted-foreground text-xs">{person.confirmationDates.join(', ')}</td>
        </tr>
    )
}
