'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { QuotationItemWithPayments } from '@/types/custom.types'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Loader2, Save, XCircle, ClipboardPaste, ArrowUp, ArrowDown, ArrowUpDown, CheckCircle2, AlertTriangle, Paperclip, Lock, Info, Link2 } from 'lucide-react'
import { EditableCell } from './EditableCell'
import { SearchableSelectCell } from './SearchableSelectCell'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { PaymentAttachment } from '@/lib/payments/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AttachmentUploader } from './AttachmentUploader'

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
    quotationStatus?: string
}

export function QuotationItemsList({ quotationId, onUpdate, readOnly = false, quotationStatus }: QuotationItemsListProps) {
    const confirm = useConfirm()

    // 追加模式：已簽約報價單鎖定原始項目，只允許新增追加項目
    const isSupplementMode = quotationStatus === '已簽約'

    // 原始資料 (用於取消還原)
    const [originalItems, setOriginalItems] = useState<QuotationItemWithPayments[]>([])
    // 本地編輯狀態
    const [items, setItems] = useState<QuotationItemWithPayments[]>([])
    const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false)
    const [pasteContent, setPasteContent] = useState('')

    // 請款管理狀態
    const [verificationItemId, setVerificationItemId] = useState<string | null>(null)
    const [verificationInvoice, setVerificationInvoice] = useState('')
    const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())

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

    // 頁面切換回來時自動重新載入（處理從其他頁面退回後狀態同步）
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchItems()
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
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

    // 本地刪除項目
    const handleDeleteItem = (id: string) => {
        const item = items.find(i => i.id === id);
        if (item) {
            // 追加模式下，原始項目不可刪除
            if (isSupplementMode && !item.is_supplement) {
                toast.error('追加模式下不可刪除原始項目。');
                return;
            }
            // 新流程：已進入請款流程的項目不可刪除
            if (item.requested_at || item.approved_at) {
                toast.error('此項目已進入請款流程，無法刪除。');
                return;
            }
            // 舊流程：檢查是否有關聯的付款申請
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
            // 0a. 自動建立新 KOL 記錄（輸入的名稱不在現有 KOL 中時）
            const kolNameToId = new Map<string, string>()
            for (const item of items) {
                if (!item.kol_id?.trim()) continue
                const isExistingKol = kols.some(k => k.id === item.kol_id)
                if (isExistingKol) continue

                const kolName = item.kol_id.trim()
                if (kolNameToId.has(kolName)) continue

                // 檢查 DB 中是否已有同名 KOL
                const { data: existingByName } = await supabase
                    .from('kols')
                    .select('id')
                    .eq('name', kolName)
                    .maybeSingle()

                if (existingByName) {
                    kolNameToId.set(kolName, existingByName.id)
                } else {
                    const { data: newKol, error: kolError } = await supabase
                        .from('kols')
                        .insert({ name: kolName })
                        .select()
                        .single()
                    if (kolError) {
                        toast.error(`無法建立 KOL/服務「${kolName}」: ${kolError.message}`)
                        setIsSaving(false)
                        return
                    }
                    kolNameToId.set(kolName, newKol.id)
                    toast.success(`已自動建立 KOL/服務「${kolName}」`)
                }
            }

            // 將新 KOL 名稱解析為實際 ID 的輔助函式
            const resolveKolId = (kolId: string | null) => {
                if (kolId && kolNameToId.has(kolId.trim())) {
                    return kolNameToId.get(kolId.trim())!
                }
                return kolId
            }

            // 不可變更新 UI 狀態
            if (kolNameToId.size > 0) {
                setItems(prev => prev.map(item => ({
                    ...item,
                    kol_id: resolveKolId(item.kol_id)
                })))
            }

            // 0b. 自動建立新服務類型與 KOL 服務關聯
            for (const item of items) {
                const itemKolId = resolveKolId(item.kol_id)
                if (!itemKolId || !item.service?.trim()) continue

                const kol = kols.find(k => k.id === itemKolId)
                // 對既有 KOL 檢查是否已有此服務；新建 KOL 則直接建立服務
                if (kol) {
                    const hasService = kol.kol_services.some(
                        s => s.service_types?.name === item.service.trim()
                    )
                    if (hasService) continue
                }

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
                    .eq('kol_id', itemKolId)
                    .eq('service_type_id', serviceTypeId)
                    .maybeSingle()

                if (!existingLink) {
                    await supabase.from('kol_services').insert({
                        kol_id: itemKolId,
                        service_type_id: serviceTypeId,
                        price: Number(item.price) || 0,
                        cost: Number(item.cost) || 0,
                    })
                    toast.success(`已自動建立 KOL 服務「${item.service.trim()}」`)
                }
            }

            // 1. 準備要保存的項目資料（排除請款管理欄位，避免覆蓋即時操作的狀態）
            const itemsToSave = items.map(item => {
                const {
                    created_at: _ca, payment_requests: _pr,
                    cost_amount: _costAmt, invoice_number: _inv, attachments: _att,
                    expense_type: _et, accounting_subject: _as, expected_payment_month: _epm,
                    requested_at: _reqAt, requested_by: _reqBy,
                    approved_at: _appAt, approved_by: _appBy,
                    rejection_reason: _rr, rejected_at: _rejAt, rejected_by: _rejBy,
                    merge_group_id: _mgId, is_merge_leader: _iml, merge_color: _mc,
                    ...rest
                } = item
                return {
                    ...rest,
                    kol_id: resolveKolId(rest.kol_id),
                    quotation_id: quotationId,
                    price: Number(item.price) || 0,
                    cost: Number(item.cost) || 0,
                    quantity: Number(item.quantity) || 1,
                    service: item.service || ''
                }
            })

            // 2. 刪除 DB 中不該存在的項目
            const keepIds = items
                .filter(item => originalItems.some(o => o.id === item.id))
                .map(item => item.id)

            if (isSupplementMode) {
                // 追加模式：僅刪除被移除的追加項目，原始項目絕不動
                if (keepIds.length > 0) {
                    const { error: deleteError } = await supabase
                        .from('quotation_items')
                        .delete()
                        .eq('quotation_id', quotationId)
                        .eq('is_supplement', true)
                        .not('id', 'in', `(${keepIds.join(',')})`)
                    if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
                }
            } else {
                // 一般模式：清理所有不在保留清單裡的項目
                if (keepIds.length > 0) {
                    const { error: deleteError } = await supabase
                        .from('quotation_items')
                        .delete()
                        .eq('quotation_id', quotationId)
                        .not('id', 'in', `(${keepIds.join(',')})`)
                    if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
                } else {
                    const { error: deleteError } = await supabase
                        .from('quotation_items')
                        .delete()
                        .eq('quotation_id', quotationId)
                    if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
                }
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

            // 追加模式：同步更新銷項管理金額
            if (isSupplementMode) {
                const { error: salesError } = await supabase
                    .from('accounting_sales')
                    .update({
                        sales_amount: subtotalUntaxed,
                        tax_amount: tax,
                        total_amount: grandTotalTaxed,
                    })
                    .eq('quotation_id', quotationId)
                if (salesError) {
                    console.error('銷項同步失敗:', salesError)
                    toast.warning('項目已儲存，但銷項帳務同步失敗')
                } else {
                    toast.success('儲存成功，銷項帳務已同步更新')
                }
            } else {
                toast.success('儲存成功')
            }

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
                id: crypto.randomUUID(),
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

    // ==================== 請款管理邏輯 ====================

    type PaymentStatus = 'pending' | 'requested' | 'approved' | 'rejected'

    const getPaymentStatus = (item: QuotationItemWithPayments): PaymentStatus => {
        if (item.approved_at) return 'approved'
        if (item.requested_at) return 'requested'
        if (item.rejected_at && item.rejection_reason) return 'rejected'
        return 'pending'
    }

    const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
        pending: { label: '待請款', className: 'bg-muted text-muted-foreground' },
        requested: { label: '待審核', className: 'bg-warning/20 text-warning' },
        approved: { label: '已請款', className: 'bg-success/20 text-success' },
        rejected: { label: '被駁回', className: 'bg-destructive/20 text-destructive' },
    }

    const isVerificationPassed = (item: QuotationItemWithPayments): boolean => {
        const attachments = (item.attachments || []) as unknown as PaymentAttachment[]
        const hasAttachments = attachments.length > 0
        const invoiceNumber = item.invoice_number || ''
        const hasValidInvoice = /^[A-Za-z]{2}-\d{8}$/.test(invoiceNumber)
        return hasAttachments || hasValidInvoice
    }

    const setItemActionLoading = (itemId: string, loading: boolean) => {
        setActionLoading(prev => {
            const next = new Set(prev)
            if (loading) next.add(itemId)
            else next.delete(itemId)
            return next
        })
    }

    // 開啟檢核 modal
    const handleOpenVerification = (item: QuotationItemWithPayments) => {
        setVerificationItemId(item.id)
        setVerificationInvoice(item.invoice_number || '')
    }

    // 儲存檢核資訊（發票號碼）
    const handleSaveVerification = async () => {
        if (!verificationItemId) return
        const trimmed = verificationInvoice.trim()

        if (trimmed && !/^[A-Za-z]{2}-\d{8}$/.test(trimmed)) {
            toast.error('發票號碼格式不正確（範例：AB-12345678）')
            return
        }

        setItemActionLoading(verificationItemId, true)
        try {
            const { error } = await supabase
                .from('quotation_items')
                .update({ invoice_number: trimmed || null })
                .eq('id', verificationItemId)

            if (error) throw error

            // 更新本地狀態
            setItems(prev => prev.map(item =>
                item.id === verificationItemId
                    ? { ...item, invoice_number: trimmed || null }
                    : item
            ))
            setOriginalItems(prev => prev.map(item =>
                item.id === verificationItemId
                    ? { ...item, invoice_number: trimmed || null }
                    : item
            ))
            toast.success('發票號碼已更新')
            setVerificationItemId(null)
        } catch (error) {
            toast.error('更新失敗: ' + (error instanceof Error ? error.message : String(error)))
        } finally {
            setItemActionLoading(verificationItemId, false)
        }
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
            {/* 追加模式提示 */}
            {isSupplementMode && !readOnly && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-info/10 border border-info/25 text-sm text-info">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>追加模式 — 原始項目已鎖定，僅可新增追加項目</span>
                </div>
            )}

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

                        {!isSupplementMode && (
                            <>
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
                            </>
                        )}

                        <Button size="sm" variant="outline" onClick={handleAddItem} className="h-7 text-xs">
                            <Plus className="h-3 w-3 mr-1" /> {isSupplementMode ? '追加項目' : '新增項目'}
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
                            {/* 請款管理欄位 */}
                            <th className="px-3 py-2 text-center w-20 border-l-2 border-border">狀態</th>
                            <th className="px-3 py-2 text-center w-16">檢核</th>
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

                            // 請款管理狀態
                            const status = getPaymentStatus(item)
                            const statusConfig = PAYMENT_STATUS_CONFIG[status]
                            const verified = isVerificationPassed(item)
                            const isItemLoading = actionLoading.has(item.id)
                            // 追加模式下：原始項目的「資料欄位」鎖定，但「成本/檢核/請款」仍可操作
                            const isOriginalInSupplement = isSupplementMode && !item.is_supplement
                            const isLocked = !!item.approved_at || isOriginalInSupplement  // 資料欄位鎖定（類別、KOL、執行內容、數量、單價）
                            const isApproved = !!item.approved_at  // 流程欄位鎖定（成本、檢核）— 只有審核通過才鎖
                            const canDelete = !isOriginalInSupplement
                                && !item.requested_at && !item.approved_at
                                && !item.payment_requests?.some(pr => pr.verification_status !== 'rejected')

                            return (
                                <tr key={item.id} className={`hover:bg-accent/30 group ${
                                    isOriginalInSupplement ? 'bg-muted/30 opacity-70' :
                                    item.is_supplement ? 'border-l-4 border-l-success' :
                                    isLocked ? 'opacity-80' : ''
                                }`}>
                                    <td className="border-r border-border/50 p-0">
                                        {isLocked ? (
                                            <div className="px-3 py-2 text-muted-foreground flex items-center gap-1.5">
                                                {isOriginalInSupplement && <Lock className="h-3 w-3 text-muted-foreground/50" />}
                                                {item.category || '—'}
                                                {item.is_supplement && (
                                                    <span className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded">追加</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5">
                                                <SearchableSelectCell
                                                    value={item.category}
                                                    onChange={(val) => handleUpdateItem(item.id, { category: val })}
                                                    options={categoryOptions}
                                                    placeholder="選擇類別"
                                                    className="px-3 py-2 flex-1"
                                                    allowCustomValue={true}
                                                />
                                                {item.is_supplement && (
                                                    <span className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded mr-1 shrink-0">追加</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        {isLocked ? (
                                            <div className="px-3 py-2 font-medium text-primary">{selectedKol?.name || '—'}</div>
                                        ) : (
                                            <SearchableSelectCell
                                                value={item.kol_id}
                                                displayValue={selectedKol?.name || item.kol_id || undefined}
                                                onChange={(val) => handleKolChange(item.id, val)}
                                                options={kolOptions}
                                                placeholder="搜尋 KOL/服務"
                                                className="px-3 py-2 font-medium text-primary"
                                                allowCustomValue={true}
                                            />
                                        )}
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        {isLocked ? (
                                            <div className="px-3 py-2">{item.service || '—'}</div>
                                        ) : (
                                            <SearchableSelectCell
                                                value={item.service}
                                                onChange={(val, data) => handleServiceChange(item.id, val, data as { price: number; cost: number } | undefined)}
                                                options={serviceOptions}
                                                placeholder={item.kol_id ? "選擇執行內容" : "請先選 KOL/服務"}
                                                className="px-3 py-2"
                                                allowCustomValue={true}
                                            />
                                        )}
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        {isLocked ? (
                                            <div className="px-3 py-2 text-right">{item.quantity}</div>
                                        ) : (
                                            <EditableCell
                                                value={item.quantity}
                                                type="number"
                                                onChange={(val) => handleUpdateItem(item.id, { quantity: Number(val) })}
                                                className="px-3 py-2 text-right"
                                            />
                                        )}
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        {isLocked ? (
                                            <div className="px-3 py-2 text-right">{item.price.toLocaleString()}</div>
                                        ) : (
                                            <EditableCell
                                                value={item.price}
                                                type="number"
                                                onChange={(val) => handleUpdateItem(item.id, { price: Number(val) })}
                                                className="px-3 py-2 text-right"
                                            />
                                        )}
                                    </td>
                                    <td className="border-r border-border/50 p-0">
                                        {isApproved ? (
                                            <div className="px-3 py-2 text-right text-muted-foreground">{(item.cost ?? 0).toLocaleString()}</div>
                                        ) : (
                                            <EditableCell
                                                value={item.cost}
                                                type="number"
                                                onChange={(val) => handleUpdateItem(item.id, { cost: Number(val) })}
                                                className="px-3 py-2 text-right text-muted-foreground"
                                            />
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-foreground/70">
                                        {((item.quantity ?? 0) * item.price).toLocaleString()}
                                    </td>

                                    {/* ===== 請款管理欄位 ===== */}

                                    {/* 狀態 + 合併標記 */}
                                    <td className="px-2 py-2 text-center border-l-2 border-border">
                                        <div className="flex items-center justify-center gap-1">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusConfig.className}`}>
                                                {statusConfig.label}
                                            </span>
                                            {item.merge_group_id && (
                                                <a
                                                    href="/dashboard/payment-workbench"
                                                    className="inline-flex items-center gap-0.5 text-[10px] text-info hover:text-info/80 transition-colors"
                                                    title="已加入合併組 — 點擊前往請款工作台"
                                                >
                                                    <span
                                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: item.merge_color || 'var(--info)' }}
                                                    />
                                                    <Link2 className="h-3 w-3" />
                                                </a>
                                            )}
                                        </div>
                                    </td>

                                    {/* 檢核 */}
                                    <td className="px-2 py-2 text-center">
                                        {isApproved ? (
                                            <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                                        ) : (
                                            <button
                                                onClick={() => handleOpenVerification(item)}
                                                className="p-1 rounded hover:bg-accent transition-colors mx-auto flex items-center justify-center"
                                                title={verified ? `發票: ${item.invoice_number || '附件已上傳'}` : '點擊檢核文件'}
                                            >
                                                {verified ? (
                                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                                ) : (
                                                    <AlertTriangle className="h-4 w-4 text-warning" />
                                                )}
                                            </button>
                                        )}
                                    </td>


                                    {!readOnly && (
                                        <td className="px-1 py-1 text-center">
                                            {isOriginalInSupplement ? (
                                                <span className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground/30" title="原始項目已鎖定">
                                                    <Lock className="h-3 w-3" />
                                                </span>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className={`h-6 w-6 p-0 ${
                                                        !canDelete
                                                            ? 'text-muted-foreground cursor-not-allowed'
                                                            : 'opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive'
                                                        }`}
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    disabled={!canDelete}
                                                    title={!canDelete ? '此項目已進入請款流程，無法刪除' : '刪除項目'}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            )
                        })}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground italic">
                                    尚無項目，請點擊上方按鈕新增，或直接貼上 Excel 資料 (Ctrl+V)
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 檢核 Modal */}
            <Modal
                isOpen={!!verificationItemId}
                onClose={() => setVerificationItemId(null)}
                title="文件檢核"
            >
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="invoice-number" className="text-sm font-medium">
                            發票號碼
                        </Label>
                        <Input
                            id="invoice-number"
                            placeholder="XX-12345678"
                            value={verificationInvoice}
                            onChange={(e) => setVerificationInvoice(e.target.value)}
                            className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            格式：2 碼英文 + 連字號 + 8 碼數字（如 AB-12345678）
                        </p>
                    </div>
                    <div>
                        <Label className="text-sm font-medium flex items-center gap-1 mb-2">
                            <Paperclip className="h-3.5 w-3.5" /> 附件
                        </Label>
                        {verificationItemId && (
                            <AttachmentUploader
                                itemId={verificationItemId}
                                currentAttachments={
                                    ((items.find(i => i.id === verificationItemId)?.attachments || []) as unknown as PaymentAttachment[])
                                }
                                onUpdate={(newAttachments) => {
                                    // 同步更新本地狀態
                                    const attJson = JSON.parse(JSON.stringify(newAttachments))
                                    setItems(prev => prev.map(item =>
                                        item.id === verificationItemId
                                            ? { ...item, attachments: attJson }
                                            : item
                                    ))
                                    setOriginalItems(prev => prev.map(item =>
                                        item.id === verificationItemId
                                            ? { ...item, attachments: attJson }
                                            : item
                                    ))
                                }}
                                readOnly={!!items.find(i => i.id === verificationItemId)?.approved_at}
                            />
                        )}
                    </div>
                    <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => setVerificationItemId(null)}>
                            取消
                        </Button>
                        <Button onClick={handleSaveVerification}>
                            儲存
                        </Button>
                    </div>
                </div>
            </Modal>

        </div>
    )
}
