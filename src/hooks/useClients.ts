'use client'

import { useQuery } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import { useCreateEntity, useUpdateEntity, useDeleteEntity } from './useEntityMutations'

type Client = Database['public']['Tables']['clients']['Row']
type ClientInsert = Database['public']['Tables']['clients']['Insert']
type ClientUpdate = Database['public']['Tables']['clients']['Update']

const QUERY_KEY = queryKeys.clients

// 取得所有客戶
export function useClients() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Client[]
    },
  })
}

// 取得單一客戶
export function useClient(id: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Client
    },
    enabled: !!id,
  })
}

// 新增客戶
export function useCreateClient() {
  return useCreateEntity<ClientInsert>('clients', QUERY_KEY, {
    success: '客戶已新增',
    error: '新增客戶失敗',
  })
}

// 更新客戶
export function useUpdateClient() {
  return useUpdateEntity<ClientUpdate>('clients', QUERY_KEY, {
    success: '客戶已更新',
    error: '更新客戶失敗',
  })
}

// 刪除客戶
export function useDeleteClient() {
  return useDeleteEntity('clients', QUERY_KEY, {
    success: '客戶已刪除',
    error: '刪除客戶失敗',
  })
}
