'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Database } from '@/types/database.types'
import { useEffect } from 'react'

type Client = Database['public']['Tables']['clients']['Row']

// 1. 更新 Zod schema，使其更清晰
const clientSchema = z.object({
  name: z.string().min(1, '公司名稱為必填'),
  tin: z.string().optional().nullable(),
  invoice_title: z.string().optional().nullable(),
  contact_person: z.string().min(1, '窗口姓名為必填'),
  phone: z.string().optional().nullable(),
  address: z.string().min(1, '公司地址為必填'),
  bank_info: z.object({
    bankName: z.string().optional().nullable(),
    branchName: z.string().optional().nullable(),
    accountNumber: z.string().optional().nullable(),
  }).optional().nullable(),
})

type ClientFormData = z.infer<typeof clientSchema>

interface ClientModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (clientData: ClientFormData, id?: string) => void
  client: Client | null
}

export function ClientModal({ isOpen, onClose, onSave, client }: ClientModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    // 設定預設值，確保所有欄位都是受控元件
    defaultValues: {
        name: '',
        tin: '',
        invoice_title: '',
        contact_person: '',
        phone: '',
        address: '',
        bank_info: {
            bankName: '',
            branchName: '',
            accountNumber: '',
        },
    }
  })

  useEffect(() => {
    if (isOpen) {
        if (client) {
            // 【修正】編輯模式：在 reset 前，先將 null 清理為 ''
            const clientForForm = {
                name: client.name || '',
                tin: client.tin || '',
                invoice_title: client.invoice_title || '',
                contact_person: client.contact_person || '',
                phone: client.phone || '',
                address: client.address || '',
                // 巢狀的 bank_info 也需要同樣處理
                bank_info: {
                    bankName: (client.bank_info as any)?.bankName || '',
                    branchName: (client.bank_info as any)?.branchName || '',
                    accountNumber: (client.bank_info as any)?.accountNumber || '',
                }
            };
            reset(clientForForm);
        } else {
            // 新增模式：重設為預設的空值
            reset({
                name: '',
                tin: '',
                invoice_title: '',
                contact_person: '',
                phone: '',
                address: '',
                bank_info: {
                    bankName: '',
                    branchName: '',
                    accountNumber: '',
                },
            })
        }
    }
  }, [client, reset, isOpen])

  const onSubmit = (data: ClientFormData) => {
    // 在儲存前，將空字串轉回 null 以符合資料庫規範
    const sanitizedData: ClientFormData = {
        ...data,
        tin: data.tin || null,
        invoice_title: data.invoice_title || null,
        phone: data.phone || null,
        bank_info: (data.bank_info && (data.bank_info.bankName || data.bank_info.branchName || data.bank_info.accountNumber)) 
            ? {
                bankName: data.bank_info?.bankName || null,
                branchName: data.bank_info?.branchName || null,
                accountNumber: data.bank_info?.accountNumber || null,
              }
            : null, // 如果銀行資訊全為空，就存 null
    };
    onSave(sanitizedData, client?.id)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={client ? '編輯客戶資料' : '新增客戶'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-h-[80vh] overflow-y-auto p-1">
        
        {/* 公司與聯絡人資訊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">公司與聯絡人資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium">公司名稱 (必填)</label>
              <Input {...register('name')} className="mt-1" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
             <div>
              <label className="block text-sm font-medium">窗口姓名 (必填)</label>
              <Input {...register('contact_person')} className="mt-1" />
              {errors.contact_person && <p className="text-red-500 text-xs mt-1">{errors.contact_person.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium">公司電話</label>
              <Input {...register('phone')} className="mt-1" />
            </div>
             <div>
              <label className="block text-sm font-medium">公司地址 (必填)</label>
              <Input {...register('address')} className="mt-1" />
              {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
            </div>
          </div>
        </div>

        {/* 發票資訊 */}
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

        {/* 銀行匯款資訊 */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-700 border-b pb-2">銀行匯款資訊</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium">銀行名稱</label>
              <Input {...register('bank_info.bankName')} placeholder="例如: 國泰世華銀行" className="mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">分行名稱</label>
              <Input {...register('bank_info.branchName')} placeholder="例如: 文山分行" className="mt-1" />
            </div>
          </div>
          <div className="pt-2">
            <label className="block text-sm font-medium">帳戶帳號</label>
            <Input {...register('bank_info.accountNumber')} className="mt-1" />
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex justify-end space-x-2 pt-6 border-t mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '儲存中...' : '儲存'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
