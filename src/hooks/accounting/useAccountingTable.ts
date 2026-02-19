'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

const CURRENT_YEAR = new Date().getFullYear()
const PAGE_SIZE = 20

interface UseAccountingTableOptions<T> {
  tableName: string
  /** React Query 快取鍵產生函式（接收 year 回傳完整 key） */
  queryKey: (year: number) => readonly unknown[]
  /** 預設排序欄位 */
  orderBy?: string
  /** 搜尋用欄位（record 中的 key） */
  searchFields?: (keyof T)[]
}

export function useAccountingTable<T extends { id: string }>({
  tableName,
  queryKey: queryKeyFn,
  orderBy = 'created_at',
  searchFields = [],
}: UseAccountingTableOptions<T>) {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'

  const [year, setYear] = useState(CURRENT_YEAR)
  const queryClient = useQueryClient()

  const currentQueryKey = queryKeyFn(year)

  // React Query 資料查詢
  const {
    data: records = [],
    isLoading: queryLoading,
    refetch: fetchRecords,
  } = useQuery({
    queryKey: currentQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('year', year)
        .order(orderBy, { ascending: false })
      if (error) throw error
      return (data as T[]) || []
    },
    enabled: !permLoading && isAdmin,
  })

  const loading = permLoading || queryLoading

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

  // 搜尋或年份改變時重置到第一頁
  useEffect(() => {
    setCurrentPage(1)
  }, [search, year])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedRecords = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // 新增 / 更新 mutation
  const saveMutation = useMutation({
    mutationFn: async ({ form, id }: { form: Partial<T>; id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, created_by: user?.id }
      if (id) {
        const { error } = await supabase.from(tableName).update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(tableName).insert(payload)
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: currentQueryKey })
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
      queryClient.invalidateQueries({ queryKey: currentQueryKey })
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
    year, setYear,
    records, filtered,
    loading, permLoading,
    isAdmin, hasRole,
    search, setSearch,
    isModalOpen, setIsModalOpen,
    editing, setEditing,
    saving: saveMutation.isPending,
    // 分頁
    currentPage, setCurrentPage,
    totalPages,
    paginatedRecords,
    pageSize: PAGE_SIZE,
    // 操作
    fetchRecords,
    handleSave,
    handleDelete,
    openCreate,
    openEdit,
    closeModal,
    // 常數
    currentYear: CURRENT_YEAR,
  }
}
