'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'
import type { Project, ProjectStatus } from '@/types/custom.types'

const QUERY_KEY = queryKeys.projects

// 取得所有專案
export function useProjects() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Project[]
    },
  })
}

// 取得單一專案
export function useProject(id: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Project
    },
    enabled: !!id,
  })
}

interface CreateProjectInput {
  client_id?: string | null
  client_name: string
  project_name: string
  project_type: string
  budget_with_tax?: number
  notes?: string | null
  status?: ProjectStatus
  quotation_id?: string | null
}

// 新增專案
export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (project: CreateProjectInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...project, created_by: user?.id })
        .select()
        .single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('專案已新增')
    },
    onError: (error: Error) => {
      toast.error('新增專案失敗: ' + error.message)
    },
  })
}

// 更新專案
export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateProjectInput> }) => {
      const { data: updated, error } = await supabase
        .from('projects')
        .update(data)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return updated as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('專案已更新')
    },
    onError: (error: Error) => {
      toast.error('更新專案失敗: ' + error.message)
    },
  })
}

// 刪除專案
export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('專案已刪除')
    },
    onError: (error: Error) => {
      toast.error('刪除專案失敗: ' + error.message)
    },
  })
}

// 自動關案檢查（呼叫 RPC）
export function useAutoCloseProjects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('auto_close_projects')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
