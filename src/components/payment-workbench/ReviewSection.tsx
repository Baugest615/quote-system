'use client'

import { useState, useMemo } from 'react'
import { Inbox, Send, Undo2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { useWorkbenchReview, useWorkbenchSubmission } from '@/hooks/payment-workbench'
import type { WorkbenchItem, MergeGroupInfo } from '@/hooks/payment-workbench/types'
import { MergeGroupCard } from './MergeGroupCard'

interface ReviewSectionProps {
  items: WorkbenchItem[]
  isReviewer: boolean
}

export function ReviewSection({ items, isReviewer }: ReviewSectionProps) {
  const { approveMergeGroup, approveSingleItem, rejectMergeGroup, rejectSingleItem, isApproving, isRejecting } = useWorkbenchReview()
  const { withdrawMergeGroup, withdrawSingleItem, isWithdrawing } = useWorkbenchSubmission()

  const [rejectTarget, setRejectTarget] = useState<{ type: 'group' | 'single'; id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

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
        status: 'requested' as const,
      }
    })

    return { mergeGroups: groups, singleItems: singles }
  }, [items])

  const handleRejectConfirm = async () => {
    if (!rejectTarget || !rejectReason.trim()) return

    if (rejectTarget.type === 'group') {
      await rejectMergeGroup(rejectTarget.id, rejectReason)
    } else {
      await rejectSingleItem(rejectTarget.id, rejectReason)
    }

    setRejectTarget(null)
    setRejectReason('')
  }

  const isLoading = isApproving || isRejecting || isWithdrawing

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="w-12 h-12 mb-3 text-muted-foreground/50" />
        <p className="text-sm">沒有等待審核的請款項目</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 合併組 */}
      {mergeGroups.map((mg) => (
        <MergeGroupCard
          key={mg.group_id}
          group={mg}
          showReviewActions={isReviewer}
          showWithdrawAction
          onApprove={approveMergeGroup}
          onReject={(id) => setRejectTarget({ type: 'group', id })}
          onWithdraw={withdrawMergeGroup}
          isLoading={isLoading}
        />
      ))}

      {/* 單筆項目 */}
      {singleItems.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg"
        >
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
            <Button size="sm" variant="outline" disabled={isLoading} onClick={() => withdrawSingleItem(item.id)}>
              <Undo2 className="w-3.5 h-3.5 mr-1" />
              撤回
            </Button>
            {isReviewer && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
                  disabled={isLoading}
                  onClick={() => approveSingleItem(item.id)}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  核准
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={isLoading}
                  onClick={() => setRejectTarget({ type: 'single', id: item.id })}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  駁回
                </Button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* 駁回原因 Modal */}
      <Modal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="駁回原因"
      >
        <p className="text-sm text-muted-foreground mb-4">
          請輸入駁回原因，申請者將看到此說明。
        </p>
        <Textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="請說明駁回原因..."
          rows={3}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRejectTarget(null)}>取消</Button>
          <Button
            variant="destructive"
            disabled={!rejectReason.trim() || isRejecting}
            onClick={handleRejectConfirm}
          >
            確認駁回
          </Button>
        </div>
      </Modal>
    </div>
  )
}
