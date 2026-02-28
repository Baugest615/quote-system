import { cn } from '@/lib/utils'

// 基礎骨架元素
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} />
}

// 表格骨架
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn('w-full', className)}>
      {/* 表頭 */}
      <div className="flex gap-4 p-4 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {/* 表格行 */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={`row-${rowIdx}`} className="flex gap-4 p-4 border-b border-border/50">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton key={`cell-${rowIdx}-${colIdx}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// KPI 統計卡片骨架
export function SkeletonStatCards({
  count = 4,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn('grid gap-4', `grid-cols-2 md:grid-cols-${count}`, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={`stat-${i}`} className="bg-card rounded-lg p-4 border border-border">
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-7 w-28 mb-2" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

// 頁面標題骨架
export function SkeletonPageHeader({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  )
}

// 單張卡片骨架
export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('bg-card rounded-lg p-6 border border-border', className)}>
      <Skeleton className="h-5 w-32 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={`line-${i}`}
          className={cn('h-4 mb-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}
