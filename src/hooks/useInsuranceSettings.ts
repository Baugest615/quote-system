'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import type { InsuranceSettings } from '@/types/custom.types'
import { staleTimes } from '@/lib/queryClient'

export function useInsuranceSettings() {
  return useQuery({
    queryKey: [...queryKeys.insuranceSettings],
    queryFn: async (): Promise<InsuranceSettings | null> => {
      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('insurance_settings')
        .select('*')
        .lte('effective_date', today)
        .or(`expiry_date.is.null,expiry_date.gte.${today}`)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.warn('Failed to fetch insurance settings, using defaults:', error.message)
        return null
      }

      return data as InsuranceSettings
    },
    staleTime: staleTimes.static,
  })
}

// 預設值（當 DB 查詢失敗時使用）
export const DEFAULT_INSURANCE_SETTINGS = {
  default_dependents: 0.58,
} as const
