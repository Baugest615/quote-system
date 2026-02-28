'use client'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'

type Quotation = Database['public']['Tables']['quotations']['Row']
type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type Client = Database['public']['Tables']['clients']['Row']
type Kol = Database['public']['Tables']['kols']['Row']

const QUERY_KEY = queryKeys.quotations

// 報價單含項目 + 客戶 join
export type QuotationWithDetails = Quotation & {
  quotation_items: (QuotationItem & { kols: Pick<Kol, 'name'> | null })[]
  clients: Client | null
}

// 取得所有報價單（含客戶）
export function useQuotations() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*, clients(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (Quotation & { clients: Client | null })[]
    },
  })
}

// 取得單一報價單（含項目 + 客戶）
export function useQuotation(id: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('quotations')
        .select('*, quotation_items(*, kols(name)), clients(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as QuotationWithDetails
    },
    enabled: !!id,
  })
}

// 更新報價單狀態
export function useUpdateQuotationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: Database['public']['Enums']['quotation_status']
    }) => {
      const { error } = await supabase
        .from('quotations')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats })
    },
    onError: (error: Error) => {
      toast.error('更新狀態失敗: ' + error.message)
    },
  })
}

// 刪除報價單
export function useDeleteQuotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats })
      toast.success('報價單已刪除')
    },
    onError: (error: Error) => {
      toast.error('刪除報價單失敗: ' + error.message)
    },
  })
}

// 報價單列表（含分頁）— 用於列表頁面
export function useQuotationsList(page: number, pageSize = 50) {
  return useQuery({
    queryKey: queryKeys.quotationsList(page, pageSize),
    queryFn: async () => {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const { data, count, error } = await supabase
        .from('quotations')
        .select('*, clients(*)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)
      if (error) throw error
      return { data: data as (Quotation & { clients: Client | null })[], totalCount: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })
}
