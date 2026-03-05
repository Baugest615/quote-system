'use client'

import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { yyyymmToChinese } from '@/lib/payments/aggregation'

const DEBOUNCE_MS = 600

export function useInlineItemEdit() {
  const queryClient = useQueryClient()
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  /** Debounced 更新發票號碼 */
  const updateInvoiceNumber = useCallback(
    (itemId: string, value: string) => {
      // 清除該 item 的前一個 timer
      if (timerRef.current[itemId]) {
        clearTimeout(timerRef.current[itemId])
      }

      timerRef.current[itemId] = setTimeout(async () => {
        const { error } = await supabase
          .from('quotation_items')
          .update({ invoice_number: value || null })
          .eq('id', itemId)

        if (error) {
          toast.error('發票號碼儲存失敗')
          console.error('updateInvoiceNumber error:', error)
        } else {
          queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
        }
        delete timerRef.current[itemId]
      }, DEBOUNCE_MS)
    },
    [queryClient]
  )

  /** 附件更新後刷新快取（AttachmentUploader 已處理 DB 寫入） */
  const onAttachmentsChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
  }, [queryClient])

  /** Debounced 更新預計請款月份 */
  const updatePaymentMonth = useCallback(
    (itemId: string, month: string) => {
      const key = `month_${itemId}`
      if (timerRef.current[key]) {
        clearTimeout(timerRef.current[key])
      }

      timerRef.current[key] = setTimeout(async () => {
        const chineseMonth = month ? yyyymmToChinese(month) : null
        const { error } = await supabase
          .from('quotation_items')
          .update({ expected_payment_month: chineseMonth || null })
          .eq('id', itemId)

        if (error) {
          toast.error('請款月份儲存失敗')
          console.error('updatePaymentMonth error:', error)
        } else {
          queryClient.invalidateQueries({ queryKey: queryKeys.workbenchItems })
        }
        delete timerRef.current[key]
      }, DEBOUNCE_MS)
    },
    [queryClient]
  )

  return { updateInvoiceNumber, updatePaymentMonth, onAttachmentsChange }
}
