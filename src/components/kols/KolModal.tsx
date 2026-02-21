'use client'

import { useForm, useFieldArray, type UseFormRegister } from 'react-hook-form'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AutocompleteWithCreate } from '@/components/ui/AutocompleteWithCreate'
import { Database } from '@/types/database.types'
import { useEffect, useMemo } from 'react'
import { PlusCircle, Trash2, Facebook, Instagram, Youtube, Twitch, Twitter, Link as LinkIcon } from 'lucide-react'

// 類型定義
type Kol = Database['public']['Tables']['kols']['Row']
type KolType = Database['public']['Tables']['kol_types']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']

// 執行內容表單資料
interface ServiceFormItem {
  service_type_id?: string
  service_type_name?: string
  is_new_service_type?: boolean
  price?: number
  cost?: number
  last_quote_info?: string | null
}

// 表單資料的 TypeScript 介面
export interface KolFormData {
  name: string
  real_name: string | null
  type_id: string | null
  type_name?: string | null
  is_new_type?: boolean
  social_links: {
    fb?: string
    ig?: string
    yt?: string
    twitch?: string
    x?: string
    other?: string
  }
  bank_info: {
    bankType?: 'individual' | 'company'
    companyAccountName?: string
    personalAccountName?: string
    bankName?: string
    branchName?: string
    accountNumber?: string
  }
  withholding_exempt: boolean
  withholding_exempt_reason: string | null
  services: ServiceFormItem[]
}

// 元件 Props
interface KolModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (kolData: KolFormData, id?: string) => Promise<void>
  kol: (Kol & { kol_services: (KolService & { service_types: ServiceType | null })[] }) | null
  kolTypes: KolType[]
  serviceTypes: ServiceType[]
}

// 建立一個帶有圖示的 Input 子元件，方便重用
const SocialInput = ({ name, icon: Icon, register, placeholder }: { name: keyof KolFormData['social_links']; icon: React.ElementType; register: UseFormRegister<KolFormData>; placeholder: string }) => (
  <div className="relative">
    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
      <Icon className="h-5 w-5 text-muted-foreground" />
    </div>
    <Input {...register(`social_links.${name}`)} placeholder={placeholder} className="pl-10" />
  </div>
)


export function KolModal({ isOpen, onClose, onSave, kol, kolTypes, serviceTypes }: KolModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<KolFormData>()

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'services',
  })

  const watchBankType = watch('bank_info.bankType')
  const watchTypeId = watch('type_id')
  const watchIsNewType = watch('is_new_type')
  const watchServices = watch('services')
  const watchWithholdingExempt = watch('withholding_exempt')

  // Autocomplete options
  const kolTypeOptions = useMemo(() =>
    kolTypes.map(t => ({ label: t.name, value: t.id })),
    [kolTypes]
  )

  const serviceTypeOptions = useMemo(() =>
    serviceTypes.map(t => ({ label: t.name, value: t.id })),
    [serviceTypes]
  )

  useEffect(() => {
    if (isOpen) {
      if (kol) {
        reset({
          name: kol.name,
          real_name: kol.real_name,
          type_id: kol.type_id,
          type_name: null,
          is_new_type: false,
          social_links: (kol.social_links as KolFormData['social_links']) || {},
          bank_info: (kol.bank_info as KolFormData['bank_info']) || { bankType: 'individual' },
          withholding_exempt: kol.withholding_exempt ?? false,
          withholding_exempt_reason: kol.withholding_exempt_reason ?? null,
          services: kol.kol_services.length > 0
            ? kol.kol_services.map(s => ({
                service_type_id: s.service_type_id,
                service_type_name: s.service_types?.name || '',
                is_new_service_type: false,
                price: s.price,
                cost: s.cost,
                last_quote_info: s.last_quote_info,
              }))
            : [{ service_type_id: '', service_type_name: '', is_new_service_type: false, price: 0, cost: 0 }],
        })
      } else {
        reset({
          name: '',
          real_name: '',
          type_id: null,
          type_name: null,
          is_new_type: false,
          social_links: {},
          bank_info: { bankType: 'individual' },
          withholding_exempt: false,
          withholding_exempt_reason: null,
          services: [{ service_type_id: '', service_type_name: '', is_new_service_type: false, price: 0, cost: 0 }],
        })
      }
    }
  }, [kol, reset, isOpen])

  const onSubmit = async (data: KolFormData) => {
    if (data.bank_info?.bankType !== 'company') {
      data.bank_info = { ...data.bank_info, companyAccountName: '' };
    }
    if (data.bank_info?.bankType !== 'individual') {
      data.bank_info = { ...data.bank_info, personalAccountName: '' };
    }
    const sanitizedData = { ...data, real_name: data.real_name || null, type_id: data.type_id || null };
    await onSave(sanitizedData, kol?.id)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={kol ? '編輯 KOL/服務資料' : '新增 KOL/服務'} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-h-[80vh] overflow-y-auto p-1">

        {/* 基本資訊區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-foreground/70 border-b pb-2">基本資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="text-sm font-medium">KOL 類型</label>
              <div className="mt-1">
                <AutocompleteWithCreate
                  selectedId={watchTypeId ?? null}
                  inputText={watch('type_name') || ''}
                  options={kolTypeOptions}
                  placeholder="搜尋或輸入類型"
                  createLabel="新增類型"
                  onSelect={(id) => {
                    setValue('type_id', id)
                    setValue('type_name', null)
                    setValue('is_new_type', false)
                  }}
                  onCreateIntent={(name) => {
                    setValue('type_id', null)
                    setValue('type_name', name)
                    setValue('is_new_type', true)
                  }}
                  onClear={() => {
                    setValue('type_id', null)
                    setValue('type_name', null)
                    setValue('is_new_type', false)
                  }}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">KOL/服務名稱 (必填)</label>
              <Input {...register('name', { required: 'KOL/服務名稱為必填' })} className="mt-1" />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">真實姓名</label>
              <Input {...register('real_name')} className="mt-1" />
            </div>
          </div>
        </div>

        {/* 執行內容與價格區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-foreground/70 border-b pb-2">執行內容與價格</h4>
          <div className="space-y-3 pt-2">
            {fields.map((field, index) => {
              const currentServiceTypeId = watchServices?.[index]?.service_type_id
              const currentServiceTypeName = watchServices?.[index]?.service_type_name
              const isNewServiceType = watchServices?.[index]?.is_new_service_type
              const originalService = kol?.kol_services[index]

              return (
                <div key={field.id} className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="flex-grow">
                      <AutocompleteWithCreate
                        selectedId={currentServiceTypeId ?? null}
                        inputText={currentServiceTypeName || ''}
                        options={serviceTypeOptions}
                        placeholder="搜尋或輸入執行內容"
                        createLabel="新增服務"
                        onSelect={(id) => {
                          const st = serviceTypes.find(s => s.id === id)
                          setValue(`services.${index}.service_type_id`, id)
                          setValue(`services.${index}.service_type_name`, st?.name || '')
                          setValue(`services.${index}.is_new_service_type`, false)
                        }}
                        onCreateIntent={(name) => {
                          setValue(`services.${index}.service_type_id`, '')
                          setValue(`services.${index}.service_type_name`, name)
                          setValue(`services.${index}.is_new_service_type`, true)
                        }}
                        onClear={() => {
                          setValue(`services.${index}.service_type_id`, '')
                          setValue(`services.${index}.service_type_name`, '')
                          setValue(`services.${index}.is_new_service_type`, false)
                        }}
                      />
                    </div>
                    <Input type="number" {...register(`services.${index}.price`, { valueAsNumber: true })} placeholder="報價" className="w-28" />
                    <Input type="number" {...register(`services.${index}.cost`, { valueAsNumber: true })} placeholder="成本" className="w-28" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {originalService?.last_quote_info && !isNewServiceType && (
                    <p className="text-xs text-muted-foreground pl-1">
                      來源：{originalService.last_quote_info}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => append({ service_type_id: '', service_type_name: '', is_new_service_type: false, price: 0, cost: 0 })}>
            <PlusCircle className="mr-2 h-4 w-4" /> 新增執行內容
          </Button>
        </div>

        {/* 社群平台連結區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-foreground/70 border-b pb-2">社群平台連結</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <SocialInput name="fb" icon={Facebook} register={register} placeholder="Facebook URL" />
            <SocialInput name="ig" icon={Instagram} register={register} placeholder="Instagram URL" />
            <SocialInput name="yt" icon={Youtube} register={register} placeholder="YouTube URL" />
            <SocialInput name="twitch" icon={Twitch} register={register} placeholder="Twitch URL" />
            <SocialInput name="x" icon={Twitter} register={register} placeholder="X (Twitter) URL" />
            <SocialInput name="other" icon={LinkIcon} register={register} placeholder="其他連結 URL" />
          </div>
        </div>

        {/* 銀行帳號資訊區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-foreground/70 border-b pb-2">銀行帳號資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/70">帳戶類型</label>
                <div className="mt-2 flex space-x-4">
                  <label className="inline-flex items-center"><input type="radio" {...register('bank_info.bankType')} value="individual" className="form-radio" /> <span className="ml-2">勞報</span></label>
                  <label className="inline-flex items-center"><input type="radio" {...register('bank_info.bankType')} value="company" className="form-radio" /> <span className="ml-2">公司行號</span></label>
                </div>
              </div>
              {watchBankType === 'company' && (
                <div>
                  <label className="block text-sm font-medium">公司匯款戶名</label>
                  <Input {...register('bank_info.companyAccountName')} className="mt-1" />
                </div>
              )}
              {watchBankType === 'individual' && (
                <div>
                  <label className="block text-sm font-medium">個人匯款戶名</label>
                  <Input {...register('bank_info.personalAccountName')} className="mt-1" />
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium">銀行名稱</label>
                <Input {...register('bank_info.bankName')} placeholder="例如: 國泰世華銀行" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium">分行名稱</label>
                <Input {...register('bank_info.branchName')} placeholder="例如: 文山分行" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium">帳戶帳號</label>
                <Input {...register('bank_info.accountNumber')} className="mt-1" />
              </div>
            </div>
          </div>
        </div>

        {/* 代扣設定區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-foreground/70 border-b pb-2">代扣設定</h4>
          <div className="pt-2 space-y-3">
            {watchBankType === 'company' ? (
              <p className="text-sm text-success bg-success/10 px-3 py-2 rounded-md">
                公司戶開發票，無需代扣所得稅及二代健保
              </p>
            ) : (
              <>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('withholding_exempt')}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm">免扣代繳（如已加入職業公會）</span>
                </label>
                {watchWithholdingExempt && (
                  <div>
                    <Input
                      {...register('withholding_exempt_reason')}
                      placeholder="免扣原因（如：已加入OO職業工會）"
                      className="mt-1"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-6 border-t mt-6">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '儲存中...' : '儲存'}</Button>
        </div>
      </form>
    </Modal>
  )
}
