'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Loader2, Save, XCircle, ClipboardPaste } from 'lucide-react'
import { EditableCell } from './EditableCell'
import { SearchableSelectCell } from './SearchableSelectCell'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Textarea } from "@/components/ui/textarea"

type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type Kol = Database['public']['Tables']['kols']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']

type KolWithServices = Kol & { kol_services: (KolService & { service_types: ServiceType | null })[] }

interface QuotationItemsListProps {
    quotationId: string
    onUpdate?: () => void
}

export function QuotationItemsList({ quotationId, onUpdate }: QuotationItemsListProps) {
    // 原始資料 (用於取消還原)
    const [originalItems, setOriginalItems] = useState<QuotationItem[]>([])
    // 本地編輯狀態
    const [items, setItems] = useState<QuotationItem[]>([])
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
    const handleServiceChange = (itemId: string, serviceName: string, price?: number) => {
        const updates: Partial<QuotationItem> = { service: serviceName }
        if (price !== undefined) {
            updates.price = price
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
            remark: null
        }
        setItems(prev => [...prev, newItem])
    }

    // 本地刪除項目
    const handleDeleteItem = (id: string) => {
        // 檢查是否有關聯的付款申請
        const item = items.find(i => i.id === id);
        if (item) {
            // @ts-ignore - payment_requests is joined
            const paymentRequests = item.payment_requests as any[];
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
            // 1. 執行刪除
            if (deletedItemIds.size > 0) {
                const { error } = await supabase
                    .from('quotation_items')
                    .delete()
                    .in('id', Array.from(deletedItemIds))
                if (error) throw error
            }

            // 2. 執行新增與更新
            // 2. 執行新增與更新
            const itemsToUpsert = items.map(item => {
                // 移除 created_at，讓資料庫處理 (新增時 default now()，更新時不變)
                // 移除 payment_requests，這是關聯資料，不能寫入
                // 必須保留 id，因為我們現在全都是 UUID
                // @ts-ignore
                const { created_at, payment_requests, ...rest } = item

                // 確保數值正確
                return {
                    ...rest,
                    quotation_id: quotationId,
                    price: Number(item.price) || 0,
                    cost: Number(item.cost) || 0,
                    quantity: Number(item.quantity) || 1,
                    service: item.service || '' // 確保不為 null
                }
            })

            if (itemsToUpsert.length > 0) {
                const { error } = await supabase
                    .from('quotation_items')
                    .upsert(itemsToUpsert)
                if (error) throw error
            }

            // 3. 計算並更新報價單總金額
            const subtotalUntaxed = items.reduce((acc, item) => acc + (item.price * item.quantity), 0)
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
            await fetchItems() // 重新載入以獲取最新 ID 和狀態
            if (onUpdate) onUpdate() // 通知父層更新總金額

        } catch (error: any) {
            console.error('Save error:', error)
            toast.error('儲存失敗: ' + error.message)
        } finally {
            setIsSaving(false)
        }
    }

    // 取消變更
    const handleCancel = () => {
        if (confirm('確定要放棄所有未儲存的變更嗎？')) {
            setItems(originalItems)
            setDeletedItemIds(new Set())
        }
    }

    // 解析並處理貼上的內容
    const processPasteData = (text: string) => {
        const rows = text.split(/\r?\n/).filter(row => row.trim() !== '')
        if (rows.length === 0) return

        const newItems: QuotationItem[] = []

        rows.forEach((row, index) => {
            // 簡單處理 tab 分隔，若有更複雜的 CSV 格式可能需要專門的 parser
            const cols = row.split('\t')

            // 假設順序：類別 | KOL | 服務 | 數量 | 單價 | 成本
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
                remark: null
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
        const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA'

        if (hasNewlines || hasTabs) {
            e.preventDefault() // 阻止預設貼上 (這很重要，否則資料會進到 Input)
            processPasteData(clipboardData)
        }
        // 如果是純文字且在 Input 中，則不攔截，讓用戶正常編輯
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
            onPaste={handlePaste} // 監聽貼上事件
            tabIndex={0} // 讓 div 可以接收焦點
        >
            <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-foreground/70">
                    成本明細 (報價項目)
                    <span className="ml-2 text-xs font-normal text-muted-foreground hidden sm:inline">
                        (支援 Excel 貼上: 類別 | KOL | 服務 | 數量 | 單價 | 成本)
                    </span>
                </h4>
                <div className="flex space-x-2">
                    {isDirty && (
                        <>
                            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving} className="h-7 text-xs text-muted-foreground hover:text-foreground/70">
                                <XCircle className="h-3 w-3 mr-1" /> 取消
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                                儲存變更
                            </Button>
                        </>
                    )}

                    {/* 🆕 貼上 Excel 按鈕 (Modal) */}
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
                                格式順序：類別 | KOL | 服務 | 數量 | 單價 | 成本
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
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm bg-card border rounded-md overflow-hidden">
                    <thead className="bg-secondary/50 text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 text-left w-32">類別</th>
                            <th className="px-3 py-2 text-left w-40">KOL</th>
                            <th className="px-3 py-2 text-left min-w-[160px]">服務項目</th>
                            <th className="px-3 py-2 text-right w-20">數量</th>
                            <th className="px-3 py-2 text-right w-24">單價</th>
                            <th className="px-3 py-2 text-right w-24">成本</th>
                            <th className="px-3 py-2 text-right w-24">小計</th>
                            <th className="px-3 py-2 text-center w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {items.map((item) => {
                            const selectedKol = kols.find(k => k.id === item.kol_id)
                            const serviceOptions = selectedKol?.kol_services.map(s => ({
                                label: s.service_types?.name || '未知服務',
                                value: s.service_types?.name || '',
                                data: s.price
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
                                            placeholder="搜尋 KOL"
                                            className="px-3 py-2 font-medium text-blue-600"
                                        />
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        <SearchableSelectCell
                                            value={item.service}
                                            onChange={(val, price) => handleServiceChange(item.id, val, price)}
                                            options={serviceOptions}
                                            placeholder={item.kol_id ? "選擇服務" : "請先選 KOL"}
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
                                        {(item.quantity * item.price).toLocaleString()}
                                    </td>
                                    <td className="px-1 py-1 text-center">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-6 w-6 p-0 ${
                                                // @ts-ignore
                                                item.payment_requests?.some((pr: any) => pr.verification_status !== 'rejected')
                                                    ? 'text-muted-foreground cursor-not-allowed'
                                                    : 'opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600'
                                                }`}
                                            onClick={() => handleDeleteItem(item.id)}
                                            disabled={
                                                // @ts-ignore
                                                item.payment_requests?.some((pr: any) => pr.verification_status !== 'rejected')
                                            }
                                            title={
                                                // @ts-ignore
                                                item.payment_requests?.some((pr: any) => pr.verification_status !== 'rejected')
                                                    ? '此項目已有付款申請，無法刪除'
                                                    : '刪除項目'
                                            }
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </td>
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
