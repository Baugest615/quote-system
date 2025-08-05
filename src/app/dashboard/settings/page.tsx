'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import SettingsCard from '@/components/settings/SettingsCard'
import { usePermission } from '@/lib/permissions' // 步驟 1: 引入權限 Hook
import Link from 'next/link' // 步驟 2: 引入 Link 元件
import { Button } from '@/components/ui/button' // 步驟 2: 引入 Button 元件
import { Shield } from 'lucide-react' // 步驟 2: 引入圖示

type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']
type KolType = Database['public']['Tables']['kol_types']['Row']

export default function SettingsPage() {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [quoteCategories, setQuoteCategories] = useState<QuoteCategory[]>([])
  const [kolTypes, setKolTypes] = useState<KolType[]>([])
  const [loading, setLoading] = useState(true)
  const { hasRole } = usePermission() // 步驟 3: 取得權限檢查函數

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
       <h1 className="text-2xl font-bold">系統設定</h1>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* 步驟 4: 新增權限管理區塊，並使用 hasRole 判斷式 */}
        {hasRole('Admin') && (
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold mb-2 flex items-center">
                  <Shield className="mr-2 h-5 w-5 text-red-600" />
                  權限管理
                </h2>
                <p className="text-sm text-gray-600">
                  管理使用者帳號的角色與系統存取權限。
                </p>
              </div>
              <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                Admin Only
              </span>
            </div>
            <div className="mt-4 text-right">
              <Link href="/dashboard/settings/permissions">
                <Button variant="destructive">
                  前往設定
                </Button>
              </Link>
            </div>
          </div>
        )}

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