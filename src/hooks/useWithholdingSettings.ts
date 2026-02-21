'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import type { WithholdingSettings } from '@/types/custom.types'

export function useWithholdingSettings() {
  return useQuery({
    queryKey: [...queryKeys.withholdingSettings],
    queryFn: async (): Promise<WithholdingSettings | null> => {
      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('withholding_settings')
        .select('*')
        .lte('effective_date', today)
        .or(`expiry_date.is.null,expiry_date.gte.${today}`)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.warn('Failed to fetch withholding settings, using defaults:', error.message)
        return null
      }

      return data as WithholdingSettings
    },
  })
}

// 預設費率（當 DB 查詢失敗時使用）
export const DEFAULT_WITHHOLDING = {
  income_tax_rate: 0.10,
  nhi_supplement_rate: 0.0211,
  income_tax_threshold: 20010,
  nhi_threshold: 20000,
  remittance_fee_default: 30,
} as const
