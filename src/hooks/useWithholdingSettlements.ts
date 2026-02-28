'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import type { WithholdingSettlement } from '@/types/custom.types'

export function useWithholdingSettlements(month: string) {
  return useQuery({
    queryKey: [...queryKeys.withholdingSettlements, month],
    queryFn: async (): Promise<WithholdingSettlement[]> => {
      const { data, error } = await supabase
        .from('withholding_settlements')
        .select('*')
        .eq('month', month)
        .order('settled_at', { ascending: false })

      if (error) {
        console.warn('Failed to fetch withholding settlements:', error.message)
        return []
      }

      return (data || []) as WithholdingSettlement[]
    },
    enabled: !!month,
  })
}

/**
 * 新增繳納記錄（公司直接繳）
 */
export function useCreateSettlement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      month: string
      type: 'income_tax' | 'nhi_supplement'
      amount: number
      note?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('使用者未登入，請重新整理頁面')

      const { data, error } = await supabase
        .from('withholding_settlements')
        .insert({
          month: params.month,
          type: params.type,
          amount: params.amount,
          settlement_method: 'company_direct' as const,
          note: params.note || '公司直接繳納',
          settled_by: user.id,
        })
        .select()
        .single()

      if (error) throw new Error(`新增繳納記錄失敗: ${error.message}`)
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.withholdingSettlements, variables.month],
      })
    },
  })
}
