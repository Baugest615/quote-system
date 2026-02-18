'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { User, Calendar, Briefcase, TrendingUp, DollarSign, FileText, Clock, ChevronLeft } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import Link from 'next/link'
import type { Employee, AccountingPayroll } from '@/types/custom.types'

interface PaymentRequest {
  id: string
  cost_amount: number
  verification_status: string
  approved_at: string | null
  created_at: string
  kol_name: string | null
  project_name: string | null
  service: string | null
}

const fmt = (n: number) => n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function MySalaryPage() {
  const { userRole, loading: permLoading, userId } = usePermission()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [currentSalary, setCurrentSalary] = useState<AccountingPayroll | null>(null)
  const [salaryHistory, setSalaryHistory] = useState<AccountingPayroll[]>([])
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

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

  const fetchMyData = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    try {
      // 1. 查找對應的員工記錄（透過 created_by 或 email）
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()

      if (!profile) {
        toast.error('找不到使用者資料')
        return
      }

      // 透過 email 或 created_by 查找員工
      const { data: emp, error: empError } = await supabase
        .from('employees')
        .select('*')
        .or(`email.eq.${profile.email},created_by.eq.${userId}`)
        .eq('status', '在職')
        .single()

      if (empError || !emp) {
        console.error('查詢員工資料失敗:', empError)
        toast.error('找不到您的員工資料，請聯繫管理員')
        setLoading(false)
        return
      }

      setEmployee(emp)

      // 2. 查詢本月薪資（最新一筆）
      const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
      const { data: current } = await supabase
        .from('accounting_payroll')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('salary_month', currentMonth)
        .maybeSingle()

      setCurrentSalary(current)

      // 3. 查詢薪資歷史（選定年份）
      const { data: history, error: historyError } = await supabase
        .from('accounting_payroll')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('year', selectedYear)
        .order('salary_month', { ascending: false })

      if (!historyError) {
        setSalaryHistory(history || [])
      }

      // 4. 查詢個人請款記錄（透過 approved_by 或 quotation_items 關聯）
      const { data: payments } = await supabase
        .from('payment_requests')
        .select(`
          id,
          cost_amount,
          verification_status,
          approved_at,
          created_at,
          quotation_items:quotation_item_id (
            service,
            kols:kol_id (name),
            quotations:quotation_id (project_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10)

      if (payments) {
        setPaymentRequests(payments.map((p: any) => ({
          id: p.id,
          cost_amount: p.cost_amount,
          verification_status: p.verification_status,
          approved_at: p.approved_at,
          created_at: p.created_at,
          kol_name: p.quotation_items?.kols?.name || null,
          project_name: p.quotation_items?.quotations?.project_name || null,
          service: p.quotation_items?.service || null,
        })))
      }
    } catch (err) {
      console.error('載入資料失敗:', err)
      toast.error('載入資料失敗')
    } finally {
      setLoading(false)
    }
  }, [userId, selectedYear])

  useEffect(() => {
    if (!permLoading && userId) {
      fetchMyData()
    }
  }, [permLoading, userId, fetchMyData])

  if (permLoading || loading) {
    return <AccountingLoadingGuard loading={true} isAdmin={true} />
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">找不到員工資料</h2>
            <p className="text-gray-500 mb-6">您的帳號尚未關聯到員工檔案，請聯繫管理員協助設定</p>
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
              <ChevronLeft className="w-4 h-4" />
              返回首頁
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 標題 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">我的薪資</h1>
            <p className="text-sm text-gray-500 mt-1">查看個人薪資明細與歷史記錄</p>
          </div>
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
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
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              本月薪資明細 ({currentSalary.salary_month})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 mb-1">本薪</p>
                <p className="text-xl font-bold text-blue-700">NT$ {fmt(currentSalary.base_salary)}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-xs text-green-600 mb-1">津貼</p>
                <p className="text-xl font-bold text-green-700">NT$ {fmt(currentSalary.meal_allowance)}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-xs text-purple-600 mb-1">獎金</p>
                <p className="text-xl font-bold text-purple-700">NT$ {fmt(currentSalary.bonus)}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600 mb-1">代扣款</p>
                <p className="text-xl font-bold text-red-700">NT$ {fmt(currentSalary.deduction)}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">勞保（個人）</span>
                  <span className="font-medium text-gray-800">NT$ {fmt(currentSalary.labor_insurance_personal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">健保（個人）</span>
                  <span className="font-medium text-gray-800">NT$ {fmt(currentSalary.health_insurance_personal)}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-700">實領薪資</span>
                <span className="text-2xl font-bold text-green-600">NT$ {fmt(currentSalary.net_salary)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">本月尚無薪資記錄</p>
          </div>
        )}

        {/* 薪資歷史 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              薪資歷史
            </h3>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <tr className="bg-gray-50 text-gray-600 text-xs">
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
                    <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{s.salary_month}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(s.base_salary)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(s.meal_allowance)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(s.bonus)}</td>
                      <td className="px-4 py-3 text-right text-red-600">-{fmt(s.labor_insurance_personal)}</td>
                      <td className="px-4 py-3 text-right text-red-600">-{fmt(s.health_insurance_personal)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{fmt(s.net_salary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">本年度尚無薪資記錄</p>
          )}
        </div>

        {/* 個人請款記錄 */}
        {paymentRequests.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              我的請款記錄
            </h3>
            <div className="space-y-3">
              {paymentRequests.map(pr => (
                <div key={pr.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">
                      {pr.project_name || '未命名專案'} - {pr.service || '服務'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {pr.kol_name && `${pr.kol_name} · `}
                      {new Date(pr.created_at).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800">NT$ {fmt(pr.cost_amount)}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                      pr.verification_status === 'approved' ? 'bg-green-100 text-green-700' :
                      pr.verification_status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
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
