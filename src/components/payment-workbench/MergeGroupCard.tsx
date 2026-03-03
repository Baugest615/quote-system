'use client'

import { useState } from 'react'
import { ChevronDown, Crown, Link2, Send, Undo2, Check, X, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MergeGroupInfo } from '@/hooks/payment-workbench/types'
import { InlineItemEditor } from './InlineItemEditor'

interface MergeGroupCardProps {
  group: MergeGroupInfo
  /** 審核模式：顯示核准/駁回按鈕 */
  showReviewActions?: boolean
  /** 送出模式：顯示送出按鈕 */
  showSubmitAction?: boolean
  /** 撤回模式：顯示撤回按鈕 */
  showWithdrawAction?: boolean
  /** 拆分模式：顯示拆分按鈕 */
  showDissolveAction?: boolean
  /** 主項可編輯發票/附件 */
  editable?: boolean
  onApprove?: (groupId: string) => void
  onReject?: (groupId: string) => void
  onSubmit?: (groupId: string) => void
  onWithdraw?: (groupId: string) => void
  onDissolve?: (groupId: string) => void
  isLoading?: boolean
}

export function MergeGroupCard({
  group,
  showReviewActions,
  showSubmitAction,
  showWithdrawAction,
  showDissolveAction,
  editable,
  onApprove,
  onReject,
  onSubmit,
  onWithdraw,
  onDissolve,
  isLoading,
}: MergeGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const allItems = [group.leader_item, ...group.member_items]

  const statusConfig = {
    pending: { label: '草稿', className: 'bg-muted text-muted-foreground' },
    requested: { label: '待審核', className: 'bg-warning/20 text-warning' },
    rejected: { label: '被駁回', className: 'bg-destructive/20 text-destructive' },
  }
  const status = statusConfig[group.status]

  return (
    <div
      className="border border-border rounded-lg overflow-hidden"
      style={{ borderLeftColor: group.merge_color || undefined, borderLeftWidth: group.merge_color ? 3 : undefined }}
    >
      {/* 收合的卡片頭部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {group.leader_item.remittance_name || group.leader_item.kol_name || '未指定'}
            </span>
            <span className="text-xs text-muted-foreground">
              {group.item_count} 筆合併
            </span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', status.className)}>
              {status.label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {allItems.map((i) => i.project_name).filter((v, idx, arr) => arr.indexOf(v) === idx).join('、')}
          </div>
        </div>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          ${group.total_amount.toLocaleString()}
        </span>

        {/* 操作按鈕 */}
        <div className="flex items-center gap-1.5 ml-2" onClick={(e) => e.stopPropagation()}>
          {showSubmitAction && (
            <Button size="sm" variant="outline" disabled={isLoading} onClick={() => onSubmit?.(group.group_id)}>
              <Send className="w-3.5 h-3.5 mr-1" />
              送出
            </Button>
          )}
          {showWithdrawAction && (
            <Button size="sm" variant="outline" disabled={isLoading} onClick={() => onWithdraw?.(group.group_id)}>
              <Undo2 className="w-3.5 h-3.5 mr-1" />
              撤回
            </Button>
          )}
          {showReviewActions && (
            <>
              <Button size="sm" variant="outline" className="text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10" disabled={isLoading} onClick={() => onApprove?.(group.group_id)}>
                <Check className="w-3.5 h-3.5 mr-1" />
                核准
              </Button>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={isLoading} onClick={() => onReject?.(group.group_id)}>
                <X className="w-3.5 h-3.5 mr-1" />
                駁回
              </Button>
            </>
          )}
          {showDissolveAction && (
            <Button size="sm" variant="ghost" disabled={isLoading} onClick={() => onDissolve?.(group.group_id)}>
              <Unlink className="w-3.5 h-3.5 mr-1" />
              拆分
            </Button>
          )}
        </div>

        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform duration-200',
          isExpanded && 'rotate-180'
        )} />
      </button>

      {/* 展開的明細 */}
      <div className={cn(
        'overflow-hidden transition-all duration-200',
        isExpanded ? 'max-h-[800px]' : 'max-h-0'
      )}>
        <div className="border-t border-border bg-muted/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-2 font-normal">專案</th>
                <th className="text-left px-4 py-2 font-normal">服務</th>
                <th className="text-right px-4 py-2 font-normal">金額</th>
                <th className="text-left px-4 py-2 font-normal">月份</th>
                <th className="text-left px-4 py-2 font-normal">發票</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((item) => (
                <tr key={item.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      {item.is_merge_leader && (
                        <Crown className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                      )}
                      <span className="text-foreground">{item.project_name || '未命名'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{item.service}</td>
                  <td className="px-4 py-2 text-right text-foreground tabular-nums">
                    ${(item.cost_amount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {item.expected_payment_month || '-'}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {item.is_merge_leader
                      ? (item.invoice_number || (editable ? '點擊下方編輯' : '-'))
                      : <span className="italic text-muted-foreground/60">繼承主項</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 主項編輯區 */}
          {editable && isExpanded && (
            <div className="border-t border-border">
              <div className="px-4 py-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <Crown className="w-3.5 h-3.5 text-warning" />
                  <span className="text-xs font-medium text-foreground">主項發票與附件</span>
                  <span className="text-xs text-muted-foreground">（送出時成員自動繼承）</span>
                </div>
              </div>
              <InlineItemEditor item={group.leader_item} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
