'use client'

import { useState, useMemo, useEffect, Fragment } from 'react'
import supabase from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KolModal, type KolFormData } from '@/components/kols/KolModal'
import { PlusCircle, Edit, Trash2, Facebook, Instagram, Youtube, Twitch, Twitter, Link as LinkIcon, Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePermission } from '@/lib/permissions'
import { runInitialKolPriceSync } from '@/lib/kol/sync-kol-prices'
import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/Skeleton'
import { useKols, type KolWithServices } from '@/hooks/useKols'
import { useKolTypes, useServiceTypes } from '@/hooks/useReferenceData'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import Pagination from '@/components/ui/Pagination'

const PAGE_SIZE = 20

export default function KolsPage() {
  const queryClient = useQueryClient()
  const { userId, hasRole } = usePermission()
  const { data: kols = [], isLoading: kolsLoading } = useKols()
  const { data: kolTypes = [], isLoading: typesLoading } = useKolTypes()
  const { data: serviceTypes = [], isLoading: servicesLoading } = useServiceTypes()
  const loading = kolsLoading || typesLoading || servicesLoading

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedKol, setSelectedKol] = useState<KolWithServices | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isSyncing, setIsSyncing] = useState(false)

  // 搜尋改變時重置到第一頁
  useEffect(() => { setCurrentPage(1) }, [searchTerm])

  // 展開的行 ID 集合
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const filteredKols = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    return kols.filter(kol => {
      const kolType = kolTypes.find(t => t.id === kol.type_id);
      return (
        kol.name.toLowerCase().includes(lowercasedFilter) ||
        (kol.real_name && kol.real_name.toLowerCase().includes(lowercasedFilter)) ||
        (kolType && kolType.name.toLowerCase().includes(lowercasedFilter))
      );
    });
  }, [searchTerm, kols, kolTypes]);

  // 分頁
  const totalPages = Math.max(1, Math.ceil(filteredKols.length / PAGE_SIZE))
  const paginatedKols = filteredKols.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const handleOpenModal = (kol: KolWithServices | null = null) => {
    setSelectedKol(kol)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedKol(null)
  }

  const saveMutation = useMutation({
    mutationFn: async ({ formData, id }: { formData: KolFormData; id?: string }) => {
      const { services, is_new_type, type_name, ...kolData } = formData

      // 1. 自動建立新 KOL 類型
      if (is_new_type && type_name?.trim()) {
        const { data: newType, error } = await supabase
          .from('kol_types')
          .insert({ name: type_name.trim() })
          .select()
          .single()
        if (error) throw new Error(`建立 KOL 類型失敗: ${error.message}`)
        kolData.type_id = newType.id
        toast.success(`已自動建立類型「${type_name.trim()}」`)
      }

      // 2. 儲存 KOL 基本資料
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

      // 3. 自動建立新服務類型
      const resolvedServices: { service_type_id: string; price: number; cost: number }[] = []
      for (const s of services) {
        if (!s.price && s.price !== 0) continue // 跳過無價格的項目

        let serviceTypeId = s.service_type_id

        if (s.is_new_service_type && s.service_type_name?.trim()) {
          // 查詢或建立 service_type
          const { data: existingST } = await supabase
            .from('service_types')
            .select('id')
            .eq('name', s.service_type_name.trim())
            .maybeSingle()

          if (existingST) {
            serviceTypeId = existingST.id
          } else {
            const { data: newST, error } = await supabase
              .from('service_types')
              .insert({ name: s.service_type_name.trim() })
              .select()
              .single()
            if (error) throw new Error(`建立服務類型「${s.service_type_name}」失敗: ${error.message}`)
            serviceTypeId = newST.id
            toast.success(`已自動建立服務「${s.service_type_name.trim()}」`)
          }
        }

        if (serviceTypeId) {
          resolvedServices.push({
            service_type_id: serviceTypeId,
            price: s.price ?? 0,
            cost: s.cost ?? 0,
          })
        }
      }

      // 4. 重建 kol_services
      const { error: deleteError } = await supabase.from('kol_services').delete().eq('kol_id', kolId)
      if (deleteError) throw deleteError

      if (resolvedServices.length > 0) {
        const servicesToInsert = resolvedServices.map(s => ({
          kol_id: kolId,
          service_type_id: s.service_type_id,
          price: s.price,
          cost: s.cost,
        }))
        const { error: serviceError } = await supabase.from('kol_services').insert(servicesToInsert)
        if (serviceError) throw serviceError
      }
    },
    onSuccess: () => {
      toast.success('儲存成功！')
      queryClient.invalidateQueries({ queryKey: queryKeys.kols })
      queryClient.invalidateQueries({ queryKey: queryKeys.kolTypes })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceTypes })
      handleCloseModal()
    },
    onError: (error: unknown) => {
      toast.error('儲存 KOL 失敗: ' + (error instanceof Error ? error.message : String(error)))
    },
  })

  const handleSaveKol = async (formData: KolFormData, id?: string) => {
    await saveMutation.mutateAsync({ formData, id })
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kols').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('KOL 已刪除')
      queryClient.invalidateQueries({ queryKey: queryKeys.kols })
    },
    onError: (error: unknown) => {
      toast.error('刪除 KOL 失敗: ' + (error instanceof Error ? error.message : String(error)))
    },
  })

  const handleDeleteKol = async (id: string) => {
    if (window.confirm('確定要刪除這筆 KOL/服務嗎？所有相關執行內容也會被刪除。')) {
      deleteMutation.mutate(id)
    }
  }

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const handleInitialSync = async () => {
    if (!confirm('此操作將根據所有歷史報價單的平均價格更新 KOL 服務定價。確定繼續嗎？')) return
    setIsSyncing(true)
    const result = await runInitialKolPriceSync()
    if (result.success) {
      toast.success(`同步完成：已更新 ${result.updated} 項服務價格`)
      queryClient.invalidateQueries({ queryKey: queryKeys.kols })
    } else {
      toast.error('同步失敗: ' + result.message)
    }
    setIsSyncing(false)
  }

  const socialIcons = { fb: Facebook, ig: Instagram, yt: Youtube, twitch: Twitch, x: Twitter, other: LinkIcon }

  if (loading) return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6 space-y-6">
      <SkeletonPageHeader />
      <SkeletonTable rows={8} columns={6} />
    </div>
  )

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">KOL/服務管理</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜尋 KOL/服務名稱、類型..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-secondary border-border"
            />
          </div>
          <Button variant="outline" onClick={handleInitialSync} disabled={isSyncing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
            {isSyncing ? '同步中...' : '同步歷史報價'}
          </Button>
          <Button onClick={() => handleOpenModal()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusCircle className="mr-2 h-4 w-4" /> 新增 KOL/服務
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-4 w-10"></th>
              <th className="p-4 font-medium text-sm text-muted-foreground hidden sm:table-cell">類型</th>
              <th className="p-4 font-medium text-sm text-muted-foreground">KOL/服務</th>
              <th className="p-4 font-medium text-sm text-muted-foreground hidden md:table-cell">社群平台</th>
              <th className="p-4 font-medium text-sm text-muted-foreground hidden sm:table-cell">執行內容概覽</th>
              <th className="p-4 font-medium text-sm text-muted-foreground text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedKols.map((kol) => {
              const isExpanded = expandedRows.has(kol.id)
              const serviceCount = kol.kol_services?.length || 0
              const priceRange = kol.kol_services?.length > 0
                ? (() => {
                  const prices = kol.kol_services.map(s => s.price || 0)
                  const min = Math.min(...prices)
                  const max = Math.max(...prices)
                  return min === max ? `NT$ ${min.toLocaleString()}` : `NT$ ${min.toLocaleString()} - ${max.toLocaleString()}`
                })()
                : '無報價'

              return (
                <Fragment key={kol.id}>
                  <tr className={cn("border-b border-border hover:bg-muted/50 transition-colors", isExpanded && "bg-muted/30")}>
                    <td className="p-4">
                      <button
                        onClick={() => toggleRow(kol.id)}
                        className="p-1 hover:bg-muted rounded-full transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="p-4 text-sm hidden sm:table-cell">{kolTypes.find(t => t.id === kol.type_id)?.name || 'N/A'}</td>
                    <td className="p-4 text-sm font-semibold text-primary">{kol.name}</td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex items-center space-x-3">
                        {Object.entries(kol.social_links || {}).map(([key, value]) => {
                          const Icon = socialIcons[key as keyof typeof socialIcons]
                          if (value && Icon) {
                            return (
                              <a key={key} href={value as string} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" title={key.toUpperCase()}>
                                <Icon size={18} />
                                <span className="sr-only">{key} Link</span>
                              </a>
                            )
                          }
                          return null
                        })}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground hidden sm:table-cell">
                      {serviceCount > 0 ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{serviceCount} 項服務</span>
                          <span className="text-xs text-muted-foreground">{priceRange}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">無執行內容</span>
                      )}
                    </td>
                    <td className="p-4 text-center space-x-1">
                      <Button variant="outline" size="sm" onClick={() => handleOpenModal(kol)}>
                        <Edit className="mr-1 h-3 w-3" /> 編輯
                      </Button>
                      {(hasRole('Editor') || ((kol as any).created_by != null && (kol as any).created_by === userId)) && (
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteKol(kol.id)}>
                          <Trash2 className="mr-1 h-3 w-3" /> 刪除
                        </Button>
                      )}
                    </td>
                  </tr>

                  {/* 展開的詳細服務列表 */}
                  {isExpanded && (
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="p-0 border-b border-border">
                        <div className="p-4 sm:pl-14 sm:pr-14">
                          <div className="bg-card rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-secondary/50 text-muted-foreground">
                                <tr>
                                  <th className="p-3 text-left font-medium">執行內容</th>
                                  <th className="p-3 text-right font-medium">報價</th>
                                  <th className="p-3 text-right font-medium">成本</th>
                                  <th className="p-3 text-left font-medium">最近報價資訊</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {kol.kol_services && kol.kol_services.length > 0 ? (
                                  kol.kol_services.map(service => (
                                    <tr key={service.id} className="hover:bg-muted/50">
                                      <td className="p-3 text-foreground font-medium">
                                        {service.service_types?.name || '未知服務'}
                                      </td>
                                      <td className="p-3 text-right font-mono text-primary">
                                        NT$ {(service.price || 0).toLocaleString()}
                                      </td>
                                      <td className="p-3 text-right font-mono text-muted-foreground">
                                        NT$ {(service.cost || 0).toLocaleString()}
                                      </td>
                                      <td className="p-3 text-xs text-muted-foreground">
                                        {service.last_quote_info || '-'}
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                      尚未設定執行內容與價格
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredKols.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
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