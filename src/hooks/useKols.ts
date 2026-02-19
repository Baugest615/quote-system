'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'

type Kol = Database['public']['Tables']['kols']['Row']
type KolInsert = Database['public']['Tables']['kols']['Insert']
type KolUpdate = Database['public']['Tables']['kols']['Update']
type KolService = Database['public']['Tables']['kol_services']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']

const QUERY_KEY = queryKeys.kols

// KOL with services join
export type KolWithServices = Kol & {
  kol_services: (KolService & {
    service_types: ServiceType | null
  })[]
}

// 取得所有 KOL（含服務）
export function useKols() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kols')
        .select('*, kol_services(*, service_types(*))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as KolWithServices[]
    },
  })
}

// 取得單一 KOL
export function useKol(id: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('kols')
        .select('*, kol_services(*, service_types(*))')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as KolWithServices
    },
    enabled: !!id,
  })
}

// 新增 KOL（含服務）
export function useCreateKol() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      kol,
      services,
    }: {
      kol: KolInsert
      services: { service_type_id: string; price: number }[]
    }) => {
      const { data: newKol, error } = await supabase
        .from('kols')
        .insert(kol)
        .select()
        .single()
      if (error) throw error

      if (services.length > 0) {
        const { error: serviceError } = await supabase
          .from('kol_services')
          .insert(services.map(s => ({ ...s, kol_id: newKol.id })))
        if (serviceError) throw serviceError
      }

      return newKol as Kol
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('KOL 已新增')
    },
    onError: (error: Error) => {
      toast.error('新增 KOL 失敗: ' + error.message)
    },
  })
}

// 更新 KOL（含服務同步）
export function useUpdateKol() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      kol,
      services,
    }: {
      id: string
      kol: KolUpdate
      services: { service_type_id: string; price: number }[]
    }) => {
      const { error } = await supabase.from('kols').update(kol).eq('id', id)
      if (error) throw error

      // 刪除舊服務，插入新服務
      const { error: deleteError } = await supabase
        .from('kol_services')
        .delete()
        .eq('kol_id', id)
      if (deleteError) throw deleteError

      if (services.length > 0) {
        const { error: serviceError } = await supabase
          .from('kol_services')
          .insert(services.map(s => ({ ...s, kol_id: id })))
        if (serviceError) throw serviceError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('KOL 已更新')
    },
    onError: (error: Error) => {
      toast.error('更新 KOL 失敗: ' + error.message)
    },
  })
}

// 刪除 KOL
export function useDeleteKol() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kols').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('KOL 已刪除')
    },
    onError: (error: Error) => {
      toast.error('刪除 KOL 失敗: ' + error.message)
    },
  })
}
