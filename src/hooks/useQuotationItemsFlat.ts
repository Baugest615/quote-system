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
  kols: Pick<Kol, 'name'> | null
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
          kols(name),
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

// 送出請款
export function useRequestPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, userId, costAmount }: { itemId: string; userId: string; costAmount: number }) => {
      const { error } = await supabase
        .from('quotation_items')
        .update({
          requested_at: new Date().toISOString(),
          requested_by: userId,
          cost_amount: costAmount,
          rejection_reason: null,
          rejected_at: null,
          rejected_by: null,
        })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FLAT_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations })
      toast.success('已送出請款')
    },
    onError: (error: Error) => {
      toast.error('送出請款失敗: ' + error.message)
    },
  })
}

// 核准請款
export function useApprovePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => {
      const { error } = await supabase.rpc('approve_quotation_item', {
        p_item_id: itemId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FLAT_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations })
      toast.success('已核准請款，進項記錄已自動建立')
    },
    onError: (error: Error) => {
      toast.error('核准失敗: ' + error.message)
    },
  })
}

// 駁回請款
export function useRejectPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_quotation_item', {
        p_item_id: itemId,
        p_reason: reason || '未提供原因',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FLAT_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations })
      toast.success('已駁回請款')
    },
    onError: (error: Error) => {
      toast.error('駁回失敗: ' + error.message)
    },
  })
}
