'use client'

import { useState } from 'react'
import supabase from '@/lib/supabase/client'
import { QuotationItemWithPayments } from '@/types/custom.types'
import { toast } from 'sonner'
import type { KolWithServices } from '../shared/useReferenceData'

interface UseSaveItemsOptions {
  quotationId: string
  isSupplementMode: boolean
  kols: KolWithServices[]
  onSuccess: () => Promise<void>
}

export function useSaveItems({ quotationId, isSupplementMode, kols, onSuccess }: UseSaveItemsOptions) {
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (items: QuotationItemWithPayments[], originalItems: QuotationItemWithPayments[]) => {
    setIsSaving(true)
    try {
      // 0a. 自動建立新 KOL 記錄
      const kolNameToId = new Map<string, string>()
      for (const item of items) {
        if (!item.kol_id?.trim()) continue
        const isExistingKol = kols.some(k => k.id === item.kol_id)
        if (isExistingKol) continue

        const kolName = item.kol_id.trim()
        if (kolNameToId.has(kolName)) continue

        const { data: existingByName } = await supabase
          .from('kols').select('id').eq('name', kolName).maybeSingle()

        if (existingByName) {
          kolNameToId.set(kolName, existingByName.id)
        } else {
          const { data: newKol, error: kolError } = await supabase
            .from('kols').insert({ name: kolName }).select().single()
          if (kolError) {
            toast.error(`無法建立 KOL/服務「${kolName}」: ${kolError.message}`)
            setIsSaving(false)
            return
          }
          kolNameToId.set(kolName, newKol.id)
          toast.success(`已自動建立 KOL/服務「${kolName}」`)
        }
      }

      const resolveKolId = (kolId: string | null) => {
        if (kolId && kolNameToId.has(kolId.trim())) return kolNameToId.get(kolId.trim())!
        return kolId
      }

      // 0b. 自動建立新服務類型與 KOL 服務關聯
      for (const item of items) {
        const itemKolId = resolveKolId(item.kol_id)
        if (!itemKolId || !item.service?.trim()) continue

        const kol = kols.find(k => k.id === itemKolId)
        if (kol) {
          const hasService = kol.kol_services.some(s => s.service_types?.name === item.service.trim())
          if (hasService) continue
        }

        let serviceTypeId: string
        const { data: existingST } = await supabase
          .from('service_types').select('id').eq('name', item.service.trim()).maybeSingle()

        if (existingST) {
          serviceTypeId = existingST.id
        } else {
          const { data: newST, error } = await supabase
            .from('service_types').insert({ name: item.service.trim() }).select().single()
          if (error) { console.error(`建立服務類型失敗:`, error); continue }
          serviceTypeId = newST.id
        }

        const { data: existingLink } = await supabase
          .from('kol_services').select('id')
          .eq('kol_id', itemKolId).eq('service_type_id', serviceTypeId).maybeSingle()

        if (!existingLink) {
          await supabase.from('kol_services').insert({
            kol_id: itemKolId,
            service_type_id: serviceTypeId,
            price: Number(item.price) || 0,
            cost: Number(item.cost) || 0,
          })
          toast.success(`已自動建立 KOL 服務「${item.service.trim()}」`)
        }
      }

      // 1. 準備要保存的項目資料
      const itemsToSave = items.map(item => {
        const {
          created_at: _ca, payment_requests: _pr,
          cost_amount: _costAmt, invoice_number: _inv, attachments: _att,
          expense_type: _et, accounting_subject: _as, expected_payment_month: _epm,
          requested_at: _reqAt, requested_by: _reqBy,
          approved_at: _appAt, approved_by: _appBy,
          rejection_reason: _rr, rejected_at: _rejAt, rejected_by: _rejBy,
          merge_group_id: _mgId, is_merge_leader: _iml, merge_color: _mc,
          ...rest
        } = item
        const cost = Number(item.cost) || 0
        const quantity = Number(item.quantity) || 1
        return {
          ...rest,
          kol_id: resolveKolId(rest.kol_id),
          quotation_id: quotationId,
          price: Number(item.price) || 0,
          cost,
          quantity,
          service: item.service || '',
          ...(!_costAmt ? { cost_amount: cost } : {}),
        }
      })

      // 2. 刪除 DB 中不該存在的項目
      const keepIds = items
        .filter(item => originalItems.some(o => o.id === item.id))
        .map(item => item.id)

      if (isSupplementMode) {
        if (keepIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('quotation_items').delete()
            .eq('quotation_id', quotationId).eq('is_supplement', true)
            .not('id', 'in', `(${keepIds.join(',')})`)
          if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
        }
      } else {
        if (keepIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('quotation_items').delete()
            .eq('quotation_id', quotationId)
            .not('id', 'in', `(${keepIds.join(',')})`)
          if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
        } else {
          const { error: deleteError } = await supabase
            .from('quotation_items').delete()
            .eq('quotation_id', quotationId)
          if (deleteError) throw new Error(`刪除項目失敗: ${deleteError.message}`)
        }
      }

      // 3. 寫入項目
      if (itemsToSave.length > 0) {
        const { error } = await supabase
          .from('quotation_items').upsert(itemsToSave, { onConflict: 'id' })
        if (error) throw error
      }

      // 4. 計算並更新報價單總金額
      const subtotalUntaxed = items.reduce((acc, item) => acc + (item.price * (item.quantity ?? 1)), 0)
      const tax = Math.round(subtotalUntaxed * 0.05)
      const grandTotalTaxed = subtotalUntaxed + tax

      const { error: updateError } = await supabase
        .from('quotations')
        .update({ subtotal_untaxed: subtotalUntaxed, tax, grand_total_taxed: grandTotalTaxed })
        .eq('id', quotationId)
      if (updateError) throw updateError

      // 追加模式：同步更新銷項管理金額
      if (isSupplementMode) {
        const { error: salesError } = await supabase
          .from('accounting_sales')
          .update({ sales_amount: subtotalUntaxed, tax_amount: tax, total_amount: grandTotalTaxed })
          .eq('quotation_id', quotationId)
        if (salesError) {
          console.error('銷項同步失敗:', salesError)
          toast.warning('項目已儲存，但銷項帳務同步失敗')
        } else {
          toast.success('儲存成功，銷項帳務已同步更新')
        }
      } else {
        toast.success('儲存成功')
      }

      await onSuccess()
    } catch (error: unknown) {
      console.error('Save error:', error)
      toast.error('儲存失敗: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setIsSaving(false)
    }
  }

  return { handleSave, isSaving }
}
