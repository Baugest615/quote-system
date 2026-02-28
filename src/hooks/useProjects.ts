'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'
import type { Project, ProjectStatus } from '@/types/custom.types'
import { useDeleteEntity } from './useEntityMutations'

const QUERY_KEY = queryKeys.projects

// 移入執行中時，自動建立/連結客戶記錄
// 若 client_id 為 null 且 client_name 有值，會查詢或新建 clients 記錄
export async function ensureClientForProject(projectId: string): Promise<{
  clientId: string | null
  isNewClient: boolean
  clientName: string | null
}> {
  const { data: project } = await supabase
    .from('projects')
    .select('client_id, client_name')
    .eq('id', projectId)
    .single()

  if (!project || project.client_id || !project.client_name) {
    return { clientId: project?.client_id ?? null, isNewClient: false, clientName: null }
  }

  // 先查詢同名客戶是否已存在
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('name', project.client_name)
    .maybeSingle()

  if (existing) {
    return { clientId: existing.id, isNewClient: false, clientName: project.client_name }
  }

  // 建立新客戶（僅填名稱，其餘欄位待使用者補齊）
  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({ name: project.client_name })
    .select('id')
    .single()

  if (error || !newClient) {
    return { clientId: null, isNewClient: false, clientName: null }
  }

  return { clientId: newClient.id, isNewClient: true, clientName: project.client_name }
}

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
      let updateData = { ...data }
      let isNewClient = false
      let syncedClientName: string | null = null

      // 移入執行中時，自動同步客戶記錄
      if (data.status === '執行中') {
        const result = await ensureClientForProject(id)
        if (result.clientId) {
          updateData.client_id = result.clientId
        }
        isNewClient = result.isNewClient
        syncedClientName = result.clientName
      }

      const { data: updated, error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return { project: updated as Project, isNewClient, syncedClientName }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('專案已更新')
      if (result.isNewClient) {
        queryClient.invalidateQueries({ queryKey: queryKeys.clients })
        toast.info(
          `已將「${result.syncedClientName}」新增至客戶列表，建議前往客戶管理補齊詳細資訊`,
          { duration: 6000 }
        )
      }
    },
    onError: (error: Error) => {
      toast.error('更新專案失敗: ' + error.message)
    },
  })
}

// 刪除專案
export function useDeleteProject() {
  return useDeleteEntity('projects', QUERY_KEY, {
    success: '專案已刪除',
    error: '刪除專案失敗',
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
