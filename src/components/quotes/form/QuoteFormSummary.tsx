// src/components/quotes/form/QuoteFormSummary.tsx
// 報價單表單 — 金額計算區塊（小計、稅金、合計、優惠價格）

'use client'

import { Input } from '@/components/ui/input'
import { Calculator } from 'lucide-react'
import type { QuoteFormSummaryProps } from './types'

export function QuoteFormSummary({ form, subTotalUntaxed, tax, grandTotalTaxed }: QuoteFormSummaryProps) {
  const { register, watch } = form
  const watchHasDiscount = watch('has_discount')

  return (
    <div className="bg-card p-6 rounded-lg shadow">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
        <Calculator className="mr-2 h-5 w-5 text-primary" />金額計算
      </h2>
      <div className="space-y-3">
        <div className="flex justify-between text-sm"><span>小計（未稅）:</span><span>NT$ {subTotalUntaxed.toLocaleString()}</span></div>
        <div className="flex justify-between text-sm"><span>稅金 (5%):</span><span>NT$ {tax.toLocaleString()}</span></div>
        <div className="flex justify-between font-semibold text-lg border-t pt-2"><span>合計（含稅）:</span><span>NT$ {grandTotalTaxed.toLocaleString()}</span></div>
        <div className="mt-4">
          <label className="flex items-center space-x-2">
            <input type="checkbox" {...register('has_discount')} className="form-checkbox" />
            <span className="text-sm font-medium">是否有未稅優惠價格</span>
          </label>
          {watchHasDiscount && (
            <div className="mt-2">
              <Input type="number" {...register('discounted_price', { valueAsNumber: true })} placeholder="優惠後價格" className="w-48" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
