'use client'

import { useQuery } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { Employee, AccountingPayroll, ExpenseClaim } from '@/types/custom.types'

export interface MyEmployeeData {
  employee: Employee
  currentSalary: AccountingPayroll | null
  salaryHistory: AccountingPayroll[]
  expenseClaims: ExpenseClaim[]
}

export function useMyEmployeeData(userId: string | null | undefined, selectedYear: number) {
  return useQuery<MyEmployeeData | null>({
    queryKey: [...queryKeys.myEmployee(userId || ''), selectedYear],
    queryFn: async () => {
      if (!userId) return null

      // 透過 user_id 直接查詢綁定的員工（含留停/離職，讓非在職員工仍可查薪資）
      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (!emp) return null

      // 3-5. Fetch salary and payment data in parallel
      const currentMonth = new Date().toISOString().slice(0, 7)
      const [currentRes, historyRes, paymentsRes] = await Promise.all([
        supabase
          .from('accounting_payroll')
          .select('*')
          .eq('employee_id', emp.id)
          .eq('salary_month', currentMonth)
          .maybeSingle(),
        supabase
          .from('accounting_payroll')
          .select('*')
          .eq('employee_id', emp.id)
          .eq('year', selectedYear)
          .order('salary_month', { ascending: false }),
        supabase
          .from('expense_claims')
          .select('*')
          .eq('created_by', userId)
          .eq('year', selectedYear)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      return {
        employee: emp,
        currentSalary: currentRes.data || null,
        salaryHistory: historyRes.data || [],
        expenseClaims: (paymentsRes.data || []) as ExpenseClaim[],
      }
    },
    enabled: !!userId,
  })
}
