import supabase from '@/lib/supabase/client'
import { toast } from 'sonner'

type KolWithServices = {
  id: string
  name: string
  kol_services: { service_types: { name: string } | null }[]
}

/**
 * 若 KOL 名稱不在現有清單中，自動建立新 KOL 記錄。
 * 返回解析後的 kol_id（UUID）。
 */
export async function autoCreateKolIfNeeded(
  kolNameOrId: string,
  existingKols: KolWithServices[]
): Promise<string> {
  const trimmed = kolNameOrId.trim()

  // 已是現有 KOL 的 UUID → 直接返回
  if (existingKols.some(k => k.id === trimmed)) return trimmed

  // 查詢 DB 中是否已有同名 KOL
  const { data: existingByName } = await supabase
    .from('kols')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle()

  if (existingByName) return existingByName.id

  // 建立新 KOL
  const { data: newKol, error } = await supabase
    .from('kols')
    .insert({ name: trimmed })
    .select()
    .single()

  if (error) throw new Error(`無法建立 KOL/服務「${trimmed}」: ${error.message}`)

  toast.success(`已自動建立 KOL/服務「${trimmed}」`)
  return newKol.id
}

/**
 * 若 KOL 尚未關聯指定服務類型，自動建立 service_type 和 kol_service 關聯。
 */
export async function autoCreateServiceIfNeeded(
  kolId: string,
  serviceName: string,
  existingKols: KolWithServices[],
  price?: number,
  cost?: number
): Promise<void> {
  const trimmed = serviceName.trim()
  if (!trimmed) return

  // 檢查是否已有此服務關聯
  const kol = existingKols.find(k => k.id === kolId)
  if (kol?.kol_services.some(s => s.service_types?.name === trimmed)) return

  // 查詢或建立 service_type
  let serviceTypeId: string
  const { data: existingST } = await supabase
    .from('service_types')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle()

  if (existingST) {
    serviceTypeId = existingST.id
  } else {
    const { data: newST, error } = await supabase
      .from('service_types')
      .insert({ name: trimmed })
      .select()
      .single()
    if (error) {
      console.error(`建立服務類型失敗:`, error)
      return
    }
    serviceTypeId = newST.id
  }

  // 確認 kol_service 關聯不存在後建立
  const { data: existingLink } = await supabase
    .from('kol_services')
    .select('id')
    .eq('kol_id', kolId)
    .eq('service_type_id', serviceTypeId)
    .maybeSingle()

  if (!existingLink) {
    await supabase.from('kol_services').insert({
      kol_id: kolId,
      service_type_id: serviceTypeId,
      price: price || 0,
      cost: cost || 0,
    })
    toast.success(`已自動建立 KOL 服務「${trimmed}」`)
  }
}
