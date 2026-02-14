import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

/**
 * Sync accounting_sales record when a quotation status changes.
 * - "已簽約" → create accounting_sales record via RPC
 * - Away from "已簽約" → delete the linked record via RPC
 */
export async function handleQuotationAccountingSync(
  quotationId: string,
  newStatus: string,
  oldStatus?: string | null
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  if (newStatus === '已簽約') {
    const { error } = await supabase.rpc(
      'create_accounting_sale_from_quotation',
      { p_quotation_id: quotationId, p_user_id: user.id }
    )

    if (error) {
      console.error('Auto-create accounting sale failed:', error)
      toast.error('銷項帳務記錄建立失敗: ' + error.message)
    } else {
      toast.success('已自動建立銷項帳務記錄')
    }
  } else if (oldStatus === '已簽約' && newStatus !== '已簽約') {
    const { error } = await supabase.rpc(
      'remove_accounting_sale_for_quotation',
      { p_quotation_id: quotationId }
    )

    if (error) {
      console.error('Remove accounting sale failed:', error)
      toast.error('銷項帳務記錄移除失敗: ' + error.message)
    } else {
      toast.info('已移除對應的銷項帳務記錄')
    }
  }
}
