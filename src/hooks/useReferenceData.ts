'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'

type KolType = Database['public']['Tables']['kol_types']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']

// KOL 類型
export function useKolTypes() {
  return useQuery({
    queryKey: [...queryKeys.kolTypes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kol_types')
        .select('*')
        .order('name')
      if (error) throw error
      return data as KolType[]
    },
  })
}

// 服務類型（執行內容）
export function useServiceTypes() {
  return useQuery({
    queryKey: [...queryKeys.serviceTypes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .order('name')
      if (error) throw error
      return data as ServiceType[]
    },
  })
}

// 報價單類別
export function useQuoteCategories() {
  return useQuery({
    queryKey: [...queryKeys.quoteCategories],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_categories')
        .select('*')
        .order('name')
      if (error) throw error
      return data as QuoteCategory[]
    },
  })
}

// 通用的字典表 CRUD mutations
export function useCreateReferenceItem(tableName: 'kol_types' | 'service_types' | 'quote_categories') {
  const queryClient = useQueryClient()
  const keyMap = {
    kol_types: queryKeys.kolTypes,
    service_types: queryKeys.serviceTypes,
    quote_categories: queryKeys.quoteCategories,
  }
  return useMutation({
    mutationFn: async (item: { name: string }) => {
      const { data, error } = await supabase
        .from(tableName)
        .insert(item)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...keyMap[tableName]] })
      toast.success('已新增')
    },
    onError: (error: Error) => {
      toast.error('新增失敗: ' + error.message)
    },
  })
}

export function useUpdateReferenceItem(tableName: 'kol_types' | 'service_types' | 'quote_categories') {
  const queryClient = useQueryClient()
  const keyMap = {
    kol_types: queryKeys.kolTypes,
    service_types: queryKeys.serviceTypes,
    quote_categories: queryKeys.quoteCategories,
  }
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from(tableName)
        .update({ name })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...keyMap[tableName]] })
      toast.success('已更新')
    },
    onError: (error: Error) => {
      toast.error('更新失敗: ' + error.message)
    },
  })
}

export function useDeleteReferenceItem(tableName: 'kol_types' | 'service_types' | 'quote_categories') {
  const queryClient = useQueryClient()
  const keyMap = {
    kol_types: queryKeys.kolTypes,
    service_types: queryKeys.serviceTypes,
    quote_categories: queryKeys.quoteCategories,
  }
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...keyMap[tableName]] })
      toast.success('已刪除')
    },
    onError: (error: Error) => {
      toast.error('刪除失敗: ' + error.message)
    },
  })
}
