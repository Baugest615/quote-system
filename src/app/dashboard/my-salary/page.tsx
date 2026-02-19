'use client'

import { useState } from 'react'
import { usePermission } from '@/lib/permissions'
import { User, Calendar, Briefcase, TrendingUp, DollarSign, FileText, Clock, ChevronLeft } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import Link from 'next/link'
import { useMyEmployeeData } from '@/hooks/useMyEmployeeData'

const fmt = (n: number) => n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function MySalaryPage() {
  const { loading: permLoading, userId } = usePermission()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const { data, isLoading } = useMyEmployeeData(userId, selectedYear)
  const employee = data?.employee ?? null
  const currentSalary = data?.currentSalary ?? null
  const salaryHistory = data?.salaryHistory ?? []
  const paymentRequests = data?.paymentRequests ?? []
  const loading = permLoading || isLoading

  // 計算年資
  const calculateYearsOfService = (hireDate: string): string => {
    const hire = new Date(hireDate)
    const now = new Date()
    const years = now.getFullYear() - hire.getFullYear()
    const months = now.getMonth() - hire.getMonth()
    const totalMonths = years * 12 + months

    if (totalMonths < 12) {
      return `${totalMonths} 個月`
    }
    const y = Math.floor(totalMonths / 12)
    const m = totalMonths % 12
    return m > 0 ? `${y} 年 ${m} 個月` : `${y} 年`
  }

  if (loading) {
    return <AccountingLoadingGuard loading={true} isAdmin={true} />
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <User className="w-16 h-16 text-muted-foreground/60 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">找不到員工資料</h2>
            <p className="text-muted-foreground mb-6">您的帳號尚未關聯到員工檔案，請聯繫管理員協助設定</p>
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-primary hover:text-primary/80">
              <ChevronLeft className="w-4 h-4" />
              返回首頁
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 標題 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">我的薪資</h1>
            <p className="text-sm text-muted-foreground mt-1">查看個人薪資明細與歷史記錄</p>
          </div>
          <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
            返回首頁
          </Link>
        </div>

        {/* 個人資料卡 */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{employee.name}</h2>
                  <p className="text-blue-100">{employee.employee_number || '無員工編號'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-200" />
                  <span>{employee.position || '未設定職位'} · {employee.department || '未設定部門'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-200" />
                  <span>到職日：{employee.hire_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-200" />
                  <span>年資：{calculateYearsOfService(employee.hire_date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-200" />
                  <span>月薪：NT$ {fmt(employee.base_salary)}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                employee.status === '在職' ? 'bg-green-400 text-green-900' :
                employee.status === '留停' ? 'bg-yellow-400 text-yellow-900' :
                'bg-gray-400 text-gray-900'
              }`}>
                {employee.status}
              </span>
            </div>
          </div>
        </div>

        {/* 本月薪資明細 */}
        {currentSalary ? (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-success" />
              本月薪資明細 ({currentSalary.salary_month})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-chart-4/10 rounded-lg">
                <p className="text-xs text-chart-4 mb-1">本薪</p>
                <p className="text-xl font-bold text-chart-4">NT$ {fmt(currentSalary.base_salary)}</p>
              </div>
              <div className="p-4 bg-chart-1/10 rounded-lg">
                <p className="text-xs text-chart-1 mb-1">津貼</p>
                <p className="text-xl font-bold text-chart-1">NT$ {fmt(currentSalary.meal_allowance)}</p>
              </div>
              <div className="p-4 bg-chart-5/10 rounded-lg">
                <p className="text-xs text-chart-5 mb-1">獎金</p>
                <p className="text-xl font-bold text-chart-5">NT$ {fmt(currentSalary.bonus)}</p>
              </div>
              <div className="p-4 bg-destructive/10 rounded-lg">
                <p className="text-xs text-destructive mb-1">代扣款</p>
                <p className="text-xl font-bold text-destructive">NT$ {fmt(currentSalary.deduction)}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">勞保（個人）</span>
                  <span className="font-medium text-foreground">NT$ {fmt(currentSalary.labor_insurance_personal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">健保（個人）</span>
                  <span className="font-medium text-foreground">NT$ {fmt(currentSalary.health_insurance_personal)}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                <span className="text-lg font-semibold text-foreground">實領薪資</span>
                <span className="text-2xl font-bold text-success">NT$ {fmt(currentSalary.net_salary)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <DollarSign className="w-12 h-12 text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-muted-foreground">本月尚無薪資記錄</p>
          </div>
        )}

        {/* 薪資歷史 */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              薪資歷史
            </h3>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>
          </div>
          {salaryHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs">
                    <th className="text-left px-4 py-3">月份</th>
                    <th className="text-right px-4 py-3">本薪</th>
                    <th className="text-right px-4 py-3">津貼</th>
                    <th className="text-right px-4 py-3">獎金</th>
                    <th className="text-right px-4 py-3">勞保</th>
                    <th className="text-right px-4 py-3">健保</th>
                    <th className="text-right px-4 py-3 font-semibold">實領</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryHistory.map(s => (
                    <tr key={s.id} className="border-t border-border/50 hover:bg-accent">
                      <td className="px-4 py-3 text-foreground">{s.salary_month}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(s.base_salary)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(s.meal_allowance)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(s.bonus)}</td>
                      <td className="px-4 py-3 text-right text-destructive">-{fmt(s.labor_insurance_personal)}</td>
                      <td className="px-4 py-3 text-right text-destructive">-{fmt(s.health_insurance_personal)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-success">{fmt(s.net_salary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">本年度尚無薪資記錄</p>
          )}
        </div>

        {/* 個人請款記錄 */}
        {paymentRequests.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-chart-5" />
              我的請款記錄
            </h3>
            <div className="space-y-3">
              {paymentRequests.map(pr => (
                <div key={pr.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">
                      {pr.project_name || '未命名專案'} - {pr.service || '服務'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pr.kol_name && `${pr.kol_name} · `}
                      {new Date(pr.created_at).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">NT$ {fmt(pr.cost_amount)}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                      pr.verification_status === 'approved' ? 'bg-success/10 text-success' :
                      pr.verification_status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {pr.verification_status === 'approved' ? '已核准' :
                       pr.verification_status === 'rejected' ? '已拒絕' :
                       '待審核'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
