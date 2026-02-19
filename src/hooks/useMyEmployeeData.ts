'use client'

import { useQuery } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { Employee, AccountingPayroll } from '@/types/custom.types'

export interface PaymentRequest {
  id: string
  cost_amount: number
  verification_status: string
  approved_at: string | null
  created_at: string
  kol_name: string | null
  project_name: string | null
  service: string | null
}

export interface MyEmployeeData {
  employee: Employee
  currentSalary: AccountingPayroll | null
  salaryHistory: AccountingPayroll[]
  paymentRequests: PaymentRequest[]
}

export function useMyEmployeeData(userId: string | null | undefined, selectedYear: number) {
  return useQuery<MyEmployeeData | null>({
    queryKey: [...queryKeys.myEmployee(userId || ''), selectedYear],
    queryFn: async () => {
      if (!userId) return null

      // 1. Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()

      if (!profile) return null

      // 2. Find employee record
      const { data: emp, error: empError } = await supabase
        .from('employees')
        .select('*')
        .or(`email.eq.${profile.email},created_by.eq.${userId}`)
        .eq('status', '在職')
        .single()

      if (empError || !emp) return null

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
          .limit(10),
      ])

      return {
        employee: emp,
        currentSalary: currentRes.data || null,
        salaryHistory: historyRes.data || [],
        paymentRequests: (paymentsRes.data || []).map((p: any) => ({
          id: p.id,
          cost_amount: p.cost_amount,
          verification_status: p.verification_status,
          approved_at: p.approved_at,
          created_at: p.created_at,
          kol_name: p.quotation_items?.kols?.name || null,
          project_name: p.quotation_items?.quotations?.project_name || null,
          service: p.quotation_items?.service || null,
        })),
      }
    },
    enabled: !!userId,
  })
}
