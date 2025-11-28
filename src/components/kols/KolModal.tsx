'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Database } from '@/types/database.types'
import { useEffect } from 'react'
import { PlusCircle, Trash2, Facebook, Instagram, Youtube, Twitch, Twitter, Link as LinkIcon } from 'lucide-react'

// 類型定義
type Kol = Database['public']['Tables']['kols']['Row']
type KolType = Database['public']['Tables']['kol_types']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']

// 表單資料的 TypeScript 介面
interface KolFormData {
  name: string
  real_name: string | null
  type_id: string | null
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
  services: Partial<KolService>[]
}

// 元件 Props
interface KolModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (kolData: KolFormData, id?: string) => Promise<void>
  kol: (Kol & { kol_services: KolService[] }) | null
  kolTypes: KolType[]
  serviceTypes: ServiceType[]
}

// 建立一個帶有圖示的 Input 子元件，方便重用
const SocialInput = ({ name, icon: Icon, register, placeholder }: { name: keyof KolFormData['social_links']; icon: React.ElementType; register: any; placeholder: string }) => (
  <div className="relative">
    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
      <Icon className="h-5 w-5 text-gray-400" />
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
    formState: { errors, isSubmitting },
  } = useForm<KolFormData>()

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'services',
  })

  const watchBankType = watch('bank_info.bankType')

  useEffect(() => {
    if (isOpen) {
      if (kol) {
        reset({
          name: kol.name,
          real_name: kol.real_name,
          type_id: kol.type_id,
          social_links: (kol.social_links as any) || {},
          bank_info: (kol.bank_info as any) || { bankType: 'individual' },
          services: kol.kol_services.length > 0 ? kol.kol_services : [{ service_type_id: '', price: 0 }],
        })
      } else {
        reset({
          name: '',
          real_name: '',
          type_id: null,
          social_links: {},
          bank_info: { bankType: 'individual' },
          services: [{ service_type_id: '', price: 0 }],
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
    // 修改 Modal 元件，讓它可以接收寬度參數
    <Modal isOpen={isOpen} onClose={onClose} title={kol ? '編輯 KOL 資料' : '新增 KOL'} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-h-[80vh] overflow-y-auto p-1">

        {/* 基本資訊區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">基本資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="text-sm font-medium">KOL 類型</label>
              <select {...register('type_id')} className="form-input mt-1">
                <option value="">-- 選擇類型 --</option>
                {kolTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">KOL 名稱 (必填)</label>
              <Input {...register('name', { required: 'KOL 名稱為必填' })} className="mt-1" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">真實姓名</label>
              <Input {...register('real_name')} className="mt-1" />
            </div>
          </div>
        </div>

        {/* 服務項目與價格區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">服務項目與價格</h4>
          <div className="space-y-3 pt-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center space-x-2">
                <select {...register(`services.${index}.service_type_id`)} className="form-input flex-grow">
                  <option value="">-- 選擇服務 --</option>
                  {serviceTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
                <Input type="number" {...register(`services.${index}.price`, { valueAsNumber: true })} placeholder="價格" className="w-32" />
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => append({ service_type_id: '', price: 0 })}>
            <PlusCircle className="mr-2 h-4 w-4" /> 新增服務項目
          </Button>
        </div>

        {/* 社群平台連結區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">社群平台連結</h4>
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
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">銀行帳號資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">帳戶類型</label>
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

        <div className="flex justify-end space-x-2 pt-6 border-t mt-6">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '儲存中...' : '儲存'}</Button>
        </div>
      </form>
    </Modal>
  )
}