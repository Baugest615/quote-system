'use client'

import { useParams, useRouter } from 'next/navigation'
import QuoteForm from '@/components/quotes/QuoteForm'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useQuotation } from '@/hooks/useQuotations'
import { usePermission } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { ShieldAlert } from 'lucide-react'

export default function EditQuotePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { userId, hasRole, loading: permLoading } = usePermission()
  const { data: quote, isLoading: loading } = useQuotation(id)

  if (loading || permLoading) {
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

  const canEdit = hasRole('Editor') || quote.created_by == null || quote.created_by === userId
  if (!canEdit) {
    return (
      <div className="text-center py-12">
        <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium text-foreground">權限不足</h3>
        <p className="mt-2 text-sm text-muted-foreground">您沒有編輯此報價單的權限，只能編輯自己建立的報價單。</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">返回</Button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">編輯報價單 ({id})</h1>
      <QuoteForm initialData={quote} />
    </div>
  )
}
