import { DollarSign, FileText, TrendingUp, Calendar } from 'lucide-react'
import { PaymentConfirmation } from '@/lib/payments/types'

interface PaymentStatsProps {
    confirmations: PaymentConfirmation[]
}

export function PaymentStats({ confirmations }: PaymentStatsProps) {
    // 計算統計數據
    const stats = confirmations.reduce(
        (acc, curr) => ({
            totalAmount: acc.totalAmount + (curr.total_amount || 0),
            totalItems: acc.totalItems + (curr.total_items || 0),
            count: acc.count + 1,
            thisMonthAmount: acc.thisMonthAmount + (
                new Date(curr.confirmation_date).getMonth() === new Date().getMonth()
                    ? (curr.total_amount || 0)
                    : 0
            )
        }),
        { totalAmount: 0, totalItems: 0, count: 0, thisMonthAmount: 0 }
    )

    const averageAmount = stats.count > 0 ? Math.round(stats.totalAmount / stats.count) : 0

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-card p-4 rounded-lg shadow border border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">總確認金額</p>
                        <p className="text-2xl font-bold text-info mt-1">
                            NT$ {stats.totalAmount.toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-info/15 p-2 rounded-full">
                        <DollarSign className="h-6 w-6 text-info" />
                    </div>
                </div>
            </div>

            <div className="bg-card p-4 rounded-lg shadow border border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">本月確認金額</p>
                        <p className="text-2xl font-bold text-success mt-1">
                            NT$ {stats.thisMonthAmount.toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-success/15 p-2 rounded-full">
                        <Calendar className="h-6 w-6 text-success" />
                    </div>
                </div>
            </div>

            <div className="bg-card p-4 rounded-lg shadow border border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">總確認筆數</p>
                        <p className="text-2xl font-bold text-foreground mt-1">
                            {stats.count} 筆清單
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            共 {stats.totalItems} 個項目
                        </p>
                    </div>
                    <div className="bg-chart-4/15 p-2 rounded-full">
                        <FileText className="h-6 w-6 text-chart-4" />
                    </div>
                </div>
            </div>

            <div className="bg-card p-4 rounded-lg shadow border border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">平均單筆金額</p>
                        <p className="text-2xl font-bold text-warning mt-1">
                            NT$ {averageAmount.toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-warning/15 p-2 rounded-full">
                        <TrendingUp className="h-6 w-6 text-warning" />
                    </div>
                </div>
            </div>
        </div>
    )
}
