'use client'

import { useState, useMemo } from 'react'
import { Inbox, Undo2, Check, X, User, Building2, AlertCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { useWorkbenchReview, useWorkbenchSubmission } from '@/hooks/payment-workbench'
import type { WorkbenchItem, AccountCategory } from '@/hooks/payment-workbench/types'
import { itemsToCategorySections, calcItemTaxInfo } from '@/hooks/payment-workbench/grouping'
import { MergeGroupCard } from './MergeGroupCard'
import { AttachmentChips } from './AttachmentChips'

const CATEGORY_ICONS: Record<AccountCategory, React.ReactNode> = {
  individual: <User className="w-4 h-4" />,
  company: <Building2 className="w-4 h-4" />,
  unknown: <AlertCircle className="w-4 h-4 text-warning" />,
}

interface ReviewSectionProps {
  items: WorkbenchItem[]
  isReviewer: boolean
}

export function ReviewSection({ items, isReviewer }: ReviewSectionProps) {
  const { approveMergeGroup, approveSingleItem, rejectMergeGroup, rejectSingleItem, isApproving, isRejecting } = useWorkbenchReview()
  const { withdrawMergeGroup, withdrawSingleItem, isWithdrawing } = useWorkbenchSubmission()

  const [rejectTarget, setRejectTarget] = useState<{ type: 'group' | 'single'; id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // v1.1: 按帳戶類型分組
  const categorySections = useMemo(() => itemsToCategorySections(items), [items])

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
      {/* v1.1: 按帳戶類型分區 */}
      {categorySections.map((section) => (
        <div key={section.category} className="space-y-3">
          <div className="flex items-center gap-2 px-1 pt-2">
            {CATEGORY_ICONS[section.category]}
            <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
            <span className="text-xs text-muted-foreground">
              {section.item_count} 筆 · ${section.total_amount.toLocaleString()}
            </span>
          </div>
          {section.category === 'unknown' && (
            <div className="flex items-start gap-2 px-3 py-2 bg-warning/5 border border-warning/20 rounded-md text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              請先至 KOL 管理填寫銀行資訊，才能正確匯款
            </div>
          )}

          {section.groups.map((group) => (
            <div key={group.remittance_name} className="space-y-2 ml-1">
              <div className="flex items-center gap-3 px-1">
                <h3 className="text-sm font-medium text-foreground">{group.remittance_name}</h3>
              </div>

              {/* 合併組 */}
              {group.merge_groups.map((mg) => (
                <MergeGroupCard
                  key={mg.group_id}
                  group={mg}
                  showReviewActions={isReviewer}
                  showWithdrawAction
                  onApprove={(id) => approveMergeGroup(id)}
                  onReject={(id) => setRejectTarget({ type: 'group', id })}
                  onWithdraw={withdrawMergeGroup}
                  isLoading={isLoading}
                />
              ))}

              {/* 單筆項目 */}
              {group.items.filter((i) => !i.merge_group_id).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate">
                        {item.project_name}
                      </span>
                      {item.kol_name && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-sm text-info truncate">{item.kol_name}</span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">—</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {item.service}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{item.expected_payment_month || '未指定月份'}</span>
                      {item.invoice_number && <span>發票: {item.invoice_number}</span>}
                      <AttachmentChips attachments={item.attachments} />
                    </div>
                  </div>
                  {(() => {
                    const taxInfo = calcItemTaxInfo(item)
                    return (
                      <span className="text-sm font-semibold text-foreground tabular-nums text-right">
                        ${taxInfo.total.toLocaleString()}
                        {taxInfo.tax > 0 && (
                          <span className="block text-[10px] text-muted-foreground font-normal">
                            成本 ${taxInfo.cost.toLocaleString()} + 稅 ${taxInfo.tax.toLocaleString()}
                          </span>
                        )}
                      </span>
                    )
                  })()}
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
            </div>
          ))}
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
