import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

/**
 * 報價單簽約時自動同步 KOL 服務定價。
 * 只在狀態變為「已簽約」且之前不是「已簽約」時觸發。
 */
export async function handleKolPriceSync(
  quotationId: string,
  newStatus: string,
  oldStatus?: string | null
): Promise<void> {
  if (newStatus !== '已簽約') return
  if (oldStatus === '已簽約') return

  const { data, error } = await supabase.rpc(
    'sync_kol_service_prices_from_quotation',
    { p_quotation_id: quotationId }
  )

  if (error) {
    console.error('KOL price sync failed:', error)
    toast.error('KOL 服務價格同步失敗: ' + error.message)
  } else {
    const result = data as unknown as { updated: number; message: string }
    if (result.updated > 0) {
      toast.success(`已同步 ${result.updated} 項 KOL 服務價格`)
    }
  }
}

/**
 * 一次性初始同步：從所有歷史報價單計算平均價格更新 KOL 服務定價。
 */
export async function runInitialKolPriceSync(): Promise<{
  success: boolean
  updated: number
  message: string
}> {
  const { data, error } = await supabase.rpc('sync_kol_service_prices_initial')

  if (error) {
    console.error('Initial KOL price sync failed:', error)
    return { success: false, updated: 0, message: error.message }
  }

  const result = data as unknown as { updated: number; message: string }
  return { success: true, ...result }
}
