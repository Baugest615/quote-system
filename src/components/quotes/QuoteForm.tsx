// src/components/quotes/QuoteForm.tsx
// 報價單表單 — 組合元件（拆分後的主入口）
'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { SkeletonCard } from '@/components/ui/Skeleton'

// 共用型別與常數
import {
  quoteSchema,
  staticTerms,
  transformInitialItems,
  type QuoteFormData,
  type QuoteFormProps,
} from './form/types'

// Hooks
import { useQuoteFormData } from '@/hooks/quotes/useQuoteFormData'
import { useQuoteFormSubmit } from '@/hooks/quotes/useQuoteFormSubmit'

// 子元件
import { QuoteFormBasicInfo } from './form/QuoteFormBasicInfo'
import { QuoteFormItemsTable } from './form/QuoteFormItemsTable'
import { QuoteFormSummary } from './form/QuoteFormSummary'
import { QuoteFormTerms } from './form/QuoteFormTerms'

// --- 主要表單元件 ---
export default function QuoteForm({ initialData }: QuoteFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')

  // --- useForm 定義 ---
  const form = useForm<QuoteFormData>({
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

  const { handleSubmit, formState: { isSubmitting } } = form

  // --- useFieldArray ---
  const fieldArray = useFieldArray({ control: form.control, name: 'items' })

  // --- 資料載入 hook ---
  const formData = useQuoteFormData({ initialData, form, projectId })

  // --- 金額計算 ---
  const watchItems = form.watch('items')
  const subTotalUntaxed = watchItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  const tax = Math.round(subTotalUntaxed * 0.05)
  const grandTotalTaxed = subTotalUntaxed + tax

  // --- 提交 hook ---
  const { onSubmit } = useQuoteFormSubmit({
    initialData,
    clients: formData.clients,
    subTotalUntaxed,
    tax,
    grandTotalTaxed,
    projectId,
  })

  // --- Loading ---
  if (formData.loading) return (
    <div className="space-y-6">
      <SkeletonCard lines={3} />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={4} />
    </div>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit, () => {
      setTimeout(() => {
        const firstError = document.querySelector('.text-destructive')
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    })} className="space-y-8">

      {/* 基本資訊 */}
      <QuoteFormBasicInfo form={form} formData={formData} initialData={initialData} />

      {/* 報價項目表格 */}
      <QuoteFormItemsTable form={form} fieldArray={fieldArray} formData={formData} />

      {/* 金額計算 */}
      <QuoteFormSummary form={form} subTotalUntaxed={subTotalUntaxed} tax={tax} grandTotalTaxed={grandTotalTaxed} />

      {/* 合約條款與備註 */}
      <QuoteFormTerms form={form} />

      {/* 按鈕 */}
      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '儲存中...' : (initialData ? '更新報價單' : '建立報價單')}
        </Button>
      </div>
    </form>
  )
}
