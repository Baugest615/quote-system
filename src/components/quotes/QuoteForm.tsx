// src/components/quotes/QuoteForm.tsx
'use client'

import { useForm, useFieldArray, Controller, SubmitHandler } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AutocompleteWithCreate } from '@/components/ui/AutocompleteWithCreate'
import { PlusCircle, Trash2, FileSignature, Calculator, Book } from 'lucide-react'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { handleQuotationAccountingSync } from '@/lib/accounting/sync-quote-accounting'
import { handleKolPriceSync } from '@/lib/kol/sync-kol-prices'

// --- Type Definitions ---
type Client = Database['public']['Tables']['clients']['Row']
type Kol = Database['public']['Tables']['kols']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']
type Quotation = Database['public']['Tables']['quotations']['Row']
type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type KolWithServices = Kol & { kol_services: (KolService & { service_types: ServiceType })[] }
type QuotationStatus = '草稿' | '待簽約' | '已簽約' | '已歸檔'

interface ContactInfo {
  name: string
  email?: string
  phone?: string
  position?: string
  is_primary?: boolean
}

interface ClientWithContacts extends Client {
  parsedContacts: ContactInfo[]
}

interface FormItem {
  id?: string
  quotation_id?: string | null
  category?: string | null
  kol_id?: string | null
  kol_name?: string | null
  is_new_kol?: boolean
  service: string
  is_new_service?: boolean
  quantity: number
  price: number
  cost?: number | null
  remark?: string | null
  created_at?: string | null
}

// --- Schema ---
const quoteSchema = z.object({
  project_name: z.string().min(1, '專案名稱為必填項目'),
  // Client fields
  client_id: z.string().nullable(),
  client_name: z.string().nullable().optional(),
  client_tin: z.string().nullable().optional(),
  client_invoice_title: z.string().nullable().optional(),
  client_address: z.string().nullable().optional(),
  is_new_client: z.boolean().optional(),
  // Contact fields
  client_contact: z.string().nullable(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  is_new_contact: z.boolean().optional(),
  // Other fields
  payment_method: z.enum(['電匯', 'ATM轉帳']),
  status: z.enum(['草稿', '待簽約', '已簽約', '已歸檔']).optional(),
  has_discount: z.boolean(),
  discounted_price: z.number().nullable(),
  terms: z.string().nullable(),
  remarks: z.string().nullable(),
  items: z.array(z.object({
    id: z.string().optional(),
    quotation_id: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    kol_id: z.string().nullable().optional(),
    kol_name: z.string().nullable().optional(),
    is_new_kol: z.boolean().optional(),
    service: z.string().min(1, '執行內容為必填'),
    is_new_service: z.boolean().optional(),
    quantity: z.number().min(1, '數量必須大於0'),
    price: z.number().min(0, '價格不能為負數'),
    cost: z.number().nullable().optional(),
    remark: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
  })).min(1, "請至少新增一個報價項目"),
})

type QuoteFormData = z.infer<typeof quoteSchema>
interface QuoteFormProps {
  initialData?: Quotation & { quotation_items: QuotationItem[] }
}

// --- Helper Functions ---
const transformInitialItems = (items?: QuotationItem[]): FormItem[] => {
  if (!items || items.length === 0) {
    return [{ category: null, kol_id: null, kol_name: null, is_new_kol: false, service: '', is_new_service: false, quantity: 1, price: 0, cost: 0, remark: null }]
  }
  return items.map((item): FormItem => ({
    id: item.id, quotation_id: item.quotation_id, category: item.category,
    kol_id: item.kol_id, kol_name: null, is_new_kol: false,
    service: item.service, is_new_service: false,
    quantity: item.quantity || 1, price: item.price, cost: item.cost,
    remark: item.remark, created_at: item.created_at,
  }))
}

const staticTerms = { standard: `合約約定：\n1、專案執行日期屆滿，另訂新約。\n2、本報價之範圍僅限以繁體中文及臺灣地區。如委刊客戶有其他需求，本公司需另行計價。\n3、為避免造成作業安排之困擾，執行日期簽定後，除非取得本公司書面同意延後，否則即按簽定之執行日期或條件開始計費。\n4、於本服務契約之專案購買項目與範圍內，本公司接受委刊客戶之書面指示進行，如委刊客戶有超出項目外之請求，雙方應另行書面協議之。\n5、專案經啟動後，除另有約定或經本公司書面同意之特殊理由，否則不得中途任意終止本契約書執行內容與範圍之全部或一部。如有雙方合意終止本專案之情形，本公司之服務費用依已發生之費用另行計算。如委刊客戶違反本項規定，本公司已收受之費用將不予退還，並另得向委刊客戶請求剩餘之未付費用作為違約金。\n6、委刊客戶委託之專案目標、任務及所提供刊登之素材皆不得有內容不實，或侵害他人著作權、商標權或其他權利及違反中華民國法律之情形，如有任何第三人主張委託公司之專案目標與任務有侵害其權利、違法或有其他交易糾紛之情形，本公司得於通知委託客戶後停止本專案之執行並單方終止本合約，本公司已收受之費用將不予退還；如更致本公司遭行政裁罰、刑事訴追或民事請求時，委託公司應出面處理相關爭議，並賠償本公司一切所受損害及支出費用。\n7、專案內之活動舉辦，不包含活動贈品購買及寄送，如有另外舉辦活動之贈品由委刊客戶提供。\n8、如委刊客戶於本約期間屆滿前15天以書面通知續約時，經本公司確認受理後，除有情事變更外，委刊客戶有權以相同價格與相同約定期間延展本約。\n9、如係可歸責本公司情形致無法於執行期間完成專案項目時，得與委刊客戶協議後延展服務期間完成，不另收取費用。\n10、委刊客戶之法定代理人應同意作為本服務契約連帶保證人。\n11、本約未盡事宜，悉依中華民國法律為準據法，雙方同意如因本約所發生之爭訟，以台北地方法院為一審管轄法院。\n\n保密協議：\n(一) 雙方因執行本服務契約書事物而知悉、持有他方具有機密性質之商業資訊、必要資料、來往文件(以下統稱保密標的)等，應保守秘密，除法令另有規定外，不得對任何第三人，包括但不限於個人或任何公司或其他組織，以任何方式揭露或將該保密標的使用於受託業務外之任何目的。\n(二) 服務契約書雙方均應確保其受僱人、使用人、代理人、代表人亦應遵守本項保密義務，而不得將保密標的提供或洩漏予任何第三人知悉或使用。\n(三) 依本服務契約所拍攝之廣告影片及平面廣告(包括平面廣宣物於未公開播出或刊登前，本公司對拍攝或錄製之內容負有保密義務，不得自行或使他人發表任何有關本合約廣告影片、平面廣告(包括平面廣宣物)及其產品內容之任何資訊及照片，或擅自接受任何以本系列廣告為主題之媒體採訪、宣傳造勢活動。`, event: `活動出席約定:\n1. KOL應於指定時間前30分鐘抵達現場準備。\n2. 若因不可抗力因素無法出席，應提前至少24小時通知。\n\n保密協議:\n雙方均應確保其所屬員工、代理人、代表人及其他相關人員就因履行本服務契約書而知悉或持有之他方任何資訊、資料，善盡保密責任，非經他方事前書面同意，不得對任何第三人洩漏。` }

// --- 主要表單元件 ---
export default function QuoteForm({ initialData }: QuoteFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')
  const queryClient = useQueryClient()
  const [clients, setClients] = useState<ClientWithContacts[]>([])
  const [kols, setKols] = useState<KolWithServices[]>([])
  const [quoteCategories, setQuoteCategories] = useState<QuoteCategory[]>([])
  const [loading, setLoading] = useState(true)

  // 聯絡人相關狀態
  const [clientContacts, setClientContacts] = useState<ContactInfo[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactInfo | null>(null)

  const {
    register, handleSubmit, control, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      project_name: initialData?.project_name || '',
      client_id: initialData?.client_id || null,
      client_name: null,
      client_tin: null,
      client_invoice_title: null,
      client_address: null,
      is_new_client: false,
      client_contact: initialData?.client_contact || null,
      contact_email: initialData?.contact_email || null,
      contact_phone: initialData?.contact_phone || null,
      is_new_contact: false,
      payment_method: initialData?.payment_method || '電匯',
      status: initialData?.status || '草稿',
      has_discount: initialData?.has_discount || false,
      discounted_price: initialData?.discounted_price || null,
      terms: initialData?.terms || staticTerms.standard,
      remarks: initialData?.remarks || '',
      items: transformInitialItems(initialData?.quotation_items),
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')
  const watchClientId = watch('client_id')
  const watchIsNewClient = watch('is_new_client')
  const watchIsNewContact = watch('is_new_contact')
  const watchHasDiscount = watch('has_discount')
  const [clientInfo, setClientInfo] = useState({ tin: '', invoiceTitle: '', address: '', email: '' })

  // --- Autocomplete Options (memoized) ---
  const clientOptions = useMemo(() =>
    clients.map(c => ({
      label: c.name,
      value: c.id,
      description: c.tin ? `統編: ${c.tin}` : undefined,
    })),
    [clients]
  )

  const contactOptions = useMemo(() =>
    clientContacts.map(c => ({
      label: c.name,
      value: c.name,
      description: [c.position, c.email, c.phone].filter(Boolean).join(' / ') || undefined,
    })),
    [clientContacts]
  )

  const kolOptions = useMemo(() =>
    kols.map(k => ({
      label: k.name,
      value: k.id,
      description: [k.real_name, `${k.kol_services.length} 個服務`].filter(Boolean).join(' - '),
    })),
    [kols]
  )

  const categoryOptions = useMemo(() =>
    quoteCategories.map(c => ({
      label: c.name,
      value: c.id,
    })),
    [quoteCategories]
  )

  // --- Data Loading (clients + categories only, KOLs are lazy-loaded) ---
  useEffect(() => {
    async function fetchData() {
      const [clientsRes, categoriesRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('quote_categories').select('*').order('name'),
      ])

      const processedClients = (clientsRes.data || []).map((client): ClientWithContacts => {
        let parsedContacts: ContactInfo[] = []
        try {
          if (client.contacts) {
            if (typeof client.contacts === 'string') {
              parsedContacts = JSON.parse(client.contacts)
            } else if (Array.isArray(client.contacts)) {
              parsedContacts = client.contacts as ContactInfo[]
            }
          }
        } catch (error) {
          console.error(`解析客戶 ${client.name} 的聯絡人資料失敗:`, error)
        }
        if (parsedContacts.length === 0 && client.contact_person) {
          parsedContacts.push({
            name: client.contact_person,
            email: client.email || undefined,
            phone: client.phone || undefined,
            is_primary: true,
          })
        }
        parsedContacts.sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return 0
        })
        return { ...client, parsedContacts }
      })

      setClients(processedClients)
      setQuoteCategories(categoriesRes.data || [])

      // 從專案進度管理頁面帶入的 projectId 預填資料
      if (projectId && !initialData) {
        const { data: project } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()
        if (project) {
          setValue('project_name', project.project_name || '')
          if (project.client_id) {
            setValue('client_id', project.client_id)
            setValue('is_new_client', false)
          } else if (project.client_name) {
            setValue('client_name', project.client_name)
            setValue('is_new_client', true)
          }
        }
      }

      setLoading(false)

      // 如果是編輯模式，載入已使用的 KOL 資料
      if (initialData?.quotation_items) {
        const kolIds = Array.from(new Set(initialData.quotation_items.map(i => i.kol_id).filter(Boolean)))
        if (kolIds.length > 0) {
          const { data } = await supabase
            .from('kols')
            .select('*, kol_services(*, service_types(*))')
            .in('id', kolIds)
          if (data) setKols(data as KolWithServices[])
        }
      }
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- KOL 延遲搜尋 (debounced) ---
  const kolSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchKols = useCallback((term: string) => {
    if (kolSearchTimer.current) clearTimeout(kolSearchTimer.current)
    if (!term.trim()) return

    kolSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('kols')
        .select('*, kol_services(*, service_types(*))')
        .ilike('name', `%${term.trim()}%`)
        .limit(20)
      if (data) {
        setKols(prev => {
          const existingIds = new Set(prev.map(k => k.id))
          const newKols = (data as KolWithServices[]).filter(k => !existingIds.has(k.id))
          return newKols.length > 0 ? [...prev, ...newKols] : prev
        })
      }
    }, 300)
  }, [])

  // --- 既有客戶選擇後帶入資料 ---
  useEffect(() => {
    // 新客戶模式時不干涉
    if (watchIsNewClient) return

    const selectedClient = clients.find(c => c.id === watchClientId)
    if (selectedClient) {
      setClientInfo({
        tin: selectedClient.tin || '',
        invoiceTitle: selectedClient.invoice_title || '',
        address: selectedClient.address || '',
        email: selectedClient.email || '',
      })

      const contacts = selectedClient.parsedContacts || []
      setClientContacts(contacts)

      if (contacts.length > 0) {
        let contactToSelect: ContactInfo | undefined
        if (initialData?.client_contact) {
          contactToSelect = contacts.find(c => c.name === initialData.client_contact)
        }
        if (!contactToSelect) {
          contactToSelect = contacts.find(c => c.is_primary) || contacts[0]
        }
        if (contactToSelect) {
          setSelectedContact(contactToSelect)
          setValue('client_contact', contactToSelect.name)
          setValue('contact_email', contactToSelect.email || null)
          setValue('contact_phone', contactToSelect.phone || null)
          setValue('is_new_contact', false)
          if (contactToSelect.email) {
            setClientInfo(prev => ({ ...prev, email: contactToSelect.email || '' }))
          }
        }
      } else {
        setClientContacts([])
        setSelectedContact(null)
        setValue('client_contact', '')
        setValue('contact_email', null)
        setValue('contact_phone', null)
      }
    } else if (!watchClientId) {
      setClientInfo({ tin: '', invoiceTitle: '', address: '', email: '' })
      setClientContacts([])
      setSelectedContact(null)
      // 不清空 client_contact 等欄位，因為可能正在輸入新客戶資料
    }
  }, [watchClientId, watchIsNewClient, clients, setValue, initialData])

  // --- Handler Functions ---
  const handleContactSelect = (contactName: string) => {
    const contact = clientContacts.find(c => c.name === contactName)
    if (contact) {
      setSelectedContact(contact)
      setValue('client_contact', contact.name)
      setValue('contact_email', contact.email || null)
      setValue('contact_phone', contact.phone || null)
      setValue('is_new_contact', false)
      const clientEmail = clients.find(c => c.id === watchClientId)?.email || ''
      setClientInfo(prev => ({ ...prev, email: contact.email || clientEmail }))
    }
  }

  const handleKolChange = (itemIndex: number, kolId: string) => {
    setValue(`items.${itemIndex}.kol_id`, kolId || null)
    setValue(`items.${itemIndex}.kol_name`, null)
    setValue(`items.${itemIndex}.is_new_kol`, false)
    setValue(`items.${itemIndex}.service`, '')
    setValue(`items.${itemIndex}.is_new_service`, false)
    setValue(`items.${itemIndex}.price`, 0)
    setValue(`items.${itemIndex}.cost`, 0)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAttachment = (attachments: any): boolean => attachments && Array.isArray(attachments) && attachments.length > 0
  const handleStatusChange = (newStatus: QuotationStatus) => {
    if (newStatus === '已簽約' && !hasAttachment(initialData?.attachments)) {
      alert('請上傳雙方用印的委刊報價單')
      return
    }
    setValue('status', newStatus)
  }
  const getKolServices = (kolId: string | null | undefined) => {
    if (!kolId) return []
    const kol = kols.find(k => k.id === kolId)
    return kol?.kol_services || []
  }

  const subTotalUntaxed = watchItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  const tax = Math.round(subTotalUntaxed * 0.05)
  const grandTotalTaxed = subTotalUntaxed + tax

  // --- Submit Handler (with auto-creation) ---
  const onSubmit: SubmitHandler<QuoteFormData> = async (data) => {
    try {
      // === Phase A: 自動建立新資料 ===
      let finalClientId = data.client_id

      // A1: 建立新客戶
      if (data.is_new_client && data.client_name?.trim()) {
        const newClientData: Record<string, unknown> = {
          name: data.client_name.trim(),
          tin: data.client_tin?.trim() || null,
          invoice_title: data.client_invoice_title?.trim() || null,
          address: data.client_address?.trim() || null,
        }

        // 聯絡人
        if (data.client_contact?.trim()) {
          const newContact: ContactInfo = {
            name: data.client_contact.trim(),
            email: data.contact_email?.trim() || undefined,
            phone: data.contact_phone?.trim() || undefined,
            is_primary: true,
          }
          newClientData.contacts = [newContact]
          // Legacy fields
          newClientData.contact_person = newContact.name
          newClientData.email = newContact.email || null
          newClientData.phone = newContact.phone || null
        }

        const { data: newClient, error } = await supabase
          .from('clients')
          .insert(newClientData)
          .select()
          .single()
        if (error) throw new Error(`建立客戶失敗: ${error.message}`)
        finalClientId = newClient.id
        toast.success(`已自動建立客戶「${data.client_name.trim()}」`)
      }
      // A2: 既有客戶新增聯絡人
      else if (finalClientId && data.is_new_contact && data.client_contact?.trim()) {
        const existingClient = clients.find(c => c.id === finalClientId)
        const existingContacts = existingClient?.parsedContacts || []
        const newContact: ContactInfo = {
          name: data.client_contact.trim(),
          email: data.contact_email?.trim() || undefined,
          phone: data.contact_phone?.trim() || undefined,
          is_primary: existingContacts.length === 0,
        }
        const updatedContacts = [...existingContacts, newContact]
        const { error } = await supabase
          .from('clients')
          .update({ contacts: updatedContacts as unknown as Database['public']['Tables']['clients']['Update']['contacts'] })
          .eq('id', finalClientId)
        if (error) throw new Error(`新增聯絡人失敗: ${error.message}`)
        toast.success(`已新增聯絡人「${newContact.name}」到客戶`)
      }

      // A3: 建立新 KOL
      const newKolMap = new Map<string, string>() // name -> new ID
      for (const item of data.items) {
        if (item.is_new_kol && item.kol_name?.trim() && !newKolMap.has(item.kol_name.trim())) {
          const { data: newKol, error } = await supabase
            .from('kols')
            .insert({ name: item.kol_name.trim() })
            .select()
            .single()
          if (error) throw new Error(`建立 KOL「${item.kol_name}」失敗: ${error.message}`)
          newKolMap.set(item.kol_name.trim(), newKol.id)
          toast.success(`已自動建立 KOL「${item.kol_name.trim()}」`)
        }
      }

      // A4: 建立新服務類型與 KOL 服務關聯
      for (const item of data.items) {
        if (item.is_new_service && item.service?.trim()) {
          const kolId = item.kol_id || (item.kol_name?.trim() ? newKolMap.get(item.kol_name.trim()) : null)
          if (kolId) {
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
              if (error) throw new Error(`建立服務類型「${item.service}」失敗: ${error.message}`)
              serviceTypeId = newST.id
            }

            // 查詢是否已有 kol_service 關聯
            const { data: existingLink } = await supabase
              .from('kol_services')
              .select('id')
              .eq('kol_id', kolId)
              .eq('service_type_id', serviceTypeId)
              .maybeSingle()

            if (!existingLink) {
              await supabase.from('kol_services').insert({
                kol_id: kolId,
                service_type_id: serviceTypeId,
                price: Number(item.price) || 0,
                cost: Number(item.cost) || 0,
              })
              toast.success(`已自動建立服務「${item.service.trim()}」`)
            }
          }
        }
      }

      // === Phase B: 解析最終資料 ===
      const resolvedItems = data.items.map(item => {
        let resolvedKolId = item.kol_id
        if (item.is_new_kol && item.kol_name?.trim()) {
          resolvedKolId = newKolMap.get(item.kol_name.trim()) || null
        }
        return { ...item, kol_id: resolvedKolId }
      })

      // === Phase C: 儲存報價單 ===
      const quoteDataToSave = {
        project_name: data.project_name,
        client_id: finalClientId || null,
        client_contact: data.client_contact || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        payment_method: data.payment_method,
        status: data.status || '草稿',
        subtotal_untaxed: subTotalUntaxed,
        tax: tax,
        grand_total_taxed: grandTotalTaxed,
        has_discount: data.has_discount,
        discounted_price: data.has_discount ? data.discounted_price : null,
        terms: data.terms || null,
        remarks: data.remarks || null,
        attachments: initialData?.attachments || null,
      }

      let quoteId = initialData?.id
      if (quoteId) {
        const { error } = await supabase.from('quotations').update(quoteDataToSave).eq('id', quoteId)
        if (error) throw error
      } else {
        const { data: newQuote, error } = await supabase.from('quotations').insert(quoteDataToSave).select().single()
        if (error || !newQuote) throw error || new Error("新增報價單失敗")
        quoteId = newQuote.id
      }

      await supabase.from('quotation_items').delete().eq('quotation_id', quoteId)
      const itemsToInsert = resolvedItems
        .filter(item => item.service || item.price)
        .map(item => ({
          quotation_id: quoteId,
          category: item.category || null,
          kol_id: item.kol_id || null,
          service: item.service || '',
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          cost: Number(item.cost) || 0,
          remark: item.remark || null,
        }))

      if (itemsToInsert.length > 0) {
        const { error } = await supabase.from('quotation_items').insert(itemsToInsert)
        if (error) throw error
      }

      toast.success('儲存成功！')

      // 狀態變更時自動同步
      if (quoteId) {
        const oldStatus = initialData?.status || null
        const newStatus = data.status || '草稿'
        if (oldStatus !== newStatus) {
          await handleQuotationAccountingSync(quoteId, newStatus, oldStatus)
          await handleKolPriceSync(quoteId, newStatus, oldStatus)
        }
      }

      // 如果是從專案進度建立的報價單，更新專案狀態
      if (projectId && quoteId && !initialData) {
        await supabase
          .from('projects')
          .update({ quotation_id: quoteId, status: '執行中' })
          .eq('id', projectId)
        queryClient.invalidateQueries({ queryKey: [...queryKeys.projects] })
      }

      // 跨頁快取失效：報價單變更影響列表頁和儀表板
      queryClient.invalidateQueries({ queryKey: [...queryKeys.quotations] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
      router.push('/dashboard/quotes')
    } catch (error: unknown) {
      console.error('Save failed:', error)
      toast.error('儲存失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <SkeletonCard lines={3} />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={4} />
    </div>
  )

  // --- 判斷客戶欄位是否可編輯 ---
  const isClientFieldsEditable = !!watchIsNewClient
  const isContactFieldsEditable = !!watchIsNewClient || !!watchIsNewContact

  return (
    <form onSubmit={handleSubmit(onSubmit, () => {
      setTimeout(() => {
        const firstError = document.querySelector('.text-destructive')
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    })} className="space-y-8">
      {/* --- 基本資訊 --- */}
      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
          <FileSignature className="mr-2 h-5 w-5 text-primary" />基本資訊
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 專案名稱 */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">專案名稱 *</label>
            <Input {...register('project_name')} placeholder="請輸入專案名稱" />
            {errors.project_name && <p className="text-destructive text-sm mt-1">{errors.project_name.message}</p>}
          </div>

          {/* 客戶 (Autocomplete) */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">客戶</label>
            <AutocompleteWithCreate
              selectedId={watchClientId ?? null}
              inputText={watch('client_name') || ''}
              options={clientOptions}
              placeholder="搜尋或輸入新客戶名稱"
              createLabel="新增客戶"
              onSelect={(id) => {
                setValue('client_id', id)
                setValue('client_name', null)
                setValue('is_new_client', false)
                setValue('client_tin', null)
                setValue('client_invoice_title', null)
                setValue('client_address', null)
              }}
              onCreateIntent={(name) => {
                setValue('client_id', null)
                setValue('client_name', name)
                setValue('is_new_client', true)
                // 清空既有客戶帶入的聯絡人
                setClientContacts([])
                setSelectedContact(null)
                setClientInfo({ tin: '', invoiceTitle: '', address: '', email: '' })
              }}
              onClear={() => {
                setValue('client_id', null)
                setValue('client_name', null)
                setValue('is_new_client', false)
                setValue('client_tin', null)
                setValue('client_invoice_title', null)
                setValue('client_address', null)
                setValue('client_contact', null)
                setValue('contact_email', null)
                setValue('contact_phone', null)
                setValue('is_new_contact', false)
                setClientContacts([])
                setSelectedContact(null)
                setClientInfo({ tin: '', invoiceTitle: '', address: '', email: '' })
              }}
            />
          </div>

          {/* 聯絡人 (Autocomplete) */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">聯絡人</label>
            <AutocompleteWithCreate
              selectedId={selectedContact?.name ?? null}
              inputText={watch('client_contact') || ''}
              options={contactOptions}
              placeholder={watchIsNewClient ? '輸入聯絡人姓名' : '搜尋或輸入新聯絡人'}
              createLabel="新增聯絡人"
              disabled={!watchClientId && !watchIsNewClient}
              allowCreate={true}
              onSelect={(contactName) => {
                handleContactSelect(contactName)
              }}
              onCreateIntent={(name) => {
                setValue('client_contact', name)
                setValue('contact_email', null)
                setValue('contact_phone', null)
                setValue('is_new_contact', true)
                setSelectedContact(null)
              }}
              onClear={() => {
                setValue('client_contact', null)
                setValue('contact_email', null)
                setValue('contact_phone', null)
                setValue('is_new_contact', false)
                setSelectedContact(null)
              }}
            />
          </div>

          {/* 電子郵件 */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">電子郵件</label>
            {isContactFieldsEditable ? (
              <Input {...register('contact_email')} placeholder="輸入電子郵件" />
            ) : (
              <Input value={clientInfo.email} readOnly className="bg-secondary/50" placeholder="選擇客戶後自動填入" />
            )}
          </div>

          {/* 統一編號 */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">統一編號</label>
            {isClientFieldsEditable ? (
              <Input {...register('client_tin')} placeholder="輸入統一編號" />
            ) : (
              <Input value={clientInfo.tin} readOnly className="bg-secondary/50" placeholder="選擇客戶後自動填入" />
            )}
          </div>

          {/* 發票抬頭 */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">發票抬頭</label>
            {isClientFieldsEditable ? (
              <Input {...register('client_invoice_title')} placeholder="輸入發票抬頭" />
            ) : (
              <Input value={clientInfo.invoiceTitle} readOnly className="bg-secondary/50" placeholder="選擇客戶後自動填入" />
            )}
          </div>

          {/* 聯絡人詳細資訊 */}
          {selectedContact && !isContactFieldsEditable && (
            <div className="md:col-span-2 p-3 bg-secondary rounded-md text-sm text-foreground/70 space-y-1">
              <p><strong>職稱:</strong> {selectedContact.position || 'N/A'}</p>
              <p><strong>電話:</strong> {selectedContact.phone || 'N/A'}</p>
            </div>
          )}

          {/* 新聯絡人電話 */}
          {isContactFieldsEditable && (
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">聯絡人電話</label>
              <Input {...register('contact_phone')} placeholder="輸入聯絡人電話" />
            </div>
          )}

          {/* 狀態 */}
          <div>
            <label htmlFor="status-select" className="block text-sm font-medium text-foreground/70 mb-1">狀態</label>
            <Controller control={control} name="status" render={({ field: { value } }) => (
              <div className="space-y-2">
                <select
                  id="status-select"
                  value={value || '草稿'}
                  onChange={(e) => handleStatusChange(e.target.value as QuotationStatus)}
                  className="form-input w-full"
                >
                  <option value="草稿">草稿</option>
                  <option value="待簽約">待簽約</option>
                  <option value="已簽約">已簽約</option>
                  <option value="已歸檔">已歸檔</option>
                </select>
                {!hasAttachment(initialData?.attachments) && value !== '草稿' && (
                  <p className="text-xs text-warning flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    需上傳雙方用印的委刊報價單才能設為「已簽約」
                  </p>
                )}
              </div>
            )} />
          </div>

          {/* 地址 */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">地址</label>
            {isClientFieldsEditable ? (
              <Input {...register('client_address')} placeholder="輸入地址" />
            ) : (
              <Input value={clientInfo.address} readOnly className="bg-secondary/50" placeholder="選擇客戶後自動填入" />
            )}
          </div>
        </div>

        {/* 付款方式 */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-foreground/70 mb-2">付款方式</label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input type="radio" {...register('payment_method')} value="電匯" className="form-radio" />
              <span className="ml-2 text-sm">電匯</span>
            </label>
            <label className="flex items-center">
              <input type="radio" {...register('payment_method')} value="ATM轉帳" className="form-radio" />
              <span className="ml-2 text-sm">ATM轉帳</span>
            </label>
          </div>
        </div>
      </div>

      {/* --- 報價項目表格 --- */}
      <div className="bg-card p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center">
            <Calculator className="mr-2 h-5 w-5 text-primary" />報價項目
          </h2>
          <Button type="button" onClick={() => append({
            category: null, kol_id: null, kol_name: null, is_new_kol: false,
            service: '', is_new_service: false, quantity: 1, price: 0, cost: 0, remark: null,
          })}>
            <PlusCircle className="mr-2 h-4 w-4" /> 新增項目
          </Button>
        </div>
        {errors.items && <p className="text-destructive text-sm mb-2">{errors.items.message}</p>}
        <div className="overflow-x-auto">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-secondary">
                <th className="p-2 w-[160px] text-left font-medium text-muted-foreground">類別</th>
                <th className="p-2 w-[200px] text-left font-medium text-muted-foreground">KOL/服務</th>
                <th className="p-2 w-[220px] text-left font-medium text-muted-foreground">執行內容</th>
                <th className="p-2 w-[100px] text-left font-medium text-muted-foreground">單價</th>
                <th className="p-2 w-[100px] text-left font-medium text-muted-foreground">成本</th>
                <th className="p-2 w-[70px] text-left font-medium text-muted-foreground">數量</th>
                <th className="p-2 w-[110px] text-left font-medium text-muted-foreground">合計</th>
                <th className="p-2 w-[50px] text-center font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const itemPrice = watchItems[index]?.price || 0
                const itemQuantity = watchItems[index]?.quantity || 1
                const itemTotal = itemPrice * itemQuantity
                const currentKolId = watchItems[index]?.kol_id
                const currentKolServices = getKolServices(currentKolId)

                // Service options for current KOL
                const serviceOptions = currentKolServices.map(s => ({
                  label: s.service_types.name,
                  value: s.service_types.name,
                  description: `報價 ${s.price.toLocaleString()} / 成本 ${s.cost.toLocaleString()}`,
                  data: { price: s.price, cost: s.cost },
                }))

                return (
                  <tr key={field.id} className="align-top border-b table-row-min-height">
                    {/* 類別 */}
                    <td className="p-3 align-top">
                      <AutocompleteWithCreate
                        selectedId={null}
                        inputText={watchItems[index]?.category || ''}
                        options={categoryOptions}
                        placeholder="類別"
                        createLabel="新增類別"
                        allowCreate={true}
                        onSelect={(_id, _data) => {
                          const cat = quoteCategories.find(c => c.id === _id)
                          setValue(`items.${index}.category`, cat?.name || '')
                        }}
                        onCreateIntent={(text) => {
                          setValue(`items.${index}.category`, text)
                        }}
                        onClear={() => {
                          setValue(`items.${index}.category`, null)
                        }}
                      />
                    </td>

                    {/* KOL/服務 */}
                    <td className="p-3 align-top">
                      <AutocompleteWithCreate
                        selectedId={currentKolId ?? null}
                        inputText={watchItems[index]?.kol_name || ''}
                        options={kolOptions}
                        placeholder="搜尋 KOL/服務"
                        createLabel="新增 KOL/服務"
                        onSearch={searchKols}
                        onSelect={(kolId) => {
                          handleKolChange(index, kolId)
                        }}
                        onCreateIntent={(name) => {
                          setValue(`items.${index}.kol_id`, null)
                          setValue(`items.${index}.kol_name`, name)
                          setValue(`items.${index}.is_new_kol`, true)
                          setValue(`items.${index}.service`, '')
                          setValue(`items.${index}.is_new_service`, false)
                          setValue(`items.${index}.price`, 0)
                          setValue(`items.${index}.cost`, 0)
                        }}
                        onClear={() => {
                          setValue(`items.${index}.kol_id`, null)
                          setValue(`items.${index}.kol_name`, null)
                          setValue(`items.${index}.is_new_kol`, false)
                          setValue(`items.${index}.service`, '')
                          setValue(`items.${index}.is_new_service`, false)
                          setValue(`items.${index}.price`, 0)
                          setValue(`items.${index}.cost`, 0)
                        }}
                      />
                    </td>

                    {/* 服務 */}
                    <td className="p-3 align-top">
                      <AutocompleteWithCreate<{ price: number; cost: number }>
                        selectedId={null}
                        inputText={watchItems[index]?.service || ''}
                        options={serviceOptions}
                        placeholder={currentKolId ? '搜尋或輸入執行內容' : (watchItems[index]?.is_new_kol ? '輸入執行內容' : '請先選 KOL/服務')}
                        createLabel="新增服務"
                        disabled={!currentKolId && !watchItems[index]?.is_new_kol}
                        onSelect={(serviceName, data) => {
                          setValue(`items.${index}.service`, serviceName)
                          setValue(`items.${index}.is_new_service`, false)
                          if (data) {
                            setValue(`items.${index}.price`, data.price)
                            setValue(`items.${index}.cost`, data.cost)
                          }
                        }}
                        onCreateIntent={(serviceName) => {
                          setValue(`items.${index}.service`, serviceName)
                          setValue(`items.${index}.is_new_service`, true)
                        }}
                        onClear={() => {
                          setValue(`items.${index}.service`, '')
                          setValue(`items.${index}.is_new_service`, false)
                        }}
                      />
                      {errors.items?.[index]?.service && (
                        <p className="text-destructive text-xs mt-1">{errors.items[index]?.service?.message}</p>
                      )}
                    </td>

                    {/* 單價 */}
                    <td className="p-3 align-top">
                      <Input type="number" {...register(`items.${index}.price`, { valueAsNumber: true })} placeholder="價格" />
                      {errors.items?.[index]?.price && <p className="text-destructive text-xs mt-1">{errors.items[index]?.price?.message}</p>}
                    </td>

                    {/* 成本 */}
                    <td className="p-3 align-top">
                      <Input type="number" {...register(`items.${index}.cost`, { valueAsNumber: true })} placeholder="成本" />
                    </td>

                    {/* 數量 */}
                    <td className="p-3 align-top">
                      <Input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} defaultValue={1} />
                      {errors.items?.[index]?.quantity && <p className="text-destructive text-xs mt-1">{errors.items[index]?.quantity?.message}</p>}
                    </td>

                    {/* 合計 */}
                    <td className="p-3 align-top">
                      <div className="text-sm font-semibold text-foreground/70 py-2">NT$ {itemTotal.toLocaleString()}</div>
                    </td>

                    {/* 操作 */}
                    <td className="p-3 text-center align-top">
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* --- 金額計算 --- */}
      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
          <Calculator className="mr-2 h-5 w-5 text-primary" />金額計算
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm"><span>小計（未稅）:</span><span>NT$ {subTotalUntaxed.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span>稅金 (5%):</span><span>NT$ {tax.toLocaleString()}</span></div>
          <div className="flex justify-between font-semibold text-lg border-t pt-2"><span>合計（含稅）:</span><span>NT$ {grandTotalTaxed.toLocaleString()}</span></div>
          <div className="mt-4">
            <label className="flex items-center space-x-2">
              <input type="checkbox" {...register('has_discount')} className="form-checkbox" />
              <span className="text-sm font-medium">是否有未稅優惠價格</span>
            </label>
            {watchHasDiscount && (
              <div className="mt-2">
                <Input type="number" {...register('discounted_price', { valueAsNumber: true })} placeholder="優惠後價格" className="w-48" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- 合約條款與備註 --- */}
      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
          <Book className="mr-2 h-5 w-5 text-primary" />合約條款與備註
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">合約條款</label>
            <Textarea {...register('terms')} rows={10} placeholder="合約條款內容" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">備註</label>
            <Textarea {...register('remarks')} rows={3} placeholder="其他備註事項" />
          </div>
        </div>
      </div>

      {/* --- 按鈕 --- */}
      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '儲存中...' : (initialData ? '更新報價單' : '建立報價單')}
        </Button>
      </div>
    </form>
  )
}
