'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

const DEFAULT_PAGE_SIZE = 20

interface UseCRUDTableOptions<T> {
  tableName: string
  /** React Query 快取鍵 */
  queryKey: readonly unknown[]
  /** Supabase select 語法（支援 join），預設 '*' */
  select?: string
  /** 預設排序欄位 */
  orderBy?: string
  /** 排序方向 */
  ascending?: boolean
  /** 搜尋用欄位 */
  searchFields?: (keyof T)[]
  /** 每頁筆數 */
  pageSize?: number
  /** 固定篩選條件 */
  filters?: Record<string, unknown>
  /** 是否啟用查詢 */
  enabled?: boolean
}

export function useCRUDTable<T extends { id: string }>({
  tableName,
  queryKey,
  select = '*',
  orderBy = 'created_at',
  ascending = false,
  searchFields = [],
  pageSize = DEFAULT_PAGE_SIZE,
  filters = {},
  enabled = true,
}: UseCRUDTableOptions<T>) {
  const queryClient = useQueryClient()

  // React Query 資料查詢
  const {
    data: records = [],
    isLoading: loading,
    refetch: fetchRecords,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase.from(tableName).select(select)

      // 套用固定篩選條件
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value as string | number | boolean)
        }
      })

      query = query.order(orderBy, { ascending })

      const { data, error } = await query
      if (error) throw error
      return (data as unknown as T[]) || []
    },
    enabled,
  })

  // 搜尋 + 分頁（純 client-side 邏輯）
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter(r =>
      searchFields.some(field => {
        const val = r[field]
        return typeof val === 'string' && val.toLowerCase().includes(q)
      })
    )
  }, [search, records, searchFields])

  // 搜尋改變時重置到第一頁
  useEffect(() => {
    setCurrentPage(1)
  }, [search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedRecords = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // 新增 / 更新 mutation
  const saveMutation = useMutation({
    mutationFn: async ({ form, id }: { form: Partial<T>; id?: string }) => {
      if (id) {
        const { error } = await supabase.from(tableName).update(form).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(tableName).insert(form)
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey })
      toast.success(variables.id ? '已更新記錄' : '已新增記錄')
    },
    onError: (err) => {
      console.error(`儲存 ${tableName} 失敗:`, err)
      toast.error('儲存失敗，請重試')
    },
  })

  // 刪除 mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tableName).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('已刪除')
    },
    onError: (err) => {
      console.error(`刪除 ${tableName} 失敗:`, err)
      toast.error('刪除失敗')
    },
  })

  // 保持與舊版相同的 API 介面
  const handleSave = async (form: Partial<T>, onSuccess?: () => void) => {
    try {
      await saveMutation.mutateAsync({ form, id: editing?.id })
      setIsModalOpen(false)
      setEditing(null)
      onSuccess?.()
    } catch {
      // 錯誤已由 mutation onError 處理
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆記錄嗎？')) return
    try {
      await deleteMutation.mutateAsync(id)
    } catch {
      // 錯誤已由 mutation onError 處理
    }
  }

  // Modal 操作
  const openCreate = () => {
    setEditing(null)
    setIsModalOpen(true)
  }

  const openEdit = (record: T) => {
    setEditing(record)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditing(null)
  }

  return {
    // 狀態
    records,
    filtered,
    loading,
    search,
    setSearch,
    isModalOpen,
    setIsModalOpen,
    editing,
    setEditing,
    saving: saveMutation.isPending,
    // 分頁
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedRecords,
    pageSize,
    // 操作
    fetchRecords,
    handleSave,
    handleDelete,
    openCreate,
    openEdit,
    closeModal,
  }
}
