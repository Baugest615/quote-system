'use client'

import { useMemo, useState } from 'react'
import { Users, ChevronDown, ChevronRight } from 'lucide-react'
import type { AccountingPayroll } from '@/types/custom.types'
import { getBillingMonthKey } from '@/lib/payments/billingPeriod'

interface PayrollSectionProps {
  payrollData: AccountingPayroll[]
  selectedMonth: string // YYYY-MM
}

interface EmployeeSummary {
  name: string
  totalNet: number
  count: number
}

export function PayrollSection({ payrollData, selectedMonth }: PayrollSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // 篩選該帳務期間的薪資項目
  const monthPayroll = useMemo(() => {
    return payrollData.filter(p => {
      if (!p.payment_date) return false
      return getBillingMonthKey(p.payment_date) === selectedMonth
    })
  }, [payrollData, selectedMonth])

  // 按員工名稱整合總計
  const employeeSummaries = useMemo(() => {
    const map = new Map<string, EmployeeSummary>()
    for (const p of monthPayroll) {
      const name = p.employee_name || '未知'
      const existing = map.get(name)
      if (existing) {
        existing.totalNet += p.net_salary || 0
        existing.count += 1
      } else {
        map.set(name, { name, totalNet: p.net_salary || 0, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalNet - a.totalNet)
  }, [monthPayroll])

  const total = useMemo(() =>
    employeeSummaries.reduce((sum, e) => sum + e.totalNet, 0),
    [employeeSummaries]
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
        人事薪資（{employeeSummaries.length} 人 / NT$ {total.toLocaleString()}）
        <span className="text-xs text-muted-foreground font-normal ml-1">僅檢視</span>
      </button>

      {isExpanded && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3 font-medium">員工姓名</th>
                  <th className="text-right px-4 py-3 font-medium">實領薪資</th>
                </tr>
              </thead>
              <tbody>
                {employeeSummaries.map(emp => (
                  <tr key={emp.name} className="border-t border-border/50 hover:bg-accent">
                    <td className="px-4 py-3 font-medium text-foreground">{emp.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-chart-5">
                      NT$ {emp.totalNet.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50">
                  <td className="px-4 py-3 font-bold text-foreground">
                    合計（{employeeSummaries.length} 人）
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-chart-5">
                    NT$ {total.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
