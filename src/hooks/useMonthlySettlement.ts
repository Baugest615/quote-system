'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MutateOptions } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { AccountingExpense, AccountingPayroll, Employee, ExpenseClaim } from '@/types/custom.types'
import { groupEmployeeData } from '@/lib/settlement/groupEmployeeData'
import { calculateKpi } from '@/lib/settlement/calculateKpi'

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

// ====== 內部型別 ======

/** togglePaidMutation 的輸入參數 */
interface TogglePaymentVariables {
  items: { type: SettlementItemType; id: string }[]
  paid: boolean
}

/** markPaid / markUnpaid 接受的可選 mutation 回呼（向後相容呼叫端傳入 onSuccess 等選項） */
type MarkMutateOptions = MutateOptions<void, Error, TogglePaymentVariables, unknown>

// ====== 內部：切換付款狀態 ======

/**
 * 批次更新付款狀態的共用邏輯。
 * paid=true 時標記為已付（記錄 paid_at），paid=false 時標記為未付（清除 paid_at）。
 */
async function togglePaymentStatus(
  items: { type: SettlementItemType; id: string }[],
  paid: boolean,
): Promise<void> {
  const expenseIds = items.filter(i => i.type === 'expense').map(i => i.id)
  const payrollIds = items.filter(i => i.type === 'payroll').map(i => i.id)
  const claimIds = items.filter(i => i.type === 'claim').map(i => i.id)

  const status = paid ? 'paid' : 'unpaid'
  const paidAt = paid ? new Date().toISOString() : null

  if (expenseIds.length > 0) {
    const { error } = await supabase
      .from('accounting_expenses')
      .update({ payment_status: status, paid_at: paidAt })
      .in('id', expenseIds)
    if (error) throw error
  }
  if (payrollIds.length > 0) {
    const { error } = await supabase
      .from('accounting_payroll')
      .update({ payment_status: status, paid_at: paidAt })
      .in('id', payrollIds)
    if (error) throw error
  }
  if (claimIds.length > 0) {
    const { error } = await supabase
      .from('expense_claims')
      .update({ payment_status: status, paid_at: paidAt })
      .in('id', claimIds)
    if (error) throw error
  }
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

      // 使用純函式計算員工分組
      const { employeeGroups, externalExpenses } = groupEmployeeData({
        expenses,
        payroll,
        employees,
        withholdingClaims,
      })

      // 使用純函式計算 KPI
      const kpi = calculateKpi({ expenses, payroll, withholdingClaims })

      return {
        expenses,
        payroll,
        employees,
        withholdingClaims,
        employeeGroups,
        externalExpenses,
        ...kpi,
      }
    },
  })

  // ====== 統一的付款狀態切換 Mutation ======

  /** 使相關查詢快取失效 */
  const invalidateSettlementQueries = () => {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.monthlySettlement(year, month)] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.accountingExpenses(year)] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.accountingPayroll(year)] })
  }

  const togglePaidMutation = useMutation({
    mutationFn: ({ items, paid }: TogglePaymentVariables) =>
      togglePaymentStatus(items, paid),
    onSuccess: (_data, variables) => {
      toast.success(variables.paid ? '已標記為已付' : '已標記為未付')
      invalidateSettlementQueries()
    },
    onError: (err: Error) => {
      toast.error(`標記失敗：${err.message}`)
    },
  })

  // 向後相容的 markPaid / markUnpaid 包裝（支援呼叫端傳入 onSuccess 等選項）
  const markPaid = (
    items: { type: SettlementItemType; id: string }[],
    options?: MarkMutateOptions,
  ) => {
    togglePaidMutation.mutate({ items, paid: true }, options)
  }

  const markUnpaid = (
    items: { type: SettlementItemType; id: string }[],
    options?: MarkMutateOptions,
  ) => {
    togglePaidMutation.mutate({ items, paid: false }, options)
  }

  return {
    ...query,
    markPaid,
    markUnpaid,
    isMarking: togglePaidMutation.isPending,
  }
}
