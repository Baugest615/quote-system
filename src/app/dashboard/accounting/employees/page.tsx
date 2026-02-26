'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { Plus, Search, Users, Pencil, Trash2, ChevronLeft, UserCheck, UserX, Mail } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import type { Employee, EmploymentType, EmployeeStatus, Gender, InsuranceRateTable } from '@/types/custom.types'

type EmployeeSortKey = 'employee_number' | 'name' | 'position' | 'department' | 'status' | 'base_salary' | 'insurance_grade' | 'hire_date'

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
  const confirm = useConfirm()
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | 'all'>('在職')
  const { sortState, toggleSort } = useTableSort<EmployeeSortKey>()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<Partial<Employee>>(emptyForm())
  const [currentPage, setCurrentPage] = useState(1)

  const { data: employees = [], isLoading: loading } = useQuery({
    queryKey: [...queryKeys.employees],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('hire_date', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !permLoading && isAdmin,
  })

  // 載入 profiles（用於顯示綁定帳號）
  const { data: profiles = [] } = useQuery({
    queryKey: [...queryKeys.profiles],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
      if (error) throw error
      return (data || []) as { id: string; email: string }[]
    },
    enabled: !permLoading && isAdmin,
  })

  // user_id → email 對應表
  const profileMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of profiles) map.set(p.id, p.email)
    return map
  }, [profiles])

  const { data: insuranceRates = [] } = useQuery({
    queryKey: [...queryKeys.insuranceRates],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insurance_rate_tables')
        .select('*')
        .order('grade', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !permLoading && isAdmin,
  })

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

  const filtered = useMemo(() => {
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
    return result
  }, [search, statusFilter, employees])

  // 排序
  const sortedFiltered = useMemo(() => {
    if (!sortState.key || !sortState.direction) return filtered
    const key = sortState.key
    const dir = sortState.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const aVal = a[key as keyof Employee]
      const bVal = b[key as keyof Employee]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
      return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
    })
  }, [filtered, sortState.key, sortState.direction])

  const updateForm = (updates: Partial<Employee>) => {
    setForm(f => ({ ...f, ...updates }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
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
        if (error) throw error
        return 'update'
      } else {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) throw error
        return 'insert'
      }
    },
    onSuccess: (action) => {
      toast.success(action === 'update' ? '已更新員工資料' : '已新增員工')
      setIsModalOpen(false)
      queryClient.invalidateQueries({ queryKey: [...queryKeys.employees] })
    },
    onError: (err: any) => {
      console.error('員工儲存失敗:', err)
      const errorMessage = err.message || err.error_description || '儲存失敗，請重試'
      toast.error(`儲存失敗：${errorMessage}`)
      if (err.message?.includes('duplicate') || err.code === '23505') {
        if (err.message.includes('employee_number')) {
          toast.error('員工編號已存在，請使用其他編號')
        } else if (err.message.includes('id_number')) {
          toast.error('身分證字號已存在')
        }
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('已刪除')
      queryClient.invalidateQueries({ queryKey: [...queryKeys.employees] })
    },
    onError: () => toast.error('刪除失敗'),
  })

  const saving = saveMutation.isPending

  const handleSave = () => {
    if (!form.name?.trim()) return toast.error('請填寫員工姓名')
    if (!form.hire_date) return toast.error('請填寫到職日')
    saveMutation.mutate()
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除這位員工嗎？此操作無法復原。',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const activeCount = sortedFiltered.filter(e => e.status === '在職').length
  const totalBaseSalary = sortedFiltered.filter(e => e.status === '在職').reduce((s, e) => s + (e.base_salary || 0), 0)

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-muted-foreground/60 hover:text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Users className="w-7 h-7 text-info" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">員工管理</h1>
          <p className="text-sm text-muted-foreground">管理員工基本資料、薪資結構與勞健保級距</p>
        </div>
      </div>

      {/* 操作列 */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EmployeeStatus | 'all')}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="all">全部狀態</option>
          <option value="在職">在職</option>
          <option value="留停">留停</option>
          <option value="離職">離職</option>
        </select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input type="text" placeholder="搜尋姓名、員工編號、職位..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true) }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          新增員工
        </button>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-chart-4/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-4 mb-1">在職員工人數</p>
          <p className="text-lg font-bold text-chart-4">{activeCount} 人</p>
        </div>
        <div className="bg-chart-1/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-1 mb-1">本薪總計（在職）</p>
          <p className="text-lg font-bold text-chart-1">NT$ {fmt(totalBaseSalary)}</p>
        </div>
        <div className="bg-muted rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">員工總數</p>
          <p className="text-lg font-bold text-foreground">{sortedFiltered.length} 人</p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs">
                <th className="text-left px-4 py-3">
                  <SortableHeader label="員工編號" sortKey="employee_number" sortState={sortState} onToggleSort={toggleSort} />
                </th>
                <th className="text-left px-4 py-3">
                  <SortableHeader label="姓名" sortKey="name" sortState={sortState} onToggleSort={toggleSort} />
                </th>
                <th className="text-left px-4 py-3">
                  <SortableHeader label="職位" sortKey="position" sortState={sortState} onToggleSort={toggleSort} />
                </th>
                <th className="text-left px-4 py-3">
                  <SortableHeader label="部門" sortKey="department" sortState={sortState} onToggleSort={toggleSort} />
                </th>
                <th className="text-left px-4 py-3">
                  <SortableHeader label="狀態" sortKey="status" sortState={sortState} onToggleSort={toggleSort} />
                </th>
                <th className="text-right px-4 py-3">
                  <SortableHeader label="本薪" sortKey="base_salary" sortState={sortState} onToggleSort={toggleSort} className="justify-end" />
                </th>
                <th className="text-center px-4 py-3">
                  <SortableHeader label="投保級距" sortKey="insurance_grade" sortState={sortState} onToggleSort={toggleSort} className="justify-center" />
                </th>
                <th className="text-center px-4 py-3">勞/健保</th>
                <th className="text-left px-4 py-3">綁定帳號</th>
                <th className="text-left px-4 py-3">
                  <SortableHeader label="到職日" sortKey="hire_date" sortState={sortState} onToggleSort={toggleSort} />
                </th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground/60">尚無員工資料</td></tr>
              ) : sortedFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(e => (
                <tr key={e.id} className="border-t border-border/50 hover:bg-accent">
                  <td className="px-4 py-3 text-muted-foreground">{e.employee_number || '-'}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.position || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.department || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      e.status === '在職' ? 'bg-success/10 text-success' :
                      e.status === '留停' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {e.status === '在職' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">NT$ {fmt(e.base_salary || 0)}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{e.insurance_grade ? `第 ${e.insurance_grade} 級` : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        e.has_labor_insurance ? 'bg-info/10 text-info' : 'bg-muted text-muted-foreground'
                      }`}>勞</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        e.has_health_insurance ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                      }`}>健</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {e.user_id && profileMap.has(e.user_id) ? (
                      <span className="flex items-center gap-1 text-info">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[140px]">{profileMap.get(e.user_id)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">未綁定</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{e.hire_date || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setEditing(e); setForm({ ...e }); setIsModalOpen(true) }} className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded hover:bg-destructive/10">
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
          totalPages={Math.ceil(sortedFiltered.length / PAGE_SIZE)}
          totalItems={sortedFiltered.length}
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
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* 基本資料 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">基本資料</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">員工姓名 *</label>
              <input type="text" value={form.name || ''} onChange={(e) => updateForm({ name: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="姓名" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">員工編號</label>
              <input type="text" value={form.employee_number || ''} onChange={(e) => updateForm({ employee_number: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如 EMP001" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">性別</label>
              <select value={form.gender || ''} onChange={(e) => updateForm({ gender: e.target.value as Gender })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">-- 選擇 --</option>
                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">生日</label>
              <input type="date" value={form.birth_date || ''} onChange={(e) => updateForm({ birth_date: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">身分證字號</label>
              <input type="text" value={form.id_number || ''} onChange={(e) => updateForm({ id_number: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="A123456789" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">電話</label>
              <input type="tel" value={form.phone || ''} onChange={(e) => updateForm({ phone: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0912345678" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input type="email" value={form.email || ''} onChange={(e) => updateForm({ email: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="email@example.com" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">地址</label>
            <input type="text" value={form.address || ''} onChange={(e) => updateForm({ address: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="完整地址" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">緊急聯絡人</label>
              <input type="text" value={form.emergency_contact || ''} onChange={(e) => updateForm({ emergency_contact: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="姓名" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">緊急聯絡電話</label>
              <input type="tel" value={form.emergency_phone || ''} onChange={(e) => updateForm({ emergency_phone: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0912345678" />
            </div>
          </div>

          {/* 僱用資料 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-4">僱用資料</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">到職日 *</label>
              <input type="date" value={form.hire_date || ''} onChange={(e) => updateForm({ hire_date: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">僱用類型</label>
              <select value={form.employment_type || '全職'} onChange={(e) => updateForm({ employment_type: e.target.value as EmploymentType })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">狀態</label>
              <select value={form.status || '在職'} onChange={(e) => updateForm({ status: e.target.value as EmployeeStatus })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                {EMPLOYEE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">職位</label>
              <input type="text" value={form.position || ''} onChange={(e) => updateForm({ position: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如：專案經理" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">部門</label>
              <input type="text" value={form.department || ''} onChange={(e) => updateForm({ department: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如：業務部" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">離職日</label>
              <input type="date" value={form.resignation_date || ''} onChange={(e) => updateForm({ resignation_date: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {/* 薪資資料 */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-4">薪資資料</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">本薪</label>
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
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">伙食津貼</label>
              <input type="number" value={form.meal_allowance || ''} onChange={(e) => updateForm({ meal_allowance: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                投保級距
                {form.insurance_grade && insuranceRates.find(r => r.grade === form.insurance_grade) && (
                  <span className="ml-2 text-xs text-success font-normal">
                    (投保金額: NT$ {insuranceRates.find(r => r.grade === form.insurance_grade)?.monthly_salary.toLocaleString()})
                  </span>
                )}
              </label>
              <select
                value={form.insurance_grade || ''}
                onChange={(e) => updateForm({ insurance_grade: Number(e.target.value) || null })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
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
            <div className="flex items-center justify-between p-3 bg-info/10 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">投保勞保</span>
                <span className="text-xs text-muted-foreground">(勞工保險)</span>
              </div>
              <button
                type="button"
                onClick={() => updateForm({ has_labor_insurance: !form.has_labor_insurance })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.has_labor_insurance ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.has_labor_insurance ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">投保健保</span>
                <span className="text-xs text-muted-foreground">(全民健康保險)</span>
              </div>
              <button
                type="button"
                onClick={() => updateForm({ has_health_insurance: !form.has_health_insurance })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.has_health_insurance ? 'bg-success' : 'bg-muted-foreground/30'
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-4">銀行資料</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">銀行名稱</label>
              <input type="text" value={form.bank_name || ''} onChange={(e) => updateForm({ bank_name: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如：中國信託" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">分行</label>
              <input type="text" value={form.bank_branch || ''} onChange={(e) => updateForm({ bank_branch: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如：敦南分行" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">帳號</label>
              <input type="text" value={form.bank_account || ''} onChange={(e) => updateForm({ bank_account: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="銀行帳號" />
            </div>
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">備註</label>
            <textarea value={form.note || ''} onChange={(e) => updateForm({ note: e.target.value })}
              rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="其他說明..." />
          </div>
        </div>
      </AccountingModal>
    </div>
  )
}
