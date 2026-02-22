// src/hooks/quotes/useQuoteFormData.ts
// 報價單表單 — 資料載入與狀態管理 hook

'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { UseFormReturn } from 'react-hook-form'
import supabase from '@/lib/supabase/client'
import type {
  QuoteFormData,
  QuoteFormProps,
  ClientWithContacts,
  KolWithServices,
  QuoteCategory,
  ContactInfo,
  ClientInfoState,
  UseQuoteFormDataReturn,
} from '@/components/quotes/form/types'

interface UseQuoteFormDataParams {
  initialData: QuoteFormProps['initialData']
  form: UseFormReturn<QuoteFormData>
  projectId: string | null
}

export function useQuoteFormData({
  initialData,
  form,
  projectId,
}: UseQuoteFormDataParams): UseQuoteFormDataReturn {
  const { setValue, watch } = form

  // --- 核心狀態 ---
  const [clients, setClients] = useState<ClientWithContacts[]>([])
  const [kols, setKols] = useState<KolWithServices[]>([])
  const [quoteCategories, setQuoteCategories] = useState<QuoteCategory[]>([])
  const [loading, setLoading] = useState(true)

  // --- 聯絡人相關狀態 ---
  const [clientContacts, setClientContacts] = useState<ContactInfo[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactInfo | null>(null)
  const [clientInfo, setClientInfo] = useState<ClientInfoState>({ tin: '', invoiceTitle: '', address: '', email: '' })

  // --- Watch values ---
  const watchClientId = watch('client_id')
  const watchIsNewClient = watch('is_new_client')

  // --- Autocomplete Options (memoized) ---
  const clientOptions = useMemo(() =>
    clients.map(c => ({
      label: c.name,
      value: c.id,
      description: c.tin ? `統編: ${c.tin}` : undefined,
    })),
    [clients]
  )

  const contactOptions = useMemo(() =>
    clientContacts.map(c => ({
      label: c.name,
      value: c.name,
      description: [c.position, c.email, c.phone].filter(Boolean).join(' / ') || undefined,
    })),
    [clientContacts]
  )

  const kolOptions = useMemo(() =>
    kols.map(k => ({
      label: k.name,
      value: k.id,
      description: [k.real_name, `${k.kol_services.length} 個服務`].filter(Boolean).join(' - '),
    })),
    [kols]
  )

  const categoryOptions = useMemo(() =>
    quoteCategories.map(c => ({
      label: c.name,
      value: c.id,
    })),
    [quoteCategories]
  )

  // --- 資料載入（clients + categories，KOL 延遲載入）---
  useEffect(() => {
    async function fetchData() {
      const [clientsRes, categoriesRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('quote_categories').select('*').order('name'),
      ])

      const processedClients = (clientsRes.data || []).map((client): ClientWithContacts => {
        let parsedContacts: ContactInfo[] = []
        try {
          if (client.contacts) {
            if (typeof client.contacts === 'string') {
              parsedContacts = JSON.parse(client.contacts)
            } else if (Array.isArray(client.contacts)) {
              parsedContacts = client.contacts as ContactInfo[]
            }
          }
        } catch (error) {
          console.error(`解析客戶 ${client.name} 的聯絡人資料失敗:`, error)
        }
        if (parsedContacts.length === 0 && client.contact_person) {
          parsedContacts.push({
            name: client.contact_person,
            email: client.email || undefined,
            phone: client.phone || undefined,
            is_primary: true,
          })
        }
        parsedContacts.sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return 0
        })
        return { ...client, parsedContacts }
      })

      setClients(processedClients)
      setQuoteCategories(categoriesRes.data || [])

      // 從專案進度管理頁面帶入的 projectId 預填資料
      if (projectId && !initialData) {
        const { data: project } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()
        if (project) {
          setValue('project_name', project.project_name || '')
          if (project.client_id) {
            setValue('client_id', project.client_id)
            setValue('is_new_client', false)
          } else if (project.client_name) {
            setValue('client_name', project.client_name)
            setValue('is_new_client', true)
          }
        }
      }

      setLoading(false)

      // 如果是編輯模式，載入已使用的 KOL 資料
      if (initialData?.quotation_items) {
        const kolIds = Array.from(new Set(initialData.quotation_items.map(i => i.kol_id).filter(Boolean)))
        if (kolIds.length > 0) {
          const { data } = await supabase
            .from('kols')
            .select('*, kol_services(*, service_types(*))')
            .in('id', kolIds)
          if (data) setKols(data as KolWithServices[])
        }
      }
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- KOL 延遲搜尋 (debounced) ---
  const kolSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchKols = useCallback((term: string) => {
    if (kolSearchTimer.current) clearTimeout(kolSearchTimer.current)
    if (!term.trim()) return

    kolSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('kols')
        .select('*, kol_services(*, service_types(*))')
        .ilike('name', `%${term.trim()}%`)
        .limit(20)
      if (data) {
        setKols(prev => {
          const existingIds = new Set(prev.map(k => k.id))
          const newKols = (data as KolWithServices[]).filter(k => !existingIds.has(k.id))
          return newKols.length > 0 ? [...prev, ...newKols] : prev
        })
      }
    }, 300)
  }, [])

  // --- 既有客戶選擇後帶入資料 ---
  useEffect(() => {
    // 新客戶模式時不干涉
    if (watchIsNewClient) return

    const selectedClient = clients.find(c => c.id === watchClientId)
    if (selectedClient) {
      setClientInfo({
        tin: selectedClient.tin || '',
        invoiceTitle: selectedClient.invoice_title || '',
        address: selectedClient.address || '',
        email: selectedClient.email || '',
      })

      const contacts = selectedClient.parsedContacts || []
      setClientContacts(contacts)

      if (contacts.length > 0) {
        let contactToSelect: ContactInfo | undefined
        if (initialData?.client_contact) {
          contactToSelect = contacts.find(c => c.name === initialData.client_contact)
        }
        if (!contactToSelect) {
          contactToSelect = contacts.find(c => c.is_primary) || contacts[0]
        }
        if (contactToSelect) {
          setSelectedContact(contactToSelect)
          setValue('client_contact', contactToSelect.name)
          setValue('contact_email', contactToSelect.email || null)
          setValue('contact_phone', contactToSelect.phone || null)
          setValue('is_new_contact', false)
          if (contactToSelect.email) {
            setClientInfo(prev => ({ ...prev, email: contactToSelect.email || '' }))
          }
        }
      } else {
        setClientContacts([])
        setSelectedContact(null)
        setValue('client_contact', '')
        setValue('contact_email', null)
        setValue('contact_phone', null)
      }
    } else if (!watchClientId) {
      setClientInfo({ tin: '', invoiceTitle: '', address: '', email: '' })
      setClientContacts([])
      setSelectedContact(null)
      // 不清空 client_contact 等欄位，因為可能正在輸入新客戶資料
    }
  }, [watchClientId, watchIsNewClient, clients, setValue, initialData])

  // --- Handler Functions ---
  const handleContactSelect = useCallback((contactName: string) => {
    const contact = clientContacts.find(c => c.name === contactName)
    if (contact) {
      setSelectedContact(contact)
      setValue('client_contact', contact.name)
      setValue('contact_email', contact.email || null)
      setValue('contact_phone', contact.phone || null)
      setValue('is_new_contact', false)
      const clientEmail = clients.find(c => c.id === watchClientId)?.email || ''
      setClientInfo(prev => ({ ...prev, email: contact.email || clientEmail }))
    }
  }, [clientContacts, clients, watchClientId, setValue])

  const handleKolChange = useCallback((itemIndex: number, kolId: string) => {
    setValue(`items.${itemIndex}.kol_id`, kolId || null)
    setValue(`items.${itemIndex}.kol_name`, null)
    setValue(`items.${itemIndex}.is_new_kol`, false)
    setValue(`items.${itemIndex}.service`, '')
    setValue(`items.${itemIndex}.is_new_service`, false)
    setValue(`items.${itemIndex}.price`, 0)
    setValue(`items.${itemIndex}.cost`, 0)
  }, [setValue])

  const getKolServices = useCallback((kolId: string | null | undefined) => {
    if (!kolId) return []
    const kol = kols.find(k => k.id === kolId)
    return kol?.kol_services || []
  }, [kols])

  return {
    clients,
    kols,
    quoteCategories,
    loading,
    clientContacts,
    selectedContact,
    clientInfo,
    setClientContacts,
    setSelectedContact,
    setClientInfo,
    kolOptions,
    clientOptions,
    contactOptions,
    categoryOptions,
    searchKols,
    handleContactSelect,
    handleKolChange,
    getKolServices,
  }
}
