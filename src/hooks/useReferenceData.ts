'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'
import { staleTimes } from '@/lib/queryClient'

type KolType = Database['public']['Tables']['kol_types']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']

// expense_types / accounting_subjects 結構比其他字典表多 sort_order + default_subject
export interface ExpenseTypeRow {
  id: string
  name: string
  default_subject: string | null
  sort_order: number
  created_at: string | null
}

export interface AccountingSubjectRow {
  id: string
  name: string
  sort_order: number
  created_at: string | null
}

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
    staleTime: staleTimes.dictionary,
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
    staleTime: staleTimes.dictionary,
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
    staleTime: staleTimes.dictionary,
  })
}

// 支出種類
export function useExpenseTypes() {
  return useQuery({
    queryKey: [...queryKeys.expenseTypes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_types')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as ExpenseTypeRow[]
    },
    staleTime: staleTimes.dictionary,
  })
}

// 會計科目
export function useAccountingSubjects() {
  return useQuery({
    queryKey: [...queryKeys.accountingSubjects],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_subjects')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as AccountingSubjectRow[]
    },
    staleTime: staleTimes.dictionary,
  })
}

// 通用的字典表 CRUD mutations
export type DictTableName = 'kol_types' | 'service_types' | 'quote_categories' | 'expense_types' | 'accounting_subjects'

const dictKeyMap: Record<DictTableName, readonly string[]> = {
  kol_types: queryKeys.kolTypes,
  service_types: queryKeys.serviceTypes,
  quote_categories: queryKeys.quoteCategories,
  expense_types: queryKeys.expenseTypes,
  accounting_subjects: queryKeys.accountingSubjects,
}

export function useCreateReferenceItem(tableName: DictTableName) {
  const queryClient = useQueryClient()
  const keyMap = dictKeyMap
  return useMutation({
    mutationFn: async (item: { name: string; default_subject?: string | null; sort_order?: number }) => {
      const { data, error } = await supabase
        .from(tableName)
        .insert(item as any)
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

export function useUpdateReferenceItem(tableName: DictTableName) {
  const queryClient = useQueryClient()
  const keyMap = dictKeyMap
  return useMutation({
    mutationFn: async ({ id, name, default_subject }: { id: string; name: string; default_subject?: string | null }) => {
      const updates: Record<string, unknown> = { name }
      if (default_subject !== undefined) updates.default_subject = default_subject
      const { error } = await supabase
        .from(tableName)
        .update(updates)
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

export function useDeleteReferenceItem(tableName: DictTableName) {
  const queryClient = useQueryClient()
  const keyMap = dictKeyMap
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
