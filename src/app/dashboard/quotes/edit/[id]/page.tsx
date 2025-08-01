'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import QuoteForm from '@/components/quotes/QuoteForm'
import { Database } from '@/types/database.types'

type Quotation = Database['public']['Tables']['quotations']['Row']
type QuotationItem = Database['public']['Tables']['quotation_items']['Row']
type QuotationWithItems = Quotation & { quotation_items: QuotationItem[] }

export default function EditQuotePage() {
  const params = useParams()
  const id = params.id as string
  const [quote, setQuote] = useState<QuotationWithItems | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      const fetchQuote = async () => {
        const { data, error } = await supabase
          .from('quotations')
          .select('*, quotation_items(*)')
          .eq('id', id)
          .single()

        if (error) {
          console.error(error)
          setLoading(false)
        } else {
          setQuote(data as QuotationWithItems)
          setLoading(false)
        }
      }
      fetchQuote()
    }
  }, [id])

  if (loading) {
    return <div>讀取報價單資料中...</div>
  }

  if (!quote) {
    return <div>找不到報價單</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">編輯報價單 ({id})</h1>
      <QuoteForm initialData={quote} />
    </div>
  )
}