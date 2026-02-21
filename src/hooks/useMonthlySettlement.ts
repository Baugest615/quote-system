'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { AccountingExpense, AccountingPayroll, Employee, ExpenseClaim } from '@/types/custom.types'

// ====== 型別 ======

export type SettlementItemType = 'expense' | 'payroll' | 'claim'

export interface EmployeeSettlementGroup {
  employeeId: string
  employeeName: string
  payroll: AccountingPayroll | null
  expenses: AccountingExpense[]
  withholdingClaims: ExpenseClaim[]
  salaryTotal: number
  expenseTotal: number
  withholdingClaimTotal: number
  grandTotal: number
  allPaid: boolean
}

export interface MonthlySettlementData {
  // 原始資料
  expenses: AccountingExpense[]
  payroll: AccountingPayroll[]
  employees: Employee[]
  withholdingClaims: ExpenseClaim[]

  // 分組
  employeeGroups: EmployeeSettlementGroup[]
  externalExpenses: AccountingExpense[]

  // KPI
  kpiSalaryTotal: number
  kpiEmployeeExpenseTotal: number
  kpiExternalTotal: number
  kpiGrandTotal: number
  kpiUnpaidTotal: number
}

// ====== Hook ======

export function useMonthlySettlement(year: number, month: string) {
  const queryClient = useQueryClient()
  const monthLabel = `${year}年${month}`

  // 並行查詢四張表
  const query = useQuery({
    queryKey: [...queryKeys.monthlySettlement(year, month)],
    queryFn: async (): Promise<MonthlySettlementData> => {
      const [expensesRes, payrollRes, employeesRes, withholdingClaimsRes] = await Promise.all([
        supabase
          .from('accounting_expenses')
          .select('*')
          .eq('expense_month', monthLabel)
          .order('created_at', { ascending: false }),
        supabase
          .from('accounting_payroll')
          .select('*')
          .eq('salary_month', monthLabel)
          .order('employee_name'),
        supabase
          .from('employees')
          .select('*')
          .eq('status', '在職')
          .order('name'),
        // 代扣代繳報帳：已核准、歸屬此月份付款批次
        supabase
          .from('expense_claims')
          .select('*')
          .eq('expense_type', '代扣代繳')
          .eq('status', 'approved')
          .eq('claim_month', monthLabel)
          .order('created_at', { ascending: false }),
      ])

      if (expensesRes.error) throw expensesRes.error
      if (payrollRes.error) throw payrollRes.error
      if (employeesRes.error) throw employeesRes.error
      if (withholdingClaimsRes.error) throw withholdingClaimsRes.error

      const expenses = (expensesRes.data || []) as AccountingExpense[]
      const payroll = (payrollRes.data || []) as AccountingPayroll[]
      const employees = (employeesRes.data || []) as Employee[]
      const withholdingClaims = (withholdingClaimsRes.data || []) as ExpenseClaim[]

      // ====== 員工分組 ======
      // 建立 user_id → employee 映射
      const userIdToEmployee = new Map<string, Employee>()
      const employeeIdToEmployee = new Map<string, Employee>()
      for (const emp of employees) {
        if (emp.user_id) userIdToEmployee.set(emp.user_id, emp)
        employeeIdToEmployee.set(emp.id, emp)
      }

      // 員工相關支出（payment_target_type = 'employee'）
      const employeeExpenses = expenses.filter(e => e.payment_target_type === 'employee')
      const externalExpenses = expenses.filter(e => e.payment_target_type !== 'employee')

      // 建立員工分組 Map
      const groupMap = new Map<string, EmployeeSettlementGroup>()

      const getOrCreateGroup = (empId: string, empName: string): EmployeeSettlementGroup => {
        const existing = groupMap.get(empId)
        if (existing) return existing
        const group: EmployeeSettlementGroup = {
          employeeId: empId,
          employeeName: empName,
          payroll: null,
          expenses: [],
          withholdingClaims: [],
          salaryTotal: 0,
          expenseTotal: 0,
          withholdingClaimTotal: 0,
          grandTotal: 0,
          allPaid: true,
        }
        groupMap.set(empId, group)
        return group
      }

      // 1) 加入薪資
      for (const p of payroll) {
        const empId = p.employee_id || ''
        const emp = empId ? employeeIdToEmployee.get(empId) : null
        const group = getOrCreateGroup(empId, emp?.name || p.employee_name || '未知')
        group.payroll = p
        group.salaryTotal = p.net_salary || 0
        if (p.payment_status !== 'paid') group.allPaid = false
      }

      // 2) 加入員工報帳（非代扣代繳）
      for (const e of employeeExpenses) {
        const emp = e.submitted_by ? userIdToEmployee.get(e.submitted_by) : null
        const empId = emp?.id || `unknown-${e.submitted_by || e.id}`
        const group = getOrCreateGroup(empId, emp?.name || e.vendor_name || '未知')
        group.expenses.push(e)
        group.expenseTotal += e.total_amount || 0
        if (e.payment_status !== 'paid') group.allPaid = false
      }

      // 3) 加入代扣代繳報帳
      for (const c of withholdingClaims) {
        const emp = c.submitted_by ? userIdToEmployee.get(c.submitted_by) : null
        const empId = emp?.id || `unknown-${c.submitted_by || c.id}`
        const group = getOrCreateGroup(empId, emp?.name || c.vendor_name || '未知')
        group.withholdingClaims.push(c)
        group.withholdingClaimTotal += c.total_amount || 0
        if (c.payment_status !== 'paid') group.allPaid = false
      }

      // 計算 grandTotal
      const employeeGroups = Array.from(groupMap.values()).map(g => ({
        ...g,
        grandTotal: g.salaryTotal + g.expenseTotal + g.withholdingClaimTotal,
      }))

      // ====== KPI ======
      const kpiSalaryTotal = payroll.reduce((s, p) => s + (p.net_salary || 0), 0)
      const kpiEmployeeExpenseTotal =
        employeeExpenses.reduce((s, e) => s + (e.total_amount || 0), 0) +
        withholdingClaims.reduce((s, c) => s + (c.total_amount || 0), 0)
      const kpiExternalTotal = externalExpenses.reduce((s, e) => s + (e.total_amount || 0), 0)
      const kpiGrandTotal = kpiSalaryTotal + kpiEmployeeExpenseTotal + kpiExternalTotal

      const unpaidSalary = payroll
        .filter(p => p.payment_status !== 'paid')
        .reduce((s, p) => s + (p.net_salary || 0), 0)
      const unpaidExpenses = expenses
        .filter(e => e.payment_status !== 'paid')
        .reduce((s, e) => s + (e.total_amount || 0), 0)
      const unpaidClaims = withholdingClaims
        .filter(c => c.payment_status !== 'paid')
        .reduce((s, c) => s + (c.total_amount || 0), 0)
      const kpiUnpaidTotal = unpaidSalary + unpaidExpenses + unpaidClaims

      return {
        expenses,
        payroll,
        employees,
        withholdingClaims,
        employeeGroups,
        externalExpenses,
        kpiSalaryTotal,
        kpiEmployeeExpenseTotal,
        kpiExternalTotal,
        kpiGrandTotal,
        kpiUnpaidTotal,
      }
    },
  })

  // ====== 標記已付 Mutation ======

  const markPaidMutation = useMutation({
    mutationFn: async (items: { type: SettlementItemType; id: string }[]) => {
      const expenseIds = items.filter(i => i.type === 'expense').map(i => i.id)
      const payrollIds = items.filter(i => i.type === 'payroll').map(i => i.id)
      const claimIds = items.filter(i => i.type === 'claim').map(i => i.id)
      const now = new Date().toISOString()

      if (expenseIds.length > 0) {
        const { error } = await supabase
          .from('accounting_expenses')
          .update({ payment_status: 'paid', paid_at: now })
          .in('id', expenseIds)
        if (error) throw error
      }
      if (payrollIds.length > 0) {
        const { error } = await supabase
          .from('accounting_payroll')
          .update({ payment_status: 'paid', paid_at: now })
          .in('id', payrollIds)
        if (error) throw error
      }
      if (claimIds.length > 0) {
        const { error } = await supabase
          .from('expense_claims')
          .update({ payment_status: 'paid', paid_at: now })
          .in('id', claimIds)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('已標記為已付')
      queryClient.invalidateQueries({ queryKey: [...queryKeys.monthlySettlement(year, month)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.accountingExpenses(year)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.accountingPayroll(year)] })
    },
    onError: (err: Error) => {
      toast.error(`標記失敗：${err.message}`)
    },
  })

  const markUnpaidMutation = useMutation({
    mutationFn: async (items: { type: SettlementItemType; id: string }[]) => {
      const expenseIds = items.filter(i => i.type === 'expense').map(i => i.id)
      const payrollIds = items.filter(i => i.type === 'payroll').map(i => i.id)
      const claimIds = items.filter(i => i.type === 'claim').map(i => i.id)

      if (expenseIds.length > 0) {
        const { error } = await supabase
          .from('accounting_expenses')
          .update({ payment_status: 'unpaid', paid_at: null })
          .in('id', expenseIds)
        if (error) throw error
      }
      if (payrollIds.length > 0) {
        const { error } = await supabase
          .from('accounting_payroll')
          .update({ payment_status: 'unpaid', paid_at: null })
          .in('id', payrollIds)
        if (error) throw error
      }
      if (claimIds.length > 0) {
        const { error } = await supabase
          .from('expense_claims')
          .update({ payment_status: 'unpaid', paid_at: null })
          .in('id', claimIds)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('已標記為未付')
      queryClient.invalidateQueries({ queryKey: [...queryKeys.monthlySettlement(year, month)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.accountingExpenses(year)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.accountingPayroll(year)] })
    },
    onError: (err: Error) => {
      toast.error(`標記失敗：${err.message}`)
    },
  })

  return {
    ...query,
    markPaid: markPaidMutation.mutate,
    markUnpaid: markUnpaidMutation.mutate,
    isMarking: markPaidMutation.isPending || markUnpaidMutation.isPending,
  }
}
