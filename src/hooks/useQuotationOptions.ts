'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import supabase from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { SelectOption } from '@/components/ui/SearchableSelect'

export interface QuotationOptionData {
  quotation_id: string
  quote_number: string | null
  project_name: string
}

/**
 * 從 quotations 表取得報價單選項（帶 quote_number），供表單 & 列表使用。
 *
 * 回傳：
 * - options:            value = quotation_id（給有 FK 的表單）
 * - projectNameOptions: value = project_name（給無 FK 的表單，如 expenses）
 * - suggestions:        string[]（給 SpreadsheetEditor autocomplete）
 * - suggestionOptions:  {label, value}[]（給 SpreadsheetEditor，label 合併格式、value 純名稱）
 * - quotationMap:       Map<project_name, quote_number>（給列表頁 lookup）
 * - rawData:            原始查詢結果
 */
export function useQuotationOptions() {
  const query = useQuery({
    queryKey: [...queryKeys.quotationOptions],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('id, quote_number, project_name')
        .order('quote_number', { ascending: false, nullsFirst: false })

      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  /** value = quotation_id — 給有 quotation_id FK 的表單 */
  const options: SelectOption<QuotationOptionData>[] = useMemo(() => {
    if (!query.data) return []
    return query.data.map((q) => ({
      label: q.quote_number
        ? `${q.quote_number} — ${q.project_name}`
        : q.project_name,
      value: q.id,
      description: q.project_name,
      data: {
        quotation_id: q.id,
        quote_number: q.quote_number,
        project_name: q.project_name,
      },
    }))
  }, [query.data])

  /** value = project_name — 給沒有 quotation_id FK 的表單（如 expenses） */
  const projectNameOptions: SelectOption<QuotationOptionData>[] = useMemo(() => {
    if (!query.data) return []
    return query.data.map((q) => ({
      label: q.quote_number
        ? `${q.quote_number} — ${q.project_name}`
        : q.project_name,
      value: q.project_name,
      description: q.quote_number || '',
      data: {
        quotation_id: q.id,
        quote_number: q.quote_number,
        project_name: q.project_name,
      },
    }))
  }, [query.data])

  /** SpreadsheetEditor autocomplete 用（label 合併格式，value 純名稱） */
  const suggestionOptions: { label: string; value: string }[] = useMemo(() => {
    if (!query.data) return []
    return query.data.map((q) => ({
      label: q.quote_number
        ? `${q.quote_number} — ${q.project_name}`
        : q.project_name,
      value: q.project_name,
    }))
  }, [query.data])

  /** project_name → quote_number 映射，給列表頁前端 lookup 用 */
  const quotationMap: Map<string, string> = useMemo(() => {
    const m = new Map<string, string>()
    for (const q of query.data || []) {
      if (q.project_name && q.quote_number) {
        m.set(q.project_name, q.quote_number)
      }
    }
    return m
  }, [query.data])

  return {
    ...query,
    options,
    projectNameOptions,
    suggestionOptions,
    quotationMap,
    rawData: query.data,
  }
}
