'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
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
import { calculateInsurance, type InsuranceCalculation } from '@/lib/accounting/insurance-calculator'
import { CURRENT_YEAR, MONTH_OPTIONS } from '@/lib/constants'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover'
import { useColumnFilters, type FilterValue } from '@/hooks/useColumnFilters'

type PayrollSortKey = 'salary_month' | 'employee_name' | 'base_salary' | 'bonus' | 'personal_total' | 'net_salary' | 'company_total' | 'note'

function getPayrollSortValue(r: AccountingPayroll, key: PayrollSortKey): string | number | null {
  switch (key) {
    case 'salary_month': return r.salary_month ?? null
    case 'employee_name': return r.employee_name ?? null
    case 'base_salary': return r.base_salary ?? 0
    case 'bonus': return r.bonus ?? 0
    case 'personal_total': return r.personal_total ?? 0
    case 'net_salary': return r.net_salary ?? 0
    case 'company_total': return r.company_total ?? 0
    case 'note': return r.note ?? null
  }
}

const PAGE_SIZE = 20

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
  employment_insurance_rate: null,
  is_employer: false,
  dependents_count: null,
  note: '',
})

export default function AccountingPayrollPage() {
  const confirm = useConfirm()
  const { loading: permLoading, hasRole } = usePermission()
  const hasAccess = hasRole('Editor')
  const queryClient = useQueryClient()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [search, setSearch] = useState('')
  const { sortState, toggleSort } = useTableSort<PayrollSortKey>()
  const { filters, setFilter } = useColumnFilters<Record<PayrollSortKey, unknown>>()
  const getFilter = (key: PayrollSortKey): FilterValue | null => filters.get(key as keyof Record<PayrollSortKey, unknown>) ?? null
  const setFilterByKey = (key: PayrollSortKey, value: FilterValue | null) => setFilter(key as keyof Record<PayrollSortKey, unknown>, value)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<AccountingPayroll | null>(null)
  const [form, setForm] = useState<Partial<AccountingPayroll>>(emptyForm())
  const [currentPage, setCurrentPage] = useState(1)
  const [isSpreadsheetMode, setIsSpreadsheetMode] = useState(false)

  // 員工資料
  const [_selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
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

  const currentQueryKey = queryKeys.accountingPayroll(year)

  /** 失效薪資快取 + 月結總覽快取 */
  const invalidatePayrollCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [...currentQueryKey] })
    queryClient.invalidateQueries({ queryKey: ['monthly-settlement'] })
  }, [queryClient, currentQueryKey])

  const { data: records = [], isLoading: loading } = useQuery({
    queryKey: [...currentQueryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_payroll')
        .select('*')
        .eq('year', year)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return (data || []) as AccountingPayroll[]
    },
    enabled: !permLoading && hasAccess,
  })

  const { data: employees = [] } = useQuery({
    queryKey: [...queryKeys.employees],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('status', '在職')
        .order('name')
      if (error) throw error
      return (data || []) as Employee[]
    },
    enabled: !permLoading && hasAccess,
  })

  const handleAutoCalcPayroll = (row: Partial<AccountingPayroll>) => {
    const personalTotal = (row.labor_insurance_personal || 0) + (row.health_insurance_personal || 0)
    const grossSalary = (row.base_salary || 0) + (row.meal_allowance || 0) + (row.bonus || 0)
    const netSalary = grossSalary - (row.deduction || 0) - personalTotal
    const companyTotal = (row.labor_insurance_company || 0) + (row.health_insurance_company || 0)
      + (row.severance_fund || 0) + (row.retirement_fund || 0)
    return { personal_total: personalTotal, net_salary: netSalary, company_total: companyTotal } as Partial<AccountingPayroll>
  }

  const handleBatchSave = async (
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

    await invalidatePayrollCaches()
    return { successCount, errors }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = records.filter(r =>
      r.employee_name.toLowerCase().includes(q) ||
      (r.salary_month || '').toLowerCase().includes(q)
    )
    // 欄位篩選
    if (filters.size > 0) {
      result = result.filter(r => {
        let pass = true
        filters.forEach((fv, key) => {
          if (!pass) return
          const val = getPayrollSortValue(r, String(key) as PayrollSortKey)
          if (fv.type === 'text') {
            if (!String(val ?? '').toLowerCase().includes(fv.value.toLowerCase())) pass = false
          } else if (fv.type === 'select') {
            if (!fv.selected.includes(String(val ?? ''))) pass = false
          } else if (fv.type === 'number') {
            const num = typeof val === 'number' ? val : parseFloat(String(val ?? ''))
            if (isNaN(num)) { if (fv.min != null || fv.max != null) pass = false; return }
            if (fv.min != null && num < fv.min) pass = false
            if (fv.max != null && num > fv.max) pass = false
          }
        })
        return pass
      })
    }
    // 排序
    if (sortState.key && sortState.direction) {
      const dir = sortState.direction === 'asc' ? 1 : -1
      result.sort((a, b) => {
        const aVal = getPayrollSortValue(a, sortState.key as PayrollSortKey)
        const bVal = getPayrollSortValue(b, sortState.key as PayrollSortKey)
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
        return String(aVal).localeCompare(String(bVal), 'zh-Hant') * dir
      })
    }
    return result
  }, [search, records, filters, sortState])

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
          employment_insurance_rate: calc.employmentInsuranceRate,
          // 勞保個人含就保個人（合併存入）
          labor_insurance_personal: calc.laborInsuranceEmployee + calc.employmentInsuranceEmployee,
          health_insurance_personal: calc.healthInsuranceEmployee,
          // 勞保公司含就保公司（合併存入）
          labor_insurance_company: calc.laborInsuranceCompany + calc.employmentInsuranceCompany,
          health_insurance_company: calc.healthInsuranceCompany,
          severance_fund: calc.occupationalInjuryFee + calc.employmentStabilizationFee,
          retirement_fund: calc.retirementFund,
          is_employer: calc.isEmployer,
          dependents_count: calc.averageDependents,
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, created_by: user?.id }
      if (editing) {
        const { error } = await supabase.from('accounting_payroll').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('accounting_payroll').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidatePayrollCaches()
      toast.success(editing ? '已更新薪資記錄' : '已新增薪資記錄')
      setIsModalOpen(false)
      setSelectedEmployee(null)
      setInsuranceCalc(null)
    },
    onError: () => toast.error('儲存失敗，請重試'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounting_payroll').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidatePayrollCaches()
      toast.success('已刪除')
    },
    onError: () => toast.error('刪除失敗'),
  })

  const handleSave = async () => {
    if (!form.employee_name?.trim()) return toast.error('請選擇員工或填寫員工姓名')
    saveMutation.mutate()
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除這筆記錄嗎？',
      confirmLabel: '刪除',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }

  const saving = saveMutation.isPending

  const handleOpenModal = () => {
    setEditing(null)
    setForm(emptyForm())
    setSelectedEmployee(null)
    setInsuranceCalc(null)
    setIsModalOpen(true)
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(n)
  const fmtRate = (n: number) => `${(n * 100).toFixed(2)}%`

  if (permLoading || loading) return <AccountingLoadingGuard loading={true} hasAccess={true} />
  if (!hasRole('Editor')) return <AccountingLoadingGuard loading={false} hasAccess={false} />

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
                  <th className="text-left px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="記帳月份" sortKey="salary_month" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="select" options={MONTH_OPTIONS.map(m => `${year}年${m}`)} value={getFilter('salary_month')} onChange={v => setFilterByKey('salary_month', v)} />} />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="員工姓名" sortKey="employee_name" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('employee_name')} onChange={v => setFilterByKey('employee_name', v)} />} />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="本薪" sortKey="base_salary" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('base_salary')} onChange={v => setFilterByKey('base_salary', v)} />} />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="獎金" sortKey="bonus" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('bonus')} onChange={v => setFilterByKey('bonus', v)} />} />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="個人負擔" sortKey="personal_total" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('personal_total')} onChange={v => setFilterByKey('personal_total', v)} />} />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="實領薪資" sortKey="net_salary" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('net_salary')} onChange={v => setFilterByKey('net_salary', v)} />} />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="公司負擔" sortKey="company_total" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="number" value={getFilter('company_total')} onChange={v => setFilterByKey('company_total', v)} />} />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortableHeader<PayrollSortKey> label="備註" sortKey="note" sortState={sortState} onToggleSort={toggleSort}
                      filterContent={<ColumnFilterPopover filterType="text" value={getFilter('note')} onChange={v => setFilterByKey('note', v)} />} />
                  </th>
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
                        <button onClick={() => { setEditing(r); setForm({ ...r }); setInsuranceCalc(null); setSelectedEmployee(null); setIsModalOpen(true) }} className="p-1.5 text-muted-foreground/60 hover:text-primary rounded hover:bg-primary/10">
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
                <div className={`rounded-lg p-4 border-2 ${
                  insuranceCalc.isEmployer
                    ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20'
                    : 'bg-gradient-to-br from-primary/10 to-chart-5/10 border-primary/20'
                }`}>
                  <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    勞健保計算明細（自動計算）
                    {insuranceCalc.isEmployer && (
                      <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-xs font-medium">
                        雇主計算
                      </span>
                    )}
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
                    {insuranceCalc.isEmployer && insuranceCalc.averageDependents != null && (
                      <div className="bg-card rounded p-2 col-span-2">
                        <p className="text-muted-foreground">健保眷屬口數</p>
                        <p className="font-semibold text-amber-400">{insuranceCalc.averageDependents}</p>
                      </div>
                    )}
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">
                        勞保（{insuranceCalc.isEmployer ? '全額自付' : `個人 ${fmtRate(insuranceCalc.laborRate)}`}）
                      </p>
                      <p className="font-semibold text-destructive">-NT$ {fmt(insuranceCalc.laborInsuranceEmployee)}</p>
                    </div>
                    {!insuranceCalc.isEmployer && insuranceCalc.employmentInsuranceEmployee > 0 && (
                      <div className="bg-card rounded p-2">
                        <p className="text-muted-foreground">
                          就保（個人 {fmtRate(insuranceCalc.employmentInsuranceRate * 0.20)}）
                        </p>
                        <p className="font-semibold text-destructive">-NT$ {fmt(insuranceCalc.employmentInsuranceEmployee)}</p>
                      </div>
                    )}
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">
                        健保（{insuranceCalc.isEmployer ? '含眷屬' : `個人 ${fmtRate(insuranceCalc.healthRate)}`}）
                      </p>
                      <p className="font-semibold text-destructive">-NT$ {fmt(insuranceCalc.healthInsuranceEmployee)}</p>
                    </div>
                    {!insuranceCalc.isEmployer && (
                      <>
                        <div className="bg-card rounded p-2">
                          <p className="text-muted-foreground">勞保（公司）</p>
                          <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.laborInsuranceCompany)}</p>
                        </div>
                        {insuranceCalc.employmentInsuranceCompany > 0 && (
                          <div className="bg-card rounded p-2">
                            <p className="text-muted-foreground">就保（公司）</p>
                            <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.employmentInsuranceCompany)}</p>
                          </div>
                        )}
                        <div className="bg-card rounded p-2">
                          <p className="text-muted-foreground">健保（公司）</p>
                          <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.healthInsuranceCompany)}</p>
                        </div>
                      </>
                    )}
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">
                        勞退{insuranceCalc.isEmployer ? '' : `（公司 ${fmtRate(insuranceCalc.pensionRate)}）`}
                      </p>
                      {insuranceCalc.isEmployer ? (
                        <p className="text-muted-foreground/60 italic">不適用</p>
                      ) : (
                        <p className="font-semibold text-chart-4">NT$ {fmt(insuranceCalc.retirementFund)}</p>
                      )}
                    </div>
                    <div className="bg-card rounded p-2">
                      <p className="text-muted-foreground">
                        職災 + 就安{insuranceCalc.isEmployer ? '（自付）' : ''}
                      </p>
                      <p className={`font-semibold ${insuranceCalc.isEmployer ? 'text-destructive' : 'text-chart-4'}`}>
                        {insuranceCalc.isEmployer ? '-' : ''}NT$ {fmt(insuranceCalc.occupationalInjuryFee + insuranceCalc.employmentStabilizationFee)}
                      </p>
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
