'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { AccountingReconciliation } from '@/types/custom.types'

interface UpsertReconciliationInput {
  prevBankBalance: number
  bankBalance: number
  incomeTotal: number
  expenseTotal: number
  note?: string
  markReconciled?: boolean
}

export function useReconciliation(year: number, month: string) {
  const queryClient = useQueryClient()
  const monthLabel = `${year}年${month}`

  const query = useQuery({
    queryKey: [...queryKeys.accountingReconciliation(year, month)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_reconciliation')
        .select('*')
        .eq('year', year)
        .eq('month', monthLabel)
        .maybeSingle()

      if (error) throw error
      return (data as AccountingReconciliation) ?? null
    },
  })

  const upsertMutation = useMutation({
    mutationFn: async (input: UpsertReconciliationInput) => {
      // 差異 = 本月存款餘額 - (上月存款餘額 + 收入 - 支出)
      const expectedBalance = input.prevBankBalance + input.incomeTotal - input.expenseTotal
      const difference = input.bankBalance - expectedBalance

      const { data: { user } } = await supabase.auth.getUser()

      const payload: Record<string, unknown> = {
        year,
        month: monthLabel,
        prev_bank_balance: input.prevBankBalance,
        bank_balance: input.bankBalance,
        income_total: input.incomeTotal,
        expense_total: input.expenseTotal,
        difference,
        note: input.note ?? null,
        status: input.markReconciled ? 'reconciled' : 'draft',
        created_by: user?.id ?? null,
      }

      if (input.markReconciled) {
        payload.reconciled_by = user?.id ?? null
        payload.reconciled_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('accounting_reconciliation')
        .upsert(payload, { onConflict: 'year,month' })

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.markReconciled ? '已標記為已核對' : '草稿已儲存')
      queryClient.invalidateQueries({ queryKey: [...queryKeys.accountingReconciliation(year, month)] })
    },
    onError: (err: Error) => {
      toast.error(`儲存失敗：${err.message}`)
    },
  })

  return {
    ...query,
    upsert: upsertMutation.mutate,
    isUpserting: upsertMutation.isPending,
  }
}
