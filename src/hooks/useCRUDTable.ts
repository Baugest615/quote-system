'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

const DEFAULT_PAGE_SIZE = 20

interface UseCRUDTableOptions<T> {
  tableName: string
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
  /** 是否在 mount 時自動載入 */
  autoFetch?: boolean
}

export function useCRUDTable<T extends { id: string }>({
  tableName,
  select = '*',
  orderBy = 'created_at',
  ascending = false,
  searchFields = [],
  pageSize = DEFAULT_PAGE_SIZE,
  filters = {},
  autoFetch = true,
}: UseCRUDTableOptions<T>) {
  const [records, setRecords] = useState<T[]>([])
  const [filtered, setFiltered] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [saving, setSaving] = useState(false)

  // 分頁
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedRecords = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // 資料載入
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
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
      setRecords((data as unknown as T[]) || [])
      setFiltered((data as unknown as T[]) || [])
      setCurrentPage(1)
    } catch (err) {
      console.error(`載入 ${tableName} 資料失敗:`, err)
      toast.error('載入資料失敗')
    } finally {
      setLoading(false)
    }
  }, [tableName, select, orderBy, ascending, JSON.stringify(filters)])

  useEffect(() => {
    if (autoFetch) fetchRecords()
  }, [autoFetch, fetchRecords])

  // 搜尋過濾
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(records)
      setCurrentPage(1)
      return
    }
    const q = search.toLowerCase()
    setFiltered(records.filter(r =>
      searchFields.some(field => {
        const val = r[field]
        return typeof val === 'string' && val.toLowerCase().includes(q)
      })
    ))
    setCurrentPage(1)
  }, [search, records, searchFields])

  // 儲存（新增 / 更新）
  const handleSave = async (form: Partial<T>, onSuccess?: () => void) => {
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from(tableName).update(form).eq('id', editing.id)
        if (error) throw error
        toast.success('已更新記錄')
      } else {
        const { error } = await supabase.from(tableName).insert(form)
        if (error) throw error
        toast.success('已新增記錄')
      }
      setIsModalOpen(false)
      setEditing(null)
      fetchRecords()
      onSuccess?.()
    } catch (err) {
      console.error(`儲存 ${tableName} 失敗:`, err)
      toast.error('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  // 刪除
  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆記錄嗎？')) return
    try {
      const { error } = await supabase.from(tableName).delete().eq('id', id)
      if (error) throw error
      toast.success('已刪除')
      fetchRecords()
    } catch (err) {
      console.error(`刪除 ${tableName} 失敗:`, err)
      toast.error('刪除失敗')
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
    saving,
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
