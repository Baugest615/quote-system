'use client'

import { useForm, useFieldArray, Controller, SubmitHandler } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PlusCircle, Trash2, FileSignature, Calculator, Book, Search, X } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

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

// --- 表單項目型別 ---
interface FormItem {
  id?: string
  quotation_id?: string | null
  category?: string | null
  kol_id?: string | null
  service: string
  quantity: number
  price: number
  remark?: string | null
  created_at?: string | null
}

// --- Zod Validation Schema ---
const quoteSchema = z.object({
  project_name: z.string().min(1, '專案名稱為必填項目'),
  client_id: z.string().nullable(),
  client_contact: z.string().nullable(),
  payment_method: z.enum(['電匯', 'ATM轉帳']),
  status: z.enum(['草稿', '待簽約', '已簽約', '已歸檔']).optional(), // 🆕 新增
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
      remark: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
  })).min(1, "請至少新增一個報價項目"),
});

type QuoteFormData = z.infer<typeof quoteSchema>

// --- Component Props ---
interface QuoteFormProps {
  initialData?: Quotation & { quotation_items: QuotationItem[] }
}

// --- KOL 搜尋選擇器組件 ---
interface KolSearchInputProps {
  value: string
  onChange: (kolId: string) => void
  kols: KolWithServices[]
  placeholder?: string
}

function KolSearchInput({ value, onChange, kols, placeholder }: KolSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedKol, setSelectedKol] = useState<KolWithServices | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 當 value 變化時更新選中的 KOL
  useEffect(() => {
    const kol = kols.find(k => k.id === value)
    setSelectedKol(kol || null)
    if (kol) {
      setSearchTerm(kol.name)
    } else {
      setSearchTerm('')
    }
  }, [value, kols])

  // 優化過濾邏輯：當有搜尋條件時才過濾，無條件時返回空陣列
  const filteredKols = searchTerm.trim().length >= 1 
    ? kols.filter(kol =>
        kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (kol.real_name && kol.real_name.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : []

  // 處理輸入變化 - 確保即時搜尋
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value
    setSearchTerm(term)
    
    // 立即開啟下拉選單，即使是空字串也顯示提示
    setIsOpen(true)
    
    // 如果清空輸入，也清空選擇
    if (term.trim().length === 0) {
      setSelectedKol(null)
      onChange('')
    }
  }

  // 處理輸入框聚焦 - 立即顯示相關內容
  const handleInputFocus = () => {
    setIsOpen(true)
  }

  // 處理 KOL 選擇
  const handleKolSelect = (kol: KolWithServices) => {
    setSelectedKol(kol)
    setSearchTerm(kol.name)
    setIsOpen(false)
    onChange(kol.id)
  }

  // 清空選擇
  const handleClear = () => {
    setSelectedKol(null)
    setSearchTerm('')
    setIsOpen(false)
    onChange('')
    inputRef.current?.focus()
  }

  // 點擊外部關閉下拉選單
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative w-full min-w-[200px]">
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder || "輸入 KOL 名稱搜尋..."}
          className="w-full pr-8 min-w-[180px]"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
          {selectedKol && (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="清除選擇"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <Search className="h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* 搜尋下拉選單 - 使用超高 z-index 確保不被遮擋 */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[99999] bg-white border border-gray-300 rounded-md shadow-xl"
          style={{ 
            minWidth: '320px',
            boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            maxHeight: filteredKols.length > 8 ? '400px' : 'auto',
            overflowY: filteredKols.length > 8 ? 'auto' : 'visible',
            left: inputRef.current?.getBoundingClientRect().left || 0,
            top: (inputRef.current?.getBoundingClientRect().bottom || 0) + 4,
            width: Math.max(320, inputRef.current?.getBoundingClientRect().width || 320)
          }}
        >
          {searchTerm.trim().length === 0 ? (
            // 當沒有輸入時顯示提示
            <div className="p-4 text-sm text-gray-500 text-center">
              <div className="flex items-center justify-center mb-2">
                <Search className="h-4 w-4 mr-2" />
                <span>開始輸入即可搜尋 KOL</span>
              </div>
              <div className="text-xs text-gray-400">
                支援搜尋 KOL 名稱或真實姓名
              </div>
            </div>
          ) : filteredKols.length > 0 ? (
            // 有搜尋結果時顯示列表
            <div className="divide-y divide-gray-100">
              {filteredKols.map((kol, index) => (
                <button
                  key={kol.id}
                  type="button"
                  onClick={() => handleKolSelect(kol)}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-gray-900">{kol.name}</span>
                    {kol.real_name && (
                      <span className="text-xs text-gray-500 mt-0.5">{kol.real_name}</span>
                    )}
                    <span className="text-xs text-blue-600 mt-1">
                      {kol.kol_services.length} 個服務項目
                    </span>
                  </div>
                </button>
              ))}
              {filteredKols.length > 8 && (
                <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 text-center border-t border-gray-200">
                  共 {filteredKols.length} 個結果 • 可向上滾動查看更多
                </div>
              )}
            </div>
          ) : (
            // 沒有找到結果時顯示
            <div className="p-4 text-sm text-gray-500 text-center">
              找不到包含 "<span className="font-medium">{searchTerm}</span>" 的 KOL
              <div className="text-xs text-gray-400 mt-1">
                請嘗試其他關鍵字
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Helper function to transform initial data ---
const transformInitialItems = (items?: QuotationItem[]): FormItem[] => {
  if (!items || items.length === 0) {
    return [{ 
      category: null, 
      kol_id: null, 
      service: '', 
      quantity: 1, 
      price: 0, 
      remark: null 
    }]
  }
  
  return items.map((item): FormItem => ({
    id: item.id,
    quotation_id: item.quotation_id,
    category: item.category,
    kol_id: item.kol_id,
    service: item.service,
    quantity: item.quantity || 1,
    price: item.price,
    remark: item.remark,
    created_at: item.created_at,
  }))
}

const staticTerms = {
    standard: `合約約定：\n1、專案執行日期屆滿，另訂新約。\n2、本報價之範圍僅限以繁體中文及臺灣地區。如委刊客戶有其他需求，本公司需另行計價。\n3、為避免造成作業安排之困擾，執行日期簽定後，除非取得本公司書面同意延後，否則即按簽定之執行日期或條件開始計費。\n4、於本服務契約之專案購買項目與範圍內，本公司接受委刊客戶之書面指示進行，如委刊客戶有超出項目外之請求，雙方應另行書面協議之。\n5、專案經啟動後，除另有約定或經本公司書面同意之特殊理由，否則不得中途任意終止本契約書執行內容與範圍之全部或一部。如有雙方合意終止本專案之情形，本公司之服務費用依已發生之費用另行計算。如委刊客戶違反本項規定，本公司已收受之費用將不予退還，並另得向委刊客戶請求剩餘之未付費用作為違約金。\n6、委刊客戶委託之專案目標、任務及所提供刊登之素材皆不得有內容不實，或侵害他人著作權、商標權或其他權利及違反中華民國法律之情形，如有任何第三人主張委託公司之專案目標與任務有侵害其權利、違法或有其他交易糾紛之情形，本公司得於通知委託客戶後停止本專案之執行並單方終止本合約，本公司已收受之費用將不予退還；如更致本公司遭行政裁罰、刑事訴追或民事請求時，委託公司應出面處理相關爭議，並賠償本公司一切所受損害及支出費用。\n7、專案內之活動舉辦，不包含活動贈品購買及寄送，如有另外舉辦活動之贈品由委刊客戶提供。\n8、如委刊客戶於本約期間屆滿前15天以書面通知續約時，經本公司確認受理後，除有情事變更外，委刊客戶有權以相同價格與相同約定期間延展本約。\n9、如係可歸責本公司情形致無法於執行期間完成專案項目時，得與委刊客戶協議後延展服務期間完成，不另收取費用。\n10、委刊客戶之法定代理人應同意作為本服務契約連帶保證人。\n11、本約未盡事宜，悉依中華民國法律為準據法，雙方同意如因本約所發生之爭訟，以台北地方法院為一審管轄法院。\n\n保密協議：\n(一) 雙方因執行本服務契約書事物而知悉、持有他方具有機密性質之商業資訊、必要資料、來往文件(以下統稱保密標的)等，應保守秘密，除法令另有規定外，不得對任何第三人，包括但不限於個人或任何公司或其他組織，以任何方式揭露或將該保密標的使用於受託業務外之任何目的。\n(二) 服務契約書雙方均應確保其受僱人、使用人、代理人、代表人亦應遵守本項保密義務，而不得將保密標的提供或洩漏予任何第三人知悉或使用。\n(三) 依本服務契約所拍攝之廣告影片及平面廣告(包括平面廣宣物於未公開播出或刊登前，本公司對拍攝或錄製之內容負有保密義務，不得自行或使他人發表任何有關本合約廣告影片、平面廣告(包括平面廣宣物)及其產品內容之任何資訊及照片，或擅自接受任何以本系列廣告為主題之媒體採訪、宣傳造勢活動。`,
    event: `活動出席約定:\n1. KOL應於指定時間前30分鐘抵達現場準備。\n2. 若因不可抗力因素無法出席，應提前至少24小時通知。\n\n保密協議:\n雙方均應確保其所屬員工、代理人、代表人及其他相關人員就因履行本服務契約書而知悉或持有之他方任何資訊、資料，善盡保密責任，非經他方事前書面同意，不得對任何第三人洩漏。`
};

export default function QuoteForm({ initialData }: QuoteFormProps) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [kols, setKols] = useState<KolWithServices[]>([])
  const [quoteCategories, setQuoteCategories] = useState<QuoteCategory[]>([])
  const [loading, setLoading] = useState(true)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      project_name: initialData?.project_name || '',
      client_id: initialData?.client_id || null,
      client_contact: initialData?.client_contact || null,
      payment_method: initialData?.payment_method || '電匯',
      status: initialData?.status || '草稿', // 🆕 新增
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

  const [clientInfo, setClientInfo] = useState({ 
    tin: '', 
    invoiceTitle: '', 
    address: '',
    email: ''  // 🆕 新增 email 欄位
  });

  useEffect(() => {
    async function fetchData() {
      const [clientsRes, kolsRes, categoriesRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
        supabase.from('quote_categories').select('*').order('name'),
      ])
      setClients(clientsRes.data || [])
      setKols(kolsRes.data as KolWithServices[] || [])
      setQuoteCategories(categoriesRes.data || [])
      setLoading(false)
    }
    fetchData()
  }, [])
  
  useEffect(() => {
    const selectedClient = clients.find(c => c.id === watchClientId)
    if (selectedClient) {
      setValue('client_contact', selectedClient.contact_person)
      // 🆕 更新 setClientInfo，包含 email 欄位
      setClientInfo({
        tin: selectedClient.tin || '',
        invoiceTitle: selectedClient.invoice_title || '',
        address: selectedClient.address || '',
        email: selectedClient.email || ''  // 🆕 新增 email 設定
      });
    } else {
      setValue('client_contact', '')
      // 🆕 重置時也要清空 email
      setClientInfo({ 
        tin: '', 
        invoiceTitle: '', 
        address: '',
        email: ''  // 🆕 新增 email 重置
      });
    }
  }, [watchClientId, clients, setValue])

  // 【DEFINITIVE FIX】Using `itemIndex` instead of `index`.
  const handleKolChange = (itemIndex: number, kolId: string) => {
    setValue(`items.${itemIndex}.kol_id`, kolId || null);
    // 清空服務選擇和價格，讓用戶重新選擇
    setValue(`items.${itemIndex}.service`, '');
    setValue(`items.${itemIndex}.price`, 0);
  }

  // 🆕 新增檢查附件的函數
  const hasAttachment = (attachments: any): boolean => {
    return attachments && Array.isArray(attachments) && attachments.length > 0
  }

  // 🆕 修正後的狀態變更處理函數
  const handleStatusChange = (newStatus: QuotationStatus) => {
    // 如果要設為「已簽約」，檢查是否有附件
    if (newStatus === '已簽約') {
      const currentAttachments = initialData?.attachments
      if (!hasAttachment(currentAttachments)) {
          alert('請上傳雙方用印的委刊報價單')
          return // 阻止狀態變更
      }
    }
      // 如果檢查通過或不是「已簽約」，則正常變更狀態
      setValue('status', newStatus)
  }

  // 【DEFINITIVE FIX】Using `itemIndex` instead of `index`.
  const handleServiceChange = (itemIndex: number, serviceValue: string, kolId: string) => {
    setValue(`items.${itemIndex}.service`, serviceValue);
    
    // 找到對應的 KOL 和服務項目，更新價格
    const selectedKol = kols.find(k => k.id === kolId);
    if (selectedKol && serviceValue) {
      const selectedService = selectedKol.kol_services.find(s => s.service_types.name === serviceValue);
      if (selectedService) {
        setValue(`items.${itemIndex}.price`, selectedService.price);
      }
    }
  }

  // 新增：取得指定 KOL 的服務項目列表
  const getKolServices = (kolId: string) => {
    const kol = kols.find(k => k.id === kolId);
    return kol?.kol_services || [];
  }

  const subTotalUntaxed = watchItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  const tax = Math.round(subTotalUntaxed * 0.05)
  const grandTotalTaxed = subTotalUntaxed + tax

  // 明確指定 SubmitHandler 型別
  const onSubmit: SubmitHandler<QuoteFormData> = async (data) => {
    const quoteDataToSave = {
      project_name: data.project_name,
      client_id: data.client_id || null,
      client_contact: data.client_contact || null,
      payment_method: data.payment_method,
      status: data.status || '草稿', // 🆕 新增
      subtotal_untaxed: subTotalUntaxed,
      tax: tax,
      grand_total_taxed: grandTotalTaxed,
      has_discount: data.has_discount,
      discounted_price: data.has_discount ? data.discounted_price : null,
      terms: data.terms || null,
      remarks: data.remarks || null,
      attachments: initialData?.attachments || null,
    };

    try {
      let quoteId = initialData?.id;

      if (quoteId) {
        const { error: quoteError } = await supabase.from('quotations').update(quoteDataToSave).eq('id', quoteId)
        if (quoteError) throw quoteError
      } else {
        const { data: newQuote, error: quoteError } = await supabase.from('quotations').insert(quoteDataToSave).select().single()
        if (quoteError) throw quoteError
        if (!newQuote) throw new Error("新增報價單失敗")
        quoteId = newQuote.id;
      }

      if (!quoteId) throw new Error("無效的報價單 ID")

      const { error: deleteError } = await supabase.from('quotation_items').delete().eq('quotation_id', quoteId)
      if (deleteError) throw deleteError

      const itemsToInsert = data.items
        .filter(item => item.service || item.price)
        .map(item => ({
          quotation_id: quoteId,
          category: item.category || null,
          kol_id: item.kol_id || null,
          service: item.service || '',
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          remark: item.remark || null
        }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('quotation_items').insert(itemsToInsert)
        if (itemsError) throw itemsError
      }
      
      alert('報價單已儲存！')
      router.push('/dashboard/quotes')
      router.refresh();
    } catch (error: any) {
      console.error('Save failed:', error);
      alert('儲存失敗: ' + error.message)
    }
  }

  if (loading) return <div>讀取資料中...</div>

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <FileSignature className="mr-2 h-5 w-5 text-indigo-500" />基本資訊
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">專案名稱 *</label>
            <Input {...register('project_name')} placeholder="請輸入專案名稱" />
            {errors.project_name && <p className="text-red-500 text-sm mt-1">{errors.project_name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選擇客戶</label>
            <Controller
              control={control}
              name="client_id"
              render={({ field: { onChange, value } }) => (
                <select value={value || ''} onChange={onChange} className="form-input">
                  <option value="">-- 選擇客戶 --</option>
                  {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label>
            <Input {...register('client_contact')} placeholder="聯絡人姓名" />
          </div>
          <div>{/* 🆕 新增電子郵件欄位 */}
            <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label>
            <Input 
              value={clientInfo.email} 
              readOnly 
              className="bg-gray-100" 
              placeholder="選擇客戶後自動填入" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">統一編號</label>
            <Input value={clientInfo.tin} readOnly className="bg-gray-100" placeholder="選擇客戶後自動填入" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
            <Controller
              control={control}
              name="status"
              render={({ field: { value } }) => (
                <div className="space-y-2">
                  <select 
                    value={value || '草稿'} 
                    onChange={(e) => handleStatusChange(e.target.value as QuotationStatus)} // 🆕 型別斷言
                    className="form-input w-full"
                  >
                    <option value="草稿">草稿</option>
                    <option value="待簽約">待簽約</option>
                    <option value="已簽約">已簽約</option>
                    <option value="已歸檔">已歸檔</option>
                  </select>
                  {/* 🆕 附件提示 */}
                  {!hasAttachment(initialData?.attachments) && (
                    <p className="text-xs text-amber-600 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      需上傳雙方用印的委刊報價單才能設為「已簽約」
                    </p>
                  )}
                </div>
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">發票抬頭</label>
            <Input value={clientInfo.invoiceTitle} readOnly className="bg-gray-100" placeholder="選擇客戶後自動填入" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
            <Input value={clientInfo.address} readOnly className="bg-gray-100" placeholder="選擇客戶後自動填入" />
          </div>
        </div>
        <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">付款方式</label>
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
      
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center">
              <FileSignature className="mr-2 h-5 w-5 text-indigo-500" />報價項目
            </h2>
            <Button 
              type="button" 
              onClick={() => append({ 
                category: null, 
                kol_id: null, 
                service: '', 
                quantity: 1, 
                price: 0, 
                remark: null 
              })}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> 新增項目
            </Button>
        </div>
        {errors.items && <p className="text-red-500 text-sm mb-2">{errors.items.message}</p>}
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 w-[120px] text-left font-medium text-gray-600">類別</th>
                    <th className="p-2 w-[200px] text-left font-medium text-gray-600">KOL</th>
                    <th className="p-2 w-[220px] text-left font-medium text-gray-600">執行內容</th>
                    <th className="p-2 w-[80px] text-left font-medium text-gray-600">數量</th>
                    <th className="p-2 w-[120px] text-left font-medium text-gray-600">價格</th>
                    <th className="p-2 w-[150px] text-left font-medium text-gray-600">備註</th>
                    <th className="p-2 w-[80px] text-center font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                    {fields.map((field, index) => (
                        <tr key={field.id} className="align-top border-b" style={{ minHeight: '120px' }}>
                            <td className="p-3 align-top">
                              <select {...register(`items.${index}.category`)} className="form-input">
                                <option value="">-- 類別 --</option>
                                {quoteCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                            </td>
                            <td className="p-3 align-top" style={{ position: 'relative', zIndex: index === 0 ? 10 : 'auto' }}>
                              <KolSearchInput
                                value={watchItems[index]?.kol_id || ''}
                                onChange={(kolId) => handleKolChange(index, kolId)}
                                kols={kols}
                                placeholder="搜尋或選擇 KOL"
                              />
                            </td>
                            <td className="p-3 align-top">
                              {/* 修正後的執行內容欄位 - 根據選擇的KOL動態顯示服務項目 */}
                              <Controller
                                control={control}
                                name={`items.${index}.service`}
                                render={({ field: { onChange, value } }) => {
                                  const currentKolId = watchItems[index]?.kol_id;
                                  const kolServices = currentKolId ? getKolServices(currentKolId) : [];
                                  
                                  return (
                                    <>
                                      {currentKolId && kolServices.length > 0 ? (
                                        <select
                                          value={value || ''}
                                          onChange={(e) => {
                                            const serviceValue = e.target.value;
                                            onChange(serviceValue);
                                            handleServiceChange(index, serviceValue, currentKolId);
                                          }}
                                          className="form-input"
                                        >
                                          <option value="">-- 選擇服務項目 --</option>
                                          {kolServices.map(service => (
                                            <option key={service.id} value={service.service_types.name}>
                                              {service.service_types.name}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <Input 
                                          value={value || ''} 
                                          onChange={onChange} 
                                          placeholder="執行內容" 
                                        />
                                      )}
                                    </>
                                  );
                                }}
                              />
                              {errors.items?.[index]?.service && (
                                <p className="text-red-500 text-xs mt-1">{errors.items[index]?.service?.message}</p>
                              )}
                            </td>
                            <td className="p-3 align-top">
                              <Input 
                                type="number" 
                                {...register(`items.${index}.quantity`, { valueAsNumber: true })} 
                                defaultValue={1} 
                              />
                              {errors.items?.[index]?.quantity && (
                                <p className="text-red-500 text-xs mt-1">{errors.items[index]?.quantity?.message}</p>
                              )}
                            </td>
                            <td className="p-3 align-top">
                              <Input 
                                type="number" 
                                {...register(`items.${index}.price`, { valueAsNumber: true })} 
                                placeholder="價格" 
                              />
                              {errors.items?.[index]?.price && (
                                <p className="text-red-500 text-xs mt-1">{errors.items[index]?.price?.message}</p>
                              )}
                            </td>
                            <td className="p-3 align-top">
                              <Input {...register(`items.${index}.remark`)} placeholder="備註" />
                            </td>
                            <td className="p-3 text-center align-top">
                              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <Calculator className="mr-2 h-5 w-5 text-indigo-500" />金額計算
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>小計（未稅）:</span>
            <span>NT$ {subTotalUntaxed.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>稅金 (5%):</span>
            <span>NT$ {tax.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold text-lg border-t pt-2">
            <span>合計（含稅）:</span>
            <span>NT$ {grandTotalTaxed.toLocaleString()}</span>
          </div>
          
          <div className="mt-4">
            <label className="flex items-center space-x-2">
              <input type="checkbox" {...register('has_discount')} className="form-checkbox" />
              <span className="text-sm font-medium">是否有優惠價格</span>
            </label>
            {watchHasDiscount && (
              <div className="mt-2">
                <Input 
                  type="number" 
                  {...register('discounted_price', { valueAsNumber: true })} 
                  placeholder="優惠後價格" 
                  className="w-48"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <Book className="mr-2 h-5 w-5 text-indigo-500" />合約條款與備註
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">合約條款</label>
            <Textarea {...register('terms')} rows={10} placeholder="合約條款內容" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <Textarea {...register('remarks')} rows={3} placeholder="其他備註事項" />
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '儲存中...' : (initialData ? '更新報價單' : '建立報價單')}
        </Button>
      </div>
    </form>
  )
}