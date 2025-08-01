'use client'

import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PlusCircle, Trash2, FileSignature, Calculator, Book } from 'lucide-react'
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

// --- Zod Validation Schema ---
const quoteSchema = z.object({
  project_name: z.string().min(1, '專案名稱為必填項目'),
  client_id: z.string().nullable(),
  client_contact: z.string().nullable(),
  // Read-only fields, no need to validate
  // client_tin: z.string().nullable(),
  // invoice_title: z.string().nullable(),
  // invoice_address: z.string().nullable(),
  payment_method: z.enum(['電匯', 'ATM轉帳']),
  has_discount: z.boolean(),
  discounted_price: z.number().nullable(),
  terms: z.string().nullable(),
  remarks: z.string().nullable(),
  items: z.array(z.object({
      id: z.string().optional(),
      quotation_id: z.string().optional(),
      category: z.string().nullable(),
      kol_id: z.string().nullable(),
      service: z.string(),
      quantity: z.number().min(1),
      price: z.number(),
      remark: z.string().nullable(),
      created_at: z.string().optional(),
  })).min(1, "請至少新增一個報價項目"),
});


type QuoteFormData = z.infer<typeof quoteSchema>

// --- Component Props ---
interface QuoteFormProps {
  initialData?: Quotation & { quotation_items: QuotationItem[] }
}

const staticTerms = {
    standard: `合約約定：\n1、專案執行日期屆滿，另訂新約。\n2、本報價之範圍僅限以繁體中文及臺灣地區。如委刊客戶有其他需求，本公司需另行計價。\n3、為避免造成作業安排之困擾，執行日期簽定後，除非取得本公司書面同意延後，否則即按簽定之執行日期或條件開始計費。\n4、於本服務契約之專案購買項目與範圍內，本公司接受委刊客戶之書面指示進行，如委刊客戶有超出項目外之請求，雙方應另行書面協議之。\n5、專案經啟動後，除另有約定或經本公司書面同意之特殊理由，否則不得中途任意終止本契約書執行內容與範圍之全部或一部。如有雙方合意終止本專案之情形，本公司之服務費用依已發生之費用另行計算。如委刊客戶違反本項規定，本公司已收受之費用將不予退還，並另得向委刊客戶請求剩餘之未付費用作為違約金。\n6、委刊客戶委託之專案目標、任務及所提供刊登之素材皆不得有內容不實，或侵害他人著作權、商標權或其他權利及違反中華民國法律之情形，如有任何第三人主張委託公司之專案目標與任務有侵害其權利、違法或有其他交易糾紛之情形，本公司得於通知委刊客戶後停止本專案之執行並單方終止本合約，本公司已收受之費用將不予退還；如更致本公司遭行政裁罰、刑事訴追或民事請求時，委託公司應出面處理相關爭議，並賠償本公司一切所受損害及支出費用。\n7、專案內之活動舉辦，不包含活動贈品購買及寄送，如有另外舉辦活動之贈品由委刊客戶提供。\n8、如委刊客戶於本約期間屆滿前15天以書面通知續約時，經本公司確認受理後，除有情事變更外，委刊客戶有權以相同價格與相同約定期間延展本約。\n9、如係可歸責本公司情形致無法於執行期間完成專案項目時，得與委刊客戶協議後延展服務期間完成，不另收取費用。\n10、委刊客戶之法定代理人應同意作為本服務契約連帶保證人。\n11、本約未盡事宜，悉依中華民國法律為準據法，雙方同意如因本約所發生之爭訟，以台北地方法院為一審管轄法院。\n\n保密協議：\n(一) 雙方因執行本服務契約書事物而知悉、持有他方具有機密性質之商業資訊、必要資料、來往文件(以下統稱保密標的)等，應保守秘密，除法令另有規定外，不得對任何第三人，包括但不限於個人或任何公司或其他組織，以任何方式揭露或將該保密標的使用於受託業務外之任何目的。\n(二) 服務契約書雙方均應確保其受僱人、使用人、代理人、代表人亦應遵守本項保密義務，而不得將保密標的提供或洩漏予任何第三人知悉或使用。\n(三) 依本服務契約所拍攝之廣告影片及平面廣告(包括平面廣宣物於未公開播出或刊登前，本公司對拍攝或錄製之內容負有保密義務，不得自行或使他人發表任何有關本合約廣告影片、平面廣告(包括平面廣宣物)及其產品內容之任何資訊及照片，或擅自接受任何以本系列廣告為主題之媒體採訪、宣傳造勢活動。`,
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
    resolver: zodResolver(quoteSchema), // <-- Use Zod for validation
    defaultValues: {
      project_name: initialData?.project_name || '',
      client_id: initialData?.client_id || null,
      client_contact: initialData?.client_contact || null,
      payment_method: initialData?.payment_method || '電匯',
      has_discount: initialData?.has_discount || false,
      discounted_price: initialData?.discounted_price || null,
      terms: initialData?.terms || staticTerms.standard,
      remarks: initialData?.remarks || '',
      items: initialData?.quotation_items?.length ? initialData.quotation_items : [{ category: '', kol_id: null, service: '', quantity: 1, price: 0, remark: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')
  const watchClientId = watch('client_id')
  const watchHasDiscount = watch('has_discount')
  
  // Create state for read-only client fields
  const [clientInfo, setClientInfo] = useState({ tin: '', invoiceTitle: '', address: '' });

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
  
  // This useEffect now also updates the clientInfo state
  useEffect(() => {
    const selectedClient = clients.find(c => c.id === watchClientId)
    if (selectedClient) {
      setValue('client_contact', selectedClient.contact_person)
      setClientInfo({
        tin: selectedClient.tin || '',
        invoiceTitle: selectedClient.invoice_title || '',
        address: selectedClient.address || ''
      });
    } else {
      setValue('client_contact', '')
      setClientInfo({ tin: '', invoiceTitle: '', address: '' });
    }
  }, [watchClientId, clients, setValue])

  const handleKolChange = (itemIndex: number, kolId: string) => {
    setValue(`items.${itemIndex}.kol_id`, kolId || null);
    const selectedKol = kols.find(k => k.id === kolId)
    if (selectedKol && selectedKol.kol_services.length > 0) {
      const firstService = selectedKol.kol_services[0]
      setValue(`items.${itemIndex}.service`, firstService.service_types.name)
      setValue(`items.${itemIndex}.price`, firstService.price)
    } else {
      setValue(`items.${itemIndex}.service`, '')
      setValue(`items.${itemIndex}.price`, 0)
    }
  }

  const subTotalUntaxed = watchItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  const tax = Math.round(subTotalUntaxed * 0.05)
  const grandTotalTaxed = subTotalUntaxed + tax

  const onSubmit = async (data: QuoteFormData) => {
    // --- CORRECTED DATA STRUCTURE FOR SUBMISSION ---
    // This object ONLY contains fields that exist in the 'quotations' table.
    const quoteDataToSave = {
      project_name: data.project_name,
      client_id: data.client_id || null,
      client_contact: data.client_contact || null,
      payment_method: data.payment_method,
      subtotal_untaxed: subTotalUntaxed,
      tax: tax,
      grand_total_taxed: grandTotalTaxed,
      has_discount: data.has_discount,
      discounted_price: data.has_discount ? data.discounted_price : null,
      status: initialData?.status || '草稿',
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
            <FileSignature className="mr-2 h-5 w-5 text-indigo-500" />專案與客戶資訊
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div><label className="form-label-sm">專案名稱</label><Input {...register('project_name')} placeholder="專案名稱" />{errors.project_name && <p className="text-red-500 text-xs mt-1">{errors.project_name.message}</p>}</div>
            <div><label className="form-label-sm">委刊客戶</label><select {...register('client_id')} className="form-input"><option value="">-- 選擇客戶 --</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="form-label-sm">客戶聯絡人</label><Input {...register('client_contact')} placeholder="客戶聯絡人" /></div>
            <div><label className="form-label-sm">統一編號</label><Input value={clientInfo.tin} readOnly className="bg-gray-100" /></div>
            <div><label className="form-label-sm">發票抬頭</label><Input value={clientInfo.invoiceTitle} readOnly className="bg-gray-100" /></div>
            <div><label className="form-label-sm">發票寄送地址</label><Input value={clientInfo.address} readOnly className="bg-gray-100" /></div>
            <div><label className="form-label-sm">付款方式</label><div className="flex items-center space-x-4 mt-2"><label className="flex items-center"><input type="radio" {...register('payment_method')} value="電匯" className="form-radio" /> <span className="ml-2 text-sm">電匯</span></label><label className="flex items-center"><input type="radio" {...register('payment_method')} value="ATM轉帳" className="form-radio" /> <span className="ml-2 text-sm">ATM轉帳</span></label></div></div>
        </div>
      </div>
      
      {/* Other form sections remain the same */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center"><FileSignature className="mr-2 h-5 w-5 text-indigo-500" />報價項目</h2>
            <Button type="button" onClick={() => append({ category: '', kol_id: null, service: '', quantity: 1, price: 0, remark: '' })}><PlusCircle className="mr-2 h-4 w-4" /> 新增項目</Button>
        </div>
        {errors.items && <p className="text-red-500 text-sm mb-2">{errors.items.message}</p>}
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="p-2 text-left font-medium text-gray-600">類別</th><th className="p-2 text-left font-medium text-gray-600">KOL</th><th className="p-2 w-1/3 text-left font-medium text-gray-600">執行內容</th><th className="p-2 text-left font-medium text-gray-600">數量</th><th className="p-2 text-left font-medium text-gray-600">價格</th><th className="p-2 text-left font-medium text-gray-600">備註</th><th className="p-2 text-center font-medium text-gray-600">操作</th></tr></thead>
                <tbody>
                    {fields.map((field, index) => (
                        <tr key={field.id} className="align-top border-b">
                            <td className="p-1"><select {...register(`items.${index}.category`)} className="form-input"><option value="">-- 類別 --</option>{quoteCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></td>
                            <td className="p-1"><Controller control={control} name={`items.${index}.kol_id`} render={({ field: { onChange, value } }) => (<select value={value || ''} onChange={(e) => handleKolChange(index, e.target.value)} className="form-input"><option value="">-- 自訂項目 --</option>{kols.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select>)} /></td>
                            <td className="p-1"><Input {...register(`items.${index}.service`)} placeholder="執行內容" /></td>
                            <td className="p-1"><Input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} defaultValue={1} /></td>
                            <td className="p-1"><Input type="number" {...register(`items.${index}.price`, { valueAsNumber: true })} placeholder="價格" /></td>
                            <td className="p-1"><Input {...register(`items.${index}.remark`)} placeholder="備註" /></td>
                            <td className="p-1 text-center"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
    <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><Calculator className="mr-2 h-5 w-5 text-indigo-500" />金額計算</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm"><p>項目合計未稅:</p> <p>NT$ {subTotalUntaxed.toLocaleString()}</p></div>
                <div className="flex justify-between text-sm"><p>稅金 (5%):</p> <p>NT$ {tax.toLocaleString()}</p></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2"><p>合計含稅:</p> <p>NT$ {grandTotalTaxed.toLocaleString()}</p></div>
            </div>
            <div>
                <label className="form-label-sm">有無專案優惠價</label>
                <Controller
                    name="has_discount"
                    control={control}
                    render={({ field }) => (
                        <div className="flex items-center space-x-4 mt-2">
                            <label className="flex items-center">
                                <input type="radio" {...field} onChange={() => field.onChange(false)} checked={field.value === false} value="false" className="form-radio" />
                                <span className="ml-2 text-sm">無</span>
                            </label>
                            <label className="flex items-center">
                                <input type="radio" {...field} onChange={() => field.onChange(true)} checked={field.value === true} value="true" className="form-radio" />
                                <span className="ml-2 text-sm">有</span>
                            </label>
                        </div>
                    )}
                />
                {watchHasDiscount && (<div className="mt-4"><Input type="number" {...register('discounted_price', { valueAsNumber: true })} placeholder="請輸入專案優惠價(含稅)" /></div>)}
            </div>
        </div>
    </div>
    <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><Book className="mr-2 h-5 w-5 text-indigo-500" />條款與備註</h2>
        <div className="space-y-4">
            <div><label className="form-label-sm">合約條款範本</label><select className="form-input" onChange={e => setValue('terms', staticTerms[e.target.value as keyof typeof staticTerms])}><option value="standard">標準KOL合作條款</option><option value="event">線下活動出席條款</option></select></div>
            <Textarea {...register('terms')} rows={10} />
            <Textarea {...register('remarks')} placeholder="專案備註..." />
        </div>
    </div>
    <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? '儲存中...' : (initialData ? '更新報價單' : '建立報價單')}</Button>
    </div>
    </form>
  )
}