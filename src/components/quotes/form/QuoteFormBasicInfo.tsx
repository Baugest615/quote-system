// src/components/quotes/form/QuoteFormBasicInfo.tsx
// 報價單表單 — 基本資訊區塊（專案名稱、客戶、聯絡人、狀態、付款方式）

'use client'

import { Controller } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { AutocompleteWithCreate } from '@/components/ui/AutocompleteWithCreate'
import { FileSignature } from 'lucide-react'
import { toast } from 'sonner'
import type { QuoteFormBasicInfoProps, QuotationStatus } from './types'

export function QuoteFormBasicInfo({ form, formData, initialData }: QuoteFormBasicInfoProps) {
  const { register, control, watch, setValue, formState: { errors } } = form
  const {
    clientOptions,
    contactOptions,
    clientContacts,
    selectedContact,
    clientInfo,
    setClientContacts,
    setSelectedContact,
    setClientInfo,
    handleContactSelect,
  } = formData

  const watchClientId = watch('client_id')
  const watchIsNewClient = watch('is_new_client')
  const watchIsNewContact = watch('is_new_contact')

  // --- 判斷客戶欄位是否可編輯 ---
  const isClientFieldsEditable = !!watchIsNewClient
  const isContactFieldsEditable = !!watchIsNewClient || !!watchIsNewContact

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAttachment = (attachments: any): boolean => attachments && Array.isArray(attachments) && attachments.length > 0
  const handleStatusChange = (newStatus: QuotationStatus) => {
    if (newStatus === '已簽約' && !hasAttachment(initialData?.attachments)) {
      toast.error('請上傳雙方用印的委刊報價單')
      return
    }
    setValue('status', newStatus)
  }

  return (
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
  )
}
