'use client'

import { useState } from 'react'
import { FileText, Calendar } from 'lucide-react'
import { AttachmentUploader } from '@/components/quotes/v2/AttachmentUploader'
import { useInlineItemEdit } from '@/hooks/payment-workbench'
import type { WorkbenchItem } from '@/hooks/payment-workbench/types'
import { expenseMonthToYYYYMM } from '@/lib/payments/aggregation'

interface InlineItemEditorProps {
  item: WorkbenchItem
  readOnly?: boolean
}

export function InlineItemEditor({ item, readOnly = false }: InlineItemEditorProps) {
  const { updateInvoiceNumber, updatePaymentMonth, onAttachmentsChange } = useInlineItemEdit()
  const [invoice, setInvoice] = useState(item.invoice_number || '')
  const [month, setMonth] = useState(() => {
    if (!item.expected_payment_month) return ''
    return expenseMonthToYYYYMM(item.expected_payment_month) || item.expected_payment_month
  })

  const handleInvoiceChange = (value: string) => {
    setInvoice(value)
    if (!readOnly) {
      updateInvoiceNumber(item.id, value)
    }
  }

  const handleMonthChange = (value: string) => {
    setMonth(value)
    if (!readOnly) {
      updatePaymentMonth(item.id, value)
    }
  }

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border space-y-3">
      {/* 預計請款月份 */}
      <div className="flex items-center gap-3">
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <label className="text-xs text-muted-foreground whitespace-nowrap">請款月份</label>
        <input
          type="month"
          value={month}
          onChange={(e) => handleMonthChange(e.target.value)}
          disabled={readOnly}
          className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* 發票號碼 */}
      <div className="flex items-center gap-3">
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <label className="text-xs text-muted-foreground whitespace-nowrap">發票號碼</label>
        <input
          type="text"
          value={invoice}
          onChange={(e) => handleInvoiceChange(e.target.value)}
          placeholder="例：AB-12345678"
          disabled={readOnly}
          className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* 附件上傳 */}
      <AttachmentUploader
        itemId={item.id}
        currentAttachments={item.attachments || []}
        onUpdate={() => onAttachmentsChange()}
        readOnly={readOnly}
      />
    </div>
  )
}
