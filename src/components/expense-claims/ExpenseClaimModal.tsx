'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import AccountingModal from '@/components/accounting/AccountingModal'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { type ExpenseClaim } from '@/types/custom.types'
import { useExpenseDefaults } from '@/hooks/useExpenseDefaults'
import { useQuotationOptions } from '@/hooks/useQuotationOptions'
import { MONTH_OPTIONS } from '@/lib/constants'

const schema = z.object({
  claim_month: z.string().optional(),
  withholding_month: z.string().optional(),
  expense_type: z.string().min(1, '請選擇支出種類'),
  accounting_subject: z.string().optional(),
  vendor_name: z.string().optional(),
  project_name: z.string().optional(),
  quotation_id: z.string().nullable().optional(),
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
  projectNames?: string[]  // deprecated, kept for backward compat
}

export default function ExpenseClaimModal({
  isOpen,
  onClose,
  onSave,
  claim,
  year,
}: ExpenseClaimModalProps) {
  const { expenseTypeNames, accountingSubjectNames, defaultSubjectsMap } = useExpenseDefaults()
  const { options: quotationOptions } = useQuotationOptions()
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
      withholding_month: '',
      expense_type: '員工代墊',
      accounting_subject: '',
      vendor_name: '',
      project_name: '',
      quotation_id: null,
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
        withholding_month: claim.withholding_month || '',
        expense_type: claim.expense_type || '其他支出',
        accounting_subject: claim.accounting_subject || '',
        vendor_name: claim.vendor_name || '',
        project_name: claim.project_name || '',
        quotation_id: claim.quotation_id || null,
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
        withholding_month: '',
        expense_type: '員工代墊',
        accounting_subject: '',
        vendor_name: '',
        project_name: '',
        quotation_id: null,
        amount: 0,
        tax_amount: 0,
        total_amount: 0,
        invoice_number: '',
        invoice_date: null,
        note: '',
      })
    }
  }, [isOpen, claim, reset])

  // 支出種類 → 會計科目聯動
  const watchedExpenseType = watch('expense_type')
  const isWithholdingType = watchedExpenseType === '代扣代繳'

  useEffect(() => {
    if (!watchedExpenseType) return
    if (isWithholdingType) {
      // 代扣代繳：強制設定會計科目為「所得稅」（預設）
      const current = watch('accounting_subject')
      if (current !== '所得稅' && current !== '二代健保') {
        setValue('accounting_subject', '所得稅')
      }
      return
    }
    const currentSubject = watch('accounting_subject')
    if (!currentSubject || currentSubject === '所得稅' || currentSubject === '二代健保') {
      const suggested = defaultSubjectsMap[watchedExpenseType]
      if (suggested) setValue('accounting_subject', suggested)
    }
  }, [watchedExpenseType, isWithholdingType, setValue, watch])

  // 自動計算稅額
  const watchedAmount = watch('amount')
  const watchedInvoiceNumber = watch('invoice_number')

  useEffect(() => {
    const hasInvoice = !!(watchedInvoiceNumber && watchedInvoiceNumber.trim())
    const amt = Number(watchedAmount) || 0
    const tax = hasInvoice ? Math.round(amt * 0.05) : 0
    const total = Math.round(amt + tax)
    setValue('tax_amount', tax)
    setValue('total_amount', total)
  }, [watchedAmount, watchedInvoiceNumber, setValue])

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
          <div className={`grid grid-cols-1 ${isWithholdingType ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
            <div>
              <label className={labelClass}>報帳月份</label>
              <select {...register('claim_month')} className={inputClass}>
                <option value="">請選擇</option>
                {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {isWithholdingType && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  員工請款歸屬的月份
                </p>
              )}
            </div>
            {isWithholdingType && (
              <div>
                <label className={labelClass}>代扣所屬月份 *</label>
                <select {...register('withholding_month')} className={inputClass}>
                  <option value="">請選擇</option>
                  {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  代繳稅款對應的月份
                </p>
              </div>
            )}
            <div>
              <label className={labelClass}>支出種類 *</label>
              <select {...register('expense_type')} className={inputClass}>
                {expenseTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {errors.expense_type && (
                <p className="text-xs text-destructive mt-1">{errors.expense_type.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>
                {isWithholdingType ? '代扣類型 *' : '會計科目'}
              </label>
              {isWithholdingType ? (
                <select {...register('accounting_subject')} className={inputClass}>
                  <option value="所得稅">所得稅</option>
                  <option value="二代健保">二代健保</option>
                </select>
              ) : (
                <select {...register('accounting_subject')} className={inputClass}>
                  <option value="">請選擇</option>
                  {accountingSubjectNames.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
          </div>
          {isWithholdingType && (
            <div className="mt-3 p-3 bg-info/10 border border-info/30 rounded-lg text-xs text-info space-y-1.5">
              <p><strong>代扣代繳報帳流程：</strong></p>
              <ol className="list-decimal list-inside space-y-0.5 ml-1">
                <li><strong>報帳月份</strong>：決定這筆報帳歸入哪個月的付款批次（員工何時拿到錢）</li>
                <li><strong>代扣所屬月份</strong>：代繳的稅款對應哪個月的代扣（例：代繳 1 月的稅選 1 月）</li>
                <li>管理員核准後，系統自動建立對應月份的<strong>繳納沖銷記錄</strong></li>
              </ol>
              <p className="text-info/80">核准後不會建立進項記錄（費用已包含在原始 KOL 毛額中）</p>
            </div>
          )}
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
                name="quotation_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || null}
                    onChange={(val, data) => {
                      field.onChange(val || null)
                      setValue('project_name', data?.project_name ?? '')
                    }}
                    options={quotationOptions}
                    placeholder="搜尋編號或專案名稱..."
                    clearable
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* 金額 / 發票 */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {isWithholdingType ? '代繳金額' : '金額與發票'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                {isWithholdingType ? '代繳金額 *' : '金額（未稅）*'}
              </label>
              <input
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                className={inputClass}
                placeholder={isWithholdingType ? '填入實際代繳給政府的金額' : '0'}
              />
              {errors.amount && (
                <p className="text-xs text-destructive mt-1">{errors.amount.message}</p>
              )}
            </div>
            {!isWithholdingType && (
              <>
                <div>
                  <label className={labelClass}>發票號碼</label>
                  <input type="text" {...register('invoice_number')} className={inputClass} placeholder="有發票時填寫（自動計算 5% 稅額）" />
                </div>
                <div>
                  <label className={labelClass}>發票日期</label>
                  <input type="date" {...register('invoice_date')} className={inputClass} />
                </div>
              </>
            )}
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
          {!isWithholdingType && (
            <p className="text-[11px] text-muted-foreground mt-2">
              * 填寫發票號碼後，稅額自動以未稅金額 × 5% 計算；無發票則稅額為 0
            </p>
          )}
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
