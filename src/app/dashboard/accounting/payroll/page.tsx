'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Search, Users, Pencil, Trash2, ChevronLeft, Table2, Calculator, Info } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import AccountingModal from '@/components/accounting/AccountingModal'
import Pagination from '@/components/accounting/Pagination'
import SpreadsheetEditor from '@/components/accounting/SpreadsheetEditor'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'
import type { AccountingPayroll, Employee } from '@/types/custom.types'
import type { SpreadsheetColumn, BatchSaveResult, RowError } from '@/lib/spreadsheet-utils'
import { calculateInsurance, calculateNetSalary, calculateCompanyTotal, type InsuranceCalculation } from '@/lib/accounting/insurance-calculator'

const PAGE_SIZE = 20
const CURRENT_YEAR = new Date().getFullYear()
const MONTH_OPTIONS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

const emptyForm = (): Partial<AccountingPayroll> => ({
  year: CURRENT_YEAR,
  payment_date: null,
  salary_month: '',
  employee_id: null,
  employee_name: '',
  base_salary: 0,
  meal_allowance: 0,
  bonus: 0,
  deduction: 0,
  labor_insurance_personal: 0,
  health_insurance_personal: 0,
  personal_total: 0,
  net_salary: 0,
  labor_insurance_company: 0,
  health_insurance_company: 0,
  severance_fund: 0,
  retirement_fund: 0,
  company_total: 0,
  insurance_grade: null,
  insurance_salary: null,
  labor_rate: null,
  health_rate: null,
  pension_rate: null,
  note: '',
})

export default function AccountingPayrollPage() {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'
  const [year, setYear] = useState(CURRENT_YEAR)
  const [records, setRecords] = useState<AccountingPayroll[]>([])
  const [filtered, setFiltered] = useState<AccountingPayroll[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccountingPayroll | null>(null)
  const [form, setForm] = useState<Partial<AccountingPayroll>>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isSpreadsheetMode, setIsSpreadsheetMode] = useState(false)

  // 員工資料
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [insuranceCalc, setInsuranceCalc] = useState<InsuranceCalculation | null>(null)
  const [calculating, setCalculating] = useState(false)

  const spreadsheetColumns = useMemo<SpreadsheetColumn<AccountingPayroll>[]>(() => [
    { key: 'salary_month', label: '記帳月份', type: 'select',
      options: MONTH_OPTIONS.map(m => `${year}年${m}`), width: 'w-28' },
    { key: 'employee_name', label: '員工姓名', type: 'text', required: true, width: 'w-24' },
    { key: 'payment_date', label: '匯出日', type: 'date', width: 'w-28' },
    { key: 'base_salary', label: '本薪', type: 'number', autoCalcSource: true, width: 'w-24' },
    { key: 'meal_allowance', label: '伙食津貼', type: 'number', autoCalcSource: true, width: 'w-24' },
    { key: 'bonus', label: '獎金', type: 'number', autoCalcSource: true, width: 'w-24' },
    { key: 'deduction', label: '代扣', type: 'number', autoCalcSource: true, width: 'w-24' },
    { key: 'labor_insurance_personal', label: '勞保（個人）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'health_insurance_personal', label: '健保（個人）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'personal_total', label: '個人負擔', type: 'number', readOnly: true, width: 'w-24' },
    { key: 'net_salary', label: '實領薪資', type: 'number', readOnly: true, width: 'w-28' },
    { key: 'labor_insurance_company', label: '勞保（公司）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'health_insurance_company', label: '健保（公司）', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'severance_fund', label: '工資墊償金', type: 'number', autoCalcSource: true, width: 'w-28' },
    { key: 'retirement_fund', label: '勞退金', type: 'number', autoCalcSource: true, width: 'w-24' },
    { key: 'company_total', label: '公司負擔', type: 'number', readOnly: true, width: 'w-28' },
    { key: 'note', label: '備註', type: 'text', width: 'w-40' },
  ], [year])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('accounting_payroll')
        .select('*')
        .eq('year', year)
        .order('payment_date', { ascending: false })
      if (error) throw error
      setRecords(data || [])
      setFiltered(data || [])
    } catch (err) {
      console.error('載入薪資資料失敗:', err)
      toast.error('載入薪資資料失敗')
    } finally {
      setLoading(false)
    }
  }, [year])

  const fetchEmployees = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('status', '在職')
        .order('name')
      if (error) throw error
      setEmployees(data || [])
    } catch (err) {
      console.error('載入員工資料失敗:', err)
    }
  }, [])

  const handleAutoCalcPayroll = useCallback((row: Partial<AccountingPayroll>) => {
    const personalTotal = (row.labor_insurance_personal || 0) + (row.health_insurance_personal || 0)
    const grossSalary = (row.base_salary || 0) + (row.meal_allowance || 0) + (row.bonus || 0)
    const netSalary = grossSalary - (row.deduction || 0) - personalTotal
    const companyTotal = (row.labor_insurance_company || 0) + (row.health_insurance_company || 0)
      + (row.severance_fund || 0) + (row.retirement_fund || 0)
    return { personal_total: personalTotal, net_salary: netSalary, company_total: companyTotal } as Partial<AccountingPayroll>
  }, [])

  const handleBatchSave = useCallback(async (
    toInsert: Partial<AccountingPayroll>[],
    toUpdate: { id: string; data: Partial<AccountingPayroll> }[],
    toDelete: string[]
  ): Promise<BatchSaveResult> => {
    const { data: { user } } = await supabase.auth.getUser()
    const errors: RowError[] = []
    let successCount = 0

    if (toInsert.length > 0) {
      const payload = toInsert.map(r => ({ ...r, year, created_by: user?.id }))
      const { error } = await supabase.from('accounting_payroll').insert(payload)
      if (error) toInsert.forEach((_, i) => errors.push({ tempId: `insert-${i}`, message: error.message }))
      else successCount += toInsert.length
    }

    for (const { id, data } of toUpdate) {
      const { error } = await supabase.from('accounting_payroll').update({ ...data, created_by: user?.id }).eq('id', id)
      if (error) errors.push({ tempId: id, message: error.message })
      else successCount++
    }

    if (toDelete.length > 0) {
      const { error } = await supabase.from('accounting_payroll').delete().in('id', toDelete)
      if (error) errors.push({ tempId: 'batch-delete', message: error.message })
      else successCount += toDelete.length
    }

    await fetchRecords()
    return { successCount, errors }
  }, [year, fetchRecords])

  useEffect(() => {
    if (!permLoading && isAdmin) {
      fetchRecords()
      fetchEmployees()
    }
  }, [permLoading, isAdmin, fetchRecords, fetchEmployees])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(records.filter(r =>
      r.employee_name.toLowerCase().includes(q) ||
      (r.salary_month || '').toLowerCase().includes(q)
    ))
    setCurrentPage(1)
  }, [search, records])

  // 選擇員工後自動計算
  const handleSelectEmployee = async (employeeId: string) => {
    if (!employeeId) {
      setSelectedEmployee(null)
      setInsuranceCalc(null)
      return
    }

    const employee = employees.find(e => e.id === employeeId)
    if (!employee) return

    setSelectedEmployee(employee)
    setCalculating(true)

    try {
      // 計算勞健保
      const calc = await calculateInsurance(employeeId)
      if (calc) {
        setInsuranceCalc(calc)
        // 自動帶入計算結果
        updateForm({
          employee_id: employeeId,
          employee_name: employee.name,
          base_salary: employee.base_salary,
          meal_allowance: employee.meal_allowance,
          insurance_grade: calc.insuranceGrade,
          insurance_salary: calc.insuranceSalary,
          labor_rate: calc.laborRate,
          health_rate: calc.healthRate,
          pension_rate: calc.pensionRate,
          labor_insurance_personal: calc.laborInsuranceEmployee,
          health_insurance_personal: calc.healthInsuranceEmployee,
          labor_insurance_company: calc.laborInsuranceCompany,
          health_insurance_company: calc.healthInsuranceCompany,
          severance_fund: calc.occupationalInjuryFee + calc.employmentStabilizationFee,
          retirement_fund: calc.retirementFund,
        })
      } else {
        toast.error('無法計算勞健保，請檢查員工投保級距設定')
        updateForm({
          employee_id: employeeId,
          employee_name: employee.name,
          base_salary: employee.base_salary,
          meal_allowance: employee.meal_allowance,
        })
      }
    } catch (error) {
      console.error('計算勞健保失敗:', error)
      toast.error('計算勞健保失敗')
    } finally {
      setCalculating(false)
    }
  }

  // 自動計算個人負擔總額與實領薪資
  const recalcPersonal = (f: Partial<AccountingPayroll>): Partial<AccountingPayroll> => {
    const personalTotal = (f.labor_insurance_personal || 0) + (f.health_insurance_personal || 0)
    const grossSalary = (f.base_salary || 0) + (f.meal_allowance || 0) + (f.bonus || 0)
    const netSalary = grossSalary - (f.deduction || 0) - personalTotal
    const companyTotal = (f.labor_insurance_company || 0) + (f.health_insurance_company || 0) + (f.severance_fund || 0) + (f.retirement_fund || 0)
    return { ...f, personal_total: personalTotal, net_salary: netSalary, company_total: companyTotal }
  }

  const updateForm = (updates: Partial<AccountingPayroll>) => {
    setForm(f => recalcPersonal({ ...f, ...updates }))
  }

  const handleSave = async () => {
    if (!form.employee_name?.trim()) return toast.error('請選擇員工或填寫員工姓名')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, created_by: user?.id }
      if (editing) {
        const { error } = await supabase.from('accounting_payroll').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('已更新薪資記錄')
      } else {
        const { error } = await supabase.from('accounting_payroll').insert(payload)
        if (error) throw error
        toast.success('已新增薪資記錄')
      }
      setIsModalOpen(false)
      setSelectedEmployee(null)
      setInsuranceCalc(null)
      fetchRecords()
    } catch (err) {
      console.error('薪資儲存失敗:', err)
      toast.error('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆記錄嗎？')) return
    const { error } = await supabase.from('accounting_payroll').delete().eq('id', id)
    if (error) { toast.error('刪除失敗'); return }
    toast.success('已刪除')
    fetchRecords()
  }

  const handleOpenModal = () => {
    setEditing(null)
    setForm(emptyForm())
    setSelectedEmployee(null)
    setInsuranceCalc(null)
    setIsModalOpen(true)
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)
  const fmtRate = (n: number) => `${(n * 100).toFixed(2)}%`

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const totalNetSalary = filtered.reduce((s, r) => s + (r.net_salary || 0), 0)
  const totalCompany = filtered.reduce((s, r) => s + (r.company_total || 0), 0)
  const totalCost = totalNetSalary + totalCompany

  const numField = (label: string, key: keyof AccountingPayroll) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type="number"
        value={(form[key] as number) || ''}
        onChange={(e) => updateForm({ [key]: Number(e.target.value) })}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="0"
      />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-muted-foreground/60 hover:text-muted-foreground">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Users className="w-7 h-7 text-chart-5" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">人事薪資</h1>
          <p className="text-sm text-muted-foreground">員工薪資與勞健保記錄</p>
        </div>
      </div>

      {/* 操作列 */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
          {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input type="text" placeholder="搜尋員工姓名、月份..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        {!isSpreadsheetMode && (
          <>
            <Link href="/dashboard/accounting/employees"
              className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent transition-colors">
              <Users className="w-4 h-4" />
              員工管理
            </Link>
            <button onClick={handleOpenModal}
              className="flex items-center gap-2 bg-chart-5 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-chart-5/90 transition-colors">
              <Plus className="w-4 h-4" />
              新增薪資
            </button>
          </>
        )}
        <button
          onClick={() => setIsSpreadsheetMode(!isSpreadsheetMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSpreadsheetMode
              ? 'bg-chart-5/10 text-chart-5 border border-chart-5/30'
              : 'bg-muted text-foreground hover:bg-accent'
          }`}
        >
          <Table2 className="w-4 h-4" />
          {isSpreadsheetMode ? '表格模式' : '試算表模式'}
        </button>
      </div>

      {isSpreadsheetMode ? (
        <SpreadsheetEditor<AccountingPayroll>
          columns={spreadsheetColumns}
          initialRows={records}
          year={year}
          emptyRow={emptyForm}
          onAutoCalc={handleAutoCalcPayroll}
          onBatchSave={handleBatchSave}
          accentColor="purple"
          onClose={() => setIsSpreadsheetMode(false)}
        />
      ) : (
      <>
      {/* 統計 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-chart-5/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-5/70 mb-1">員工實領總額</p>
          <p className="text-lg font-bold text-chart-5">NT$ {fmt(totalNetSalary)}</p>
        </div>
        <div className="bg-chart-4/10 rounded-xl p-4 text-center">
          <p className="text-xs text-chart-4/70 mb-1">公司勞健保負擔</p>
          <p className="text-lg font-bold text-chart-4">NT$ {fmt(totalCompany)}</p>
        </div>
        <div className="bg-muted rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">公司人事費用總計</p>
          <p className="text-lg font-bold text-foreground">NT$ {fmt(totalCost)}</p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground/60">載入中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3">記帳月份</th>
                  <th className="text-left px-4 py-3">員工姓名</th>
                  <th className="text-right px-4 py-3">本薪</th>
                  <th className="text-right px-4 py-3">獎金</th>
                  <th className="text-right px-4 py-3">個人負擔</th>
                  <th className="text-right px-4 py-3">實領薪資</th>
                  <th className="text-right px-4 py-3">公司負擔</th>
                  <th className="text-left px-4 py-3">備註</th>
                  <th className="text-center px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState type="no-data" icon={Users} title="尚無薪資記錄" description="新增第一筆薪資記錄開始追蹤" /></td></tr>
                ) : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(r => (
                  <tr key={r.id} className="border-t border-border/50 hover:bg-accent">
                    <td className="px-4 py-3 text-muted-foreground">{r.salary_month || '-'}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{r.employee_name}</td>
                    <td className="px-4 py-3 text-right text-foreground">NT$ {fmt(r.base_salary || 0)}</td>
                    <td className="px-4 py-3 text-right text-chart-4">{r.bonus > 0 ? `NT$ ${fmt(r.bonus)}` : '-'}</td>
                    <td className="px-4 py-3 text-right text-destructive">NT$ {fmt(r.personal_total || 0)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-chart-5">NT$ {fmt(r.net_salary || 0)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">NT$ {fmt(r.company_total || 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-32 truncate">{r.note || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setEditing(r); setForm({ ...r }); setIsModalOpen(true) }} className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
        title={editing ? '編輯薪資記錄' : '新增薪資記錄'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-accent">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-chart-5 text-white rounded-lg hover:bg-chart-5/90 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">年度</label>
                  <select value={form.year} onChange={(e) => updateForm({ year: Number(e.target.value) })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">記帳月份</label>
                  <select value={form.salary_month || ''} onChange={(e) => updateForm({ salary_month: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">-- 選擇月份 --</option>
                    {MONTH_OPTIONS.map(m => <option key={m} value={`${form.year}年${m}`}>{form.year}年{m}</option>)}
                  </select>
                </div>
              </div>

              {/* 員工選擇器 */}
              {!editing && (
                <div className="bg-primary/10 rounded-lg p-4 border-2 border-primary/20">
                  <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    選擇員工（自動計算薪資與勞健保）
                  </label>
                  <select
                    value={form.employee_id || ''}
                    onChange={(e) => handleSelectEmployee(e.target.value)}
                    disabled={calculating}
                    className="w-full border-2 border-primary/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-card disabled:opacity-50"
                  >
                    <option value="">-- 選擇員工 --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.name} {e.employee_number ? `(${e.employee_number})` : ''} - {e.position || '無職位'} - 本薪 {fmt(e.base_salary)}
                      </option>
                    ))}
                  </select>
                  {calculating && <p className="text-xs text-primary mt-2">計算中...</p>}
                  {!form.employee_id && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                      <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      選擇員工後，系統會自動帶入本薪、津貼並計算勞健保費用
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">員工姓名 *</label>
                  <input type="text" value={form.employee_name || ''} onChange={(e) => updateForm({ employee_name: e.target.value })}
                    disabled={!!form.employee_id}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted" placeholder="姓名" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">匯出日</label>
                  <input type="date" value={form.payment_date || ''} onChange={(e) => updateForm({ payment_date: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>

              {/* 基本薪資（鎖定） */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">基本薪資（從員工資料帶入）</p>
              <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    本薪
                    <span className="text-xs text-muted-foreground/60">🔒</span>
                  </label>
                  <input type="number" value={form.base_salary || ''} readOnly
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    伙食津貼
                    <span className="text-xs text-muted-foreground/60">🔒</span>
                  </label>
                  <input type="number" value={form.meal_allowance || ''} readOnly
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted cursor-not-allowed" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                若要調整本薪或津貼，請至「員工管理」頁面修改
              </p>

              {/* 當月調整項目 */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">當月調整項目</p>
              <div className="grid grid-cols-2 gap-4">
                {numField('各項獎金（加班費、績效等）', 'bonus')}
                {numField('各種代扣（預借款、保費等）', 'deduction')}
              </div>

              {/* 勞健保計算明細 */}
              {insuranceCalc && (
                <div className="bg-gradient-to-br from-primary/10 to-chart-5/10 rounded-lg p-4 border-2 border-primary/20">
                  <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    勞健保計算明細（自動計算）
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">投保級距</p>
                      <p className="font-semibold text-foreground">第 {insuranceCalc.insuranceGrade} 級</p>
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">投保薪資</p>
                      <p className="font-semibold text-foreground">NT$ {fmt(insuranceCalc.insuranceSalary)}</p>
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">勞保（個人 {fmtRate(insuranceCalc.laborRate)}）</p>
                      <p className="font-semibold text-destructive">-NT$ {fmt(insuranceCalc.laborInsuranceEmployee)}</p>
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">健保（個人 {fmtRate(insuranceCalc.healthRate)}）</p>
                      <p className="font-semibold text-destructive">-NT$ {fmt(insuranceCalc.healthInsuranceEmployee)}</p>
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">勞保（公司）</p>
                      <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.laborInsuranceCompany)}</p>
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">健保（公司）</p>
                      <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.healthInsuranceCompany)}</p>
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">勞退（公司 {fmtRate(insuranceCalc.pensionRate)}）</p>
                      <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.retirementFund)}</p>
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">職災 + 就安</p>
                      <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.occupationalInjuryFee + insuranceCalc.employmentStabilizationFee)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 手動調整勞健保（編輯模式或未選員工） */}
              {!insuranceCalc && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">個人勞健保負擔</p>
                  <div className="grid grid-cols-2 gap-4">
                    {numField('勞保個人負擔', 'labor_insurance_personal')}
                    {numField('健保個人負擔', 'health_insurance_personal')}
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">公司勞健保負擔</p>
                  <div className="grid grid-cols-2 gap-4">
                    {numField('勞保公司負擔', 'labor_insurance_company')}
                    {numField('健保公司負擔', 'health_insurance_company')}
                    {numField('工資墊償金', 'severance_fund')}
                    {numField('勞工退休金', 'retirement_fund')}
                  </div>
                </>
              )}

              {/* 計算結果 */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-chart-5/10 rounded-lg p-3">
                  <p className="text-xs text-chart-5">個人負擔總額（自動）</p>
                  <p className="text-lg font-bold text-chart-5">NT$ {fmt(form.personal_total || 0)}</p>
                </div>
                <div className="bg-chart-5/10 rounded-lg p-3">
                  <p className="text-xs text-chart-5">實領薪資（自動）</p>
                  <p className="text-lg font-bold text-chart-5">NT$ {fmt(form.net_salary || 0)}</p>
                </div>
              </div>
              <div className="bg-chart-4/10 rounded-lg p-3">
                <p className="text-xs text-chart-4">公司支出總額（自動）</p>
                <p className="text-lg font-bold text-chart-4">NT$ {fmt(form.company_total || 0)}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">備註</label>
                <textarea value={form.note || ''} onChange={(e) => updateForm({ note: e.target.value })}
                  rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如：股份代扣、特殊說明等" />
              </div>
        </div>
      </AccountingModal>
      </>
      )}
    </div>
  )
}
