'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
  /** 啟用 server-side 分頁（使用 .range() + count） */
  serverSidePagination?: boolean
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
  serverSidePagination = false,
}: UseCRUDTableOptions<T>) {
  const queryClient = useQueryClient()

  // 搜尋 + 分頁狀態
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)

  // 搜尋改變時重置到第一頁
  useEffect(() => {
    setCurrentPage(1)
  }, [search])

  // === Server-side 分頁模式 ===
  const serverQueryKey = serverSidePagination
    ? [...queryKey, 'page', currentPage, pageSize, search]
    : queryKey

  const {
    data: queryResult,
    isLoading: loading,
    refetch: fetchRecords,
  } = useQuery({
    queryKey: serverQueryKey,
    queryFn: async () => {
      let query = supabase.from(tableName).select(
        select,
        serverSidePagination ? { count: 'exact' } : undefined
      )

      // 套用固定篩選條件
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value as string | number | boolean)
        }
      })

      // Server-side 搜尋（使用 ilike）
      if (serverSidePagination && search.trim() && searchFields.length > 0) {
        const searchQuery = searchFields
          .map(field => `${String(field)}.ilike.%${search.trim()}%`)
          .join(',')
        query = query.or(searchQuery)
      }

      query = query.order(orderBy, { ascending })

      // Server-side 分頁
      if (serverSidePagination) {
        const from = (currentPage - 1) * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)
      }

      const { data, error, count } = await query
      if (error) throw error

      if (serverSidePagination) {
        return {
          records: (data as unknown as T[]) || [],
          totalCount: count ?? 0,
        }
      }

      return {
        records: (data as unknown as T[]) || [],
        totalCount: (data?.length ?? 0),
      }
    },
    enabled,
    placeholderData: serverSidePagination ? keepPreviousData : undefined,
  })

  const records = queryResult?.records ?? []
  const serverTotalCount = queryResult?.totalCount ?? 0

  // === Client-side 篩選（僅 client-side 模式） ===
  const filtered = useMemo(() => {
    if (serverSidePagination) return records
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter(r =>
      searchFields.some(field => {
        const val = r[field]
        return typeof val === 'string' && val.toLowerCase().includes(q)
      })
    )
  }, [search, records, searchFields, serverSidePagination])

  // === 分頁計算 ===
  const totalItems = serverSidePagination ? serverTotalCount : filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const paginatedRecords = serverSidePagination
    ? records
    : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
    totalItems,
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
