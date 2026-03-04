import { CheckCircle2 } from 'lucide-react'

interface Settlement {
    id: string
    type: string
    amount: number
    month: string
    note?: string | null
    settlement_method?: string
    settled_at?: string | null
}

interface SettlementHistoryListProps {
    settlements: Settlement[]
    selectedMonth: string
    hasOutstanding: boolean
}

export function SettlementHistoryList({ settlements, selectedMonth, hasOutstanding }: SettlementHistoryListProps) {
    if (settlements.length > 0) {
        return (
            <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">繳納記錄（{settlements.length} 筆）</div>
                <div className="space-y-1.5">
                    {settlements.map(s => (
                        <div key={s.id} className="flex items-center justify-between text-sm bg-muted/20 rounded-lg px-4 py-2.5 border border-border/50">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                            {s.type === 'income_tax' ? '所得稅' : '二代健保'}
                                        </span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                            s.settlement_method === 'company_direct'
                                                ? 'bg-info/15 text-info'
                                                : 'bg-warning/15 text-warning'
                                        }`}>
                                            {s.settlement_method === 'company_direct' ? '公司直接繳' : '員工代墊'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        所屬月份：{s.month}
                                        {s.note && ` · ${s.note}`}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium">NT$ {s.amount.toLocaleString()}</div>
                                <div className="text-xs text-muted-foreground">
                                    {s.settled_at ? new Date(s.settled_at).toLocaleDateString('zh-TW') : ''}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (hasOutstanding) {
        return (
            <div className="text-center py-4 text-sm text-muted-foreground bg-muted/10 rounded-lg border border-dashed border-border">
                {selectedMonth} 尚無繳納記錄。請使用上方「標記已繳」或透過「個人報帳 → 代扣代繳」提交。
            </div>
        )
    }

    return null
}
