// src/components/quotes/QuoteForm.tsx - 修正版本
'use client'

import { useForm, useFieldArray, Controller, SubmitHandler } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PlusCircle, Trash2, FileSignature, Calculator, Book, Search, X } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'

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

// 🆕 定義聯絡人資訊的介面
interface ContactInfo {
  name: string
  email?: string
  phone?: string
  position?: string
  is_primary?: boolean
}

// ✅ 已修正：使用 interface 擴充 Client 型別，解決 ts(2430) 錯誤
interface ClientWithContacts extends Client {
  parsedContacts: ContactInfo[]
}

interface FormItem {
  id?: string
  quotation_id?: string | null
  category?: string | null
  kol_id?: string | null
  service: string
  quantity: number
  price: number
  cost?: number | null // 🆕 Added cost
  remark?: string | null
  created_at?: string | null
}

const quoteSchema = z.object({
  project_name: z.string().min(1, '專案名稱為必填項目'),
  client_id: z.string().nullable(),
  client_contact: z.string().nullable(),
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
    service: z.string().min(1, '執行內容為必填'),
    quantity: z.number().min(1, '數量必須大於0'),
    price: z.number().min(0, '價格不能為負數'),
    cost: z.number().nullable().optional(), // 🆕 Added cost validation
    remark: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
  })).min(1, "請至少新增一個報價項目"),
})

type QuoteFormData = z.infer<typeof quoteSchema>
interface QuoteFormProps {
  initialData?: Quotation & { quotation_items: QuotationItem[] }
}

// --- Portal Dropdown 與搜尋元件 (維持不變) ---
const PortalDropdown = ({ isOpen, children, triggerRef, className = '' }: { isOpen: boolean; children: React.ReactNode; triggerRef: React.RefObject<HTMLElement>; className?: string }) => { const [position, setPosition] = useState({ top: 0, left: 0, width: 0 }); useEffect(() => { if (isOpen && triggerRef.current) { const rect = triggerRef.current.getBoundingClientRect(); setPosition({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width }); } }, [isOpen, triggerRef]); if (!isOpen || typeof window === 'undefined') return null; return createPortal(<div className={`dropdown-fixed ${className}`} style={{ top: `${position.top + 4}px`, left: `${position.left}px`, minWidth: `${position.width}px`, }} onMouseDown={(e) => e.stopPropagation()}>{children}</div>, document.body); };
const CategorySearchInput = ({ value, onChange, isOpen, onOpen, placeholder, categories }: { value: string | null, onChange: (v: string) => void, isOpen: boolean, onOpen: () => void, placeholder: string, categories: QuoteCategory[] }) => { const [searchTerm, setSearchTerm] = useState(value || ''); const triggerRef = useRef<HTMLDivElement>(null); useEffect(() => { setSearchTerm(value || '') }, [value]); const filteredCategories = searchTerm.trim() ? categories.filter(cat => cat.name.toLowerCase().includes(searchTerm.toLowerCase())) : categories; const handleSelect = (name: string) => { onChange(name); setActiveDropdown(null); }; return (<div ref={triggerRef}><Input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); onChange(e.target.value); }} onFocus={onOpen} placeholder={placeholder} /><PortalDropdown isOpen={isOpen} triggerRef={triggerRef}>{filteredCategories.map(cat => (<div key={cat.id} onClick={() => handleSelect(cat.name)} className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100">{cat.name}</div>))}</PortalDropdown></div>); };
const KolSearchInput = ({ value, onChange, isOpen, onOpen, placeholder, kols }: { value: string | null, onChange: (v: string) => void, isOpen: boolean, onOpen: () => void, placeholder: string, kols: KolWithServices[] }) => { const [searchTerm, setSearchTerm] = useState(''); const triggerRef = useRef<HTMLDivElement>(null); useEffect(() => { const kol = kols.find(k => k.id === value); setSearchTerm(kol?.name || ''); }, [value, kols]); const filteredKols = searchTerm.trim() ? kols.filter(kol => kol.name.toLowerCase().includes(searchTerm.toLowerCase()) || (kol.real_name && kol.real_name.toLowerCase().includes(searchTerm.toLowerCase()))) : kols; const handleSelect = (kol: KolWithServices) => { onChange(kol.id); setActiveDropdown(null); }; const handleClear = () => { onChange(''); setSearchTerm(''); }; return (<div ref={triggerRef}><div className="relative"><Input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onFocus={onOpen} placeholder={placeholder} className="w-full pr-8" /><div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">{value && <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>}</div></div><PortalDropdown isOpen={isOpen} triggerRef={triggerRef} className="dropdown-wide dropdown-scrollable">{filteredKols.map((kol) => (<div key={kol.id} onClick={() => handleSelect(kol)} className="w-full px-4 py-3 text-left hover:bg-blue-50 cursor-pointer"><div className="flex flex-col"><span className="font-medium text-sm text-gray-900">{kol.name}</span><span className="text-xs text-blue-600 mt-1">{kol.kol_services.length} 個服務項目</span></div></div>))}</PortalDropdown></div>); };
const ServiceSearchInput = ({ value, onChange, isOpen, onOpen, placeholder, kolServices }: { value: string, onChange: (service: string, price?: number) => void, isOpen: boolean, onOpen: () => void, placeholder: string, kolServices: (KolService & { service_types: ServiceType })[] }) => { const [searchTerm, setSearchTerm] = useState(value || ''); const triggerRef = useRef<HTMLDivElement>(null); useEffect(() => { setSearchTerm(value || '') }, [value]); const filteredServices = searchTerm.trim() ? kolServices.filter(s => s.service_types.name.toLowerCase().includes(searchTerm.toLowerCase())) : kolServices; const handleSelect = (service: (KolService & { service_types: ServiceType })) => { onChange(service.service_types.name, service.price); setActiveDropdown(null); }; const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const term = e.target.value; setSearchTerm(term); onChange(term, undefined); }; return (<div ref={triggerRef}><Input type="text" value={searchTerm} onChange={handleInputChange} onFocus={onOpen} placeholder={placeholder} /><PortalDropdown isOpen={isOpen} triggerRef={triggerRef} className="dropdown-medium dropdown-scrollable">{filteredServices.length > 0 ? (filteredServices.map(service => (<div key={service.id} onClick={() => handleSelect(service)} className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100">{service.service_types.name}</div>))) : (<div className="px-3 py-2 text-sm text-gray-500">無相符服務，將使用手動輸入值</div>)}</PortalDropdown></div>); };
let activeDropdown: string | null = null;
const setActiveDropdown = (id: string | null) => { activeDropdown = id; document.dispatchEvent(new Event('activeDropdownChange')); };

// --- Helper Functions (維持不變) ---
const transformInitialItems = (items?: QuotationItem[]): FormItem[] => { if (!items || items.length === 0) { return [{ category: null, kol_id: null, service: '', quantity: 1, price: 0, cost: 0, remark: null }] } return items.map((item): FormItem => ({ id: item.id, quotation_id: item.quotation_id, category: item.category, kol_id: item.kol_id, service: item.service, quantity: item.quantity || 1, price: item.price, cost: item.cost, remark: item.remark, created_at: item.created_at, })) }
const staticTerms = { standard: `合約約定：\n1、專案執行日期屆滿，另訂新約。\n2、本報價之範圍僅限以繁體中文及臺灣地區。如委刊客戶有其他需求，本公司需另行計價。\n3、為避免造成作業安排之困擾，執行日期簽定後，除非取得本公司書面同意延後，否則即按簽定之執行日期或條件開始計費。\n4、於本服務契約之專案購買項目與範圍內，本公司接受委刊客戶之書面指示進行，如委刊客戶有超出項目外之請求，雙方應另行書面協議之。\n5、專案經啟動後，除另有約定或經本公司書面同意之特殊理由，否則不得中途任意終止本契約書執行內容與範圍之全部或一部。如有雙方合意終止本專案之情形，本公司之服務費用依已發生之費用另行計算。如委刊客戶違反本項規定，本公司已收受之費用將不予退還，並另得向委刊客戶請求剩餘之未付費用作為違約金。\n6、委刊客戶委託之專案目標、任務及所提供刊登之素材皆不得有內容不實，或侵害他人著作權、商標權或其他權利及違反中華民國法律之情形，如有任何第三人主張委託公司之專案目標與任務有侵害其權利、違法或有其他交易糾紛之情形，本公司得於通知委託客戶後停止本專案之執行並單方終止本合約，本公司已收受之費用將不予退還；如更致本公司遭行政裁罰、刑事訴追或民事請求時，委託公司應出面處理相關爭議，並賠償本公司一切所受損害及支出費用。\n7、專案內之活動舉辦，不包含活動贈品購買及寄送，如有另外舉辦活動之贈品由委刊客戶提供。\n8、如委刊客戶於本約期間屆滿前15天以書面通知續約時，經本公司確認受理後，除有情事變更外，委刊客戶有權以相同價格與相同約定期間延展本約。\n9、如係可歸責本公司情形致無法於執行期間完成專案項目時，得與委刊客戶協議後延展服務期間完成，不另收取費用。\n10、委刊客戶之法定代理人應同意作為本服務契約連帶保證人。\n11、本約未盡事宜，悉依中華民國法律為準據法，雙方同意如因本約所發生之爭訟，以台北地方法院為一審管轄法院。\n\n保密協議：\n(一) 雙方因執行本服務契約書事物而知悉、持有他方具有機密性質之商業資訊、必要資料、來往文件(以下統稱保密標的)等，應保守秘密，除法令另有規定外，不得對任何第三人，包括但不限於個人或任何公司或其他組織，以任何方式揭露或將該保密標的使用於受託業務外之任何目的。\n(二) 服務契約書雙方均應確保其受僱人、使用人、代理人、代表人亦應遵守本項保密義務，而不得將保密標的提供或洩漏予任何第三人知悉或使用。\n(三) 依本服務契約所拍攝之廣告影片及平面廣告(包括平面廣宣物於未公開播出或刊登前，本公司對拍攝或錄製之內容負有保密義務，不得自行或使他人發表任何有關本合約廣告影片、平面廣告(包括平面廣宣物)及其產品內容之任何資訊及照片，或擅自接受任何以本系列廣告為主題之媒體採訪、宣傳造勢活動。`, event: `活動出席約定:\n1. KOL應於指定時間前30分鐘抵達現場準備。\n2. 若因不可抗力因素無法出席，應提前至少24小時通知。\n\n保密協議:\n雙方均應確保其所屬員工、代理人、代表人及其他相關人員就因履行本服務契約書而知悉或持有之他方任何資訊、資料，善盡保密責任，非經他方事前書面同意，不得對任何第三人洩漏。` };

// --- 主要表單元件 ---
export default function QuoteForm({ initialData }: QuoteFormProps) {
  const router = useRouter()
  const [clients, setClients] = useState<ClientWithContacts[]>([])
  const [kols, setKols] = useState<KolWithServices[]>([])
  const [quoteCategories, setQuoteCategories] = useState<QuoteCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [, forceUpdate] = useState({})
  const formRef = useRef<HTMLFormElement>(null)

  // 🆕 新增聯絡人相關狀態
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
      client_contact: initialData?.client_contact || null,
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
  const watchHasDiscount = watch('has_discount')
  const [clientInfo, setClientInfo] = useState({ tin: '', invoiceTitle: '', address: '', email: '' })

  useEffect(() => {
    const handleDropdownChange = () => forceUpdate({})
    document.addEventListener('activeDropdownChange', handleDropdownChange)
    const handleClickOutside = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.relative > .relative, .dropdown-fixed')) { setActiveDropdown(null) } }
    document.addEventListener('mousedown', handleClickOutside)
    return () => { document.removeEventListener('activeDropdownChange', handleDropdownChange); document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  // 資料載入與處理邏輯
  useEffect(() => {
    async function fetchData() {
      const [clientsRes, kolsRes, categoriesRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
        supabase.from('quote_categories').select('*').order('name'),
      ])

      // 🆕 處理客戶聯絡人資料
      const processedClients = (clientsRes.data || []).map((client): ClientWithContacts => {
        let parsedContacts: ContactInfo[] = []

        try {
          if (client.contacts) {
            if (typeof client.contacts === 'string') {
              parsedContacts = JSON.parse(client.contacts)
            } else if (Array.isArray(client.contacts)) {
              // The type from Supabase can be `any`. We assume it's `ContactInfo[]` here.
              parsedContacts = client.contacts as ContactInfo[]
            }
          }
        } catch (error) {
          console.error(`解析客戶 ${client.name} 的聯絡人資料失敗:`, error)
          parsedContacts = []
        }

        // 兼容舊資料：如果沒有 contacts，但有 contact_person
        if (parsedContacts.length === 0 && client.contact_person) {
          parsedContacts.push({
            name: client.contact_person,
            email: client.email || undefined,
            phone: client.phone || undefined,
            is_primary: true,
          })
        }

        // 排序：主要聯絡人在前
        parsedContacts.sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return 0
        })

        return { ...client, parsedContacts }
      })

      setClients(processedClients)
      setKols((kolsRes.data as KolWithServices[]) || [])
      setQuoteCategories(categoriesRes.data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // 客戶選擇處理邏輯
  useEffect(() => {
    const selectedClient = clients.find(c => c.id === watchClientId)
    if (selectedClient) {
      setClientInfo({
        tin: selectedClient.tin || '',
        invoiceTitle: selectedClient.invoice_title || '',
        address: selectedClient.address || '',
        email: selectedClient.email || '' // 預設 email
      })

      const contacts = selectedClient.parsedContacts || []
      setClientContacts(contacts)

      if (contacts.length > 0) {
        let contactToSelect: ContactInfo | undefined;
        // 編輯模式：嘗試匹配現有聯絡人
        if (initialData?.client_contact) {
          contactToSelect = contacts.find(c => c.name === initialData.client_contact);
        }
        // 如果沒有匹配到，或為新增模式，則選擇主要或第一個
        if (!contactToSelect) {
          contactToSelect = contacts.find(c => c.is_primary) || contacts[0];
        }

        if (contactToSelect) {
          setSelectedContact(contactToSelect)
          setValue('client_contact', contactToSelect.name)
          // 如果聯絡人有自己的 email，就用聯絡人的
          if (contactToSelect.email) {
            setClientInfo(prev => ({ ...prev, email: contactToSelect.email || '' }))
          }
        }
      } else {
        // 沒有聯絡人列表，則清空
        setClientContacts([])
        setSelectedContact(null)
        setValue('client_contact', '')
      }
    } else {
      // 沒有選擇客戶，全部清空
      setClientInfo({ tin: '', invoiceTitle: '', address: '', email: '' })
      setClientContacts([])
      setSelectedContact(null)
      setValue('client_contact', '')
    }
  }, [watchClientId, clients, setValue, initialData])


  // 🆕 新增聯絡人選擇處理函數
  const handleContactChange = (contactName: string) => {
    const contact = clientContacts.find(c => c.name === contactName)
    if (contact) {
      setSelectedContact(contact)
      setValue('client_contact', contact.name)
      // 更新 Email 顯示，優先使用聯絡人 Email，否則使用客戶預設 Email
      const clientEmail = clients.find(c => c.id === watchClientId)?.email || '';
      setClientInfo(prev => ({ ...prev, email: contact.email || clientEmail }))
    }
  }

  // --- 其他處理函數 (維持不變) ---
  const handleKolChange = (itemIndex: number, kolId: string) => { setValue(`items.${itemIndex}.kol_id`, kolId || null); setValue(`items.${itemIndex}.service`, ''); setValue(`items.${itemIndex}.price`, 0); setValue(`items.${itemIndex}.cost`, 0); };
  const hasAttachment = (attachments: any): boolean => attachments && Array.isArray(attachments) && attachments.length > 0;
  const handleStatusChange = (newStatus: QuotationStatus) => { if (newStatus === '已簽約' && !hasAttachment(initialData?.attachments)) { alert('請上傳雙方用印的委刊報價單'); return; } setValue('status', newStatus); };
  const getKolServices = (kolId: string | null | undefined) => { if (!kolId) return []; const kol = kols.find(k => k.id === kolId); return kol?.kol_services || []; };
  const subTotalUntaxed = watchItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  const tax = Math.round(subTotalUntaxed * 0.05);
  const grandTotalTaxed = subTotalUntaxed + tax;

  const onSubmit: SubmitHandler<QuoteFormData> = async (data) => {
    const quoteDataToSave = { project_name: data.project_name, client_id: data.client_id || null, client_contact: data.client_contact || null, payment_method: data.payment_method, status: data.status || '草稿', subtotal_untaxed: subTotalUntaxed, tax: tax, grand_total_taxed: grandTotalTaxed, has_discount: data.has_discount, discounted_price: data.has_discount ? data.discounted_price : null, terms: data.terms || null, remarks: data.remarks || null, attachments: initialData?.attachments || null, };
    try {
      let quoteId = initialData?.id;
      if (quoteId) {
        const { error } = await supabase.from('quotations').update(quoteDataToSave).eq('id', quoteId); if (error) throw error;
      } else { const { data: newQuote, error } = await supabase.from('quotations').insert(quoteDataToSave).select().single(); if (error || !newQuote) throw error || new Error("新增報價單失敗"); quoteId = newQuote.id; }
      await supabase.from('quotation_items').delete().eq('quotation_id', quoteId);
      const itemsToInsert = data.items.filter(item => item.service || item.price).map(item => ({ quotation_id: quoteId, category: item.category || null, kol_id: item.kol_id || null, service: item.service || '', quantity: Number(item.quantity) || 1, price: Number(item.price) || 0, cost: Number(item.cost) || 0, remark: item.remark || null }));
      if (itemsToInsert.length > 0) { const { error } = await supabase.from('quotation_items').insert(itemsToInsert); if (error) throw error; }
      toast.success('儲存成功！');
      router.push('/dashboard/quotes');
      router.refresh();
    } catch (error: any) {
      console.error('Save failed:', error);
      toast.error('儲存失敗: ' + error.message);
    }
  };

  if (loading) return <div>讀取資料中...</div>;

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><FileSignature className="mr-2 h-5 w-5 text-indigo-500" />基本資訊</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">專案名稱 *</label><Input {...register('project_name')} placeholder="請輸入專案名稱" />{errors.project_name && <p className="text-red-500 text-sm mt-1">{errors.project_name.message}</p>}</div>
          <div><label htmlFor="client-select" className="block text-sm font-medium text-gray-700 mb-1">選擇客戶</label><Controller control={control} name="client_id" render={({ field: { onChange, value } }) => (<select id="client-select" value={value || ''} onChange={onChange} className="form-input" aria-label="選擇客戶"><option value="">-- 選擇客戶 --</option>{clients.map(client => (<option key={client.id} value={client.id}>{client.name}</option>))}</select>)} /></div>

          {/* 聯絡人區塊 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label>
            {clientContacts.length > 0 ? (
              <select
                value={selectedContact?.name || ''}
                onChange={(e) => handleContactChange(e.target.value)}
                className="form-input"
                aria-label="選擇聯絡人"
              >
                {clientContacts.map((contact, index) => (
                  <option key={index} value={contact.name}>
                    {contact.name} {contact.is_primary ? '(主要)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <Input {...register('client_contact')} placeholder="選擇客戶後顯示或手動輸入" disabled={!!watchClientId && clientContacts.length === 0} />
            )}
          </div>

          <div><label className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label><Input value={clientInfo.email} readOnly className="bg-gray-100" placeholder="選擇客戶後自動填入" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">統一編號</label><Input value={clientInfo.tin} readOnly className="bg-gray-100" placeholder="選擇客戶後自動填入" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">發票抬頭</label><Input value={clientInfo.invoiceTitle} readOnly className="bg-gray-100" placeholder="選擇客戶後自動填入" /></div>

          {/* 顯示選中聯絡人的詳細資訊 */}
          {selectedContact && (
            <div className="md:col-span-2 p-3 bg-gray-50 rounded-md text-sm text-gray-700 space-y-1">
              <p><strong>職稱:</strong> {selectedContact.position || 'N/A'}</p>
              <p><strong>電話:</strong> {selectedContact.phone || 'N/A'}</p>
            </div>
          )}

          {/* 其他欄位維持不變 */}
          <div><label htmlFor="status-select" className="block text-sm font-medium text-gray-700 mb-1">狀態</label><Controller control={control} name="status" render={({ field: { value } }) => (<div className="space-y-2"><select id="status-select" value={value || '草稿'} onChange={(e) => handleStatusChange(e.target.value as QuotationStatus)} className="form-input w-full"><option value="草稿">草稿</option><option value="待簽約">待簽約</option><option value="已簽約">已簽約</option><option value="已歸檔">已歸檔</option></select>{!hasAttachment(initialData?.attachments) && value !== '草稿' && (<p className="text-xs text-amber-600 flex items-center"><svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>需上傳雙方用印的委刊報價單才能設為「已簽約」</p>)}</div>)} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">地址</label><Input value={clientInfo.address} readOnly className="bg-gray-100" placeholder="選擇客戶後自動填入" /></div>
        </div>
        <div className="mt-6"><label className="block text-sm font-medium text-gray-700 mb-2">付款方式</label><div className="flex space-x-4"><label className="flex items-center"><input type="radio" {...register('payment_method')} value="電匯" className="form-radio" /><span className="ml-2 text-sm">電匯</span></label><label className="flex items-center"><input type="radio" {...register('payment_method')} value="ATM轉帳" className="form-radio" /><span className="ml-2 text-sm">ATM轉帳</span></label></div></div>
      </div>

      {/* --- 報價項目表格 --- */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center"><Calculator className="mr-2 h-5 w-5 text-indigo-500" />報價項目</h2>
          <Button type="button" onClick={() => append({ category: null, kol_id: null, service: '', quantity: 1, price: 0, cost: 0, remark: null })}><PlusCircle className="mr-2 h-4 w-4" /> 新增項目</Button>
        </div>
        {errors.items && <p className="text-red-500 text-sm mb-2">{errors.items.message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 w-[120px] text-left font-medium text-gray-600">類別</th>
                <th className="p-2 w-[200px] text-left font-medium text-gray-600">名稱/項目</th>
                <th className="p-2 w-[220px] text-left font-medium text-gray-600">執行內容</th>
                <th className="p-2 w-[120px] text-left font-medium text-gray-600">單價</th>
                <th className="p-2 w-[120px] text-left font-medium text-gray-600">成本</th>
                <th className="p-2 w-[80px] text-left font-medium text-gray-600">數量</th>
                <th className="p-2 w-[120px] text-left font-medium text-gray-600">合計</th>
                <th className="p-2 w-[80px] text-center font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const categoryId = `category-${index}`; const kolId = `kol-${index}`; const serviceId = `service-${index}`;
                // 🆕 計算每列的合計
                const itemPrice = watchItems[index]?.price || 0; const itemQuantity = watchItems[index]?.quantity || 1; const itemTotal = itemPrice * itemQuantity;
                return (
                  <tr key={field.id} className="align-top border-b table-row-min-height">
                    <td className="p-3 align-top" onMouseDown={e => e.stopPropagation()}>
                      <CategorySearchInput value={watchItems[index]?.category || ''} onChange={(value) => setValue(`items.${index}.category`, value)} categories={quoteCategories} isOpen={activeDropdown === categoryId} onOpen={() => setActiveDropdown(categoryId)} placeholder="類別" />
                    </td>
                    <td className="p-3 align-top" onMouseDown={e => e.stopPropagation()}>
                      {/* ✅ 已確認修正：使用 `?? null` 解決 ts(2322) 型別錯誤，確保傳遞給 value 的值不為 undefined */}
                      <KolSearchInput value={watchItems[index]?.kol_id ?? null} onChange={(kolId) => handleKolChange(index, kolId)} isOpen={activeDropdown === kolId} onOpen={() => setActiveDropdown(kolId)} placeholder="搜尋 KOL" kols={kols} />
                    </td>
                    <td className="p-3 align-top" onMouseDown={e => e.stopPropagation()}>
                      <ServiceSearchInput value={watchItems[index]?.service} onChange={(service, price) => { setValue(`items.${index}.service`, service); if (price !== undefined) setValue(`items.${index}.price`, price); }} isOpen={activeDropdown === serviceId} onOpen={() => setActiveDropdown(serviceId)} placeholder="搜尋或輸入服務" kolServices={getKolServices(watchItems[index]?.kol_id)} />
                      {errors.items?.[index]?.service && <p className="text-red-500 text-xs mt-1">{errors.items[index]?.service?.message}</p>}
                    </td>
                    <td className="p-3 align-top"><Input type="number" {...register(`items.${index}.price`, { valueAsNumber: true })} placeholder="價格" />{errors.items?.[index]?.price && <p className="text-red-500 text-xs mt-1">{errors.items[index]?.price?.message}</p>}</td>
                    <td className="p-3 align-top"><Input type="number" {...register(`items.${index}.cost`, { valueAsNumber: true })} placeholder="成本" /></td>
                    <td className="p-3 align-top"><Input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} defaultValue={1} />{errors.items?.[index]?.quantity && <p className="text-red-500 text-xs mt-1">{errors.items[index]?.quantity?.message}</p>}</td>
                    <td className="p-3 align-top"><div className="text-sm font-semibold text-gray-700 py-2">NT$ {itemTotal.toLocaleString()}</div></td>
                    <td className="p-3 text-center align-top"><Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- 金額計算 & 合約條款 (維持不變) --- */}
      <div className="bg-white p-6 rounded-lg shadow"><h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><Calculator className="mr-2 h-5 w-5 text-indigo-500" />金額計算</h2><div className="space-y-3"><div className="flex justify-between text-sm"><span>小計（未稅）:</span><span>NT$ {subTotalUntaxed.toLocaleString()}</span></div><div className="flex justify-between text-sm"><span>稅金 (5%):</span><span>NT$ {tax.toLocaleString()}</span></div><div className="flex justify-between font-semibold text-lg border-t pt-2"><span>合計（含稅）:</span><span>NT$ {grandTotalTaxed.toLocaleString()}</span></div><div className="mt-4"><label className="flex items-center space-x-2"><input type="checkbox" {...register('has_discount')} className="form-checkbox" /><span className="text-sm font-medium">是否有優惠價格</span></label>{watchHasDiscount && (<div className="mt-2"><Input type="number" {...register('discounted_price', { valueAsNumber: true })} placeholder="優惠後價格" className="w-48" /></div>)}</div></div></div>
      <div className="bg-white p-6 rounded-lg shadow"><h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><Book className="mr-2 h-5 w-5 text-indigo-500" />合約條款與備註</h2><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">合約條款</label><Textarea {...register('terms')} rows={10} placeholder="合約條款內容" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><Textarea {...register('remarks')} rows={3} placeholder="其他備註事項" /></div></div></div>

      {/* --- 按鈕 (維持不變) --- */}
      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '儲存中...' : (initialData ? '更新報價單' : '建立報價單')}</Button>
      </div>
    </form>
  )
}