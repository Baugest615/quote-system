'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import AccountingModal from '@/components/accounting/AccountingModal'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import {
  EXPENSE_TYPES, ACCOUNTING_SUBJECTS,
  type ExpenseClaim,
} from '@/types/custom.types'

const MONTH_OPTIONS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

const schema = z.object({
  claim_month: z.string().optional(),
  expense_type: z.string().min(1, '請選擇支出種類'),
  accounting_subject: z.string().optional(),
  vendor_name: z.string().optional(),
  project_name: z.string().optional(),
  amount: z.coerce.number().min(0, '金額不能為負'),
  tax_amount: z.coerce.number(),
  total_amount: z.coerce.number(),
  invoice_number: z.string().optional(),
  invoice_date: z.string().nullable().optional(),
  note: z.string().optional(),
})

export type ExpenseClaimFormData = z.infer<typeof schema>

interface ExpenseClaimModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ExpenseClaimFormData, id?: string) => Promise<void>
  claim?: ExpenseClaim | null
  year: number
  projectNames: string[]
}

export default function ExpenseClaimModal({
  isOpen,
  onClose,
  onSave,
  claim,
  year,
  projectNames,
}: ExpenseClaimModalProps) {
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ExpenseClaimFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      claim_month: '',
      expense_type: '其他支出',
      accounting_subject: '',
      vendor_name: '',
      project_name: '',
      amount: 0,
      tax_amount: 0,
      total_amount: 0,
      invoice_number: '',
      invoice_date: null,
      note: '',
    },
  })

  // 載入 / 重置表單
  useEffect(() => {
    if (!isOpen) return
    if (claim) {
      reset({
        claim_month: claim.claim_month || '',
        expense_type: claim.expense_type || '其他支出',
        accounting_subject: claim.accounting_subject || '',
        vendor_name: claim.vendor_name || '',
        project_name: claim.project_name || '',
        amount: claim.amount || 0,
        tax_amount: claim.tax_amount || 0,
        total_amount: claim.total_amount || 0,
        invoice_number: claim.invoice_number || '',
        invoice_date: claim.invoice_date || null,
        note: claim.note || '',
      })
    } else {
      reset({
        claim_month: '',
        expense_type: '其他支出',
        accounting_subject: '',
        vendor_name: '',
        project_name: '',
        amount: 0,
        tax_amount: 0,
        total_amount: 0,
        invoice_number: '',
        invoice_date: null,
        note: '',
      })
    }
  }, [isOpen, claim, reset])

  // 自動計算稅額
  const watchedAmount = watch('amount')
  const watchedInvoiceNumber = watch('invoice_number')

  useEffect(() => {
    const hasInvoice = !!(watchedInvoiceNumber && watchedInvoiceNumber.trim())
    const amt = Number(watchedAmount) || 0
    const tax = hasInvoice ? Math.round(amt * 0.05 * 100) / 100 : 0
    const total = Math.round((amt + tax) * 100) / 100
    setValue('tax_amount', tax)
    setValue('total_amount', total)
  }, [watchedAmount, watchedInvoiceNumber, setValue])

  // 專案名稱選項
  const projectNameOptions = useMemo(
    () => projectNames.map(name => ({ label: name, value: name })),
    [projectNames]
  )

  // 月份選項
  const monthOptions = useMemo(
    () => MONTH_OPTIONS.map(m => `${year}年${m}`),
    [year]
  )

  const onSubmit = async (data: ExpenseClaimFormData) => {
    setSaving(true)
    try {
      await onSave(data, claim?.id)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring text-foreground'
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1'
  const readOnlyClass = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted/50 text-foreground cursor-not-allowed'

  return (
    <AccountingModal
      isOpen={isOpen}
      onClose={onClose}
      title={claim ? '編輯報帳項目' : '新增報帳項目'}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={saving}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? '儲存中...' : claim ? '更新' : '新增'}
          </button>
        </div>
      }
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        {/* 基本資訊 */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">基本資訊</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>報帳月份</label>
              <select {...register('claim_month')} className={inputClass}>
                <option value="">請選擇</option>
                {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>支出種類 *</label>
              <select {...register('expense_type')} className={inputClass}>
                {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {errors.expense_type && (
                <p className="text-xs text-destructive mt-1">{errors.expense_type.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>會計科目</label>
              <select {...register('accounting_subject')} className={inputClass}>
                <option value="">請選擇</option>
                {ACCOUNTING_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 廠商 / 專案 */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">廠商 / 專案</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>廠商/對象</label>
              <input type="text" {...register('vendor_name')} className={inputClass} placeholder="輸入廠商或對象名稱" />
            </div>
            <div>
              <label className={labelClass}>專案名稱</label>
              <Controller
                name="project_name"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || null}
                    onChange={(val) => field.onChange(val)}
                    options={projectNameOptions}
                    placeholder="搜尋專案名稱..."
                    clearable
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* 金額 / 發票 */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">金額與發票</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>金額（未稅）*</label>
              <input
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                className={inputClass}
                placeholder="0"
              />
              {errors.amount && (
                <p className="text-xs text-destructive mt-1">{errors.amount.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>發票號碼</label>
              <input type="text" {...register('invoice_number')} className={inputClass} placeholder="有發票時填寫（自動計算 5% 稅額）" />
            </div>
            <div>
              <label className={labelClass}>發票日期</label>
              <input type="date" {...register('invoice_date')} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>稅額</label>
                <input type="text" readOnly value={`NT$ ${new Intl.NumberFormat('zh-TW').format(watch('tax_amount') || 0)}`} className={readOnlyClass} />
              </div>
              <div>
                <label className={labelClass}>總額（含稅）</label>
                <input type="text" readOnly value={`NT$ ${new Intl.NumberFormat('zh-TW').format(watch('total_amount') || 0)}`} className={readOnlyClass} />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            * 填寫發票號碼後，稅額自動以未稅金額 × 5% 計算；無發票則稅額為 0
          </p>
        </div>

        {/* 備註 */}
        <div>
          <label className={labelClass}>備註</label>
          <textarea
            {...register('note')}
            rows={2}
            className={inputClass}
            placeholder="選填"
          />
        </div>
      </form>
    </AccountingModal>
  )
}
