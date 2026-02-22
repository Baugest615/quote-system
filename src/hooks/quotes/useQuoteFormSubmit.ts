// src/hooks/quotes/useQuoteFormSubmit.ts
// 報價單表單 — 提交邏輯 hook

'use client'

import { useCallback } from 'react'
import { SubmitHandler } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { handleQuotationAccountingSync } from '@/lib/accounting/sync-quote-accounting'
import { handleKolPriceSync } from '@/lib/kol/sync-kol-prices'
import { ensureClientForProject } from '@/hooks/useProjects'
import type {
  QuoteFormData,
  QuoteFormProps,
  ClientWithContacts,
  ContactInfo,
} from '@/components/quotes/form/types'

interface UseQuoteFormSubmitParams {
  initialData: QuoteFormProps['initialData']
  clients: ClientWithContacts[]
  subTotalUntaxed: number
  tax: number
  grandTotalTaxed: number
  projectId: string | null
}

export function useQuoteFormSubmit({
  initialData,
  clients,
  subTotalUntaxed,
  tax,
  grandTotalTaxed,
  projectId,
}: UseQuoteFormSubmitParams) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const onSubmit: SubmitHandler<QuoteFormData> = useCallback(async (data) => {
    try {
      // === Phase A: 自動建立新資料 ===
      let finalClientId = data.client_id

      // A1: 建立新客戶
      if (data.is_new_client && data.client_name?.trim()) {
        const newClientData: Record<string, unknown> = {
          name: data.client_name.trim(),
          tin: data.client_tin?.trim() || null,
          invoice_title: data.client_invoice_title?.trim() || null,
          address: data.client_address?.trim() || null,
        }

        // 聯絡人
        if (data.client_contact?.trim()) {
          const newContact: ContactInfo = {
            name: data.client_contact.trim(),
            email: data.contact_email?.trim() || undefined,
            phone: data.contact_phone?.trim() || undefined,
            is_primary: true,
          }
          newClientData.contacts = [newContact]
          // Legacy fields
          newClientData.contact_person = newContact.name
          newClientData.email = newContact.email || null
          newClientData.phone = newContact.phone || null
        }

        const { data: newClient, error } = await supabase
          .from('clients')
          .insert(newClientData)
          .select()
          .single()
        if (error) throw new Error(`建立客戶失敗: ${error.message}`)
        finalClientId = newClient.id
        toast.success(`已自動建立客戶「${data.client_name.trim()}」`)
      }
      // A2: 既有客戶新增聯絡人
      else if (finalClientId && data.is_new_contact && data.client_contact?.trim()) {
        const existingClient = clients.find(c => c.id === finalClientId)
        const existingContacts = existingClient?.parsedContacts || []
        const newContact: ContactInfo = {
          name: data.client_contact.trim(),
          email: data.contact_email?.trim() || undefined,
          phone: data.contact_phone?.trim() || undefined,
          is_primary: existingContacts.length === 0,
        }
        const updatedContacts = [...existingContacts, newContact]
        const { error } = await supabase
          .from('clients')
          .update({ contacts: updatedContacts as unknown as Database['public']['Tables']['clients']['Update']['contacts'] })
          .eq('id', finalClientId)
        if (error) throw new Error(`新增聯絡人失敗: ${error.message}`)
        toast.success(`已新增聯絡人「${newContact.name}」到客戶`)
      }

      // A3: 建立新 KOL
      const newKolMap = new Map<string, string>() // name -> new ID
      for (const item of data.items) {
        if (item.is_new_kol && item.kol_name?.trim() && !newKolMap.has(item.kol_name.trim())) {
          const { data: newKol, error } = await supabase
            .from('kols')
            .insert({ name: item.kol_name.trim() })
            .select()
            .single()
          if (error) throw new Error(`建立 KOL「${item.kol_name}」失敗: ${error.message}`)
          newKolMap.set(item.kol_name.trim(), newKol.id)
          toast.success(`已自動建立 KOL「${item.kol_name.trim()}」`)
        }
      }

      // A4: 建立新服務類型與 KOL 服務關聯
      for (const item of data.items) {
        if (item.is_new_service && item.service?.trim()) {
          const kolId = item.kol_id || (item.kol_name?.trim() ? newKolMap.get(item.kol_name.trim()) : null)
          if (kolId) {
            // 查詢或建立 service_type
            let serviceTypeId: string
            const { data: existingST } = await supabase
              .from('service_types')
              .select('id')
              .eq('name', item.service.trim())
              .maybeSingle()

            if (existingST) {
              serviceTypeId = existingST.id
            } else {
              const { data: newST, error } = await supabase
                .from('service_types')
                .insert({ name: item.service.trim() })
                .select()
                .single()
              if (error) throw new Error(`建立服務類型「${item.service}」失敗: ${error.message}`)
              serviceTypeId = newST.id
            }

            // 查詢是否已有 kol_service 關聯
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
                price: Number(item.price) || 0,
                cost: Number(item.cost) || 0,
              })
              toast.success(`已自動建立服務「${item.service.trim()}」`)
            }
          }
        }
      }

      // === Phase B: 解析最終資料 ===
      const resolvedItems = data.items.map(item => {
        let resolvedKolId = item.kol_id
        if (item.is_new_kol && item.kol_name?.trim()) {
          resolvedKolId = newKolMap.get(item.kol_name.trim()) || null
        }
        return { ...item, kol_id: resolvedKolId }
      })

      // === Phase C: 儲存報價單 ===
      const quoteDataToSave = {
        project_name: data.project_name,
        client_id: finalClientId || null,
        client_contact: data.client_contact || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        payment_method: data.payment_method,
        status: data.status || '草稿',
        subtotal_untaxed: subTotalUntaxed,
        tax: tax,
        grand_total_taxed: grandTotalTaxed,
        has_discount: data.has_discount,
        discounted_price: data.has_discount ? data.discounted_price : null,
        terms: data.terms || null,
        remarks: data.remarks || null,
        attachments: initialData?.attachments || null,
      }

      let quoteId = initialData?.id
      if (quoteId) {
        const { error } = await supabase.from('quotations').update(quoteDataToSave).eq('id', quoteId)
        if (error) throw error
      } else {
        const { data: newQuote, error } = await supabase.from('quotations').insert(quoteDataToSave).select().single()
        if (error || !newQuote) throw error || new Error("新增報價單失敗")
        quoteId = newQuote.id
      }

      await supabase.from('quotation_items').delete().eq('quotation_id', quoteId)
      const itemsToInsert = resolvedItems
        .filter(item => item.service || item.price)
        .map(item => ({
          quotation_id: quoteId,
          category: item.category || null,
          kol_id: item.kol_id || null,
          service: item.service || '',
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          cost: Number(item.cost) || 0,
          remark: item.remark || null,
        }))

      if (itemsToInsert.length > 0) {
        const { error } = await supabase.from('quotation_items').insert(itemsToInsert)
        if (error) throw error
      }

      toast.success('儲存成功！')

      // 狀態變更時自動同步
      if (quoteId) {
        const oldStatus = initialData?.status || null
        const newStatus = data.status || '草稿'
        if (oldStatus !== newStatus) {
          await handleQuotationAccountingSync(quoteId, newStatus, oldStatus)
          await handleKolPriceSync(quoteId, newStatus, oldStatus)
        }
      }

      // 如果是從專案進度建立的報價單，更新專案狀態並同步客戶
      if (projectId && quoteId && !initialData) {
        const { clientId, isNewClient, clientName } = await ensureClientForProject(projectId)
        await supabase
          .from('projects')
          .update({
            quotation_id: quoteId,
            status: '執行中',
            ...(clientId ? { client_id: clientId } : {}),
          })
          .eq('id', projectId)
        queryClient.invalidateQueries({ queryKey: [...queryKeys.projects] })
        if (isNewClient) {
          queryClient.invalidateQueries({ queryKey: [...queryKeys.clients] })
          toast.info(
            `已將「${clientName}」新增至客戶列表，建議前往客戶管理補齊詳細資訊`,
            { duration: 6000 }
          )
        }
      }

      // 跨頁快取失效：報價單變更影響列表頁和儀表板
      queryClient.invalidateQueries({ queryKey: [...queryKeys.quotations] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboardStats] })
      router.push('/dashboard/quotes')
    } catch (error: unknown) {
      console.error('Save failed:', error)
      toast.error('儲存失敗: ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [initialData, clients, subTotalUntaxed, tax, grandTotalTaxed, projectId, router, queryClient])

  return { onSubmit }
}
