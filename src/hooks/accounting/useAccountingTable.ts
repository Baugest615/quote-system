'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePermission } from '@/lib/permissions'
import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

const CURRENT_YEAR = new Date().getFullYear()
const PAGE_SIZE = 20

interface UseAccountingTableOptions<T> {
  tableName: string
  /** 預設排序欄位 */
  orderBy?: string
  /** 搜尋用欄位（record 中的 key） */
  searchFields?: (keyof T)[]
}

export function useAccountingTable<T extends { id: string }>({
  tableName,
  orderBy = 'created_at',
  searchFields = [],
}: UseAccountingTableOptions<T>) {
  const { userRole, loading: permLoading, hasRole } = usePermission()
  const isAdmin = userRole === 'Admin'

  const [year, setYear] = useState(CURRENT_YEAR)
  const [records, setRecords] = useState<T[]>([])
  const [filtered, setFiltered] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [saving, setSaving] = useState(false)

  // 分頁
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedRecords = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // 資料載入
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('year', year)
        .order(orderBy, { ascending: false })
      if (error) throw error
      setRecords((data as T[]) || [])
      setFiltered((data as T[]) || [])
      setCurrentPage(1)
    } catch (err) {
      console.error(`載入 ${tableName} 資料失敗:`, err)
      toast.error('載入資料失敗')
    } finally {
      setLoading(false)
    }
  }, [tableName, year, orderBy])

  useEffect(() => {
    if (!permLoading && isAdmin) fetchRecords()
  }, [permLoading, isAdmin, fetchRecords])

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

  // 儲存
  const handleSave = async (form: Partial<T>, onSuccess?: () => void) => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, created_by: user?.id }
      if (editing) {
        const { error } = await supabase.from(tableName).update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('已更新記錄')
      } else {
        const { error } = await supabase.from(tableName).insert(payload)
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
  const openCreate = (emptyForm: Partial<T>) => {
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
    saving,
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
