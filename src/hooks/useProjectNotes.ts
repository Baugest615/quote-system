'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/queryKeys'
import type { ProjectNote } from '@/types/custom.types'

// 取得單一專案的所有備註（含作者 email）
export function useProjectNotes(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.projectNotes(projectId || ''),
    queryFn: async () => {
      if (!projectId) return []
      const { data, error } = await supabase.rpc('get_project_notes', {
        p_project_id: projectId,
      })
      if (error) throw error
      return (data || []) as ProjectNote[]
    },
    enabled: !!projectId,
  })
}

// 取得所有專案的備註數量（用於表格顯示指標）
export function useProjectNotesCounts() {
  return useQuery({
    queryKey: queryKeys.projectNotesCounts,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_notes_count')
      if (error) throw error
      const map: Record<string, number> = {}
      for (const row of data || []) {
        map[row.project_id] = Number(row.notes_count)
      }
      return map
    },
  })
}

// 新增備註
export function useCreateProjectNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, content }: { projectId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('project_notes')
        .insert({
          project_id: projectId,
          content,
          created_by: user?.id,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectNotes(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectNotesCounts })
      toast.success('備註已新增')
    },
    onError: (error: Error) => {
      toast.error('新增備註失敗: ' + error.message)
    },
  })
}

// 刪除備註
export function useDeleteProjectNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ noteId, projectId }: { noteId: string; projectId: string }) => {
      const { error } = await supabase.from('project_notes').delete().eq('id', noteId)
      if (error) throw error
      return { projectId }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectNotes(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectNotesCounts })
      toast.success('備註已刪除')
    },
    onError: (error: Error) => {
      toast.error('刪除備註失敗: ' + error.message)
    },
  })
}
