'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import SettingsCard from '@/components/settings/SettingsCard'

type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']
type KolType = Database['public']['Tables']['kol_types']['Row']

export default function SettingsPage() {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [quoteCategories, setQuoteCategories] = useState<QuoteCategory[]>([])
  const [kolTypes, setKolTypes] = useState<KolType[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [serviceTypesRes, quoteCategoriesRes, kolTypesRes] = await Promise.all([
      supabase.from('service_types').select('*').order('name'),
      supabase.from('quote_categories').select('*').order('name'),
      supabase.from('kol_types').select('*').order('name'),
    ])

    if (serviceTypesRes.error) console.error('Error fetching service types:', serviceTypesRes.error)
    else setServiceTypes(serviceTypesRes.data)

    if (quoteCategoriesRes.error) console.error('Error fetching quote categories:', quoteCategoriesRes.error)
    else setQuoteCategories(quoteCategoriesRes.data)

    if (kolTypesRes.error) console.error('Error fetching KOL types:', kolTypesRes.error)
    else setKolTypes(kolTypesRes.data)
    
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAddItem = (tableName: string) => async (name: string) => {
    const { error } = await supabase.from(tableName).insert([{ name }])
    if (error) alert(`新增失敗: ${error.message}`)
    else await fetchData()
  }

  const handleUpdateItem = (tableName: string) => async (id: string, name: string) => {
    const { error } = await supabase.from(tableName).update({ name }).eq('id', id)
    if (error) alert(`更新失敗: ${error.message}`)
    else await fetchData()
  }

  const handleDeleteItem = (tableName: string) => async (id: string) => {
    if (window.confirm('確定要刪除這個項目嗎？')) {
      const { error } = await supabase.from(tableName).delete().eq('id', id)
      if (error) alert(`刪除失敗: ${error.message}`)
      else await fetchData()
    }
  }
  
  if (loading) return <div>讀取設定資料中...</div>

  return (
    <div className="space-y-6">
       <h1 className="text-2xl font-bold">系統類型設定</h1>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SettingsCard
          title="KOL 服務類型"
          items={serviceTypes}
          onAddItem={handleAddItem('service_types')}
          onUpdateItem={handleUpdateItem('service_types')}
          onDeleteItem={handleDeleteItem('service_types')}
        />
        <SettingsCard
          title="報價單項目類別"
          items={quoteCategories}
          onAddItem={handleAddItem('quote_categories')}
          onUpdateItem={handleUpdateItem('quote_categories')}
          onDeleteItem={handleDeleteItem('quote_categories')}
        />
        <SettingsCard
          title="KOL 類型"
          items={kolTypes}
          onAddItem={handleAddItem('kol_types')}
          onUpdateItem={handleUpdateItem('kol_types')}
          onDeleteItem={handleDeleteItem('kol_types')}
        />
       </div>
    </div>
  )
}