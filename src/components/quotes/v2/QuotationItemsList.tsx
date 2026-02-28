'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { QuotationItemWithPayments } from '@/types/custom.types'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Loader2, Save, XCircle, ClipboardPaste, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { EditableCell } from './EditableCell'
import { SearchableSelectCell } from './SearchableSelectCell'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from '@/components/ui/ConfirmDialog'

type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type Kol = Database['public']['Tables']['kols']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']

type KolWithServices = Kol & { kol_services: (KolService & { service_types: ServiceType | null })[] }

interface QuotationItemsListProps {
    quotationId: string
    onUpdate?: () => void
    readOnly?: boolean
}

export function QuotationItemsList({ quotationId, onUpdate, readOnly = false }: QuotationItemsListProps) {
    const confirm = useConfirm()
    // 原始資料 (用於取消還原)
    const [originalItems, setOriginalItems] = useState<QuotationItemWithPayments[]>([])
    // 本地編輯狀態
    const [items, setItems] = useState<QuotationItemWithPayments[]>([])
    const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false)
    const [pasteContent, setPasteContent] = useState('')

    // 🆕 資料狀態
    const [kols, setKols] = useState<KolWithServices[]>([])
    const [categories, setCategories] = useState<QuoteCategory[]>([])

    // 初始資料載入
    useEffect(() => {
        const fetchReferenceData = async () => {
            const [kolsRes, categoriesRes] = await Promise.all([
                supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
                supabase.from('quote_categories').select('*').order('name')
            ])

            if (kolsRes.data) setKols(kolsRes.data as KolWithServices[])
            if (categoriesRes.data) setCategories(categoriesRes.data)
        }
        fetchReferenceData()
    }, [])

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

    useEffect(() => {
        fetchItems()
    }, [fetchItems])

    // 檢查是否有未儲存的變更
    const isDirty = useMemo(() => {
        if (deletedItemIds.size > 0) return true
        if (items.length !== originalItems.length) return true

        // 比較每個項目的內容
        return items.some(item => {
            // 如果是新項目 (ID 為 temp 開頭)
            if (item.id.startsWith('temp-')) return true // 其實現在用 UUID 了，這個判斷可能要改，但只要 ID 不在 originalItems 就算新

            // 找到對應的原始項目
            const original = originalItems.find(o => o.id === item.id)
            if (!original) return true // 新項目

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
        setItems(prev => prev.map(item =>
            item.id === id ? { ...item, ...updates } : item
        ))
    }

    // KOL 變更處理
    const handleKolChange = (itemId: string, kolId: string) => {
        handleUpdateItem(itemId, {
            kol_id: kolId,
            service: '',
            price: 0,
            cost: 0
        })
    }

    // 服務變更處理
    const handleServiceChange = (itemId: string, serviceName: string, data?: { price: number; cost: number }) => {
        const updates: Partial<QuotationItem> = { service: serviceName }
        if (data) {
            updates.price = data.price
            updates.cost = data.cost
        }
        handleUpdateItem(itemId, updates)
    }

    // 本地新增項目
    const handleAddItem = () => {
        const newItem: QuotationItem = {
            id: crypto.randomUUID(), // 🆕 使用正式 UUID
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
        }
        setItems(prev => [...prev, newItem])
    }

    // 本地刪除項目
    const handleDeleteItem = (id: string) => {
        // 檢查是否有關聯的付款申請
        const item = items.find(i => i.id === id);
        if (item) {
            const paymentRequests = item.payment_requests;
            if (paymentRequests && paymentRequests.length > 0) {
                const hasActiveRequest = paymentRequests.some(pr => pr.verification_status !== 'rejected');
                if (hasActiveRequest) {
                    toast.error('此項目已有進行中或已完成的付款申請，無法刪除。');
                    return;
                }
            }
        }

        // 判斷是否為新項目
        const isNew = !originalItems.some(item => item.id === id)

        if (isNew) {
            // 如果是尚未儲存的新項目，直接從列表中移除
            setItems(prev => prev.filter(item => item.id !== id))
        } else {
            // 如果是已存在的項目，標記為刪除
            setDeletedItemIds(prev => {
                const newSet = new Set(prev)
                newSet.add(id)
                return newSet
            })
            // 同時從顯示列表中隱藏
            setItems(prev => prev.filter(item => item.id !== id))
        }
    }

    // 儲存變更
    const handleSave = async () => {
        setIsSaving(true)
        try {
            // 0. 自動建立新服務類型與 KOL 服務關聯
            for (const item of items) {
                if (!item.kol_id || !item.service?.trim()) continue

                const kol = kols.find(k => k.id === item.kol_id)
                if (!kol) continue

                // 檢查該 KOL 是否已有此服務
                const hasService = kol.kol_services.some(
                    s => s.service_types?.name === item.service.trim()
                )
                if (hasService) continue

                // 查詢或建立 service_type
                let serviceTypeId: string
                const { data: existingST } = await supabase
                    .from('service_types')
                    .select('id')
                    .eq('name', item.service.trim())
                    .maybeSingle()

                if (existingST) {
                    serviceTypeId = existingST.id
                } else {
                    const { data: newST, error } = await supabase
                        .from('service_types')
                        .insert({ name: item.service.trim() })
                        .select()
                        .single()
                    if (error) {
                        console.error(`建立服務類型失敗:`, error)
                        continue
                    }
                    serviceTypeId = newST.id
                }

                // 確認 kol_service 關聯不存在後建立
                const { data: existingLink } = await supabase
                    .from('kol_services')
                    .select('id')
                    .eq('kol_id', item.kol_id)
                    .eq('service_type_id', serviceTypeId)
                    .maybeSingle()

                if (!existingLink) {
                    await supabase.from('kol_services').insert({
                        kol_id: item.kol_id,
                        service_type_id: serviceTypeId,
                        price: Number(item.price) || 0,
                        cost: Number(item.cost) || 0,
                    })
                    toast.success(`已自動建立 KOL 服務「${item.service.trim()}」`)
                }
            }

            // 1. 準備要保存的項目資料
            const itemsToSave = items.map(item => {
                const { created_at: _created_at, payment_requests: _payment_requests, ...rest } = item
                return {
                    ...rest,
                    quotation_id: quotationId,
                    price: Number(item.price) || 0,
                    cost: Number(item.cost) || 0,
                    quantity: Number(item.quantity) || 1,
                    service: item.service || ''
                }
            })

            // 2. 刪除 DB 中不該存在的項目（伺服器端篩選，徹底清理髒資料）
            const keepIds = items
                .filter(item => originalItems.some(o => o.id === item.id))
                .map(item => item.id)

            if (keepIds.length > 0) {
                // 刪除此報價單中不在保留清單裡的所有項目
                const { error: deleteError } = await supabase
                    .from('quotation_items')
                    .delete()
                    .eq('quotation_id', quotationId)
                    .not('id', 'in', `(${keepIds.join(',')})`)
                if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
            } else {
                // 沒有要保留的既有項目，全部刪除
                const { error: deleteError } = await supabase
                    .from('quotation_items')
                    .delete()
                    .eq('quotation_id', quotationId)
                if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
            }

            // 3. 寫入項目（明確指定 onConflict 避免 PostgREST 衝突偵測問題）
            if (itemsToSave.length > 0) {
                const { error } = await supabase
                    .from('quotation_items')
                    .upsert(itemsToSave, { onConflict: 'id' })
                if (error) throw error
            }

            // 3. 計算並更新報價單總金額
            const subtotalUntaxed = items.reduce((acc, item) => acc + (item.price * (item.quantity ?? 1)), 0)
            const tax = Math.round(subtotalUntaxed * 0.05)
            const grandTotalTaxed = subtotalUntaxed + tax

            const { error: updateError } = await supabase
                .from('quotations')
                .update({
                    subtotal_untaxed: subtotalUntaxed,
                    tax: tax,
                    grand_total_taxed: grandTotalTaxed
                })
                .eq('id', quotationId)

            if (updateError) throw updateError

            toast.success('儲存成功')
            // 重新載入項目和 KOL 資料（反映新建立的服務）
            const [, kolsRes] = await Promise.all([
                fetchItems(),
                supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
            ])
            if (kolsRes.data) setKols(kolsRes.data as KolWithServices[])
            if (onUpdate) onUpdate() // 通知父層更新總金額

        } catch (error: unknown) {
            console.error('Save error:', error)
            toast.error('儲存失敗: ' + (error instanceof Error ? error.message : String(error)))
        } finally {
            setIsSaving(false)
        }
    }

    // 取消變更
    const handleCancel = async () => {
        const ok = await confirm({
            title: '放棄變更',
            description: '確定要放棄所有未儲存的變更嗎？',
        })
        if (ok) {
            setItems(originalItems)
            setDeletedItemIds(new Set())
        }
    }

    // 解析並處理貼上的內容
    const processPasteData = (text: string) => {
        const rows = text.split(/\r?\n/).filter(row => row.trim() !== '')
        if (rows.length === 0) return

        const newItems: QuotationItem[] = []

        rows.forEach((row, _index) => {
            // 簡單處理 tab 分隔，若有更複雜的 CSV 格式可能需要專門的 parser
            const cols = row.split('\t')

            // 假設順序：類別 | KOL/服務 | 執行內容 | 數量 | 單價 | 成本
            const category = cols[0]?.trim() || null
            const kolName = cols[1]?.trim() || null
            const service = cols[2]?.trim() || ''
            const quantity = Number(cols[3]?.trim()) || 1
            const price = Number(cols[4]?.replace(/,/g, '').trim()) || 0
            const cost = Number(cols[5]?.replace(/,/g, '').trim()) || 0

            // 嘗試匹配 KOL ID
            let kolId = null
            if (kolName) {
                const foundKol = kols.find(k => k.name === kolName || k.real_name === kolName)
                if (foundKol) kolId = foundKol.id
            }

            newItems.push({
                id: crypto.randomUUID(), // 🆕 使用正式 UUID
                quotation_id: quotationId,
                category,
                kol_id: kolId,
                service,
                quantity,
                price,
                cost,
                created_at: new Date().toISOString(),
                created_by: null,
                remark: null,
                remittance_name: null,
            })
        })

        if (newItems.length > 0) {
            setItems(prev => [...prev, ...newItems])
            toast.success(`已從剪貼簿新增 ${newItems.length} 個項目`)
            setIsPasteModalOpen(false)
            setPasteContent('')
        }
    }

    // 🆕 Excel 貼上處理 (全域監聽)
    const handlePaste = (e: React.ClipboardEvent) => {
        const clipboardData = e.clipboardData.getData('text')
        if (!clipboardData) return

        // 檢查是否包含換行符 (表示多行資料) 或 Tab (表示 Excel 單行資料)
        const hasNewlines = clipboardData.includes('\n') || clipboardData.includes('\r')
        const hasTabs = clipboardData.includes('\t')

        // 如果是多行資料或包含 Tab 的資料，即使在 Input 中也攔截
        // 這樣可以防止 Excel 資料被塞進單一儲存格
        if (hasNewlines || hasTabs) {
            e.preventDefault() // 阻止預設貼上 (這很重要，否則資料會進到 Input)
            processPasteData(clipboardData)
        }
        // 如果是純文字且在 Input 中，則不攔截，讓用戶正常編輯
    }

    // 排序狀態
    type SortKey = 'category' | 'kol' | 'service' | 'quantity' | 'price' | 'cost' | 'subtotal'
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null)

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                // 同欄位：asc → desc → 取消
                if (prev.direction === 'asc') return { key, direction: 'desc' }
                return null
            }
            return { key, direction: 'asc' }
        })
    }

    const sortedItems = useMemo(() => {
        if (!sortConfig) return items

        const { key, direction } = sortConfig
        const sorted = [...items].sort((a, b) => {
            let aVal: string | number = ''
            let bVal: string | number = ''

            switch (key) {
                case 'category':
                    aVal = a.category || ''
                    bVal = b.category || ''
                    break
                case 'kol':
                    aVal = kols.find(k => k.id === a.kol_id)?.name || ''
                    bVal = kols.find(k => k.id === b.kol_id)?.name || ''
                    break
                case 'service':
                    aVal = a.service || ''
                    bVal = b.service || ''
                    break
                case 'quantity':
                    aVal = a.quantity ?? 0
                    bVal = b.quantity ?? 0
                    break
                case 'price':
                    aVal = a.price
                    bVal = b.price
                    break
                case 'cost':
                    aVal = a.cost ?? 0
                    bVal = b.cost ?? 0
                    break
                case 'subtotal':
                    aVal = (a.quantity ?? 0) * a.price
                    bVal = (b.quantity ?? 0) * b.price
                    break
            }

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return direction === 'asc' ? aVal.localeCompare(bVal, 'zh-Hant') : bVal.localeCompare(aVal, 'zh-Hant')
            }
            return direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
        })
        return sorted
    }, [items, sortConfig, kols])

    const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
        if (sortConfig?.key !== columnKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-0 group-hover/th:opacity-50" />
        if (sortConfig.direction === 'asc') return <ArrowUp className="h-3 w-3 ml-1 text-primary" />
        return <ArrowDown className="h-3 w-3 ml-1 text-primary" />
    }

    // 選項準備
    const categoryOptions = useMemo(() =>
        categories.map(c => ({ label: c.name, value: c.name })),
        [categories])

    const kolOptions = useMemo(() =>
        kols.map(k => ({ label: k.name, value: k.id, subLabel: k.real_name || undefined })),
        [kols])

    if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>

    return (
        <div
            className="bg-secondary p-4 rounded-lg border border-border shadow-inner outline-none"
            onPaste={readOnly ? undefined : handlePaste}
            tabIndex={0} // 讓 div 可以接收焦點
        >
            <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-foreground/70">
                    成本明細 (報價項目)
                    <span className="ml-2 text-xs font-normal text-muted-foreground hidden sm:inline">
                        (支援 Excel 貼上: 類別 | KOL/服務 | 執行內容 | 數量 | 單價 | 成本)
                    </span>
                </h4>
                {!readOnly && (
                    <div className="flex space-x-2">
                        {isDirty && (
                            <>
                                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving} className="h-7 text-xs text-muted-foreground hover:text-foreground/70">
                                    <XCircle className="h-3 w-3 mr-1" /> 取消
                                </Button>
                                <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
                                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                                    儲存變更
                                </Button>
                            </>
                        )}

                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setIsPasteModalOpen(true)}
                        >
                            <ClipboardPaste className="h-3 w-3 mr-1" /> 貼上 Excel
                        </Button>

                        <Modal
                            isOpen={isPasteModalOpen}
                            onClose={() => setIsPasteModalOpen(false)}
                            title="貼上 Excel 資料"
                        >
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    請將 Excel 資料複製並貼上到下方區域。<br />
                                    格式順序：類別 | KOL/服務 | 執行內容 | 數量 | 單價 | 成本
                                </p>
                                <Textarea
                                    placeholder="在此貼上資料..."
                                    className="min-h-[200px]"
                                    value={pasteContent}
                                    onChange={(e) => setPasteContent(e.target.value)}
                                />
                                <div className="flex justify-end space-x-2">
                                    <Button variant="outline" onClick={() => setIsPasteModalOpen(false)}>取消</Button>
                                    <Button onClick={() => processPasteData(pasteContent)}>確認匯入</Button>
                                </div>
                            </div>
                        </Modal>

                        <Button size="sm" variant="outline" onClick={handleAddItem} className="h-7 text-xs">
                            <Plus className="h-3 w-3 mr-1" /> 新增項目
                        </Button>
                    </div>
                )}
            </div>

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
                                <span className="inline-flex items-center justify-end">成本<SortIcon columnKey="cost" /></span>
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

                            return (
                                <tr key={item.id} className="hover:bg-accent/30 group">
                                    <td className="border-r border-border/50 p-0">
                                        <SearchableSelectCell
                                            value={item.category}
                                            onChange={(val) => handleUpdateItem(item.id, { category: val })}
                                            options={categoryOptions}
                                            placeholder="選擇類別"
                                            className="px-3 py-2"
                                            allowCustomValue={true}
                                        />
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        <SearchableSelectCell
                                            value={item.kol_id}
                                            displayValue={selectedKol?.name}
                                            onChange={(val) => handleKolChange(item.id, val)}
                                            options={kolOptions}
                                            placeholder="搜尋 KOL/服務"
                                            className="px-3 py-2 font-medium text-primary"
                                        />
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        <SearchableSelectCell
                                            value={item.service}
                                            onChange={(val, data) => handleServiceChange(item.id, val, data as { price: number; cost: number } | undefined)}
                                            options={serviceOptions}
                                            placeholder={item.kol_id ? "選擇執行內容" : "請先選 KOL/服務"}
                                            className="px-3 py-2"
                                            allowCustomValue={true}
                                        />
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        <EditableCell
                                            value={item.quantity}
                                            type="number"
                                            onChange={(val) => handleUpdateItem(item.id, { quantity: Number(val) })}
                                            className="px-3 py-2 text-right"
                                        />
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        <EditableCell
                                            value={item.price}
                                            type="number"
                                            onChange={(val) => handleUpdateItem(item.id, { price: Number(val) })}
                                            className="px-3 py-2 text-right"
                                        />
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        <EditableCell
                                            value={item.cost}
                                            type="number"
                                            onChange={(val) => handleUpdateItem(item.id, { cost: Number(val) })}
                                            className="px-3 py-2 text-right text-muted-foreground"
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-foreground/70">
                                        {((item.quantity ?? 0) * item.price).toLocaleString()}
                                    </td>
                                    {!readOnly && (
                                        <td className="px-1 py-1 text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={`h-6 w-6 p-0 ${
                                                    item.payment_requests?.some(pr => pr.verification_status !== 'rejected')
                                                        ? 'text-muted-foreground cursor-not-allowed'
                                                        : 'opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive'
                                                    }`}
                                                onClick={() => handleDeleteItem(item.id)}
                                                disabled={
                                                    item.payment_requests?.some(pr => pr.verification_status !== 'rejected')
                                                }
                                                title={
                                                    item.payment_requests?.some(pr => pr.verification_status !== 'rejected')
                                                        ? '此項目已有付款申請，無法刪除'
                                                        : '刪除項目'
                                                }
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            )
                        })}
                        {items.length === 0 && (
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
