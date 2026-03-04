interface ReconciliationTableProps {
    totals: {
        totalTax: number
        totalNhi: number
        taxSettled: number
        nhiSettled: number
        taxOutstanding: number
        nhiOutstanding: number
    }
}

function StatusBadge({ total, outstanding }: { total: number; outstanding: number }) {
    if (total === 0) {
        return <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">無需繳納</span>
    }
    if (outstanding <= 0) {
        return <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded">已結清</span>
    }
    return <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">待繳</span>
}

export function ReconciliationTable({ totals }: ReconciliationTableProps) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-border rounded-lg overflow-hidden">
                <thead className="bg-secondary">
                    <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">稅別</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">應繳金額</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">已繳金額</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">差額</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">狀態</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">所得稅</td>
                        <td className="px-3 py-2 text-right">NT$ {totals.totalTax.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-success">NT$ {totals.taxSettled.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-medium ${totals.taxOutstanding > 0 ? 'text-warning' : totals.taxOutstanding < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            NT$ {totals.taxOutstanding.toLocaleString()}
                            {totals.taxOutstanding < 0 && ' (溢繳)'}
                        </td>
                        <td className="px-3 py-2 text-center">
                            <StatusBadge total={totals.totalTax} outstanding={totals.taxOutstanding} />
                        </td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">二代健保</td>
                        <td className="px-3 py-2 text-right">NT$ {totals.totalNhi.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-success">NT$ {totals.nhiSettled.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-medium ${totals.nhiOutstanding > 0 ? 'text-warning' : totals.nhiOutstanding < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            NT$ {totals.nhiOutstanding.toLocaleString()}
                            {totals.nhiOutstanding < 0 && ' (溢繳)'}
                        </td>
                        <td className="px-3 py-2 text-center">
                            <StatusBadge total={totals.totalNhi} outstanding={totals.nhiOutstanding} />
                        </td>
                    </tr>
                </tbody>
                <tfoot className="bg-muted/30 font-medium">
                    <tr>
                        <td className="px-3 py-2">合計</td>
                        <td className="px-3 py-2 text-right">NT$ {(totals.totalTax + totals.totalNhi).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-success">NT$ {(totals.taxSettled + totals.nhiSettled).toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right ${(totals.taxOutstanding + totals.nhiOutstanding) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                            NT$ {(totals.taxOutstanding + totals.nhiOutstanding).toLocaleString()}
                        </td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    )
}
