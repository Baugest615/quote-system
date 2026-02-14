'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { BarChart3, ChevronLeft, Search } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import Link from 'next/link'

const CURRENT_YEAR = new Date().getFullYear()

interface ProjectSummary {
  project_name: string
  total_sales: number
  total_expenses: number
  profit: number
  margin: number
  sales_count: number
  expense_count: number
}

export default function AccountingProjectsPage() {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const [year, setYear] = useState(CURRENT_YEAR)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [filtered, setFiltered] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<keyof Pick<ProjectSummary, 'total_sales' | 'profit' | 'margin'>>('total_sales')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [salesRes, expensesRes] = await Promise.all([
        supabase.from('accounting_sales').select('project_name, sales_amount').eq('year', year),
        supabase.from('accounting_expenses').select('project_name, amount').eq('year', year).not('project_name', 'is', null),
      ])

      const sales = salesRes.data || []
      const expenses = expensesRes.data || []

      // 整合所有專案名稱
      const allProjects = new Set([
        ...sales.map(s => s.project_name).filter(Boolean),
        ...expenses.map(e => e.project_name).filter(Boolean),
      ])

      const summaries: ProjectSummary[] = Array.from(allProjects).map(name => {
        const projectSales = sales.filter(s => s.project_name === name)
        const projectExpenses = expenses.filter(e => e.project_name === name)
        const totalSales = projectSales.reduce((s, r) => s + (r.sales_amount || 0), 0)
        const totalExpenses = projectExpenses.reduce((s, r) => s + (r.amount || 0), 0)
        const profit = totalSales - totalExpenses
        const margin = totalSales > 0 ? profit / totalSales : 0
        return {
          project_name: name,
          total_sales: totalSales,
          total_expenses: totalExpenses,
          profit,
          margin,
          sales_count: projectSales.length,
          expense_count: projectExpenses.length,
        }
      })

      setProjects(summaries)
    } catch (err) {
      console.error('載入專案資料失敗:', err)
      toast.error('載入專案資料失敗')
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    if (!permLoading && isAdmin) fetchData()
  }, [permLoading, isAdmin, fetchData])

  useEffect(() => {
    const q = search.toLowerCase()
    const result = projects
      .filter(p => p.project_name.toLowerCase().includes(q))
      .sort((a, b) => b[sortBy] - a[sortBy])
    setFiltered(result)
  }, [search, sortBy, projects])

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(Math.round(n))
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const totalSales = filtered.reduce((s, p) => s + p.total_sales, 0)
  const totalExpenses = filtered.reduce((s, p) => s + p.total_expenses, 0)
  const totalProfit = totalSales - totalExpenses
  const avgMargin = totalSales > 0 ? totalProfit / totalSales : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <BarChart3 className="w-7 h-7 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">專案損益</h1>
          <p className="text-sm text-gray-500">各案件收支毛利分析</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="total_sales">依銷售額排序</option>
          <option value="profit">依利潤排序</option>
          <option value="margin">依毛利率排序</option>
        </select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋專案名稱..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '總銷售收入', value: fmt(totalSales), color: 'bg-blue-50 text-blue-700' },
          { label: '總支出成本', value: fmt(totalExpenses), color: 'bg-red-50 text-red-700' },
          { label: '整體利潤', value: fmt(totalProfit), color: totalProfit >= 0 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700' },
          { label: '平均毛利率', value: pct(avgMargin), color: 'bg-purple-50 text-purple-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl p-4 text-center ${color}`}>
            <p className="text-xs font-medium mb-1 opacity-70">{label}</p>
            <p className="text-xl font-bold">{label.includes('率') ? value : `NT$ ${value}`}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">載入中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="text-left px-4 py-3">專案名稱</th>
                  <th className="text-right px-4 py-3">銷售收入</th>
                  <th className="text-right px-4 py-3">支出成本</th>
                  <th className="text-right px-4 py-3">利潤</th>
                  <th className="text-right px-4 py-3">毛利率</th>
                  <th className="text-center px-4 py-3">毛利率視覺</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">尚無資料</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.project_name} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-64 truncate">{p.project_name}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{p.total_sales > 0 ? `NT$ ${fmt(p.total_sales)}` : '-'}</td>
                    <td className="px-4 py-3 text-right text-red-500">{p.total_expenses > 0 ? `NT$ ${fmt(p.total_expenses)}` : '-'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${p.profit >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                      NT$ {fmt(p.profit)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${p.margin >= 0.3 ? 'text-green-600' : p.margin >= 0.15 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {p.total_sales > 0 ? pct(p.margin) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {p.total_sales > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${p.margin >= 0.3 ? 'bg-green-500' : p.margin >= 0.15 ? 'bg-yellow-500' : 'bg-red-400'}`}
                            style={{ width: `${Math.max(0, Math.min(100, p.margin * 100))}%` }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
