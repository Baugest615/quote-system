'use client'

import { useMemo, useState } from 'react'
import { Users, ChevronDown, ChevronRight } from 'lucide-react'
import type { AccountingPayroll } from '@/types/custom.types'
import { getBillingMonthKey } from '@/lib/payments/billingPeriod'
import { PaymentStatusBadge } from '@/components/accounting/monthly-settlement/PaymentStatusBadge'

interface PayrollSectionProps {
  payrollData: AccountingPayroll[]
  selectedMonth: string // YYYY-MM
}

export function PayrollSection({ payrollData, selectedMonth }: PayrollSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // 篩選該帳務期間的薪資項目（使用 payment_date 的帳務期間）
  const monthPayroll = useMemo(() => {
    return payrollData.filter(p => {
      if (!p.payment_date) return false
      return getBillingMonthKey(p.payment_date) === selectedMonth
    })
  }, [payrollData, selectedMonth])

  const total = useMemo(() =>
    monthPayroll.reduce((sum, p) => sum + (p.net_salary || 0), 0),
    [monthPayroll]
  )

  if (monthPayroll.length === 0) return null

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-foreground font-medium hover:text-foreground/80 transition-colors"
      >
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Users className="h-5 w-5 text-chart-5" />
        人事薪資（{monthPayroll.length} 筆 / NT$ {total.toLocaleString()}）
        <span className="text-xs text-muted-foreground font-normal ml-1">僅檢視</span>
      </button>

      {isExpanded && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3 font-medium">員工姓名</th>
                  <th className="text-left px-4 py-3 font-medium">薪資月份</th>
                  <th className="text-right px-4 py-3 font-medium">底薪</th>
                  <th className="text-right px-4 py-3 font-medium">餐費</th>
                  <th className="text-right px-4 py-3 font-medium">實領薪資</th>
                  <th className="text-left px-4 py-3 font-medium">匯款日</th>
                  <th className="text-center px-4 py-3 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {monthPayroll.map(p => (
                  <tr key={p.id} className="border-t border-border/50 hover:bg-accent">
                    <td className="px-4 py-3 font-medium text-foreground">{p.employee_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.salary_month || '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">NT$ {(p.base_salary || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">NT$ {(p.meal_allowance || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-chart-5">NT$ {(p.net_salary || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.payment_date || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <PaymentStatusBadge status={p.payment_status || 'unpaid'} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50">
                  <td className="px-4 py-3 font-bold text-foreground" colSpan={4}>
                    合計（{monthPayroll.length} 人）
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-chart-5">
                    NT$ {total.toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
