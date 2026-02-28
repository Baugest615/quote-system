'use client'

import { useState, useMemo } from 'react'
import { DollarSign, Download, Users, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PaymentConfirmation } from '@/lib/payments/types'
import type { WithholdingSettings, AccountingPayroll, AccountingExpense } from '@/types/custom.types'
import {
    getAvailableMonths,
    aggregateMonthlyRemittanceGroups,
    splitRemittanceGroups,
    exportBankTransferCsv,
} from '@/lib/payments/aggregation'
import { getBillingMonthKey } from '@/lib/payments/billingPeriod'
import { RemittanceGroupCard } from '../RemittanceGroupCard'

interface PaymentOverviewTabProps {
    confirmations: PaymentConfirmation[]
    withholdingRates?: WithholdingSettings | null
    payrollData?: AccountingPayroll[]
    expensesData?: AccountingExpense[]
}

export function PaymentOverviewTab({ confirmations, withholdingRates, payrollData, expensesData }: PaymentOverviewTabProps) {
    const availableMonths = useMemo(
        () => getAvailableMonths(confirmations, expensesData, payrollData),
        [confirmations, expensesData, payrollData]
    )

    const [selectedMonth, setSelectedMonth] = useState(() => {
        // 使用 10 日切點規則計算當前帳務月份（與 aggregation 一致）
        const currentBillingMonth = getBillingMonthKey(new Date())
        return availableMonths.includes(currentBillingMonth) ? currentBillingMonth : (availableMonths[0] || currentBillingMonth)
    })

    const groups = useMemo(
        () => aggregateMonthlyRemittanceGroups(confirmations, selectedMonth, withholdingRates, expensesData, payrollData),
        [confirmations, selectedMonth, withholdingRates, expensesData, payrollData]
    )

    const { personalGroups, companyGroups } = useMemo(
        () => splitRemittanceGroups(groups),
        [groups]
    )

    // 彙總數字
    const summary = useMemo(() => {
        let totalAmount = 0
        let totalTax = 0
        let totalInsurance = 0
        let totalFee = 0
        let netTotal = 0

        groups.forEach(g => {
            totalAmount += g.totalAmount
            totalTax += g.totalTax
            totalInsurance += g.totalInsurance
            totalFee += g.totalFee
            netTotal += g.netTotal
        })

        return { totalAmount, totalTax, totalInsurance, totalFee, netTotal }
    }, [groups])

    const hasAnyData = confirmations.length > 0
        || (expensesData && expensesData.length > 0)
        || (payrollData && payrollData.length > 0)

    if (!hasAnyData) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                目前沒有已確認的請款記錄
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* 月份選擇 + 匯出 */}
            <div className="flex items-center justify-between bg-card p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-info" />
                    <span className="font-medium text-foreground">{selectedMonth} 匯款總覽</span>
                    <span className="text-sm text-muted-foreground">
                        共 {groups.length} 個收款方
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="h-8 text-sm bg-secondary border border-border rounded px-2 text-foreground"
                    >
                        {availableMonths.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportBankTransferCsv(groups, selectedMonth)}
                        disabled={groups.length === 0}
                    >
                        <Download className="h-4 w-4 mr-1" />
                        匯款明細 CSV
                    </Button>
                </div>
            </div>

            {/* 彙總卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard label="匯款總額" value={summary.totalAmount} color="text-foreground" />
                <SummaryCard label="代扣所得稅" value={summary.totalTax} color="text-destructive" />
                <SummaryCard label="代扣健保" value={summary.totalInsurance} color="text-destructive" />
                <SummaryCard label="匯費合計" value={summary.totalFee} color="text-warning" />
                <SummaryCard label="實付總額" value={summary.netTotal} color="text-info" highlight />
            </div>

            {/* 個人匯款區塊 */}
            {personalGroups.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                        <Users className="h-5 w-5 text-info" />
                        個人匯款（{personalGroups.length} 筆）
                    </div>
                    <div className="space-y-3">
                        {personalGroups.map((group) => (
                            <RemittanceGroupCard
                                key={group.remittanceName}
                                group={group}
                                withholdingRates={withholdingRates}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 公司匯款區塊 */}
            {companyGroups.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                        <Building2 className="h-5 w-5 text-success" />
                        公司匯款（{companyGroups.length} 筆）
                    </div>
                    <div className="space-y-3">
                        {companyGroups.map((group) => (
                            <RemittanceGroupCard
                                key={group.remittanceName}
                                group={group}
                                withholdingRates={withholdingRates}
                            />
                        ))}
                    </div>
                </div>
            )}

            {groups.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    {selectedMonth} 沒有匯款資料
                </div>
            )}
        </div>
    )
}

function SummaryCard({ label, value, color, highlight }: {
    label: string
    value: number
    color: string
    highlight?: boolean
}) {
    return (
        <div className={`rounded-lg p-3 border ${highlight ? 'bg-info/5 border-info/25' : 'bg-secondary/50 border-border'}`}>
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className={`text-lg font-bold ${color}`}>
                NT$ {value.toLocaleString()}
            </div>
        </div>
    )
}
