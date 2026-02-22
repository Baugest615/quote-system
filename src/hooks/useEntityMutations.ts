'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

interface MutationMessages {
  success: string
  error: string
}

/**
 * 通用新增 mutation factory
 * 適用於簡單的單表 insert 操作
 */
export function useCreateEntity<TInsert extends Record<string, unknown>>(
  tableName: string,
  queryKey: readonly unknown[],
  messages: MutationMessages
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: TInsert) => {
      const { data: created, error } = await supabase
        .from(tableName)
        .insert(data as any)
        .select()
        .single()
      if (error) throw error
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] })
      toast.success(messages.success)
    },
    onError: (error: Error) => {
      toast.error(messages.error + ': ' + error.message)
    },
  })
}

/**
 * 通用更新 mutation factory
 * 適用於簡單的單表 update 操作
 */
export function useUpdateEntity<TUpdate extends Record<string, unknown>>(
  tableName: string,
  queryKey: readonly unknown[],
  messages: MutationMessages
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TUpdate }) => {
      const { data: updated, error } = await supabase
        .from(tableName)
        .update(data as any)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] })
      toast.success(messages.success)
    },
    onError: (error: Error) => {
      toast.error(messages.error + ': ' + error.message)
    },
  })
}

/**
 * 通用刪除 mutation factory
 * 支援額外的快取失效鍵（如跨表連動）
 */
export function useDeleteEntity(
  tableName: string,
  queryKey: readonly unknown[],
  messages: MutationMessages,
  extraInvalidateKeys?: readonly (readonly unknown[])[]
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tableName).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] })
      extraInvalidateKeys?.forEach(key => {
        queryClient.invalidateQueries({ queryKey: [...key] })
      })
      toast.success(messages.success)
    },
    onError: (error: Error) => {
      toast.error(messages.error + ': ' + error.message)
    },
  })
}
