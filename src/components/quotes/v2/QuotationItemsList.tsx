'use client'

import { useState, useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import { QuotationItemWithPayments } from '@/types/custom.types'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, Save, XCircle, ClipboardPaste, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { Info } from 'lucide-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useReferenceData } from './shared/useReferenceData'
import { useItemsListState } from './items-list/useItemsListState'
import { useSaveItems } from './items-list/useSaveItems'
import { parsePasteData, isStructuredPaste } from './items-list/PasteProcessor'
import { ItemsListRow } from './items-list/ItemsListRow'

interface QuotationItemsListProps {
  quotationId: string
  onUpdate?: () => void
  readOnly?: boolean
  quotationStatus?: string
}

export function QuotationItemsList({ quotationId, onUpdate, readOnly = false, quotationStatus }: QuotationItemsListProps) {
  const confirm = useConfirm()
  const isSupplementMode = quotationStatus === '已簽約'

  // 資料 hooks
  const state = useItemsListState({ quotationId })
  const { kols, setKols, categoryOptions, kolOptions } = useReferenceData()
  const { handleSave: executeSave, isSaving } = useSaveItems({
    quotationId,
    isSupplementMode,
    kols,
    onSuccess: async () => {
      const [, kolsRes] = await Promise.all([
        state.fetchItems(),
        supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
      ])
      if (kolsRes.data) setKols(kolsRes.data as typeof kols)
      if (onUpdate) onUpdate()
    },
  })

  // 貼上 Modal
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false)
  const [pasteContent, setPasteContent] = useState('')

  // 排序
  type SortKey = 'category' | 'kol' | 'service' | 'quantity' | 'price' | 'cost' | 'subtotal'
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null)

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' }
        return null
      }
      return { key, direction: 'asc' }
    })
  }

  const sortedItems = useMemo(() => {
    if (!sortConfig) return state.items
    const { key, direction } = sortConfig
    const sorted = [...state.items].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''
      switch (key) {
        case 'category': aVal = a.category || ''; bVal = b.category || ''; break
        case 'kol': aVal = kols.find(k => k.id === a.kol_id)?.name || ''; bVal = kols.find(k => k.id === b.kol_id)?.name || ''; break
        case 'service': aVal = a.service || ''; bVal = b.service || ''; break
        case 'quantity': aVal = a.quantity ?? 0; bVal = b.quantity ?? 0; break
        case 'price': aVal = a.price; bVal = b.price; break
        case 'cost': aVal = a.cost ?? 0; bVal = b.cost ?? 0; break
        case 'subtotal': aVal = (a.quantity ?? 0) * a.price; bVal = (b.quantity ?? 0) * b.price; break
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'asc' ? aVal.localeCompare(bVal, 'zh-Hant') : bVal.localeCompare(aVal, 'zh-Hant')
      }
      return direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
    return sorted
  }, [state.items, sortConfig, kols])

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig?.key !== columnKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-0 group-hover/th:opacity-50" />
    if (sortConfig.direction === 'asc') return <ArrowUp className="h-3 w-3 ml-1 text-primary" />
    return <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  }

  // ─── 貼上處理 ────────────────────────────────────────────
  const handlePasteFromModal = () => {
    const newItems = parsePasteData(pasteContent, quotationId, kols, isSupplementMode)
    if (newItems.length > 0) {
      state.setItems(prev => [...prev, ...newItems] as QuotationItemWithPayments[])
      toast.success(`已從剪貼簿新增 ${newItems.length} 個項目`)
      setIsPasteModalOpen(false)
      setPasteContent('')
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData.getData('text')
    if (!clipboardData) return
    if (isStructuredPaste(clipboardData)) {
      e.preventDefault()
      const newItems = parsePasteData(clipboardData, quotationId, kols, isSupplementMode)
      if (newItems.length > 0) {
        state.setItems(prev => [...prev, ...newItems] as QuotationItemWithPayments[])
        toast.success(`已從剪貼簿新增 ${newItems.length} 個項目`)
      }
    }
  }

  const handleCancel = async () => {
    const ok = await confirm({ title: '放棄變更', description: '確定要放棄所有未儲存的變更嗎？' })
    if (ok) state.handleCancel()
  }

  if (state.loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>

  return (
    <div className="bg-secondary p-4 rounded-lg border border-border shadow-inner outline-none" onPaste={readOnly ? undefined : handlePaste} tabIndex={0}>
      {/* 追加模式提示 */}
      {isSupplementMode && !readOnly && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-info/10 border border-info/25 text-sm text-info">
          <Info className="h-4 w-4 shrink-0" />
          <span>追加模式 — 原始項目已鎖定，僅可新增追加項目</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold text-foreground/70">
          成本明細 (報價項目)
          {!isSupplementMode && (
            <span className="ml-2 text-xs font-normal text-muted-foreground hidden sm:inline">
              (支援 Excel 貼上: 類別 | KOL/服務 | 執行內容 | 數量 | 單價 | 成本)
            </span>
          )}
        </h4>
        {!readOnly && (
          <div className="flex space-x-2">
            {state.isDirty && (
              <>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving} className="h-7 text-xs text-muted-foreground hover:text-foreground/70">
                  <XCircle className="h-3 w-3 mr-1" /> 取消
                </Button>
                <Button size="sm" onClick={() => executeSave(state.items, state.originalItems)} disabled={isSaving} className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  儲存變更
                </Button>
              </>
            )}
            {!isSupplementMode && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsPasteModalOpen(true)}>
                  <ClipboardPaste className="h-3 w-3 mr-1" /> 貼上 Excel
                </Button>
                <Modal isOpen={isPasteModalOpen} onClose={() => setIsPasteModalOpen(false)} title="貼上 Excel 資料">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      請將 Excel 資料複製並貼上到下方區域。<br />格式順序：類別 | KOL/服務 | 執行內容 | 數量 | 單價 | 成本
                    </p>
                    <Textarea placeholder="在此貼上資料..." className="min-h-[200px]" value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} />
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setIsPasteModalOpen(false)}>取消</Button>
                      <Button onClick={handlePasteFromModal}>確認匯入</Button>
                    </div>
                  </div>
                </Modal>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => state.handleAddItem(quotationId, isSupplementMode)} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> {isSupplementMode ? '追加項目' : '新增項目'}
            </Button>
          </div>
        )}
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-card border rounded-md overflow-hidden">
          <thead className="bg-secondary/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left w-32 group/th cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('category')}>
                <span className="inline-flex items-center">類別<SortIcon columnKey="category" /></span>
              </th>
              <th className="px-3 py-2 text-left w-40 group/th cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('kol')}>
                <span className="inline-flex items-center">KOL/服務<SortIcon columnKey="kol" /></span>
              </th>
              <th className="px-3 py-2 text-left min-w-[160px] group/th cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('service')}>
                <span className="inline-flex items-center">執行內容<SortIcon columnKey="service" /></span>
              </th>
              <th className="px-3 py-2 text-right w-20 group/th cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('quantity')}>
                <span className="inline-flex items-center justify-end">數量<SortIcon columnKey="quantity" /></span>
              </th>
              <th className="px-3 py-2 text-right w-24 group/th cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('price')}>
                <span className="inline-flex items-center justify-end">單價<SortIcon columnKey="price" /></span>
              </th>
              <th className="px-3 py-2 text-right w-24 group/th cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('cost')}>
                <span className="inline-flex items-center justify-end">成本（未稅）<SortIcon columnKey="cost" /></span>
              </th>
              <th className="px-3 py-2 text-right w-24 group/th cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort('subtotal')}>
                <span className="inline-flex items-center justify-end">小計<SortIcon columnKey="subtotal" /></span>
              </th>
              {!readOnly && <th className="px-3 py-2 text-center w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {sortedItems.map((item) => {
              const selectedKol = kols.find(k => k.id === item.kol_id)
              const serviceOptions = selectedKol?.kol_services.map(s => ({
                label: s.service_types?.name || '未知服務',
                value: s.service_types?.name || '',
                data: { price: s.price, cost: s.cost }
              })) || []
              const isOriginalInSupplement = isSupplementMode && !item.is_supplement
              const isLocked = !!item.approved_at || isOriginalInSupplement
              const isApproved = !!item.approved_at
              const canDelete = !isOriginalInSupplement
                && !item.requested_at && !item.approved_at && !item.merge_group_id
                && !item.payment_requests?.some(pr => pr.verification_status !== 'rejected')

              return (
                <ItemsListRow
                  key={item.id}
                  item={item}
                  isLocked={isLocked}
                  isApproved={isApproved}
                  canDelete={canDelete}
                  isOriginalInSupplement={isOriginalInSupplement}
                  readOnly={readOnly}
                  onUpdateItem={state.handleUpdateItem}
                  onKolChange={state.handleKolChange}
                  onServiceChange={state.handleServiceChange}
                  onDeleteItem={(id) => state.handleDeleteItem(id, isSupplementMode)}
                  categoryOptions={categoryOptions}
                  kolOptions={kolOptions}
                  serviceOptions={serviceOptions}
                  selectedKolName={selectedKol?.name}
                />
              )
            })}
            {state.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground italic">
                  尚無項目，請點擊上方按鈕新增，或直接貼上 Excel 資料 (Ctrl+V)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
