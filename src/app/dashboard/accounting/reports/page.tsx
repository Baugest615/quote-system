'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { FileText, ChevronLeft } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import Link from 'next/link'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3, CURRENT_YEAR - 4]

interface YearSummary {
  year: number
  totalSales: number
  totalExpenses: number
  totalPayroll: number
  totalProfit: number
  avgMargin: number
}

interface ExpenseBreakdown {
  year: number
  type: string
  amount: number
}

export default function AccountingReportsPage() {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const [summaries, setSummaries] = useState<YearSummary[]>([])
  const [breakdown, setBreakdown] = useState<ExpenseBreakdown[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.all(
        YEARS.map(async year => {
          const [salesRes, expensesRes, payrollRes] = await Promise.all([
            supabase.from('accounting_sales').select('sales_amount').eq('year', year),
            supabase.from('accounting_expenses').select('amount, expense_type').eq('year', year),
            supabase.from('accounting_payroll').select('net_salary, company_total').eq('year', year),
          ])
          const sales = salesRes.data || []
          const expenses = expensesRes.data || []
          const payroll = payrollRes.data || []

          const totalSales = sales.reduce((s, r) => s + (r.sales_amount || 0), 0)
          const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0)
          const totalPayroll = payroll.reduce((s, r) => s + (r.net_salary || 0) + (r.company_total || 0), 0)
          const totalProfit = totalSales - totalExpenses - totalPayroll
          const avgMargin = totalSales > 0 ? totalProfit / totalSales : 0

          // 各類支出分解
          const typeMap: Record<string, number> = {}
          expenses.forEach(e => {
            typeMap[e.expense_type] = (typeMap[e.expense_type] || 0) + (e.amount || 0)
          })
          const expBreakdown: ExpenseBreakdown[] = Object.entries(typeMap).map(([type, amount]) => ({ year, type, amount }))

          return {
            summary: { year, totalSales, totalExpenses, totalPayroll, totalProfit, avgMargin },
            breakdown: expBreakdown,
          }
        })
      )

      setSummaries(results.map(r => r.summary).filter(s => s.totalSales > 0 || s.totalExpenses > 0 || s.totalPayroll > 0))
      setBreakdown(results.flatMap(r => r.breakdown))
    } catch (err) {
      console.error('載入報表資料失敗:', err)
      toast.error('載入報表資料失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!permLoading && isAdmin) fetchData()
  }, [permLoading, isAdmin, fetchData])

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(n)
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`

  const maxSales = Math.max(...summaries.map(s => s.totalSales), 1)

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const EXPENSE_COLORS: Record<string, string> = {
    '專案支出': 'bg-blue-400',
    '勞務報酬': 'bg-purple-400',
    '其他支出': 'bg-yellow-400',
    '公司相關': 'bg-green-400',
    '沖帳免付': 'bg-muted-foreground',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-muted-foreground/60 hover:text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <FileText className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">歷年報表</h1>
          <p className="text-sm text-muted-foreground">年度比較與趨勢分析</p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : summaries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/60">
          <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
          <p>目前尚無歷年資料</p>
          <p className="text-sm mt-1">請先在各模組中新增資料</p>
        </div>
      ) : (
        <>
          {/* 年度比較橫條圖 */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">年度銷售收入比較</h2>
            <div className="space-y-3">
              {summaries.map(s => (
                <div key={s.year} className="flex items-center gap-3">
                  <span className="w-14 text-sm font-medium text-muted-foreground text-right">{s.year}</span>
                  <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width: `${(s.totalSales / maxSales) * 100}%` }}
                    >
                      {s.totalSales / maxSales > 0.2 && (
                        <span className="text-white text-xs font-medium">NT$ {fmt(s.totalSales)}</span>
                      )}
                    </div>
                  </div>
                  {s.totalSales / maxSales <= 0.2 && (
                    <span className="text-sm text-muted-foreground">NT$ {fmt(s.totalSales)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 年度摘要表格 */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <h2 className="font-semibold text-foreground">年度損益比較</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs">
                    <th className="text-left px-4 py-3">年度</th>
                    <th className="text-right px-4 py-3">銷售收入</th>
                    <th className="text-right px-4 py-3">支出成本</th>
                    <th className="text-right px-4 py-3">人事費用</th>
                    <th className="text-right px-4 py-3">年度利潤</th>
                    <th className="text-right px-4 py-3">毛利率</th>
                    <th className="text-center px-4 py-3">YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s, idx) => {
                    const prev = summaries[idx + 1]
                    const yoy = prev && prev.totalSales > 0
                      ? ((s.totalSales - prev.totalSales) / prev.totalSales)
                      : null
                    return (
                      <tr key={s.year} className="border-t border-border/50 hover:bg-accent">
                        <td className="px-4 py-3 font-semibold text-foreground">{s.year} 年</td>
                        <td className="px-4 py-3 text-right text-primary">NT$ {fmt(s.totalSales)}</td>
                        <td className="px-4 py-3 text-right text-destructive">NT$ {fmt(s.totalExpenses)}</td>
                        <td className="px-4 py-3 text-right text-chart-5">NT$ {fmt(s.totalPayroll)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${s.totalProfit >= 0 ? 'text-success' : 'text-orange-600'}`}>
                          NT$ {fmt(s.totalProfit)}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${s.avgMargin >= 0.3 ? 'text-success' : s.avgMargin >= 0.15 ? 'text-yellow-600' : 'text-destructive'}`}>
                          {s.totalSales > 0 ? pct(s.avgMargin) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {yoy !== null ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${yoy >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                              {yoy >= 0 ? '▲' : '▼'} {Math.abs(yoy * 100).toFixed(1)}%
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 各年度支出結構 */}
          {summaries.map(s => {
            const yearBreakdown = breakdown.filter(b => b.year === s.year)
            if (yearBreakdown.length === 0) return null
            const totalExpType = yearBreakdown.reduce((t, b) => t + b.amount, 0)
            return (
              <div key={`breakdown-${s.year}`} className="bg-card rounded-xl border border-border p-5">
                <h3 className="font-semibold text-foreground mb-3">{s.year} 年支出結構</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {yearBreakdown.sort((a, b) => b.amount - a.amount).map(b => (
                    <div key={b.type} className="text-center">
                      <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${EXPENSE_COLORS[b.type] || 'bg-muted-foreground'}`} />
                      <p className="text-xs text-muted-foreground">{b.type}</p>
                      <p className="text-sm font-semibold text-foreground">NT$ {fmt(b.amount)}</p>
                      <p className="text-xs text-muted-foreground/60">{totalExpType > 0 ? pct(b.amount / totalExpType) : '0%'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
