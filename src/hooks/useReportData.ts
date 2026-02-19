'use client'

import { useQuery } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

type Quotation = Database['public']['Tables']['quotations']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type KOL = Pick<Database['public']['Tables']['kols']['Row'], 'id' | 'name'>
type QuotationItem = Database['public']['Tables']['quotation_items']['Row']

export type QuotationWithDetails = Quotation & {
  clients?: Client | null
  quotation_items: QuotationItem[]
}

export function useReportData(dateRange: { start: string; end: string }) {
  return useQuery({
    queryKey: [...queryKeys.reports(dateRange.start, dateRange.end)],
    queryFn: async () => {
      const [quotationsRes, kolsRes] = await Promise.all([
        supabase
          .from('quotations')
          .select('*, clients(id, name), quotation_items(*)')
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase
          .from('kols')
          .select('id, name'),
      ])

      if (quotationsRes.error) throw quotationsRes.error
      if (kolsRes.error) throw kolsRes.error

      return {
        quotations: (quotationsRes.data as QuotationWithDetails[]) || [],
        kols: (kolsRes.data as KOL[]) || [],
      }
    },
  })
}
