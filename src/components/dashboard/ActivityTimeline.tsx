'use client'

import { cn } from '@/lib/utils'
import type { ActivityTimelineItem } from '@/hooks/dashboard/useDashboardDataV2'

interface ActivityTimelineProps {
  items: ActivityTimelineItem[]
}

/** 相對時間格式化 */
function getRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return '剛剛'
  if (diffMin < 60) return `${diffMin} 分鐘前`
  if (diffHour < 24) return `${diffHour} 小時前`
  if (diffDay < 30) return `${diffDay} 天前`
  return `${Math.floor(diffDay / 30)} 個月前`
}

/** 動態類型 → 色點 / 標籤 */
function getTypeStyle(type: ActivityTimelineItem['type']) {
  switch (type) {
    case 'project_created':
      return { dotClass: 'bg-emerald-400', label: '新建專案' }
    case 'project_status_change':
      return { dotClass: 'bg-amber-400', label: '專案更新' }
    case 'quote_signed':
      return { dotClass: 'bg-sky-400', label: '簽約' }
    case 'quote_created':
      return { dotClass: 'bg-slate-400', label: '新報價單' }
  }
}

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
        <h3 className="text-base font-bold text-foreground mb-4">近期案件動態</h3>
        <p className="text-sm text-muted-foreground text-center py-8">尚無近期動態</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
      <h3 className="text-base font-bold text-foreground mb-4">近期案件動態</h3>
      <div className="space-y-0">
        {items.map((item, index) => {
          const { dotClass, label } = getTypeStyle(item.type)
          const isLast = index === items.length - 1

          return (
            <div key={item.id} className="flex gap-3">
              {/* 時間軸線 + 圓點 */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0", dotClass)} />
                {!isLast && (
                  <div className="w-px flex-1 bg-border my-1" />
                )}
              </div>

              {/* 內容 */}
              <div className={cn("pb-4 min-w-0", isLast && "pb-0")}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {item.title}
                  </span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0",
                    item.type === 'quote_signed'
                      ? 'bg-sky-500/15 text-sky-400'
                      : item.type === 'project_created'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : item.type === 'project_status_change'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-slate-500/15 text-slate-400'
                  )}>
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{item.subtitle}</span>
                  <span className="flex-shrink-0">·</span>
                  <span className="flex-shrink-0">{getRelativeTime(item.timestamp)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
