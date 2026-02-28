// src/components/quotes/form/QuoteFormTerms.tsx
// 報價單表單 — 合約條款與備註區塊

'use client'

import { Textarea } from '@/components/ui/textarea'
import { Book } from 'lucide-react'
import type { QuoteFormTermsProps } from './types'

export function QuoteFormTerms({ form }: QuoteFormTermsProps) {
  const { register } = form

  return (
    <div className="bg-card p-6 rounded-lg shadow">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
        <Book className="mr-2 h-5 w-5 text-primary" />合約條款與備註
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">合約條款</label>
          <Textarea {...register('terms')} rows={10} placeholder="合約條款內容" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">備註</label>
          <Textarea {...register('remarks')} rows={3} placeholder="其他備註事項" />
        </div>
      </div>
    </div>
  )
}
