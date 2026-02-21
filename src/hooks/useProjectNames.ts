'use client'

import { useQuery } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

/**
 * 從 projects + quotations 表取得不重複的專案名稱列表
 * 供 autocomplete / 搜尋功能使用
 */
export function useProjectNames() {
  return useQuery({
    queryKey: [...queryKeys.projectNames],
    queryFn: async () => {
      const [projects, quotations] = await Promise.all([
        supabase.from('projects').select('project_name'),
        supabase.from('quotations').select('project_name'),
      ])

      const names = new Set<string>()

      for (const row of projects.data || []) {
        if (row.project_name) names.add(row.project_name)
      }
      for (const row of quotations.data || []) {
        if (row.project_name) names.add(row.project_name)
      }

      return Array.from(names).sort()
    },
    staleTime: 5 * 60 * 1000, // 5 分鐘快取
  })
}
