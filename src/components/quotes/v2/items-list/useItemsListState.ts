'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import { QuotationItemWithPayments } from '@/types/custom.types'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'

type QuotationItem = Database['public']['Tables']['quotation_items']['Row']

interface UseItemsListStateOptions {
  quotationId: string
}

export function useItemsListState({ quotationId }: UseItemsListStateOptions) {
  const [originalItems, setOriginalItems] = useState<QuotationItemWithPayments[]>([])
  const [items, setItems] = useState<QuotationItemWithPayments[]>([])
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('quotation_items')
      .select('*, payment_requests(verification_status)')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching items:', error)
      toast.error('無法載入報價項目')
    } else {
      setOriginalItems(data || [])
      setItems(data || [])
      setDeletedItemIds(new Set())
    }
    setLoading(false)
  }, [quotationId])

  useEffect(() => { fetchItems() }, [fetchItems])

  // 頁面切換回來時自動重新載入
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchItems()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchItems])

  // 是否有未儲存的變更
  const isDirty = useMemo(() => {
    if (deletedItemIds.size > 0) return true
    if (items.length !== originalItems.length) return true
    return items.some(item => {
      if (item.id.startsWith('temp-')) return true
      const original = originalItems.find(o => o.id === item.id)
      if (!original) return true
      return (
        item.service !== original.service ||
        item.category !== original.category ||
        item.kol_id !== original.kol_id ||
        item.quantity !== original.quantity ||
        item.price !== original.price ||
        item.cost !== original.cost
      )
    })
  }, [items, originalItems, deletedItemIds])

  // 本地更新項目
  const handleUpdateItem = (id: string, updates: Partial<QuotationItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  // KOL 變更
  const handleKolChange = (itemId: string, kolId: string) => {
    handleUpdateItem(itemId, { kol_id: kolId, service: '', price: 0, cost: 0 })
  }

  // 服務變更
  const handleServiceChange = (itemId: string, serviceName: string, data?: { price: number; cost: number }) => {
    const updates: Partial<QuotationItem> = { service: serviceName }
    if (data) { updates.price = data.price; updates.cost = data.cost }
    handleUpdateItem(itemId, updates)
  }

  // 新增項目
  const handleAddItem = (quotationId: string, isSupplementMode: boolean) => {
    const newItem: QuotationItem = {
      id: crypto.randomUUID(),
      quotation_id: quotationId,
      service: '',
      quantity: 1,
      price: 0,
      cost: 0,
      category: null,
      kol_id: null,
      created_at: new Date().toISOString(),
      created_by: null,
      remark: null,
      remittance_name: null,
      is_supplement: isSupplementMode,
      accounting_subject: null,
      approved_at: null,
      approved_by: null,
      attachments: '[]',
      cost_amount: null,
      expected_payment_month: null,
      expense_type: null,
      invoice_number: null,
      is_merge_leader: null,
      merge_color: null,
      merge_group_id: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      requested_at: null,
      requested_by: null,
    }
    setItems(prev => [...prev, newItem])
  }

  // 刪除項目
  const handleDeleteItem = (id: string, isSupplementMode: boolean) => {
    const item = items.find(i => i.id === id)
    if (item) {
      if (isSupplementMode && !item.is_supplement) {
        toast.error('追加模式下不可刪除原始項目。'); return
      }
      if (item.requested_at || item.approved_at) {
        toast.error('此項目已進入請款流程，無法刪除。'); return
      }
      if (item.merge_group_id) {
        toast.error('此項目在合併組中，請先拆分合併組再刪除。'); return
      }
      const paymentRequests = item.payment_requests
      if (paymentRequests && paymentRequests.length > 0) {
        const hasActiveRequest = paymentRequests.some(pr => pr.verification_status !== 'rejected')
        if (hasActiveRequest) {
          toast.error('此項目已有進行中或已完成的付款申請，無法刪除。'); return
        }
      }
    }

    const isNew = !originalItems.some(o => o.id === id)
    if (isNew) {
      setItems(prev => prev.filter(item => item.id !== id))
    } else {
      setDeletedItemIds(prev => { const newSet = new Set(prev); newSet.add(id); return newSet })
      setItems(prev => prev.filter(item => item.id !== id))
    }
  }

  // 取消變更
  const handleCancel = () => {
    setItems(originalItems)
    setDeletedItemIds(new Set())
  }

  return {
    items, setItems,
    originalItems, setOriginalItems,
    deletedItemIds,
    loading,
    isDirty,
    fetchItems,
    handleUpdateItem,
    handleKolChange,
    handleServiceChange,
    handleAddItem,
    handleDeleteItem,
    handleCancel,
  }
}
