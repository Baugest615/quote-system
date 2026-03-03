'use client'

import { useState, useMemo } from 'react'
import { Inbox, AlertTriangle, Send, User, Building2, AlertCircle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkbenchSubmission, useWorkbenchMerge } from '@/hooks/payment-workbench'
import type { WorkbenchItem, AccountCategory } from '@/hooks/payment-workbench/types'
import { itemsToCategorySections } from '@/hooks/payment-workbench/grouping'
import { MergeGroupCard } from './MergeGroupCard'
import { InlineItemEditor } from './InlineItemEditor'

const CATEGORY_ICONS: Record<AccountCategory, React.ReactNode> = {
  individual: <User className="w-4 h-4" />,
  company: <Building2 className="w-4 h-4" />,
  unknown: <AlertCircle className="w-4 h-4 text-warning" />,
}

interface RejectedSectionProps {
  items: WorkbenchItem[]
}

export function RejectedSection({ items }: RejectedSectionProps) {
  const { submitMergeGroup, submitSingleItem, isSubmitting } = useWorkbenchSubmission()
  const { dissolveMergeGroup, isMerging } = useWorkbenchMerge()
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  // v1.1: 按帳戶類型分組
  const categorySections = useMemo(() => itemsToCategorySections(items), [items])

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
              <h3 className="text-sm font-medium text-foreground px-1">{group.remittance_name}</h3>

              {/* 合併組 */}
              {group.merge_groups.map((mg) => {
                const reason = mg.leader_item.rejection_reason
                return (
                  <div key={mg.group_id} className="space-y-1.5">
                    <MergeGroupCard
                      group={mg}
                      showSubmitAction
                      showDissolveAction
                      editable
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

              {/* 單筆項目（可展開編輯） */}
              {group.items.filter((i) => !i.merge_group_id).map((item) => {
                const isOpen = expandedItemId === item.id
                return (
                  <div key={item.id} className="space-y-1.5">
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <button
                          type="button"
                          className="flex-1 min-w-0 text-left"
                          onClick={() => setExpandedItemId(isOpen ? null : item.id)}
                        >
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
                            {(item.attachments?.length || 0) > 0 && (
                              <span>附件: {item.attachments.length}</span>
                            )}
                          </div>
                        </button>
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          ${(item.cost_amount || 0).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" disabled={isLoading} onClick={() => submitSingleItem(item.id)}>
                            <Send className="w-3.5 h-3.5 mr-1" />
                            重新送出
                          </Button>
                        </div>
                        <ChevronDown className={cn(
                          'w-4 h-4 text-muted-foreground transition-transform duration-200 cursor-pointer',
                          isOpen && 'rotate-180'
                        )} onClick={() => setExpandedItemId(isOpen ? null : item.id)} />
                      </div>
                      {/* 展開的行內編輯區 */}
                      <div className={cn(
                        'overflow-hidden transition-all duration-200',
                        isOpen ? 'max-h-[600px]' : 'max-h-0'
                      )}>
                        {isOpen && <InlineItemEditor item={item} />}
                      </div>
                    </div>
                    {item.rejection_reason && (
                      <div className="flex items-start gap-2 px-4 py-2 bg-destructive/5 border border-destructive/20 rounded-md ml-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-destructive">{item.rejection_reason}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
