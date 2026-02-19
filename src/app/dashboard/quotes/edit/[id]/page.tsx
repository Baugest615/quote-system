'use client'

import { useParams } from 'next/navigation'
import QuoteForm from '@/components/quotes/QuoteForm'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useQuotation } from '@/hooks/useQuotations'

export default function EditQuotePage() {
  const params = useParams()
  const id = params.id as string
  const { data: quote, isLoading: loading } = useQuotation(id)

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={6} />
      </div>
    )
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