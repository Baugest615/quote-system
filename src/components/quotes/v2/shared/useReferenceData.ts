'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import supabase from '@/lib/supabase/client'
import { Database } from '@/types/database.types'

type Kol = Database['public']['Tables']['kols']['Row']
type KolService = Database['public']['Tables']['kol_services']['Row']
type ServiceType = Database['public']['Tables']['service_types']['Row']
type QuoteCategory = Database['public']['Tables']['quote_categories']['Row']

export type KolWithServices = Kol & { kol_services: (KolService & { service_types: ServiceType | null })[] }

export function useReferenceData() {
  const [kols, setKols] = useState<KolWithServices[]>([])
  const [categories, setCategories] = useState<QuoteCategory[]>([])

  useEffect(() => {
    const fetch = async () => {
      const [kolsRes, catsRes] = await Promise.all([
        supabase.from('kols').select('*, kol_services(*, service_types(*))').order('name'),
        supabase.from('quote_categories').select('*').order('name'),
      ])
      if (kolsRes.data) setKols(kolsRes.data as KolWithServices[])
      if (catsRes.data) setCategories(catsRes.data)
    }
    fetch()
  }, [])

  const categoryOptions = useMemo(() =>
    categories.map(c => ({ label: c.name, value: c.name })),
    [categories]
  )

  const kolOptions = useMemo(() =>
    kols.map(k => ({ label: k.name, value: k.id, subLabel: k.real_name || undefined })),
    [kols]
  )

  const getServiceOptionsForKol = useCallback((kolId: string | null) => {
    if (!kolId) return []
    const kol = kols.find(k => k.id === kolId)
    if (!kol) return []
    return kol.kol_services
      .filter(ks => ks.service_types)
      .map(ks => ({
        label: ks.service_types!.name,
        value: ks.service_types!.name,
      }))
  }, [kols])

  return {
    kols,
    setKols,
    categories,
    categoryOptions,
    kolOptions,
    getServiceOptionsForKol,
  }
}
