'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign,
  FileText, Receipt, Users, Calculator, BarChart3, ArrowRight, Landmark
} from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'

interface MonthlySummary {
  month: string
  sales: number
  expenses: number
  payroll: number
  profit: number
}

interface AnnualTotals {
  totalSales: number
  totalExpenses: number
  totalPayroll: number
  totalProfit: number
  salesCount: number
  expensesCount: number
  payrollCount: number
}

const CURRENT_YEAR = new Date().getFullYear()

export default function AccountingPage() {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const [year, setYear] = useState(CURRENT_YEAR)

  const { data: rawData, isLoading: queryLoading } = useQuery({
    queryKey: [...queryKeys.accountingOverview(year)],
    queryFn: async () => {
      const [salesRes, expensesRes, payrollRes] = await Promise.all([
        supabase.from('accounting_sales').select('invoice_month, sales_amount, total_amount').eq('year', year),
        supabase.from('accounting_expenses').select('expense_month, amount, total_amount').eq('year', year),
        supabase.from('accounting_payroll').select('salary_month, net_salary, company_total').eq('year', year),
      ])
      return {
        sales: salesRes.data || [],
        expenses: expensesRes.data || [],
        payroll: payrollRes.data || [],
      }
    },
    enabled: !permLoading && isAdmin,
  })

  const totals = useMemo<AnnualTotals>(() => {
    if (!rawData) return { totalSales: 0, totalExpenses: 0, totalPayroll: 0, totalProfit: 0, salesCount: 0, expensesCount: 0, payrollCount: 0 }
    const { sales, expenses, payroll } = rawData
    const totalSales = sales.reduce((s, r) => s + (r.sales_amount || 0), 0)
    const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0)
    const totalPayroll = payroll.reduce((s, r) => s + (r.net_salary || 0) + (r.company_total || 0), 0)
    return { totalSales, totalExpenses, totalPayroll, totalProfit: totalSales - totalExpenses - totalPayroll, salesCount: sales.length, expensesCount: expenses.length, payrollCount: payroll.length }
  }, [rawData])

  const monthlySummary = useMemo<MonthlySummary[]>(() => {
    if (!rawData) return []
    const { sales, expenses, payroll } = rawData
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
    return months.map((m) => {
      const label = `${year}年${m}`
      const s = sales.filter(r => r.invoice_month === label).reduce((a, r) => a + (r.sales_amount || 0), 0)
      const e = expenses.filter(r => r.expense_month === label).reduce((a, r) => a + (r.amount || 0), 0)
      const p = payroll.filter(r => r.salary_month === label).reduce((a, r) => a + (r.net_salary || 0) + (r.company_total || 0), 0)
      return { month: m, sales: s, expenses: e, payroll: p, profit: s - e - p }
    })
  }, [rawData, year])

  const loading = queryLoading
  const isLoading = permLoading || loading

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(n)

  const subModules = [
    { href: '/dashboard/accounting/sales', icon: Receipt, label: '銷項管理', desc: '發票開立記錄', color: 'bg-chart-4/10 text-chart-4' },
    { href: '/dashboard/accounting/expenses', icon: TrendingDown, label: '進項管理', desc: '各類支出記錄', color: 'bg-chart-3/10 text-chart-3' },
    { href: '/dashboard/accounting/payroll', icon: Users, label: '人事薪資', desc: '員工薪資與勞健保', color: 'bg-chart-5/10 text-chart-5' },
    { href: '/dashboard/accounting/monthly-settlement', icon: Landmark, label: '月結總覽', desc: '月度付款結算追蹤', color: 'bg-orange-500/10 text-orange-400' },
    { href: '/dashboard/accounting/projects', icon: BarChart3, label: '專案損益', desc: '各案件收支毛利', color: 'bg-chart-1/10 text-chart-1' },
    { href: '/dashboard/accounting/calculator', icon: Calculator, label: '利潤試算', desc: '報價毛利換算工具', color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400' },
    { href: '/dashboard/accounting/reports', icon: FileText, label: '歷年報表', desc: '年度比較與趨勢', color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  ]

  return (
    <AccountingLoadingGuard loading={isLoading} isAdmin={hasRole('Admin')}>
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">帳務管理</h1>
            <p className="text-sm text-muted-foreground">年度收支總覽 · 僅限管理員</p>
          </div>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
            <option key={y} value={y}>{y} 年</option>
          ))}
        </select>
      </div>

      {/* 年度摘要卡片 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-chart-4/10 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-chart-4" />
              <span className="text-sm text-chart-4 font-medium">年度銷售收入</span>
            </div>
            <p className="text-2xl font-bold text-chart-4">{fmt(totals.totalSales)}</p>
            <p className="text-xs text-chart-4/70 mt-1">{totals.salesCount} 筆銷項</p>
          </div>
          <div className="bg-chart-3/10 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-5 h-5 text-chart-3" />
              <span className="text-sm text-chart-3 font-medium">年度支出成本</span>
            </div>
            <p className="text-2xl font-bold text-chart-3">{fmt(totals.totalExpenses)}</p>
            <p className="text-xs text-chart-3/70 mt-1">{totals.expensesCount} 筆進項</p>
          </div>
          <div className="bg-chart-5/10 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-chart-5" />
              <span className="text-sm text-chart-5 font-medium">人事費用</span>
            </div>
            <p className="text-2xl font-bold text-chart-5">{fmt(totals.totalPayroll)}</p>
            <p className="text-xs text-chart-5/70 mt-1">{totals.payrollCount} 筆薪資</p>
          </div>
          <div className={`rounded-xl p-5 ${totals.totalProfit >= 0 ? 'bg-chart-1/10' : 'bg-orange-50 dark:bg-orange-500/10'}`}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className={`w-5 h-5 ${totals.totalProfit >= 0 ? 'text-chart-1' : 'text-orange-600 dark:text-orange-400'}`} />
              <span className={`text-sm font-medium ${totals.totalProfit >= 0 ? 'text-chart-1' : 'text-orange-600 dark:text-orange-400'}`}>年度利潤</span>
            </div>
            <p className={`text-2xl font-bold ${totals.totalProfit >= 0 ? 'text-chart-1' : 'text-orange-700 dark:text-orange-400'}`}>{fmt(totals.totalProfit)}</p>
            <p className={`text-xs mt-1 ${totals.totalProfit >= 0 ? 'text-chart-1/70' : 'text-orange-500 dark:text-orange-400/70'}`}>
              毛利率 {totals.totalSales > 0 ? ((totals.totalProfit / totals.totalSales) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      )}

      {/* 每月摘要表格 */}
      {!loading && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold text-foreground">{year} 年每月收支摘要</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3">月份</th>
                  <th className="text-right px-4 py-3">銷售收入</th>
                  <th className="text-right px-4 py-3">支出成本</th>
                  <th className="text-right px-4 py-3">人事費用</th>
                  <th className="text-right px-4 py-3">當月利潤</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((row) => (
                  <tr key={row.month} className="border-t border-border/50 hover:bg-accent">
                    <td className="px-4 py-3 font-medium text-foreground">{row.month}</td>
                    <td className="px-4 py-3 text-right text-chart-4">{row.sales > 0 ? fmt(row.sales) : '-'}</td>
                    <td className="px-4 py-3 text-right text-chart-3">{row.expenses > 0 ? fmt(row.expenses) : '-'}</td>
                    <td className="px-4 py-3 text-right text-chart-5">{row.payroll > 0 ? fmt(row.payroll) : '-'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${row.profit >= 0 ? 'text-chart-1' : 'text-orange-600 dark:text-orange-400'}`}>
                      {row.sales > 0 || row.expenses > 0 || row.payroll > 0 ? fmt(row.profit) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 子模組入口 */}
      <div>
        <h2 className="font-semibold text-foreground mb-3">功能模組</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subModules.map(({ href, icon: Icon, label, desc, color }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-border transition-all group"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
    </AccountingLoadingGuard>
  )
}
