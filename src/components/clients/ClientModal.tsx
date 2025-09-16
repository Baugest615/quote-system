// src/components/clients/ClientModal.tsx - 修正 TypeScript 錯誤版本
'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Database } from '@/types/database.types'
import { useEffect, useState } from 'react'
import { PlusCircle, Trash2, User, Building2, Star, StarOff } from 'lucide-react'
import { toast } from 'sonner'

type Client = Database['public']['Tables']['clients']['Row']

// 聯絡人介面定義 - 對應您的JSONB結構
interface Contact {
  name: string
  email?: string
  phone?: string
  position?: string
  is_primary?: boolean
}

// 銀行資訊介面
interface BankInfo {
  bankName?: string
  branchName?: string
  accountNumber?: string
}

// 表單驗證結構
const contactSchema = z.object({
  name: z.string().min(1, '聯絡人姓名為必填'),
  email: z.string().email('請輸入有效的電子郵件格式').optional().or(z.literal('')),
  phone: z.string().optional(),
  position: z.string().optional(),
  is_primary: z.boolean().default(false),
})

const clientSchema = z.object({
  // 公司資訊
  name: z.string().min(1, '公司名稱為必填'),
  phone: z.string().optional(),
  address: z.string().min(1, '公司地址為必填'),
  
  // 發票資訊
  tin: z.string().optional(),
  invoice_title: z.string().optional(),
  
  // 銀行資訊
  bank_info: z.object({
    bankName: z.string().optional(),
    branchName: z.string().optional(),
    accountNumber: z.string().optional(),
  }).optional(),
  
  // 聯絡人資訊 (JSONB陣列)
  contacts: z.array(contactSchema).min(1, '至少需要一位聯絡人'),
})

type ClientFormData = z.infer<typeof clientSchema>

interface ClientModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (clientData: any, id?: string) => Promise<void>
  client?: Client | null
}

export function ClientModal({ isOpen, onClose, onSave, client }: ClientModalProps) {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      tin: '',
      invoice_title: '',
      bank_info: {
        bankName: '',
        branchName: '',
        accountNumber: '',
      },
      contacts: [
        {
          name: '',
          email: '',
          phone: '',
          position: '',
          is_primary: true,
        }
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contacts',
  })

  const watchedContacts = watch('contacts')

  // 載入現有客戶資料
  useEffect(() => {
    if (client && isOpen) {
      loadClientData()
    } else if (isOpen) {
      resetForm()
    }
  }, [client, isOpen])

  const resetForm = () => {
    reset({
      name: '',
      phone: '',
      address: '',
      tin: '',
      invoice_title: '',
      bank_info: {
        bankName: '',
        branchName: '',
        accountNumber: '',
      },
      contacts: [
        {
          name: '',
          email: '',
          phone: '',
          position: '',
          is_primary: true,
        }
      ],
    })
  }

  const loadClientData = () => {
    if (!client) return

    try {
      // 安全解析 JSONB contacts 資料
      let contacts: Contact[] = []
      
      if (client.contacts) {
        if (typeof client.contacts === 'string') {
          contacts = JSON.parse(client.contacts)
        } else if (Array.isArray(client.contacts)) {
          contacts = client.contacts as Contact[]
        }
      }

      // 如果沒有聯絡人，使用舊的單一聯絡人欄位建立預設聯絡人
      if (contacts.length === 0 && client.contact_person) {
        contacts = [{
          name: client.contact_person,
          email: client.email || '',
          phone: client.phone || '',
          position: '',
          is_primary: true,
        }]
      }

      // 確保至少有一個聯絡人
      if (contacts.length === 0) {
        contacts = [{
          name: '',
          email: '',
          phone: '',
          position: '',
          is_primary: true,
        }]
      }

      // 確保有主要聯絡人
      const hasPrimary = contacts.some(contact => contact.is_primary)
      if (!hasPrimary && contacts.length > 0) {
        contacts[0].is_primary = true
      }

      // 安全解析銀行資訊
      let bankInfo: BankInfo = {}
      if (client.bank_info && typeof client.bank_info === 'object' && !Array.isArray(client.bank_info)) {
        const bank = client.bank_info as any
        bankInfo = {
          bankName: bank.bankName || '',
          branchName: bank.branchName || '',
          accountNumber: bank.accountNumber || '',
        }
      }

      reset({
        name: client.name,
        phone: client.phone || '',
        address: client.address || '',
        tin: client.tin || '',
        invoice_title: client.invoice_title || '',
        bank_info: bankInfo,
        contacts: contacts,
      })
    } catch (error) {
      console.error('解析聯絡人資料失敗:', error)
      toast.error('載入聯絡人資料失敗')
      resetForm()
    }
  }

  const onSubmit = async (data: ClientFormData) => {
    setLoading(true)
    try {
      // 確保至少有一個主要聯絡人
      const hasPrimary = data.contacts.some(contact => contact.is_primary)
      if (!hasPrimary) {
        data.contacts[0].is_primary = true
      }

      // 清理空值，準備JSONB格式
      const cleanedContacts = data.contacts.map(contact => ({
        name: contact.name.trim(),
        email: contact.email?.trim() || undefined,
        phone: contact.phone?.trim() || undefined,
        position: contact.position?.trim() || undefined,
        is_primary: contact.is_primary || false,
      })).filter(contact => contact.name) // 過濾掉沒有名稱的聯絡人

      const clientData = {
        name: data.name,
        phone: data.phone || undefined, // 轉為 undefined 而非 null
        address: data.address,
        tin: data.tin || undefined,
        invoice_title: data.invoice_title || undefined,
        bank_info: data.bank_info && (data.bank_info.bankName || data.bank_info.branchName || data.bank_info.accountNumber) 
          ? data.bank_info 
          : undefined,
        contacts: cleanedContacts, // 直接傳JSONB陣列
        // 同時更新舊的單一聯絡人欄位以保持相容性
        contact_person: cleanedContacts.find(c => c.is_primary)?.name || cleanedContacts[0]?.name || undefined,
        email: cleanedContacts.find(c => c.is_primary)?.email || cleanedContacts[0]?.email || undefined,
      }

      await onSave(clientData, client?.id)
    } catch (error) {
      console.error('儲存客戶資料失敗:', error)
      toast.error('儲存客戶資料失敗')
    } finally {
      setLoading(false)
    }
  }

  const addContact = () => {
    append({
      name: '',
      email: '',
      phone: '',
      position: '',
      is_primary: false,
    })
  }

  const setPrimaryContact = (index: number) => {
    // 將所有聯絡人設為非主要，然後設定指定的聯絡人為主要
    watchedContacts.forEach((_, i) => {
      setValue(`contacts.${i}.is_primary`, i === index)
    })
  }

  if (loading && client) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="載入中...">
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={client ? '編輯客戶資料' : '新增客戶'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-h-[80vh] overflow-y-auto p-1">
        
        {/* 公司資訊區塊 */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Building2 className="h-5 w-5 text-indigo-600" />
            <h4 className="text-md font-semibold text-gray-700 border-b pb-2 flex-1">公司資訊</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium">公司名稱 (必填)</label>
              <Input {...register('name')} className="mt-1" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium">公司電話</label>
              <Input {...register('phone')} className="mt-1" />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium">公司地址 (必填)</label>
              <Input {...register('address')} className="mt-1" />
              {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
            </div>
          </div>
        </div>

        {/* 聯絡人資訊區塊 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-indigo-600" />
              <h4 className="text-md font-semibold text-gray-700">聯絡人資訊</h4>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addContact}
              className="flex items-center space-x-1"
            >
              <PlusCircle className="h-4 w-4" />
              <span>新增窗口</span>
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => {
              const isPrimary = watchedContacts[index]?.is_primary
              return (
                <div
                  key={field.id}
                  className={`p-4 border rounded-lg transition-colors ${
                    isPrimary ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-700">
                        聯絡人 #{index + 1}
                      </span>
                      {isPrimary && (
                        <div className="flex items-center space-x-1 px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded-full">
                          <Star className="h-3 w-3 fill-current" />
                          <span>主要聯絡人</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {!isPrimary && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPrimaryContact(index)}
                          className="text-xs flex items-center space-x-1"
                        >
                          <StarOff className="h-3 w-3" />
                          <span>設為主要</span>
                        </Button>
                      )}
                      
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => remove(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium">窗口姓名 (必填)</label>
                      <Input 
                        {...register(`contacts.${index}.name`)} 
                        className="mt-1" 
                        placeholder="請輸入聯絡人姓名"
                      />
                      {errors.contacts?.[index]?.name && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.contacts[index]?.name?.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium">職稱</label>
                      <Input 
                        {...register(`contacts.${index}.position`)} 
                        className="mt-1" 
                        placeholder="例：行銷經理"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium">電子郵件</label>
                      <Input
                        type="email"
                        {...register(`contacts.${index}.email`)}
                        className="mt-1"
                        placeholder="example@company.com"
                      />
                      {errors.contacts?.[index]?.email && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.contacts[index]?.email?.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium">聯絡電話</label>
                      <Input 
                        {...register(`contacts.${index}.phone`)} 
                        className="mt-1" 
                        placeholder="例：02-1234-5678"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          
          {errors.contacts && (
            <p className="text-red-500 text-xs">
              {errors.contacts.message}
            </p>
          )}
        </div>

        {/* 發票資訊區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">發票資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium">統一編號</label>
              <Input {...register('tin')} className="mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">發票抬頭</label>
              <Input {...register('invoice_title')} className="mt-1" />
            </div>
          </div>
        </div>

        {/* 銀行資訊區塊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">銀行資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium">銀行名稱</label>
              <Input {...register('bank_info.bankName')} className="mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">分行名稱</label>
              <Input {...register('bank_info.branchName')} className="mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">帳戶號碼</label>
              <Input {...register('bank_info.accountNumber')} className="mt-1" />
            </div>
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? '儲存中...' : (client ? '更新客戶' : '新增客戶')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}