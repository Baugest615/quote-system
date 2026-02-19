import { Suspense } from 'react'
import QuoteForm from '@/components/quotes/QuoteForm'
import { SkeletonCard } from '@/components/ui/Skeleton'

export default function NewQuotePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">建立新報價單</h1>
      <Suspense fallback={<SkeletonCard lines={5} />}>
        <QuoteForm />
      </Suspense>
    </div>
  )
}
