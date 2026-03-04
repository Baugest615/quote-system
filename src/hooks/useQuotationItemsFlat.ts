'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'

type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type Quotation = Database['public']['Tables']['quotations']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type Kol = Database['public']['Tables']['kols']['Row']

// 攤平型別：每個 quotation_item 帶父報價單資訊
export type FlatQuotationItem = QuotationItem & {
  kols: Pick<Kol, 'name' | 'bank_info'> | null
  quotations: (Quotation & {
    clients: Pick<Client, 'name'> | null
  }) | null
}

const FLAT_QUERY_KEY = [...queryKeys.quotations, 'flat'] as const

// 攤平查詢：所有 quotation_items 帶父報價單資訊
export function useQuotationItemsFlat() {
  return useQuery({
    queryKey: FLAT_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotation_items')
        .select(`
          *,
          kols(name, bank_info),
          quotations!inner(*, clients(name))
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as FlatQuotationItem[]
    },
  })
}

// 單欄位更新
export function useUpdateQuotationItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<QuotationItem> }) => {
      const { error } = await supabase
        .from('quotation_items')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FLAT_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations })
    },
    onError: (error: Error) => {
      toast.error('更新失敗: ' + error.message)
    },
  })
}

// 批量填入發票號碼
export function useBatchUpdateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, invoice_number }: { ids: string[]; invoice_number: string }) => {
      const { error } = await supabase
        .from('quotation_items')
        .update({ invoice_number })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: FLAT_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations })
      toast.success(`已更新 ${variables.ids.length} 筆發票號碼`)
    },
    onError: (error: Error) => {
      toast.error('批量更新失敗: ' + error.message)
    },
  })
}

