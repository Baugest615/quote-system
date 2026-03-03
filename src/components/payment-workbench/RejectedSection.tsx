'use client'

import { useMemo } from 'react'
import { Inbox, AlertTriangle, Send, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkbenchSubmission, useWorkbenchMerge } from '@/hooks/payment-workbench'
import type { WorkbenchItem, MergeGroupInfo } from '@/hooks/payment-workbench/types'
import { MergeGroupCard } from './MergeGroupCard'

interface RejectedSectionProps {
  items: WorkbenchItem[]
}

export function RejectedSection({ items }: RejectedSectionProps) {
  const { submitMergeGroup, submitSingleItem, isSubmitting } = useWorkbenchSubmission()
  const { dissolveMergeGroup, isMerging } = useWorkbenchMerge()

  // 分離合併組和單筆項目
  const { mergeGroups, singleItems } = useMemo(() => {
    const mergeMap = new Map<string, WorkbenchItem[]>()
    const singles: WorkbenchItem[] = []

    for (const item of items) {
      if (item.merge_group_id) {
        if (!mergeMap.has(item.merge_group_id)) mergeMap.set(item.merge_group_id, [])
        mergeMap.get(item.merge_group_id)!.push(item)
      } else {
        singles.push(item)
      }
    }

    const groups: MergeGroupInfo[] = Array.from(mergeMap.entries()).map(([groupId, mgItems]) => {
      const leader = mgItems.find((i) => i.is_merge_leader) || mgItems[0]
      return {
        group_id: groupId,
        leader_item: leader,
        member_items: mgItems.filter((i) => !i.is_merge_leader),
        merge_color: leader.merge_color,
        total_amount: mgItems.reduce((s, i) => s + (i.cost_amount || 0), 0),
        item_count: mgItems.length,
        status: 'rejected' as const,
      }
    })

    return { mergeGroups: groups, singleItems: singles }
  }, [items])

  const isLoading = isSubmitting || isMerging

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="w-12 h-12 mb-3 text-muted-foreground/50" />
        <p className="text-sm">沒有被駁回的請款項目</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 合併組 */}
      {mergeGroups.map((mg) => {
        const reason = mg.leader_item.rejection_reason
        return (
          <div key={mg.group_id} className="space-y-1.5">
            <MergeGroupCard
              group={mg}
              showSubmitAction
              showDissolveAction
              onSubmit={submitMergeGroup}
              onDissolve={dissolveMergeGroup}
              isLoading={isLoading}
            />
            {reason && (
              <div className="flex items-start gap-2 px-4 py-2 bg-destructive/5 border border-destructive/20 rounded-md ml-3">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-destructive">{reason}</p>
              </div>
            )}
          </div>
        )
      })}

      {/* 單筆項目 */}
      {singleItems.map((item) => (
        <div key={item.id} className="space-y-1.5">
          <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {item.remittance_name || item.kol_name || '未指定'}
                </span>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-sm text-muted-foreground truncate">
                  {item.project_name} · {item.service}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                <span>{item.expected_payment_month || '未指定月份'}</span>
                {item.invoice_number && <span>發票: {item.invoice_number}</span>}
              </div>
            </div>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              ${(item.cost_amount || 0).toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" disabled={isLoading} onClick={() => submitSingleItem(item.id)}>
                <Send className="w-3.5 h-3.5 mr-1" />
                重新送出
              </Button>
            </div>
          </div>
          {item.rejection_reason && (
            <div className="flex items-start gap-2 px-4 py-2 bg-destructive/5 border border-destructive/20 rounded-md ml-3">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive">{item.rejection_reason}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
