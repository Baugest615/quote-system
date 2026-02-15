'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Search, Users, Pencil, Trash2, ChevronLeft, UserCheck, UserX } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import Link from 'next/link'
import type { Employee, EmploymentType, EmployeeStatus, Gender, InsuranceRateTable } from '@/types/custom.types'

const PAGE_SIZE = 20

const EMPLOYMENT_TYPES: EmploymentType[] = ['全職', '兼職', '約聘', '實習']
const EMPLOYEE_STATUS_OPTIONS: EmployeeStatus[] = ['在職', '留停', '離職']
const GENDER_OPTIONS: Gender[] = ['男', '女', '其他']

// 投保級距選項（1-60 級，動態從資料庫載入）
const INSURANCE_GRADES = Array.from({ length: 60 }, (_, i) => i + 1)

const emptyForm = (): Partial<Employee> => ({
  name: '',
  id_number: '',
  birth_date: null,
  gender: null,
  phone: '',
  email: '',
  address: '',
  emergency_contact: '',
  emergency_phone: '',
  employee_number: '',
  hire_date: new Date().toISOString().split('T')[0],
  resignation_date: null,
  position: '',
  department: '',
  employment_type: '全職',
  status: '在職',
  base_salary: 0,
  meal_allowance: 0,
  insurance_grade: null,
  has_labor_insurance: true,
  has_health_insurance: true,
  bank_name: '',
  bank_branch: '',
  bank_account: '',
  note: '',
})

export default function EmployeesPage() {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filtered, setFiltered] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | 'all'>('在職')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<Partial<Employee>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [insuranceRates, setInsuranceRates] = useState<InsuranceRateTable[]>([])

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('hire_date', { ascending: false })
      if (error) throw error
      setEmployees(data || [])
    } catch (err) {
      console.error('載入員工資料失敗:', err)
      toast.error('載入員工資料失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchInsuranceRates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('insurance_rate_tables')
        .select('*')
        .order('grade', { ascending: true })
      if (error) throw error
      setInsuranceRates(data || [])
    } catch (err) {
      console.error('載入費率表失敗:', err)
    }
  }, [])

  // 根據本薪自動推薦投保級距
  const suggestInsuranceGrade = (salary: number): number | null => {
    if (!salary || salary <= 0 || insuranceRates.length === 0) return null

    // 找出最接近且大於等於薪資的級距
    const matchedRate = insuranceRates.find(rate => rate.monthly_salary >= salary)

    // 如果找到匹配的級距，返回該級距
    if (matchedRate) return matchedRate.grade

    // 如果薪資超過所有級距，返回最高級距
    return insuranceRates[insuranceRates.length - 1]?.grade || null
  }

  useEffect(() => {
    if (!permLoading && isAdmin) {
      fetchEmployees()
      fetchInsuranceRates()
    }
  }, [permLoading, isAdmin, fetchEmployees, fetchInsuranceRates])

  useEffect(() => {
    const q = search.toLowerCase()
    let result = employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.employee_number || '').toLowerCase().includes(q) ||
      (e.position || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)
    )
    if (statusFilter !== 'all') {
      result = result.filter(e => e.status === statusFilter)
    }
    setFiltered(result)
    setCurrentPage(1)
  }, [search, statusFilter, employees])

  const updateForm = (updates: Partial<Employee>) => {
    setForm(f => ({ ...f, ...updates }))
  }

  const handleSave = async () => {
    if (!form.name?.trim()) return toast.error('請填寫員工姓名')
    if (!form.hire_date) return toast.error('請填寫到職日')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 清理空字串，轉換為 null（避免資料庫驗證錯誤）
      const payload = {
        ...form,
        id_number: form.id_number?.trim() || null,
        employee_number: form.employee_number?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        emergency_contact: form.emergency_contact?.trim() || null,
        emergency_phone: form.emergency_phone?.trim() || null,
        position: form.position?.trim() || null,
        department: form.department?.trim() || null,
        bank_name: form.bank_name?.trim() || null,
        bank_branch: form.bank_branch?.trim() || null,
        bank_account: form.bank_account?.trim() || null,
        note: form.note?.trim() || null,
        created_by: user?.id
      }

      if (editing) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editing.id)
        if (error) {
          console.error('更新失敗詳細錯誤:', error)
          throw error
        }
        toast.success('已更新員工資料')
      } else {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) {
          console.error('新增失敗詳細錯誤:', error)
          throw error
        }
        toast.success('已新增員工')
      }
      setIsModalOpen(false)
      fetchEmployees()
    } catch (err: any) {
      console.error('員工儲存失敗完整錯誤:', err)
      // 顯示更詳細的錯誤訊息
      const errorMessage = err.message || err.error_description || '儲存失敗，請重試'
      toast.error(`儲存失敗：${errorMessage}`)

      // 如果是唯一性約束錯誤，給出更友善的提示
      if (err.message?.includes('duplicate') || err.code === '23505') {
        if (err.message.includes('employee_number')) {
          toast.error('員工編號已存在，請使用其他編號')
        } else if (err.message.includes('id_number')) {
          toast.error('身分證字號已存在')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這位員工嗎？此操作無法復原。')) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) { toast.error('刪除失敗'); return }
    toast.success('已刪除')
    fetchEmployees()
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const activeCount = filtered.filter(e => e.status === '在職').length
  const totalBaseSalary = filtered.filter(e => e.status === '在職').reduce((s, e) => s + (e.base_salary || 0), 0)

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Users className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">員工管理</h1>
          <p className="text-sm text-gray-500">管理員工基本資料、薪資結構與勞健保級距</p>
        </div>
      </div>

      {/* 操作列 */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EmployeeStatus | 'all')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">全部狀態</option>
          <option value="在職">在職</option>
          <option value="留停">留停</option>
          <option value="離職">離職</option>
        </select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="搜尋姓名、員工編號、職位..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true) }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" />
          新增員工
        </button>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-xs text-blue-500 mb-1">在職員工人數</p>
          <p className="text-lg font-bold text-blue-700">{activeCount} 人</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <p className="text-xs text-green-500 mb-1">本薪總計（在職）</p>
          <p className="text-lg font-bold text-green-700">NT$ {fmt(totalBaseSalary)}</p>
        </div>
        <div className="bg-gray-100 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">員工總數</p>
          <p className="text-lg font-bold text-gray-700">{filtered.length} 人</p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-left px-4 py-3">員工編號</th>
                <th className="text-left px-4 py-3">姓名</th>
                <th className="text-left px-4 py-3">職位</th>
                <th className="text-left px-4 py-3">部門</th>
                <th className="text-left px-4 py-3">狀態</th>
                <th className="text-right px-4 py-3">本薪</th>
                <th className="text-center px-4 py-3">投保級距</th>
                <th className="text-center px-4 py-3">勞/健保</th>
                <th className="text-left px-4 py-3">到職日</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">尚無員工資料</td></tr>
              ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(e => (
                <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{e.employee_number || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{e.name}</td>
                  <td className="px-4 py-3 text-gray-600">{e.position || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{e.department || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      e.status === '在職' ? 'bg-green-100 text-green-700' :
                      e.status === '留停' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {e.status === '在職' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">NT$ {fmt(e.base_salary || 0)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{e.insurance_grade ? `第 ${e.insurance_grade} 級` : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        e.has_labor_insurance ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                      }`}>勞</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        e.has_health_insurance ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>健</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.hire_date || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setEditing(e); setForm({ ...e }); setIsModalOpen(true) }} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filtered.length / PAGE_SIZE)}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modal */}
      <AccountingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? '編輯員工資料' : '新增員工'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* 基本資料 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">基本資料</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">員工姓名 *</label>
              <input type="text" value={form.name || ''} onChange={(e) => updateForm({ name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="姓名" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">員工編號</label>
              <input type="text" value={form.employee_number || ''} onChange={(e) => updateForm({ employee_number: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如 EMP001" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">性別</label>
              <select value={form.gender || ''} onChange={(e) => updateForm({ gender: e.target.value as Gender })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- 選擇 --</option>
                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">生日</label>
              <input type="date" value={form.birth_date || ''} onChange={(e) => updateForm({ birth_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">身分證字號</label>
              <input type="text" value={form.id_number || ''} onChange={(e) => updateForm({ id_number: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="A123456789" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">電話</label>
              <input type="tel" value={form.phone || ''} onChange={(e) => updateForm({ phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0912345678" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email || ''} onChange={(e) => updateForm({ email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="email@example.com" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">地址</label>
            <input type="text" value={form.address || ''} onChange={(e) => updateForm({ address: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="完整地址" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">緊急聯絡人</label>
              <input type="text" value={form.emergency_contact || ''} onChange={(e) => updateForm({ emergency_contact: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="姓名" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">緊急聯絡電話</label>
              <input type="tel" value={form.emergency_phone || ''} onChange={(e) => updateForm({ emergency_phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0912345678" />
            </div>
          </div>

          {/* 僱用資料 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-4">僱用資料</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">到職日 *</label>
              <input type="date" value={form.hire_date || ''} onChange={(e) => updateForm({ hire_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">僱用類型</label>
              <select value={form.employment_type || '全職'} onChange={(e) => updateForm({ employment_type: e.target.value as EmploymentType })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">狀態</label>
              <select value={form.status || '在職'} onChange={(e) => updateForm({ status: e.target.value as EmployeeStatus })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {EMPLOYEE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">職位</label>
              <input type="text" value={form.position || ''} onChange={(e) => updateForm({ position: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如：專案經理" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">部門</label>
              <input type="text" value={form.department || ''} onChange={(e) => updateForm({ department: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如：業務部" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">離職日</label>
              <input type="date" value={form.resignation_date || ''} onChange={(e) => updateForm({ resignation_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 薪資資料 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-4">薪資資料</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">本薪</label>
              <input
                type="number"
                value={form.base_salary || ''}
                onChange={(e) => {
                  const salary = Number(e.target.value)
                  const suggestedGrade = suggestInsuranceGrade(salary)
                  updateForm({
                    base_salary: salary,
                    insurance_grade: suggestedGrade
                  })
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">伙食津貼</label>
              <input type="number" value={form.meal_allowance || ''} onChange={(e) => updateForm({ meal_allowance: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                投保級距
                {form.insurance_grade && insuranceRates.find(r => r.grade === form.insurance_grade) && (
                  <span className="ml-2 text-xs text-green-600 font-normal">
                    (投保金額: NT$ {insuranceRates.find(r => r.grade === form.insurance_grade)?.monthly_salary.toLocaleString()})
                  </span>
                )}
              </label>
              <select
                value={form.insurance_grade || ''}
                onChange={(e) => updateForm({ insurance_grade: Number(e.target.value) || null })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- 選擇級距 --</option>
                {insuranceRates.map(rate => (
                  <option key={rate.grade} value={rate.grade}>
                    第 {rate.grade} 級 (NT$ {rate.monthly_salary.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 投保選項 */}
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">投保勞保</span>
                <span className="text-xs text-gray-500">(勞工保險)</span>
              </div>
              <button
                type="button"
                onClick={() => updateForm({ has_labor_insurance: !form.has_labor_insurance })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.has_labor_insurance ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.has_labor_insurance ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">投保健保</span>
                <span className="text-xs text-gray-500">(全民健康保險)</span>
              </div>
              <button
                type="button"
                onClick={() => updateForm({ has_health_insurance: !form.has_health_insurance })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.has_health_insurance ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.has_health_insurance ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 銀行資料 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-4">銀行資料</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">銀行名稱</label>
              <input type="text" value={form.bank_name || ''} onChange={(e) => updateForm({ bank_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如：中國信託" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">分行</label>
              <input type="text" value={form.bank_branch || ''} onChange={(e) => updateForm({ bank_branch: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="如：敦南分行" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">帳號</label>
              <input type="text" value={form.bank_account || ''} onChange={(e) => updateForm({ bank_account: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="銀行帳號" />
            </div>
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
            <textarea value={form.note || ''} onChange={(e) => updateForm({ note: e.target.value })}
              rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="其他說明..." />
          </div>
        </div>
      </AccountingModal>
    </div>
  )
}
