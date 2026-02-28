// src/components/quotes/form/types.ts
// 報價單表單共用型別定義（單一來源，避免重複導出）

import { z } from 'zod'
import { Database } from '@/types/database.types'
import { UseFormReturn, UseFieldArrayReturn } from 'react-hook-form'
import { AutocompleteOption } from '@/components/ui/AutocompleteWithCreate'

// --- 資料庫型別別名 ---
export type Client = Database['public']['Tables']['clients']['Row']
export type Kol = Database['public']['Tables']['kols']['Row']
export type KolService = Database['public']['Tables']['kol_services']['Row']
export type ServiceType = Database['public']['Tables']['service_types']['Row']
export type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']
export type Quotation = Database['public']['Tables']['quotations']['Row']
export type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
export type KolWithServices = Kol & { kol_services: (KolService & { service_types: ServiceType })[] }
export type QuotationStatus = '草稿' | '待簽約' | '已簽約' | '已歸檔'

// --- 聯絡人 ---
export interface ContactInfo {
  name: string
  email?: string
  phone?: string
  position?: string
  is_primary?: boolean
}

export interface ClientWithContacts extends Client {
  parsedContacts: ContactInfo[]
}

// --- 表單項目 ---
export interface FormItem {
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
export const quoteSchema = z.object({
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

export type QuoteFormData = z.infer<typeof quoteSchema>

// --- Props ---
export interface QuoteFormProps {
  initialData?: Quotation & { quotation_items: QuotationItem[] }
}

// --- 客戶資訊顯示狀態 ---
export interface ClientInfoState {
  tin: string
  invoiceTitle: string
  address: string
  email: string
}

// --- useQuoteFormData 回傳型別 ---
export interface UseQuoteFormDataReturn {
  clients: ClientWithContacts[]
  kols: KolWithServices[]
  quoteCategories: QuoteCategory[]
  loading: boolean
  clientContacts: ContactInfo[]
  selectedContact: ContactInfo | null
  clientInfo: ClientInfoState
  setClientContacts: React.Dispatch<React.SetStateAction<ContactInfo[]>>
  setSelectedContact: React.Dispatch<React.SetStateAction<ContactInfo | null>>
  setClientInfo: React.Dispatch<React.SetStateAction<ClientInfoState>>
  kolOptions: AutocompleteOption[]
  clientOptions: AutocompleteOption[]
  contactOptions: AutocompleteOption[]
  categoryOptions: AutocompleteOption[]
  searchKols: (term: string) => void
  handleContactSelect: (contactName: string) => void
  handleKolChange: (itemIndex: number, kolId: string) => void
  getKolServices: (kolId: string | null | undefined) => (KolService & { service_types: ServiceType })[]
}

// --- 子元件共用 Props ---
export interface QuoteFormBasicInfoProps {
  form: UseFormReturn<QuoteFormData>
  formData: UseQuoteFormDataReturn
  initialData?: QuoteFormProps['initialData']
}

export interface QuoteFormItemsTableProps {
  form: UseFormReturn<QuoteFormData>
  fieldArray: UseFieldArrayReturn<QuoteFormData, 'items'>
  formData: UseQuoteFormDataReturn
}

export interface QuoteFormSummaryProps {
  form: UseFormReturn<QuoteFormData>
  subTotalUntaxed: number
  tax: number
  grandTotalTaxed: number
}

export interface QuoteFormTermsProps {
  form: UseFormReturn<QuoteFormData>
}

// --- Helper Functions ---
export const transformInitialItems = (items?: QuotationItem[]): FormItem[] => {
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

// --- 合約條款範本 ---
export const staticTerms = { standard: `合約約定：\n1、專案執行日期屆滿，另訂新約。\n2、本報價之範圍僅限以繁體中文及臺灣地區。如委刊客戶有其他需求，本公司需另行計價。\n3、為避免造成作業安排之困擾，執行日期簽定後，除非取得本公司書面同意延後，否則即按簽定之執行日期或條件開始計費。\n4、於本服務契約之專案購買項目與範圍內，本公司接受委刊客戶之書面指示進行，如委刊客戶有超出項目外之請求，雙方應另行書面協議之。\n5、專案經啟動後，除另有約定或經本公司書面同意之特殊理由，否則不得中途任意終止本契約書執行內容與範圍之全部或一部。如有雙方合意終止本專案之情形，本公司之服務費用依已發生之費用另行計算。如委刊客戶違反本項規定，本公司已收受之費用將不予退還，並另得向委刊客戶請求剩餘之未付費用作為違約金。\n6、委刊客戶委託之專案目標、任務及所提供刊登之素材皆不得有內容不實，或侵害他人著作權、商標權或其他權利及違反中華民國法律之情形，如有任何第三人主張委託公司之專案目標與任務有侵害其權利、違法或有其他交易糾紛之情形，本公司得於通知委託客戶後停止本專案之執行並單方終止本合約，本公司已收受之費用將不予退還；如更致本公司遭行政裁罰、刑事訴追或民事請求時，委託公司應出面處理相關爭議，並賠償本公司一切所受損害及支出費用。\n7、專案內之活動舉辦，不包含活動贈品購買及寄送，如有另外舉辦活動之贈品由委刊客戶提供。\n8、如委刊客戶於本約期間屆滿前15天以書面通知續約時，經本公司確認受理後，除有情事變更外，委刊客戶有權以相同價格與相同約定期間延展本約。\n9、如係可歸責本公司情形致無法於執行期間完成專案項目時，得與委刊客戶協議後延展服務期間完成，不另收取費用。\n10、委刊客戶之法定代理人應同意作為本服務契約連帶保證人。\n11、本約未盡事宜，悉依中華民國法律為準據法，雙方同意如因本約所發生之爭訟，以台北地方法院為一審管轄法院。\n\n保密協議：\n(一) 雙方因執行本服務契約書事物而知悉、持有他方具有機密性質之商業資訊、必要資料、來往文件(以下統稱保密標的)等，應保守秘密，除法令另有規定外，不得對任何第三人，包括但不限於個人或任何公司或其他組織，以任何方式揭露或將該保密標的使用於受託業務外之任何目的。\n(二) 服務契約書雙方均應確保其受僱人、使用人、代理人、代表人亦應遵守本項保密義務，而不得將保密標的提供或洩漏予任何第三人知悉或使用。\n(三) 依本服務契約所拍攝之廣告影片及平面廣告(包括平面廣宣物於未公開播出或刊登前，本公司對拍攝或錄製之內容負有保密義務，不得自行或使他人發表任何有關本合約廣告影片、平面廣告(包括平面廣宣物)及其產品內容之任何資訊及照片，或擅自接受任何以本系列廣告為主題之媒體採訪、宣傳造勢活動。`, event: `活動出席約定:\n1. KOL應於指定時間前30分鐘抵達現場準備。\n2. 若因不可抗力因素無法出席，應提前至少24小時通知。\n\n保密協議:\n雙方均應確保其所屬員工、代理人、代表人及其他相關人員就因履行本服務契約書而知悉或持有之他方任何資訊、資料，善盡保密責任，非經他方事前書面同意，不得對任何第三人洩漏。` }
