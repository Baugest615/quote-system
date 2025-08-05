'use client'

import { useState, useEffect, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KolModal } from '@/components/kols/KolModal'
import { PlusCircle, Edit, Trash2, Facebook, Instagram, Youtube, Twitch, Twitter, Link as LinkIcon, Search } from 'lucide-react'
import { toast } from 'sonner'

// ... (類型定義維持不變) ...
type Kol = Database['public']['Tables']['kols']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']
type KolType = Database['public']['Tables']['kol_types']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']

type KolWithDetails = Kol & {
  kol_services: (KolService & {
    service_types: ServiceType | null
  })[]
}


export default function KolsPage() {
  const [kols, setKols] = useState<KolWithDetails[]>([])
  const [filteredKols, setFilteredKols] = useState<KolWithDetails[]>([])
  const [kolTypes, setKolTypes] = useState<KolType[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedKol, setSelectedKol] = useState<KolWithDetails | null>(null)
  const [priceMap, setPriceMap] = useState<Record<string, number | null>>({})
  const [searchTerm, setSearchTerm] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [kolsRes, kolTypesRes, serviceTypesRes] = await Promise.all([
      supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
      supabase.from('kol_types').select('*').order('name'),
      supabase.from('service_types').select('*').order('name'),
    ])

    if (kolsRes.error) {
      toast.error('讀取 KOL 資料失敗: ' + kolsRes.error.message)
      setKols([])
    } else {
      const fetchedKols = kolsRes.data as KolWithDetails[]
      setKols(fetchedKols)
      setFilteredKols(fetchedKols)
      
      const initialPriceMap: Record<string, number | null> = {}
      fetchedKols.forEach(kol => {
        if (kol.kol_services && kol.kol_services.length > 0) {
          initialPriceMap[kol.id] = kol.kol_services[0].price
        } else {
          initialPriceMap[kol.id] = null
        }
      })
      setPriceMap(initialPriceMap)
    }

    if (kolTypesRes.error) toast.error('讀取 KOL 類型失敗: ' + kolTypesRes.error.message)
    else setKolTypes(kolTypesRes.data)

    if (serviceTypesRes.error) toast.error('讀取服務類型失敗: ' + serviceTypesRes.error.message)
    else setServiceTypes(serviceTypesRes.data)

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = kols.filter(kol => {
        const kolType = kolTypes.find(t => t.id === kol.type_id);
        return (
            kol.name.toLowerCase().includes(lowercasedFilter) ||
            (kol.real_name && kol.real_name.toLowerCase().includes(lowercasedFilter)) ||
            (kolType && kolType.name.toLowerCase().includes(lowercasedFilter))
        );
    });
    setFilteredKols(filteredData);
  }, [searchTerm, kols, kolTypes]);


  const handleOpenModal = (kol: KolWithDetails | null = null) => {
    setSelectedKol(kol)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedKol(null)
  }
  
  // 步驟 4: 統一儲存成功訊息
  const handleSaveKol = async (formData: any, id?: string) => {
    const { services, ...kolData } = formData
    try {
      let kolId = id;
      if (id) {
        const { error } = await supabase.from('kols').update(kolData).eq('id', id)
        if (error) throw error
      } else {
        const { data: newKol, error } = await supabase.from('kols').insert(kolData).select().single()
        if (error) throw error
        kolId = newKol.id;
      }
      if (!kolId) throw new Error("無效的 KOL ID");

      const { error: deleteError } = await supabase.from('kol_services').delete().eq('kol_id', kolId)
      if (deleteError) throw deleteError

      const servicesToInsert = services
        .filter((s: any) => s.service_type_id && s.price != null)
        .map((s: any) => ({ kol_id: kolId, service_type_id: s.service_type_id, price: s.price }))

      if (servicesToInsert.length > 0) {
        const { error: serviceError } = await supabase.from('kol_services').insert(servicesToInsert)
        if (serviceError) throw serviceError
      }
      
      toast.success('儲存成功！');

      await fetchData()
      handleCloseModal()
    } catch (error: any) {
      toast.error('儲存 KOL 失敗: ' + error.message)
    }
  }
  
  const handleDeleteKol = async (id: string) => {
    if (window.confirm('確定要刪除這位 KOL 嗎？所有相關服務項目也會被刪除。')) {
      const { error } = await supabase.from('kols').delete().eq('id', id)
      if (error) {
        toast.error('刪除 KOL 失敗: ' + error.message)
      } else {
        toast.success('KOL 已刪除');
        await fetchData()
      }
    }
  }

  const handleServiceChange = (kolId: string, serviceId: string) => {
    const kol = kols.find(k => k.id === kolId);
    const service = kol?.kol_services.find(s => s.service_type_id === serviceId);
    setPriceMap(prev => ({ ...prev, [kolId]: service?.price ?? null }));
  };

  const socialIcons = { fb: Facebook, ig: Instagram, yt: Youtube, twitch: Twitch, x: Twitter, other: LinkIcon }

  if (loading) return <div>讀取中...</div>

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">KOL 管理</h1>
        <div className="flex items-center space-x-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                    type="text"
                    placeholder="搜尋 KOL 名稱、類型..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                />
            </div>
            <Button onClick={() => handleOpenModal()}>
              <PlusCircle className="mr-2 h-4 w-4" /> 新增 KOL
            </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium text-sm">類型</th>
              <th className="p-4 font-medium text-sm">KOL 名稱</th>
              <th className="p-4 font-medium text-sm">社群平台</th>
              <th className="p-4 font-medium text-sm w-48">服務項目</th>
              <th className="p-4 font-medium text-sm">服務價格</th>
              <th className="p-4 font-medium text-sm text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredKols.map((kol) => (
              <tr key={kol.id} className="border-b hover:bg-gray-50">
                <td className="p-4 text-sm">{kolTypes.find(t => t.id === kol.type_id)?.name || 'N/A'}</td>
                <td className="p-4 text-sm font-semibold text-indigo-700">{kol.name}</td>
                <td className="p-4">
                  <div className="flex items-center space-x-3">
                    {Object.entries(kol.social_links || {}).map(([key, value]) => {
                      const Icon = socialIcons[key as keyof typeof socialIcons]
                      if (value && Icon) {
                        return (
                          <a key={key} href={value as string} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-indigo-600" title={key.toUpperCase()}>
                            <Icon size={18} />
                            <span className="sr-only">{key} Link</span>
                          </a>
                        )
                      }
                      return null
                    })}
                  </div>
                </td>
                <td className="p-4">
                  {kol.kol_services && kol.kol_services.length > 0 ? (
                    <select className="form-input text-sm" onChange={(e) => handleServiceChange(kol.id, e.target.value)} aria-label={`${kol.name}的服務項目`}>
                      {kol.kol_services.map(s => ( <option key={s.id} value={s.service_type_id!}>{s.service_types?.name || '未知服務'}</option> ))}
                    </select>
                  ) : ( <span className="text-gray-400 text-sm">無服務項目</span> )}
                </td>
                <td className="p-4 text-sm">{priceMap[kol.id] != null ? `NT$ ${priceMap[kol.id]?.toLocaleString()}` : 'N/A'}</td>
                <td className="p-4 text-center space-x-1">
                   <Button variant="outline" size="sm" onClick={() => handleOpenModal(kol)}>
                    <Edit className="mr-1 h-3 w-3" /> 編輯
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteKol(kol.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> 刪除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <KolModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveKol}
        kol={selectedKol}
        kolTypes={kolTypes}
        serviceTypes={serviceTypes}
      />
    </div>
  )
}